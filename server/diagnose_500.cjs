const db = require('./db');

console.log('Running diagnostic tests...');

// Allow DB connection to establish
setTimeout(() => {
    console.log('Testing /api/meta queries...');

    const sqlBrands = 'SELECT id, name FROM brands ORDER BY name';
    db.all(sqlBrands, [], (err, brands) => {
        if (err) {
            console.error('FAIL: Meta API (Brands) Error:', err.message);
        } else {
            console.log(`SUCCESS: Meta API (Brands) - Found ${brands.length} brands`);
        }
    });

    const sqlStores = 'SELECT id, name FROM stores ORDER BY name';
    db.all(sqlStores, [], (err, stores) => {
        if (err) {
            console.error('FAIL: Meta API (Stores) Error:', err.message);
        } else {
            console.log(`SUCCESS: Meta API (Stores) - Found ${stores.length} stores`);
        }
    });

    console.log('Testing /api/dashboard query...');
    const dashboardSql = `
        SELECT strftime('%Y-%m-%d', sale_date) as date,
            SUM(amount) as total_sales,
            SUM(quantity) as total_qty,
            SUM(customer_count) as total_customers
        FROM sales
        WHERE 1=1
        GROUP BY date
        ORDER BY date DESC
        LIMIT 30
    `;
    db.all(dashboardSql, [], (err, rows) => {
        if (err) {
            console.error('FAIL: Dashboard API Error:', err.message);
        } else {
            console.log(`SUCCESS: Dashboard API - Found ${rows.length} rows`);
        }
    });

}, 1000);
