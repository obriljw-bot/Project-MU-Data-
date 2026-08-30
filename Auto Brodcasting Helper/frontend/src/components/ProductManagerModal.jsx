import React, { useState, useRef } from 'react';
import { X, Upload, Plus, Save, Download, Trash, AlertTriangle, CheckCircle, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';

// ── 바코드 분류 함수 ──────────────────────────────────────────────
function classifyBarcode(val, barcodeCount) {
    if (!val) return '없음';
    const s = String(val).trim();
    if (!s || s === 'ㅡ' || s === '-') return '없음';
    if (/[\n\r]/.test(s)) return '형식오류';
    if (/[가-힣]/.test(s)) return '형식오류';
    if (/\d\s+\d/.test(s)) return '형식오류';
    if (/^\d+(-\d+)+$/.test(s)) return '형식오류';
    if (barcodeCount[s] > 1) return '중복';
    return '정상';
}

const STATUS_STYLE = {
    '정상':   { row: 'bg-green-950/20',   badge: 'bg-green-800 text-green-200' },
    '없음':   { row: '',                   badge: 'bg-gray-700 text-gray-400' },
    '형식오류': { row: 'bg-red-950/30',   badge: 'bg-red-800 text-red-200' },
    '중복':   { row: 'bg-yellow-950/20',  badge: 'bg-yellow-800 text-yellow-200' },
};

const ALL_TABS = ['전체', '정상', '없음', '형식오류', '중복'];

// ── 머지 키 함수 ──────────────────────────────────────────────────
const getItemKey = (item) => {
    const code    = item.code    && String(item.code).trim();
    const barcode = item.barcode && String(item.barcode).trim();
    const name    = item.name    && String(item.name).trim();
    if (code)    return `C:${code}`;
    if (barcode) return `B:${barcode}`;
    if (name)    return `N:${name}`;
    return null;
};

export function ProductManagerModal({ isOpen, onClose, products, setProducts, onSave }) {
    const [editList, setEditList] = useState([]);

    // ── 미리보기 상태 ──────────────────────────────────────────────
    const [previewRows, setPreviewRows]   = useState(null); // null = 미리보기 아님
    const [selectedSet, setSelectedSet]   = useState(new Set());
    const [activeTab,   setActiveTab]     = useState('전체');

    const fileInputRef = useRef(null);
    const composingRef = React.useRef(false);

    // 모달 열릴 때 editList 초기화
    React.useEffect(() => {
        if (isOpen) {
            setEditList(JSON.parse(JSON.stringify(products)));
            setPreviewRows(null);
            setActiveTab('전체');
            setSelectedSet(new Set());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    // ── 날짜 파싱 ─────────────────────────────────────────────────
    const parseExcelDate = (value) => {
        if (!value) return '';
        if (typeof value === 'number') {
            const date = new Date(Math.round((value - 25569) * 86400 * 1000));
            return date.toISOString().split('T')[0];
        }
        return String(value);
    };

    // ── Excel Import (1단계: 파싱 + 바코드 분류) ──────────────────
    const handleImportExcel = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb   = XLSX.read(bstr, { type: 'binary' });
                const ws   = wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(ws, {
                    header: ["barcode", "code", "brand", "name", "expiry", "stock", "price", "keywords"]
                });

                // 헤더 행 + 빈 행 제거
                const cleanData = data.filter(row =>
                    row.barcode !== 'barcode' && (row.barcode || row.code || row.name)
                );

                // 1차 패스: 바코드 중복 횟수 계산
                const barcodeCount = {};
                cleanData.forEach(row => {
                    const b = row.barcode ? String(row.barcode).trim() : '';
                    if (b && b !== 'ㅡ' && b !== '-') {
                        barcodeCount[b] = (barcodeCount[b] || 0) + 1;
                    }
                });

                // 2차 패스: 분류 + 행 구성
                const rows = cleanData.map((row, idx) => {
                    const barcodeVal = row.barcode ? String(row.barcode).trim() : '';
                    const status     = classifyBarcode(barcodeVal, barcodeCount);
                    return {
                        _idx:    idx,
                        _status: status,
                        id:      crypto.randomUUID(),
                        barcode: barcodeVal,
                        code:    String(row.code  || ''),
                        brand:   String(row.brand || ''),
                        name:    String(row.name  || ''),
                        expiry:  parseExcelDate(row.expiry),
                        stock:   Number(row.stock || 0),
                        price:   Number(row.price || 0),
                        keywords: row.keywords
                            ? String(row.keywords).split(',').map(k => k.trim())
                            : [],
                        sales: 0,
                    };
                });

                // 기본 선택: 정상 + 없음 → 체크, 형식오류 + 중복 → 미체크
                const defaultSelected = new Set(
                    rows
                        .filter(r => r._status === '정상' || r._status === '없음')
                        .map(r => r._idx)
                );

                setPreviewRows(rows);
                setSelectedSet(defaultSelected);
                setActiveTab('전체');

            } catch (err) {
                console.error("Excel Parsing Error:", err);
                alert("Failed to parse Excel file. Please check the format.");
            }
        };
        reader.readAsBinaryString(file);
        e.target.value = null;
    };

    // ── 2단계: 선택된 행을 editList에 머지 ────────────────────────
    const applyPreview = () => {
        if (!previewRows) return;

        const selected = previewRows.filter(r => selectedSet.has(r._idx));

        const currentMap = new Map(
            editList
                .map(p => { const k = getItemKey(p); return k ? [k, p] : null; })
                .filter(Boolean)
        );

        let updatedCount = 0;
        let newCount     = 0;

        selected.forEach(row => {
            const newItem = { ...row };
            delete newItem._idx;
            delete newItem._status;

            const key = getItemKey(newItem);
            if (key && currentMap.has(key)) {
                const existing = currentMap.get(key);
                currentMap.set(key, {
                    ...existing,
                    ...newItem,
                    id:    existing.id    || newItem.id,
                    sales: existing.sales || 0,
                });
                updatedCount++;
            } else {
                const mapKey = key ?? `UID:${newItem.id}`;
                currentMap.set(mapKey, newItem);
                newCount++;
            }
        });

        const skippedCount = previewRows.length - selected.length;
        setEditList(Array.from(currentMap.values()));
        setPreviewRows(null);
        alert(`Import 완료!\n✅ 신규: ${newCount}  🔄 업데이트: ${updatedCount}  ⛔ 제외: ${skippedCount}`);
    };

    // ── 제외 항목 Excel 다운로드 ──────────────────────────────────
    const downloadRejected = () => {
        if (!previewRows) return;
        const rejected = previewRows.filter(r => !selectedSet.has(r._idx));
        if (rejected.length === 0) { alert("제외된 항목이 없습니다."); return; }

        const ws = XLSX.utils.aoa_to_sheet([
            ["barcode", "code", "brand", "name", "expiry", "stock", "price", "keywords", "제외사유"],
            ...rejected.map(r => [
                r.barcode, r.code, r.brand, r.name, r.expiry,
                r.stock, r.price,
                Array.isArray(r.keywords) ? r.keywords.join(',') : r.keywords,
                r._status,
            ]),
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Rejected");
        XLSX.writeFile(wb, "rejected_products.xlsx");
    };

    const cancelPreview = () => {
        setPreviewRows(null);
        setActiveTab('전체');
    };

    // ── 체크박스 토글 ──────────────────────────────────────────────
    const toggleRow = (idx) => {
        const next = new Set(selectedSet);
        next.has(idx) ? next.delete(idx) : next.add(idx);
        setSelectedSet(next);
    };

    const toggleAll = (rows) => {
        const allSelected = rows.every(r => selectedSet.has(r._idx));
        const next = new Set(selectedSet);
        rows.forEach(r => allSelected ? next.delete(r._idx) : next.add(r._idx));
        setSelectedSet(next);
    };

    // ── 미리보기 통계 계산 ─────────────────────────────────────────
    const stats = previewRows
        ? ALL_TABS.slice(1).reduce((acc, tab) => {
            acc[tab] = previewRows.filter(r => r._status === tab).length;
            return acc;
          }, {})
        : null;

    const filteredRows = previewRows
        ? (activeTab === '전체' ? previewRows : previewRows.filter(r => r._status === activeTab))
        : null;

    const hasWarnings = stats && (stats['형식오류'] > 0 || stats['중복'] > 0);

    // ── 일반 editList 조작 ─────────────────────────────────────────
    const handleApply = () => {
        if (editList.some(p => !p.name)) {
            alert("제품명(Name)은 필수 항목입니다.");
            return;
        }
        // 중복 코드 체크
        const codeMap = {};
        for (const p of editList) {
            if (p.code && p.code.trim()) {
                const c = p.code.trim();
                if (codeMap[c]) {
                    alert(`⚠️ 중복 코드 발견: "${c}"\n[${codeMap[c]}] 과 [${p.name}] 에 동일한 코드가 등록되어 있습니다.\n코드를 수정 후 저장해주세요.`);
                    return;
                }
                codeMap[c] = p.name;
            }
        }
        const final = editList.map(p => ({
            ...p,
            id: p.id || crypto.randomUUID(),
            keywords: typeof p.keywords === 'string'
                ? p.keywords.split('#').map(k => k.trim()).filter(k => k)
                : (Array.isArray(p.keywords) ? p.keywords : []),
        }));
        setProducts(final);
        onSave && onSave(final);
        onClose();
    };

    const addNewRow = () => {
        setEditList([...editList, {
            id: crypto.randomUUID(), barcode: '', code: '', brand: '',
            name: '', expiry: '', stock: 0, price: 0, sales: 0, keywords: []
        }]);
    };

    const updateRow = (idx, field, value) => {
        const list = [...editList];
        list[idx][field] = value;
        setEditList(list);
    };

    const removeRow = (idx) => {
        if (window.confirm("Remove this item?")) {
            const list = [...editList];
            list.splice(idx, 1);
            setEditList(list);
        }
    };

    const downloadTemplate = () => {
        const ws = XLSX.utils.aoa_to_sheet([
            ["barcode", "code", "brand", "name", "expiry", "stock", "price", "keywords"],
            ["8801234567890", "P001", "MyBrand", "Example Product", "2024-12-31", 100, 15000, "sample,test"],
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "product_template.xlsx");
    };

    // ════════════════════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════════════════════
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 w-[90vw] max-w-[1600px] h-[90vh] flex flex-col rounded-lg shadow-2xl">

                {/* ── Header ── */}
                <div className="h-14 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-800 rounded-t-lg">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Upload size={20} className="text-blue-400" />
                        Product Manager
                        {previewRows && (
                            <span className="text-sm font-normal text-yellow-400 ml-2">
                                — Import 미리보기 ({previewRows.length}개)
                            </span>
                        )}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* ── Toolbar ── */}
                <div className="border-b border-gray-800 flex items-center px-6 gap-4 bg-gray-900"
                     style={{ minHeight: '48px', flexWrap: 'wrap', padding: '8px 24px' }}>

                    {!previewRows ? (
                        /* 일반 모드 툴바 */
                        <>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded flex items-center gap-2 transition-colors">
                                <Upload size={14} /> Import Excel
                            </button>
                            <input
                                type="file" ref={fileInputRef}
                                onChange={handleImportExcel}
                                className="hidden" accept=".xlsx, .xls" />

                            <button
                                onClick={downloadTemplate}
                                className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded flex items-center gap-2 transition-colors">
                                <Download size={14} /> Template
                            </button>

                            <div className="h-4 w-px bg-gray-700 mx-2" />

                            <button
                                onClick={addNewRow}
                                className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded flex items-center gap-2 transition-colors">
                                <Plus size={14} /> Add Manual
                            </button>
                        </>
                    ) : (
                        /* 미리보기 모드 툴바: 탭 필터 */
                        <div className="flex items-center gap-2 w-full">
                            {ALL_TABS.map(tab => {
                                const count = tab === '전체' ? previewRows.length : (stats[tab] || 0);
                                const isActive = activeTab === tab;
                                const isWarn = (tab === '형식오류' || tab === '중복') && count > 0;
                                return (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`text-xs px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors font-medium ${
                                            isActive
                                                ? isWarn
                                                    ? 'bg-red-700 text-white'
                                                    : 'bg-blue-700 text-white'
                                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                        }`}>
                                        {tab}
                                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                            isActive ? 'bg-white/20' : 'bg-gray-700 text-gray-300'
                                        }`}>{count}</span>
                                    </button>
                                );
                            })}

                            <div className="ml-auto flex items-center gap-2">
                                <button
                                    onClick={downloadRejected}
                                    className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded flex items-center gap-2 transition-colors">
                                    <FileDown size={14} /> 제외항목 다운로드
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── 경고 배너 (미리보기 모드 + 오류 있을 때) ── */}
                {previewRows && hasWarnings && (
                    <div className="bg-yellow-950/50 border-b border-yellow-800/50 px-6 py-2.5 flex items-center gap-3">
                        <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0" />
                        <span className="text-yellow-300 text-xs">
                            바코드 문제가 발견되었습니다 —
                            {stats['형식오류'] > 0 && <span className="text-red-400 font-bold ml-1">형식오류 {stats['형식오류']}개</span>}
                            {stats['중복'] > 0 && <span className="text-yellow-400 font-bold ml-1">중복 {stats['중복']}개</span>}.
                            {' '}해당 항목은 자동으로 제외됩니다. 체크박스로 수동 조정 가능합니다.
                        </span>
                        <span className="ml-auto text-xs text-gray-400">
                            선택됨: <span className="text-white font-bold">{selectedSet.size}</span> / {previewRows.length}
                        </span>
                    </div>
                )}

                {/* ── Body ── */}
                <div className="flex-1 overflow-auto p-6">
                    {/* ── 미리보기 테이블 ── */}
                    {previewRows ? (
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="text-xs text-gray-500 bg-gray-800/50 sticky top-0 uppercase">
                                <tr>
                                    <th className="p-3 w-10">
                                        <input
                                            type="checkbox"
                                            className="accent-blue-500"
                                            checked={filteredRows.length > 0 && filteredRows.every(r => selectedSet.has(r._idx))}
                                            onChange={() => toggleAll(filteredRows)} />
                                    </th>
                                    <th className="p-3 w-24">상태</th>
                                    <th className="p-3 w-40">Barcode</th>
                                    <th className="p-3 w-28">Code</th>
                                    <th className="p-3 w-32">Brand</th>
                                    <th className="p-3">Name</th>
                                    <th className="p-3 w-28 text-right">Price</th>
                                    <th className="p-3 w-20 text-right">Stock</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 text-sm">
                                {filteredRows.length === 0 && (
                                    <tr>
                                        <td colSpan="8" className="text-center py-10 text-gray-600">
                                            해당 탭에 항목이 없습니다.
                                        </td>
                                    </tr>
                                )}
                                {filteredRows.map(row => {
                                    const style   = STATUS_STYLE[row._status] || STATUS_STYLE['없음'];
                                    const checked = selectedSet.has(row._idx);
                                    return (
                                        <tr
                                            key={row._idx}
                                            className={`${style.row} ${checked ? '' : 'opacity-40'} transition-opacity cursor-pointer hover:opacity-80`}
                                            onClick={() => toggleRow(row._idx)}>
                                            <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                                                <input type="checkbox" className="accent-blue-500"
                                                    checked={checked} onChange={() => toggleRow(row._idx)} />
                                            </td>
                                            <td className="p-2">
                                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${style.badge}`}>
                                                    {row._status}
                                                </span>
                                            </td>
                                            <td className="p-2 font-mono text-gray-300 text-xs">{row.barcode || <span className="text-gray-600">—</span>}</td>
                                            <td className="p-2 text-gray-400 text-xs">{row.code || <span className="text-gray-600">—</span>}</td>
                                            <td className="p-2 text-gray-400 text-xs">{row.brand}</td>
                                            <td className="p-2 text-white font-medium">{row.name}</td>
                                            <td className="p-2 text-right text-gray-300">{row.price.toLocaleString()}원</td>
                                            <td className="p-2 text-right text-gray-400">{row.stock}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        /* ── 일반 편집 테이블 ── */
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="text-xs text-gray-500 bg-gray-800/50 sticky top-0 uppercase">
                                <tr>
                                    <th className="p-3 w-36">Barcode</th>
                                    <th className="p-3 w-28">Code</th>
                                    <th className="p-3 w-32">Brand</th>
                                    <th className="p-3">Name</th>
                                    <th className="p-3 w-32">Expiry</th>
                                    <th className="p-3 w-24 text-right">Stock</th>
                                    <th className="p-3 w-24 text-right">Sold</th>
                                    <th className="p-3 w-32 text-right">Price</th>
                                    <th className="p-3 w-64">Keywords <span className="text-purple-500 normal-case font-normal">(#키워드 스페이스 구분)</span></th>
                                    <th className="p-3 w-12"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800 text-base">
                                {editList.length === 0 && (
                                    <tr><td colSpan="10" className="text-center py-10 text-gray-600">No Data. Import Excel or Add Manual.</td></tr>
                                )}
                                {editList.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-800/30">
                                        <td className="p-2">
                                            <input className="w-full bg-transparent border-b border-gray-700 focus:border-purple-500 outline-none text-gray-400 font-mono text-sm"
                                                value={item.barcode || ''} onChange={(e) => updateRow(idx, 'barcode', e.target.value)} placeholder="바코드 (선택)" />
                                        </td>
                                        <td className="p-2">
                                            <input className="w-full bg-transparent border-b border-gray-700 focus:border-blue-500 outline-none text-gray-300 font-mono"
                                                value={item.code || ''} onChange={(e) => updateRow(idx, 'code', e.target.value)} placeholder="CODE (선택)" />
                                        </td>
                                        <td className="p-2">
                                            <input className="w-full bg-transparent border-b border-gray-700 focus:border-blue-500 outline-none text-gray-400"
                                                value={item.brand || ''} onChange={(e) => updateRow(idx, 'brand', e.target.value)} placeholder="Brand" />
                                        </td>
                                        <td className="p-2">
                                            <input className="w-full bg-transparent border-b border-gray-700 focus:border-blue-500 outline-none text-white font-medium text-lg"
                                                value={item.name} onChange={(e) => updateRow(idx, 'name', e.target.value)} placeholder="Product Name" />
                                        </td>
                                        <td className="p-2">
                                            <input className="w-full bg-transparent border-b border-gray-700 focus:border-blue-500 outline-none text-gray-400"
                                                value={item.expiry || ''} onChange={(e) => updateRow(idx, 'expiry', e.target.value)} placeholder="YYYY-MM-DD" />
                                        </td>
                                        <td className="p-2">
                                            <input type="number" className="w-full bg-transparent border-b border-gray-700 focus:border-blue-500 outline-none text-right text-gray-300"
                                                value={item.stock} onChange={(e) => updateRow(idx, 'stock', Number(e.target.value))} />
                                        </td>
                                        <td className="p-2">
                                            <input type="number" className="w-full bg-transparent border-b border-gray-700 focus:border-blue-500 outline-none text-right text-red-300 font-bold"
                                                value={item.sales} onChange={(e) => updateRow(idx, 'sales', Number(e.target.value))} />
                                        </td>
                                        <td className="p-2">
                                            <input type="number" className="w-full bg-transparent border-b border-gray-700 focus:border-blue-500 outline-none text-right text-gray-300"
                                                value={item.price} onChange={(e) => updateRow(idx, 'price', Number(e.target.value))} />
                                        </td>
                                        <td className="p-2">
                                            <input className="w-full bg-transparent border-b border-gray-700 focus:border-blue-500 outline-none text-purple-300 text-sm"
                                                value={
                                                    Array.isArray(item.keywords) && item.keywords.length > 0
                                                        ? '#' + item.keywords.map(k => k.replace(/^#/, '')).join(' #')
                                                        : (typeof item.keywords === 'string' ? item.keywords : '')
                                                }
                                                onChange={(e) => updateRow(idx, 'keywords', e.target.value)}
                                                onCompositionStart={() => { composingRef.current = true; }}
                                                onCompositionEnd={(e) => {
                                                    composingRef.current = false;
                                                    updateRow(idx, 'keywords', e.target.value);
                                                }}
                                                onBlur={(e) => {
                                                    const parsed = e.target.value
                                                        .split('#').map(k => k.trim()).filter(k => k);
                                                    updateRow(idx, 'keywords', parsed);
                                                }}
                                                placeholder="#키워드1 #키워드2 #키워드3" />
                                        </td>
                                        <td className="p-2 text-center">
                                            <button onClick={() => removeRow(idx)} className="text-gray-600 hover:text-red-500"><Trash size={16} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* ── Footer ── */}
                <div className="h-16 border-t border-gray-800 flex items-center px-6 gap-3 bg-gray-900 rounded-b-lg">
                    {previewRows ? (
                        /* 미리보기 푸터 */
                        <>
                            <span className="text-xs text-gray-500 mr-auto">
                                <CheckCircle size={13} className="inline mr-1 text-green-500" />
                                선택된 <span className="text-white font-bold">{selectedSet.size}</span>개 항목이 제품 목록에 추가/업데이트됩니다.
                            </span>
                            <button
                                onClick={cancelPreview}
                                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm font-medium transition-colors">
                                취소
                            </button>
                            <button
                                onClick={applyPreview}
                                disabled={selectedSet.size === 0}
                                className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-sm font-bold shadow-lg transition-all flex items-center gap-2">
                                <Save size={16} /> 선택 항목 적용 ({selectedSet.size}개)
                            </button>
                        </>
                    ) : (
                        /* 일반 푸터 */
                        <>
                            <span className="text-xs text-gray-500 mr-auto">Changes are saved to browser memory only.</span>
                            <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm font-medium transition-colors">Cancel</button>
                            <button onClick={handleApply} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2">
                                <Save size={16} /> Apply Changes
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
