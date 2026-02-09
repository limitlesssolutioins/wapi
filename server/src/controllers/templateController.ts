import { Request, Response } from 'express';
import { getTemplates, addTemplate, updateTemplate, deleteTemplate } from '../utils/templates.js';

export const list = (_req: Request, res: Response) => {
    res.json(getTemplates());
};

export const create = (req: Request, res: Response) => {
    const { name, content } = req.body;

    if (!name || !content) {
        res.status(400).json({ error: 'name and content are required' });
        return;
    }

    try {
        const template = addTemplate(name, content);
        res.json(template);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: msg });
    }
};

export const update = (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { name, content } = req.body;

    if (!name || !content) {
        res.status(400).json({ error: 'name and content are required' });
        return;
    }

    try {
        const template = updateTemplate(id, name, content);
        res.json(template);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(404).json({ error: msg });
    }
};

export const remove = (req: Request, res: Response) => {
    const id = req.params.id as string;
    try {
        deleteTemplate(id);
        res.json({ success: true });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: msg });
    }
};
