import React, { useState } from 'react';
import { X, Settings, Clock, List, Layout, Tag, Zap, Smile, ChevronDown, ChevronRight } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// 템플릿 실시간 미리보기 — App.jsx 타이머와 동일한 로직
// ─────────────────────────────────────────────────────────────
function resolveTemplate(template, product, snippetIdx = 0) {
    if (!template) return '';
    const keywords = Array.isArray(product?.keywords)
        ? product.keywords.map(k => String(k).replace(/^#/, '').trim()).filter(k => k)
        : [];
    const snippet = keywords.length > 0 ? keywords[snippetIdx % keywords.length] : '';
    const priceStr = product?.price ? `₩${Number(product.price).toLocaleString()}` : '';
    const remaining = product?.stock != null
        ? String((product.stock || 0) - (product.sales || 0)) : '';

    let msg = template
        .replace('{name}',      product?.name   || '(상품 미선택)')
        .replace('{expiry}',    product?.expiry || '')
        .replace('{brand}',     product?.brand  || '')
        .replace('{price}',     priceStr)
        .replace('{stock}',     String(product?.stock  ?? ''))
        .replace('{remaining}', remaining)
        .replace('{code}',      product?.code   || '')
        .replace('{snippet}',   snippet);

    keywords.forEach((kw, i) => { msg = msg.replaceAll(`{k${i + 1}}`, kw); });
    msg = msg.replace(/\{k\d+\}/g, '');
    return msg;
}

// ─────────────────────────────────────────────────────────────
// 태그 목록
// ─────────────────────────────────────────────────────────────
const BASE_TAGS = [
    { tag: '{name}',      desc: '상품명',      color: 'blue' },
    { tag: '{brand}',     desc: '브랜드',      color: 'blue' },
    { tag: '{expiry}',    desc: '유통기한',    color: 'blue' },
    { tag: '{price}',     desc: '판매가',      color: 'blue' },
    { tag: '{stock}',     desc: '총재고',      color: 'blue' },
    { tag: '{remaining}', desc: '잔여재고',    color: 'blue' },
    { tag: '{code}',      desc: '제품코드',    color: 'blue' },
    { tag: '{snippet}',   desc: '키워드 순환', color: 'purple' },
];

// ─────────────────────────────────────────────────────────────
// 이모지 그룹
// ─────────────────────────────────────────────────────────────
const EMOJI_GROUPS = [
    { label: '공지·알림',   items: ['📢', '📣', '🔔', '🔊', '📱', '💬', '📌', '📍'] },
    { label: '쇼핑·판매',   items: ['🛍️', '🛒', '🏷️', '💳', '📦', '🎁', '🎀', '🔖'] },
    { label: '강조·특가',   items: ['🔥', '⚡', '💥', '✨', '💫', '⭐', '🌟', '🏆'] },
    { label: '시간·상태',   items: ['⏰', '🕐', '⌛', '🆕', '🆙', '🔴', '🟡', '🟢'] },
    { label: '긍정·반응',   items: ['❤️', '💯', '👍', '🙌', '🎉', '🎊', '💎', '👑'] },
    { label: '구분자·기호', items: ['→', '|', '·', '•', '〔', '〕', '【', '】'] },
];

// ─────────────────────────────────────────────────────────────
// 접기/펼치기 섹션 공통 컴포넌트
// ─────────────────────────────────────────────────────────────
function CollapsibleSection({ icon, title, badge, defaultOpen = false, children }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="space-y-2">
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-2 group"
            >
                {icon}
                <span className="text-sm font-bold text-gray-300">{title}</span>
                {badge && <span className="text-[10px] text-gray-500 font-normal">{badge}</span>}
                <span className="ml-auto text-gray-500 group-hover:text-gray-300 transition-colors">
                    {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </span>
            </button>
            {open && <div className="animate-in fade-in slide-in-from-top-1 duration-150">{children}</div>}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────
export function AnnouncerSettingsModal({
    isOpen, onClose,
    interval, setInterval,
    templates, setTemplates,
    order, setOrder,
    nextMessage,
    selectedProduct,
    presets = [], setPresets,
}) {
    const [copied, setCopied] = useState('');

    if (!isOpen) return null;

    const keywords = Array.isArray(selectedProduct?.keywords)
        ? selectedProduct.keywords.map(k => String(k).replace(/^#/, '').trim()).filter(k => k)
        : [];

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(text);
        setTimeout(() => setCopied(''), 1200);
    };

    const handleTemplateChange = (idx, value) => {
        const next = [...templates];
        next[idx] = value;
        setTemplates(next);
    };

    const handlePresetToggle = (idx) => {
        setPresets(presets.map((p, i) => i === idx ? { ...p, enabled: !p.enabled } : p));
    };

    const handlePresetTextChange = (idx, value) => {
        setPresets(presets.map((p, i) => i === idx ? { ...p, text: value } : p));
    };

    // 태그/이모지 공통 버튼 스타일
    const copyBtnCls = (val, baseColor) =>
        `inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-mono border cursor-pointer
         transition-all hover:scale-105 active:scale-95 select-none
         ${copied === val
             ? 'ring-1 ring-green-400 bg-green-700/30 border-green-600/50'
             : baseColor}`;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-md">
            <div className="bg-gray-900 border border-gray-700 w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden">

                {/* ── Header ── */}
                <div className="bg-gray-800 px-6 py-4 flex items-center justify-between border-b border-gray-700">
                    <div className="flex items-center gap-2">
                        <Settings className="text-blue-400" size={20} />
                        <h2 className="text-lg font-bold text-white">자동 정보 공지 설정</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        {copied && (
                            <span className="text-[11px] text-green-400 font-bold animate-bounce">
                                {copied.length <= 6 ? copied : '태그'} 복사됨!
                            </span>
                        )}
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">

                    {/* ── 공지 간격 ── */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-300 flex items-center gap-2">
                            <Clock size={16} className="text-blue-400" /> 공지 간격 (초)
                        </label>
                        <div className="flex items-center gap-3">
                            <input type="number" value={interval}
                                onChange={(e) => setInterval(Number(e.target.value))}
                                className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-xl font-mono text-blue-400 focus:border-blue-500 outline-none" />
                            <span className="text-gray-500 text-sm">초 마다 자동 전송</span>
                        </div>
                    </div>

                    {/* ── 사용 가능한 태그 (접기/펼치기) ── */}
                    <CollapsibleSection
                        icon={<Tag size={16} className="text-blue-400 flex-none" />}
                        title="사용 가능한 태그"
                        badge="클릭하면 클립보드에 복사"
                        defaultOpen={true}
                    >
                        {/* 기본 태그 */}
                        <div className="flex flex-wrap gap-2 pt-1">
                            {BASE_TAGS.map(({ tag, desc, color }) => (
                                <button
                                    key={tag}
                                    onClick={() => handleCopy(tag)}
                                    title={`${tag} 복사`}
                                    className={copyBtnCls(tag,
                                        color === 'purple'
                                            ? 'bg-purple-900/30 text-purple-300 border-purple-700/40 hover:bg-purple-800/40'
                                            : 'bg-blue-900/20 text-blue-300 border-blue-700/30 hover:bg-blue-800/30'
                                    )}
                                >
                                    <span className="font-bold">{tag}</span>
                                    <span className="text-gray-400 font-sans text-[10px]">→ {desc}</span>
                                </button>
                            ))}
                        </div>

                        {/* 제품 키워드 태그 */}
                        {keywords.length > 0 ? (
                            <div className="bg-gray-800/60 rounded-lg p-3 border border-orange-900/30 space-y-2 mt-2">
                                <p className="text-[11px] text-orange-400 font-semibold uppercase tracking-wider">
                                    [{selectedProduct?.name}] 키워드 태그
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {keywords.map((kw, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleCopy(`{k${i + 1}}`)}
                                            title={`{k${i + 1}} 복사`}
                                            className={copyBtnCls(`{k${i + 1}}`,
                                                'bg-orange-900/30 text-orange-300 border border-orange-700/40 hover:bg-orange-800/40'
                                            )}
                                        >
                                            <span className="font-bold">{`{k${i + 1}}`}</span>
                                            <span className="text-gray-400 font-sans text-[10px]">→ {kw}</span>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-gray-500 italic">
                                    {'{k1}'} 고정 · {'{k1}'} {'{k2}'} 조합 가능 · {'{snippet}'} 자동 순환
                                </p>
                            </div>
                        ) : (
                            <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/40 text-[11px] text-gray-500 italic mt-2">
                                제품을 선택하면 {'{k1}'}, {'{k2}'} … 키워드 태그가 여기에 표시됩니다.
                            </div>
                        )}
                    </CollapsibleSection>

                    {/* ── 이모지 모음 (접기/펼치기) ── */}
                    <CollapsibleSection
                        icon={<Smile size={16} className="text-yellow-400 flex-none" />}
                        title="이모지 모음"
                        badge="클릭하면 클립보드에 복사 → 템플릿에 붙여넣기"
                        defaultOpen={false}
                    >
                        <div className="bg-gray-800/40 rounded-lg border border-gray-700/50 p-3 space-y-2 mt-1">
                            {EMOJI_GROUPS.map((group) => (
                                <div key={group.label} className="flex items-center gap-2">
                                    <span className="text-[9px] text-gray-500 uppercase tracking-wider w-14 flex-none text-right leading-tight">
                                        {group.label}
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                        {group.items.map((emoji) => (
                                            <button
                                                key={emoji}
                                                onClick={() => handleCopy(emoji)}
                                                title={`${emoji} 복사`}
                                                className={`w-8 h-8 flex items-center justify-center rounded text-lg transition-all
                                                    hover:bg-gray-600 hover:scale-110 active:scale-95
                                                    ${copied === emoji
                                                        ? 'bg-green-700/40 ring-1 ring-green-500'
                                                        : 'bg-gray-700/50'}`}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CollapsibleSection>

                    {/* ── 프리셋 템플릿 ── */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-300 flex items-center gap-2">
                            <Zap size={16} className="text-yellow-400" /> 프리셋 템플릿
                            <span className="text-[10px] text-gray-500 font-normal">ON 토글 시 순환 목록에 포함</span>
                        </label>
                        <div className="space-y-2">
                            {presets.map((preset, i) => (
                                <div key={i} className={`flex items-start gap-2 p-2 rounded-lg border transition-colors
                                    ${preset.enabled ? 'bg-yellow-900/10 border-yellow-700/40' : 'bg-gray-800/30 border-gray-700/30'}`}>
                                    <button
                                        onClick={() => handlePresetToggle(i)}
                                        className={`flex-none mt-1 w-9 h-5 rounded-full transition-colors duration-200
                                            ${preset.enabled ? 'bg-yellow-500' : 'bg-gray-600'}`}>
                                        <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 mx-0.5
                                            ${preset.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <input
                                            type="text"
                                            value={preset.text}
                                            onChange={(e) => handlePresetTextChange(i, e.target.value)}
                                            className={`w-full bg-transparent text-sm outline-none border-b pb-0.5 transition-colors
                                                ${preset.enabled ? 'text-yellow-200 border-yellow-700/50' : 'text-gray-400 border-gray-700/50'}`}
                                        />
                                        {preset.text && (
                                            <div className="text-[10px] text-green-400/80 italic truncate">
                                                → {resolveTemplate(preset.text, selectedProduct, 0)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── 커스텀 템플릿 ── */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-300 flex items-center gap-2">
                            <List size={16} className="text-blue-400" /> 커스텀 템플릿 (최대 3개)
                            <span className="text-[10px] text-gray-500 font-normal">직접 입력 · 항상 순환 포함</span>
                        </label>
                        <div className="space-y-3">
                            {templates.map((t, i) => (
                                <div key={i} className="space-y-1">
                                    <div className="flex gap-2 items-center">
                                        <span className="text-xs font-bold text-gray-600 w-6 flex-none">#{i + 1}</span>
                                        <input
                                            type="text"
                                            value={t}
                                            onChange={(e) => handleTemplateChange(i, e.target.value)}
                                            placeholder={`커스텀 템플릿 #${i + 1}...`}
                                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:border-blue-500 outline-none"
                                        />
                                    </div>
                                    {t.trim() && (
                                        <div className="ml-8 text-[11px] text-green-400 bg-green-900/10 border border-green-900/20 rounded px-3 py-1 italic break-all">
                                            → {resolveTemplate(t, selectedProduct, 0)}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── 송출 순서 ── */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-300 flex items-center gap-2">
                            <Layout size={16} className="text-blue-400" /> 커스텀 템플릿 송출 순서
                        </label>
                        <div className="flex items-center gap-3">
                            <input type="text" value={order}
                                onChange={(e) => setOrder(e.target.value)}
                                placeholder="예: 1, 2, 3"
                                className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-lg font-mono text-white focus:border-blue-500 outline-none" />
                            <span className="text-xs text-gray-500">커스텀 순서 (프리셋은 뒤에 이어서 순환)</span>
                        </div>
                    </div>

                    {/* ── 다음 발송 메시지 ── */}
                    <div className="bg-gray-950 rounded-lg p-4 border border-gray-800 space-y-2">
                        <span className="text-[11px] text-gray-500 uppercase font-bold tracking-wider">
                            다음에 전송될 메시지 (실제 타이머 기준)
                        </span>
                        <div className="text-sm text-green-300 font-medium break-all bg-green-900/10 p-3 rounded border border-green-900/20 italic">
                            {nextMessage ? `"${nextMessage}"` : '"(다음 메시지 대기 중…)"'}
                        </div>
                    </div>

                </div>

                {/* ── Footer ── */}
                <div className="bg-gray-800/50 px-6 py-4 flex justify-end border-t border-gray-700">
                    <button onClick={onClose}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-8 rounded-lg shadow-lg transition-all active:scale-95">
                        확인 및 저장
                    </button>
                </div>
            </div>
        </div>
    );
}
