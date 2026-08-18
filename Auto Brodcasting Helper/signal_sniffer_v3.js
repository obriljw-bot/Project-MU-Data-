import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIGURATION
const DASHBOARD_WS_URL = 'ws://localhost:8081'; // Local Dashboard Backend
const OUTPUT_DIR = __dirname;
const DEBUG_MODE = true;
const INSTANCE_ID = Math.random().toString(36).substring(7).toUpperCase();

// STATUS FLAGS
let isSocketConnected = false;
let ws;
let hasExtractedWinners = false;
let pageRef = null;
let lastWinnerCount = 0; // GLOBAL STATE (Shared between Chat & DOM Polling)

// ── 영상 창 크기/위치 저장·복원 ────────────────────────────────────
// 사용자가 수동으로 딱 맞게 배치한 창 크기를 저장해두고, 다음 실행 시
// 그 값 그대로 자동 복원. 대시보드의 "창크기 저장" 버튼 → SAVE_VIDEO_WINDOW
// 신호를 받으면 CDP로 현재 실제 창 좌표를 읽어 파일에 기록.
const VIDEO_WINDOW_CONFIG_PATH = path.join(__dirname, 'video_window_config.json');

function loadSavedWindowBounds() {
    try { return JSON.parse(fs.readFileSync(VIDEO_WINDOW_CONFIG_PATH, 'utf8')); } catch { return null; }
}

async function saveCurrentWindowBounds(page) {
    const client = await page.context().newCDPSession(page);
    const { windowId } = await client.send('Browser.getWindowForTarget');
    const { bounds } = await client.send('Browser.getWindowBounds', { windowId });
    fs.writeFileSync(VIDEO_WINDOW_CONFIG_PATH, JSON.stringify(bounds, null, 2));
    return bounds;
}

// ==========================================
// 1. WebSocket Client & Control
// ==========================================
function connectToDashboard() {
    ws = new WebSocket(DASHBOARD_WS_URL);

    ws.on('open', () => {
        console.log(`✅ [${INSTANCE_ID}] Connected to Dashboard (WebSocket)`);
        isSocketConnected = true;
        
        // V4.0 통신 프로토콜: 로컬 스니퍼 시스템 인증 통과
        ws.send(JSON.stringify({ type: 'AUTH_SYSTEM' }));
        
        sendToast('🔔 스니퍼 디버그 모드 시작 (V3.2)');
    });

    ws.on('message', async (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'UPDATE_URL' && msg.url) {
                console.log(`🔗 Navigating to: ${msg.url}`);
                sendBotMessage(`🚀 이동 중: ${msg.url}`);
                hasExtractedWinners = false;
                if (pageRef) {
                    try {
                        await pageRef.goto(msg.url, { waitUntil: 'domcontentloaded' });
                        sendBotMessage("✅ 이동 완료! 3초 후 DOM 감시 시작...");
                        await new Promise(r => setTimeout(r, 3000)); // Wait for render
                        await injectDOMObserver(pageRef);
                    } catch (e) {
                        sendBotMessage(`❌ 이동 실패: ${e.message}`);
                    }
                }
            }

            // 영상 창 크기/위치 저장 (대시보드 버튼 클릭 시)
            if (msg.type === 'SAVE_VIDEO_WINDOW') {
                if (pageRef) {
                    try {
                        const bounds = await saveCurrentWindowBounds(pageRef);
                        sendBotMessage(`📐 영상창 크기 저장됨: ${bounds.width}x${bounds.height} @ (${bounds.left},${bounds.top}) — 다음 실행부터 자동 적용`);
                    } catch (e) {
                        sendBotMessage(`❌ 영상창 크기 저장 실패: ${e.message}`);
                    }
                }
            }

            // [NEW] Automatic Chat Sender Logic
            if (msg.type === 'SEND_CHAT' && msg.message) {
                // 2초 내 동일 메시지 중복 방어 (서버 브로드캐스트 중복 수신 대비)
                const now = Date.now();
                if (msg.message === lastSentChatMsg && (now - lastSentChatTime) < 2000) {
                    console.log(`💬 [AUTO-MSG] 중복 메시지 스킵: ${msg.message}`);
                    return;
                }
                lastSentChatMsg = msg.message;
                lastSentChatTime = now;
                // 큐에 순서대로 쌓아서 한 번에 하나씩만 실제 전송 — 동시 도착 시 서로 덮어쓰는 것 방지
                chatSendQueue = chatSendQueue.then(() => sendChatToGrip(msg));
            }
        } catch (e) { console.error(e); }
    });

    ws.on('close', () => { setTimeout(connectToDashboard, 3000); });
    ws.on('error', () => { });
}

