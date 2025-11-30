import { useEffect, useState } from 'react';
import { Download, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const AnalysisPage = () => {
    const [abcData, setAbcData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/analysis/abc')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setAbcData(data);
                } else {
                    console.error('Invalid ABC data:', data);
                    setAbcData([]);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const handleExport = () => {
        window.location.href = '/api/export/brand';
    };

    const getGradeColor = (grade: string) => {
        switch (grade) {
            case 'A': return '#22c55e'; // Green
            case 'B': return '#eab308'; // Yellow
            case 'C': return '#ef4444'; // Red
            default: return '#94a3b8';
        }
    };

    if (loading) return <div className="p-8 text-center">분석 중...</div>;

    const gradeCounts = [
        { name: 'A등급 (상위 20%)', count: abcData.filter(i => i.grade === 'A').length, color: '#22c55e' },
        { name: 'B등급 (중위 30%)', count: abcData.filter(i => i.grade === 'B').length, color: '#eab308' },
        { name: 'C등급 (하위 50%)', count: abcData.filter(i => i.grade === 'C').length, color: '#ef4444' },
    ];

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">고급 분석 & 리포트</h2>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                    <Download size={20} />
                    <span>전체 리포트 다운로드 (.xlsx)</span>
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <TrendingUp className="text-primary" />
                    상품 ABC 분석 (매출 기여도 기반)
                </h3>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="h-64 w-full lg:col-span-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={gradeCounts}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="count">
                                    {gradeCounts.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="lg:col-span-2 overflow-auto max-h-96">
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
                                {abcData.slice(0, 50).map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="p-3">
                                            <span
                                                className="px-2 py-1 rounded text-xs font-bold text-white"
                                                style={{ backgroundColor: getGradeColor(item.grade) }}
                                            >
                                                {item.grade}
                                            </span>
                                        </td>
                                        <td className="p-3 font-medium text-slate-800">{item.product_name}</td>
                                        <td className="p-3 text-slate-500">{item.brand_name}</td>
                                        <td className="p-3 text-right">₩{item.total_amount.toLocaleString()}</td>
                                        <td className="p-3 text-right">{item.total_qty.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {abcData.length > 50 && (
                            <div className="p-3 text-center text-slate-400 text-xs border-t">
                                상위 50개 항목만 표시됩니다.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnalysisPage;
