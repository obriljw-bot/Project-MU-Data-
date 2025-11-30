const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const db = require('./db');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Configure Multer for file upload
const upload = multer({ dest: 'uploads/' });

// Helper to parse date from Excel serial or string
function parseExcelDate(value) {
    if (!value) return null;
    if (typeof value === 'number') {
        // Excel serial date
        return new Date(Math.round((value - 25569) * 86400 * 1000)).toISOString().split('T')[0];
    }
    // Assume string YYYY-MM-DD or similar
    return value;
}

// API: Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// API: Upload Excel
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 'A' });

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const stmtBrand = db.prepare('INSERT OR IGNORE INTO brands (name) VALUES (?)');
            const stmtStore = db.prepare('INSERT OR IGNORE INTO stores (name) VALUES (?)');
            const stmtProduct = db.prepare(`INSERT OR IGNORE INTO products (barcode, name, category, brand_id)
                VALUES (?, ?, ?, (SELECT id FROM brands WHERE name = ?))`);
            const stmtSale = db.prepare(`INSERT INTO sales (sale_date, store_id, product_id, quantity, amount, customer_count, inventory)
                VALUES (?, (SELECT id FROM stores WHERE name = ?), (SELECT id FROM products WHERE barcode = ?), ?, ?, ?, ?)`);

            const brands = new Set();
            const stores = new Set();
            const products = new Map(); // barcode -> {name, category, brand}

            data.forEach(row => {
                if (!row.A || row.A === '날짜') return;
                if (row.B) stores.add(row.B);
                if (row.C) brands.add(row.C);
                if (row.D) products.set(row.D, { name: row.E, category: row.K, brand: row.C });
            });

            brands.forEach(b => stmtBrand.run(b));
            stores.forEach(s => stmtStore.run(s));
            products.forEach((val, barcode) => {
                stmtProduct.run(barcode, val.name, val.category, val.brand);
            });

            data.forEach(row => {
                if (!row.A || row.A === '날짜') return;
                stmtSale.run(
                    parseExcelDate(row.A),
                    row.B,
                    row.D,
                    row.F || 0,
                    row.G || 0,
                    row.H || 0,
                    row.J || 0
                );
            });

            stmtBrand.finalize();
            stmtStore.finalize();
            stmtProduct.finalize();
            stmtSale.finalize();

            db.run('COMMIT');
        });

        fs.unlinkSync(req.file.path);
        res.json({ message: 'File processed successfully', count: data.length });
    } catch (error) {
        console.error('Upload error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Failed to process file' });
    }
});

// API: Dashboard Data (with Filters)
app.get('/api/dashboard', (req, res) => {
    const { startDate, endDate, brandId, storeId } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    if (startDate) { whereClause += ' AND sale_date >= ?'; params.push(startDate); }
    if (endDate) { whereClause += ' AND sale_date <= ?'; params.push(endDate); }
    if (brandId) { whereClause += ' AND product_id IN (SELECT id FROM products WHERE brand_id = ?)'; params.push(brandId); }
    if (storeId) { whereClause += ' AND store_id = ?'; params.push(storeId); }

    const sql = `
        SELECT strftime('%Y-%m-%d', sale_date) as date,
            SUM(amount) as total_sales,
            SUM(quantity) as total_qty,
            SUM(customer_count) as total_customers
        FROM sales
        ${whereClause}
        GROUP BY date
        ORDER BY date DESC
        LIMIT 30
    `;
    db.all(sql, params, (err, rows) => {
        if (err) { console.error('Dashboard API Error:', err.message); return res.status(500).json({ error: err.message }); }
        res.json(rows);
    });
});

// API: ABC Analysis (Updated with Filters)
app.get('/api/analysis/abc', (req, res) => {
    const { startDate, endDate, brandId, storeId } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    if (startDate) { whereClause += ' AND s.sale_date >= ?'; params.push(startDate); }
    if (endDate) { whereClause += ' AND s.sale_date <= ?'; params.push(endDate); }
    if (brandId) { whereClause += ' AND p.brand_id = ?'; params.push(brandId); }
    if (storeId) { whereClause += ' AND s.store_id = ?'; params.push(storeId); }

    const sql = `
        SELECT p.name as product_name,
            p.barcode,
            b.name as brand_name,
            SUM(s.amount) as total_amount,
            SUM(s.quantity) as total_qty
        FROM sales s
        JOIN products p ON s.product_id = p.id
        JOIN brands b ON p.brand_id = b.id
        ${whereClause}
        GROUP BY p.id
        ORDER BY total_amount DESC
    `;
    db.all(sql, params, (err, rows) => {
        if (err) { console.error('ABC API Error:', err.message); return res.status(500).json({ error: err.message }); }
        const totalItems = rows.length;
        if (totalItems === 0) return res.json([]);
        const result = rows.map((row, index) => {
            const rankPercent = (index + 1) / totalItems * 100;
            let grade = 'C';
            if (rankPercent <= 20) grade = 'A';
            else if (rankPercent <= 50) grade = 'B';
            return { ...row, grade };
        });
        res.json(result);
    });
});

