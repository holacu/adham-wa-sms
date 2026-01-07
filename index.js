const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './sessions'
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let qrCodeData = null;
let isReady = false;

// QR Code Event
client.on('qr', (qr) => {
    qrCodeData = qr;
    isReady = false;
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
});

// Ready Event
client.on('ready', () => {
    isReady = true;
    qrCodeData = null;
    console.log('WhatsApp Client is READY!');
});

// Authentication Failure
client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
});

// Disconnected
client.on('disconnected', (reason) => {
    isReady = false;
    console.log('Client was logged out', reason);
});

client.initialize();

/**
 * API Endpoints
 */

// Status Check
app.get('/status', (req, res) => {
    res.json({
        connected: isReady,
        qr_required: !!qrCodeData,
        message: isReady ? 'Sytem Live' : (qrCodeData ? 'Login Required' : 'Initializing...')
    });
});

// Send Message Endpoint (Manual/General)
app.post('/send', async (req, res) => {
    const { phone, message } = req.body;
    handleSend(phone, message, res);
});

// Supabase Webhook Endpoint (Automated)
app.post('/supabase-webhook', async (req, res) => {
    try {
        const payload = req.body;
        // payload format from Supabase: { record: { ... }, type: 'INSERT', table: 'transactions', ... }

        if (payload.table === 'transactions' && payload.type === 'INSERT') {
            const trans = payload.record;

            // Fetch subscriber phone (Note: ideally the phone should be in the transaction or we fetch it)
            // For now, if your transaction has a phone field or we use a convention:
            const phone = trans.subscriber_phone; // You would need to ensure this is sent or logged
            const message = trans.details || `تم تسجيل عملية جديدة بقيمة ${trans.amount}`;

            if (phone) {
                return handleSend(phone, message, res);
            }
        }

        res.json({ success: true, info: 'Webhook received but no action taken' });
    } catch (error) {
        console.error('Webhook processing failed:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

async function handleSend(phone, message, res) {
    if (!isReady) {
        return res.status(503).json({ error: 'System not connected to WhatsApp' });
    }

    if (!phone || !message) {
        return res.status(400).json({ error: 'Missing phone or message' });
    }

    try {
        let formattedPhone = phone.replace(/\D/g, '');
        if (!formattedPhone.endsWith('@c.us')) {
            formattedPhone += '@c.us';
        }

        await client.sendMessage(formattedPhone, message);
        console.log(`Message sent to ${phone}`);
        if (res) res.json({ success: true, message: 'Notification sent' });
    } catch (error) {
        console.error('Failed to send message:', error);
        if (res) res.status(500).json({ error: 'Failed to send WhatsApp message' });
    }
}

app.listen(port, () => {
    console.log(`WA Bridge Server running on port ${port}`);
});
