import { Request, Response } from 'express';
import { getContacts, addContact, addContactsBulk, deleteContact } from '../utils/contacts.js';

export const listContacts = (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string || '').toLowerCase();

    let contacts = getContacts();

    // 1. Filter first (if search exists)
    if (search) {
        contacts = contacts.filter(c => 
            c.name.toLowerCase().includes(search) || 
            c.phone.includes(search)
        );
    }

    // 2. Calculate pagination
    const total = contacts.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    // 3. Slice data
    const paginatedContacts = contacts.slice(startIndex, endIndex);

    res.json({
        data: paginatedContacts,
        meta: {
            total,
            page,
            totalPages,
            limit
        }
    });
};

export const createContact = (req: Request, res: Response) => {
    const { name, phone } = req.body;
    if (!name || !phone) {
        res.status(400).json({ error: 'Name and phone are required' });
        return;
    }
    
    // Auto-clean phone if needed or validate
    const contact = addContact({ name, phone });
    res.json(contact);
};

export const bulkCreate = (req: Request, res: Response): void => {
    const { contacts } = req.body;
    if (!Array.isArray(contacts) || contacts.length === 0) {
        res.status(400).json({ error: 'contacts must be a non-empty array' });
        return;
    }

    const valid = contacts.filter((c: any) => c.name && c.phone);
    if (valid.length === 0) {
        res.status(400).json({ error: 'No valid contacts (each must have name and phone)' });
        return;
    }

    const result = addContactsBulk(valid.map((c: any) => ({ name: String(c.name).trim(), phone: String(c.phone).trim() })));
    res.json({ imported: result.imported.length, duplicates: result.duplicates });
};

export const removeContact = (req: Request, res: Response) => {
    const id = req.params.id as string;
    deleteContact(id);
    res.json({ success: true });
};

export const editContact = (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { name, phone } = req.body;

    if (!name && !phone) {
        res.status(400).json({ error: 'Name or phone required for update' });
        return;
    }

    try {
        const updated = updateContact(id, { name, phone });
        res.json(updated);
    } catch (error) {
        res.status(404).json({ error: 'Contact not found' });
    }
};