// API: Export Brand Report
app.get('/api/export/brand', (req, res) => {
    const { brandId } = req.query;
    let sql = `
        SELECT s.sale_date,
            st.name as store_name,
            b.name as brand_name,
            p.barcode,
            p.name as product_name,
            s.quantity,
            s.amount
        FROM sales s
        JOIN stores st ON s.store_id = st.id
        JOIN products p ON s.product_id = p.id
        JOIN brands b ON p.brand_id = b.id
        WHERE 1=1
    `;
    const params = [];
    if (brandId) { sql += ' AND b.id = ?'; params.push(brandId); }
    db.all(sql, params, (err, rows) => {
        if (err) { console.error('Export API Error:', err.message); return res.status(500).json({ error: err.message }); }
        const wb = xlsx.utils.book_new();
        const totalSales = rows.reduce((a, r) => a + r.amount, 0);
        const totalQty = rows.reduce((a, r) => a + r.quantity, 0);
        const summaryData = [
            ['Report Summary'],
            ['Total Sales', totalSales],
            ['Total Quantity', totalQty],
            ['Generated At', new Date().toISOString()]
        ];
        const wsSummary = xlsx.utils.aoa_to_sheet(summaryData);
        xlsx.utils.book_append_sheet(wb, wsSummary, 'Summary');
        const wsDetail = xlsx.utils.json_to_sheet(rows);
        xlsx.utils.book_append_sheet(wb, wsDetail, 'Data');
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="BrandReport.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    });
});

// API: Metadata (Brands, Stores) for Filters
app.get('/api/meta', (req, res) => {
    const sqlBrands = 'SELECT id, name FROM brands ORDER BY name';
    const sqlStores = 'SELECT id, name FROM stores ORDER BY name';
    db.all(sqlBrands, [], (err, brands) => {
        if (err) return res.status(500).json({ error: err.message });
        db.all(sqlStores, [], (err2, stores) => {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ brands, stores });
        });
    });
});

