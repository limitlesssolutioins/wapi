import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CAMPAIGNS_FILE = path.resolve(__dirname, '../../campaigns.json');

export interface CampaignRecipient {
    contactId: string;
    phone: string;
    name: string;
    status: 'PENDING' | 'SENT' | 'FAILED';
    error?: string;
    sentAt?: string;
}

export interface Campaign {
    id: string;
    sessionId?: string; // Deprecated, keep for backward compatibility
    sessionIds: string[]; // New: List of sessions to rotate
    message: string;
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED';
    recipients: CampaignRecipient[];
    totalCount: number;
    sentCount: number;
    failedCount: number;
    createdAt: string;
    completedAt?: string;
}

export const getCampaigns = (): Campaign[] => {
    try {
        if (!fs.existsSync(CAMPAIGNS_FILE)) return [];
        const content = fs.readFileSync(CAMPAIGNS_FILE, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Error reading campaigns:', error);
        return [];
    }
};

export const getCampaignById = (id: string): Campaign | undefined => {
    const campaigns = getCampaigns();
    return campaigns.find(c => c.id === id);
};

export const saveCampaign = (campaign: Campaign): Campaign => {
    const campaigns = getCampaigns();
    campaigns.push(campaign);
    try {
        fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2));
        return campaign;
    } catch (error) {
        console.error('Error saving campaign:', error);
        throw error;
    }
};

export const updateCampaign = (campaign: Campaign): void => {
    const campaigns = getCampaigns();
    const index = campaigns.findIndex(c => c.id === campaign.id);
    if (index === -1) throw new Error(`Campaign ${campaign.id} not found`);
    campaigns[index] = campaign;
    try {
        fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2));
    } catch (error) {
        console.error('Error updating campaign:', error);
        throw error;
    }
};

export const updateRecipientStatus = (
    campaignId: string,
    contactId: string,
    status: 'SENT' | 'FAILED',
    error?: string
): void => {
    const campaigns = getCampaigns();
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;

    const recipient = campaign.recipients.find(r => r.contactId === contactId);
    if (!recipient) return;

    recipient.status = status;
    if (error) recipient.error = error;
    if (status === 'SENT') recipient.sentAt = new Date().toISOString();

    if (status === 'SENT') campaign.sentCount++;
    if (status === 'FAILED') campaign.failedCount++;

    const allDone = campaign.recipients.every(r => r.status !== 'PENDING');
    if (allDone) {
        campaign.status = 'COMPLETED';
        campaign.completedAt = new Date().toISOString();
    }

    const index = campaigns.findIndex(c => c.id === campaignId);
    campaigns[index] = campaign;
    try {
        fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2));
    } catch (error) {
        console.error('Error updating recipient status:', error);
    }
};