async function sendChatToGrip(msg) {
                console.log(`💬 [AUTO-MSG] Sending to Grip: ${msg.message}`);
                if (pageRef) {
                    try {
                        const CANDIDATE_SELECTORS = [
                            'textarea.input-box',
                            'textarea',
                            '[contenteditable="true"]',
                            '[role="textbox"]',
                            'div.input-box',
                            '[data-placeholder*="채팅"]',
                            '[data-placeholder*="입력"]',
                            '[placeholder*="채팅"]',
                            '[placeholder*="입력"]',
                        ];

                        // ── 1단계: 메인 페이지 locator (Shadow DOM 자동 투과) ──
                        let foundLocator = null;
                        let foundInFrame = false;

                        for (const sel of CANDIDATE_SELECTORS) {
                            try {
                                const loc = pageRef.locator(sel).first();
                                await loc.waitFor({ state: 'visible', timeout: 400 });
                                foundLocator = loc;
                                break;
                            } catch (_) {}
                        }

                        // ── 2단계: iframe 내부 탐색 ──────────────────────────
                        if (!foundLocator) {
                            const frames = pageRef.frames().filter(f => f !== pageRef.mainFrame());
                            for (const frame of frames) {
                                for (const sel of CANDIDATE_SELECTORS) {
                                    try {
                                        const loc = frame.locator(sel).first();
                                        await loc.waitFor({ state: 'visible', timeout: 300 });
                                        foundLocator = loc;
                                        foundInFrame = true;
                                        console.log(`🖼️ [AUTO-MSG] iframe에서 셀렉터 발견: "${sel}" (${frame.url()})`);
                                        break;
                                    } catch (_) {}
                                }
                                if (foundLocator) break;
                            }
                        }

                        // ── 실패 시: 스크린샷 + 페이지소스 저장 ─────────────
                        if (!foundLocator) {
                            console.error("❌ [AUTO-MSG] 채팅 입력창을 찾을 수 없습니다. 디버그 파일 저장 중...");

                            // 스크린샷 저장 (무엇이 보이는지 확인)
                            const screenshotPath = path.join(OUTPUT_DIR, 'chat_debug_screenshot.png');
                            await pageRef.screenshot({ path: screenshotPath, fullPage: false });
                            console.error(`📸 스크린샷 저장됨: ${screenshotPath}`);

                            // 페이지 소스 일부 저장 (입력 관련 요소 탐색용)
                            const pageSource = await pageRef.evaluate(() => {
                                const all = Array.from(document.querySelectorAll('*'));
                                return all
                                    .filter(el => {
                                        const tag = el.tagName.toLowerCase();
                                        const ce = el.contentEditable;
                                        const role = el.getAttribute('role') || '';
                                        return tag === 'textarea' || tag === 'input' ||
                                               ce === 'true' || role === 'textbox' ||
                                               el.className?.toString().toLowerCase().includes('input') ||
                                               el.className?.toString().toLowerCase().includes('chat');
                                    })
                                    .map(el => ({
                                        tag: el.tagName,
                                        id: el.id || '',
                                        class: el.className?.toString() || '',
                                        role: el.getAttribute('role') || '',
                                        contenteditable: el.contentEditable || '',
                                        placeholder: el.placeholder || el.getAttribute('data-placeholder') || '',
                                        visible: el.offsetWidth > 0 && el.offsetHeight > 0
                                    }));
                            });
                            const debugPath = path.join(OUTPUT_DIR, 'chat_input_debug.txt');
                            fs.writeFileSync(debugPath, JSON.stringify(pageSource, null, 2), 'utf8');
                            console.error(`📁 요소 목록 저장됨: ${debugPath}`);

                            // 프레임 URL 목록도 출력
                            const frameUrls = pageRef.frames().map(f => f.url());
                            console.error(`🖼️ 현재 프레임 목록: ${JSON.stringify(frameUrls)}`);

                            throw new Error("채팅 입력창 셀렉터 없음 → chat_debug_screenshot.png / chat_input_debug.txt 확인");
                        }

                        // ── 전송 ─────────────────────────────────────────────
                        const tagName = await foundLocator.evaluate(el => el.tagName.toLowerCase());
                        const isContentEditable = await foundLocator.evaluate(el => el.contentEditable === 'true');

                        if (isContentEditable) {
                            await foundLocator.click();
                            await foundLocator.evaluate(el => el.textContent = '');
                            await pageRef.keyboard.type(msg.message, { delay: 20 });
                            await pageRef.keyboard.press('Enter');
                        } else {
                            await foundLocator.fill(msg.message);
                            await foundLocator.press('Enter');
                        }

                        console.log(`✅ [AUTO-MSG] 전송 완료 (selector: ${tagName}${isContentEditable ? '[contenteditable]' : ''})`);
                        sendToDashboard('CHAT_SEND_RESULT', { success: true, requestId: msg.requestId });
                    } catch (e) {
                        console.error("❌ Failed to send chat to Grip:", e.message);
                        sendToDashboard('CHAT_SEND_RESULT', { success: false, error: e.message, requestId: msg.requestId });
                    }
                }
}

