import { Request, Response } from 'express';
import { createGateway, getSmsGateways, removeGateway, updateGateway } from '../services/smsGatewayService.js';
import { cancelSmsCampaign, createSmsCampaign, getSmsCampaignProgress, listSmsCampaigns } from '../services/smsCampaignService.js';

export const listGateways = (_req: Request, res: Response) => {
    try {
        res.json(getSmsGateways());
    } catch (error) {
        res.status(500).json({ error: 'Failed to list SMS gateways' });
    }
};

export const createGatewayController = (req: Request, res: Response) => {
    const { name, endpoint, token, isActive } = req.body || {};
    try {
        const gateway = createGateway({ name, endpoint, token, isActive });
        res.status(201).json(gateway);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create SMS gateway';
        res.status(400).json({ error: msg });
    }
};

export const updateGatewayController = (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, endpoint, token, isActive } = req.body || {};

    try {
        const gateway = updateGateway(id as string, { name, endpoint, token, isActive });
        res.json(gateway);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to update SMS gateway';
        res.status(400).json({ error: msg });
    }
};

export const deleteGatewayController = (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        removeGateway(id as string);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete SMS gateway' });
    }
};

export const createCampaignController = (req: Request, res: Response) => {
    const { name, message, contactIds, groupId, gatewayIds, scheduleTime } = req.body || {};

    if (!name || !message || !Array.isArray(gatewayIds) || gatewayIds.length === 0) {
        return res.status(400).json({ error: 'name, message and at least one gateway are required' });
    }

    try {
        const campaign = createSmsCampaign({
            name,
            message,
            contactIds: Array.isArray(contactIds) ? contactIds : [],
            groupId: groupId || null,
            gatewayIds,
            scheduleTime: scheduleTime || null,
        });

        res.status(201).json(campaign);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create SMS campaign';
        res.status(400).json({ error: msg });
    }
};

export const listCampaignsController = (req: Request, res: Response) => {
    const page = Number.parseInt(req.query.page as string, 10) || 1;
    const limit = Number.parseInt(req.query.limit as string, 10) || 10;

    try {
        res.json(listSmsCampaigns(page, limit));
    } catch (error) {
        res.status(500).json({ error: 'Failed to list SMS campaigns' });
    }
};

export const getCampaignController = (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const campaign = getSmsCampaignProgress(id as string);
        if (!campaign) {
            return res.status(404).json({ error: 'SMS campaign not found' });
        }
        res.json(campaign);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load SMS campaign' });
    }
};

export const cancelCampaignController = (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const campaign = cancelSmsCampaign(id as string);
        res.json(campaign);
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to cancel SMS campaign';
        res.status(400).json({ error: msg });
    }
};

