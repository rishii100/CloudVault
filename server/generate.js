const express = require('express');
const db = require('./db');
const { authMiddleware } = require('./auth');
const { buildIndex, retrieve } = require('./retrieval');
const Groq = require('groq-sdk');

const router = express.Router();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const USE_MOCK = process.env.USE_MOCK_AI === 'true';

let groq;
try {
    if (!USE_MOCK && !GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY environment variable is not set. Cannot use real AI.');
    }
    groq = new Groq({ apiKey: GROQ_API_KEY || 'mock_key' });
} catch (err) {
    console.warn('Groq SDK init failed, will use mock AI:', err.message);
}

/**
 * Generate answer for a single question using Groq (Llama) or mock
 */
async function generateAnswer(question, contextChunks) {
    if (contextChunks.length === 0) {
        return {
            answer: 'Not found in references.',
            citations: [],
            confidence: 0,
        };
    }

    const contextText = contextChunks
        .map((c, i) => `[Source: ${c.docName}]\n${c.text}`)
        .join('\n\n---\n\n');

    const maxScore = Math.max(...contextChunks.map(c => c.score));
    const confidence = Math.min(Math.round(maxScore * 100) / 100, 1.0);

    if (USE_MOCK || !groq) {
        // Mock AI mode
        const answer = `Based on our documentation, ${contextChunks[0].text.slice(0, 200).trim()}...`;
        const citations = contextChunks.map(c => ({
            document: c.docName,
            excerpt: c.text.slice(0, 150).trim() + '...',
        }));
        return { answer, citations, confidence };
    }

    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: `You are a compliance and security expert answering questionnaire questions for CloudVault Systems, a B2B SaaS company providing secure cloud storage, data encryption, and compliance management.

INSTRUCTIONS:
- Answer the question using ONLY the provided reference documents.
- Be professional, precise, and concise.
- If the reference documents do not contain enough information to answer the question, respond EXACTLY with: "Not found in references."
- Do NOT make up information. Only use what is provided.
- Keep answers to 2-4 sentences maximum.`,
                },
                {
                    role: 'user',
                    content: `QUESTION: ${question}\n\nREFERENCE DOCUMENTS:\n${contextText}`,
                },
            ],
            temperature: 0.2,
            max_tokens: 500,
        });

        const answer = completion.choices[0]?.message?.content?.trim() || 'Not found in references.';
        const citations = contextChunks.map(c => ({
            document: c.docName,
            excerpt: c.text.slice(0, 150).trim() + '...',
        }));

        // Adjust confidence if the AI said "not found"
        const finalConfidence = answer.toLowerCase().includes('not found in references') ? 0 : confidence;

        return { answer, citations, confidence: finalConfidence };
    } catch (err) {
        console.error('Groq API error:', err.message);
        // Fallback to mock
        const answer = `Based on our documentation, ${contextChunks[0].text.slice(0, 200).trim()}...`;
        const citations = contextChunks.map(c => ({
            document: c.docName,
            excerpt: c.text.slice(0, 150).trim() + '...',
        }));
        return { answer, citations, confidence };
    }
}

// Generate answers for a session
router.post('/:sessionId', authMiddleware, async (req, res) => {
    try {
        const session = db.prepare(
            'SELECT * FROM sessions WHERE id = ? AND user_id = ?'
        ).get(req.params.sessionId, req.userId);

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Get reference docs
        const refDocs = db.prepare(
            'SELECT id, filename, content FROM reference_docs WHERE user_id = ?'
        ).all(req.userId);

        if (refDocs.length === 0) {
            return res.status(400).json({ error: 'No reference documents uploaded. Please upload reference documents first.' });
        }

        // Build retrieval index
        const index = buildIndex(refDocs);

        // Get questions
        const questions = db.prepare(
            'SELECT * FROM answers WHERE session_id = ? ORDER BY question_index'
        ).all(session.id);

        // Generate answers for each question (individually so one failure doesn't block all)
        const updateAnswer = db.prepare(
            'UPDATE answers SET answer = ?, citations = ?, confidence = ? WHERE id = ?'
        );

        for (const q of questions) {
            try {
                const chunks = retrieve(q.question, index, 3);
                const result = await generateAnswer(q.question, chunks);

                updateAnswer.run(
                    result.answer,
                    JSON.stringify(result.citations),
                    result.confidence,
                    q.id
                );
            } catch (qErr) {
                console.error(`Error generating answer for Q${q.question_index + 1}:`, qErr.message);
                updateAnswer.run(
                    'Error generating answer. Please try again.',
                    '[]',
                    0,
                    q.id
                );
            }
        }

        // Always update session status to generated
        db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('generated', session.id);

        // Return updated answers
        const updatedAnswers = db.prepare(
            'SELECT * FROM answers WHERE session_id = ? ORDER BY question_index'
        ).all(session.id);

        res.json({
            sessionId: session.id,
            status: 'generated',
            answers: updatedAnswers.map(a => ({
                ...a,
                citations: a.citations ? JSON.parse(a.citations) : [],
            })),
        });
    } catch (err) {
        console.error('Generate error:', err);
        // Still try to update the status even on total failure
        try {
            db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('generated', req.params.sessionId);
        } catch (e) { /* ignore */ }
        res.status(500).json({ error: 'Failed to generate answers: ' + err.message });
    }
});

// Get all sessions (version history)
router.get('/sessions', authMiddleware, (req, res) => {
    const sessions = db.prepare(
        'SELECT s.*, COUNT(a.id) as total_questions, ' +
        "SUM(CASE WHEN a.answer IS NOT NULL AND a.answer != 'Not found in references.' THEN 1 ELSE 0 END) as answered, " +
        "SUM(CASE WHEN a.answer = 'Not found in references.' THEN 1 ELSE 0 END) as not_found " +
        'FROM sessions s LEFT JOIN answers a ON s.id = a.session_id ' +
        'WHERE s.user_id = ? GROUP BY s.id ORDER BY s.created_at DESC'
    ).all(req.userId);
    res.json(sessions);
});

// Get single session with answers
router.get('/session/:id', authMiddleware, (req, res) => {
    const session = db.prepare(
        'SELECT * FROM sessions WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.userId);

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const answers = db.prepare(
        'SELECT * FROM answers WHERE session_id = ? ORDER BY question_index'
    ).all(session.id);

    res.json({
        ...session,
        answers: answers.map(a => ({
            ...a,
            citations: a.citations ? JSON.parse(a.citations) : [],
        })),
    });
});

// Edit an answer
router.put('/answer/:id', authMiddleware, (req, res) => {
    const { answer } = req.body;
    if (!answer) {
        return res.status(400).json({ error: 'Answer text is required' });
    }

    // Verify ownership
    const existing = db.prepare(
        'SELECT a.*, s.user_id FROM answers a JOIN sessions s ON a.session_id = s.id WHERE a.id = ?'
    ).get(req.params.id);

    if (!existing || existing.user_id !== req.userId) {
        return res.status(404).json({ error: 'Answer not found' });
    }

    db.prepare('UPDATE answers SET answer = ?, edited = 1 WHERE id = ?').run(answer, req.params.id);

    // Update session status to reviewed
    db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('reviewed', existing.session_id);

    res.json({ success: true });
});

module.exports = router;
