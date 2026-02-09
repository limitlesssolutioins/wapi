import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_FILE = path.resolve(__dirname, '../../message_history.json');

export interface MessageLog {
    id: string;
    sessionId: string;
    phone: string;
    message: string;
    timestamp: string;
    status: 'SENT' | 'FAILED' | 'RECEIVED';
    direction: 'INCOMING' | 'OUTGOING';
    error?: string;
}

export const logMessage = (entry: Omit<MessageLog, 'timestamp'>) => {
    const logEntry: MessageLog = {
        ...entry,
        timestamp: new Date().toISOString()
    };

    let history: MessageLog[] = [];
    
    try {
        if (fs.existsSync(LOG_FILE)) {
            const fileContent = fs.readFileSync(LOG_FILE, 'utf-8');
            history = JSON.parse(fileContent);
        }
    } catch (error) {
        console.error('Error reading history file, starting new:', error);
    }

    history.push(logEntry);

    try {
        fs.writeFileSync(LOG_FILE, JSON.stringify(history, null, 2));
    } catch (error) {
        console.error('Error writing to history file:', error);
    }
};

export const getHistory = (sessionId?: string): MessageLog[] => {
    try {
        if (!fs.existsSync(LOG_FILE)) return [];
        const fileContent = fs.readFileSync(LOG_FILE, 'utf-8');
        const history: MessageLog[] = JSON.parse(fileContent);
        
        if (sessionId) {
            return history.filter(h => h.sessionId === sessionId);
        }
        return history;
    } catch (error) {
        console.error('Error reading history:', error);
        return [];
    }
};
