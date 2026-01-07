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
    authTimeoutMs: 300000, // 5 minutes - much longer for slow servers
    qrMaxRetries: 3,       // Fewer retries but longer timeout per QR
    qrTimeoutMs: 60000,    // 60 seconds per QR code
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions'
        ],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
    }
});

let qrCodeData = null;
let isReady = false;
let qrCount = 0;

// QR Code Event
client.on('qr', (qr) => {
    qrCount++;
    qrCodeData = qr;
    isReady = false;
    console.log(`[${new Date().toISOString()}] QR CODE #${qrCount} GENERATED`);
    console.log('QR Data:', qr.substring(0, 50) + '...');
    qrcode.generate(qr, { small: true });
});

// Loading Event
client.on('loading_screen', (percent, message) => {
    console.log(`[${new Date().toISOString()}] LOADING: ${percent}% - ${message}`);
    if (percent === 100) {
        console.log('⏳ Loading complete, waiting for READY event...');
    }
});

// Log Cleanup Function
function cleanLogs() {
    qrCodeData = null;
    qrCount = 0;
    console.log(`[${new Date().toISOString()}] --- SESSION LOGS CLEANED ---`);
}

// Authenticated Event
client.on('authenticated', () => {
    console.log(`[${new Date().toISOString()}] ✅ AUTHENTICATED - Session exists or QR scanned`);
    cleanLogs();
});

// Ready Event
client.on('ready', () => {
    isReady = true;
    cleanLogs();
    console.log(`[${new Date().toISOString()}] 🎉 WhatsApp Client is READY and CONNECTED!`);
    console.log('✓ Server is now ready to send messages');
});

// Authentication Failure
client.on('auth_failure', msg => {
    console.error(`[${new Date().toISOString()}] ❌ AUTHENTICATION FAILURE:`, msg);
    isReady = false;
});

// Disconnected
client.on('disconnected', (reason) => {
    isReady = false;
    qrCodeData = null;
    qrCount = 0;
    console.log(`[${new Date().toISOString()}] ⚠️  DISCONNECTED - Reason:`, reason);
    // Try to re-initialize if it was a timeout
    if (reason === 'NAVIGATION' || reason === 'LOGOUT') {
        console.log('Restarting server...');
        setTimeout(() => process.exit(0), 2000);
    }
});

// Change Event (for debugging)
client.on('change_state', state => {
    console.log(`[${new Date().toISOString()}] STATE CHANGE:`, state);
});

// Catch unhandled rejections for the client
client.initialize().catch(err => {
    console.error(`[${new Date().toISOString()}] ❌ CLIENT INITIALIZE ERROR:`, err);
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

// Root Dashboard - Mobile-Friendly QR Status Page
app.get('/', (req, res) => {
    const baseStyle = `
        body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            text-align: center;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            max-width: 400px;
            width: 100%;
        }
        h1 {
            margin: 0 0 20px 0;
            font-size: 24px;
        }
        .status-badge {
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
        .refresh-btn {
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
                    <title>WhatsApp Bridge Status</title>
                    <style>${baseStyle}</style>
                </head>
                <body>
                    <div class="container">
                        <h1>🎉 متصل بنجاح</h1>
                        <div class="status-badge success">✓ WhatsApp Connected</div>
                        <p>السيرفر جاهز لإرسال الرسائل</p>
                        <button class="refresh-btn" onclick="location.reload()">تحديث</button>
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
                    <style>${baseStyle}</style>
                </head>
                <body>
                    <div class="container">
                        <h1>📱 امسح الباركود</h1>
                        <div class="status-badge warning">⏳ في انتظار الربط</div>
                        <div id="qrcode"></div>
                        <p style="font-size: 14px; opacity: 0.9;">افتح واتساب → الأجهزة المرتبطة → ربط جهاز</p>
                        <button class="refresh-btn" onclick="location.reload()">تحديث</button>
                    </div>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                    <script>
                        new QRCode(document.getElementById("qrcode"), {
                            text: "${qrCodeData}",
                            width: 256,
                            height: 256
                        });
                        // Auto-refresh when connected
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

    // No QR and not connected - initializing
    return res.send(`
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>WhatsApp Bridge Status</title>
                <style>${baseStyle}</style>
            </head>
            <body>
                <div class="container">
                    <h1>⚙️ جاري التهيئة</h1>
                    <div class="status-badge info">🔄 Initializing...</div>
                    <p>لا توجد طلبات ربط حالياً</p>
                    <p style="font-size: 14px; opacity: 0.8;">السيرفر يقوم بالتحضير، يرجى الانتظار...</p>
                    <button class="refresh-btn" onclick="location.reload()">تحديث</button>
                </div>
                <script>
                    setTimeout(() => location.reload(), 5000);
                </script>
            </body>
        </html>
    `);
});

// Status Check
app.get('/status', (req, res) => {
    res.json({
        connected: isReady,
        has_qr: !!qrCodeData,
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        message: isReady ? 'System Live' : (qrCodeData ? 'Login Required' : 'Initializing/Waiting...')
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
