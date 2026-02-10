import { Router } from 'express';
import { updateUserSettings } from '../services/userService.js';

const router = Router();

// Protected route to change user credentials
router.put('/credentials', (req, res) => {
    const userId = req.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: User ID not found in token' });
    }

    const { currentPassword, newUsername, newPassword } = req.body;

    if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required' });
    }

    if (!newUsername && !newPassword) {
        return res.status(400).json({ error: 'New username or new password must be provided' });
    }

    try {
        updateUserSettings(userId, currentPassword, newUsername, newPassword);
        res.json({ message: 'Credentials updated successfully. Please log in again.' });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json({ error: msg });
    }
});

export default router;