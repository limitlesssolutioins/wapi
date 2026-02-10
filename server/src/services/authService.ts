import db from '../db/index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-very-secret-key'; 
if (JWT_SECRET === 'your-very-secret-key') {
    console.warn('Warning: JWT_SECRET is not set. Using a default, insecure key.');
}

export const authenticateUser = (username: string, password_hash: string) => {
    const user: any = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
        throw new Error('Invalid username or password_hash');
    }

    const isPasswordValid = bcrypt.compareSync(password_hash, user.password_hash);
    if (!isPasswordValid) {
        throw new Error('Invalid username or password_hash');
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
        expiresIn: '1d', // Token expires in 1 day
    });

    return { token };
};
