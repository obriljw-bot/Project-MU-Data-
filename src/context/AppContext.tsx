import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// --- Types ---
export type PeriodUnit = 'day' | 'week' | 'month';

export type GlobalFilters = {
    periodUnit: PeriodUnit;
    dateRange: { start: string; end: string };
    store: string | 'ALL';
    brand: string | 'ALL';
    category: string | 'ALL';
    product: string | 'ALL';  // barcode or name
};

// Define the shape of the raw data row based on Supabase query
export interface RawSaleRow {
    id?: number; // Optional as it might not be selected
    sale_date: string;
    amount: number;
    quantity: number;
    customer_count?: number;
    products: {
        name: string;
        category: string;
        barcode: string;
        brand_id: number;
        brands: {
            name: string;
        } | null;
    } | null;
    stores: {
        name: string;
    } | null;
}

type GlobalState = {
    rawData: RawSaleRow[];
    filters: GlobalFilters;
    setFilters: React.Dispatch<React.SetStateAction<GlobalFilters>>;
    loading: boolean;
    refreshData: () => Promise<void>;
};

// --- Context ---
const AppContext = createContext<GlobalState | null>(null);

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

// --- Provider ---
export function AppProvider({ children }: { children: React.ReactNode }) {
    // Default Filters
    const [filters, setFilters] = useState<GlobalFilters>({
        periodUnit: 'day',
        dateRange: {
            start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
            end: new Date().toISOString().split('T')[0]
        },
        store: 'ALL',
        brand: 'ALL',
        category: 'ALL',
        product: 'ALL'
    });

    const [rawData, setRawData] = useState<RawSaleRow[]>([]);
    const [loading, setLoading] = useState(true);

    // Initial Data Load
    useEffect(() => {
        fetchData();
    }, []); // Load once on mount

    const fetchData = async () => {
        setLoading(true);
        try {
            console.log('Fetching Raw Data for Context...');
            let allSalesData: any[] = [];
            let page = 0;
            const pageSize = 1000;
            let hasMore = true;

            // Fetch ALL data (or a large enough window, e.g., last 2 years if needed)
            // For now, we fetch based on a wide default range or just everything?
            // User said "rawData loads once". Let's fetch a reasonable default range, e.g., last 90 days or 1 year?
            // Or maybe the user expects ALL data.
            // Given the "50k limit" discussion, let's fetch based on the filter's date range?
            // BUT user said "rawData loads once, filters change".
            // If we only fetch 30 days, and user changes filter to 60 days, we need to refetch.
            // HOWEVER, the user guide says "rawData is loaded once".
            // I will assume we fetch a sufficiently large dataset or the current filter range.
            // To be safe and follow the "Context" principle, I will fetch the data based on the *initial* range
            // but provide a `refreshData` function to re-fetch if needed (e.g. if user wants to expand range).
            // Actually, for a true "load once" experience, we usually fetch a large chunk (e.g. this year).
            // Let's stick to the current filter range for now to avoid over-fetching,
            // BUT add a dependency on `filters.dateRange`?
            // NO, User said: "rawData is loaded once, does not change".
            // This implies we should fetch EVERYTHING or a very large static set.
            // I will fetch the last 365 days by default to be safe.

            const fetchStart = new Date(new Date().setDate(new Date().getDate() - 365)).toISOString().split('T')[0];
            const fetchEnd = new Date().toISOString().split('T')[0];

            while (hasMore) {
                const from = page * pageSize;
                const to = from + pageSize - 1;

                const { data, error } = await supabase
                    .from('sales')
                    .select(`
                        sale_date,
                        amount,
                        quantity,
                        customer_count,
                        products (
                            name,
                            category,
                            barcode,
                            brand_id,
                            brands (name)
                        ),
                        stores (name)
                    `)
                    .gte('sale_date', fetchStart)
                    .lte('sale_date', `${fetchEnd} 23:59:59`)
                    .range(from, to);

                if (error) throw error;

                if (data && data.length > 0) {
                    allSalesData = [...allSalesData, ...data];
                    if (data.length < pageSize) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    hasMore = false;
                }
            }

            console.log(`Context: Loaded ${allSalesData.length} rows.`);
            setRawData(allSalesData);

        } catch (err) {
            console.error('Error fetching context data:', err);
        } finally {
            setLoading(false);
        }
    };

    const value = useMemo(() => ({
        rawData,
        filters,
        setFilters,
        loading,
        refreshData: fetchData
    }), [rawData, filters, loading]);

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
