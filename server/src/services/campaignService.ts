import { Campaign, CampaignRecipient, saveCampaign, getCampaigns, getCampaignById } from '../utils/campaigns.js';
import { getContacts } from '../utils/contacts.js';
import { campaignQueue } from '../queue/campaignQueue.js';

export const createCampaign = (sessionIds: string[], message: string, contactIds: string[]): Campaign => {
    const allContacts = getContacts();
    const selected = allContacts.filter(c => contactIds.includes(c.id));

    if (selected.length === 0) {
        throw new Error('No valid contacts found for the given IDs');
    }

    const recipients: CampaignRecipient[] = selected.map(c => ({
        contactId: c.id,
        phone: c.phone,
        name: c.name,
        status: 'PENDING' as const,
    }));

    const campaign: Campaign = {
        id: Math.random().toString(36).substr(2, 9),
        sessionIds, // Store all sessions
        sessionId: sessionIds[0], // Primary for backward compat
        message,
        status: 'QUEUED',
        recipients,
        totalCount: recipients.length,
        sentCount: 0,
        failedCount: 0,
        createdAt: new Date().toISOString(),
    };

    saveCampaign(campaign);

    // Enqueue for async processing (does not block)
    campaignQueue.enqueue(campaign.id);

    return campaign;
};

export const getCampaignProgress = (id: string) => {
    return getCampaignById(id);
};

export const listCampaigns = () => {
    return getCampaigns().map(c => ({
        id: c.id,
        sessionId: c.sessionId,
        status: c.status,
        totalCount: c.totalCount,
        sentCount: c.sentCount,
        failedCount: c.failedCount,
        createdAt: c.createdAt,
        completedAt: c.completedAt,
        messagePreview: c.message.substring(0, 60) + (c.message.length > 60 ? '...' : ''),
    }));
};
