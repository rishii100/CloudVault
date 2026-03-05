require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Initialize database (creates tables on first run)
require('./db');

const { router: authRouter } = require('./auth');
const uploadRouter = require('./upload');
const generateRouter = require('./generate');
const exportRouter = require('./export');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/generate', generateRouter);
app.use('/api/export', exportRouter);

// Serve frontend pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

app.get('/review/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'review.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════════════════════╗
║   Questionnaire Answering Tool - CloudVault Systems  ║
║   Server running at http://localhost:${PORT}            ║
╚══════════════════════════════════════════════════════╝
        `);
    });
}

module.exports = app;