function sendToDashboard(type, data) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, data }));
}
function sendBotMessage(text) { sendToDashboard('SNIFFER_LOG', { message: `[${INSTANCE_ID}] ${text}` }); }
function sendToast(message, type = 'success') { sendToDashboard('SNIFFER_TOAST', { message, type }); }
const WINNER_EVENT_DEBOUNCE_MS = 500; // 0.5초 (동일 이벤트의 브라우저 렌더링 중복만 방지)
let lastWinnerEventTime = 0;
let lastWinnerMessageRaw = "";

// CART_EVENT 중복 방어 — DOM 옵저버 + 시스템 채널 양쪽에서 동일 코드가 오는 것을 차단
const CART_EVENT_DEBOUNCE_MS = 10000; // 10초 이내 동일 코드 재수신 차단
let lastCartEventCode = '';
let lastCartEventTime = 0;

// SEND_CHAT 중복 방어 (2초 내 동일 메시지 재수신 차단)
let lastSentChatMsg = '';
let lastSentChatTime = 0;

// [race condition 방지] 프리셋 순환 공지와 빠른전송 버튼이 거의 동시에 도착하면
// 둘 다 같은 채팅 입력창을 동시에 자동화(fill/type + Enter)하면서 서로 덮어써
// 하나가 유실되는 문제 발견. Promise 체인으로 직렬화해 한 번에 하나씩만 처리.
let chatSendQueue = Promise.resolve();

