import {
    Campaign,
    saveCampaign,
    getCampaignById as getCampaignFromDb,
    getCampaigns as listCampaignsFromDb,
    updateCampaignStatus,
    updateCampaignDetails,
    CampaignSessionData
} from '../utils/campaigns.js';
import { getContactById, getAllContacts, getContacts, Contact } from '../utils/contacts.js';
import { campaignQueue } from '../queue/campaignQueue.js';
import { getTemplateById } from '../utils/templates.js';
import { waService } from './whatsappService.js';

interface CreateCampaignInput {
    name: string;
    templateId: string;
    imageUrl?: string;
    blitzMode?: boolean;
    contactIds: string[];
    groupId?: string | null;
    sessionIds?: string[]; // Old way, kept for compatibility if needed
    sessions?: CampaignSessionData[]; // New way to pass sessions with proxy
    scheduleTime: string | null;
    proxyUrl?: string | null; // Proxy URL for a *single* session if passed via old sessionId
}

export const createCampaign = (input: CreateCampaignInput): Campaign => {
    const { name, templateId, imageUrl, blitzMode, contactIds, groupId, sessionIds, sessions, scheduleTime, proxyUrl } = input;

    let finalSessions: CampaignSessionData[] = [];

    if (sessions && Array.isArray(sessions) && sessions.length > 0) {
        finalSessions = sessions.filter(s => waService.isValidSessionId(s.id));
    } else if (sessionIds && Array.isArray(sessionIds) && sessionIds.length > 0) {
        // Fallback for old `sessionIds` array, apply a single `proxyUrl` if provided
        finalSessions = sessionIds
            .map((id) => ({ id: (id || '').trim(), proxyUrl: proxyUrl || null }))
            .filter(s => waService.isValidSessionId(s.id));
    }
    
    if (finalSessions.length === 0) {
        throw new Error('At least one valid session ID is required.');
    }

    // 1. Validate Template
    const template = getTemplateById(templateId);
    if (!template) {
        throw new Error('Template not found');
    }
    
    // 2. Fetch contacts (either from groupId, manual selection, or all)
    let contactsToProcess;
    
    if (groupId) {
        // Fetch all contacts from a specific group
        const { data } = getContacts(1, 100000, '', groupId);
        contactsToProcess = data;
    } else if (contactIds.length > 0) {
        contactsToProcess = contactIds.map(id => getContactById(id)).filter(c => c);
    } else {
        contactsToProcess = getAllContacts();
    }

    if (!contactsToProcess || contactsToProcess.length === 0) {
        throw new Error('No valid contacts found for the campaign');
    }

    // 3. Create recipients list
    const recipients = (contactsToProcess as Contact[]).map((c: Contact) => ({
        contactId: c.id,
        phone: c.phone,
        name: c.name,
    }));

    // 4. Determine initial status
    const status = scheduleTime ? 'QUEUED' : 'PROCESSING';

    const campaignData: Omit<Campaign, 'id' | 'createdAt' | 'stats' | 'recipients'> = {
        name,
        templateId,
        imageUrl,
        blitzMode: blitzMode ?? false,
        sessions: finalSessions, // Use the new sessions array
        status,
        scheduleTime,
    };

    // 5. Save to DB
    const campaign = saveCampaign(campaignData, recipients);

    // 6. Enqueue for immediate processing if not scheduled
    if (status === 'PROCESSING') {
        campaignQueue.enqueue(campaign.id);
    }
    // (A separate scheduler would handle `scheduleTime`)

    return campaign;
};

export const updateCampaign = (id: string, updates: Partial<Omit<CreateCampaignInput, 'sessionId' | 'sessionIds' | 'proxyUrl'>> & { sessions?: CampaignSessionData[] }): void => {
    const campaign = getCampaignFromDb(id);
    if (!campaign) throw new Error('Campaign not found');

    if (campaign.status !== 'QUEUED' && campaign.status !== 'PAUSED') {
        throw new Error('Only QUEUED or PAUSED campaigns can be updated.');
    }

    if (updates.templateId) {
        const template = getTemplateById(updates.templateId);
        if (!template) throw new Error('Template not found');
    }

    let updatedSessions: CampaignSessionData[] | undefined;
    if (updates.sessions) {
        updatedSessions = updates.sessions.filter(s => waService.isValidSessionId(s.id));
        if (updatedSessions.length === 0) {
            throw new Error('At least one valid session ID is required.');
        }
    }

    updateCampaignDetails(id, {
        name: updates.name,
        templateId: updates.templateId,
        imageUrl: updates.imageUrl,
        sessions: updatedSessions, // Use the new sessions array
        scheduleTime: updates.scheduleTime
    });
};

