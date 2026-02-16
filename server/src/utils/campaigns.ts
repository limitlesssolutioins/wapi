import db from '../db/index.js';

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
    sessionIds: string[]; // Stored as JSON in DB
    name: string; // The campaign name
    templateId: string;
    imageUrl?: string;
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'PAUSED' | 'FAILED';
    scheduleTime: string | null;
    stats: {
        total: number;
        sent: number;
        failed: number;
        pending: number;
    };
    createdAt: string;
    completedAt?: string;
    recipients?: CampaignRecipient[]; // For detailed view, not always loaded
}

// Helper to calculate stats from recipients
const calculateStats = (recipients: CampaignRecipient[]) => {
    return {
        total: recipients.length,
        sent: recipients.filter(r => r.status === 'SENT').length,
        failed: recipients.filter(r => r.status === 'FAILED').length,
        pending: recipients.filter(r => r.status === 'PENDING').length,
    };
};

export const getCampaigns = (page: number = 1, limit: number = 10): { data: Campaign[], meta: any } => {
    const offset = (page - 1) * limit;

    const campaignsQuery = db.prepare(`
        SELECT *, 
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = campaigns.id) as total,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = campaigns.id AND status = 'SENT') as sent,
            (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = campaigns.id AND status = 'FAILED') as failed
        FROM campaigns 
        ORDER BY createdAt DESC 
        LIMIT ? OFFSET ?
    `);

    const rawCampaigns = campaignsQuery.all(limit, offset);
    
    const countQuery = db.prepare('SELECT COUNT(*) as total FROM campaigns');
    const total = (countQuery.get() as any).total;
    const totalPages = Math.ceil(total / limit);
    
    const data = rawCampaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        templateId: c.templateId,
        imageUrl: c.imageUrl,
        sessionIds: JSON.parse(c.sessionIds || '[]'), // Ensure sessionIds is parsed here
        status: c.status,
        scheduleTime: c.scheduleTime,
        createdAt: c.createdAt,
        stats: {
            total: c.total,
            sent: c.sent,
            failed: c.failed,
            pending: c.total - c.sent - c.failed
        }
    }));

    return {
        data,
        meta: {
            total,
            page,
            totalPages
        }
    };
};

export const getCampaignById = (id: string): Campaign | undefined => {
    const campaignRow = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as any;
    if (!campaignRow) return undefined;

    const recipients = db.prepare('SELECT * FROM campaign_recipients WHERE campaign_id = ?').all(id) as CampaignRecipient[];
    
    return {
        id: campaignRow.id,
        name: campaignRow.name,
        templateId: campaignRow.templateId,
        imageUrl: campaignRow.imageUrl,
        sessionIds: JSON.parse(campaignRow.sessionIds || '[]'),
        status: campaignRow.status,
        scheduleTime: campaignRow.scheduleTime,
        createdAt: campaignRow.createdAt,
        completedAt: campaignRow.completedAt,
        recipients: recipients,
        stats: calculateStats(recipients)
    };
};

export const saveCampaign = (campaign: Omit<Campaign, 'id' | 'createdAt' | 'stats'>, recipients: Omit<CampaignRecipient, 'status'>[]): Campaign => {
    const id = `camp_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const insertCampaign = db.prepare(`
        INSERT INTO campaigns (id, name, templateId, imageUrl, sessionIds, status, scheduleTime, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertRecipient = db.prepare(`
        INSERT INTO campaign_recipients (campaign_id, contactId, phone, name)
        VALUES (?, ?, ?, ?)
    `);

    db.transaction(() => {
        insertCampaign.run(
            id,
            campaign.name,
            campaign.templateId,
            campaign.imageUrl || null,
            JSON.stringify(campaign.sessionIds),
            campaign.status,
            campaign.scheduleTime,
            now
        );
        for (const r of recipients) {
            insertRecipient.run(id, r.contactId, r.phone, r.name);
        }
    })();
    
    return getCampaignById(id)!;
};

export const updateCampaignStatus = (id: string, status: Campaign['status']): void => {
    const completedAt = (status === 'COMPLETED' || status === 'FAILED') ? new Date().toISOString() : null;
    db.prepare('UPDATE campaigns SET status = ?, completedAt = ? WHERE id = ?').run(status, completedAt, id);
};

export const updateCampaignDetails = (id: string, updates: Partial<Pick<Campaign, 'name' | 'templateId' | 'imageUrl' | 'sessionIds' | 'scheduleTime'>>): void => {
    const sets: string[] = [];
    const params: any[] = [];

    if (updates.name !== undefined) { sets.push('name = ?'); params.push(updates.name); }
    if (updates.templateId !== undefined) { sets.push('templateId = ?'); params.push(updates.templateId); }
    if (updates.imageUrl !== undefined) { sets.push('imageUrl = ?'); params.push(updates.imageUrl); }
    if (updates.sessionIds !== undefined) { sets.push('sessionIds = ?'); params.push(JSON.stringify(updates.sessionIds)); }
    if (updates.scheduleTime !== undefined) { sets.push('scheduleTime = ?'); params.push(updates.scheduleTime); }

    if (sets.length === 0) return;

    params.push(id);
    db.prepare(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`).run(...params);
};

export const updateRecipientStatus = (
    campaignId: string,
    contactId: string,
    status: 'SENT' | 'FAILED',
    error?: string
): void => {
    const sentAt = status === 'SENT' ? new Date().toISOString() : null;
    db.prepare(`
        UPDATE campaign_recipients 
        SET status = ?, error = ?, sentAt = ? 
        WHERE campaign_id = ? AND contactId = ?
    `).run(status, error, sentAt, campaignId, contactId);

    // Check if campaign is complete
    const pendingCount = (db.prepare(`
        SELECT COUNT(*) as count 
        FROM campaign_recipients 
        WHERE campaign_id = ? AND status = 'PENDING'
    `).get(campaignId) as any).count;

    if (pendingCount === 0) {
        updateCampaignStatus(campaignId, 'COMPLETED');
    }
};

export const getPendingRecipients = (campaignId: string): CampaignRecipient[] => {
    return db.prepare(`
        SELECT * FROM campaign_recipients WHERE campaign_id = ? AND status = 'PENDING'
    `).all(campaignId) as CampaignRecipient[];
};
