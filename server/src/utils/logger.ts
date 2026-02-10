import db from '../db/index.js';

export interface MessageLog {
    id: string;
    session_id: string;
    phone: string;
    message: string;
    timestamp: string;
    status: 'SENT' | 'FAILED' | 'RECEIVED' | 'PENDING';
    direction: 'INCOMING' | 'OUTGOING';
    error?: string;
}

export const logMessage = (entry: Omit<MessageLog, 'timestamp' | 'session_id'> & { sessionId: string }) => {
    const logEntry: Omit<MessageLog, 'session_id'> & { session_id: string } = {
        ...entry,
        session_id: entry.sessionId,
        timestamp: new Date().toISOString()
    };
    
    try {
        const stmt = db.prepare(`
            INSERT INTO messages (id, session_id, phone, message, timestamp, status, direction, error)
            VALUES (@id, @session_id, @phone, @message, @timestamp, @status, @direction, @error)
        `);
        stmt.run(logEntry);
    } catch (error) {
        console.error('Error writing to message log:', error);
    }
};

export const getHistory = (sessionId?: string): MessageLog[] => {
    try {
        if (sessionId) {
            const stmt = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC');
            return stmt.all(sessionId) as MessageLog[];
        }
        const stmt = db.prepare('SELECT * FROM messages ORDER BY timestamp ASC');
        return stmt.all() as MessageLog[];
    } catch (error)
    {
        console.error('Error reading message history:', error);
        return [];
    }
};