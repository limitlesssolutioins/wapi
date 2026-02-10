import db from '../db/index.js';
import bcrypt from 'bcryptjs';

export interface User {
    id: number;
    username: string;
    password_hash: string;
}

export const getUserById = (id: number): User | undefined => {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
};

export const getUserByUsername = (username: string): User | undefined => {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
};

export const updateUserSettings = (
    userId: number,
    currentPassword_hash: string,
    newUsername?: string,
    newPassword_hash?: string
): void => {
    const user = getUserById(userId);

    if (!user) {
        throw new Error('User not found');
    }

    // Verify current password
    const isPasswordValid = bcrypt.compareSync(currentPassword_hash, user.password_hash);
    if (!isPasswordValid) {
        throw new Error('Invalid current password');
    }

    let updateQuery = 'UPDATE users SET';
    const params: (string | number)[] = [];
    const updates: string[] = [];

    if (newUsername && newUsername !== user.username) {
        // Check if new username is already taken
        const existingUser = getUserByUsername(newUsername);
        if (existingUser && existingUser.id !== userId) {
            throw new Error('Username already taken');
        }
        updates.push('username = ?');
        params.push(newUsername);
    }

    if (newPassword_hash) {
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(newPassword_hash, salt);
        updates.push('password_hash = ?');
        params.push(hash);
    }

    if (updates.length === 0) {
        throw new Error('No changes provided');
    }

    updateQuery += ' ' + updates.join(', ') + ' WHERE id = ?';
    params.push(userId);

    db.prepare(updateQuery).run(...params);
};
