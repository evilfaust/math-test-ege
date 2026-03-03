import * as xlsx from 'xlsx';
import * as fs from 'fs';

const buf = fs.readFileSync('journal (1).xlsx');
const workbook = xlsx.read(buf, { type: 'buffer' });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

console.log("Row 0 headers:");
data[0].forEach((cell, idx) => {
    if (cell !== null && cell !== undefined) console.log(`[${idx}]`, cell);
});

console.log("\nRow 1 headers:");
data[1].forEach((cell, idx) => {
    if (cell !== null && cell !== undefined) console.log(`[${idx}]`, cell);
});