function onDOMChat(nickname, message) {
    // V3.4: Handle Special System Events from Browser
    if (nickname === "SYSTEM_WINNER_EVENT") {
        const now = Date.now();
        const diff = now - lastWinnerEventTime;

        try {
            const payload = JSON.parse(message);
            const count = payload.count;
            const rawMsg = payload.raw || "";

            // 0.5초 이내에 토씨 하나 안 틀리고 똑같은 메시지가 올라온 경우만 방어 (DOM 렌더링 중복 버그 방지)
            if (diff < WINNER_EVENT_DEBOUNCE_MS && rawMsg === lastWinnerMessageRaw) {
                console.log(`⚠️ [${INSTANCE_ID}] [DEBOUNCE] duplicate blocked.`);
                return;
            }

            lastWinnerEventTime = now;
            lastWinnerMessageRaw = rawMsg;

            console.log(`🚨 [${INSTANCE_ID}] [SYSTEM EVENT] FCFS Winners Detected via Chat: ${count} users`);
            sendBotMessage(`📢 [종료] 선착순 당첨 ${count}명 (채팅 감지)`);

            // [V5.1] 채팅 경로도 FCFS_WINNERS 전송.
            // DOM 폴링이 winner-item 팝업을 못 찾는 방송 유형(채팅 전용 당첨 공지)에서는
            // 채팅 경로가 유일한 신호원이므로 로그 생성에 반드시 참여해야 함.
            // 중복 방어는 App.jsx의 fallback dedup(count+time 10초 잠금)이 담당.
            sendToDashboard('FCFS_WINNERS', {
                count: count,
                winners: [],   // 채팅 경로는 명단 없음 → fingerprint 없음 → fallback dedup 적용
                fingerprint: '', // 명시적으로 빈 지문 전달
                snifferId: INSTANCE_ID
            });
        } catch (e) {
            console.error(`Failed to parse SYSTEM_WINNER_EVENT [${INSTANCE_ID}]`, e);
        }
        return; // Do not broadcast as chat
    } else if (nickname === "SYSTEM_PRODUCT_CART_EVENT") {
        try {
            const payload = JSON.parse(message);
            const code = payload.code;
            const now = Date.now();

            // 중복 차단: 동일 코드가 CART_EVENT_DEBOUNCE_MS 이내에 재수신되면 무시
            // (DOM 옵저버 + 시스템 채널이 동시에 같은 이벤트를 보내는 구조적 중복 방지)
            if (code === lastCartEventCode && (now - lastCartEventTime < CART_EVENT_DEBOUNCE_MS)) {
                console.log(`⚠️ [${INSTANCE_ID}] [DEBOUNCE] CART_EVENT duplicate blocked: ${code}`);
                return;
            }
            lastCartEventCode = code;
            lastCartEventTime = now;

            // [V5.0] lastWinnerCount 리셋 제거.
            // 다음 판 감지는 "당첨자 화면이 꺼질 때(0명 전환)" 자연스럽게 리셋되어 처리됨.
            // CART 시점 즉시 리셋은 화면에 명단이 남아있는 동안 오탐(재발사)의 원인이었음.

            console.log(`🚨 [${INSTANCE_ID}] [SYSTEM EVENT] Product Cart Detected: ${code}`);
            sendBotMessage(`🛒 [장바구니] 확인됨: ${code}`);

            // Send to Dashboard for V4.0 Sales Log
            sendToDashboard('SYSTEM_PRODUCT_CART_EVENT', {
                code: code,
                snifferId: INSTANCE_ID
            });
        } catch (e) {
            console.error(`Failed to parse SYSTEM_PRODUCT_CART_EVENT [${INSTANCE_ID}]`, e);
        }
        return;
    }

    sendToDashboard('CHAT_MSG', { nickname: nickname || "익명", message: message, ts: Date.now() });
}

connectToDashboard();

