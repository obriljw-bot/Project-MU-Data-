const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const sql = `
CREATE TABLE IF NOT EXISTS brand_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brand_group_members (
    group_id INTEGER,
    brand_id INTEGER,
    PRIMARY KEY (group_id, brand_id),
    FOREIGN KEY (group_id) REFERENCES brand_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);
`;

db.serialize(() => {
    db.exec(sql, (err) => {
        if (err) {
            console.error('Error applying schema:', err.message);
        } else {
            console.log('Schema changes applied successfully.');
        }
    });
});

db.close();
