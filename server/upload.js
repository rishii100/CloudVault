const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { authMiddleware } = require('./auth');
const { parseQuestionnaire, extractDocumentText } = require('./utils');

const router = express.Router();

// Configure multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + file.originalname;
        cb(null, uniqueName);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only .txt files are supported'));
        }
    },
});

// Upload questionnaire → parse → create session
router.post('/questionnaire', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const questions = await parseQuestionnaire(req.file.path, req.file.mimetype);
        if (questions.length === 0) {
            return res.status(400).json({ error: 'No questions found in the uploaded file. Ensure questions are numbered or end with ?' });
        }

        // Count existing sessions to generate version label
        const count = db.prepare('SELECT COUNT(*) as cnt FROM sessions WHERE user_id = ?').get(req.userId).cnt;
        const versionLabel = `v${count + 1}`;

        // Create session
        const session = db.prepare(
            'INSERT INTO sessions (user_id, questionnaire_filename, status, version_label) VALUES (?, ?, ?, ?)'
        ).run(req.userId, req.file.originalname, 'pending', versionLabel);

        // Insert questions
        const insertQ = db.prepare(
            'INSERT INTO answers (session_id, question_index, question) VALUES (?, ?, ?)'
        );

        const insertMany = db.transaction((questions) => {
            for (let i = 0; i < questions.length; i++) {
                insertQ.run(session.lastInsertRowid, i, questions[i]);
            }
        });
        insertMany(questions);

        res.json({
            sessionId: session.lastInsertRowid,
            questionCount: questions.length,
            questions,
            version: versionLabel,
        });
    } catch (err) {
        console.error('Questionnaire upload error:', err);
        res.status(500).json({ error: 'Failed to parse questionnaire: ' + err.message });
    }
});

// Submit questionnaire as pasted text
router.post('/questionnaire-text', authMiddleware, async (req, res) => {
    try {
        const { text, title } = req.body;
        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Please enter at least one question' });
        }

        const sessionTitle = (title && title.trim()) ? title.trim() : 'Pasted Questions';

        // Parse questions from text: split by lines, filter numbered or "?" lines
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const questions = [];
        for (const line of lines) {
            // Remove numbering like "1.", "1)", "Q1.", "Q1:" etc.
            const cleaned = line.replace(/^(Q?\d+[\.\)\:\-]\s*)/i, '').trim();
            if (cleaned.length > 5) {
                questions.push(cleaned);
            }
        }

        if (questions.length === 0) {
            return res.status(400).json({ error: 'No valid questions found. Enter one question per line.' });
        }

        const count = db.prepare('SELECT COUNT(*) as cnt FROM sessions WHERE user_id = ?').get(req.userId).cnt;
        const versionLabel = `v${count + 1}`;

        const session = db.prepare(
            'INSERT INTO sessions (user_id, questionnaire_filename, status, version_label) VALUES (?, ?, ?, ?)'
        ).run(req.userId, sessionTitle, 'pending', versionLabel);

        const insertQ = db.prepare(
            'INSERT INTO answers (session_id, question_index, question) VALUES (?, ?, ?)'
        );
        const insertMany = db.transaction((questions) => {
            for (let i = 0; i < questions.length; i++) {
                insertQ.run(session.lastInsertRowid, i, questions[i]);
            }
        });
        insertMany(questions);

        res.json({
            sessionId: session.lastInsertRowid,
            questionCount: questions.length,
            questions,
            version: versionLabel,
        });
    } catch (err) {
        console.error('Questionnaire text error:', err);
        res.status(500).json({ error: 'Failed to process questions: ' + err.message });
    }
});

// Upload reference document
router.post('/reference', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const content = await extractDocumentText(req.file.path, req.file.mimetype);
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Could not extract text from document' });
        }

        const result = db.prepare(
            'INSERT INTO reference_docs (user_id, filename, content) VALUES (?, ?, ?)'
        ).run(req.userId, req.file.originalname, content);

        res.json({
            id: result.lastInsertRowid,
            filename: req.file.originalname,
            contentLength: content.length,
        });
    } catch (err) {
        console.error('Reference upload error:', err);
        res.status(500).json({ error: 'Failed to process reference document: ' + err.message });
    }
});

// List reference documents
router.get('/references', authMiddleware, (req, res) => {
    const docs = db.prepare(
        'SELECT id, filename, LENGTH(content) as content_length, is_default, uploaded_at FROM reference_docs WHERE user_id = ?'
    ).all(req.userId);
    res.json(docs);
});

// Seed sample reference documents from data/reference-docs/
router.post('/seed-references', authMiddleware, async (req, res) => {
    try {
        const refDir = path.join(__dirname, '..', 'data', 'reference-docs');
        if (!fs.existsSync(refDir)) {
            return res.status(404).json({ error: 'Sample reference docs directory not found' });
        }

        const files = fs.readdirSync(refDir).filter(f => f.endsWith('.txt') || f.endsWith('.md') || f.endsWith('.pdf'));
        if (files.length === 0) {
            return res.status(404).json({ error: 'No sample reference documents found' });
        }

        // Check if user already has these docs loaded
        const existing = db.prepare('SELECT filename FROM reference_docs WHERE user_id = ?').all(req.userId);
        const existingNames = new Set(existing.map(d => d.filename));

        let loaded = 0;
        for (const file of files) {
            if (existingNames.has(file)) continue; // skip already loaded

            const filePath = path.join(refDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');

            if (content.trim().length > 0) {
                db.prepare(
                    'INSERT INTO reference_docs (user_id, filename, content, is_default) VALUES (?, ?, ?, 1)'
                ).run(req.userId, file, content);
                loaded++;
            }
        }

        res.json({
            loaded,
            total: files.length,
            message: loaded > 0 ? `${loaded} reference documents loaded successfully` : 'All sample documents were already loaded',
        });
    } catch (err) {
        console.error('Seed references error:', err);
        res.status(500).json({ error: 'Failed to seed reference documents: ' + err.message });
    }
});

// Delete reference document (only user-uploaded, not defaults)
router.delete('/reference/:id', authMiddleware, (req, res) => {
    const doc = db.prepare('SELECT is_default FROM reference_docs WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.is_default) return res.status(403).json({ error: 'Built-in sample documents cannot be removed' });

    db.prepare('DELETE FROM reference_docs WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    res.json({ success: true });
});

module.exports = router;
