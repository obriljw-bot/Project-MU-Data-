import React, { useState, useEffect, useRef } from 'react';
import { Megaphone, Play, Square, Settings, RefreshCw, MessageCircle } from 'lucide-react';

export function AutoAnnouncerPanel({ selectedProduct, socket, isConnected }) {
    const [enabled, setEnabled] = useState(false);
    const [intervalSec, setIntervalSec] = useState(60);
    const [template, setTemplate] = useState('📢 [{name}] {expiry} - {snippet}');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [lastSentTime, setLastSentTime] = useState(null);
    const [history, setHistory] = useState([]);

    const timerRef = useRef(null);

    // Parsing snippets from selected product keywords
    const getSnippets = () => {
        if (!selectedProduct || !selectedProduct.keywords) return [];
        const raw = Array.isArray(selectedProduct.keywords) 
            ? selectedProduct.keywords.join(', ') 
            : String(selectedProduct.keywords);
        
        // Split by #, filter empty, and trim
        return raw.split('#').filter(s => s.trim()).map(s => '#' + s.trim());
    };

    const snippets = getSnippets();
    const availableItems = ['[제품명]', '[유통기한]', ...snippets.map((_, i) => `[키워드 #${i + 1}]`)];

    // Generate the message based on template and index
    const generateMessage = (idx) => {
        if (!selectedProduct) return "상품을 먼저 선택해주세요.";
        
        let msg = template
            .replace('{name}', selectedProduct.name || '')
            .replace('{expiry}', selectedProduct.expiry ? `유통기한: ${selectedProduct.expiry}` : '');

        const currentSnippet = snippets[idx] || '';
        msg = msg.replace('{snippet}', currentSnippet);
        
        return msg.trim();
    };

    const nextMessage = generateMessage(currentIndex);

    const handleSendNow = () => {
        if (!isConnected || !socket || !selectedProduct) return;
        
        const msg = generateMessage(currentIndex);
        socket.send(JSON.stringify({ 
            type: 'SEND_CHAT', 
            message: msg,
            requestId: `auto_${Date.now()}`
        }));
        
        setLastSentTime(Date.now());
        setHistory(prev => [{ ts: Date.now(), msg }, ...prev].slice(0, 5));
        
        // Move to next snippet for the automatic cycle
        if (snippets.length > 0) {
            setCurrentIndex((currentIndex + 1) % snippets.length);
        }
    };

    // Auto-cycle timer
    useEffect(() => {
        if (enabled && isConnected && selectedProduct) {
            timerRef.current = setInterval(() => {
                handleSendNow();
            }, intervalSec * 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [enabled, intervalSec, isConnected, selectedProduct, currentIndex, template]);

    return (
        <div className="bg-gray-900/50 border-t border-gray-800 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Megaphone size={18} className={enabled ? "text-green-400 animate-pulse" : "text-gray-500"} />
                    <h3 className="text-sm font-bold text-gray-200">자동 정보 공지 (Announcer)</h3>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${enabled ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}>
                        {enabled ? 'RUNNING' : 'STOPPED'}
                    </span>
                    <button 
                        onClick={() => setEnabled(!enabled)}
                        className={`p-1.5 rounded-lg transition-all ${enabled ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                    >
                        {enabled ? <Square size={16} /> : <Play size={16} />}
                    </button>
                </div>
            </div>

            {/* Settings Row */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase font-bold">공지 간격 (초)</label>
                    <div className="flex items-center gap-2">
                        <input 
                            type="range" min="10" max="300" step="10" 
                            value={intervalSec} 
                            onChange={(e) => setIntervalSec(Number(e.target.value))}
                            className="flex-1 accent-blue-500"
                        />
                        <span className="text-xs font-mono text-blue-400 w-8">{intervalSec}s</span>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase font-bold">메시지 조합 템플릿</label>
                    <input 
                        type="text" 
                        value={template}
                        onChange={(e) => setTemplate(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs outline-none focus:border-blue-500"
                        placeholder="예: {name} - {snippet}"
                    />
                </div>
            </div>

            {/* Preview Area */}
            <div className="bg-gray-950 rounded-lg p-3 border border-gray-800 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 uppercase font-bold">다음에 전송될 메시지</span>
                    <button 
                        onClick={() => setCurrentIndex((currentIndex + 1) % (snippets.length || 1))}
                        className="text-gray-500 hover:text-white"
                        title="Skip to next snippet"
                    >
                        <RefreshCw size={12} />
                    </button>
                </div>
                <div className="text-xs text-green-300 font-medium break-all bg-green-900/10 p-2 rounded border border-green-900/20 italic">
                    "{nextMessage}"
                </div>
            </div>

            {/* Recent History (Optional) */}
            {history.length > 0 && (
                <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 uppercase font-bold">최근 공지 내역</span>
                    <div className="space-y-1">
                        {history.slice(0, 2).map((h, i) => (
                            <div key={i} className="text-[10px] text-gray-400 flex gap-2">
                                <span className="text-gray-600 shrink-0">{new Date(h.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                <span className="truncate opacity-60">{h.msg}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
