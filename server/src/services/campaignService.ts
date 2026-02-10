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

// Functions for the queue processor
export const processCampaign = async (campaignId: string) => {
    const campaign = getCampaignFromDb(campaignId);
    if (!campaign || campaign.status !== 'PROCESSING') {
        console.log(`[Campaign ${campaignId}] Skipping, not in PROCESSING state.`);
        return;
    }

    const template = getTemplateById(campaign.templateId);
    if (!template) {
        updateCampaignStatus(campaignId, 'FAILED');
        console.error(`[Campaign ${campaignId}] Failed: Template not found.`);
        return;
    }

    const pending = getPendingRecipients(campaignId);
    console.log(`[Campaign ${campaignId}] Processing ${pending.length} pending recipients.`);
    
    // TODO: Integrate with whatsappService to send messages
    // This part would be more complex, involving rotation of sessionIds
    for (const recipient of pending) {
        try {
            const message = resolveMessage(template, recipient);
            //const sessionId = campaign.sessionIds[Math.floor(Math.random() * campaign.sessionIds.length)];
            //await waService.sendMessage(sessionId, recipient.phone, message);
            
            // SIMULATING SEND
            await new Promise(res => setTimeout(res, 50)); 
            
            updateRecipientStatus(campaignId, recipient.contactId, 'SENT');
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            updateRecipientStatus(campaignId, recipient.contactId, 'FAILED', msg);
        }
    }
};