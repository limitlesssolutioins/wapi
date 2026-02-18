import { Router } from 'express';
import { cancel, create, getDetails, list, update } from '../controllers/campaignController.js';

const router = Router();

router.post('/', create);
router.get('/', list);
router.get('/:id', getDetails);
router.put('/:id', update);
router.post('/:id/cancel', cancel);

export default router;
