import { Router } from 'express';
import { authenticateUser } from '../services/authService.js';

const router = Router();

router.post('/login', (req, res) => {
    const { username, password } from req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const result = authenticateUser(username, password);
        res.json(result);
    } catch (error) {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

export default router;
