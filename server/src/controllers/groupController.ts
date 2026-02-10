import { Request, Response } from 'express';
import * as groupUtils from '../utils/groups.js';

export const list = (_req: Request, res: Response) => {
    try {
        const groups = groupUtils.getGroups();
        res.json(groups);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener grupos' });
    }
};

export const create = (req: Request, res: Response) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre es requerido' });
    try {
        const group = groupUtils.addGroup(name);
        res.status(201).json(group);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear grupo' });
    }
};

export const remove = (req: Request, res: Response) => {
    const id = req.params.id as string;
    try {
        groupUtils.deleteGroup(id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar grupo' });
    }
};

export const assign = (req: Request, res: Response) => {
    const { contactIds, groupId } = req.body;
    if (!contactIds || !Array.isArray(contactIds)) {
        return res.status(400).json({ error: 'contactIds debe ser un array' });
    }
    try {
        groupUtils.assignContactsToGroup(contactIds, groupId || null);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error al asignar contactos' });
    }
};

export const moveAll = (req: Request, res: Response) => {
    const { targetGroupId, currentGroupId, search } = req.body;
    try {
        const affected = groupUtils.moveFilteredToGroup(
            targetGroupId === 'unassigned' ? null : targetGroupId, 
            currentGroupId, 
            search || ''
        );
        res.json({ success: true, affected });
    } catch (error) {
        res.status(500).json({ error: 'Error en movimiento masivo' });
    }
};
