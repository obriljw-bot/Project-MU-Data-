import React from 'react';
import { X, Settings, Clock, List, Layout } from 'lucide-react';

export function AnnouncerSettingsModal({ isOpen, onClose, interval, setInterval, templates, setTemplates, order, setOrder }) {
    if (!isOpen) return null;

    const handleTemplateChange = (idx, value) => {
        const newTemplates = [...templates];
        newTemplates[idx] = value;
        setTemplates(newTemplates);
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-md">
            <div className="bg-gray-900 border border-gray-700 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="bg-gray-800 px-6 py-4 flex items-center justify-between border-b border-gray-700">
                    <div className="flex items-center gap-2">
                        <Settings className="text-blue-400" size={20} />
                        <h2 className="text-lg font-bold text-white">자동 정보 공지 설정</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* Interval */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-300 flex items-center gap-2">
                            <Clock size={16} className="text-blue-400" /> 공지 간격 (초)
                        </label>
                        <div className="flex items-center gap-3">
                            <input 
                                type="number" 
                                value={interval}
                                onChange={(e) => setInterval(Number(e.target.value))}
                                className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-xl font-mono text-blue-400 focus:border-blue-500 outline-none"
                            />
                            <span className="text-gray-500 font-medium">초 마다 자동으로 채팅 전송</span>
                        </div>
                    </div>

                    {/* Templates */}
                    <div className="space-y-4">
                        <label className="text-sm font-bold text-gray-300 flex items-center gap-2">
                            <List size={16} className="text-blue-400" /> 메시지 조합 템플릿 (최대 3개)
                        </label>
                        <div className="space-y-3">
                            {templates.map((t, i) => (
                                <div key={i} className="flex gap-3 items-center">
                                    <span className="text-xs font-bold text-gray-600 w-8">#{i + 1}</span>
                                    <input 
                                        type="text" 
                                        value={t}
                                        onChange={(e) => handleTemplateChange(i, e.target.value)}
                                        placeholder={`템플릿 #${i+1} 입력...`}
                                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-blue-500 outline-none"
                                    />
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] text-gray-500 leading-relaxed italic">
                            * 사용 가능 태그: {'{name}'} (상품명), {'{expiry}'} (유통기한), {'{snippet}'} (키워드 순환)
                        </p>
                    </div>

                    {/* Order */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-300 flex items-center gap-2">
                            <Layout size={16} className="text-blue-400" /> 템플릿 송출 순서
                        </label>
                        <div className="flex items-center gap-3">
                            <input 
                                type="text" 
                                value={order}
                                onChange={(e) => setOrder(e.target.value)}
                                placeholder="예: 1, 2, 3"
                                className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-lg font-mono text-white focus:border-blue-500 outline-none"
                            />
                            <span className="text-xs text-gray-500">순서대로 템플릿이 순환됩니다 (예: 1,2,3,1...)</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-800/50 px-6 py-4 flex justify-end border-t border-gray-700">
                    <button 
                        onClick={onClose}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-8 rounded-lg shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                    >
                        확인 및 저장
                    </button>
                </div>
            </div>
        </div>
    );
}
