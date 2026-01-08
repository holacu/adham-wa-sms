const express = require('express');
const cors = require('cors');
const whatsapp = require('./whatsapp-client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize WhatsApp client on startup
whatsapp.initialize();

app.get('/', (req, res) => {
    res.send('SkyServer WhatsApp Automation API is running.');
});

app.get('/status', (req, res) => {
    res.json({
        status: whatsapp.status,
        timestamp: Date.now()
    });
});

app.get('/qr', async (req, res) => {
    const result = await whatsapp.getQrCode();
    res.json(result);
});

app.post('/init', async (req, res) => {
    await whatsapp.initialize();
    res.json({ message: 'Initialization requested', status: whatsapp.status });
});

app.post('/send', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ error: 'Phone and message are required' });
    }

    try {
        const result = await whatsapp.sendMessage(phone, message);
        res.json(result);
    } catch (error) {
        console.error('Send Error:', error);
        res.status(500).json({ error: 'Failed to send message', details: error.message });
    }
});

app.post('/logout', async (req, res) => {
    await whatsapp.logout();
    res.json({ message: 'Logged out successfully' });
});

app.listen(PORT, () => {
    console.log(`SkyServer running on port ${PORT}`);
});
