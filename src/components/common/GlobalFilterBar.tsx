import React, { useEffect, useState } from 'react';
import { useAppContext, type PeriodUnit } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { Calendar, Store, Tag, ShoppingBag, Layers } from 'lucide-react';

const GlobalFilterBar: React.FC = () => {
    const { filters, setFilters, refreshData } = useAppContext();

    // Local state for dropdown options
    const [stores, setStores] = useState<string[]>([]);
    const [brands, setBrands] = useState<string[]>([]);
    const [categories, setCategories] = useState<string[]>([]);

    // Fetch filter options on mount
    useEffect(() => {
        const fetchOptions = async () => {
            // Stores
            const { data: storeData } = await supabase.from('stores').select('name').order('name');
            if (storeData) setStores(storeData.map(s => s.name));

            // Brands
            const { data: brandData } = await supabase.from('brands').select('name').order('name');
            if (brandData) setBrands(brandData.map(b => b.name));

            // Categories (distinct from products)
            // Note: Supabase doesn't support distinct directly on select easily without RPC or complex query, 
            // but for now let's fetch products and extract unique categories or use a separate categories table if exists.
            // Assuming categories are in products table as 'category' column.
            const { data: productData } = await supabase.from('products').select('category');
            if (productData) {
                const uniqueCategories = Array.from(new Set(productData.map(p => p.category).filter(Boolean)));
                setCategories(uniqueCategories.sort());
            }
        };
        fetchOptions();
    }, []);

    const handlePeriodChange = (unit: PeriodUnit) => {
        setFilters(prev => ({ ...prev, periodUnit: unit }));
    };

    const handleDateChange = (type: 'start' | 'end', value: string) => {
        setFilters(prev => ({
            ...prev,
            dateRange: { ...prev.dateRange, [type]: value }
        }));
    };

    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="bg-white border-b border-slate-200 px-8 py-4 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
                {/* Period Unit Selector */}
                <div className="flex items-center bg-slate-100 rounded-lg p-1">
                    {(['day', 'week', 'month'] as PeriodUnit[]).map((unit) => (
                        <button
                            key={unit}
                            onClick={() => handlePeriodChange(unit)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filters.periodUnit === unit
                                ? 'bg-white text-blue-600 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            {unit === 'day' ? '일간' : unit === 'week' ? '주간' : '월간'}
                        </button>
                    ))}
                </div>

                <div className="h-6 w-px bg-slate-200 mx-2" />

                {/* Date Range Picker */}
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <input
                        type="date"
                        value={filters.dateRange.start}
                        onChange={(e) => handleDateChange('start', e.target.value)}
                        className="border-slate-200 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                    <span className="text-slate-400">~</span>
                    <input
                        type="date"
                        value={filters.dateRange.end}
                        onChange={(e) => handleDateChange('end', e.target.value)}
                        className="border-slate-200 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>

                <div className="flex-1" />

                <button
                    onClick={() => refreshData()}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                    데이터 새로고침
                </button>
            </div>

            {/* Dropdown Filters */}
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 min-w-[150px]">
                    <Store className="w-4 h-4 text-slate-400" />
                    <select
                        value={filters.store}
                        onChange={(e) => handleFilterChange('store', e.target.value)}
                        className="w-full border-slate-200 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="ALL">전체 매장</option>
                        {stores.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                <div className="flex items-center gap-2 min-w-[150px]">
                    <Tag className="w-4 h-4 text-slate-400" />
                    <select
                        value={filters.brand}
                        onChange={(e) => handleFilterChange('brand', e.target.value)}
                        className="w-full border-slate-200 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="ALL">전체 브랜드</option>
                        {brands.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                </div>

                <div className="flex items-center gap-2 min-w-[150px]">
                    <Layers className="w-4 h-4 text-slate-400" />
                    <select
                        value={filters.category}
                        onChange={(e) => handleFilterChange('category', e.target.value)}
                        className="w-full border-slate-200 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="ALL">전체 카테고리</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                <div className="flex items-center gap-2 min-w-[150px]">
                    <ShoppingBag className="w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="상품명 검색..."
                        value={filters.product === 'ALL' ? '' : filters.product}
                        onChange={(e) => handleFilterChange('product', e.target.value || 'ALL')}
                        className="w-full border-slate-200 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
            </div>
        </div>
    );
};

export default GlobalFilterBar;
