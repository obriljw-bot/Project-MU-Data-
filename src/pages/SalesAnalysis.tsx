import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts';
import { TrendingUp, Grid, Calendar, Store, Tag, AlertCircle, ArrowUpRight, ArrowDownRight, MousePointerClick } from 'lucide-react';

const SalesAnalysis = () => {
    const [activeTab, setActiveTab] = useState('abc');
    const [loading, setLoading] = useState(false);

    // Data States
    const [abcData, setAbcData] = useState<any[]>([]);
    const [heatmapData, setHeatmapData] = useState<any[]>([]);
    const [pivotData, setPivotData] = useState<any[]>([]);
    const [insights, setInsights] = useState<any[]>([]);

    // Store/Brand Analysis States
    const [storeData, setStoreData] = useState<any>(null);
    const [brandData, setBrandData] = useState<any>(null);
    const [selectedStoreId, setSelectedStoreId] = useState('');
    const [selectedBrandId, setSelectedBrandId] = useState('');

    // Product Trend State
    const [selectedProduct, setSelectedProduct] = useState<{ id: string, name: string } | null>(null);
    const [productTrend, setProductTrend] = useState<any[]>([]);

    // Metadata
    const [meta, setMeta] = useState<{ brands: any[], stores: any[] }>({ brands: [], stores: [] });

    useEffect(() => {
        fetch('/api/meta').then(res => res.json()).then(setMeta);
        fetch('/api/analysis/insights').then(res => res.json()).then(setInsights);
    }, []);

    useEffect(() => {
        fetchData();
    }, [activeTab, selectedStoreId, selectedBrandId]);

    // Fetch Trend when product selected
    useEffect(() => {
        if (selectedProduct) {
            fetch(`/api/analysis/product/trend?productId=${selectedProduct.id}`)
                .then(res => res.json())
                .then(data => {
                    setProductTrend(data.map((d: any) => ({ ...d, date: d.date.substring(5) })));
                });
        } else {
            setProductTrend([]);
        }
    }, [selectedProduct]);

    const fetchData = () => {
        setLoading(true);
        if (activeTab === 'abc') {
            fetch('/api/analysis/abc').then(res => res.json()).then(d => { setAbcData(d); setLoading(false); });
        } else if (activeTab === 'heatmap') {
            fetch('/api/analysis/heatmap').then(res => res.json()).then(d => {
                const days = ['일', '월', '화', '수', '목', '금', '토'];
                setHeatmapData(d.map((x: any) => ({ name: days[parseInt(x.day_of_week)], value: x.total_sales })));
                setLoading(false);
            });
        } else if (activeTab === 'pivot') {
            fetch('/api/analysis/pivot?groupBy=brand').then(res => res.json()).then(d => { setPivotData(d); setLoading(false); });
        } else if (activeTab === 'store' && selectedStoreId) {
            fetch(`/api/analysis/store?storeId=${selectedStoreId}`).then(res => res.json()).then(d => { setStoreData(d); setLoading(false); });
        } else if (activeTab === 'brand' && selectedBrandId) {
            fetch(`/api/analysis/brand?brandId=${selectedBrandId}`).then(res => res.json()).then(d => {
                setBrandData(d);
                // Auto-select first monthly best product for trend
                if (d.bestMonthly && d.bestMonthly.length > 0) {
                    setSelectedProduct({ id: d.bestMonthly[0].id, name: d.bestMonthly[0].name });
                }
                setLoading(false);
            });
        } else {
            setLoading(false);
        }
    };

    const renderInsights = () => (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {insights.map((insight, idx) => (
                <div key={idx} className={`p-4 rounded-lg border flex items-start gap-3 ${insight.type === 'positive' ? 'bg-green-50 border-green-200 text-green-800' :
                        insight.type === 'negative' ? 'bg-red-50 border-red-200 text-red-800' :
                            'bg-yellow-50 border-yellow-200 text-yellow-800'
                    }`}>
                    {insight.type === 'positive' ? <ArrowUpRight className="shrink-0" /> :
                        insight.type === 'negative' ? <ArrowDownRight className="shrink-0" /> :
                            <AlertCircle className="shrink-0" />}
                    <p className="text-sm font-medium">{insight.msg}</p>
                </div>
            ))}
        </div>
    );

    const renderBestSellerList = (title: string, items: any[]) => (
        <div className="bg-white p-6 rounded-xl border border-slate-200">
            <h3 className="font-bold mb-4 text-slate-800 flex items-center gap-2">
                {title}
                <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded-full flex items-center gap-1">
                    <MousePointerClick size={12} /> 클릭하여 추이 확인
                </span>
            </h3>
            <ul className="space-y-3">
                {items && items.map((p: any, idx: number) => (
                    <li
                        key={idx}
                        onClick={() => setSelectedProduct({ id: p.id, name: p.name })}
                        className={`flex justify-between items-center p-3 rounded-lg cursor-pointer transition-all ${selectedProduct?.id === p.id
                                ? 'bg-primary-light border border-primary text-primary'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                            }`}
                    >
                        <div>
                            <span className="block font-medium">{idx + 1}. {p.name}</span>
                            <span className="text-xs opacity-70">{p.total_qty}개 판매</span>
                        </div>
                        <span className="font-bold">₩{p.total_sales.toLocaleString()}</span>
                    </li>
                ))}
                {(!items || items.length === 0) && <li className="text-slate-400 text-sm text-center py-4">데이터가 없습니다.</li>}
            </ul>
        </div>
    );

    const renderContent = () => {
        if (loading && activeTab !== 'store' && activeTab !== 'brand') return <div className="p-8 text-center">데이터 분석 중...</div>;

        switch (activeTab) {
            case 'abc':
                return (
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800 mb-6">상품 ABC 등급 분석</h3>
                        <div className="h-96 overflow-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0">
                                    <tr>
                                        <th className="p-3">등급</th>
                                        <th className="p-3">상품명</th>
                                        <th className="p-3">브랜드</th>
                                        <th className="p-3 text-right">매출액</th>
                                        <th className="p-3 text-right">판매량</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {abcData.slice(0, 100).map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded text-xs font-bold text-white ${item.grade === 'A' ? 'bg-green-500' :
                                                        item.grade === 'B' ? 'bg-yellow-500' : 'bg-red-500'
                                                    }`}>
                                                    {item.grade}
                                                </span>
                                            </td>
                                            <td className="p-3">{item.product_name}</td>
                                            <td className="p-3 text-slate-500">{item.brand_name}</td>
                                            <td className="p-3 text-right">₩{item.total_amount.toLocaleString()}</td>
                                            <td className="p-3 text-right">{item.total_qty.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            case 'store':
                return (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <select
                                className="border p-2 rounded-lg"
                                value={selectedStoreId}
                                onChange={(e) => setSelectedStoreId(e.target.value)}
                            >
                                <option value="">매장을 선택하세요</option>
                                {meta.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>

                        {storeData && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-xl border border-slate-200">
                                    <h3 className="font-bold mb-4">주차별 매출 추이 (Weekly Peak)</h3>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={storeData.weekly}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                <XAxis dataKey="week_num" tickFormatter={(v) => `${v}주차`} />
                                                <YAxis />
                                                <Tooltip />
                                                <Bar dataKey="total_sales" fill="#3b82f6" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-xl border border-slate-200">
                                    <h3 className="font-bold mb-4">Top 5 브랜드</h3>
                                    <ul className="space-y-3">
                                        {storeData.topBrands.map((b: any, idx: number) => (
                                            <li key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                                                <span className="font-medium text-slate-700">{idx + 1}. {b.name}</span>
                                                <span className="font-bold text-slate-900">₩{b.total_sales.toLocaleString()}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 'brand':
                return (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <select
                                className="border p-2 rounded-lg"
                                value={selectedBrandId}
                                onChange={(e) => setSelectedBrandId(e.target.value)}
                            >
                                <option value="">브랜드를 선택하세요</option>
                                {meta.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>

                        {brandData && (
                            <>
                                {/* Inventory Health */}
                                <div className="bg-white p-6 rounded-xl border border-slate-200">
                                    <h3 className="font-bold mb-4">적정 재고 분석 (Optimal Inventory)</h3>
                                    <div className="overflow-auto max-h-60">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="p-2 text-left">상품명</th>
                                                    <th className="p-2 text-right">현재고</th>
                                                    <th className="p-2 text-right">목표재고</th>
                                                    <th className="p-2 text-center">상태</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {brandData.inventoryHealth.map((item: any, idx: number) => (
                                                    <tr key={idx} className="border-b">
                                                        <td className="p-2">{item.product}</td>
                                                        <td className="p-2 text-right">{item.stock}</td>
                                                        <td className="p-2 text-right text-slate-500">{item.target}</td>
                                                        <td className="p-2 text-center">
                                                            <span className={`px-2 py-1 rounded text-xs font-bold ${item.status === 'Low' ? 'bg-red-100 text-red-600' :
                                                                    item.status === 'High' ? 'bg-orange-100 text-orange-600' :
                                                                        'bg-green-100 text-green-600'
                                                                }`}>
                                                                {item.status === 'Low' ? '부족' : item.status === 'High' ? '과다' : '적정'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Best Sellers Grid */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {renderBestSellerList("이달의 베스트 (Monthly)", brandData.bestMonthly)}
                                    {renderBestSellerList("금주의 베스트 (Weekly)", brandData.bestWeekly)}
                                </div>

                                {/* Trend Chart */}
                                {selectedProduct && (
                                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-fade-in">
                                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                                            <TrendingUp className="text-primary" />
                                            [{selectedProduct.name}] 판매 추이 (최근 30일)
                                        </h3>
                                        <div className="h-80 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={productTrend}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="date" />
                                                    <YAxis yAxisId="left" />
                                                    <YAxis yAxisId="right" orientation="right" />
                                                    <Tooltip />
                                                    <Line yAxisId="left" type="monotone" dataKey="qty" name="판매수량" stroke="#3b82f6" strokeWidth={2} />
                                                    <Line yAxisId="right" type="monotone" dataKey="amount" name="매출액" stroke="#10b981" strokeWidth={2} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                );
            case 'heatmap':
                return (
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800 mb-6">요일별 매출 패턴</h3>
                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={heatmapData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip formatter={(value: number) => `₩${value.toLocaleString()}`} />
                                    <Bar dataKey="value" fill="#8884d8">
                                        {heatmapData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={`rgba(79, 70, 229, ${0.3 + (index / 7)})`} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                );
            case 'pivot':
                return (
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800 mb-6">브랜드별 성과 요약</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-medium">
                                    <tr>
                                        <th className="p-3">브랜드명</th>
                                        <th className="p-3 text-right">총 매출</th>
                                        <th className="p-3 text-right">판매수량</th>
                                        <th className="p-3 text-right">객수(결제건수)</th>
                                        <th className="p-3 text-right">객단가(ATV)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pivotData.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-3 font-medium">{row.group_name}</td>
                                            <td className="p-3 text-right">₩{row.total_sales.toLocaleString()}</td>
                                            <td className="p-3 text-right">{row.total_qty.toLocaleString()}</td>
                                            <td className="p-3 text-right">{row.total_customers.toLocaleString()}</td>
                                            <td className="p-3 text-right">₩{Math.round(row.total_sales / row.total_customers).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">매출 상세 분석 & 인사이트</h2>

            {renderInsights()}

            {/* Tabs */}
            <div className="flex gap-4 border-b border-slate-200 overflow-x-auto">
                <button onClick={() => setActiveTab('abc')} className={`pb-3 px-1 flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'abc' ? 'border-b-2 border-primary text-primary font-bold' : 'text-slate-500'}`}>
                    <TrendingUp size={18} /> ABC 등급
                </button>
                <button onClick={() => setActiveTab('store')} className={`pb-3 px-1 flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'store' ? 'border-b-2 border-primary text-primary font-bold' : 'text-slate-500'}`}>
                    <Store size={18} /> 지점별 분석
                </button>
                <button onClick={() => setActiveTab('brand')} className={`pb-3 px-1 flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'brand' ? 'border-b-2 border-primary text-primary font-bold' : 'text-slate-500'}`}>
                    <Tag size={18} /> 브랜드별 분석
                </button>
                <button onClick={() => setActiveTab('pivot')} className={`pb-3 px-1 flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'pivot' ? 'border-b-2 border-primary text-primary font-bold' : 'text-slate-500'}`}>
                    <Grid size={18} /> 성과 요약
                </button>
                <button onClick={() => setActiveTab('heatmap')} className={`pb-3 px-1 flex items-center gap-2 whitespace-nowrap transition-colors ${activeTab === 'heatmap' ? 'border-b-2 border-primary text-primary font-bold' : 'text-slate-500'}`}>
                    <Calendar size={18} /> 요일별 패턴
                </button>
            </div>

            {renderContent()}
        </div>
    );
};

export default SalesAnalysis;
