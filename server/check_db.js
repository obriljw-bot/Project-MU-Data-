const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const schemaPath = path.resolve(__dirname, '../schema.sql');

console.log('Checking DB at:', dbPath);
console.log('Checking Schema at:', schemaPath);

if (!fs.existsSync(dbPath)) {
    console.log('Database file does not exist.');
} else {
    console.log('Database file exists.');
}

if (!fs.existsSync(schemaPath)) {
    console.log('Schema file does not exist.');
} else {
    console.log('Schema file exists.');
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to database.');

    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
        if (err) {
            console.error('Error listing tables:', err.message);
            process.exit(1);
        }
        console.log('Tables:', rows);

        // Check brands
        db.all("SELECT count(*) as count FROM brands", [], (err, rows) => {
            if (err) console.error('Error querying brands:', err.message);
            else console.log('Brands count:', rows[0].count);

            // Check stores
            db.all("SELECT count(*) as count FROM stores", [], (err, rows) => {
                if (err) console.error('Error querying stores:', err.message);
                else console.log('Stores count:', rows[0].count);

                db.close();
            });
        });
    });
});
