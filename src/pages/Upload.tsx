import React, { useCallback, useState } from 'react';
import {
    Upload as UploadIcon,
    FileSpreadsheet,
    AlertTriangle,
    CheckCircle,
    Download,
    ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';

// ===== 타입 정의 =====
type Step = 'idle' | 'parsing' | 'preview' | 'submitting' | 'done';
type BarcodeStatus = '정상' | '없음' | '형식오류' | '중복';
type TabFilter = 'all' | '정상' | '없음' | '형식오류' | '중복';

interface ParsedRow {
    id: number;
    date: string;
    store: string;
    brand: string;
    barcode: string;
    productName: string;
    quantity: number;
    amount: number;
    customerCount: number;
    inventory: number;
    category: string;
    barcodeStatus: BarcodeStatus;
    include: boolean;
}

interface ParseStats {
    total: number;
    ok: number;
    dup: number;
    none: number;
    error: number;
}

interface UploadResult {
    registeredCount: number;
    skippedCount: number;
    skipped: {
        brand: string;
        productName: string;
        barcode: string;
        barcodeStatus: string;
        quantity: number;
        amount: number;
    }[];
}

// ===== 상수 =====
const STATUS_LABEL: Record<BarcodeStatus, string> = {
    '정상':   '정상',
    '없음':   '바코드없음',
    '형식오류': '형식오류',
    '중복':   '중복',
};

const STATUS_COLOR: Record<BarcodeStatus, string> = {
    '정상':   'bg-green-100 text-green-700',
    '없음':   'bg-gray-100 text-gray-500',
    '형식오류': 'bg-red-100 text-red-700',
    '중복':   'bg-yellow-100 text-yellow-700',
};

const TAB_LIST: { key: TabFilter; label: string }[] = [
    { key: 'all',    label: '전체' },
    { key: '정상',   label: '정상' },
    { key: '없음',   label: '바코드없음' },
    { key: '형식오류', label: '형식오류' },
    { key: '중복',   label: '중복' },
];

// ===== 메인 컴포넌트 =====
const UploadPage = () => {
    const [step, setStep]           = useState<Step>('idle');
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile]           = useState<File | null>(null);
    const [rows, setRows]           = useState<ParsedRow[]>([]);
    const [stats, setStats]         = useState<ParseStats | null>(null);
    const [activeTab, setActiveTab] = useState<TabFilter>('all');
    const [result, setResult]       = useState<UploadResult | null>(null);
    const [error, setError]         = useState('');

    // ---- 드래그&드롭 ----
    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const onDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && /\.(xlsx|xls|csv)$/i.test(f.name)) {
            setFile(f);
            setError('');
        } else {
            setError('엑셀(.xlsx, .xls) 또는 CSV 파일만 업로드 가능합니다.');
        }
    }, []);

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) { setFile(f); setError(''); }
    };

    // ---- 1단계: 파일 파싱 ----
    const handleParse = async () => {
        if (!file) return;
        setError('');
        setStep('parsing');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/parse', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '파싱 실패');
            setRows(data.rows);
            setStats(data.stats);
            setActiveTab('all');
            setStep('preview');
        } catch (err: any) {
            setError(err.message || '파일 분석 중 오류가 발생했습니다.');
            setStep('idle');
        }
    };

    // ---- 행 조작 ----
    const toggleInclude = (id: number) => {
        setRows(prev => prev.map(r => r.id === id ? { ...r, include: !r.include } : r));
    };

    const updateBarcode = (id: number, value: string) => {
        setRows(prev => prev.map(r => r.id === id ? { ...r, barcode: value } : r));
    };

    const toggleAllVisible = (checked: boolean) => {
        const visibleIds = new Set(filteredRows.map(r => r.id));
        setRows(prev => prev.map(r => visibleIds.has(r.id) ? { ...r, include: checked } : r));
    };

    // ---- 필터 & 카운트 ----
    const filteredRows   = activeTab === 'all' ? rows : rows.filter(r => r.barcodeStatus === activeTab);
    const includedCount  = rows.filter(r => r.include).length;
    const excludedCount  = rows.length - includedCount;
    const hasProblemRows = !!stats && (stats.none + stats.error + stats.dup) > 0;

    const tabCount = (key: TabFilter) =>
        key === 'all' ? rows.length : rows.filter(r => r.barcodeStatus === key).length;

    // ---- 2단계: DB 저장 ----
    const handleSubmit = async () => {
        setError('');
        setStep('submitting');

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '저장 실패');
            setResult(data);
            setStep('done');
        } catch (err: any) {
            setError(err.message || '등록 중 오류가 발생했습니다.');
            setStep('preview');
        }
    };

    // ---- CSV 다운로드 (미등록 목록) ----
    const downloadSkippedCSV = () => {
        if (!result?.skipped?.length) return;
        const bom = '﻿';
        const headers = ['브랜드', '제품명', '바코드', '바코드상태', '수량', '금액'];
        const csvRows = result.skipped.map(r =>
            [r.brand, r.productName, r.barcode, r.barcodeStatus, r.quantity, r.amount]
                .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
                .join(',')
        );
        const csv = bom + [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `미등록항목_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ---- 초기화 ----
    const reset = () => {
        setStep('idle');
        setFile(null);
        setRows([]);
        setStats(null);
        setResult(null);
        setError('');
        setActiveTab('all');
    };

    // ============================================================
    // RENDER: 완료 화면
    // ============================================================
    if (step === 'done' && result) {
        return (
            <div className="max-w-2xl mx-auto">
                <h2 className="text-2xl font-bold text-slate-800 mb-6">데이터 업로드</h2>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">등록 완료!</h3>
                    <p className="text-slate-500 mt-1 text-sm">데이터가 성공적으로 저장되었습니다.</p>

                    <div className="mt-6 grid grid-cols-2 gap-4 text-left">
                        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                            <div className="text-3xl font-bold text-green-700">
                                {result.registeredCount.toLocaleString()}
                            </div>
                            <div className="text-sm text-green-600 mt-1">✅ 등록 완료</div>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                            <div className="text-3xl font-bold text-slate-500">
                                {result.skippedCount.toLocaleString()}
                            </div>
                            <div className="text-sm text-slate-400 mt-1">⛔ 미등록 (제외됨)</div>
                        </div>
                    </div>

                    {result.skippedCount > 0 && (
                        <button
                            onClick={downloadSkippedCSV}
                            className="mt-6 flex items-center gap-2 mx-auto px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
                        >
                            <Download size={16} />
                            미등록 목록 CSV 다운로드 ({result.skippedCount}건)
                        </button>
                    )}

                    <button
                        onClick={reset}
                        className="mt-4 text-primary text-sm font-medium hover:underline"
                    >
                        다른 파일 올리기
                    </button>
                </div>
            </div>
        );
    }

    // ============================================================
    // RENDER: 미리보기 + 검토 화면
    // ============================================================
    if (step === 'preview' || step === 'submitting') {
        const allVisibleChecked =
            filteredRows.length > 0 && filteredRows.every(r => r.include);

        return (
            <div className="max-w-7xl mx-auto">
                {/* 단계 표시 */}
                <div className="flex items-center gap-2 mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">데이터 업로드</h2>
                    <div className="flex items-center gap-1 text-sm text-slate-400 ml-2">
                        <span className="text-slate-300">파일 선택</span>
                        <ChevronRight size={14} />
                        <span className="font-semibold text-primary">미리보기 · 검토</span>
                        <ChevronRight size={14} />
                        <span className="text-slate-300">등록 완료</span>
                    </div>
                </div>

                {/* 경고 배너 */}
                {hasProblemRows && (
                    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3">
                        <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                        <div className="flex-1">
                            <div className="font-semibold text-amber-800 text-sm">
                                바코드 문제가 감지되었습니다 — 아래 행은 기본적으로 제외 처리되었습니다.
                            </div>
                            <div className="flex gap-2 mt-2 flex-wrap">
                                {stats!.none > 0 && (
                                    <button
                                        onClick={() => setActiveTab('없음')}
                                        className="px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs hover:bg-gray-200 transition-colors"
                                    >
                                        바코드없음 {stats!.none}건
                                    </button>
                                )}
                                {stats!.error > 0 && (
                                    <button
                                        onClick={() => setActiveTab('형식오류')}
                                        className="px-2.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs hover:bg-red-200 transition-colors"
                                    >
                                        형식오류 {stats!.error}건
                                    </button>
                                )}
                                {stats!.dup > 0 && (
                                    <button
                                        onClick={() => setActiveTab('중복')}
                                        className="px-2.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs hover:bg-yellow-200 transition-colors"
                                    >
                                        중복 {stats!.dup}건
                                    </button>
                                )}
                            </div>
                            <p className="text-xs text-amber-600 mt-2">
                                바코드를 직접 수정하거나, 체크박스로 포함/제외 여부를 조정한 뒤 등록하세요.
                            </p>
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                    {/* 탭 + 요약 */}
                    <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                        {TAB_LIST.map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setActiveTab(key)}
                                className={clsx(
                                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                                    activeTab === key
                                        ? 'bg-primary text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                )}
                            >
                                {label}
                                <span className="ml-1.5 opacity-70 text-xs">{tabCount(key)}</span>
                            </button>
                        ))}
                        <div className="flex-1" />
                        <div className="text-sm text-slate-500">
                            등록 예정&nbsp;
                            <span className="font-bold text-primary">{includedCount}</span>건
                            &nbsp;·&nbsp;제외&nbsp;
                            <span className="font-bold text-slate-400">{excludedCount}</span>건
                        </div>
                    </div>

                    {/* 테이블 */}
                    <div className="overflow-x-auto" style={{ maxHeight: '520px', overflowY: 'auto' }}>
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                                <tr>
                                    <th className="p-3 w-10">
                                        <input
                                            type="checkbox"
                                            checked={allVisibleChecked}
                                            onChange={e => toggleAllVisible(e.target.checked)}
                                        />
                                    </th>
                                    <th className="p-3 text-left text-slate-500 font-medium whitespace-nowrap">날짜</th>
                                    <th className="p-3 text-left text-slate-500 font-medium whitespace-nowrap">매장</th>
                                    <th className="p-3 text-left text-slate-500 font-medium whitespace-nowrap">브랜드</th>
                                    <th className="p-3 text-left text-slate-500 font-medium">제품명</th>
                                    <th className="p-3 text-left text-slate-500 font-medium whitespace-nowrap" style={{ minWidth: '140px' }}>
                                        바코드 <span className="text-xs font-normal text-slate-400">(수정 가능)</span>
                                    </th>
                                    <th className="p-3 text-center text-slate-500 font-medium whitespace-nowrap">상태</th>
                                    <th className="p-3 text-right text-slate-500 font-medium whitespace-nowrap">수량</th>
                                    <th className="p-3 text-right text-slate-500 font-medium whitespace-nowrap">금액</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="p-10 text-center text-slate-400">
                                            해당 탭에 데이터가 없습니다.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRows.map(row => (
                                        <tr
                                            key={row.id}
                                            className={clsx(
                                                'transition-colors',
                                                !row.include && 'opacity-40 bg-slate-50',
                                                row.include && row.barcodeStatus !== '정상' && 'bg-amber-50/50',
                                                row.include && row.barcodeStatus === '정상' && 'hover:bg-slate-50',
                                            )}
                                        >
                                            <td className="p-3 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={row.include}
                                                    onChange={() => toggleInclude(row.id)}
                                                />
                                            </td>
                                            <td className="p-3 text-slate-500 whitespace-nowrap">{row.date}</td>
                                            <td className="p-3 text-slate-600 whitespace-nowrap">{row.store || '-'}</td>
                                            <td className="p-3 font-medium text-slate-700 whitespace-nowrap">{row.brand || '-'}</td>
                                            <td className="p-3 text-slate-600">{row.productName || '-'}</td>
                                            <td className="p-3">
                                                <input
                                                    type="text"
                                                    value={row.barcode}
                                                    onChange={e => updateBarcode(row.id, e.target.value)}
                                                    placeholder="바코드 없음"
                                                    className={clsx(
                                                        'w-full px-2 py-1 border rounded text-sm outline-none focus:ring-1',
                                                        row.barcodeStatus === '정상'
                                                            ? 'border-slate-200 focus:ring-primary'
                                                            : 'border-amber-300 bg-amber-50 focus:ring-amber-400'
                                                    )}
                                                />
                                            </td>
                                            <td className="p-3 text-center whitespace-nowrap">
                                                <span className={clsx(
                                                    'px-2 py-0.5 rounded-full text-xs font-medium',
                                                    STATUS_COLOR[row.barcodeStatus]
                                                )}>
                                                    {STATUS_LABEL[row.barcodeStatus]}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right text-slate-600">{row.quantity.toLocaleString()}</td>
                                            <td className="p-3 text-right text-slate-600">
                                                ₩{row.amount.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* 하단 버튼 */}
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between rounded-b-xl">
                        <button
                            onClick={reset}
                            disabled={step === 'submitting'}
                            className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50"
                        >
                            ← 다시 선택
                        </button>
                        {error && <p className="text-red-500 text-sm">{error}</p>}
                        <button
                            onClick={handleSubmit}
                            disabled={step === 'submitting' || includedCount === 0}
                            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {step === 'submitting'
                                ? '⏳ 등록 중...'
                                : `✅ ${includedCount.toLocaleString()}건 등록 확정`}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ============================================================
    // RENDER: 파일 선택 화면 (idle / parsing)
    // ============================================================
    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">데이터 업로드</h2>

            {/* 드래그&드롭 영역 */}
            <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => document.getElementById('_fileInput')?.click()}
                className={clsx(
                    'border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer select-none',
                    isDragging
                        ? 'border-primary bg-indigo-50'
                        : 'border-slate-300 hover:border-primary hover:bg-slate-50'
                )}
            >
                <input
                    id="_fileInput"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={onFileChange}
                    className="hidden"
                />

                <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    {file
                        ? <FileSpreadsheet size={32} className="text-green-600" />
                        : <UploadIcon size={32} />
                    }
                </div>

                {file ? (
                    <>
                        <p className="text-lg font-semibold text-slate-800">{file.name}</p>
                        <p className="text-slate-500 text-sm mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                        <p className="text-slate-400 text-xs mt-2">다른 파일로 변경하려면 클릭하세요</p>
                    </>
                ) : (
                    <>
                        <p className="text-lg font-semibold text-slate-800">파일을 이곳에 드래그하세요</p>
                        <p className="text-slate-500 mt-2">또는 클릭하여 파일 선택</p>
                        <p className="text-slate-400 text-sm mt-4">지원 형식: .xlsx, .xls, .csv</p>
                    </>
                )}
            </div>

            {error && (
                <p className="mt-3 text-red-500 text-sm text-center">{error}</p>
            )}

            {file && (
                <button
                    onClick={handleParse}
                    disabled={step === 'parsing'}
                    className="mt-4 w-full py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {step === 'parsing' ? '📊 파일 분석 중...' : '📊 파일 분석 시작'}
                </button>
            )}

            {/* 안내 박스 */}
            <div className="mt-8 bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
                <span className="text-blue-500 shrink-0 mt-0.5 text-lg">ℹ️</span>
                <div>
                    <h4 className="font-semibold text-blue-900 text-sm">엑셀 컬럼 형식 안내</h4>
                    <p className="text-sm text-blue-700 mt-1 leading-relaxed">
                        A열: 날짜 &nbsp;·&nbsp; B열: 매장명 &nbsp;·&nbsp; C열: 브랜드<br />
                        D열: 바코드 &nbsp;·&nbsp; E열: 제품명 &nbsp;·&nbsp; F열: 수량<br />
                        G열: 금액 &nbsp;·&nbsp; H열: 고객수 &nbsp;·&nbsp; J열: 재고 &nbsp;·&nbsp; K열: 카테고리
                    </p>
                </div>
            </div>
        </div>
    );
};

export default UploadPage;
