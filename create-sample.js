// Script to generate the sample questionnaire XLSX file
const XLSX = require('xlsx');
const path = require('path');

const questions = [
    ['Q#', 'Question'],
    ['1', 'Describe your data encryption practices for data at rest and data in transit.'],
    ['2', 'What compliance certifications does your organization currently hold?'],
    ['3', 'Describe your access control mechanisms, including role-based access and multi-factor authentication.'],
    ['4', 'What is your incident response process in the event of a data breach?'],
    ['5', 'How do you manage and rotate encryption keys?'],
    ['6', 'Describe your disaster recovery and business continuity plans.'],
    ['7', 'What is your uptime SLA and how do you ensure high availability?'],
    ['8', 'How do you handle vulnerability management and penetration testing?'],
    ['9', 'Describe your employee security training and awareness programs.'],
    ['10', 'What are your data backup and retention policies?'],
    ['11', 'How do you manage third-party vendor risk?'],
    ['12', 'Describe your network security architecture and monitoring capabilities.'],
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(questions);

// Set column widths
ws['!cols'] = [
    { wch: 5 },   // Q#
    { wch: 80 },  // Question
];

XLSX.utils.book_append_sheet(wb, ws, 'Security Review');
const outputPath = path.join(__dirname, 'data', 'sample-questionnaire.xlsx');
XLSX.writeFile(wb, outputPath);
console.log('Sample questionnaire created at:', outputPath);
