import { 
    Campaign, 
    saveCampaign, 
    getCampaignById as getCampaignFromDb, 
    getCampaigns as listCampaignsFromDb,
    updateCampaignStatus,
    getPendingRecipients,
    updateRecipientStatus
} from '../utils/campaigns.js';
import { getContactById, getAllContacts } from '../utils/contacts.js';
import { campaignQueue } from '../queue/campaignQueue.js';
import { MessageTemplate, getTemplateById } from '../utils/templates.js';

interface CreateCampaignInput {
    name: string;
    templateId: string;
    contactIds: string[];
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
    const { name, templateId, contactIds, sessionIds, scheduleTime } = input;
    
    // 1. Validate Template
    const template = getTemplateById(templateId);
    if (!template) {
        throw new Error('Template not found');
    }
    
    // 2. Fetch contacts (either all or a selection)
    const contactsToProcess = contactIds.length > 0 
        ? contactIds.map(id => getContactById(id)).filter(c => c)
        : getAllContacts();

    if (contactsToProcess.length === 0) {
        throw new Error('No valid contacts found for the campaign');
    }

    // 3. Create recipients list
    const recipients = contactsToProcess.map(c => ({
        contactId: c!.id,
        phone: c!.phone,
        name: c!.name,
    }));

    // 4. Determine initial status
    const status = scheduleTime ? 'QUEUED' : 'PROCESSING';

    const campaignData: Omit<Campaign, 'id' | 'createdAt' | 'stats'> = {
        name,
        templateId,
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