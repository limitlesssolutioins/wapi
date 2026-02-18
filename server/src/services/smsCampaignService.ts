import { getAllContacts, getContactById, getContacts, Contact } from '../utils/contacts.js';
import {
    getSmsCampaignById,
    getSmsCampaigns,
    saveSmsCampaign,
    SmsCampaign,
    updateSmsCampaignStatus,
} from '../utils/smsCampaigns.js';
import { getSmsGateway } from './smsGatewayService.js';
import { smsCampaignQueue } from '../queue/smsCampaignQueue.js';

interface CreateSmsCampaignInput {
    name: string;
    message: string;
    contactIds: string[];
    groupId?: string | null;
    gatewayIds: string[];
    scheduleTime: string | null;
}

const normalizeGatewayIds = (ids: string[]): string[] => {
    const unique = Array.from(new Set((ids || []).map((s) => (s || '').trim()).filter(Boolean)));
    return unique.filter((id) => {
        const gateway = getSmsGateway(id);
        return !!gateway && gateway.isActive;
    });
};

export const createSmsCampaign = (input: CreateSmsCampaignInput): SmsCampaign => {
    const { name, message, contactIds, groupId, gatewayIds, scheduleTime } = input;

    const finalGatewayIds = normalizeGatewayIds(gatewayIds);
    if (finalGatewayIds.length === 0) {
        throw new Error('At least one active gateway is required.');
    }

    let contactsToProcess: Contact[] = [];
    if (groupId) {
        const { data } = getContacts(1, 100000, '', groupId);
        contactsToProcess = data;
    } else if (contactIds.length > 0) {
        contactsToProcess = contactIds.map((id) => getContactById(id)).filter(Boolean) as Contact[];
    } else {
        contactsToProcess = getAllContacts();
    }

    if (!contactsToProcess.length) {
        throw new Error('No valid contacts found for this SMS campaign.');
    }

    const recipients = contactsToProcess.map((c) => ({
        contactId: c.id,
        phone: c.phone,
        name: c.name,
    }));

    const status: SmsCampaign['status'] = scheduleTime ? 'QUEUED' : 'PROCESSING';

    const campaign = saveSmsCampaign(
        {
            name,
            message,
            gatewayIds: finalGatewayIds,
            status,
            scheduleTime,
        },
        recipients
    );

    if (status === 'PROCESSING') {
        smsCampaignQueue.enqueue(campaign.id);
    }

    return campaign;
};

export const getSmsCampaignProgress = (id: string) => {
    const campaign = getSmsCampaignById(id);
    if (!campaign) return undefined;

    const runtime = smsCampaignQueue.getRuntimeMetrics(id);
    return {
        ...campaign,
        runtimeByGateway: runtime?.byGateway,
        runtime,
    };
};

export const listSmsCampaigns = (page: number, limit: number) => getSmsCampaigns(page, limit);

export const cancelSmsCampaign = (id: string): SmsCampaign => {
    const campaign = getSmsCampaignById(id);
    if (!campaign) throw new Error('SMS campaign not found.');

    if (campaign.status === 'COMPLETED' || campaign.status === 'FAILED' || campaign.status === 'CANCELLED') {
        throw new Error(`SMS campaign cannot be cancelled from status ${campaign.status}.`);
    }

    updateSmsCampaignStatus(id, 'CANCELLED');
    return getSmsCampaignById(id)!;
};

export const recoverSmsCampaigns = () => {
    try {
        const campaigns = getSmsCampaigns(1, 200).data;
        const pending = campaigns.filter((c) => c.status === 'PROCESSING' || c.status === 'QUEUED');
        console.log(`[SMS Recovery] Found ${pending.length} pending SMS campaigns to resume.`);
        pending.forEach((c) => smsCampaignQueue.enqueue(c.id));
    } catch (error) {
        console.error('Failed to recover SMS campaigns:', error);
    }
};
