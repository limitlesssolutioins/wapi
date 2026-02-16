import { 
    Campaign, 
    saveCampaign, 
    getCampaignById as getCampaignFromDb, 
    getCampaigns as listCampaignsFromDb,
    updateCampaignStatus,
    updateCampaignDetails,
    getPendingRecipients,
    updateRecipientStatus
} from '../utils/campaigns.js';
import { getContactById, getAllContacts, getContacts, Contact } from '../utils/contacts.js';
import { campaignQueue } from '../queue/campaignQueue.js';
import { MessageTemplate, getTemplateById } from '../utils/templates.js';

interface CreateCampaignInput {
    name: string;
    templateId: string;
    imageUrl?: string;
    contactIds: string[];
    groupId?: string | null;
    sessionIds: string[];
    scheduleTime: string | null;
}

// Function to resolve variables in the message
const resolveMessage = (template: MessageTemplate, contact: { name: string, phone: string }): string => {
    return template.content
        .replace(/\{\{name\}\}/g, contact.name)
        .replace(/\{\{phone\}\}/g, contact.phone);
};

export const createCampaign = (input: CreateCampaignInput): Campaign => {
    const { name, templateId, imageUrl, contactIds, groupId, sessionIds, scheduleTime } = input;
    
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

    const campaignData: Omit<Campaign, 'id' | 'createdAt' | 'stats'> = {
        name,
        templateId,
        imageUrl,
        sessionIds,
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

export const updateCampaign = (id: string, updates: Partial<CreateCampaignInput>): void => {
    const campaign = getCampaignFromDb(id);
    if (!campaign) throw new Error('Campaign not found');

    if (campaign.status !== 'QUEUED' && campaign.status !== 'PAUSED') {
        throw new Error('Only QUEUED or PAUSED campaigns can be updated.');
    }

    if (updates.templateId) {
        const template = getTemplateById(updates.templateId);
        if (!template) throw new Error('Template not found');
    }

    updateCampaignDetails(id, {
        name: updates.name,
        templateId: updates.templateId,
        imageUrl: updates.imageUrl,
        sessionIds: updates.sessionIds,
        scheduleTime: updates.scheduleTime
    });
};

export const getCampaignProgress = (id: string) => {
    return getCampaignFromDb(id);
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