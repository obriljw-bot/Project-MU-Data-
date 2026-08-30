const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const schemaPath = path.resolve(__dirname, '../schema.sql');

console.log('Checking database at:', dbPath);
console.log('Checking schema at:', schemaPath);

if (!fs.existsSync(dbPath)) {
    console.log('Database file does not exist.');
} else {
    console.log('Database file exists.');
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to database.');
    checkTables();
});

function checkTables() {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
        if (err) {
            console.error('Error listing tables:', err.message);
            return;
        }
        console.log('Tables found:', rows.map(r => r.name));

        // Check specific tables
        const tables = ['brands', 'stores', 'products', 'sales', 'brand_groups', 'brand_group_members'];
        const foundTables = rows.map(r => r.name);
        const missing = tables.filter(t => !foundTables.includes(t));

        if (missing.length > 0) {
            console.error('Missing tables:', missing);
            console.log('Attempting to re-run schema...');
            runSchema();
        } else {
            console.log('All required tables exist.');
            testQueries();
        }
    });
}

function runSchema() {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema, (err) => {
        if (err) {
            console.error('Error executing schema:', err.message);
        } else {
            console.log('Schema executed successfully.');
            testQueries();
        }
    });
}

function testQueries() {
    console.log('Testing /api/meta queries...');
    db.all('SELECT id, name FROM brands ORDER BY name', [], (err, rows) => {
        if (err) console.error('Brands query failed:', err.message);
        else console.log(`Brands query success. Count: ${rows.length}`);
    });

    db.all('SELECT id, name FROM stores ORDER BY name', [], (err, rows) => {
        if (err) console.error('Stores query failed:', err.message);
        else console.log(`Stores query success. Count: ${rows.length}`);
    });

    console.log('Testing /api/dashboard query...');
    db.all('SELECT * FROM sales LIMIT 1', [], (err, rows) => {
        if (err) console.error('Sales query failed:', err.message);
        else console.log('Sales query success.');
    });
}
