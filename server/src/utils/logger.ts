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

const buildUniqueId = (baseId: string): string => {
    const safeBase = (baseId || 'msg').replace(/\s+/g, '_');
    return `${safeBase}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

export const logMessage = (entry: Omit<MessageLog, 'timestamp' | 'session_id'> & { sessionId: string }) => {
    const logEntry = {
        id: entry.id || buildUniqueId('msg'),
        session_id: entry.sessionId,
        phone: entry.phone,
        message: entry.message,
        status: entry.status,
        direction: entry.direction,
        error: entry.error || null,
        timestamp: new Date().toISOString()
    };
    
    try {
        const stmt = db.prepare(`
            INSERT INTO messages (id, session_id, phone, message, timestamp, status, direction, error)
            VALUES (@id, @session_id, @phone, @message, @timestamp, @status, @direction, @error)
        `);
        stmt.run(logEntry);
    } catch (error) {
        const sqliteCode = (error as any)?.code as string | undefined;
        if (sqliteCode === 'SQLITE_CONSTRAINT_PRIMARYKEY' || sqliteCode === 'SQLITE_CONSTRAINT_UNIQUE') {
            try {
                const retry = { ...logEntry, id: buildUniqueId(logEntry.id) };
                const retryStmt = db.prepare(`
                    INSERT INTO messages (id, session_id, phone, message, timestamp, status, direction, error)
                    VALUES (@id, @session_id, @phone, @message, @timestamp, @status, @direction, @error)
                `);
                retryStmt.run(retry);
                return;
            } catch (retryError) {
                console.error('Error writing to message log after PK retry:', retryError);
                return;
            }
        }

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
