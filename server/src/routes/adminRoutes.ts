import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { listAllCampaigns, getCampaignRecipients, setCampaignStatus, setRecipientStatus, resetFailed } from '../controllers/adminController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin-panel-2024';

if (!process.env.ADMIN_SECRET) {
    console.warn('[Admin] WARNING: ADMIN_SECRET not set in .env. Using default key. Set it before going to production.');
}

// Auth middleware for API routes
const requireKey = (req: Request, res: Response, next: NextFunction): void => {
    const key = req.headers['x-admin-key'] as string || req.query.key as string;
    if (key !== ADMIN_SECRET) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
};

// Serve the HTML panel (key checked inside the page itself via JS)
router.get('/', (_req: Request, res: Response) => {
    res.sendFile(path.resolve(__dirname, '../../../views/admin.html'));
});

// Protected JSON API
router.get('/campaigns', requireKey, listAllCampaigns);
router.get('/campaigns/:id/recipients', requireKey, getCampaignRecipients);
router.put('/campaigns/:id/status', requireKey, setCampaignStatus);
router.post('/campaigns/:id/reset-failed', requireKey, resetFailed);
router.put('/recipients/:recipientId', requireKey, setRecipientStatus);

export default router;
