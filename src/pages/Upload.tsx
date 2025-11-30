import React, { useCallback, useState } from 'react';
import { Upload as UploadIcon, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

const UploadPage = () => {
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');

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
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.csv'))) {
            setFile(droppedFile);
        } else {
            alert('엑셀(.xlsx) 또는 CSV 파일만 업로드 가능합니다.');
        }
    }, []);

    const handleUpload = async () => {
        if (!file) return;
        setStatus('uploading');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                setStatus('success');
            } else {
                setStatus('error');
                alert('업로드 실패: 서버 오류가 발생했습니다.');
            }
        } catch (error) {
            console.error('Upload error:', error);
            setStatus('error');
            alert('업로드 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">데이터 업로드</h2>

            <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={clsx(
                    "border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200",
                    isDragging ? "border-primary bg-primary-light" : "border-slate-300 hover:border-primary hover:bg-slate-50",
                    status === 'success' && "border-green-500 bg-green-50"
                )}
            >
                {status === 'success' ? (
                    <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle size={32} />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-800">업로드 완료!</h3>
                        <p className="text-slate-500 mt-2">데이터가 성공적으로 처리되었습니다.</p>
                        <button
                            onClick={() => { setFile(null); setStatus('idle'); }}
                            className="mt-6 text-primary font-medium hover:underline"
                        >
                            다른 파일 올리기
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                            {file ? <FileSpreadsheet size={32} className="text-green-600" /> : <UploadIcon size={32} />}
                        </div>

                        {file ? (
                            <div>
                                <h3 className="text-lg font-semibold text-slate-800">{file.name}</h3>
                                <p className="text-slate-500 text-sm mt-1">{(file.size / 1024).toFixed(1)} KB</p>

                                <button
                                    onClick={handleUpload}
                                    disabled={status === 'uploading'}
                                    className="mt-6 px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {status === 'uploading' ? '처리 중...' : '업로드 시작'}
                                </button>

                                <button
                                    onClick={() => setFile(null)}
                                    className="block mx-auto mt-4 text-sm text-slate-400 hover:text-red-500"
                                >
                                    취소
                                </button>
                            </div>
                        ) : (
                            <div>
                                <h3 className="text-lg font-semibold text-slate-800">파일을 이곳에 드래그하세요</h3>
                                <p className="text-slate-500 mt-2">또는 클릭하여 파일 선택</p>
                                <p className="text-slate-400 text-sm mt-4">지원 형식: .xlsx, .csv</p>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="mt-8 bg-blue-50 p-4 rounded-lg border border-blue-100 flex gap-3">
                <AlertCircle className="text-blue-600 shrink-0" size={20} />
                <div>
                    <h4 className="font-medium text-blue-900">업로드 가이드</h4>
                    <p className="text-sm text-blue-700 mt-1">
                        기존 엑셀 파일의 '판매데이터' 시트 형식을 유지해주세요.<br />
                        A열: 날짜, B열: 매장명, C열: 브랜드, F열: 수량, G열: 금액
                    </p>
                </div>
            </div>
        </div>
    );
};

export default UploadPage;
