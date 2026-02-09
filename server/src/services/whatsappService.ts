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

    private getAuthFolder(sessionId: string): string {
        return path.resolve(__dirname, `../../auth_info_${sessionId}`);
    }

    async init() {
        const rootDir = path.resolve(__dirname, '../../');
        try {
            const files = fs.readdirSync(rootDir);
            const sessionFolders = files.filter(f => f.startsWith('auth_info_') && fs.statSync(path.join(rootDir, f)).isDirectory());
            
            if (sessionFolders.length === 0) {
                console.log('No existing sessions found. Initializing default session...');
                await this.connect('default');
            } else {
                console.log(`Found ${sessionFolders.length} existing sessions. Reconnecting...`);
                for (const folder of sessionFolders) {
                    const sessionId = folder.replace('auth_info_', '');
                    await this.connect(sessionId);
                }
            }
        } catch (error) {
            console.error('Failed to initialize sessions:', error);
        }
    }

    async connect(sessionId: string = 'default'): Promise<void> {
        const session = this.getSession(sessionId);
        if (session.status === 'CONNECTED' || session.status === 'CONNECTING') {
             console.log(`[${sessionId}] Session already active or connecting.`);
             return;
        }

        session.status = 'CONNECTING';
        
        // Timeout safety: Reset if stuck in CONNECTING for too long (30s)
        const connectionTimeout = setTimeout(() => {
            if (session.status === 'CONNECTING') {
                console.warn(`[${sessionId}] Connection timed out. Resetting status.`);
                session.status = 'DISCONNECTED';
                if (session.socket) {
                    session.socket.end(undefined);
                    session.socket = null;
                }
            }
        }, 30000);

        try {
            const authFolder = this.getAuthFolder(sessionId);
            console.log(`[${sessionId}] Using auth folder: ${authFolder}`);
            
            const { state, saveCreds } = await useMultiFileAuthState(authFolder);

            const socket = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                browser: ['Limitless Campaign', 'Chrome', '1.0.0'],
                connectTimeoutMs: 20000,
                defaultQueryTimeoutMs: 20000,
                keepAliveIntervalMs: 10000,
                syncFullHistory: false,
                retryRequestDelayMs: 500,
            });

            session.socket = socket;

            socket.ev.on('creds.update', saveCreds);

            socket.ev.on('connection.update', (update: Partial<ConnectionState>) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    clearTimeout(connectionTimeout); // Clear timeout on activity
                    session.qrCode = qr;
                    session.status = 'QR_READY';
                    console.log(`[${sessionId}] New QR Code generated`);
                }

                if (connection === 'close') {
                    clearTimeout(connectionTimeout);
                    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    
                    console.log(`[${sessionId}] Connection closed. Status: ${statusCode}, Reconnecting: ${shouldReconnect}`);
                    
                    if (shouldReconnect) {
                        session.status = 'CONNECTING';
                        // Re-connect with a slight delay
                        setTimeout(() => this.connect(sessionId), 2000);
                    } else {
                        session.status = 'DISCONNECTED';
                        session.qrCode = null;
                        session.socket = null;
                        console.log(`[${sessionId}] Session invalidated or logged out.`);
                    }
                } else if (connection === 'open') {
                    clearTimeout(connectionTimeout);
                    console.log(`[${sessionId}] Connection opened`);
                    session.status = 'CONNECTED';
                    session.qrCode = null;
                }
            });

            // Listen for incoming messages... (Rest of the code remains the same)
            socket.ev.on('messages.upsert', async (m) => {
                try {
                    if (m.type === 'notify') {
                        for (const msg of m.messages) {
                            if (!msg.key.fromMe && msg.message) {
                                const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
                                if (text) {
                                    const phone = msg.key.remoteJid?.replace('@s.whatsapp.net', '') || 'unknown';
                                    console.log(`[${sessionId}] Incoming message from ${phone}: ${text}`);
                                    logMessage({
                                        id: msg.key.id || 'unknown',
                                        sessionId,
                                        phone,
                                        message: text,
                                        status: 'RECEIVED',
                                        direction: 'INCOMING'
                                    });
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error(`[${sessionId}] Error processing incoming message:`, err);
                }
            });
            
            // Listen for status updates (Checks)
            socket.ev.on('messages.update', (updates) => {
                for (const update of updates) {
                    if (update.update.status) {
                        const statusMap = {
                            1: 'PENDING',
                            2: 'SERVER_ACK',
                            3: 'DELIVERY_ACK',
                            4: 'READ',
                            0: 'ERROR'
                        };
                        const status = statusMap[update.update.status as keyof typeof statusMap] || update.update.status;
                        console.log(`[${sessionId}] Message Update: ${update.key.id} -> ${status}`);
                    }
                }
            });

        } catch (error) {
            clearTimeout(connectionTimeout);
            console.error(`[${sessionId}] Failed to connect:`, error);
            session.status = 'DISCONNECTED';
            session.socket = null;
        }
    }

    getConnectionStatus(sessionId: string = 'default') {
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
            const sessions = files
                .filter(f => f.startsWith('auth_info_') && fs.statSync(path.join(rootDir, f)).isDirectory())
                .map(f => f.replace('auth_info_', ''));
            
            return sessions.length > 0 ? sessions : ['default'];
        } catch (error) {
            console.error('Error listing sessions:', error);
            return ['default'];
        }
    }

    async sendMessage(sessionId: string, phone: string, text: string) {
        const session = this.getSession(sessionId);
        
        if (!session.socket) {
            // Try to reconnect if session exists but socket is gone
            console.warn(`[${sessionId}] Socket not found, attempting quick reconnect...`);
            await this.connect(sessionId);
            // Wait a bit for connection
            await new Promise(resolve => setTimeout(resolve, 3000));
            if (!session.socket) {
                throw new Error(`Session ${sessionId} is disconnected. Please scan QR code.`);
            }
        }
        
        // Clean phone number: remove non-digits
        const cleanedPhone = phone.replace(/\D/g, '');
        
        // Verify number existence on WhatsApp
        try {
            const [result] = await session.socket.onWhatsApp(cleanedPhone);
            if (!result || !result.exists) {
                throw new Error(`Number ${cleanedPhone} is not registered on WhatsApp`);
            }
            
            const jid = result.jid;
            console.log(`[${sessionId}] Sending message to verified JID: ${jid}`);
            
            const msgResult = await session.socket.sendMessage(jid, { text });
            console.log(`[${sessionId}] Message sent:`, msgResult?.key?.id);
            
            logMessage({
                id: msgResult?.key?.id || 'unknown',
                sessionId,
                phone: cleanedPhone,
                message: text,
                status: 'SENT',
                direction: 'OUTGOING'
            });

            return msgResult;
        } catch (error) {
            console.error(`[${sessionId}] Error sending message:`, error);
            
            logMessage({
                id: 'failed',
                sessionId,
                phone: cleanedPhone,
                message: text,
                status: 'FAILED',
                direction: 'OUTGOING',
                error: error instanceof Error ? error.message : String(error)
            });

            throw error;
        }
    }

    async disconnect(sessionId: string): Promise<void> {
        const session = this.getSession(sessionId);
        if (session.socket) {
            console.log(`[${sessionId}] Closing connection gracefully...`);
            session.socket.end(undefined);
            session.socket = null;
        }
        session.status = 'DISCONNECTED';
    }

    async logout(sessionId: string): Promise<void> {
        await this.disconnect(sessionId);
        
        const authFolder = this.getAuthFolder(sessionId);
        console.log(`[${sessionId}] Deleting auth folder: ${authFolder}`);
        
        try {
            if (fs.existsSync(authFolder)) {
                fs.rmSync(authFolder, { recursive: true, force: true });
            } else {
                console.log(`[${sessionId}] Auth folder not found, skipping delete.`);
            }
            this.sessions.delete(sessionId);
        } catch (error) {
            console.error(`[${sessionId}] Error deleting auth folder:`, error);
            // Don't throw, just log
        }
    }

    async renameSession(oldId: string, newId: string): Promise<void> {
        if (oldId === newId) return;
        
        const oldFolder = this.getAuthFolder(oldId);
        const newFolder = this.getAuthFolder(newId);

        if (fs.existsSync(newFolder)) {
            throw new Error(`El nombre de sesión "${newId}" ya está en uso.`);
        }

        // 1. Disconnect current session
        await this.disconnect(oldId);

        // 2. Rename folder if it exists
        if (fs.existsSync(oldFolder)) {
            try {
                // Wait a bit for file locks to release
                await new Promise(resolve => setTimeout(resolve, 1000));
                fs.renameSync(oldFolder, newFolder);
                console.log(`[${oldId}] Folder renamed to ${newId}`);
            } catch (error) {
                console.error(`Error renaming folder:`, error);
                throw new Error('No se pudo renombrar la carpeta de sesión. Asegúrate de que no esté en uso.');
            }
        }

        // 3. Update memory and prevent reconnection
        const oldSession = this.sessions.get(oldId);
        if (oldSession) {
            // Force status to DISCONNECTED to stop any auto-reconnect logic
            oldSession.status = 'DISCONNECTED';
            oldSession.socket = null;
            this.sessions.delete(oldId);
        }
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
