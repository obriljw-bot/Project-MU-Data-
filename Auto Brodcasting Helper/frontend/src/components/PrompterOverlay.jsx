import React from 'react';
import { X } from 'lucide-react';

const PrompterOverlay = ({ prompterMsg, onClose, onUpdateProduct, unmappedCodes = [], onMapNewCode }) => {
    // No auto-hide timer anymore. Persist until manual close.
    const [localCode, setLocalCode] = React.useState('');

    React.useEffect(() => {
        if (prompterMsg?.mode === 'PRODUCT' && prompterMsg.product) {
            setLocalCode(prompterMsg.product.code || '');
        }
    }, [prompterMsg?.product]);

    if (!prompterMsg) return null;

    const { mode, product, text } = prompterMsg;

    const commitCode = () => {
        if (product && localCode !== product.code) {
            onUpdateProduct && onUpdateProduct(product.id || product.code, 'code', localCode);
        }
    };

    return (
        <div className="absolute top-0 left-0 w-full h-1/3 bg-black z-50 flex items-center justify-center border-b-4 border-yellow-500 shadow-2xl animate-slide-down">
            {/* Close Button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 text-gray-500 hover:text-white p-2 rounded-full hover:bg-gray-800 transition-colors"
                title="Close Prompter"
            >
                <X size={48} />
            </button>

            {mode === 'TEXT' && (
                <div className="text-center px-10 w-full">
                    <h1 className="text-6xl md:text-9xl font-bold text-yellow-300 leading-tight drop-shadow-lg break-words">
                        {text}
                    </h1>
                </div>
            )}

            {mode === 'PRODUCT' && product && (
                <div className="flex flex-col items-center justify-center w-full px-4 gap-2">
                    {/* [NEW] Unmapped Code Floating Banner (Soft Tone) */}
                    {!product.code && unmappedCodes && unmappedCodes.length > 0 && (
                        <div className="absolute top-24 z-50 bg-slate-800/95 border border-slate-600 p-4 rounded-xl shadow-2xl flex flex-col items-center gap-3">
                            <span className="text-slate-300 font-medium text-lg">💡 연결 대기 중인 코드가 있습니다. 상품에 할당하려면 클릭하세요.</span>
                            <div className="flex gap-2 flex-wrap justify-center">
                                {unmappedCodes.map((code) => (
                                    <button
                                        key={code}
                                        onClick={() => onMapNewCode && onMapNewCode(code)}
                                        className="bg-slate-700 hover:bg-indigo-600 text-slate-100 font-mono font-medium px-4 py-2 rounded-lg transition-colors border border-slate-500 shadow-md flex items-center gap-2"
                                    >
                                        {code} <span className="text-sm bg-black/20 px-1.5 py-0.5 rounded text-indigo-100">적용</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Row 1: Code | Name (Same Line, Equal Size) */}
                    <div className="flex items-center justify-center gap-6 w-full text-center mt-8">
                        <div className="relative group">
                            <input
                                type="text"
                                value={localCode}
                                onChange={(e) => setLocalCode(e.target.value)}
                                onBlur={commitCode}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        commitCode();
                                        e.currentTarget.blur();
                                    }
                                }}
                                className="bg-yellow-600/30 text-yellow-400 px-4 py-2 rounded-2xl font-mono text-5xl md:text-7xl font-bold border-2 border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.4)] w-auto max-w-[300px] min-w-[150px] text-center outline-none focus:border-yellow-400 transition-all"
                            />
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-sm text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity font-bold bg-black/80 px-2 py-1 rounded pointer-events-none">Edit Code</span>
                        </div>
                        <span className="text-white text-5xl md:text-7xl font-bold drop-shadow-xl truncate max-w-[65%]">
                            {product.name}
                        </span>
                    </div>

                    {/* Row 2: Details (Price | Stock | Sold | Expiry) */}
                    <div className="flex flex-wrap justify-center gap-12 text-3xl md:text-5xl font-mono text-gray-300 mt-6 bg-gray-900/80 px-12 py-4 rounded-full border border-gray-600 shadow-xl backdrop-blur-md">
                        <div className="flex items-center gap-3">
                            <span className="text-gray-500 text-xl md:text-3xl font-sans font-bold">PRICE</span>
                            <span className="text-white font-bold tracking-tight">{product.price?.toLocaleString()}</span>
                        </div>
                        <div className="w-px h-16 bg-gray-500 mx-2"></div>
                        <div className="flex items-center gap-3">
                            <span className="text-gray-500 text-xl md:text-3xl font-sans font-bold">SOLD</span>
                            <div className="relative group flex items-center gap-4">
                                {/* Total Sales Display */}
                                <span className="text-red-500 font-bold">{product.sales || 0}</span>

                                {/* Add Input */}
                                <div className="flex items-center bg-gray-800/50 rounded-xl px-2 border border-gray-600 focus-within:border-red-500 transition-colors">
                                    <span className="text-gray-400 text-2xl mr-1">+</span>
                                    <input
                                        type="text" // Text type for cleanliness
                                        placeholder="0"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                const val = parseInt(e.currentTarget.value);
                                                if (!isNaN(val) && val !== 0) {
                                                    const newTotal = (product.sales || 0) + val;
                                                    onUpdateProduct && onUpdateProduct(product.id || product.code, 'sales', newTotal);
                                                    e.currentTarget.value = '';
                                                }
                                            }
                                        }}
                                        className="w-32 bg-transparent text-white font-bold text-center outline-none font-mono"
                                    />
                                </div>
                                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-sm text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-black/80 px-2 py-1 rounded">
                                    Type +N and Enter
                                </span>
                            </div>
                        </div>
                        <div className="w-px h-16 bg-gray-500 mx-2"></div>
                        <div className="flex items-center gap-3">
                            <span className="text-gray-500 text-xl md:text-3xl font-sans font-bold">REM</span>
                            <span className="text-blue-400 font-bold">{product.stock - (product.sales || 0)}</span>
                        </div>
                        <div className="w-px h-16 bg-gray-500 mx-2"></div>
                        <div className="flex items-center gap-3">
                            <span className="text-gray-500 text-xl md:text-3xl font-sans font-bold">REV</span>
                            <span className="text-yellow-400 font-bold tracking-tight">{((product.price || 0) * (product.sales || 0)).toLocaleString()}</span>
                        </div>
                        <div className="w-px h-16 bg-gray-500 mx-2"></div>
                        <div className="flex items-center gap-3">
                            <span className="text-gray-500 text-xl md:text-3xl font-sans font-bold">EXP</span>
                            <span className="text-pink-300 font-bold text-2xl md:text-4xl">{product.expiry || '-'}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export { PrompterOverlay };
