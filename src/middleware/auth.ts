import { Context, Next } from 'hono';

const APP_SECRET = process.env.WHATSAPP_APP_SECRET;

export const verifyWebhook = async (c: Context, next: Next) => {
    if (!APP_SECRET) {
        console.error('WHATSAPP_APP_SECRET is not set');
        return c.text('Server misconfigured', 500);
    }

    const signature = c.req.header('x-hub-signature-256');
    if (!signature) {
        return c.text('Missing signature', 401);
    }

    const body = await c.req.raw.clone().arrayBuffer();

    // Import basic crypto logic
    // In Node environment (Vercel Functions), we can use 'crypto' built-in or Web Crypto API
    // Using Web Crypto API for compatibility
    const encoder = new TextEncoder();
    const keyData = encoder.encode(APP_SECRET);
    const algorithm = { name: 'HMAC', hash: 'SHA-256' };

    try {
        const key = await crypto.subtle.importKey(
            'raw',
            keyData,
            algorithm,
            false,
            ['verify']
        );

        const match = await crypto.subtle.verify(
            algorithm,
            key,
            hexToBytes(signature.replace('sha256=', '')),
            body
        );

        if (!match) {
            console.warn('Invalid webhook signature');
            return c.text('Invalid signature', 403);
        }
    } catch (error) {
        console.error('Error verifying signature:', error);
        return c.text('Verification failed', 500);
    }

    await next();
};

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}
