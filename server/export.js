const express = require('express');
const db = require('./db');
const { authMiddleware } = require('./auth');

const router = express.Router();

router.get('/:sessionId', authMiddleware, async (req, res) => {
    try {
        const {
            Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
            HeadingLevel, AlignmentType, WidthType, BorderStyle,
            TableLayoutType, VerticalAlign, ShadingType,
        } = require('docx');

        const session = db.prepare(
            'SELECT * FROM sessions WHERE id = ? AND user_id = ?'
        ).get(req.params.sessionId, req.userId);

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const answers = db.prepare(
            'SELECT * FROM answers WHERE session_id = ? ORDER BY question_index'
        ).all(session.id);

        const children = [];

        // ===== TITLE =====
        children.push(new Paragraph({
            children: [new TextRun({ text: 'Questionnaire Responses', bold: true, size: 40, font: 'Calibri', color: '1a2240' })],
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.LEFT,
            spacing: { after: 100 },
        }));

        // ===== METADATA LINE =====
        const metaDate = new Date(session.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        children.push(new Paragraph({
            children: [
                new TextRun({ text: 'Source: ', bold: true, size: 20, font: 'Calibri', color: '4a5578' }),
                new TextRun({ text: session.questionnaire_filename, size: 20, font: 'Calibri', color: '333333' }),
                new TextRun({ text: '    |    Date: ', bold: true, size: 20, font: 'Calibri', color: '4a5578' }),
                new TextRun({ text: metaDate, size: 20, font: 'Calibri', color: '333333' }),
                new TextRun({ text: '    |    Version: ', bold: true, size: 20, font: 'Calibri', color: '4a5578' }),
                new TextRun({ text: session.version_label || 'v1', size: 20, font: 'Calibri', color: '333333' }),
            ],
            spacing: { after: 100 },
        }));

        // ===== SUMMARY STATS =====
        const totalQ = answers.length;
        const notFoundCount = answers.filter(a => a.answer && a.answer.toLowerCase().includes('not found in references')).length;
        const answeredCount = totalQ - notFoundCount;

        children.push(new Paragraph({
            children: [
                new TextRun({ text: 'Summary: ', bold: true, size: 20, font: 'Calibri', color: '4a5578' }),
                new TextRun({ text: `${totalQ} questions total`, size: 20, font: 'Calibri', color: '333333' }),
                new TextRun({ text: `  •  ${answeredCount} answered with citations`, size: 20, font: 'Calibri', color: '16a34a' }),
                new TextRun({ text: `  •  ${notFoundCount} not found in references`, size: 20, font: 'Calibri', color: 'd97706' }),
            ],
            spacing: { after: 300 },
        }));

        // ===== DIVIDER =====
        children.push(new Paragraph({
            children: [new TextRun({ text: '' })],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2563eb' } },
            spacing: { after: 300 },
        }));

        // ===== EACH QUESTION-ANSWER BLOCK =====
        for (const a of answers) {
            const isNotFound = a.answer && a.answer.toLowerCase().includes('not found in references');
            let citations = [];
            try { citations = a.citations ? JSON.parse(a.citations) : []; } catch (e) { citations = []; }

            // -- Question --
            children.push(new Paragraph({
                children: [
                    new TextRun({ text: `Q${a.question_index + 1}.  `, bold: true, size: 24, font: 'Calibri', color: '2563eb' }),
                    new TextRun({ text: a.question, bold: true, size: 24, font: 'Calibri', color: '1a2240' }),
                ],
                spacing: { before: 280, after: 120 },
            }));

            // -- Answer --
            children.push(new Paragraph({
                children: [
                    new TextRun({ text: 'Answer:', bold: true, size: 21, font: 'Calibri', color: '2563eb' }),
                ],
                indent: { left: 360 },
                spacing: { after: 60 },
            }));

            children.push(new Paragraph({
                children: [
                    new TextRun({
                        text: a.answer || 'Not answered',
                        size: 21,
                        font: 'Calibri',
                        color: isNotFound ? 'd97706' : '333333',
                        italics: isNotFound,
                    }),
                ],
                indent: { left: 360 },
                spacing: { after: 80 },
            }));

            // -- Confidence --
            if (a.confidence !== null && a.confidence !== undefined) {
                const pct = Math.round(a.confidence * 100);
                const level = pct >= 70 ? 'High' : pct >= 40 ? 'Medium' : 'Low';
                const color = pct >= 70 ? '16a34a' : pct >= 40 ? 'd97706' : 'dc2626';
                children.push(new Paragraph({
                    children: [
                        new TextRun({ text: 'Confidence: ', bold: true, size: 19, font: 'Calibri', color: '4a5578' }),
                        new TextRun({ text: `${level} (${pct}%)`, bold: true, size: 19, font: 'Calibri', color }),
                    ],
                    indent: { left: 360 },
                    spacing: { after: 80 },
                }));
            }

            // -- Citations Table --
            if (citations.length > 0) {
                children.push(new Paragraph({
                    children: [new TextRun({ text: 'Citations:', bold: true, size: 19, font: 'Calibri', color: '4a5578' })],
                    indent: { left: 360 },
                    spacing: { after: 60 },
                }));

                // Build a simple table for citations
                const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
                const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

                const citationRows = citations.map(cit => {
                    return new TableRow({
                        children: [
                            new TableCell({
                                children: [new Paragraph({
                                    children: [new TextRun({ text: cit.document, bold: true, size: 18, font: 'Calibri', color: '2563eb' })],
                                })],
                                width: { size: 25, type: WidthType.PERCENTAGE },
                                verticalAlign: VerticalAlign.TOP,
                                borders: noBorders,
                                shading: { type: ShadingType.SOLID, color: 'f0f4ff' },
                                margins: { top: 60, bottom: 60, left: 80, right: 80 },
                            }),
                            new TableCell({
                                children: [new Paragraph({
                                    children: [new TextRun({ text: `"${cit.excerpt}"`, italics: true, size: 17, font: 'Calibri', color: '666666' })],
                                })],
                                width: { size: 75, type: WidthType.PERCENTAGE },
                                verticalAlign: VerticalAlign.TOP,
                                borders: noBorders,
                                shading: { type: ShadingType.SOLID, color: 'f8f9fc' },
                                margins: { top: 60, bottom: 60, left: 80, right: 80 },
                            }),
                        ],
                    });
                });

                children.push(new Table({
                    rows: citationRows,
                    width: { size: 90, type: WidthType.PERCENTAGE },
                    layout: TableLayoutType.AUTOFIT,
                }));

                children.push(new Paragraph({ children: [], spacing: { after: 40 } }));
            }

            // -- Edited tag --
            if (a.edited) {
                children.push(new Paragraph({
                    children: [new TextRun({ text: '[This answer was manually reviewed and edited]', italics: true, size: 17, font: 'Calibri', color: '999999' })],
                    indent: { left: 360 },
                    spacing: { after: 40 },
                }));
            }

            // -- Light divider between questions --
            children.push(new Paragraph({
                children: [new TextRun({ text: '' })],
                border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' } },
                spacing: { after: 160 },
            }));
        }

        // ===== FOOTER =====
        children.push(new Paragraph({ children: [], spacing: { before: 200 } }));
        children.push(new Paragraph({
            children: [
                new TextRun({ text: 'Generated by CloudVault Questionnaire Tool', italics: true, size: 18, font: 'Calibri', color: '999999' }),
                new TextRun({ text: `  •  Powered by Llama 3.3 70B (Groq)`, italics: true, size: 18, font: 'Calibri', color: '999999' }),
            ],
            alignment: AlignmentType.CENTER,
        }));

        // ===== BUILD & SEND =====
        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
                    },
                },
                children,
            }],
        });

        const buffer = await Packer.toBuffer(doc);
        const filename = `questionnaire-responses-${session.version_label || 'v1'}.docx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        res.end(buffer);
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ error: 'Failed to export document: ' + err.message });
    }
});

module.exports = router;
