import { Router } from 'express';
import { list, create, remove, assign, moveAll } from '../controllers/groupController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', protect, list);
router.post('/', protect, create);
router.delete('/:id', protect, remove);
router.post('/assign', protect, assign);
router.post('/move-all', protect, moveAll);

export default router;
