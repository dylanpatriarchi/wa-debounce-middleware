import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import axios from 'axios';
import { sanitizePhoneNumber } from './utils/sanitizer';

const app = new Hono();

// Environment variables
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const DEBOUNCE_WINDOW_MS = parseInt(process.env.DEBOUNCE_WINDOW_MS || '2000', 10);

// In-memory storage for debouncing
// structure: { wa_id: { timer: NodeJS.Timeout, text: string[], name: string, timestamp: number } }
interface PendingMessage {
    timer: NodeJS.Timeout;
    text: string[];
    name: string;
    timestamp: number;
}

const messageBuffer = new Map<string, PendingMessage>();

app.get('/webhook', (c) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verified successfully!');
        return c.text(challenge || '');
    }

    return c.text('Forbidden', 403);
});

app.post('/webhook', async (c) => {
    try {
        const body = await c.req.json();
        console.log('Incoming webhook:', JSON.stringify(body, null, 2));

        // Handle incoming messages
        if (body.object === 'whatsapp_business_account' && body.entry) {
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.value && change.value.messages) {
                        for (const message of change.value.messages) {
                            const from = message.from; // wa_id
                            const name = change.value.contacts?.[0]?.profile?.name || 'Unknown';
                            const timestamp = parseInt(message.timestamp, 10);

                            if (message.type === 'text') {
                                const textBody = message.text.body;

                                // Debounce Logic
                                if (messageBuffer.has(from)) {
                                    // Existing buffer, clear timer and append text
                                    const pending = messageBuffer.get(from)!;
                                    clearTimeout(pending.timer);
                                    pending.text.push(textBody);

                                    // Restart timer
                                    pending.timer = setupTimer(from);

                                } else {
                                    // New buffer
                                    messageBuffer.set(from, {
                                        timer: setupTimer(from),
                                        text: [textBody],
                                        name,
                                        timestamp
                                    });
                                }

                            } else {
                                // Non-text message (image, audio, etc.) - Forward immediately
                                // We forward the raw message or a simplified structure? 
                                // The prompt says "forward it immediately without debouncing". 
                                // Let's forward a similar simplified structure but with the type.

                                await sendToN8N({
                                    from: sanitizePhoneNumber(from),
                                    name,
                                    message_type: message.type,
                                    payload: message, // Forward full payload for non-text
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
        console.error('Error processing webhook:', error);
        return c.text('Internal Server Error', 500);
    }
});

function setupTimer(wa_id: string) {
    return setTimeout(async () => {
        const pending = messageBuffer.get(wa_id);
        if (!pending) return;

        messageBuffer.delete(wa_id);

        const consolidatedText = pending.text.join(' ');
        const sanitizedPhone = sanitizePhoneNumber(wa_id);

        await sendToN8N({
            from: sanitizedPhone,
            name: pending.name,
            text: consolidatedText,
            timestamp: pending.timestamp
        });

    }, DEBOUNCE_WINDOW_MS);
}

async function sendToN8N(data: any) {
    if (!N8N_WEBHOOK_URL) {
        console.error('N8N_WEBHOOK_URL is not defined!');
        return;
    }

    try {
        await axios.post(N8N_WEBHOOK_URL, data);
        console.log('Forwarded to n8n:', data);
    } catch (error) {
        console.error('Failed to send to n8n:', error);
    }
}

export default handle(app);
