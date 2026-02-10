import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
    namespace Express {
        interface Request {
            userId?: number; 
        }
    }
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-very-secret-key';

export const protect = (req: Request, res: Response, next: NextFunction) => {
    const bearer = req.headers.authorization;

    if (!bearer || !bearer.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = bearer.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: number, username: string };
        req.userId = decoded.id;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};