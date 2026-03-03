import { parseJournalWorkbook } from './src/lib/excel-parser.ts';
import * as fs from 'fs';

const buf = fs.readFileSync('journal (1).xlsx');
const parsed = parseJournalWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
console.log(JSON.stringify(parsed, null, 2));
