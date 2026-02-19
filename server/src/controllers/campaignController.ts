import { Request, Response } from 'express';
import { addSessionToCampaign, cancelCampaign, createCampaign, getCampaignProgress as getCampaignDetails, listCampaigns, pauseCampaign, removeSessionFromCampaign, resumeCampaign, updateCampaign } from '../services/campaignService.js';
import { CampaignSessionData } from '../utils/campaigns.js'; // Import CampaignSessionData
import { waService } from '../services/whatsappService.js'; // Import waService

export const create = (req: Request, res: Response) => {
    const { name, templateId, imageUrl, blitzMode, contactIds, groupId, sessionId, sessionIds, scheduleTime, proxyUrl } = req.body;
    
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
            blitzMode: blitzMode === true || blitzMode === 'true',
            contactIds: contactIds || [],
            groupId: groupId || null,
            sessionIds: finalSessionIds,
            scheduleTime: scheduleTime || null,
            proxyUrl: proxyUrl || null, // Pass proxyUrl
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
    const { name, templateId, imageUrl, sessionIds, sessions, scheduleTime, proxyUrl } = req.body; // Add sessions and proxyUrl

    let updatedSessionsData: CampaignSessionData[] | undefined;
    if (sessions) {
        updatedSessionsData = (sessions as CampaignSessionData[]).filter(s => waService.isValidSessionId(s.id));
    } else if (sessionIds) {
        // Fallback for old sessionIds, apply single proxyUrl if available
        updatedSessionsData = (sessionIds as string[]).map(id => ({ id: id, proxyUrl: proxyUrl || null }));
    }

    try {
        updateCampaign(id as string, { name, templateId, imageUrl, sessions: updatedSessionsData, scheduleTime }); // Pass sessions
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

export const cancel = (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const campaign = cancelCampaign(id as string);
        res.json(campaign);
    } catch (error) {
        console.error('Campaign cancellation failed:', error);
        const msg = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: msg });
    }
};

export const pause = (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const campaign = pauseCampaign(id as string);
        res.json(campaign);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: msg });
    }
};

export const resume = (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const campaign = resumeCampaign(id as string);
        res.json(campaign);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: msg });
    }
};

export const addSession = (req: Request, res: Response) => {
    const { id } = req.params;
    const { sessionId, proxyUrl } = req.body; // Add proxyUrl

    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
    }

    try {
        addSessionToCampaign(id as string, sessionId, proxyUrl); // Pass proxyUrl
        res.json({ success: true });
    } catch (error) {
        console.error('Add session failed:', error);
        const msg = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: msg });
    }
};

export const removeSession = (req: Request, res: Response) => {
    const { id, sessionId } = req.params;

    try {
        removeSessionFromCampaign(id as string, sessionId as string);
        res.json({ success: true });
    } catch (error) {
        console.error('Remove session failed:', error);
        const msg = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: msg });
    }
};
