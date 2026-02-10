import { Request, Response } from 'express';
import { getTemplates, addTemplate, updateTemplate, deleteTemplate } from '../utils/templates.js';

export const list = (_req: Request, res: Response) => {
    try {
        const templates = getTemplates();
        res.json(templates);
    } catch (error) {
        console.error('Failed to list templates:', error);
        res.status(500).json({ error: 'Failed to retrieve templates' });
    }
};

export const create = (req: Request, res: Response) => {
    const { name, content } = req.body;

    if (!name || !content) {
        return res.status(400).json({ error: 'Name and content are required' });
    }

    try {
        const template = addTemplate(name, content);
        res.status(201).json(template);
    } catch (error) {
        console.error('Failed to create template:', error);
        res.status(500).json({ error: 'Failed to create template' });
    }
};

export const update = (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, content } = req.body;

    if (!name || !content) {
        return res.status(400).json({ error: 'Name and content are required' });
    }

    try {
        const template = updateTemplate(id, name, content);
        res.json(template);
    } catch (error) {
        console.error(`Failed to update template ${id}:`, error);
        // Check if it was a 'not found' error
        if (error instanceof Error && error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to update template' });
    }
};

export const remove = (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        deleteTemplate(id);
        res.status(204).send(); // 204 No Content is appropriate for a successful deletion
    } catch (error) {
        console.error(`Failed to delete template ${id}:`, error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
};