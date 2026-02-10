import { Request, Response } from 'express';
import { waService } from '../services/whatsappService.js';
import { getHistory } from '../utils/logger.js';
import db from '../db/index.js';

export const getStatus = (req: Request, res: Response) => {
    const sessionId = (req.query.sessionId as string) || 'default';
    const { status, qrCode } = waService.getConnectionStatus(sessionId);
    res.json({
        status,
        qrCode
    });
};

export const getSessions = (_req: Request, res: Response) => {
    const sessions = waService.getSessions();
    res.json(sessions);
};

export const initSession = async (req: Request, res: Response) => {
    const { sessionId = 'default' } = req.body || {};
    try {
        await waService.connect(sessionId);
        res.json({ message: `Session ${sessionId} initialization started` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to initialize session' });
    }
};

export const logoutSession = async (req: Request, res: Response) => {
    const { sessionId = 'default' } = req.body || {};
    try {
        await waService.logout(sessionId);
        res.json({ message: `Session ${sessionId} logged out` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to logout session' });
    }
};

export const renameSession = async (req: Request, res: Response) => {
    const { oldId, newId } = req.body;
    if (!oldId || !newId) {
        res.status(400).json({ error: 'oldId and newId are required' });
        return;
    }
    try {
        await waService.renameSession(oldId, newId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const sendMessage = async (req: Request, res: Response) => {
    const { phone, message, sessionId = 'default' } = req.body || {};
    try {
        await waService.sendMessage(sessionId, phone, message);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
    }
};

export const getMessageHistory = (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    try {
        const history = getHistory(sessionId);
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: "Failed to retrieve message history" });
    }
};

export const getChats = (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    try {
        const history = getHistory(sessionId);
        
        // Group by phone number and get the latest message
        const chatsMap = new Map();
        
        history.forEach(msg => {
            const existing = chatsMap.get(msg.phone);
            if (!existing || new Date(msg.timestamp) > new Date(existing.timestamp)) {
                chatsMap.set(msg.phone, msg);
            }
        });

        const chats = Array.from(chatsMap.values()).sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        res.json(chats);
    } catch (error) {
        res.status(500).json({ error: "Failed to retrieve chats" });
    }
};

export const getConversation = (req: Request, res: Response) => {
    const { phone } = req.params;
    const sessionId = req.query.sessionId as string;
    try {
        const history = getHistory(sessionId);
        
        const conversation = history
            .filter(msg => msg.phone === phone)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            
        res.json(conversation);
    } catch (error) {
        res.status(500).json({ error: "Failed to retrieve conversation" });
    }
};

export const deleteChat = (req: Request, res: Response) => {
    const { phone } = req.params;
    const sessionId = req.query.sessionId as string;
    
    if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
    }

    try {
        const stmt = db.prepare('DELETE FROM messages WHERE phone = ? AND session_id = ?');
        stmt.run(phone, sessionId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting chat:', error);
        res.status(500).json({ error: 'Failed to delete chat' });
    }
};