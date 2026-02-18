import db from '../db/index.js';

export interface SmsCampaignRecipient {
    contactId?: string;
    phone: string;
    name: string;
    gatewayId?: string;
    status: 'PENDING' | 'SENT' | 'FAILED';
    error?: string;
    sentAt?: string;
}

export interface SmsCampaign {
    id: string;
    name: string;
    message: string;
    gatewayIds: string[];
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    scheduleTime: string | null;
    stats: {
        total: number;
        sent: number;
        failed: number;
        pending: number;
    };
    createdAt: string;
    completedAt?: string;
    recipients?: SmsCampaignRecipient[];
}

const calculateStats = (recipients: SmsCampaignRecipient[]) => ({
    total: recipients.length,
    sent: recipients.filter((r) => r.status === 'SENT').length,
    failed: recipients.filter((r) => r.status === 'FAILED').length,
    pending: recipients.filter((r) => r.status === 'PENDING').length,
});

export const getSmsCampaigns = (page: number = 1, limit: number = 10): { data: SmsCampaign[]; meta: any } => {
    const offset = (page - 1) * limit;

    const rows = db.prepare(`
        SELECT *,
            (SELECT COUNT(*) FROM sms_campaign_recipients WHERE campaign_id = sms_campaigns.id) as total,
            (SELECT COUNT(*) FROM sms_campaign_recipients WHERE campaign_id = sms_campaigns.id AND status = 'SENT') as sent,
            (SELECT COUNT(*) FROM sms_campaign_recipients WHERE campaign_id = sms_campaigns.id AND status = 'FAILED') as failed
        FROM sms_campaigns
        ORDER BY createdAt DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    const total = (db.prepare('SELECT COUNT(*) as total FROM sms_campaigns').get() as any).total;

    return {
        data: rows.map((c) => ({
            id: c.id,
            name: c.name,
            message: c.message,
            gatewayIds: JSON.parse(c.gatewayIds || '[]'),
            status: c.status,
            scheduleTime: c.scheduleTime,
            createdAt: c.createdAt,
            completedAt: c.completedAt,
            stats: {
                total: c.total,
                sent: c.sent,
                failed: c.failed,
                pending: c.total - c.sent - c.failed,
            },
        })),
        meta: {
            total,
            page,
            totalPages: Math.ceil(total / limit),
        },
    };
};

export const getSmsCampaignById = (id: string): SmsCampaign | undefined => {
    const campaignRow = db.prepare('SELECT * FROM sms_campaigns WHERE id = ?').get(id) as any;
    if (!campaignRow) return undefined;

    const recipients = db.prepare('SELECT * FROM sms_campaign_recipients WHERE campaign_id = ?').all(id) as SmsCampaignRecipient[];

    return {
        id: campaignRow.id,
        name: campaignRow.name,
        message: campaignRow.message,
        gatewayIds: JSON.parse(campaignRow.gatewayIds || '[]'),
        status: campaignRow.status,
        scheduleTime: campaignRow.scheduleTime,
        createdAt: campaignRow.createdAt,
        completedAt: campaignRow.completedAt,
        recipients,
        stats: calculateStats(recipients),
    };
};

export const saveSmsCampaign = (
    campaign: Omit<SmsCampaign, 'id' | 'createdAt' | 'stats'>,
    recipients: Omit<SmsCampaignRecipient, 'status'>[]
): SmsCampaign => {
    const id = `sms_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date().toISOString();

    const insertCampaign = db.prepare(`
        INSERT INTO sms_campaigns (id, name, message, gatewayIds, status, scheduleTime, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertRecipient = db.prepare(`
        INSERT INTO sms_campaign_recipients (campaign_id, contactId, phone, name, gatewayId)
        VALUES (?, ?, ?, ?, ?)
    `);

    db.transaction(() => {
        insertCampaign.run(
            id,
            campaign.name,
            campaign.message,
            JSON.stringify(campaign.gatewayIds),
            campaign.status,
            campaign.scheduleTime,
            now
        );

        for (const recipient of recipients) {
            insertRecipient.run(id, recipient.contactId || null, recipient.phone, recipient.name, recipient.gatewayId || null);
        }
    })();

    return getSmsCampaignById(id)!;
};

export const updateSmsCampaignStatus = (id: string, status: SmsCampaign['status']): void => {
    const completedAt = (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED')
        ? new Date().toISOString()
        : null;

    db.prepare('UPDATE sms_campaigns SET status = ?, completedAt = ? WHERE id = ?').run(status, completedAt, id);
};

export const updateSmsRecipientStatus = (
    campaignId: string,
    phone: string,
    status: 'SENT' | 'FAILED',
    error?: string,
    gatewayId?: string
): void => {
    const sentAt = status === 'SENT' ? new Date().toISOString() : null;

    db.prepare(`
        UPDATE sms_campaign_recipients
        SET status = ?, error = ?, sentAt = ?, gatewayId = ?
        WHERE campaign_id = ? AND phone = ? AND status = 'PENDING'
    `).run(status, error || null, sentAt, gatewayId || null, campaignId, phone);

    const pendingCount = (db.prepare(`
        SELECT COUNT(*) as count
        FROM sms_campaign_recipients
        WHERE campaign_id = ? AND status = 'PENDING'
    `).get(campaignId) as any).count;

    if (pendingCount === 0) {
        updateSmsCampaignStatus(campaignId, 'COMPLETED');
    }
};

export const getPendingSmsRecipients = (campaignId: string): SmsCampaignRecipient[] => {
    return db.prepare(`
        SELECT *
        FROM sms_campaign_recipients
        WHERE campaign_id = ? AND status = 'PENDING'
    `).all(campaignId) as SmsCampaignRecipient[];
};

