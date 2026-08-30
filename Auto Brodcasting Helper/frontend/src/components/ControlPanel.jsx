import React, { useState, useRef, useEffect } from 'react';
import { Settings, Activity, FileSpreadsheet, Search, X } from 'lucide-react';

export function ControlPanel({
    autoReplyEnabled, toggleAutoReply,
    isSalesCountingEnabled, toggleSalesCounting,
    targetUrl, setTargetUrl, handleUrlUpdate, onSaveVideoWindow, onSavePrompterWindow,
    onResetAnalysis, onDownloadReport,
    prompterInput, setPrompterInput, onSendCue,
    recentSales,
    onOpenScannerGuide,
    scannerMode, onToggleScannerMode,
    autoMatchEnabled, onToggleAutoMatch,
    products = [],
    onSelectProduct,
}) {
    const [searchQuery, setSearchQuery] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const searchWrapRef = useRef(null);

    // 제품 검색 필터: 코드 / 브랜드 / 제품명
    const searchResults = searchQuery.trim().length > 0
        ? products.filter(p => {
            const q = searchQuery.toLowerCase();
            return (
                (p.code || '').toLowerCase().includes(q) ||
                (p.brand || '').toLowerCase().includes(q) ||
                (p.name || '').toLowerCase().includes(q)
            );
        })
        : [];

    // 외부 클릭 시 드롭다운 닫기
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectProduct = (product) => {
        onSelectProduct?.(product);
        setSearchQuery('');
        setShowDropdown(false);
        setTimeout(() => {
            const el = document.getElementById(`product-row-${product.id || product.code}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
    };

    return (
        <div className="flex flex-col bg-gray-900 flex-none border-t border-gray-800 h-72">
            <div className="h-12 border-b border-gray-800 flex items-center px-3 bg-gray-800/40 flex-none gap-3">
                <button
                    onClick={onOpenScannerGuide}
                    className="bg-purple-900/40 hover:bg-purple-900/60 text-purple-300 border border-purple-900/50 text-[10px] px-2 py-1 rounded flex items-center gap-1 transition-colors font-medium flex-none"
                >
                    📱 스캐너 가이드
                </button>
                <Settings size={15} className="text-gray-500" />
                <h2 className="font-bold text-sm text-gray-200">Bot Response & Control</h2>
            </div>

            <div className="flex-1 p-4 flex gap-6 h-full min-h-0 overflow-hidden">

                {/* 좌측: 컨트롤 */}
                <div className="w-1/2 space-y-4 overflow-y-auto pr-2">
                    <div className="flex flex-col gap-2 p-3 bg-gray-800/50 rounded border border-yellow-900/30">
                        <span className="text-xs font-semibold text-yellow-500 uppercase tracking-wider">📢 Seller Prompter</span>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                placeholder="Message to Seller..."
                                value={prompterInput}
                                onChange={(e) => setPrompterInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && onSendCue()}
                                className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-yellow-100 focus:border-yellow-500 outline-none"
                            />
                            <button onClick={onSendCue} className="bg-yellow-700 hover:bg-yellow-600 text-white text-xs px-3 py-1 rounded font-bold">
                                SHOW
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Auto-Reply (AI)</span>
                            <div className="flex items-center gap-2">
                                <button onClick={toggleAutoReply} className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none flex-none ${autoReplyEnabled ? 'bg-green-600' : 'bg-gray-700'}`}>
                                    <span className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${autoReplyEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                                <span className={`text-xs font-bold ${autoReplyEnabled ? 'text-green-400' : 'text-gray-500'}`}>{autoReplyEnabled ? 'ON' : 'OFF'}</span>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Scanner Mode</span>
                            <div className="flex items-center gap-2">
                                <button onClick={onToggleScannerMode} className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none flex-none ${scannerMode === 'AUTO' ? 'bg-purple-600' : 'bg-gray-700'}`}>
                                    <span className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${scannerMode === 'AUTO' ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                                <span className={`text-xs font-bold ${scannerMode === 'AUTO' ? 'text-purple-400' : 'text-gray-500'}`}>{scannerMode}</span>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">바코드 매칭</span>
                            <div className="flex items-center gap-2">
                                <button onClick={onToggleAutoMatch} className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none flex-none ${autoMatchEnabled ? 'bg-orange-600' : 'bg-gray-700'}`}>
                                    <span className={`absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${autoMatchEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
                                <span className={`text-xs font-bold ${autoMatchEnabled ? 'text-orange-400' : 'text-gray-500'}`}>{autoMatchEnabled ? 'ON' : 'OFF'}</span>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 col-span-3">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Target URL</span>
                            <div className="flex gap-1">
                                <input type="text" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)}
                                    className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none" />
                                <button onClick={handleUrlUpdate} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1 rounded">Set</button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                <button
                                    onClick={onSaveVideoWindow}
                                    title="지금 배치한 영상창 크기·위치를 저장 — 다음 실행부터 자동 복원"
                                    className="bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 border border-blue-900/50 text-xs px-3 py-1 rounded whitespace-nowrap"
                                >
                                    📐 영상창 저장
                                </button>
                                <button
                                    onClick={onSavePrompterWindow}
                                    title="지금 배치한 프롬프터창 크기·위치를 저장 — 다음 실행부터 자동 복원"
                                    className="bg-purple-900/40 hover:bg-purple-900/60 text-purple-300 border border-purple-900/50 text-xs px-3 py-1 rounded whitespace-nowrap"
                                >
                                    🖥 프롬프터창 저장
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-gray-800">
                        <button onClick={onResetAnalysis} className="flex-1 bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-900/50 text-xs py-1.5 rounded flex items-center justify-center gap-2 transition-colors">
                            <Activity size={12} /> Reset Stats
                        </button>
                        <button onClick={onDownloadReport} className="flex-1 bg-green-900/40 hover:bg-green-900/60 text-green-300 border border-green-900/50 text-xs py-1.5 rounded flex items-center justify-center gap-2 transition-colors font-medium">
                            <FileSpreadsheet size={12} /> Report
                        </button>
                    </div>
                </div>

                {/* 우측: 제품 검색바 + System Logs */}
                <div className="w-1/2 flex flex-col gap-2 min-h-0 overflow-visible">

                    {/* ── 제품 검색바 (System Logs와 무관, 독립적) ── */}
                    <div ref={searchWrapRef} className="flex-none relative">
                        <div className={`flex items-center gap-1.5 rounded px-2 py-1.5 border transition-all ${showDropdown || searchQuery ? 'bg-gray-800 border-blue-500' : 'bg-gray-800/60 border-gray-700 hover:border-gray-600'}`}>
                            <Search size={11} className={`flex-none ${searchQuery ? 'text-blue-400' : 'text-gray-500'}`} />
                            <input
                                type="text"
                                placeholder="제품 검색: 코드 / 브랜드 / 제품명"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setShowDropdown(e.target.value.trim().length > 0);
                                }}
                                onFocus={() => searchQuery.trim() && setShowDropdown(true)}
                                className="flex-1 bg-transparent text-[11px] text-gray-200 placeholder-gray-600 outline-none"
                            />
                            {searchQuery && (
                                <div className="flex items-center gap-1.5 flex-none">
                                    <span className="text-[9px] text-blue-400 font-bold">{searchResults.length}건</span>
                                    <button onClick={() => { setSearchQuery(''); setShowDropdown(false); }} className="text-gray-500 hover:text-gray-300">
                                        <X size={10} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* 드롭다운: 아래 방향 */}
                        {showDropdown && (
                            <div
                                className="absolute left-0 right-0 top-full mt-1 bg-gray-900 border border-gray-600 rounded-lg shadow-2xl overflow-hidden"
                                style={{ zIndex: 9999 }}
                            >
                                <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">검색 결과</span>
                                    <span className="text-[10px] text-blue-400 font-bold">{searchResults.length}건</span>
                                </div>
                                {searchResults.length === 0 ? (
                                    <div className="px-4 py-4 text-center text-gray-600 text-[11px]">일치하는 제품 없음</div>
                                ) : (
                                    <div className="max-h-52 overflow-y-auto">
                                        {searchResults.map((p, idx) => (
                                            <div
                                                key={p.id || p.code || idx}
                                                onClick={() => handleSelectProduct(p)}
                                                className="flex items-center gap-3 px-3 py-2 cursor-pointer border-b border-gray-800/50 hover:bg-gray-800 transition-colors"
                                            >
                                                <span className="text-[9px] font-mono text-purple-300 bg-purple-900/30 border border-purple-800/40 px-1.5 py-0.5 rounded flex-none">
                                                    {p.code || '—'}
                                                </span>
                                                <span className="text-[10px] text-gray-500 flex-none w-16 truncate">{p.brand || '—'}</span>
                                                <span className="text-[11px] font-medium text-white flex-1 truncate">{p.name}</span>
                                                <div className="flex-none text-right">
                                                    <div className="text-xs font-bold text-green-400">
                                                        {p.price ? `₩${p.price.toLocaleString()}` : '—'}
                                                    </div>
                                                    <div className="text-[9px] text-gray-500">
                                                        재고 {(p.stock - (p.sales || 0)).toLocaleString()}개
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── System Logs (기존 그대로) ── */}
                    <div className="flex-1 bg-gray-950 rounded-lg border border-gray-800 flex flex-col overflow-hidden min-h-0">
                        <div className="h-6 bg-gray-900/30 border-b border-gray-800 flex items-center px-3 justify-between flex-none">
                            <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1.5">
                                <Activity size={11} className="text-blue-400" />
                                System Logs
                            </span>
                            <span className="text-[9px] text-gray-500">{recentSales?.length || 0} Events</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {recentSales && recentSales.length > 0 ? (
                                recentSales.map((log, idx) => (
                                    <div key={idx} className={`flex items-start gap-2 text-xs p-1.5 rounded border ${log.intent === 'BOT_REPLY' ? 'bg-blue-900/20 border-blue-800/30' : 'bg-gray-900/30 border-gray-800/50'}`}>
                                        <span className="text-gray-500 font-mono text-[10px] whitespace-nowrap mt-0.5">
                                            {new Date(log.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </span>
                                        {log.intent === 'BOT_REPLY' ? (
                                            <div className="flex-1 min-w-0">
                                                <span className="font-bold text-yellow-500 mr-2">[SYSTEM]</span>
                                                <span className="text-gray-300 break-words">{log.message}</span>
                                            </div>
                                        ) : (
                                            <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1">
                                                <span className="font-bold text-blue-300 truncate max-w-[80px]">{log.nickname}</span>
                                                <span className="text-gray-500">purchased</span>
                                                <span className="font-medium text-white truncate flex-1">{log.message}</span>
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-600 text-xs py-4">
                                    Waiting for events...
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
