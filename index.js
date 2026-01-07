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

// ============================================
// WhatsApp Client Configuration
// ============================================
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './sessions'
    }),
    authTimeoutMs: 300000,  // 5 minutes total timeout
    qrTimeoutMs: 300000,    // 5 minutes per QR code
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--no-first-run',
            '--no-zygote'
        ],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
});

// ============================================
// State Management
// ============================================
let qrCodeData = null;
let isReady = false;
let clientInfo = null;

// ============================================
// WhatsApp Event Handlers
// ============================================

client.on('qr', (qr) => {
    qrCodeData = qr;
    console.log('[QR] New QR code generated');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('[AUTH] ✓ Authentication successful');
    qrCodeData = null;
});

client.on('ready', () => {
    isReady = true;
    qrCodeData = null;
    clientInfo = client.info;
    console.log('[READY] ✓ WhatsApp client is ready!');
    console.log('[INFO] Connected as:', clientInfo.pushname);
});

client.on('auth_failure', (msg) => {
    console.error('[AUTH] ✗ Authentication failed:', msg);
    isReady = false;
});

client.on('disconnected', (reason) => {
    console.log('[DISCONNECT] Connection lost:', reason);
    isReady = false;
    qrCodeData = null;
    clientInfo = null;
});

// ============================================
// Initialize Client
// ============================================
console.log('[INIT] Starting WhatsApp client...');
client.initialize()
    .then(() => console.log('[INIT] ✓ Client initialization started'))
    .catch(err => console.error('[INIT] ✗ Initialization error:', err));

// ============================================
// API Endpoints
// ============================================

// Root - Mobile Dashboard
app.get('/', (req, res) => {
    const styles = `
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        h1 { margin: 0 0 20px 0; font-size: 24px; }
        .badge {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
            margin: 10px 0;
        }
        .success { background: #10b981; }
        .warning { background: #f59e0b; }
        .info { background: #3b82f6; }
        #qrcode {
            background: white;
            padding: 20px;
            border-radius: 15px;
            margin: 20px 0;
            display: inline-block;
        }
        .btn {
            background: white;
            color: #667eea;
            border: none;
            padding: 12px 24px;
            border-radius: 10px;
            font-weight: bold;
            cursor: pointer;
            margin-top: 15px;
        }
    `;

    if (isReady) {
        return res.send(`
            <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>WhatsApp Bridge - Connected</title>
                    <style>${styles}</style>
                </head>
                <body>
                    <div class="container">
                        <h1>🎉 متصل بنجاح</h1>
                        <div class="badge success">✓ WhatsApp Connected</div>
                        <p>الحساب: ${clientInfo?.pushname || 'Unknown'}</p>
                        <p>السيرفر جاهز لإرسال الرسائل التلقائية</p>
                        <button class="btn" onclick="location.reload()">تحديث</button>
                    </div>
                </body>
            </html>
        `);
    }

    if (qrCodeData) {
        return res.send(`
            <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>WhatsApp Bridge - Scan QR</title>
                    <style>${styles}</style>
                </head>
                <body>
                    <div class="container">
                        <h1>📱 امسح الباركود</h1>
                        <div class="badge warning">⏳ في انتظار الربط</div>
                        <div id="qrcode"></div>
                        <p style="font-size: 14px;">افتح واتساب → الأجهزة المرتبطة → ربط جهاز</p>
                        <button class="btn" onclick="location.reload()">تحديث</button>
                    </div>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                    <script>
                        new QRCode(document.getElementById("qrcode"), {
                            text: "${qrCodeData}",
                            width: 256,
                            height: 256
                        });
                        setInterval(async () => {
                            const resp = await fetch('/status');
                            const data = await resp.json();
                            if (data.connected) location.reload();
                        }, 3000);
                    </script>
                </body>
            </html>
        `);
    }

    return res.send(`
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>WhatsApp Bridge - Initializing</title>
                <style>${styles}</style>
            </head>
            <body>
                <div class="container">
                    <h1>⚙️ جاري التهيئة</h1>
                    <div class="badge info">🔄 Initializing...</div>
                    <p>السيرفر يقوم بالتحضير</p>
                    <p style="font-size: 14px;">يرجى الانتظار...</p>
                    <button class="btn" onclick="location.reload()">تحديث</button>
                </div>
                <script>setTimeout(() => location.reload(), 5000);</script>
            </body>
        </html>
    `);
});

// Health Check (for Render)
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Status Check
app.get('/status', (req, res) => {
    res.json({
        connected: isReady,
        has_qr: !!qrCodeData,
        account: clientInfo?.pushname || null,
        timestamp: new Date().toISOString()
    });
});

// QR Image (for Flutter app)
app.get('/qr-image', (req, res) => {
    if (isReady) {
        return res.status(200).send('Connected');
    }
    if (!qrCodeData) {
        return res.status(404).send('QR not available');
    }

    const code = qr.image(qrCodeData, { type: 'png', size: 20 });
    res.type('png');
    code.pipe(res);
});

// Send Message
app.post('/send', async (req, res) => {
    if (!isReady) {
        return res.status(503).json({
            success: false,
            error: 'WhatsApp not connected'
        });
    }

    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({
            success: false,
            error: 'Missing phone or message'
        });
    }

    try {
        // Format phone number
        let formattedPhone = phone.replace(/\D/g, '');

        // Handle Iraq format (07xxx -> 9647xxx)
        if (formattedPhone.startsWith('07')) {
            formattedPhone = '964' + formattedPhone.substring(1);
        }

        // Add WhatsApp suffix
        if (!formattedPhone.endsWith('@c.us')) {
            formattedPhone += '@c.us';
        }

        await client.sendMessage(formattedPhone, message);

        console.log('[SEND] ✓ Message sent to', phone);

        res.json({
            success: true,
            message: 'Message sent successfully'
        });
    } catch (error) {
        console.error('[SEND] ✗ Failed:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to send message'
        });
    }
});

// Reset Session
app.get('/reset', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const sessionPath = path.join(__dirname, 'sessions');

        console.log('[RESET] Clearing session...');

        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }

        res.send(`
            <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>Session Reset</title>
                </head>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                    <h1>✓ Session Cleared</h1>
                    <p>Server will restart in 3 seconds...</p>
                    <script>setTimeout(() => location.href = '/', 3000);</script>
                </body>
            </html>
        `);

        setTimeout(() => process.exit(0), 1000);
    } catch (error) {
        res.status(500).send('Reset failed: ' + error.message);
    }
});

// ============================================
// Start Server
// ============================================
app.listen(port, () => {
    console.log(`[SERVER] ✓ Running on port ${port}`);
    console.log(`[SERVER] Dashboard: http://localhost:${port}`);
});

// ============================================
// Error Handlers
// ============================================
process.on('unhandledRejection', (reason) => {
    console.error('[ERROR] Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('[ERROR] Uncaught exception:', error);
});
