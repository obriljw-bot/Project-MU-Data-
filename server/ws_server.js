const WebSocket = require('ws');
const http = require('http');
const os = require('os');
const url = require('url');
const { startCloudflareTunnel, stopCloudflareTunnel } = require('./cloudflare');

let TUNNEL_URL = null;

// 시작 시 자동으로 5173 포트를 외부로 터널링
(async () => {
    try {
        TUNNEL_URL = await startCloudflareTunnel(5173);
        console.log(`\n========================================================`);
        console.log(`🌍 [통합 무선 터널망 개통] 외부 기기 전용 무선 주소: ${TUNNEL_URL}`);
        console.log(`========================================================\n`);
        
        if (TUNNEL_URL) {
            broadcast({ type: 'TUNNEL_READY', data: { tunnelUrl: TUNNEL_URL } });
        }
    } catch (err) {
        console.error('Cloudflare Tunnel 구동 실패. 터미널 수동 구동 필요:', err.message);
    }
})();

process.on('SIGINT', () => {
    console.log('[TUNNEL] Shutting down Cloudflare engine...');
    stopCloudflareTunnel();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('[TUNNEL] Shutting down Cloudflare engine...');
    stopCloudflareTunnel();
    process.exit(0);
});

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        if (name.match(/Loopback|vEthernet|Virtual|WSL|Bluetooth/i)) continue;
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// 1. Generate 4-digit Security PIN on startup
let CURRENT_PIN = Math.floor(1000 + Math.random() * 9000).toString();

console.log(`\n========================================================`);
console.log(`🔐 [보안 터널망 개통] 현재 접속 PIN 번호: ${CURRENT_PIN}`);
console.log(`========================================================\n`);

const WSS_PORT = 8081;

// 2. Create HTTP Server for Local API and WS Upgrade
const server = http.createServer((req, res) => {
    // Basic CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);

    // [중요 보안] 오직 로컬(관리자 PC)에서 브라우저로 직접 접속했을 때만 PIN을 반환합니다.
    if (parsedUrl.pathname === '/admin/pin') {
        const ip = req.socket.remoteAddress || '';
        if (ip.includes('127.0.0.1') || ip === '::1' || ip.includes('::ffff:127.0.0.1')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ pin: CURRENT_PIN }));
        } else {
            console.warn(`[보안 경고] 외부 IP(${ip})에서 PIN 발급 시도가 차단되었습니다.`);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '외부망에서는 권한이 없습니다.' }));
        }
        return;
    }

    res.writeHead(404);
    res.end();
});

// 3. Attach WS Server
const wss = new WebSocket.Server({ server });

console.log(`📡 WebSocket Relay Server running on port ${WSS_PORT}`);

// Store all connected clients
const clients = new Set();

// ===================================
// [HEARTBEAT] 연결 끊김 방지 (Localtunnel/Proxy Idle Timeout 방어)
// ===================================
setInterval(() => {
    clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING' }));
        }
    });
}, 15000); // 15초마다 PING 전송 (대부분의 터널은 30~60초 유휴 시 끊어버림)

