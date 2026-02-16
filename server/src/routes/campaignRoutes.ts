import { Router } from 'express';
import { create, getDetails, list, update } from '../controllers/campaignController.js';

const router = Router();

router.post('/', create);
router.get('/', list);
router.get('/:id', getDetails);
router.put('/:id', update);

export default router;