import db from '../db/index.js';

export interface Contact {
    id: string;
    name: string;
    phone: string;
    groupId?: string | null;
    created_at?: string;
}

export const getContacts = (
    page: number = 1, 
    limit: number = 20, 
    search: string = '', 
    groupId: string | null | 'unassigned' = 'unassigned'
): { data: Contact[], total: number } => {
    const offset = (page - 1) * limit;
    let query = 'SELECT * FROM contacts WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as total FROM contacts WHERE 1=1';
    const params: any[] = [];

    if (groupId === 'unassigned') {
        query += " AND (groupId IS NULL OR groupId = '')";
        countQuery += " AND (groupId IS NULL OR groupId = '')";
    } else if (groupId) {
        query += ' AND groupId = ?';
        countQuery += ' AND groupId = ?';
        params.push(groupId);
    }

    if (search) {
        const term = `%${search}%`;
        query += ' AND (name LIKE ? OR phone LIKE ?)';
        countQuery += ' AND (name LIKE ? OR phone LIKE ?)';
        params.push(term, term);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    
    const stmt = db.prepare(query);
    const data = stmt.all(...params, limit, offset) as Contact[];

    const countStmt = db.prepare(countQuery);
    const total = (countStmt.get(...params) as any).total;

    return { data, total };
};

export const getAllContacts = (): Contact[] => {
    return db.prepare('SELECT * FROM contacts').all() as Contact[];
}

export const getContactById = (id: string): Contact | undefined => {
    return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Contact | undefined;
};

export const addContact = (contact: { name: string, phone: string }): Contact => {
    const id = Math.random().toString(36).substr(2, 9);
    const stmt = db.prepare('INSERT INTO contacts (id, name, phone) VALUES (?, ?, ?)');
    stmt.run(id, contact.name, contact.phone);
    return { id, ...contact };
};

const normalizePhone = (phone: string): string => {
    return phone.replace(/[\s\-\(\)\+]/g, '');
};

export const addContactsBulk = (newContacts: { name: string, phone: string }[]): { imported: Contact[], duplicates: number } => {
    const insert = db.prepare('INSERT OR IGNORE INTO contacts (id, name, phone) VALUES (?, ?, ?)');
    const check = db.prepare('SELECT 1 FROM contacts WHERE phone = ?');

    let imported: Contact[] = [];
    let duplicates = 0;

    const transaction = db.transaction((contacts: { name: string, phone: string }[]) => {
        for (const contact of contacts) {
            const normalized = normalizePhone(contact.phone);
            if (check.get(normalized)) {
                duplicates++;
                continue;
            }
            const id = Math.random().toString(36).substr(2, 9);
            insert.run(id, contact.name, normalized);
            imported.push({ id, name: contact.name, phone: normalized });
        }
    });

    transaction(newContacts);

    return { imported, duplicates };
};

export const deleteContact = (id: string): void => {
    db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
};

export const deleteContactsBulk = (ids: string[]): void => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM contacts WHERE id IN (${placeholders})`).run(...ids);
};

export const deleteAllContactsByFilter = (groupId: string | 'unassigned' | null, search: string): number => {
    let query = 'DELETE FROM contacts WHERE 1=1';
    const params: any[] = [];

    if (groupId === 'unassigned') {
        query += " AND (groupId IS NULL OR groupId = '')";
    } else if (groupId) {
        query += ' AND groupId = ?';
        params.push(groupId);
    }

    if (search) {
        const term = `%${search}%`;
        query += ' AND (name LIKE ? OR phone LIKE ?)';
        params.push(term, term);
    }

    const result = db.prepare(query).run(...params);
    return result.changes;
};

export const updateContact = (id: string, updates: Partial<Omit<Contact, 'id'>>): Contact => {
    const current = getContactById(id);
    if (!current) throw new Error('Contact not found');

    const updated = { ...current, ...updates };
    db.prepare('UPDATE contacts SET name = ?, phone = ? WHERE id = ?').run(updated.name, updated.phone, id);
    return updated;
};