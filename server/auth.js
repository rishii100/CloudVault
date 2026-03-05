const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cloudvault-questionnaire-tool-secret-2024';

// Signup
router.post('/signup', (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const password_hash = bcrypt.hashSync(password, 10);
        const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, password_hash);
        const userId = result.lastInsertRowid;

        // Auto-seed sample reference documents for the new user
        try {
            const refDir = path.join(__dirname, '..', 'data', 'reference-docs');
            if (fs.existsSync(refDir)) {
                const files = fs.readdirSync(refDir).filter(f => f.endsWith('.txt') || f.endsWith('.md'));
                const insertDoc = db.prepare('INSERT INTO reference_docs (user_id, filename, content, is_default) VALUES (?, ?, ?, 1)');
                for (const file of files) {
                    const content = fs.readFileSync(path.join(refDir, file), 'utf-8');
                    if (content.trim().length > 0) {
                        insertDoc.run(userId, file, content);
                    }
                }
                console.log(`Seeded ${files.length} reference docs for new user: ${email}`);
            }
        } catch (seedErr) {
            console.error('Warning: Failed to seed reference docs:', seedErr.message);
        }

        const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: userId, email } });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Server error during signup' });
    }
});

// Login
router.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const valid = bcrypt.compareSync(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, email: user.email } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Auth middleware
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.userEmail = decoded.email;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

module.exports = { router, authMiddleware };
