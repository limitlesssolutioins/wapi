import { Router } from 'express';
import { create, getProgress, list } from '../controllers/campaignController.js';

const router = Router();

router.post('/', create);
router.get('/', list);
router.get('/:id', getProgress);

export default router;
