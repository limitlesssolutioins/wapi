import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = path.resolve(__dirname, '../../');
const excelPath = path.resolve(rootDir, 'E900-todos.xlsx');

console.log(`Checking Excel: ${excelPath}`);

try {
    const fileBuffer = fs.readFileSync(excelPath);
    const workbook = XLSX.read(fileBuffer);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    if (data.length > 0) {
        console.log('Detected headers:', Object.keys(data[0]));
        console.log('First row sample:', data[0]);
    } else {
        console.log('No data found in Excel.');
    }
} catch (error) {
    console.error('Error reading excel:', error);
}
