const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const fs = require('fs');

/**
 * Extract text from a PDF buffer
 */
async function extractPdfText(buffer) {
    const data = await pdfParse(buffer);
    return data.text;
}

/**
 * Parse a questionnaire file into an array of question strings.
 * Supports XLSX (reads first column) and PDF (splits by numbered lines).
 */
async function parseQuestionnaire(filePath, mimetype) {
    const buffer = fs.readFileSync(filePath);

    if (mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimetype === 'application/vnd.ms-excel' ||
        filePath.endsWith('.xlsx') || filePath.endsWith('.xls')) {
        return parseQuestionnaireXlsx(buffer);
    } else if (mimetype === 'application/pdf' || filePath.endsWith('.pdf')) {
        return parseQuestionnairePdf(buffer);
    } else {
        // Try as plain text
        const text = buffer.toString('utf-8');
        return parseQuestionnaireText(text);
    }
}

function parseQuestionnaireXlsx(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    const questions = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // Look for questions in the first non-empty column
        let questionText = '';
        for (let j = 0; j < row.length; j++) {
            if (row[j] && String(row[j]).trim().length > 0) {
                questionText = String(row[j]).trim();
                break;
            }
        }

        if (questionText.length > 5) {
            // Clean up numbered prefixes like "1.", "Q1:", etc.
            questionText = questionText.replace(/^(Q?\d+[\.\)\:]?\s*)/i, '').trim();
            if (questionText.length > 5) {
                questions.push(questionText);
            }
        }
    }

    return questions;
}

async function parseQuestionnairePdf(buffer) {
    const text = await extractPdfText(buffer);
    return parseQuestionnaireText(text);
}

function parseQuestionnaireText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const questions = [];

    for (const line of lines) {
        // Match numbered questions: "1.", "1)", "Q1.", "Q1:", etc.
        const match = line.match(/^(?:Q?\d+[\.\)\:]?\s*)/i);
        if (match) {
            const q = line.replace(/^(Q?\d+[\.\)\:]?\s*)/i, '').trim();
            if (q.length > 5 && q.includes('?') || q.length > 15) {
                questions.push(q);
            }
        } else if (line.endsWith('?') && line.length > 10) {
            questions.push(line);
        }
    }

    return questions;
}

/**
 * Extract text from a file (PDF or plain text)
 */
async function extractDocumentText(filePath, mimetype) {
    const buffer = fs.readFileSync(filePath);

    if (mimetype === 'application/pdf' || filePath.endsWith('.pdf')) {
        return extractPdfText(buffer);
    }

    // Default: treat as text
    return buffer.toString('utf-8');
}

module.exports = {
    parseQuestionnaire,
    extractDocumentText,
    extractPdfText,
};