wss.on('connection', (ws, req) => {
    clients.add(ws);
    
    // Default: Authenticated FALSE
    ws.isAuthenticated = false;
    
    // VITE Proxy를 통해 들어왔는지 확인
    const isLocalhost = req.socket.remoteAddress && (req.socket.remoteAddress.includes('127.0.0.1') || req.socket.remoteAddress === '::1');
    // 로컬 스니퍼 봇(Node.js 로컬 구동)은 별도 인증 없이 통과시키기 위한 플래그
    // 단, Vite Proxy를 통해 터널망에 들어온 외부 클라이언트도 127.0.0.1로 찍히기 때문에 철저히 인증을 요구해야 합니다.
    // 따라서 모든 클라이언트에게 AUTH를 요구하도록 구조를 짭니다.

    ws.send(JSON.stringify({ type: 'AUTH_REQUIRED' }));

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message);

            if (parsed.type === 'PONG') {
                // 터널 유지용 Pong 응답 무시 (디버깅용 로그 생략)
                return;
            }

            // ADMIN 기능: 새로운 PIN 발급
            if (parsed.type === 'CHANGE_PIN' && ws.isAuthenticated) {
                CURRENT_PIN = parsed.newPin || Math.floor(1000 + Math.random() * 9000).toString();
                console.log(`🔐 보안 PIN이 변경되었습니다: ${CURRENT_PIN}`);
                // 새로고침 편의를 위해 어드민에게만 새 PIN 알려줌 (Broadcast는 안함)
                ws.send(JSON.stringify({ type: 'PIN_CHANGED', data: { pin: CURRENT_PIN } }));
                return;
            }

            // AUTH 요청 처리
            if (parsed.type === 'AUTH') {
                if (parsed.pin === CURRENT_PIN) {
                    ws.isAuthenticated = true;
                    // 인증 성공 시에만 서버 정보를 넘겨줌
                    const localIp = getLocalIp();
                    ws.send(JSON.stringify({ type: 'SERVER_INFO', data: { localIp: localIp, tunnelUrl: TUNNEL_URL } }));
                    ws.send(JSON.stringify({ type: 'AUTH_SUCCESS' }));
                } else {
                    ws.send(JSON.stringify({ type: 'AUTH_FAILED', error: '보안 코드가 일치하지 않습니다.' }));
                }
                return;
            }

            // Sniffer Bot (Python/Node) 같은 백엔드 스크립트 연결 시 우회 인증키 처리 (선택)
            if (parsed.type === 'AUTH_SYSTEM' && isLocalhost) {
                ws.isAuthenticated = true;
                // 대시보드에 서버 정보 전송 (로컬 IP + 현재 터널 URL)
                const localIp = getLocalIp();
                ws.send(JSON.stringify({ type: 'SERVER_INFO', data: { localIp: localIp, tunnelUrl: TUNNEL_URL } }));
                return;
            }

            // ===================================
            // 방화벽: 미인증 클라이언트 메시지 차단
            // ===================================
            if (!ws.isAuthenticated) {
                // 접속은 끊지 않고 무시합니다.
                return;
            }

            // ===================================
            // PROMPTER LOGIC HANDLERS
            // ===================================

            if (parsed.type === 'SEND_CUE') {
                broadcast({
                    type: 'SHOW_CUE',
                    data: {
                        mode: 'TEXT',
                        text: parsed.data.message
                    }
                });
            }
            else if (parsed.type === 'SYNC_SELECTION') {
                broadcast({
                    type: 'SHOW_CUE',
                    data: {
                        mode: 'PRODUCT',
                        product: parsed.data.product
                    }
                });
            }

            // ===================================
            // CHAT SEND (대시보드 → 스니퍼 단방향)
            // 발신자(대시보드)에게는 다시 보내지 않음 → 중복 전송 방지
            // ===================================
            else if (parsed.type === 'SEND_CHAT') {
                const payload = JSON.stringify(parsed);
                clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.isAuthenticated) {
                        client.send(payload);
                    }
                });
            }

            // ===================================
            // SNIFFER LOGIC HANDLERS
            // ===================================

            else if (parsed.type === 'SNIFFER_LOG') {
                broadcast({
                    type: 'BOT_REPLY',
                    data: {
                        replyText: parsed.data.message || "Log Update"
                    }
                });
            }
            else if (parsed.type === 'SNIFFER_TOAST') {
                broadcast({
                    type: 'BOT_REPLY',
                    data: {
                        replyText: `🔔 ${parsed.data.message}`
                    }
                });
            }

            // ===================================
            // DEFAULT BROADCAST
            // ===================================
            else {
                broadcast(parsed);
            }

        } catch (e) {
            console.error('WS Message Error:', e);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
    });

    ws.on('error', (err) => {
        clients.delete(ws);
        console.error('WS client error:', err);
    });
});

function broadcast(data) {
    const payload = JSON.stringify(data);
    clients.forEach(client => {
        // [중요 수정] 오직 보안 인증을 통과한 클라이언트에게만 방송 데이터(수익, 매출, 프롬프터 정보)를 전송합니다!
        if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
            client.send(payload);
        }
    });
}

// Start HTTP Server
server.listen(WSS_PORT, () => {
    // Ready
});

module.exports = wss;
