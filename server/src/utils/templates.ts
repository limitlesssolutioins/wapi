import db from '../db/index.js';

export interface MessageTemplate {
    id: string;
    name: string;
    content: string;
    created_at: string;
    updated_at: string;
}

export const getTemplates = (): MessageTemplate[] => {
    try {
        const stmt = db.prepare('SELECT * FROM templates ORDER BY created_at DESC');
        return stmt.all() as MessageTemplate[];
    } catch (error) {
        console.error('Error reading templates:', error);
        return [];
    }
};

export const getTemplateById = (id: string): MessageTemplate | undefined => {
    try {
        const stmt = db.prepare('SELECT * FROM templates WHERE id = ?');
        return stmt.get(id) as MessageTemplate | undefined;
    } catch (error) {
        console.error(`Error reading template ${id}:`, error);
        return undefined;
    }
};

export const addTemplate = (name: string, content: string): MessageTemplate => {
    const now = new Date().toISOString();
    const newTemplate: MessageTemplate = {
        id: `tpl_${Math.random().toString(36).substr(2, 9)}`,
        name,
        content,
        created_at: now,
        updated_at: now,
    };

    try {
        const stmt = db.prepare('INSERT INTO templates (id, name, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
        stmt.run(newTemplate.id, newTemplate.name, newTemplate.content, newTemplate.created_at, newTemplate.updated_at);
        return newTemplate;
    } catch (error) {
        console.error('Error saving template:', error);
        throw error;
    }
};

export const updateTemplate = (id: string, name: string, content: string): MessageTemplate => {
    const updatedAt = new Date().toISOString();
    try {
        const stmt = db.prepare('UPDATE templates SET name = ?, content = ?, updated_at = ? WHERE id = ?');
        const result = stmt.run(name, content, updatedAt, id);

        if (result.changes === 0) {
            throw new Error('Template not found');
        }
        
        return getTemplateById(id)!;
    } catch (error) {
        console.error('Error updating template:', error);
        throw error;
    }
};

export const deleteTemplate = (id: string): void => {
    try {
        const stmt = db.prepare('DELETE FROM templates WHERE id = ?');
        stmt.run(id);
    } catch (error) {
        console.error('Error deleting template:', error);
        throw error;
    }
};