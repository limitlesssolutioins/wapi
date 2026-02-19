import { Router } from 'express';
import { addSession, cancel, create, getDetails, list, pause, removeSession, resume, update } from '../controllers/campaignController.js';

const router = Router();

router.post('/', create);
router.get('/', list);
router.get('/:id', getDetails);
router.put('/:id', update);
router.post('/:id/cancel', cancel);
router.post('/:id/pause', pause);
router.post('/:id/resume', resume);
router.post('/:id/sessions', addSession);
router.delete('/:id/sessions/:sessionId', removeSession);

export default router;
