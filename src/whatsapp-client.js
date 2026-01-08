const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

class WhatsAppClient {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--disable-extensions'
                ],
            }
        });

        this.qrCodeData = null;
        this.status = 'DISCONNECTED'; // DISCONNECTED, WAITING_FOR_QR, CONNECTED
        this.readyTimestamp = null;

        this.initializeEvents();
    }

    initializeEvents() {
        this.client.on('qr', (qr) => {
            console.log('QR RECEIVED', qr);
            this.qrCodeData = qr;
            this.status = 'WAITING_FOR_QR';
        });

        this.client.on('ready', () => {
            console.log('Client is ready!');
            this.status = 'CONNECTED';
            this.qrCodeData = null;
            this.readyTimestamp = Date.now();
        });

        this.client.on('authenticated', () => {
            console.log('AUTHENTICATED');
            this.status = 'AUTHENTICATED'; // Intermediate state
        });

        this.client.on('auth_failure', msg => {
            console.error('AUTHENTICATION FAILURE', msg);
            this.status = 'DISCONNECTED';
        });

        this.client.on('disconnected', (reason) => {
            console.log('Client was logged out', reason);
            this.status = 'DISCONNECTED';
            this.qrCodeData = null;
            // implementing auto-reconnect logic if needed, 
            // but usually we want to re-init explicitly or let the container restart
            this.client.initialize();
        });
    }

    async initialize() {
        if (this.status === 'CONNECTED') return;
        try {
            await this.client.initialize();
        } catch (error) {
            console.error('Failed to initialize client:', error);
            this.status = 'DISCONNECTED';
        }
    }

    async getQrCode() {
        if (this.status === 'CONNECTED') {
            return { status: 'CONNECTED', qr: null };
        }
        if (this.qrCodeData) {
            try {
                // Convert QR to Data URL for easy display in Flutter
                const qrImage = await qrcode.toDataURL(this.qrCodeData);
                return { status: this.status, qr: qrImage, raw: this.qrCodeData };
            } catch (err) {
                console.error('Error generating QR image', err);
                return { status: this.status, qr: null, error: 'QR Generation Failed' };
            }
        }
        return { status: this.status, qr: null };
    }

    async sendMessage(phoneNumber, message) {
        if (this.status !== 'CONNECTED') {
            throw new Error('Client not connected');
        }

        // formatting phone number
        // remove leading 0, +, or special chars, ensure 964 prefix for Iraq if local
        let chatId = phoneNumber.replace(/\D/g, '');

        // Simple logic for Iraq numbers: 077... -> 96477...
        if (chatId.startsWith('07')) {
            chatId = '964' + chatId.substring(1);
        }

        // Add @c.us suffix if missing
        if (!chatId.includes('@c.us')) {
            chatId += '@c.us';
        }

        try {
            const response = await this.client.sendMessage(chatId, message);
            return { success: true, id: response.id._serialized };
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    async logout() {
        try {
            await this.client.logout();
            this.status = 'DISCONNECTED';
        } catch (error) {
            console.error('Error logging out:', error);
        }
    }
}

module.exports = new WhatsAppClient();
