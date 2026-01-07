const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode-terminal');
const qr = require('qr-image');
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
    authTimeoutMs: 120000, // 2 minutes to handle slow free-tier handshake
    qrMaxRetries: 15,      // More retries before timing out
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote',
            '--disable-gpu'
        ],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
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

// Catch unhandled rejections for the client
client.initialize().catch(err => {
    console.error('CLIENT INITIALIZE ERROR:', err);
});

// Emergency Reset Endpoint
app.get('/reset', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const sessionPath = path.join(__dirname, 'sessions');

        console.log('RESETTING SESSION...');

        if (fs.existsSync(sessionPath)) {
            // Native recursive delete for Node.js 14.14+
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }

        res.send('<h1>Session Cleared!</h1><p>The server will restart. Please refresh in 10 seconds.</p><script>setTimeout(()=>location.href="/qr", 5000)</script>');

        // Let the server exit so it restarts fresh (Render will restart it)
        setTimeout(() => process.exit(0), 1000);
    } catch (error) {
        res.status(500).send('Reset failed: ' + error.message);
    }
});

/**
 * API Endpoints
 */

// Status Check
app.get('/status', (req, res) => {
    res.json({
        connected: isReady,
        qr_required: !!qrCodeData,
        message: isReady ? 'System Live' : (qrCodeData ? 'Login Required' : 'Initializing...')
    });
});

// QR Logic - Serve HTML Page for Browser
app.get('/qr', (req, res) => {
    if (isReady) {
        return res.send('<h1>WhatsApp is already CONNECTED!</h1><script>setTimeout(()=>window.close(), 2000)</script>');
    }
    if (!qrCodeData) {
        return res.send('<h1>Initializing... Please refresh in 5 seconds.</h1><script>setTimeout(()=>location.reload(), 5000)</script>');
    }

    // Simple HTML to show QR
    res.send(`
        <html>
            <body style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#111; color:white; font-family:sans-serif">
                <h1>Link Adham Internet WA</h1>
                <div id="qrcode" style="background:white; padding:20px; border-radius:10px"></div>
                <p>Scan this QR code with your WhatsApp Link Device</p>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                <script>
                    new QRCode(document.getElementById("qrcode"), "${qrCodeData}");
                    // Auto refresh when ready
                    setInterval(async () => {
                        const resp = await fetch('/status');
                        const data = await resp.json();
                        if (data.connected) location.reload();
                    }, 3000);
                </script>
            </body>
        </html>
    `);
});

// QR Image Endpoint (Returns PNG)
app.get('/qr-image', (req, res) => {
    if (isReady) {
        return res.status(200).send('Connected');
    }
    if (!qrCodeData) {
        return res.status(404).send('QR not available yet');
    }

    if (req.query.download) {
        res.setHeader('Content-Disposition', 'attachment; filename=whatsapp-qr.png');
    }

    const code = qr.image(qrCodeData, { type: 'png', size: 20 });
    res.type('png');
    code.pipe(res);
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

        // Handle Iraq local format (07... to 9647...)
        if (formattedPhone.startsWith('07')) {
            formattedPhone = '964' + formattedPhone.substring(1);
        }

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

// Global unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
