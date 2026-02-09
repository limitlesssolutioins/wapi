import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES_FILE = path.resolve(__dirname, '../../templates.json');

export interface MessageTemplate {
    id: string;
    name: string;
    content: string;
    createdAt: string;
    updatedAt: string;
}

export const getTemplates = (): MessageTemplate[] => {
    try {
        if (!fs.existsSync(TEMPLATES_FILE)) return [];
        const content = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Error reading templates:', error);
        return [];
    }
};

export const getTemplateById = (id: string): MessageTemplate | undefined => {
    return getTemplates().find(t => t.id === id);
};

export const addTemplate = (name: string, content: string): MessageTemplate => {
    const templates = getTemplates();
    const now = new Date().toISOString();
    const newTemplate: MessageTemplate = {
        id: Math.random().toString(36).substr(2, 9),
        name,
        content,
        createdAt: now,
        updatedAt: now,
    };

    templates.push(newTemplate);

    try {
        fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
        return newTemplate;
    } catch (error) {
        console.error('Error saving template:', error);
        throw error;
    }
};

export const updateTemplate = (id: string, name: string, content: string): MessageTemplate => {
    const templates = getTemplates();
    const index = templates.findIndex(t => t.id === id);
    if (index === -1) throw new Error('Template not found');

    templates[index] = {
        ...templates[index],
        name,
        content,
        updatedAt: new Date().toISOString(),
    };

    try {
        fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(templates, null, 2));
        return templates[index];
    } catch (error) {
        console.error('Error updating template:', error);
        throw error;
    }
};

export const deleteTemplate = (id: string): void => {
    const templates = getTemplates();
    const filtered = templates.filter(t => t.id !== id);
    try {
        fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(filtered, null, 2));
    } catch (error) {
        console.error('Error deleting template:', error);
        throw error;
    }
};
