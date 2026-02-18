import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    WASocket,
    ConnectionState
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logMessage } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface SessionData {
    socket: WASocket | null;
    qrCode: string | null;
    status: 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';
}

export class WhatsAppService {
    private sessions: Map<string, SessionData> = new Map();
    private lidToPn: Map<string, string> = new Map(); // Map to resolve LID to PN
    private stopReconnectFor = new Set<string>();

    private createLogId(prefix: string, sessionId: string, phone: string): string {
        const cleanPhone = (phone || '').replace(/\D/g, '') || 'na';
        return `${prefix}_${sessionId}_${cleanPhone}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    private getSession(sessionId: string): SessionData {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, {
                socket: null,
                qrCode: null,
                status: 'DISCONNECTED'
            });
        }
        return this.sessions.get(sessionId)!;
    }

    isValidSessionId(sessionId: string): boolean {
        if (!sessionId) return false;
        const normalized = sessionId.trim().toLowerCase();
        if (normalized === 'default') return false;
        return /^[a-z0-9][a-z0-9 _-]{0,49}$/.test(normalized);
    }

    private getAuthFolder(sessionId: string): string {
        return path.resolve(__dirname, `../../auth_info_${sessionId}`);
    }

    async init() {
        const rootDir = path.resolve(__dirname, '../../');
        try {
            this.sessions.clear();
            const files = fs.readdirSync(rootDir);
            const sessionFolders = files.filter(f => f.startsWith('auth_info_') && fs.statSync(path.join(rootDir, f)).isDirectory());
            
            if (sessionFolders.length === 0) {
                console.log('No existing sessions found. Ready for new connections.');
            } else {
                console.log(`Found ${sessionFolders.length} existing sessions. Attempting clean reconnection...`);
                for (const folder of sessionFolders) {
                    const sessionId = folder.replace('auth_info_', '');
                    if (!this.isValidSessionId(sessionId)) {
                        continue;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    await this.connect(sessionId);
                }
            }
        } catch (error) {
            console.error('Failed to initialize sessions:', error);
        }
    }

    async connect(sessionId: string): Promise<void> {
        if (!this.isValidSessionId(sessionId)) {
            throw new Error(`Invalid session ID: ${sessionId}`);
        }
        this.stopReconnectFor.delete(sessionId);
        const session = this.getSession(sessionId);
        
        if (session.socket) {
            console.log(`[${sessionId}] Cleaning up existing socket before new connection attempt.`);
            try { session.socket.end(undefined); } catch (e) {}
            session.socket = null;
        }

        if (session.status === 'CONNECTED') {
             console.log(`[${sessionId}] Session already connected.`);
             return;
        }

        session.status = 'CONNECTING';
        
        const connectionTimeout = setTimeout(() => {
            if (session.status === 'CONNECTING') {
                console.warn(`[${sessionId}] Connection timed out. Resetting status.`);
                session.status = 'DISCONNECTED';
                if (session.socket) {
                    session.socket.end(undefined);
                    session.socket = null;
                }
            }
        }, 120000);

        try {
            const authFolder = this.getAuthFolder(sessionId);
            const { state, saveCreds } = await useMultiFileAuthState(authFolder);

            const socket = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                browser: ['Ubuntu', 'Chrome', '110.0.5481.177'],
                markOnlineOnConnect: false,
                connectTimeoutMs: 120000,
                defaultQueryTimeoutMs: 120000,
                keepAliveIntervalMs: 20000,
                syncFullHistory: false,
                generateHighQualityLinkPreview: false,
                retryRequestDelayMs: 5000,
            });

            session.socket = socket;
            socket.ev.on('creds.update', saveCreds);

            // Listen for contact updates to map LID to PN
            socket.ev.on('contacts.upsert', (contacts) => {
                for (const contact of contacts) {
                    if (contact.id && contact.id.endsWith('@lid') && contact.id.includes(':')) {
                        // Some versions provide mapping here
                    }
                }
            });

            socket.ev.on('contacts.update', (updates) => {
                for (const update of updates) {
                    if (update.id && update.id.endsWith('@lid') && (update as any).phone) {
                        const lid = update.id.split('@')[0];
                        const pn = (update as any).phone;
                        this.lidToPn.set(lid, pn);
                        console.log(`[${sessionId}] Mapped LID ${lid} to PN ${pn}`);
                    }
                }
            });

            socket.ev.on('connection.update', (update: Partial<ConnectionState>) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    clearTimeout(connectionTimeout);
                    session.qrCode = qr;
                    session.status = 'QR_READY';
                    console.log(`[${sessionId}] New QR Code generated`);
                }

                if (connection === 'close') {
                    clearTimeout(connectionTimeout);
                    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    const isIntentionalStop = this.stopReconnectFor.has(sessionId);
                    
                    if (shouldReconnect && !isIntentionalStop) {
                        session.status = 'CONNECTING';
                        setTimeout(() => this.connect(sessionId), 5000);
                    } else {
                        session.status = 'DISCONNECTED';
                        session.qrCode = null;
                        session.socket = null;
                    }
                } else if (connection === 'open') {
                    clearTimeout(connectionTimeout);
                    console.log(`[${sessionId}] Connection opened`);
                    session.status = 'CONNECTED';
                    session.qrCode = null;
                }
            });

            socket.ev.on('messages.upsert', async (m) => {
                try {
                    if (m.type === 'notify' || m.type === 'append') {
                        for (const msg of m.messages) {
                            const remoteJid = msg.key.remoteJid || '';
                            let rawId = remoteJid.split('@')[0].split(':')[0];
                            
                            // Try to resolve LID to PN using our map
                            let phone = this.lidToPn.get(rawId) || rawId;
                            phone = phone.replace(/\D/g, ''); // Ensure only digits

                            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
                            
                            if (text && !remoteJid.includes('@g.us')) {
                                console.log(`[${sessionId}] Storing message from/to: ${phone}${phone !== rawId ? ' (Resolved from LID)' : ''}`);
                                if (!msg.key.fromMe) {
                                    logMessage({
                                        id: msg.key.id || this.createLogId('incoming', sessionId, phone),
                                        sessionId,
                                        phone,
                                        message: text,
                                        status: 'RECEIVED',
                                        direction: 'INCOMING'
                                    });
                                } else if (msg.key.fromMe && m.type === 'notify') {
                                    logMessage({
                                        id: msg.key.id || this.createLogId('outgoing_notify', sessionId, phone),
                                        sessionId,
                                        phone,
                                        message: text,
                                        status: 'SENT',
                                        direction: 'OUTGOING'
                                    });
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error(`[${sessionId}] Error processing message upsert:`, err);
                }
            });

        } catch (error) {
            clearTimeout(connectionTimeout);
            console.error(`[${sessionId}] Failed to connect:`, error);
            session.status = 'DISCONNECTED';
            session.socket = null;
        }
    }

    getConnectionStatus(sessionId: string) {
        if (!this.isValidSessionId(sessionId)) {
            return { status: 'DISCONNECTED' as const, qrCode: null };
        }
        const session = this.getSession(sessionId);
        return {
            status: session.status,
            qrCode: session.qrCode
        };
    }

    getSessions(): string[] {
        try {
            const rootDir = path.resolve(__dirname, '../../');
            const files = fs.readdirSync(rootDir);
            return files
                .filter(f => f.startsWith('auth_info_') && fs.statSync(path.join(rootDir, f)).isDirectory())
                .map(f => f.replace('auth_info_', ''))
                .filter(sessionId => this.isValidSessionId(sessionId));
        } catch (error) {
            return [];
        }
    }

    async sendMessage(sessionId: string, phone: string, text: string, imageUrl?: string) {
        if (!this.isValidSessionId(sessionId)) {
            throw new Error(`Invalid session ID: ${sessionId}`);
        }
        const session = this.getSession(sessionId);
        if (!session.socket) {
            await this.connect(sessionId);
            await new Promise(resolve => setTimeout(resolve, 3000));
            if (!session.socket) throw new Error(`Session ${sessionId} is disconnected.`);
        }
        
        const cleanedPhone = phone.replace(/\D/g, '');
        try {
            const results = await session.socket.onWhatsApp(cleanedPhone);
            const result = results?.[0];
            if (!result || !result.exists) throw new Error(`Number ${cleanedPhone} is not registered.`);
            
            const jid = result.jid;
            let msgResult;
            if (imageUrl) {
                msgResult = await session.socket.sendMessage(jid, { image: { url: imageUrl }, caption: text });
            } else {
                msgResult = await session.socket.sendMessage(jid, { text });
            }
            
            logMessage({
                id: msgResult?.key?.id || this.createLogId('outgoing_send', sessionId, cleanedPhone),
                sessionId,
                phone: cleanedPhone,
                message: text,
                status: 'SENT',
                direction: 'OUTGOING'
            });
            return msgResult;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.toLowerCase().includes('connection closed')) {
                // Force fresh socket on next attempt
                session.socket = null;
            }

            logMessage({
                id: this.createLogId('failed', sessionId, cleanedPhone),
                sessionId,
                phone: cleanedPhone,
                message: text,
                status: 'FAILED',
                direction: 'OUTGOING',
                error: errorMsg
            });
            throw error;
        }
    }

    async disconnect(sessionId: string): Promise<void> {
        if (!this.isValidSessionId(sessionId)) return;
        this.stopReconnectFor.add(sessionId);
        const session = this.getSession(sessionId);
        if (session.socket) {
            session.socket.end(undefined);
            session.socket = null;
        }
        session.status = 'DISCONNECTED';
    }

    async logout(sessionId: string): Promise<void> {
        if (!this.isValidSessionId(sessionId)) return;
        this.stopReconnectFor.add(sessionId);
        try { await this.disconnect(sessionId); } catch (e) {}
        const authFolder = this.getAuthFolder(sessionId);
        try {
            if (fs.existsSync(authFolder)) fs.rmSync(authFolder, { recursive: true, force: true });
            this.sessions.delete(sessionId);
        } catch (error) {}
    }

    async renameSession(oldId: string, newId: string): Promise<void> {
        if (!this.isValidSessionId(oldId)) throw new Error('Invalid original session name.');
        if (!this.isValidSessionId(newId)) throw new Error('Invalid new session name.');
        if (oldId === newId) return;
        const oldFolder = this.getAuthFolder(oldId);
        const newFolder = this.getAuthFolder(newId);
        if (fs.existsSync(newFolder)) throw new Error(`El nombre "${newId}" ya existe.`);
        await this.disconnect(oldId);
        if (fs.existsSync(oldFolder)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            fs.renameSync(oldFolder, newFolder);
        }
        this.sessions.delete(oldId);
    }
    
    getConnectedSessionCount(): number {
        let count = 0;
        for (const session of this.sessions.values()) {
            if (session.status === 'CONNECTED') count++;
        }
        return count;
    }

    async disconnectAll(): Promise<void> {
        for (const sessionId of this.sessions.keys()) {
            await this.disconnect(sessionId);
        }
    }
}

export const waService = new WhatsAppService();
