import { Router } from 'express';
import { listContacts, createContact, bulkCreate, removeContact, editContact, deleteContactsBatch } from '../controllers/contactController.js';

const router = Router();

router.get('/', listContacts);
router.post('/bulk', bulkCreate);
router.post('/delete-batch', deleteContactsBatch);
router.post('/', createContact);
router.put('/:id', editContact);
router.delete('/:id', removeContact);

export default router;
