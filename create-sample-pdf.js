// Generate a sample PDF questionnaire for testing
const fs = require('fs');
const path = require('path');

// Build a simple PDF manually (PDF 1.4 spec - minimal valid PDF)
function createPDF(questions) {
    const title = 'Vendor Security Assessment Questionnaire';
    const company = 'CloudVault Systems';

    let content = '';
    content += `${title}\n\n`;
    content += `Prepared for: ${company}\n`;
    content += `Date: March 2026\n\n`;
    content += `Instructions: Please answer each question below based on your organization's policies and practices.\n\n`;

    questions.forEach((q, i) => {
        content += `${i + 1}. ${q}\n\n`;
    });

    content += `\nEnd of Questionnaire\n`;

    // PDF structure
    const objects = [];
    let objNum = 1;

    // Object 1: Catalog
    objects.push(`${objNum} 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);
    objNum++;

    // Build text lines for content stream
    const lines = content.split('\n');
    let streamContent = 'BT\n/F1 11 Tf\n36 760 Td\n14 TL\n';

    let currentPage = 1;
    let lineCount = 0;
    const maxLinesPerPage = 50;
    const pages = [[]]; // array of stream contents per page

    for (const line of lines) {
        if (lineCount >= maxLinesPerPage) {
            pages.push([]);
            currentPage++;
            lineCount = 0;
        }
        // Escape special PDF characters
        const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        pages[pages.length - 1].push(`(${escaped}) Tj T*`);
        lineCount++;
    }

    const pageObjStart = 3;
    const numPages = pages.length;

    // Object 2: Pages (parent)
    const pageRefs = [];
    for (let i = 0; i < numPages; i++) {
        pageRefs.push(`${pageObjStart + i * 2} 0 R`);
    }
    objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${numPages} >>\nendobj`);

    // Create page objects and content streams
    let nextObj = pageObjStart;
    for (let i = 0; i < numPages; i++) {
        const pageObj = nextObj;
        const contentObj = nextObj + 1;

        // Page object
        objects.push(`${pageObj} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${pageObjStart + numPages * 2} 0 R >> >> >>\nendobj`);

        // Content stream
        const stream = `BT\n/F1 11 Tf\n36 750 Td\n14 TL\n${pages[i].join('\n')}\nET`;
        objects.push(`${contentObj} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`);

        nextObj += 2;
    }

    // Font object
    const fontObj = pageObjStart + numPages * 2;
    objects.push(`${fontObj} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`);

    // Build PDF
    let pdf = '%PDF-1.4\n';
    const offsets = [];

    for (const obj of objects) {
        offsets.push(pdf.length);
        pdf += obj + '\n';
    }

    const xrefOffset = pdf.length;
    pdf += 'xref\n';
    pdf += `0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (const offset of offsets) {
        pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
    }

    pdf += 'trailer\n';
    pdf += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    pdf += 'startxref\n';
    pdf += xrefOffset + '\n';
    pdf += '%%EOF\n';

    return pdf;
}

const questions = [
    'What is the full legal name of your organization and in which country are you incorporated?',
    'Describe your data encryption practices for data at rest and data in transit.',
    'What compliance certifications does your organization currently hold (e.g., SOC 2, ISO 27001, HIPAA)?',
    'Describe your access control mechanisms, including role-based access and multi-factor authentication.',
    'What is your incident response process in the event of a security breach or data leak?',
    'How do you manage and rotate encryption keys? Do you support customer-managed keys?',
    'Describe your disaster recovery and business continuity plans, including RTO and RPO targets.',
    'What is your uptime SLA and how do you ensure high availability across regions?',
    'How do you handle vulnerability management, penetration testing, and bug bounty programs?',
    'Describe your employee security training and background check policies.',
    'What are your data backup frequency and retention policies?',
    'How do you assess and manage third-party vendor security risks?',
];

const pdfContent = createPDF(questions);
const outputPath = path.join(__dirname, 'data', 'vendor-security-assessment.pdf');
fs.writeFileSync(outputPath, pdfContent);
console.log(`Sample PDF questionnaire created at: ${outputPath}`);
console.log(`File size: ${fs.statSync(outputPath).size} bytes`);