// ==========================================
// 2. Playwright Logic
// ==========================================
(async () => {
    console.log("🚀 Starting Grip Sniffer V3.2 (Debug Mode)...");

    // ── 영상 창: 저장된 크기/위치가 있으면 복원, 없으면 기본 창 ──────────────
    // 사용자가 대시보드의 "창크기 저장" 버튼으로 저장해둔 값이 있으면 그대로 적용.
    const savedBounds = loadSavedWindowBounds();
    const launchArgs = [];
    if (savedBounds) {
        launchArgs.push(`--window-position=${savedBounds.left},${savedBounds.top}`);
        launchArgs.push(`--window-size=${savedBounds.width},${savedBounds.height}`);
        console.log(`📐 저장된 영상창 크기 복원: ${savedBounds.width}x${savedBounds.height} @ (${savedBounds.left},${savedBounds.top})`);
    }
    const userDataDir = path.join(__dirname, '.pw-video-profile');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: null,
        args: launchArgs,
    });
    const page = context.pages()[0] || await context.newPage();
    pageRef = page;

    // 초기 실행 시 기본으로 그립 홈으로 이동 (이후 대시보드에서 실제 방송 URL로 UPDATE_URL 전송 시 전환)
    try {
        await page.goto('https://www.grip.show/', { waitUntil: 'domcontentloaded' });
    } catch (e) {
        console.warn('[초기 네비게이션] 실패:', e.message);
    }

    await page.exposeFunction('bridgeChat', (nick, msg) => onDOMChat(nick, msg));
    await page.exposeFunction('bridgeLog', (msg) => console.log(`[DOM] ${msg}`));

    // Monitor Frames
    // 4. Expose Browser Console to Node Terminal (CRITICAL FOR DEBUGGING)
    page.on('console', msg => console.log('🌍 [BROWSER LOG]:', msg.text()));

    console.log("✅ Starting MutationObserver & Interval Checks...");

    // [V5.1] Winner Polling — DOM 팝업(li.winner-item) 감지 비활성화
    // 이유: winners 배열을 프론트엔드에서 사용하지 않고,
    //       채팅 "당첨" 메시지가 팝업 유무와 무관하게 항상 발생하므로 채팅 경로만으로 충분.
    //       이중 경로로 인한 중복 신호 문제를 근본적으로 제거.
    // 롤백 필요 시: 이 주석 블록을 제거하고 아래 주석 처리된 원본 코드를 복구.
    /*
    setInterval(async () => {
        try {
            if (page.isClosed()) return;
            const winnerInfo = await page.evaluate(() => {
                const items = document.querySelectorAll('li.winner-item');
                if (items.length > 0) console.log(`🔍 [Page] Found ${items.length} winner items.`);
                return { count: items.length };
            });
            const winnerCount = winnerInfo.count;
            if (winnerCount === 0 && lastWinnerCount > 0) {
                lastWinnerCount = 0;
            }
            if (winnerCount > 0 && winnerCount !== lastWinnerCount) {
                const winners = await extractWinnersFromPage(page);
                if (winners.length > 0) {
                    lastWinnerCount = winners.length;
                    const topNicks = winners.slice(0, 3).map(w => w.nickname);
                    const fingerprint = topNicks.join('_');
                    const topRank = winners[0];
                    sendBotMessage(`📢 [종료] 1등: ${topRank.nickname} (총 ${winners.length}명)`);
                    sendToDashboard('FCFS_WINNERS', { count: winners.length, winners, fingerprint });
                    const csvContent = "Rank,Nickname\n" + winners.map(w => `${w.rank},${w.nickname}`).join("\n");
                    fs.writeFileSync(path.join(OUTPUT_DIR, 'sales_end_winners.csv'), csvContent);
                    fs.writeFileSync(path.join(OUTPUT_DIR, 'sales_end_winners.json'), JSON.stringify(winners, null, 2));
                }
            }
        } catch (e) {
            if (!e.message.includes('Target page, context or browser has been closed')) {
                console.error("❌ Polling Error:", e.message);
            }
        }
    }, 1000);
    */

    // V4.1 Viewer Polling
    let lastViewerCountStr = "";
    setInterval(async () => {
        try {
            if (page.isClosed()) return;
            const viewerInfo = await page.evaluate(() => {
                let current = 0;
                let cumulative = 0;
                const spans = Array.from(document.querySelectorAll('span, div, p, strong, b'));
                
                for (let el of spans) {
                    const txt = el.textContent ? el.textContent.replace(/,/g, '').trim() : '';
                    if (!txt || txt.length > 50) continue;
                    
                    if (current === 0) {
                        const m1 = txt.match(/(\d+)\s*명\s*시청/);
                        const m2 = txt.match(/(\d+)\s*시청중/);
                        const m3 = txt.match(/시청자\s*(\d+)/);
                        if (m1) current = parseInt(m1[1]);
                        else if (m2) current = parseInt(m2[1]);
                        else if (m3) current = parseInt(m3[1]);
                    }
                    if (cumulative === 0) {
                        const c1 = txt.match(/누적\s*(\d+)/);
                        const c2 = txt.match(/누적시청자\s*(\d+)/);
                        if (c1) cumulative = parseInt(c1[1]);
                        else if (c2) cumulative = parseInt(c2[1]);
                    }
                }
                return { current, cumulative };
            });

            const key = `${viewerInfo.current}:${viewerInfo.cumulative}`;
            if (key !== "0:0" && key !== lastViewerCountStr) {
                lastViewerCountStr = key;
                sendToDashboard('VIEWER_COUNT', viewerInfo);
                // console.log(`👁️ [VIEWER_COUNT] Current: ${viewerInfo.current}, Cumulative: ${viewerInfo.cumulative}`);
            }
        } catch(e) {}
    }, 5000); // 5초마다 시청자 수 업데이트

    // [NEW] FCFS Participation Polling (Real-time - All Frames)
    let lastParticipationStr = "";
    setInterval(async () => {
        try {
            if (page.isClosed()) return;
            
            // Scan ALL frames because Grip often uses nested frames for popups
            const frames = page.frames();
            let participation = null;

            for (const frame of frames) {
                try {
                    const countInfo = await frame.evaluate(() => {
                        let count = null;
                        let target = null;

                        // 1. 현재 참여 인원 찾기
                        const el = document.querySelector('span.info-2');
                        if (el) {
                            const txt = el.innerText;
                            console.log(`[SnifferDebug] Found span.info-2, text: "${txt}"`);
                            const match = txt.match(/(\d+)명 참여 중/);
                            if (match) count = parseInt(match[1]);
                        }

                        // 2. 전체 목표수량 찾기 (프레임 전체 텍스트 스캔)
                        // 화면에 "선착순 5명" 이라고 적혀있는 부분을 전체 텍스트에서 정규식으로 캐치
                        const bodyText = document.body.innerText || "";
                        const limitMatch = bodyText.match(/선착순\s*(\d+)명/);
                        if (limitMatch) {
                            target = parseInt(limitMatch[1]);
                        }

                        if (count !== null) {
                            return { count, target };
                        }
                        return null;
                    });
                    if (countInfo !== null) {
                        participation = countInfo;
                        break; // Found it in this frame
                    }
                } catch (e) { /* Frame might be detached */ }
            }

            if (participation !== null && JSON.stringify(participation) !== lastParticipationStr) {
                lastParticipationStr = JSON.stringify(participation);
                sendToDashboard('FCFS_PARTICIPATION', participation);
                console.log(`📊 [PARTICIPATION] Updated: ${participation.count} / ${participation.target || '?'}`);
            }
        } catch(e) {}
    }, 1000); // 1초마다 참여 인원 업데이트

    // Manual 'd' for dump and 'r' for reset
    const readline = (await import('readline')).createInterface({ input: process.stdin, output: process.stdout });
    readline.on('line', async (line) => {
        const cmd = line.trim();
        if (cmd === 'd') {
            console.log("Manually dumping DOM...");
            const html = await page.content();
            fs.writeFileSync(path.join(OUTPUT_DIR, 'manual_dump.html'), html);
            console.log("Saved manual_dump.html");
        } else if (cmd === 'r') {
            console.log("State Reset! Looking for winners again...");
            lastWinnerCount = 0;
            hasExtractedWinners = false;
        }
    });

    await new Promise(() => { });
})();

