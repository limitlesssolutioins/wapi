const XLSX = require('./server/node_modules/xlsx');
const fs = require('fs');
const path = require('path');

const FILES = [
    'Panilla VVH 2.xlsx',
    'listado de testigo cambio radical 2023.xlsx',
    'PLANTILLA TESTIGOS ELECTORALES CR1 LOCALIDAD 1 MARIA MERCEDES BUSTAMANTE.xlsx',
    'PLANTILLA TESTIGOS ELECTORALES CR1 LOCALIDAD 3.xlsx',
    'PLANTILLA TESTIGOS ELECTORALES CARTAGENA.xlsx',
    'PLANTILLA TESTIGOS ELECTORALES MUNICIPIOS.xlsx',
    'PLANTILLA TESTIGOS ELECTORALES MUNICIPIOS (1).xlsx',
    'PLANTILLA TESTIGOS ELECTORALES MUNICIPIOS (2).xlsx',
    'PLANTILLA TESTIGOS ELECTORALES MUNICIPIOS SAN MARTIN DE LOBA.xlsx',
    'PLANTILLA TESTIGOS ELECTORALES CAMBIO RADICAL MUNICIPIO MARIALABAJA BOLIVAR 2023.xlsx',
    'TESTIGOS ELECTORALES CICUCO BOLIVAR  2023.xlsx',
    'TESTIGOS ELECTORALES CREEMOS.xlsx',
    'TESTIGOS ELECTRORALES LUIS CASSIANI LOC 2 Y ZONA NORTE.xlsx',
    'ARJONA.xlsx',
    'MARIA LA BAJA- RAMIRITO.xlsx',
];

function normalize(str) {
    return String(str || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
}

function findCol(headers, patterns) {
    for (const pat of patterns) {
        const idx = headers.findIndex(h => normalize(h).includes(pat));
        if (idx !== -1) return idx;
    }
    return -1;
}

function cleanPhone(phone) {
    let p = String(phone || '').replace(/\D/g, '');
    if (!p || p.length < 7) return null;
    // Add Colombia prefix if needed
    if (p.length === 10 && p.startsWith('3')) p = '57' + p;
    return p;
}

function cleanName(...parts) {
    return parts
        .map(p => String(p || '').trim())
        .filter(p => p.length > 0)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

let totalGenerated = 0;

FILES.forEach(file => {
    if (!fs.existsSync(file)) {
        console.log(`⚠️  No encontrado: ${file}`);
        return;
    }

    try {
        const wb = XLSX.readFile(file);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // Find header row
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(5, data.length); i++) {
            const row = data[i].map(c => String(c).toUpperCase());
            if (row.some(c => c.includes('NOMBRE') || c.includes('TELEFON') || c.includes('CELULAR'))) {
                headerRowIdx = i;
                break;
            }
        }

        if (headerRowIdx === -1) {
            console.log(`⚠️  No se encontró cabecera en: ${file}`);
            return;
        }

        const headers = data[headerRowIdx];

        // Detect columns
        const colN1    = findCol(headers, ['NOMBRE1', 'PRIMERNOMBRE', 'NOMBRE']);
        const colN2    = findCol(headers, ['NOMBRE2', 'SEGUNDONOMBRE']);
        const colA1    = findCol(headers, ['APELLIDO1', 'PRIMERAPELLIDO']);
        const colA2    = findCol(headers, ['APELLIDO2', 'SEGUNDOAPELLIDO']);
        const colPhone = findCol(headers, ['TELEFONO', 'CELULAR', 'MOVIL']);

        if (colN1 === -1 || colPhone === -1) {
            console.log(`⚠️  Columnas no detectadas en: ${file} (nombre:${colN1}, tel:${colPhone})`);
            return;
        }

        const rows = ['Name,Phone'];
        let count = 0;

        for (let i = headerRowIdx + 1; i < data.length; i++) {
            const row = data[i];
            const phone = cleanPhone(row[colPhone]);
            if (!phone) continue;

            const name = cleanName(
                row[colN1],
                colN2 !== -1 ? row[colN2] : '',
                colA1 !== -1 ? row[colA1] : '',
                colA2 !== -1 ? row[colA2] : ''
            );

            if (!name) continue;

            rows.push(`"${name.replace(/"/g, '""')}","${phone}"`);
            count++;
        }

        const outFile = file.replace('.xlsx', '.csv');
        fs.writeFileSync(outFile, rows.join('\n'), 'utf8');
        console.log(`✅ ${outFile} — ${count} contactos`);
        totalGenerated += count;

    } catch (e) {
        console.log(`❌ Error en ${file}: ${e.message}`);
    }
});

console.log(`\nTotal: ${totalGenerated} contactos generados`);
