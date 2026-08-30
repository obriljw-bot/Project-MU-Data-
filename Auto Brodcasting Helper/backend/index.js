import { ChatAnalyzer } from './services/analyzer.js';
import { AutoResponder } from './services/responder.js';
import { ExcelExporter } from './services/exporter.js';
import { initDB } from './db.js';
import { GripBot } from './services/grip-bot.js';
import { config } from './config.js';
import readline from 'readline';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import os from 'os';
import localtunnel from 'localtunnel';

// ─── 보안 PIN (서버 시작 시 1회 생성, 재시작 전까지 동일) ───────────────────
const ADMIN_PIN = String(Math.floor(1000 + Math.random() * 9000));
console.log(`🔑 Admin PIN (this session): ${ADMIN_PIN}`);

// ─── 로컬 IP 감지 ─────────────────────────────────────────────────────────
function getLocalIp() {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}
const LOCAL_IP = getLocalIp();
console.log(`🖧  Local IP: ${LOCAL_IP}`);

// ─── 현재 터널 URL (터널 연결 후 갱신) ────────────────────────────────────
let currentTunnelUrl = null;

// 사용자 입력 받기 위한 유틸
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// [버그 수정] readline이 stdin을 점유하면 Windows에서 Ctrl+C(SIGINT)가 씹혀서
// 터미널을 꺼도 node 프로세스가 좀비로 남아 포트(8081/3001)를 계속 붙잡는 문제가
// 반복 발생 — Ctrl+C 시 확실히 종료되도록 명시적으로 처리.
rl.on('SIGINT', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// 메인 실행 함수
async function main() {
    console.log("🔥 System Initializing...");

    // 0. 방송 URL 설정 (환경변수 or Config)
    let targetUrl = config.targetUrl;
    console.log(`🎯 Default Target URL: ${targetUrl}`);

    // ─── Admin HTTP Server (PORT 3001) ─ PIN 조회용 ─────────────────────────
    const httpServer = createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (req.url === '/admin/pin' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ pin: ADMIN_PIN }));
        } else {
            res.writeHead(404); res.end('Not Found');
        }
    });
    httpServer.listen(3001, () => {
        console.log('🔐 Admin HTTP Server running on http://localhost:3001');
    });

    // 1. 데이터베이스 연결
    const db = await initDB();

    // 2. 서비스 인스턴스 생성
    const bot = new GripBot();
    const analyzer = new ChatAnalyzer();
    const responder = new AutoResponder();
    const exporter = new ExcelExporter(db); // Init Exporter

    // 3. WebSocket 서버 설정 (Port 8081)
    const wss = new WebSocketServer({ port: 8081 });
    console.log("📡 WebSocket Server running on ws://localhost:8081");

    // 브로드캐스트 헬퍼 (인증된 클라이언트 전체)
    function broadcast(wss, data) {
        wss.clients.forEach(client => {
            if (client.readyState === 1 && (client.isDashboard || client.isAuthenticated)) {
                client.send(JSON.stringify(data));
            }
        });
    }

    // 대시보드 전용 브로드캐스트
    function broadcastToDashboard(data) {
        wss.clients.forEach(client => {
            if (client.readyState === 1 && client.isDashboard) {
                client.send(JSON.stringify(data));
            }
        });
    }

    // 클라이언트 연결 시 핸들러
    wss.on('connection', (ws, request) => {
        // /ws-signal 경로 = Vite 프록시를 통한 외부 기기 (스캐너/프롬프터)
        // 직접 접속 = 대시보드
        const isExternal = request.url?.includes('/ws-signal');

        if (!isExternal) {
            // ── 대시보드 연결 ──
            ws.isDashboard = true;
            ws.isAuthenticated = true;
            console.log("💻 Dashboard Connected");

            // 초기 상태 전송
            ws.send(JSON.stringify({
                type: 'STATE',
                data: { autoReplyEnabled: config.autoReply.enabled, currentUrl: config.targetUrl }
            }));

            // 서버 정보 전송 (IP + 이미 연결된 터널 URL 포함)
            ws.send(JSON.stringify({
                type: 'SERVER_INFO',
                data: { localIp: LOCAL_IP, tunnelUrl: currentTunnelUrl }
            }));
        } else {
            // ── 외부 기기 연결 (스캐너 / 프롬프터) ──
            ws.isDashboard = false;
            ws.isAuthenticated = false;
            console.log("📱 External Device Connected — Auth Required");
            ws.send(JSON.stringify({ type: 'AUTH_REQUIRED' }));
        }

        // 프론트엔드로부터의 메시지 수신 (제어 명령)
        ws.on('message', async (message) => {
            try {
                const parsed = JSON.parse(message);

                // ── AUTH 핸들러 (외부 기기 전용) ─────────────────────────────
                if (parsed.type === 'AUTH') {
                    if (parsed.pin === ADMIN_PIN) {
                        ws.isAuthenticated = true;
                        ws.send(JSON.stringify({ type: 'AUTH_SUCCESS' }));
                        console.log("✅ External Device Auth Success");
                    } else {
                        ws.send(JSON.stringify({ type: 'AUTH_FAILED' }));
                        console.log("❌ External Device Auth Failed (wrong PIN)");
                    }
                    return;
                }

                // ── PONG (스캐너 keepalive) ────────────────────────────────
                if (parsed.type === 'PONG') return;

                // ── 인증되지 않은 외부 기기 차단 ────────────────────────────
                if (!ws.isDashboard && !ws.isAuthenticated) {
                    ws.send(JSON.stringify({ type: 'AUTH_REQUIRED' }));
                    return;
                }

                // ── 리모콘 연결은 제품 추천 전송 외 어떤 명령도 처리하지 않음 ──
                if (ws.isRemotePicker && parsed.type !== 'SUGGEST_PRODUCT') {
                    return;
                }

                // 제품 선택 리모콘: PIN 인증 완료 직후 스스로 역할을 선언 →
                // 이 연결은 이후 SUGGEST_PRODUCT 외 모든 명령을 무시하도록 제한됨
                if (parsed.type === 'REMOTE_PICKER_READY' && !ws.isDashboard && ws.isAuthenticated) {
                    ws.isRemotePicker = true;
                    console.log("🎯 Remote Picker Connected (scoped)");
                    // 대시보드에게 알려서, 지금 갖고 있는 제품 목록을 즉시 다시 보내도록 함
                    // (제품 목록 자체가 바뀌지 않으면 새로 접속한 리모콘은 초기 목록을 못 받는 문제 방지)
                    broadcastToDashboard({ type: 'REMOTE_PICKER_JOINED' });
                    return;
                }

                if (parsed.type === 'SUGGEST_PRODUCT') {
                    broadcastToDashboard({ type: 'SUGGEST_PRODUCT', data: { id: parsed.id, name: parsed.name } });
                    return;
                }

                // [버그 수정] TOP_STATS_SYNC(판매TOP5/핫키워드TOP5)에 대한 중계 핸들러가
                // 아예 없어서 대시보드가 계산한 결과가 프롬프터로 전달되지 않고 있었음.
                if (parsed.type === 'TOP_STATS_SYNC') {
                    broadcast(wss, parsed);
                    return;
                }

                // [버그 수정] SYNC_GLOBAL_STATS(TV프롬프터 판매합계금액/수량)도 동일하게
                // 중계 핸들러가 없어서 TV프롬프터 하단 통계가 계속 0으로만 표시되고 있었음.
                if (parsed.type === 'SYNC_GLOBAL_STATS') {
                    broadcast(wss, parsed);
                    return;
                }

                // 제품 선택 리모콘용 — 대시보드의 전체 제품 목록을 리모콘 화면에 동기화
                if (parsed.type === 'PRODUCTS_FULL_SYNC' && ws.isDashboard) {
                    broadcast(wss, parsed);
                    return;
                }

                if (parsed.type === 'UPDATE_URL') {
                    const newUrl = parsed.url;
                    console.log(`🔄 URL Update Requested: ${newUrl}`);

                    // 1. 봇 이동
                    bot.changeUrl(newUrl);

                    // 2. 통계 리셋 (메모리)
                    intentStats = { BUY: 0, INQUIRY: 0, LOCATION: 0, REACTION: 0, NONE: 0 };
                    recentMessages = [];

                    // 3. Config 업데이트
                    config.targetUrl = newUrl;

                    // 4. 알림 및 빈 통계 전송 (UI 즉시 클리어)
                    broadcast(wss, { type: 'URL_UPDATED', data: { url: newUrl } });
                    broadcast(wss, {
                        type: 'STATS_UPDATE',
                        data: {
                            trends: [],
                            intents: intentStats,
                            velocity: 0
                        }
                    });
                }

                if (parsed.type === 'RESET_ANALYSIS') {
                    console.log("🧹 Manual Analysis Reset Requested");
                    intentStats = { BUY: 0, INQUIRY: 0, LOCATION: 0, REACTION: 0, NONE: 0 };
                    recentMessages = [];

                    // DB의 해당 URL 데이터도 삭제하기를 원한다면? 
                    // 사용자는 "리프레쉬"를 원함. -> 메모리 리셋 + 현재 뷰 리셋.
                    // DB 데이터 삭제 여부는 선택사항이나, "누적"을 원하지 않는다면 삭제가 맞음.
                    // 우선 메모리 상의 "현재 세션 통계"를 리셋하는 것으로 처리. 

                    broadcast(wss, {
                        type: 'STATS_UPDATE',
                        data: {
                            trends: [],
                            intents: intentStats,
                            velocity: 0
                        }
                    });
                }

                if (parsed.type === 'TOGGLE_AUTO_REPLY') {
                    config.autoReply.enabled = parsed.enabled;
                    console.log(`Toogle Auto-Reply: ${config.autoReply.enabled}`);

                    // 모든 클라이언트에게 상태 브로드캐스트
                    broadcast(wss, {
                        type: 'STATE',
                        data: { autoReplyEnabled: config.autoReply.enabled }
                    });
                }

                if (parsed.type === 'SEND_CHAT') {
                    const msgAndNick = parsed.message;
                    const requestId = parsed.requestId; // Client generated ID
                    console.log(`📤 Manual Chat Request: ${msgAndNick} (ID: ${requestId})`);

                    try {
                        // 실제 전송 (GripBot)
                        await bot.sendMessage(msgAndNick);

                        // 성공 응답
                        ws.send(JSON.stringify({
                            type: 'CHAT_SEND_RESULT',
                            requestId: requestId,
                            success: true
                        }));
                    } catch (err) {
                        // 실패 응답
                        ws.send(JSON.stringify({
                            type: 'CHAT_SEND_RESULT',
                            requestId: requestId,
                            success: false,
                            error: err.message
                        }));
                    }
                }

                if (parsed.type === 'EXPORT_DATA') {
                    console.log("📥 Export Request Received");

                    try {
                        const report = await exporter.generateReport(config.targetUrl);

                        // 성공 알림 전송
                        ws.send(JSON.stringify({
                            type: 'EXPORT_COMPLETE',
                            data: {
                                success: true,
                                path: report.filePath,
                                filename: report.filename
                            }
                        }));
                    } catch (err) {
                        console.error("Export Failed:", err);
                        ws.send(JSON.stringify({
                            type: 'EXPORT_COMPLETE',
                            data: { success: false, error: err.message }
                        }));
                    }
                }

                // [NEW] Prompter: Text Cue
                if (parsed.type === 'SEND_CUE') {
                    console.log(`📣 Broadcasting Text Cue: ${parsed.data.message}`);
                    broadcast(wss, {
                        type: 'SHOW_CUE',
                        data: {
                            mode: 'TEXT',
                            text: parsed.data.message
                        }
                    });
                }

                // [NEW] Prompter: Product Selection Sync (Product Cue)
                if (parsed.type === 'SYNC_SELECTION') {
                    const product = parsed.data.product;
                    if (product) {
                        console.log(`📣 Broadcasting Product Cue: ${product.name}`);
                        broadcast(wss, {
                            type: 'SHOW_CUE',
                            data: {
                                mode: 'PRODUCT',
                                product: product
                            }
                        });
                    }
                }

                // [NEW] Mobile Scanner
                if (parsed.type === 'SCANNER_CODE') {
                    console.log(`📱 Scanner Read: ${parsed.data.code}`);
                    broadcast(wss, {
                        type: 'SCANNER_CODE_SCANNED',
                        data: { code: parsed.data.code }
                    });
                }

                // [NEW] Sniffer V3 Forwarding
                if (parsed.type === 'SNIFFER_LOG') {
                    // Convert to BOT_REPLY for Frontend
                    const snifferMsg = parsed.data.message;
                    console.log(`🤖 Sniffer Log: ${snifferMsg}`);
                    broadcast(wss, {
                        type: 'BOT_REPLY',
                        data: { replyText: snifferMsg, triggerMsg: null, broadcastId: Date.now() }
                    });
                }

                if (parsed.type === 'SNIFFER_TOAST') {
                    broadcast(wss, { ...parsed, broadcastId: Date.now() });
                }

                if (parsed.type === 'FCFS_WINNERS') {
                    const fp = parsed.data?.fingerprint ? ` [fp: ${parsed.data.fingerprint}]` : ' [no-fp]';
                    console.log(`🏆 FCFS Winners Event: ${parsed.data.count} users${fp}`);
                    broadcastToDashboard({ ...parsed, broadcastId: Date.now() });
                }

                // [V5.1] FCFS_CHAT_HINT: 스니퍼 내부 로그 전용 — 대시보드로 전달하지 않음
                if (parsed.type === 'FCFS_CHAT_HINT') {
                    console.log(`💬 FCFS_CHAT_HINT (no-relay): ${parsed.data?.count} users`);
                }
                
                if (parsed.type === 'FCFS_PARTICIPATION') {
                    // console.log(`📊 FCFS Participation: ${parsed.data.count}`);
                    broadcast(wss, { ...parsed, broadcastId: Date.now() });
                }

                // [DEBUG] Test Simulation Handler
                if (parsed.type === 'NEW_CHAT') {
                    console.log(`🧪 [TEST] Simulating Chat: ${parsed.data.message}`);
                    bot.emit('chat', {
                        ts: Date.now(),
                        nickname: parsed.data.nickname || 'Tester',
                        message: parsed.data.message
                    });
                }
            } catch (e) {
                console.error("Invalid WS Message:", e);
            }
        });
    });

    // 통계 데이터 메모리 캐시
    let intentStats = { BUY: 0, INQUIRY: 0, LOCATION: 0, REACTION: 0, NONE: 0 };
    let recentMessages = []; // { ts: number } for velocity calc

    // 3. 채팅 이벤트 핸들러 등록
    bot.on('chat', async (data) => {
        const { ts, nickname, message } = data;

        // A. 분석 실행
        const analysis = analyzer.analyze(message);
        console.log(`[CHAT] ${nickname}: ${message} => [${analysis.intent}] ${analysis.keywords.join(", ")}`);

        // Update Stats (In-Memory)
        if (intentStats[analysis.intent] !== undefined) {
            intentStats[analysis.intent]++;
        } else {
            intentStats.NONE++;
        }
        recentMessages.push({ ts: Date.now() });
        // 1분 지난 메시지 제거 (Velocity 계산용)
        const oneMinAgo = Date.now() - 60000;
        recentMessages = recentMessages.filter(m => m.ts > oneMinAgo);

        // WebSocket으로 실시간 데이터 전송 (채팅)
        broadcast(wss, {
            type: 'CHAT_MSG',
            data: {
                ts, nickname, message,
                ts, nickname, message,
                intent: analysis.intent,
                keywords: analysis.keywords,
                category: analysis.category // Broadcast Category
            }
        });

        // B. DB 저장
        try {
            // ... (기존 DB 저장 로직: chat_logs, chat_analysis, keyword_trends)
            // 1) 기본 로그
            const result = await db.run(
                `INSERT INTO chat_logs (ts, nickname, message) VALUES (?, ?, ?)`,
                [ts, nickname, message]
            );
            const chatId = result.lastID;

            await db.run(
                `INSERT INTO chat_analysis (chat_id, intent, details) VALUES (?, ?, ?)`,
                [chatId, analysis.intent, JSON.stringify(analysis)]
            );

            // 3) 트렌드 키워드 집계 (URL별 분리)
            for (const keyword of analysis.keywords) {
                await db.run(`
                    INSERT INTO keyword_trends (term, source_url, frequency, last_seen, category) 
                    VALUES (?, ?, 1, ?, ?)
                    ON CONFLICT(term, source_url) DO UPDATE SET 
                    frequency = frequency + 1,
                    last_seen = excluded.last_seen,
                    category = excluded.category
                `, [keyword, config.targetUrl, ts, analysis.category]); // Add Category
            }

            // 4) 종합 통계 전송 (트렌드 + 인텐트 + 속도)
            // 해당 URL에 대한 것만 조회
            const keywordTrends = await db.all(
                `SELECT term, frequency FROM keyword_trends WHERE source_url = ? ORDER BY frequency DESC LIMIT 10`,
                [config.targetUrl]
            );

            broadcast(wss, {
                type: 'STATS_UPDATE', // Changed from TREND_UPDATE to generic STATS_UPDATE
                data: {
                    trends: keywordTrends,
                    intents: intentStats,
                    velocity: recentMessages.length, // Messages per minute
                    // Note: If we want split trends (Query vs Participation), we need to query differently here.
                    // For now, let's just stick to the overall trends and let Frontend filter if needed?
                    // Or ideally, Backend should send split trends. 
                    // Let's optimize this later. The Task is "Filtering", Frontend tabs can filter based on message stream,
                    // but for "Trends Chart", we might need split data.
                }
            });

        } catch (err) {
            console.error("DB Write Error:", err.message);
        }

        // C. 자동응답 수행
        const replyText = responder.determineReply(analysis);
        if (replyText && responder.shouldSend(replyText)) {
            console.log(`💡 Auto-Reply Triggered: "${replyText}"`);

            // 실제 전송 (설정 값 확인)
            if (config.autoReply.enabled) {
                // await bot.sendMessage(replyText); // 주의: 실제 방송 전송
                console.log(`(Simulation) Sent: ${replyText}`);

                // 대시보드에도 알림
                broadcast(wss, {
                    type: 'BOT_REPLY',
                    data: { replyText, triggerMsg: message }
                });
            } else {
                console.log(`(Skipped) Auto-Reply is OFF`);
            }
        }
    });

    // 4. 시스템 이벤트 핸들러 (구매/장바구니 등)
    bot.on('system', (data) => {
        const { ts, type, message } = data;
        console.log(`🔔 [SYSTEM] ${type}: ${message}`);

        if (type === 'PURCHASE') {
            console.log("💰 실제 구매 확정! (Confirmed Sale)");

            // 구매 통계에 반영 (일단 BUY 인텐트로 합산 또는 별도 처리)
            // 여기서는 '실제 구매'임을 알리기 위해 별도 이벤트로 전송
            broadcast(wss, {
                type: 'SALES_EVENT',
                data: {
                    event: 'PURCHASE',
                    message: message,
                    ts: Date.now()
                }
            });

            // (선택사항) DB에 구매 기록 저장 로직 추가 가능
        } else if (type === 'CART') {
            console.log("🛒 장바구니 담기 감지 (판매 집계 제외)");
        }
    });

    // 4. 봇 준비 완료 (브라우저는 띄우지 않음 - 웹에서 URL 수신 시 Lazy Launch)
    // await bot.launch(); -> (X) 빈 창 띄우지 않기

    console.log("🕒 Waiting for URL input from Dashboard...");

    // [중복 제거] 런처(2_그립봇_자동실행.bat)가 프론트엔드 기동 후 3초 뒤
    // 별도로 대시보드를 열어주므로, 여기서 또 열면 창이 2개 뜸 — 제거.

    // 6. 글로벌 터널링 (localtunnel) — Vite 포트 5173 외부 노출
    async function startTunnel() {
        try {
            console.log("🌐 Starting localtunnel on port 5173...");
            const tunnel = await localtunnel({ port: 5173 });
            currentTunnelUrl = tunnel.url;
            console.log(`✅ Tunnel ready: ${tunnel.url}`);

            // 연결된 대시보드에 즉시 전송
            broadcastToDashboard({ type: 'TUNNEL_READY', data: { tunnelUrl: tunnel.url } });

            tunnel.on('close', () => {
                console.log("⚠️  Tunnel closed — restarting in 5s...");
                currentTunnelUrl = null;
                setTimeout(startTunnel, 5000);
            });
            tunnel.on('error', (err) => {
                console.error("Tunnel error:", err.message);
                currentTunnelUrl = null;
                setTimeout(startTunnel, 5000);
            });
        } catch (err) {
            console.error("Tunnel start failed:", err.message, "— retry in 10s");
            setTimeout(startTunnel, 10000);
        }
    }
    startTunnel();
}

// 에러 처리
process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR:', err);
});

main().catch(console.error);
