import { Router } from 'express';
import { create, getDetails, list } from '../controllers/campaignController.js';

const router = Router();

router.post('/', create);
router.get('/', list);
router.get('/:id', getDetails);

export default router;