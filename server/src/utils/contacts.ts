import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONTACTS_FILE = path.resolve(__dirname, '../../contacts.json');

export interface Contact {
    id: string;
    name: string;
    phone: string;
    tags?: string[];
}

export const getContacts = (): Contact[] => {
    try {
        if (!fs.existsSync(CONTACTS_FILE)) return [];
        const content = fs.readFileSync(CONTACTS_FILE, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error('Error reading contacts:', error);
        return [];
    }
};

export const addContact = (contact: Omit<Contact, 'id'>): Contact => {
    const contacts = getContacts();
    const newContact: Contact = {
        ...contact,
        id: Math.random().toString(36).substr(2, 9)
    };
    
    contacts.push(newContact);
    
    try {
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
        return newContact;
    } catch (error) {
        console.error('Error saving contact:', error);
        throw error;
    }
};

const normalizePhone = (phone: string): string => {
    return phone.replace(/[\s\-\(\)\+]/g, '');
};

export const addContactsBulk = (newContacts: Omit<Contact, 'id'>[]): { imported: Contact[], duplicates: number } => {
    const contacts = getContacts();
    const existingPhones = new Set(contacts.map(c => normalizePhone(c.phone)));

    const imported: Contact[] = [];
    let duplicates = 0;

    for (const entry of newContacts) {
        const normalized = normalizePhone(entry.phone);
        if (existingPhones.has(normalized)) {
            duplicates++;
            continue;
        }
        existingPhones.add(normalized);
        const newContact: Contact = {
            ...entry,
            id: Math.random().toString(36).substr(2, 9)
        };
        imported.push(newContact);
    }

    if (imported.length > 0) {
        try {
            fs.writeFileSync(CONTACTS_FILE, JSON.stringify([...contacts, ...imported], null, 2));
        } catch (error) {
            console.error('Error saving contacts in bulk:', error);
            throw error;
        }
    }

    return { imported, duplicates };
};

export const deleteContact = (id: string): void => {
    const contacts = getContacts();
    const filtered = contacts.filter(c => c.id !== id);
    try {
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify(filtered, null, 2));
    } catch (error) {
        console.error('Error deleting contact:', error);
        throw error;
    }
};

export const updateContact = (id: string, updates: Partial<Omit<Contact, 'id'>>): Contact => {
    const contacts = getContacts();
    const index = contacts.findIndex(c => c.id === id);
    
    if (index === -1) {
        throw new Error('Contact not found');
    }

    const updatedContact = { ...contacts[index], ...updates };
    contacts[index] = updatedContact;

    try {
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
        return updatedContact;
    } catch (error) {
        console.error('Error updating contact:', error);
        throw error;
    }
};
