import { Request, Response } from 'express';
import { createCampaign, getCampaignProgress, listCampaigns } from '../services/campaignService.js';

export const create = (req: Request, res: Response) => {
    const { sessionId, sessionIds, message, contactIds } = req.body;

    // Handle both single sessionId and array sessionIds
    const sessions = sessionIds && Array.isArray(sessionIds) && sessionIds.length > 0
        ? sessionIds
        : sessionId ? [sessionId] : [];

    if (sessions.length === 0 || !message || !contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
        res.status(400).json({ error: 'At least one sessionId, message, and contactIds (non-empty array) are required' });
        return;
    }

    try {
        const campaign = createCampaign(sessions, message, contactIds);
        res.json(campaign);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(400).json({ error: msg });
    }
};

export const getProgress = (req: Request, res: Response) => {
    const { id } = req.params;
    const campaign = getCampaignProgress(id as string);
    if (!campaign) {
        res.status(404).json({ error: 'Campaign not found' });
        return;
    }
    res.json(campaign);
};

export const list = (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const allCampaigns = listCampaigns();
    
    // Sort by newest first
    allCampaigns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = allCampaigns.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedCampaigns = allCampaigns.slice(startIndex, endIndex);

    res.json({
        data: paginatedCampaigns,
        meta: {
            total,
            page,
            totalPages,
            limit
        }
    });
};