// ==========================================
// 3. DOM Observer Logic
// ==========================================
async function injectDOMObserver(page) {
    await page.evaluate(() => {
        if (window.__sniffer_injected) {
            window.bridgeLog("⚠️ Observer already injected. Skipping.");
            return;
        }
        window.__sniffer_injected = true;
        window.bridgeLog("Injecting Observer to BODY...");

        let mutationCount = 0;
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutationCount++;
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        // V3.5 STRICT MODE: Only accept valid Message Items
                        // This prevents processing the same message twice (once as Element, once as TextNode)
                        // and prevents capturing random UI text.

                        if (node.nodeType !== 1) return; // Ignore Text Nodes, Comments
                        if (!node.classList.contains('message-item')) return; // Ignore non-message elements

                        // Now we are sure it is a message row
                        const text = node.innerText || node.textContent || "";
                        if (!text) return;

                        // Parse Nickname & Message safely from the DOM structure
                        let nick = "익명";
                        let msg = text; // Fallback

                        const nickEl = node.querySelector('.nickname');
                        const textEl = node.querySelector('.text');

                        if (nickEl && textEl) {
                            nick = nickEl.innerText.trim();
                            msg = textEl.innerText.trim();
                        } else if (textEl) {
                            // System message often has no nickname wrapper, just text
                            // OR nickname is empty
                            nick = "SYSTEM";
                            msg = textEl.innerText.trim();
                        } else {
                            // Fallback for weird structures
                            // Try to split Nickname vs Message
                            const parts = text.split('\n').map(s => s.trim()).filter(s => s);
                            if (parts.length >= 2) {
                                nick = parts[0];
                                msg = parts.slice(1).join(' ');
                            } else {
                                msg = parts[0];
                            }
                        }

                        // Filter out system messages if they contain keywords
                        if (msg.includes("입장하셨습니다")) return;

                        // CRITICAL: Chat-Based Winner Detection (Backup for Popup Mismatch)
                        if (msg.includes("당첨")) {
                            // Pattern 1: "UserA님 등 5명 선착순 당첨!" / Pattern 2: "선착순 5명 당첨!"
                            const match = msg.match(/(?:선착순\s*)?(\d+)명\s*(?:선착순\s*)?당첨/);
                            if (match) {
                                const count = parseInt(match[1]);
                                // V3.6: Browser-Side Debounce (The Ultimate Fix)
                                const now = Date.now();
                                // Block exact duplicate message within 0.5 seconds
                                if (window.__lastWinnerTime && window.__lastWinnerMsg === msg && (now - window.__lastWinnerTime < 500)) {
                                    window.bridgeLog(`⚠️ Browser ignoring duplicate winner msg: ${msg}`);
                                    return;
                                }
                                window.__lastWinnerTime = now;
                                window.__lastWinnerMsg = msg;

                                window.bridgeLog(`🎉 Chat Detected Winner Announcement: ${count} users`);
                                window.bridgeChat("SYSTEM_WINNER_EVENT", JSON.stringify({ count: count, raw: msg }));
                                return; // Don't show as normal chat
                            }
                        }

                        // V4.0: Extract Product Code from Cart Message
                        if (msg.includes("장바구니에 담겼어요")) {
                            const cartMatch = msg.match(/(.+?)\s*상품이(?: 게임)? 당첨자의 장바구니에 담겼어요/);
                            if (cartMatch) {
                                // Remove leading/trailing quotes if present (e.g. "코드" -> 코드)
                                const code = cartMatch[1].trim().replace(/^["']|["']$/g, '');
                                // 브라우저 내 중복 차단 (DOM 옵저버 중복 렌더링 방어)
                                const now = Date.now();
                                if (window.__lastCartCode === code && window.__lastCartTime && (now - window.__lastCartTime < 10000)) {
                                    window.bridgeLog(`⚠️ Browser ignoring duplicate cart event: ${code}`);
                                    return;
                                }
                                window.__lastCartCode = code;
                                window.__lastCartTime = now;
                                window.bridgeLog(`🛒 Chat Detected Cart Event for Product: ${code}`);
                                window.bridgeChat("SYSTEM_PRODUCT_CART_EVENT", JSON.stringify({ code: code, raw: msg }));
                                return; // Don't show as normal chat
                            }
                        }

                        window.bridgeChat(nick, msg);
                    });
                }
            });
        });

        const target = document.body; // Or specific container if known
        observer.observe(target, { childList: true, subtree: true });

        // Heartbeat
        setInterval(() => {
            window.bridgeLog(`Observer Heartbeat. Mutations so far: ${mutationCount}`);
        }, 5000);
    });
}

async function extractWinnersFromPage(page) {
    return await page.evaluate(() => {
        const items = document.querySelectorAll('li.winner-item');
        const results = [];
        items.forEach(item => {
            const nicknameEl = item.querySelector('.nickname');
            const nickname = nicknameEl ? nicknameEl.innerText.trim() : "Unknown";
            let rank = 0;
            const rankImg = item.querySelector('.rank-icon img');
            const rankText = item.querySelector('.rank-icon .rank-text');
            if (rankImg) {
                const match = rankImg.src.match(/medal_(\d+)/);
                if (match) rank = parseInt(match[1]);
            } else if (rankText) rank = parseInt(rankText.innerText);
            if (rank > 0) results.push({ rank, nickname });
        });
        return results.sort((a, b) => a.rank - b.rank);
    });
}