export const getCampaignProgress = (id: string) => {
    const campaign = getCampaignFromDb(id);
    if (!campaign) return undefined;

    const runtime = campaignQueue.getRuntimeMetrics(id);
    return {
        ...campaign,
        runtimeBySession: runtime?.bySession,
        runtime
    };
};

export const pauseCampaign = (id: string): Campaign => {
    const campaign = getCampaignFromDb(id);
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status !== 'PROCESSING') {
        throw new Error('Only PROCESSING campaigns can be paused');
    }
    updateCampaignStatus(id, 'PAUSED');
    // Workers check campaign status every 500ms during delays and will stop automatically
    return getCampaignFromDb(id)!;
};

export const resumeCampaign = (id: string): Campaign => {
    const campaign = getCampaignFromDb(id);
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status !== 'PAUSED') {
        throw new Error('Only PAUSED campaigns can be resumed');
    }
    updateCampaignStatus(id, 'PROCESSING');
    campaignQueue.enqueue(id);
    return getCampaignFromDb(id)!;
};

export const cancelCampaign = (id: string): Campaign => {
    const campaign = getCampaignFromDb(id);
    if (!campaign) {
        throw new Error('Campaign not found');
    }

    if (campaign.status === 'COMPLETED' || campaign.status === 'FAILED' || campaign.status === 'CANCELLED') {
        throw new Error(`Campaign cannot be cancelled from status ${campaign.status}.`);
    }

    updateCampaignStatus(id, 'CANCELLED');
    return getCampaignFromDb(id)!;
};

export const addSessionToCampaign = (campaignId: string, sessionId: string, proxyUrl?: string | null): void => {
    const campaign = getCampaignFromDb(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const terminalStatuses = ['COMPLETED', 'CANCELLED', 'FAILED'];
    if (terminalStatuses.includes(campaign.status)) {
        throw new Error('Cannot modify a completed, cancelled or failed campaign');
    }

    const trimmed = (sessionId || '').trim();
    if (!waService.isValidSessionId(trimmed)) {
        throw new Error('Invalid session ID');
    }

    if (campaign.sessions.some(s => s.id === trimmed)) {
        throw new Error('Session already assigned to this campaign');
    }

    const newSessionData: CampaignSessionData = { id: trimmed, proxyUrl: proxyUrl || null };
    const newSessions = [...campaign.sessions, newSessionData];
    updateCampaignDetails(campaignId, { sessions: newSessions });

    // If the campaign is actively processing, spawn a new worker immediately
    if (campaign.status === 'PROCESSING') {
        campaignQueue.addSessionToCampaign(campaignId, newSessionData); // Pass the full session data
    }
};

export const removeSessionFromCampaign = (campaignId: string, sessionId: string): void => {
    const campaign = getCampaignFromDb(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const terminalStatuses = ['COMPLETED', 'CANCELLED', 'FAILED'];
    if (terminalStatuses.includes(campaign.status)) {
        throw new Error('Cannot modify a completed, cancelled or failed campaign');
    }

    if (!campaign.sessions.some(s => s.id === sessionId)) {
        throw new Error('Session not found in this campaign');
    }

    if (campaign.sessions.length <= 1) {
        throw new Error('Cannot remove the last session from a campaign');
    }

    const newSessions = campaign.sessions.filter((s) => s.id !== sessionId);
    updateCampaignDetails(campaignId, { sessions: newSessions });
    // The queue worker for this session will detect the removal on its next loop iteration
};

export const listCampaigns = (page: number, limit: number) => {
    return listCampaignsFromDb(page, limit);
};

export const recoverCampaigns = () => {
    try {
        const campaigns = listCampaignsFromDb(1, 100).data;
        const pending = campaigns.filter(c => c.status === 'PROCESSING' || c.status === 'QUEUED');
        console.log(`[Recovery] Found ${pending.length} pending campaigns to resume.`);
        pending.forEach(c => {
            campaignQueue.enqueue(c.id);
        });
    } catch (error) {
        console.error('Failed to recover campaigns:', error);
    }
};
