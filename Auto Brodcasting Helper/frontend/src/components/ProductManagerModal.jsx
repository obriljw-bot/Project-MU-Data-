import React, { useState, useRef } from 'react';
import { X, Upload, Plus, Save, Download, Trash } from 'lucide-react';
import * as XLSX from 'xlsx';

export function ProductManagerModal({ isOpen, onClose, products, setProducts, onSave }) {
    const [editList, setEditList] = useState([]);
    const fileInputRef = useRef(null);
    // 한글 IME 조합 중 여부 (조합 중엔 파싱 중단)
    const composingRef = React.useRef(false);

    // Initialize edit list when opening
    React.useEffect(() => {
        if (isOpen) {
            setEditList(JSON.parse(JSON.stringify(products)));
            console.log("Modal Open: Loaded Products", products);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    const handleImportExcel = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsName = wb.SheetNames[0];
                const ws = wb.Sheets[wsName];
                const data = XLSX.utils.sheet_to_json(ws, { header: ["barcode", "code", "brand", "name", "expiry", "stock", "price", "keywords"] });

                // Remove header row if it exists (naive check)
                const cleanData = data.filter(row => row.barcode !== 'barcode' && (row.barcode || row.code || row.name)); // Filter invalid rows

                // Merge logic: Update existing, Append new
                let updatedCount = 0;
                let newCount = 0;

                // ── 머지 키: code → barcode → name 순서로 폴백 ──────────────
                // 기존: p.code만 사용 → code가 비면 모든 행이 '' 키로 충돌해 1개만 남는 버그
                // 수정: code 없으면 barcode, 그것도 없으면 name으로 식별
                const getItemKey = (item) => {
                    const code    = item.code    && String(item.code).trim();
                    const barcode = item.barcode && String(item.barcode).trim();
                    const name    = item.name    && String(item.name).trim();
                    if (code)    return `C:${code}`;
                    if (barcode) return `B:${barcode}`;
                    if (name)    return `N:${name}`;
                    return null; // 식별 불가 → 항상 신규로 처리
                };

                const currentMap = new Map(
                    editList
                        .map(p => { const k = getItemKey(p); return k ? [k, p] : null; })
                        .filter(Boolean)
                );

                const parseExcelDate = (value) => {
                    if (!value) return '';
                    // If number, convert Excel Serial Date
                    if (typeof value === 'number') {
                        const date = new Date(Math.round((value - 25569) * 86400 * 1000));
                        return date.toISOString().split('T')[0];
                    }
                    return String(value);
                };

                cleanData.forEach(row => {
                    const newItem = {
                        id: crypto.randomUUID(), // Stable ID
                        barcode: String(row.barcode || ''),
                        code: String(row.code || ''),
                        brand: String(row.brand || ''),
                        name: String(row.name || ''),
                        expiry: parseExcelDate(row.expiry),
                        stock: Number(row.stock || 0),
                        price: Number(row.price || 0),
                        keywords: row.keywords ? String(row.keywords).split(',').map(k => k.trim()) : [],
                        sales: 0
                    };

                    const key = getItemKey(newItem);

                    if (key && currentMap.has(key)) {
                        // 기존 항목 업데이트 (sales 보존)
                        const existing = currentMap.get(key);
                        currentMap.set(key, { ...existing, ...newItem, id: existing.id || newItem.id, sales: existing.sales || 0 });
                        updatedCount++;
                    } else {
                        // 신규 항목 추가 (식별 키 없으면 UUID로 고유 키 부여 → 충돌 방지)
                        const mapKey = key ?? `UID:${newItem.id}`;
                        currentMap.set(mapKey, newItem);
                        newCount++;
                    }
                });

                const mergedList = Array.from(currentMap.values());
                setEditList(mergedList);
                alert(`Import Successful!\nUpdated: ${updatedCount}\nNew: ${newCount}`);

            } catch (err) {
                console.error("Excel Parsing Error:", err);
                alert("Failed to parse Excel file. Please check the format.");
            }
        };
        reader.readAsBinaryString(file);
        // Reset input
        e.target.value = null;
    };

    const handleApply = () => {
        if (editList.some(p => !p.name)) {
            alert("제품명(Name)은 필수 항목입니다.");
            return;
        }
        const final = editList.map(p => ({
            ...p,
            id: p.id || crypto.randomUUID(),
            // keywords: 문자열로 남아있을 경우 # 기준으로 배열 변환 (IME 입력 후 blur 없이 저장한 경우 대비)
            keywords: typeof p.keywords === 'string'
                ? p.keywords.split('#').map(k => k.trim()).filter(k => k)
                : (Array.isArray(p.keywords) ? p.keywords : []),
        }));
        setProducts(final);
        onSave && onSave(final);
        onClose();
    };

    const addNewRow = () => {
        setEditList([...editList, { id: crypto.randomUUID(), barcode: '', code: '', brand: '', name: '', expiry: '', stock: 0, price: 0, sales: 0, keywords: [] }]);
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
    }

    const downloadTemplate = () => {
        const ws = XLSX.utils.aoa_to_sheet([
            ["barcode", "code", "brand", "name", "expiry", "stock", "price", "keywords"],
            ["8801234567890", "P001", "MyBrand", "Example Product", "2024-12-31", 100, 15000, "sample,test"],
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "product_template.xlsx");
    }

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 w-[90vw] max-w-[1600px] h-[90vh] flex flex-col rounded-lg shadow-2xl">

                {/* Header */}
                <div className="h-14 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-800">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Upload size={20} className="text-blue-400" /> Product Manager
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="h-12 border-b border-gray-800 flex items-center px-6 gap-4 bg-gray-900">
                    <button onClick={() => fileInputRef.current?.click()} className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded flex items-center gap-2 transition-colors">
                        <Upload size={14} /> Import Excel
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImportExcel}
                        className="hidden"
                        accept=".xlsx, .xls"
                    />

                    <button onClick={downloadTemplate} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded flex items-center gap-2 transition-colors">
                        <Download size={14} /> Template
                    </button>

                    <div className="h-4 w-px bg-gray-700 mx-2"></div>

                    <button onClick={addNewRow} className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded flex items-center gap-2 transition-colors">
                        <Plus size={14} /> Add Manual
                    </button>
                </div>

                {/* Body (Table) */}
                <div className="flex-1 overflow-auto p-6">
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
                        <tbody className="divide-y divide-gray-800 text-base"> {/* Base font size increased */}
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
                                        <input className="w-full bg-transparent border-b border-gray-700 focus:border-blue-500 outline-none text-white font-medium text-lg" // Larger Name
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
                                            onChange={(e) => {
                                                // 한글 IME 조합 중엔 raw string 그대로 저장 (파싱 생략)
                                                updateRow(idx, 'keywords', e.target.value);
                                            }}
                                            onCompositionStart={() => { composingRef.current = true; }}
                                            onCompositionEnd={(e) => {
                                                composingRef.current = false;
                                                // 조합 완료 후에도 raw string 유지 (onBlur에서 파싱)
                                                updateRow(idx, 'keywords', e.target.value);
                                            }}
                                            onBlur={(e) => {
                                                // 입력 완료 시 # 기준 파싱 → 배열로 저장
                                                const parsed = e.target.value
                                                    .split('#')
                                                    .map(k => k.trim())
                                                    .filter(k => k);
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
                </div>

                {/* Footer */}
                <div className="h-16 border-t border-gray-800 flex items-center justify-end px-6 gap-3 bg-gray-900 rounded-b-lg">
                    <span className="text-xs text-gray-500 mr-auto">Changes are saved to browser memory only.</span>
                    <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm font-medium transition-colors">Cancel</button>
                    <button onClick={handleApply} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2">
                        <Save size={16} /> Apply Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
