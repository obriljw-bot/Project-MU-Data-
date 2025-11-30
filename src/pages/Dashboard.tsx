import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { DollarSign, ShoppingBag, TrendingUp, Users, Filter, RefreshCw } from 'lucide-react';

const StatCard = ({ title, value, subValue, icon: Icon, color }: any) => (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-lg ${color}`}>
                <Icon size={24} className="text-white" />
            </div>
        </div>
        <h3 className="text-slate-500 text-sm font-medium">{title}</h3>
        <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
        {subValue && <p className="text-xs text-slate-400 mt-1">{subValue}</p>}
    </div>
);

const Dashboard = () => {
    const [data, setData] = useState<any[]>([]);
    const [stats, setStats] = useState({
        sales: 0,
        qty: 0,
        customers: 0,
        atv: 0,
        upt: 0,
        sellThrough: 0
    });
    const [loading, setLoading] = useState(true);

    // Filters
    const [brands, setBrands] = useState<any[]>([]);
    const [stores, setStores] = useState<any[]>([]);
    const [filters, setFilters] = useState({
        brandId: '',
        storeId: '',
        startDate: '',
        endDate: ''
    });

    useEffect(() => {
        // Load Metadata
        fetch('/api/meta')
            .then(res => res.json())
            .then(meta => {
                setBrands(meta.brands);
                setStores(meta.stores);
            });
    }, []);

    useEffect(() => {
        fetchData();
    }, [filters]);

    const fetchData = () => {
        setLoading(true);
        const query = new URLSearchParams(filters as any).toString();

        // 1. Fetch Chart Data
        fetch(`/api/dashboard?${query}`)
            .then(res => res.json())
            .then(fetchedData => {
                if (Array.isArray(fetchedData)) {
                    const formattedData = fetchedData.map((item: any) => ({
                        name: item.date ? item.date.substring(5) : 'N/A',
                        sales: item.total_sales || 0,
                        qty: item.total_qty || 0,
                        customers: item.total_customers || 0
                    }));
                    setData(formattedData.reverse());
                }
            });

        // 2. Fetch Deep Analysis Metrics
        fetch(`/api/analysis/deep?${query}`)
            .then(res => res.json())
            .then(metrics => {
                setStats({
                    sales: metrics.total_sales,
                    qty: metrics.total_qty,
                    customers: metrics.total_customers,
                    atv: metrics.atv,
                    upt: metrics.upt,
                    sellThrough: metrics.sell_through
                });
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
    };

    return (
        <div className="space-y-8">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2 text-slate-600 font-medium">
                    <Filter size={20} />
                    <span>필터</span>
                </div>

                <select
                    name="brandId"
                    value={filters.brandId}
                    onChange={handleFilterChange}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                    <option value="">전체 브랜드</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>

                <select
                    name="storeId"
                    value={filters.storeId}
                    onChange={handleFilterChange}
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                    <option value="">전체 매장</option>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>

                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        name="startDate"
                        value={filters.startDate}
                        onChange={handleFilterChange}
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                    <span className="text-slate-400">~</span>
                    <input
                        type="date"
                        name="endDate"
                        value={filters.endDate}
                        onChange={handleFilterChange}
                        className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    />
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="총 매출"
                    value={`₩${stats.sales.toLocaleString()}`}
                    subValue={`객단가(ATV): ₩${stats.atv.toLocaleString()}`}
                    icon={DollarSign}
                    color="bg-blue-500"
                />
                <StatCard
                    title="총 판매량"
                    value={stats.qty.toLocaleString()}
                    subValue={`객수량(UPT): ${stats.upt}`}
                    icon={ShoppingBag}
                    color="bg-indigo-500"
                />
                <StatCard
                    title="판매율 (Sell-Through)"
                    value={`${stats.sellThrough}%`}
                    subValue="재고 효율성 지표"
                    icon={RefreshCw}
                    color="bg-emerald-500"
                />
                <StatCard
                    title="총 결제건수"
                    value={stats.customers.toLocaleString()}
                    subValue="실제 구매 고객 수"
                    icon={Users}
                    color="bg-orange-500"
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">일별 매출 추이</h3>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip formatter={(value: number) => `₩${value.toLocaleString()}`} />
                                <Line type="monotone" dataKey="sales" stroke="#0070C0" strokeWidth={3} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">일별 판매량</h3>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip />
                                <Bar dataKey="qty" fill="#C00000" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
