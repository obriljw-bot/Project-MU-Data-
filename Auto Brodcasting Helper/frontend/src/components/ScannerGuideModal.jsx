import React from 'react';
import { QrCode, X, Copy, AlertCircle, CheckCircle } from 'lucide-react';

// 방송 구동 시 항상 함께 켜두는 고정 Cloudflare 터널 도메인 (loca.lt 경고 화면 없이 바로 접속됨)
const FIXED_TUNNEL_URL = 'https://grip.makemerobot.cloud';

export function ScannerGuideModal({ localIp, adminPin, onClose }) {
    const baseUrl = FIXED_TUNNEL_URL;

    const scannerUrl = `${baseUrl}/scanner.html`;
    const prompterUrl = `${baseUrl}/prompter.html`;
    // 제품 선택 리모콘: 고정 링크 + 위 보안코드(PIN)로 인증 (scanner.html과 동일 방식)
    const remotePickerUrl = `${baseUrl}/remote-picker.html`;
    // TV 모니터 모드는 같은 PC(HDMI 연결)에서만 열리는 용도라 터널 주소가 아니라
    // 항상 로컬 IP 기준으로 안내 — 외부망 접속 시엔 PIN 자동인증이 동작하지 않음.
    const tvPrompterUrl = `http://${localIp || 'IP_LOADING'}:5173/prompter.html?tv=1`;
    const [copied, setCopied] = React.useState('');

    const handleCopy = (text, type) => {
        navigator.clipboard.writeText(text);
        setCopied(type);
        setTimeout(() => setCopied(''), 2000);
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999] backdrop-blur-sm animate-fade-in">
            <div className="bg-gray-900 border border-purple-500/50 rounded-2xl p-6 max-w-lg w-full shadow-[0_0_50px_rgba(168,85,247,0.15)] relative animate-slide-up">
                
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                >
                    <X size={24} />
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-purple-900/40 rounded-xl">
                        <QrCode className="text-purple-400" size={28} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">외부 무선 기기 통합 접속망</h2>
                        <p className="text-gray-400 text-sm">태블릿이나 스마트폰으로 스튜디오 밖에서도 접속합니다.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Security PIN Display */}
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex flex-col items-center justify-center">
                        <div className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-1">
                            현재 방송 1회용 보안 코드 (PIN)
                        </div>
                        <div className="text-4xl font-mono font-bold text-white tracking-widest drop-shadow-md">
                            {adminPin || '----'}
                        </div>
                        <p className="text-xs text-red-300/70 mt-2">외부 기기에서 화면을 열 때 반드시 위 코드를 입력해야 합니다.</p>
                    </div>

                    {/* Dashboard Address */}
                    <div className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                        <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                            👑 메인 원격 통제석 주소 (전체 기능)
                        </div>
                        <div className="flex gap-2 items-stretch">
                            <input 
                                type="text" 
                                readOnly 
                                value={baseUrl}
                                className="flex-1 bg-gray-900 text-sm font-mono text-blue-300 rounded-lg px-3 py-2 border border-gray-700 focus:outline-none"
                            />
                            <button 
                                onClick={() => handleCopy(baseUrl, 'dashboard')}
                                className={`px-4 flex items-center justify-center rounded-lg font-bold text-sm transition-colors ${copied === 'dashboard' ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                            >
                                {copied === 'dashboard' ? <CheckCircle size={18} /> : <Copy size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* Scanner Address */}
                    <div className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                        <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                            🛒 모바일 스캐너 접속 주소
                        </div>
                        <div className="flex gap-2 items-stretch">
                            <input 
                                type="text" 
                                readOnly 
                                value={scannerUrl}
                                className="flex-1 bg-gray-900 text-sm font-mono text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none"
                            />
                            <button 
                                onClick={() => handleCopy(scannerUrl, 'scanner')}
                                className={`px-4 flex items-center justify-center rounded-lg font-bold text-sm transition-colors ${copied === 'scanner' ? 'bg-green-600 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                            >
                                {copied === 'scanner' ? <CheckCircle size={18} /> : <Copy size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* Prompter Address */}
                    <div className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                        <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                            🖥️ 태블릿 프롬프터 접속 주소
                        </div>
                        <div className="flex gap-2 items-stretch">
                            <input 
                                type="text" 
                                readOnly 
                                value={prompterUrl}
                                className="flex-1 bg-gray-900 text-sm font-mono text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none"
                            />
                            <button 
                                onClick={() => handleCopy(prompterUrl, 'prompter')}
                                className={`px-4 flex items-center justify-center rounded-lg font-bold text-sm transition-colors ${copied === 'prompter' ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                            >
                                {copied === 'prompter' ? <CheckCircle size={18} /> : <Copy size={18} />}
                            </button>
                        </div>
                        <p className="text-xs text-green-400 mt-2 font-bold bg-green-900/40 p-2 rounded-md inline-block">
                          ✅ 고정 주소({FIXED_TUNNEL_URL}) 사용 중 — 경고 화면 없이 LTE 망에서 바로 접속 가능합니다.
                        </p>
                    </div>

                    {/* Product Remote Picker Address */}
                    <div className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                        <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                            🎯 제품 선택 리모콘 접속 주소 (셀러용)
                        </div>
                        <div className="flex gap-2 items-stretch">
                            <input
                                type="text"
                                readOnly
                                value={remotePickerUrl}
                                className="flex-1 bg-gray-900 text-sm font-mono text-purple-300 rounded-lg px-3 py-2 border border-gray-700 focus:outline-none"
                            />
                            <button
                                onClick={() => handleCopy(remotePickerUrl, 'remotePicker')}
                                className={`px-4 flex items-center justify-center rounded-lg font-bold text-sm transition-colors ${copied === 'remotePicker' ? 'bg-green-600 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'}`}
                            >
                                {copied === 'remotePicker' ? <CheckCircle size={18} /> : <Copy size={18} />}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            고정 링크 — 위 "1회용 보안 코드(PIN)"로 인증 후 접속합니다. 다른 외부 접속과 동일한 방식입니다.
                        </p>
                    </div>

                    {/* TV/Monitor Prompter Address */}
                    <div className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                        <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                            📺 TV/모니터 프롬프터 접속 주소 (로컬 전용)
                        </div>
                        <div className="flex gap-2 items-stretch">
                            <input
                                type="text"
                                readOnly
                                value={tvPrompterUrl}
                                className="flex-1 bg-gray-900 text-sm font-mono text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none"
                            />
                            <button
                                onClick={() => handleCopy(tvPrompterUrl, 'tvPrompter')}
                                className={`px-4 flex items-center justify-center rounded-lg font-bold text-sm transition-colors ${copied === 'tvPrompter' ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                            >
                                {copied === 'tvPrompter' ? <CheckCircle size={18} /> : <Copy size={18} />}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            HDMI로 연결된 40인치 모니터/TV 전용 — PIN 자동 인증되며(같은 PC에서만 동작), 탭 없이 상품정보+세로형 방송화면+채팅+통계가 동시에 표시됩니다.
                        </p>
                    </div>
                </div>

                <button 
                    onClick={onClose}
                    className="w-full mt-6 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white py-3 rounded-xl font-bold transition-colors"
                >
                    확인 완료
                </button>
            </div>
        </div>
    );
}
