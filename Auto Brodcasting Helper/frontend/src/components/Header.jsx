import React from 'react';

export function Header({ isConnected, targetUrl, onReconnect }) {
    return (
        <div className="h-8 bg-black flex items-center justify-between px-4 text-xs text-gray-500 border-b border-gray-900 select-none flex-none">
            <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
                <span>Server: {isConnected ? 'Online' : 'Offline'}</span>
                <span className="mx-2">|</span>
                <span className="max-w-[300px] truncate">Target: {targetUrl || 'Not Set'}</span>
            </div>
            <div className="flex items-center gap-2">
                {!isConnected && <button onClick={onReconnect} className="text-red-400 hover:text-red-300">Reconnect</button>}
                <span>v2.3.0 (Refactored)</span>
            </div>
        </div>
    );
}
