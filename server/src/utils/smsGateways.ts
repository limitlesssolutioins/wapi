import db from '../db/index.js';

export interface SmsGateway {
    id: string;
    name: string;
    endpoint: string;
    token?: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

const mapGateway = (row: any): SmsGateway => ({
    id: row.id,
    name: row.name,
    endpoint: row.endpoint,
    token: row.token,
    isActive: !!row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
});

export const listSmsGateways = (): SmsGateway[] => {
    const rows = db.prepare('SELECT * FROM sms_gateways ORDER BY createdAt DESC').all() as any[];
    return rows.map(mapGateway);
};

export const getSmsGatewayById = (id: string): SmsGateway | undefined => {
    const row = db.prepare('SELECT * FROM sms_gateways WHERE id = ?').get(id) as any;
    return row ? mapGateway(row) : undefined;
};

export const createSmsGateway = (input: { name: string; endpoint: string; token?: string | null; isActive?: boolean }): SmsGateway => {
    const id = `gw_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO sms_gateways (id, name, endpoint, token, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.name, input.endpoint, input.token || null, input.isActive === false ? 0 : 1, now, now);

    return getSmsGatewayById(id)!;
};

export const updateSmsGateway = (
    id: string,
    updates: Partial<Pick<SmsGateway, 'name' | 'endpoint' | 'isActive'>> & { token?: string | null }
): SmsGateway => {
    const current = getSmsGatewayById(id);
    if (!current) throw new Error('SMS gateway not found.');

    const next = {
        name: updates.name ?? current.name,
        endpoint: updates.endpoint ?? current.endpoint,
        token: updates.token !== undefined ? updates.token : (current.token || null),
        isActive: updates.isActive ?? current.isActive,
    };

    db.prepare(`
        UPDATE sms_gateways
        SET name = ?, endpoint = ?, token = ?, isActive = ?, updatedAt = ?
        WHERE id = ?
    `).run(next.name, next.endpoint, next.token, next.isActive ? 1 : 0, new Date().toISOString(), id);

    return getSmsGatewayById(id)!;
};

export const deleteSmsGateway = (id: string): void => {
    db.prepare('DELETE FROM sms_gateways WHERE id = ?').run(id);
};

