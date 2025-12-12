import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import axios from 'axios';
import { sanitizePhoneNumber } from './utils/sanitizer';
import { verifyWebhook } from './middleware/auth';
import { logger } from './utils/logger';
import { redis } from './lib/redis';

const app = new Hono();

// Environment variables
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const DEBOUNCE_WINDOW_MS = parseInt(process.env.DEBOUNCE_WINDOW_MS || '2000', 10);
const ALLOWED_NUMBERS = process.env.ALLOWED_NUMBERS ? process.env.ALLOWED_NUMBERS.split(',') : null;
const BLOCKED_NUMBERS = process.env.BLOCKED_NUMBERS ? process.env.BLOCKED_NUMBERS.split(',') : null;

app.use('/webhook', verifyWebhook);

app.get('/webhook', (c) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        logger.info('Webhook verified successfully');
        return c.text(challenge || '');
    }

    logger.warn('Webhook verification failed', { mode, token });
    return c.text('Forbidden', 403);
});

app.post('/webhook', async (c) => {
    try {
        const body = await c.req.json();
        logger.info('Incoming webhook', { body });

        if (body.object === 'whatsapp_business_account' && body.entry) {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.value && change.value.messages) {
                        for (const message of change.value.messages) {
                            const from = message.from;
                            const name = change.value.contacts?.[0]?.profile?.name || 'Unknown';
                            const timestamp = parseInt(message.timestamp, 10);

                            // Blacklist/Whitelist Check
                            if (BLOCKED_NUMBERS && BLOCKED_NUMBERS.includes(from)) {
                                logger.warn('Blocked number attempted to message', { from });
                                continue;
                            }
                            if (ALLOWED_NUMBERS && !ALLOWED_NUMBERS.includes(from)) {
                                logger.warn('Number not in whitelist', { from });
                                continue;
                            }

                            if (message.type === 'text') {
                                const textBody = message.text.body;

                                // --- Redis Debounce Logic ---
                                const redisKey = `wa_buffer:${from}`;

                                // 1. Append text to Redis list
                                await redis.rpush(redisKey, textBody);
                                await redis.expire(redisKey, 30); // Safety expiry

                                // 2. Check for active lock
                                const lockKey = `wa_lock:${from}`;
                                const isLocked = await redis.set(lockKey, 'locked', { nx: true, ex: DEBOUNCE_WINDOW_MS / 1000 + 1 }); // Lock for slightly more than window

                                if (isLocked) {
                                    // WE ARE THE LEADER. We wait and then send.
                                    logger.info('Acquired lock, starting debounce window', { from });

                                    // Simple "Hold" strategy: wait for the window.
                                    // Verification that we are still the leader is implicit as we set the lock.
                                    // We simply wait for the window to close.
                                    await new Promise(resolve => setTimeout(resolve, DEBOUNCE_WINDOW_MS));

                                    // Retrieve all messages
                                    const messages = await redis.lrange(redisKey, 0, -1);
                                    if (messages.length > 0) {
                                        const consolidatedText = messages.join(' ');

                                        await sendToN8N({
                                            from: sanitizePhoneNumber(from),
                                            name,
                                            text: consolidatedText,
                                            timestamp
                                        });

                                        // Cleanup
                                        await redis.del(redisKey);
                                        await redis.del(lockKey); // Release lock explicitly (though TTL would handle it)
                                    }
                                } else {
                                    // FOLLOWER. We just appended the text (step 1).
                                    // We do nothing else. The LEADER will pick up our message.
                                    logger.info('Debouncing: Appended message to existing buffer', { from });
                                }

                            } else {
                                // Non-text message - Forward immediately
                                await sendToN8N({
                                    from: sanitizePhoneNumber(from),
                                    name,
                                    message_type: message.type,
                                    payload: message,
                                    timestamp
                                });
                            }
                        }
                    }
                }
            }
        }

        return c.text('OK');
    } catch (error) {
        logger.error('Error processing webhook', error);
        return c.text('Internal Server Error', 500);
    }
});

async function sendToN8N(data: any) {
    if (!N8N_WEBHOOK_URL) {
        logger.error('N8N_WEBHOOK_URL is not defined!');
        return;
    }

    try {
        await axios.post(N8N_WEBHOOK_URL, data);
        logger.info('Forwarded to n8n', { data });
    } catch (error) {
        logger.error('Failed to send to n8n', error);
    }
}

export default handle(app);
