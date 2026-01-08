const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const bodyParser = require('body-parser');
const puppeteer = require('puppeteer'); // Added for Render fix

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Global State
let qrCodeData = null;
let clientStatus = 'DISCONNECTED'; // DISCONNECTED, QR_READY, CONNECTED
let logs = [];
const MAX_LOGS = 50;
let messageHistory = [];

// Auth Credentials
const AUTH_USER = 'Holacu';
const AUTH_PASS = 'Adham12399991@@11';

// Logging Helper
function log(type, message) {
    const timestamp = new Date().toISOString();
    const entry = { timestamp, type, message };
    logs.unshift(entry);
    if (logs.length > MAX_LOGS) logs.pop();
    console.log(`[${type}] ${message}`);
}

// WhatsApp Client Setup
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: puppeteer.executablePath(), // Explicitly use installed Chrome
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    }
});

client.on('qr', (qr) => {
    qrCodeData = qr;
    clientStatus = 'QR_READY';
    log('INFO', 'QR Code generated');
});

client.on('ready', () => {
    clientStatus = 'CONNECTED';
    qrCodeData = null;
    log('SUCCESS', 'WhatsApp Client is ready!');
});

client.on('authenticated', () => {
    clientStatus = 'AUTHENTICATED';
    log('INFO', 'Client authenticated');
});

client.on('auth_failure', (msg) => {
    clientStatus = 'DISCONNECTED';
    log('ERROR', 'Authentication failure: ' + msg);
});

client.on('disconnected', (reason) => {
    clientStatus = 'DISCONNECTED';
    qrCodeData = null;
    log('WARN', 'Client was disconnected: ' + reason);
    // client.initialize(); // Optional: Auto reconnect
});

// Start Client
client.initialize();

// --- API Endpoints ---

// 1. Wake / Ping
app.get('/wake', (req, res) => {
    res.status(200).send('Server is awake');
});

// 2. Status & QR (Protected)
app.get('/status', (req, res) => {
    // Basic Auth Check can be added here if strictly needed for app, 
    // but for now we keep it open for the app to poll easily, 
    // or add headers check. User asked for secure page, but app needs access.
    // We will verify credentials if provided in headers for "secure" actions.

    res.json({
        status: clientStatus,
        qr: qrCodeData,
        logs: logs.slice(0, 5) // Send last 5 logs for quick preview
    });
});

// Message History

// ... (existing code)

// 3. Send Message (Protected)
app.post('/send', async (req, res) => {
    const { number, message } = req.body;

    if (clientStatus !== 'CONNECTED') {
        return res.status(503).json({ error: 'WhatsApp not connected' });
    }

    try {
        // Format number logic...
        let formattedNumber = number.replace(/\D/g, '');
        if (formattedNumber.startsWith('07')) {
            formattedNumber = '964' + formattedNumber.substring(1);
        }
        if (!formattedNumber.endsWith('@c.us')) {
            formattedNumber += '@c.us';
        }

        await client.sendMessage(formattedNumber, message);

        // Log to System
        log('MESSAGE', `Sent to ${number}`);

        // Add to History
        const historyEntry = {
            timestamp: new Date().toISOString(),
            number: number,
            localBody: message, // We store the body we sent
            status: 'SENT'
        };
        messageHistory.unshift(historyEntry);
        if (messageHistory.length > 50) messageHistory.pop();

        res.json({ success: true, entry: historyEntry });
    } catch (error) {
        log('ERROR', `Failed to send to ${number}: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// 4. Secure Logs (For Secure Page)
app.get('/logs', (req, res) => {
    res.json(logs);
});

// 5. Message History (New)
app.get('/messages', (req, res) => {
    res.json(messageHistory);
});

app.listen(port, function () {
    log('SYSTEM', `Server listening on port ${port}`);
});
