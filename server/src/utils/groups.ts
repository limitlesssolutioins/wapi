import db from '../db/index.js';

export interface Group {
    id: string;
    name: string;
    contactCount: number;
    created_at: string;
}

export const getGroups = (): Group[] => {
    const stmt = db.prepare(`
        SELECT g.*, (SELECT COUNT(*) FROM contacts WHERE groupId = g.id) as contactCount 
        FROM groups g 
        ORDER BY g.name ASC
    `);
    return stmt.all() as Group[];
};

export const addGroup = (name: string): Group => {
    const id = `grp_${Math.random().toString(36).substr(2, 9)}`;
    const stmt = db.prepare('INSERT INTO groups (id, name) VALUES (?, ?)');
    stmt.run(id, name);
    return { id, name, contactCount: 0, created_at: new Date().toISOString() };
};

export const deleteGroup = (id: string): void => {
    // Note: contacts.groupId will be set to NULL due to ON DELETE SET NULL
    db.prepare('DELETE FROM groups WHERE id = ?').run(id);
};

export const assignContactsToGroup = (contactIds: string[], groupId: string | null): void => {
    const stmt = db.prepare('UPDATE contacts SET groupId = ? WHERE id = ?');
    const transaction = db.transaction((ids: string[]) => {
        for (const id of ids) {
            stmt.run(groupId, id);
        }
    });
    transaction(contactIds);
};
