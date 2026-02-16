import { Request, Response } from 'express';
import { createCampaign, getCampaignProgress as getCampaignDetails, listCampaigns, updateCampaign } from '../services/campaignService.js';

export const create = (req: Request, res: Response) => {
    const { name, templateId, imageUrl, contactIds, groupId, sessionId, sessionIds, scheduleTime } = req.body;
    
    // Normalize sessionIds from either sessionId (old) or sessionIds (new)
    const finalSessionIds = sessionIds && Array.isArray(sessionIds) && sessionIds.length > 0
        ? sessionIds
        : sessionId ? [sessionId] : [];

    if (!name || !templateId || finalSessionIds.length === 0) {
        return res.status(400).json({ 
            error: 'name, templateId, and at least one session ID are required' 
        });
    }

    try {
        const campaign = createCampaign({ 
            name,
            templateId,
            imageUrl,
            contactIds: contactIds || [],
            groupId: groupId || null,
            sessionIds: finalSessionIds,
            scheduleTime: scheduleTime || null,
        });
        res.status(201).json(campaign);
    } catch (error) {
        console.error('Campaign creation failed:', error);
        const msg = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: msg });
    }
};

export const update = (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, templateId, imageUrl, sessionIds, scheduleTime } = req.body;

    try {
        updateCampaign(id as string, { name, templateId, imageUrl, sessionIds, scheduleTime });
        res.json({ success: true });
    } catch (error) {
        console.error('Campaign update failed:', error);
        const msg = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: msg });
    }
};

export const getDetails = (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const campaign = getCampaignDetails(id as string); // Cast id to string
        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }
        res.json(campaign);
    } catch (error) {
        console.error(`Failed to get campaign ${id}:`, error);
        res.status(500).json({ error: 'Failed to retrieve campaign details' });
    }
};

export const list = (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    try {
        const result = listCampaigns(page, limit);
        res.json(result);
    } catch (error) {
        console.error('Failed to list campaigns:', error);
        res.status(500).json({ error: 'Failed to retrieve campaigns' });
    }
};
