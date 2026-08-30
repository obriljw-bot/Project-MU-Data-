
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hcefsusfvshpuxmpwypz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZWZzdXNmdnNocHV4bXB3eXB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NjYzMzIsImV4cCI6MjA4MDE0MjMzMn0.ByMlc4141M-_Laf60_bU6uVnxYEmrQjTZheIcR5Lf8U';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSales() {
    const { data, error } = await supabase
        .from('sales')
        .select('sale_date')
        .gte('sale_date', '2025-11-01')
        .lte('sale_date', '2025-11-30')
        .order('sale_date', { ascending: false })
        .limit(1000);

    if (error) {
        console.error(error);
        return;
    }

    const counts = {};
    data.forEach(row => {
        counts[row.sale_date] = (counts[row.sale_date] || 0) + 1;
    });

    console.log('Sales counts by date (2025-11-01 ~ 2025-11-30):');
    Object.keys(counts).sort().forEach(date => {
        console.log(`${date}: ${counts[date]}`);
    });
}

checkSales();
