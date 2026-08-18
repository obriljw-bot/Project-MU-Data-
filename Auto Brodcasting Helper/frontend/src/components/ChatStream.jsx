import React, { useRef, useEffect } from 'react';
import { MessageSquare, Zap, Send, ShoppingBag, MapPin, Settings } from 'lucide-react';

function getIconForIntent(intent) {
    switch (intent) {
        case 'BUY': return <ShoppingBag size={14} className="text-red-500" />;
        case 'INQUIRY': return <MessageSquare size={14} className="text-blue-500" />;
        case 'LOCATION': return <MapPin size={14} className="text-green-500" />;
        case 'REACTION': return <Zap size={14} className="text-yellow-500" />;
        default: return <div className="w-4" />;
    }
}

function getNameColor(intent) {
    switch (intent) {
        case 'BUY': return 'text-red-400';
        case 'INQUIRY': return 'text-blue-400';
        case 'LOCATION': return 'text-green-400';
        case 'BOT_REPLY': return 'text-yellow-400';
        default: return 'text-gray-400';
    }
}

function getIntentBorder(intent) {
    switch (intent) {
        case 'BUY': return 'border-red-900/50 bg-red-900/10';
        case 'INQUIRY': return 'border-blue-900/50 bg-blue-900/10';
        default: return 'border-transparent bg-gray-800';
    }
}

function fmtCountdown(sec) {
    if (!sec || sec <= 0) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

export function ChatStream({
    messages,
    chatInput,
    setChatInput,
    onSend,
    announcerEnabled,
    onToggleAnnouncer,
    announcerCountdown,
    nextMessage = "Next Auto Message...",
    onOpenAnnouncerSettings,
    quickSends = [],
    quickCountdowns = [],
    onQuickSend,
    chatViewMode = 'NORMAL',
    onToggleChatViewMode
}) {
    const chatEndRef = useRef(null);

    useEffect(() => {
        setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
    }, [messages]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend(e);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-900 overflow-hidden">
            {/* Header */}
            <div className="h-12 border-b border-gray-800 flex items-center px-4 bg-gray-800/40 flex-none">
                <MessageSquare size={16} className="text-blue-400 mr-2" />
                <h2 className="font-bold text-sm text-gray-200">Real-time Live Chat</h2>
                <div className="ml-auto flex items-center gap-1.5">
                    <button
                        onClick={onToggleChatViewMode}
                        title="순수채팅모드: 시스템/선착순 안내 메시지 제외하고 사람 채팅만 표시"
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-colors
                            ${chatViewMode === 'PURE'
                                ? 'bg-green-900/40 text-green-300 border-green-700/60'
                                : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'}`}
                    >
                        {chatViewMode === 'PURE' ? '👤 순수채팅' : '📋 일반모드'}
                    </button>
                    <span className="text-[10px] bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded-full">Stream</span>
                </div>
            </div>

            {/* Chat List (Fills Middle) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 chat-scroll bg-gray-900/50">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50">
                        <MessageSquare size={48} className="mb-2" />
                        <p className="text-sm">Waiting for messages...</p>
                    </div>
                )}
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 text-sm ${msg.intent === 'BOT_REPLY' ? 'pl-4' : ''}`}>
                        <div className="flex-none mt-0.5">
                            {msg.intent === 'BOT_REPLY' ? (
                                <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
                                    <Zap size={14} className="text-blue-400" />
                                </div>
                            ) : (
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${getIntentBorder(msg.intent)} bg-gray-800`}>
                                    {getIconForIntent(msg.intent)}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                                <span className={`font-bold text-xs ${getNameColor(msg.intent)} truncate`}>
                                    {msg.nickname}
                                </span>
                                <span className="text-[10px] text-gray-600">
                                    {new Date(msg.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                            </div>
                            <p className={`text-gray-300 leading-snug break-words mt-0.5 ${msg.intent === 'BOT_REPLY' ? 'text-blue-100 italic' : ''}`}>
                                {msg.intent === 'BOT_REPLY' ? `🤖 ${msg.message}` : msg.message}
                            </p>
                        </div>
                    </div>
                ))}
                <div ref={chatEndRef} />
            </div>

            {/* Bottom Section: Announcer Preview & Manual Input */}
            <div className="flex flex-col flex-none">
                {/* Auto Announcer Preview Area */}
                <div className="bg-gray-800/80 border-t border-gray-700 px-4 py-2 flex items-center gap-3 relative overflow-hidden">
                    {announcerEnabled && (
                        <div className="absolute bottom-0 left-0 h-0.5 bg-blue-600/50 transition-all duration-1000" style={{ width: `${(announcerCountdown / 60) * 100}%` }}></div>
                    )}
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[10px] text-gray-500 uppercase font-black tracking-wider flex items-center gap-1.5">
                            <Zap size={10} className={announcerEnabled ? "text-blue-400" : "text-gray-600"} />
                            NEXT MSG
                        </span>
                        <div className="text-[11px] text-blue-300 truncate font-medium italic">
                            {announcerEnabled ? `"${nextMessage}"` : "Auto Announcer is OFF"}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 border-l border-gray-700 pl-3">
                        <div className="text-center mr-1">
                            <div className={`text-base font-mono font-black ${announcerEnabled ? 'text-blue-400' : 'text-gray-700'}`}>
                                {announcerCountdown}s
                            </div>
                        </div>
                        <button
                            onClick={onToggleAnnouncer}
                            className={`px-2 py-0.5 rounded border text-[9px] font-black transition-all ${
                                announcerEnabled ? 'bg-green-600 border-green-400 text-white' : 'bg-gray-700 border-gray-600 text-gray-500'
                            }`}
                        >
                            {announcerEnabled ? 'ON' : 'OFF'}
                        </button>
                        <button onClick={onOpenAnnouncerSettings} className="p-1 text-gray-500 hover:text-white">
                            <Settings size={14} />
                        </button>
                    </div>
                </div>

                {/* Quick Send Buttons */}
                {quickSends.length > 0 && (
                    <div className="border-t border-gray-800 bg-gray-800/50 px-3 py-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[8px] text-cyan-500 font-black uppercase tracking-wider flex-none">Quick</span>
                        {quickSends.map((q, i) => {
                            const hasText = !!q.text?.trim();
                            const cd = q.timerOn && hasText ? fmtCountdown(quickCountdowns[i]) : '';
                            return (
                                <button
                                    key={i}
                                    onClick={() => onQuickSend && onQuickSend(i)}
                                    title={hasText ? q.text : '설정에서 문구를 입력하세요'}
                                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all active:scale-95 flex items-center gap-1
                                        ${hasText
                                            ? 'bg-cyan-900/40 text-cyan-200 border-cyan-700/60 hover:bg-cyan-800/50'
                                            : 'bg-gray-800 text-gray-600 border-gray-700 hover:text-gray-400'}`}
                                >
                                    ⚡ {q.label || `#${i + 1}`}
                                    {cd && <span className="font-mono text-[8px] text-cyan-400/80">({cd})</span>}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Manual Input Area */}
                <div className="h-32 border-t border-gray-800 bg-gray-800/30 p-3">
                    <form onSubmit={onSend} className="flex flex-col gap-2 h-full">
                        <textarea
                            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg resize-none p-2 text-sm text-white focus:border-blue-500 outline-none"
                            placeholder="Manual message..."
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <div className="flex justify-between items-center h-6">
                            <span className="text-[9px] text-gray-600 italic">Enter to send</span>
                            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-4 py-1 rounded flex items-center gap-2 font-bold transition-all shadow-lg active:scale-95">
                                <Send size={12} /> SEND
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
