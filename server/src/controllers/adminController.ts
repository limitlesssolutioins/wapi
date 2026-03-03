import { Request, Response } from 'express';
import db from '../db/index.js';
import { updateCampaignStatus, updateRecipientById, resetFailedRecipients } from '../utils/campaigns.js';

export const listAllCampaigns = (_req: Request, res: Response): void => {
    const rows = db.prepare(`
        SELECT c.*,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id) as total,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'SENT') as sent,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'FAILED') as failed,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = c.id AND status = 'PENDING') as pending
        FROM campaigns c
        ORDER BY c.createdAt DESC
    `).all();
    res.json(rows);
};

export const getCampaignRecipients = (req: Request, res: Response): void => {
    const { id } = req.params;
    const statusFilter = req.query.status as string | undefined;

    let query = 'SELECT * FROM campaign_recipients WHERE campaign_id = ?';
    const params: any[] = [id];

    if (statusFilter) {
        query += ' AND status = ?';
        params.push(statusFilter);
    }

    query += ' ORDER BY id ASC';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
};

export const setCampaignStatus = (req: Request, res: Response): void => {
    const { id } = req.params;
    const { status } = req.body as { status: string };
    const valid = ['QUEUED', 'PROCESSING', 'COMPLETED', 'PAUSED', 'FAILED', 'CANCELLED'];
    if (!valid.includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
    }
    updateCampaignStatus(id as string, status as any);
    res.json({ success: true });
};

export const setRecipientStatus = (req: Request, res: Response): void => {
    const recipientId = parseInt(req.params.recipientId as string, 10);
    const { status, error } = req.body as { status: string; error?: string };
    if (!['PENDING', 'SENT', 'FAILED'].includes(status)) {
        res.status(400).json({ error: 'Invalid status. Must be PENDING, SENT, or FAILED' });
        return;
    }
    updateRecipientById(recipientId, status as 'PENDING' | 'SENT' | 'FAILED', error);
    res.json({ success: true });
};

export const resetFailed = (req: Request, res: Response): void => {
    const { id } = req.params;
    const count = resetFailedRecipients(id as string);
    res.json({ success: true, count });
};
