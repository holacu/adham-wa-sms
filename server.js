const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const pino = require('pino');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Logger
const logger = pino({ level: 'silent' }); // Silent to reduce memory

// State
let sock = null;
let qrCodeData = null;
let isReady = false;
let connectionInfo = null;

// ============================================
// Initialize WhatsApp Connection
// ============================================
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: true,
        auth: state,
        defaultQueryTimeoutMs: undefined,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrCodeData = qr;
            console.log('[QR] New QR code generated');
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[DISCONNECT] Connection closed. Reconnecting:', shouldReconnect);

            if (shouldReconnect) {
                setTimeout(() => connectToWhatsApp(), 3000);
            } else {
                isReady = false;
                qrCodeData = null;
            }
        } else if (connection === 'open') {
            isReady = true;
            qrCodeData = null;
            connectionInfo = sock.user;
            console.log('[READY] ✅ WhatsApp connected!');
            console.log('[INFO] Connected as:', connectionInfo.name || connectionInfo.id);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Start connection
connectToWhatsApp().catch(err => console.error('[ERROR] Failed to connect:', err));

// ============================================
// API Endpoints
// ============================================

// Health Check
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Root Dashboard
app.get('/', async (req, res) => {
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
        img { margin: 20px 0; border-radius: 15px; background: white; padding: 20px; }
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
                        <p>الحساب: ${connectionInfo?.name || connectionInfo?.id || 'Unknown'}</p>
                        <p>السيرفر جاهز لإرسال الرسائل</p>
                        <button class="btn" onclick="location.reload()">تحديث</button>
                    </div>
                </body>
            </html>
        `);
    }

    if (qrCodeData) {
        try {
            const qrImage = await QRCode.toDataURL(qrCodeData);
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
                            <img src="${qrImage}" width="256" height="256" />
                            <p style="font-size: 14px;">افتح واتساب → الأجهزة المرتبطة → ربط جهاز</p>
                            <button class="btn" onclick="location.reload()">تحديث</button>
                        </div>
                        <script>
                            setInterval(async () => {
                                const resp = await fetch('/status');
                                const data = await resp.json();
                                if (data.connected) location.reload();
                            }, 3000);
                        </script>
                    </body>
                </html>
            `);
        } catch (err) {
            console.error('[ERROR] QR generation failed:', err);
        }
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
                    <button class="btn" onclick="location.reload()">تحديث</button>
                </div>
                <script>setTimeout(() => location.reload(), 5000);</script>
            </body>
        </html>
    `);
});

// Status
app.get('/status', (req, res) => {
    res.json({
        connected: isReady,
        has_qr: !!qrCodeData,
        account: connectionInfo?.name || connectionInfo?.id || null,
        timestamp: new Date().toISOString()
    });
});

// Send Message
app.post('/send', async (req, res) => {
    if (!isReady || !sock) {
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
        let formattedPhone = phone.replace(/\D/g, '');

        // Handle Iraq format
        if (formattedPhone.startsWith('07')) {
            formattedPhone = '964' + formattedPhone.substring(1);
        }

        // Add WhatsApp suffix
        if (!formattedPhone.endsWith('@s.whatsapp.net')) {
            formattedPhone += '@s.whatsapp.net';
        }

        await sock.sendMessage(formattedPhone, { text: message });

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

// Reset
app.get('/reset', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const authPath = path.join(__dirname, 'auth_info');

        console.log('[RESET] Clearing session...');

        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }

        res.send(`
            <html>
                <head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
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
});

// Error Handlers
process.on('unhandledRejection', (reason) => {
    console.error('[ERROR] Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('[ERROR] Uncaught exception:', error);
});