// API: Heatmap Data (Sales by Day of Week)
app.get('/api/analysis/heatmap', (req, res) => {
    const { startDate, endDate, brandId, storeId } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    if (startDate) { whereClause += ' AND sale_date >= ?'; params.push(startDate); }
    if (endDate) { whereClause += ' AND sale_date <= ?'; params.push(endDate); }
    if (brandId) { whereClause += ' AND product_id IN (SELECT id FROM products WHERE brand_id = ?)'; params.push(brandId); }
    if (storeId) { whereClause += ' AND store_id = ?'; params.push(storeId); }
    const sql = `
        SELECT strftime('%w', sale_date) as day_of_week,
            SUM(amount) as total_sales,
            COUNT(DISTINCT id) as transaction_count
        FROM sales
        ${whereClause}
        GROUP BY day_of_week
        ORDER BY day_of_week
    `;
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API: Pivot Data (Group by Brand or Store)
app.get('/api/analysis/pivot', (req, res) => {
    const { groupBy, startDate, endDate } = req.query;
    let groupCol = 'b.name';
    let joinClause = 'JOIN products p ON s.product_id = p.id JOIN brands b ON p.brand_id = b.id';
    if (groupBy === 'store') { groupCol = 'st.name'; joinClause = 'JOIN stores st ON s.store_id = st.id'; }
    let whereClause = 'WHERE 1=1';
    const params = [];
    if (startDate) { whereClause += ' AND s.sale_date >= ?'; params.push(startDate); }
    if (endDate) { whereClause += ' AND s.sale_date <= ?'; params.push(endDate); }
    const sql = `
        SELECT ${groupCol} as group_name,
            SUM(s.amount) as total_sales,
            SUM(s.quantity) as total_qty,
            SUM(s.customer_count) as total_customers
        FROM sales s
        ${joinClause}
        ${whereClause}
        GROUP BY group_name
        ORDER BY total_sales DESC
    `;
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API: Store Analysis (Weekly Peaks & Top Performers)
app.get('/api/analysis/store', (req, res) => {
    const { storeId, startDate, endDate } = req.query;
    if (!storeId) return res.status(400).json({ error: 'Store ID required' });
    const params = [storeId];
    let dateFilter = '';
    if (startDate) { dateFilter += ' AND sale_date >= ?'; params.push(startDate); }
    if (endDate) { dateFilter += ' AND sale_date <= ?'; params.push(endDate); }
    const sqlWeekly = `
        SELECT strftime('%W', sale_date) as week_num, SUM(amount) as total_sales
        FROM sales
        WHERE store_id = ? ${dateFilter}
        GROUP BY week_num
        ORDER BY week_num
    `;
    const sqlTopBrands = `
        SELECT b.name, SUM(s.amount) as total_sales
        FROM sales s
        JOIN products p ON s.product_id = p.id
        JOIN brands b ON p.brand_id = b.id
        WHERE s.store_id = ? ${dateFilter}
        GROUP BY b.id
        ORDER BY total_sales DESC
        LIMIT 5
    `;
    db.serialize(() => {
        const result = {};
        db.all(sqlWeekly, params, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            result.weekly = rows;
            db.all(sqlTopBrands, params, (err2, rows2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                result.topBrands = rows2;
                res.json(result);
            });
        });
    });
});

// API: Brand Analysis (Monthly/Weekly Best Sellers & Inventory Health)
app.get('/api/analysis/brand', (req, res) => {
    const { brandId } = req.query;
    if (!brandId) return res.status(400).json({ error: 'Brand ID required' });
    const getBestSellersSql = dateCondition => `
        SELECT p.id, p.name, SUM(s.amount) as total_sales, SUM(s.quantity) as total_qty
        FROM sales s
        JOIN products p ON s.product_id = p.id
        WHERE p.brand_id = ? AND ${dateCondition}
        GROUP BY p.id
        ORDER BY total_sales DESC
        LIMIT 5`;
    const sqlMonthly = getBestSellersSql("s.sale_date >= date('now', 'start of month')");
    const sqlWeekly = getBestSellersSql("s.sale_date >= date('now', '-7 days')");
    const sqlInventory = `
        SELECT p.name,
            SUM(s.quantity) as sold_last_30d,
            (SELECT inventory FROM sales s2 WHERE s2.product_id = p.id ORDER BY sale_date DESC LIMIT 1) as current_stock
        FROM products p
        LEFT JOIN sales s ON p.id = s.product_id AND s.sale_date >= date('now', '-30 days')
        WHERE p.brand_id = ?
        GROUP BY p.id`;
    db.serialize(() => {
        const result = {};
        db.all(sqlMonthly, [brandId], (err, rowsM) => {
            if (err) return res.status(500).json({ error: err.message });
            result.bestMonthly = rowsM;
            db.all(sqlWeekly, [brandId], (err2, rowsW) => {
                if (err2) return res.status(500).json({ error: err2.message });
                result.bestWeekly = rowsW;
                db.all(sqlInventory, [brandId], (err3, rowsInv) => {
                    if (err3) return res.status(500).json({ error: err3.message });
                    result.inventoryHealth = rowsInv.map(r => {
                        const ads = (r.sold_last_30d || 0) / 30;
                        const target = ads * 30;
                        const stock = r.current_stock || 0;
                        let status = 'Optimal';
                        if (stock < target * 0.5) status = 'Low';
                        else if (stock > target * 2.0) status = 'High';
                        return { product: r.name, stock, target: Math.round(target), status };
                    });
                    res.json(result);
                });
            });
        });
    });
});

// API: Product Sales Trend
app.get('/api/analysis/product/trend', (req, res) => {
    const { productId, days } = req.query;
    if (!productId) return res.status(400).json({ error: 'Product ID required' });
    const limitDays = days || 30;
    const sql = `
        SELECT strftime('%Y-%m-%d', sale_date) as date,
            SUM(quantity) as qty,
            SUM(amount) as amount
        FROM sales
        WHERE product_id = ? AND sale_date >= date('now', '-' || ? || ' days')
        GROUP BY date
        ORDER BY date ASC
    `;
    db.all(sql, [productId, limitDays], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API: Automated Insights (Feedback)
app.get('/api/analysis/insights', (req, res) => {
    const sqlMoM = `
        SELECT (SELECT SUM(amount) FROM sales WHERE sale_date >= date('now', 'start of month')) as this_month,
            (SELECT SUM(amount) FROM sales WHERE sale_date >= date('now', 'start of month', '-1 month') AND sale_date < date('now', 'start of month')) as last_month
    `;
    const sqlLowSellThrough = `
        SELECT b.name, SUM(s.quantity) as qty, SUM(s.inventory) as inv
        FROM sales s
        JOIN products p ON s.product_id = p.id
        JOIN brands b ON p.brand_id = b.id
        GROUP BY b.id
        HAVING (CAST(qty AS FLOAT) / (qty + inv)) < 0.1
        LIMIT 3
    `;
    const insights = [];
    db.get(sqlMoM, [], (err, row) => {
        if (!err && row) {
            const { this_month, last_month } = row;
            if (last_month > 0) {
                const growth = ((this_month - last_month) / last_month) * 100;
                if (growth > 10) insights.push({ type: 'positive', msg: `지난달 대비 매출이 ${growth.toFixed(1)}% 성장했습니다!` });
                else if (growth < -10) insights.push({ type: 'negative', msg: `지난달 대비 매출이 ${Math.abs(growth).toFixed(1)}% 하락했습니다. 원인 파악이 필요합니다.` });
            }
        }
        db.all(sqlLowSellThrough, [], (err2, rows2) => {
            if (!err2 && rows2) {
                rows2.forEach(r => {
                    insights.push({ type: 'warning', msg: `[${r.name}] 브랜드의 판매율이 10% 미만입니다. 프로모션을 고려하세요.` });
                });
            }
            res.json(insights);
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
