import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = path.resolve(__dirname, '../../');
const csvPath = path.resolve(rootDir, 'contacts.csv');

interface Contact {
    name: string;
    phone: string;
}

const allContacts: Contact[] = [];

const files = fs.readdirSync(rootDir);

// --- Part 1: Process VCF Files ---
const vcfFiles = files.filter(f => f.toLowerCase().endsWith('.vcf'));
for (const vcfFile of vcfFiles) {
    const vcfPath = path.join(rootDir, vcfFile);
    console.log(`Reading VCF: ${vcfFile}...`);
    try {
        const vcfContent = fs.readFileSync(vcfPath, 'utf-8');
        const lines = vcfContent.split(/\r?\n/);
        let currentName = '';
        let currentPhones: string[] = [];
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('BEGIN:VCARD')) {
                currentName = '';
                currentPhones = [];
            } else if (line.startsWith('END:VCARD')) {
                const uniquePhones = [...new Set(currentPhones)];
                for (const phone of uniquePhones) {
                    allContacts.push({ name: currentName || 'Sin Nombre', phone });
                }
            } else if (line.startsWith('FN:')) {
                currentName = line.substring(3).trim();
            } else if (line.startsWith('N:') && !currentName) {
                const parts = line.substring(2).split(';');
                const firstName = parts[1] || '';
                const lastName = parts[0] || '';
                currentName = `${firstName} ${lastName}`.trim();
            } else if (line.includes('TEL')) {
                const parts = line.split(':');
                if (parts.length > 1) {
                    let rawNumber = parts[parts.length - 1].trim();
                    let number = rawNumber.replace(/\D/g, '');
                    if (number.length === 12 && number.startsWith('57')) number = number.substring(2);
                    if (number.length >= 7) currentPhones.push(number);
                }
            }
        }
    } catch (err) { console.error(`Error reading ${vcfFile}:`, err); }
}

// --- Part 2: Process Excel Files ---
const excelFiles = files.filter(f => f.toLowerCase().endsWith('.xlsx'));
for (const excelFile of excelFiles) {
    const excelPath = path.join(rootDir, excelFile);
    console.log(`Reading Excel: ${excelFile}...`);
    try {
        const fileBuffer = fs.readFileSync(excelPath);
        const workbook = XLSX.read(fileBuffer);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data: any[] = XLSX.utils.sheet_to_json(worksheet);

        for (const row of data) {
            let fullName = '';
            let phonesToProcess: string[] = [];

            // --- 1. E900 SPECIFIC LOGIC ---
            if (row['MATRIC'] && row['NOMBRE']) {
                fullName = String(row['NOMBRE']);
                phonesToProcess = [String(row['CELULAR'] || ''), String(row['TELEF.'] || '')];
            } 
            // --- 2. +70.000 EMPRESAS SPECIFIC LOGIC ---
            else if (row['razon_social']) {
                fullName = String(row['razon_social']);
                phonesToProcess = [String(row['Teléfono'] || '')];
            }
            // --- 3. base de datos.xlsx structure ---
            else if (row['base leads google'] && row['__EMPTY_1']) {
                if (row['base leads google'] === 'Nombre') continue; 
                fullName = String(row['base leads google']);
                phonesToProcess = [String(row['__EMPTY_1'])];
            } 
            // --- 4. BASE PITALITO... structure ---
            else if (row['NOMBRE']) {
                fullName = String(row['NOMBRE']);
                phonesToProcess = [String(row['CELULAR'] || row['TELEFONO '] || row['TELEFONO'] || '')];
            } 
            // --- 5. Libro1... pattern ---
            else if (row['1 NOMBRE']) {
                const n1 = row['1 NOMBRE'] || '';
                const n2 = row['2 NOMBRE'] || '';
                const a1 = row['1 APELLIDO'] || '';
                fullName = `${n1} ${n2} ${a1}`.replace(/\s+/g, ' ').trim();
                phonesToProcess = [String(row['CELULAR'] || row['TELEFONO '] || row['TELEFONO'] || '')];
            }
            
            if (!fullName) fullName = 'Sin Nombre';

            for (const raw of phonesToProcess) {
                const rawParts = raw.split(/[,/;|]/);
                for (let pRaw of rawParts) {
                    let p = pRaw.replace(/\D/g, '');
                    
                    // Normalize 57 prefix (12 digits -> 10 digits)
                    if (p.length === 12 && p.startsWith('57')) p = p.substring(2);
                    
                    // --- FILTERS ---
                    // Rule 1: Must be exactly 10 digits for mobile (standard in Colombia)
                    if (p.length !== 10) continue;

                    // Rule 2: Cannot start with '60' (New landline format in Colombia: 60 + indicative + number)
                    if (p.startsWith('60')) continue;

                    // Rule 3: Mobile numbers in Colombia typically start with '3'
                    // We only allow those to be safe
                    if (!p.startsWith('3')) continue;

                    allContacts.push({ name: fullName, phone: p });
                }
            }
        }
    } catch (error) { console.error(`Error processing Excel ${excelFile}:`, error); }
}

// --- Part 3: Deduplicate and Save ---
const seenPhones = new Set<string>();
const uniqueContacts = allContacts.filter(c => {
    if (!c.phone || seenPhones.has(c.phone)) return false;
    seenPhones.add(c.phone);
    return true;
});

const csvHeader = 'Name,Phone\n';
const csvRows = uniqueContacts.map(c => `"${c.name}","${c.phone}"`).join('\n');
fs.writeFileSync(csvPath, csvHeader + csvRows);

console.log(`-----------------------------------`);
console.log(`Proceso finalizado.`);
console.log(`Contactos únicos finales (Móviles reales): ${uniqueContacts.length}`);
console.log(`Archivo guardado en: ${csvPath}`);
