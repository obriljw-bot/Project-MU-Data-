import React, { useState } from 'react';
import { Activity, RefreshCw, Trophy, Download } from 'lucide-react';

export function StatsPanel({ trends, completedSales = [], pendingSalesCount = 0, onRematch, onClearCompletedSales }) {
    const [activeTab, setActiveTab] = useState('QUERY'); // 'QUERY' or 'REACTION'

    const downloadCSV = () => {
        if (completedSales.length === 0) return;
        const rows = [
            ['순번', '제품코드', '제품명', '판매수(명)', '매칭상태', '시간'],
            ...completedSales.map((s, i) => [
                i + 1,
                `"${s.code || ''}"`,
                `"${s.productName}"`,
                s.count,
                s.matched ? '완료' : '대기',
                new Date(s.ts).toLocaleString()
            ])
        ];
        const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `completed_sales_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // 클라이언트 측 탭 필터링
    const filteredTrends = trends.filter(t => {
        if (!t.category) return true;
        if (activeTab === 'QUERY') return t.category === 'QUERY';
        if (activeTab === 'REACTION') return t.category === 'PARTICIPATION';
        return true;
    });

    return (
        <div className="col-span-2 border-r border-gray-800 bg-gray-900 flex flex-col overflow-hidden" style={{ height: '100%' }}>

            {/* ── 상단: Live Hot Keywords (ProductTable과 같은 높이 영역) ── */}
            <div className="flex flex-col overflow-hidden min-h-0" style={{ height: 'calc(100% - 21.5rem)' }}>

                {/* 헤더 */}
                <div className="h-12 border-b border-gray-800 flex items-center px-3 bg-gray-800/40 flex-none">
                    <Activity size={14} className="text-red-400 mr-2" />
                    <h2 className="font-bold text-xs text-gray-200">Live Hot Keywords</h2>
                </div>

                {/* 탭 */}
                <div className="h-8 flex gap-1 px-3 border-b border-gray-800 bg-gray-900 items-center flex-none">
                    <button
                        onClick={() => setActiveTab('QUERY')}
                        className={`text-[9px] px-2 py-0.5 rounded ${activeTab === 'QUERY' ? 'bg-blue-900/50 text-blue-200' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        Inquiries
                    </button>
                    <button
                        onClick={() => setActiveTab('REACTION')}
                        className={`text-[9px] px-2 py-0.5 rounded ${activeTab === 'REACTION' ? 'bg-red-900/50 text-red-200' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        Reactions
                    </button>
                </div>

                {/* 키워드 목록 — 남은 공간 전체 스크롤 */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
                    {filteredTrends.length > 0 ? (
                        filteredTrends.map((t, idx) => (
                            <div key={idx} className="group">
                                <div className="flex justify-between items-end mb-0.5">
                                    <span className={`text-[11px] font-medium leading-tight truncate px-0.5 ${idx < 3 ? 'text-white' : 'text-gray-400'}`}>
                                        {idx + 1}. {t.term}
                                    </span>
                                    <span className="text-[9px] text-gray-500">{t.frequency}</span>
                                </div>
                                <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        style={{ width: `${Math.min((t.frequency / (filteredTrends[0]?.frequency || 1)) * 100, 100)}%` }}
                                        className={`h-full rounded-full ${idx < 3 ? 'bg-red-500' : 'bg-blue-600'} opacity-80`}
                                    />
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-600 text-[10px]">
                            No Data
                        </div>
                    )}
                </div>
            </div>

            {/* ── 하단: Completed Sales (Stats bar + ControlPanel과 나란히) ── */}
            <div className="flex flex-col overflow-hidden border-t border-gray-800" style={{ height: '21.5rem' }}>

                {/* 헤더 */}
                <div className="flex items-center justify-between px-2 py-1.5 bg-gray-800/70 flex-none border-b border-gray-800">
                    <div className="flex items-center gap-1.5">
                        <Trophy size={11} className="text-yellow-500" />
                        <span className="text-[10px] font-bold text-gray-200 uppercase tracking-wider">
                            Completed Sales
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={downloadCSV}
                            className="flex items-center gap-0.5 text-[9px] text-gray-500 hover:text-blue-300 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-700"
                            title="CSV 다운로드"
                        >
                            <Download size={8} /> CSV
                        </button>
                        <button
                            onClick={onRematch}
                            className="flex items-center gap-0.5 text-[9px] text-orange-400 hover:text-orange-200 font-bold transition-colors px-1.5 py-0.5 rounded hover:bg-orange-900/30"
                            title="대기 판매 재매칭 시도"
                        >
                            <RefreshCw size={8} /> 갱신
                        </button>
                        <button
                            onClick={onClearCompletedSales}
                            className="text-[9px] text-gray-600 hover:text-red-400 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-700"
                            title="전체 기록 초기화"
                        >
                            초기화
                        </button>
                    </div>
                </div>

                {/* 기록 목록 */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    {completedSales.length > 0 ? (
                        completedSales.map((sale, idx) => {
                            const isPending = sale.matched === false;
                            return (
                                <div
                                    key={sale.id || idx}
                                    className={`flex items-center gap-2 px-2 py-1 border-b border-gray-800/40 hover:bg-gray-800/40 transition-colors ${isPending ? 'border-l-2 border-l-red-600/70 bg-red-900/10' : 'border-l-2 border-l-green-700/40'}`}
                                >
                                    <span className="text-[8px] text-gray-600 flex-none w-4 text-right">{idx + 1}</span>
                                    <span className={`text-[10px] flex-none ${isPending ? 'text-red-400' : 'text-green-500'}`}>
                                        {isPending ? '⏳' : '✓'}
                                    </span>
                                    {sale.code ? (
                                        <span className={`text-[8px] font-mono px-1 py-0.5 rounded flex-none leading-none ${isPending ? 'text-red-300 bg-red-900/30 border border-red-800/40' : 'text-purple-300 bg-purple-900/20 border border-purple-800/30'}`}>
                                            {sale.code}
                                        </span>
                                    ) : (
                                        <span className="text-[8px] text-gray-700 flex-none">—</span>
                                    )}
                                    <span className={`text-[9px] truncate flex-1 ${isPending ? 'text-red-200/80' : 'text-gray-300'} font-medium`}>
                                        {sale.productName}
                                    </span>
                                    <span className={`text-[10px] font-bold flex-none ${isPending ? 'text-red-400' : 'text-yellow-400'}`}>
                                        {sale.count}개
                                    </span>
                                    <span className="text-[8px] text-gray-600 flex-none">
                                        {new Date(sale.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            );
                        })
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-600">
                            <Trophy size={20} className="opacity-20" />
                            <span className="text-[10px]">판매 완료 기록 없음</span>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
