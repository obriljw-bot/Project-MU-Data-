const xlsx = require('xlsx');
const path = require('path');

const files = ['양식-단일브랜드.xlsx', '양식-통합브랜드.xlsx'];

files.forEach(file => {
    console.log(`\n--- Analyzing ${file} ---`);
    try {
        const workbook = xlsx.readFile(path.join(__dirname, file));
        workbook.SheetNames.forEach(sheetName => {
            console.log(`Sheet: ${sheetName}`);
            const sheet = workbook.Sheets[sheetName];
            // Get range
            const range = xlsx.utils.decode_range(sheet['!ref']);
            console.log(`  Range: ${sheet['!ref']}`);

            // Read first few rows to see headers
            const data = xlsx.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: '' });
            console.log('  First 5 rows:');
            data.slice(0, 5).forEach((row, i) => {
                console.log(`    Row ${i}:`, JSON.stringify(row));
            });
        });
    } catch (e) {
        console.error(`Error reading ${file}:`, e.message);
    }
});
