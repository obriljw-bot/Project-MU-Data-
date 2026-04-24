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

            // [NEW] Automatic Chat Sender Logic
            if (msg.type === 'SEND_CHAT' && msg.message) {
                console.log(`💬 [AUTO-MSG] Sending to Grip: ${msg.message}`);
                if (pageRef) {
                    try {
                        const selector = 'textarea.input-box';
                        // Wait for input to be available
                        await pageRef.waitForSelector(selector, { timeout: 5000 });
                        await pageRef.fill(selector, msg.message);
                        await pageRef.press(selector, 'Enter');
                        
                        sendToDashboard('CHAT_SEND_RESULT', { success: true, requestId: msg.requestId });
                    } catch (e) {
                        console.error("❌ Failed to send chat to Grip:", e.message);
                        sendToDashboard('CHAT_SEND_RESULT', { success: false, error: e.message, requestId: msg.requestId });
                    }
                }
            }
        } catch (e) { console.error(e); }
    });

    ws.on('close', () => { setTimeout(connectToDashboard, 3000); });
    ws.on('error', () => { });
}

function sendToDashboard(type, data) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, data }));
}
function sendBotMessage(text) { sendToDashboard('SNIFFER_LOG', { message: `[${INSTANCE_ID}] ${text}` }); }
function sendToast(message, type = 'success') { sendToDashboard('SNIFFER_TOAST', { message, type }); }
const WINNER_EVENT_DEBOUNCE_MS = 500; // 0.5초 (동일 이벤트의 브라우저 렌더링 중복만 방지)
let lastWinnerEventTime = 0;
let lastWinnerMessageRaw = "";

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

            // Trigger Dashboard Modal (or Log in V4.0)
            sendToDashboard('FCFS_WINNERS', {
                count: count,
                winners: [], // Empty list as we only have count from chat
                snifferId: INSTANCE_ID // Track source
            });
        } catch (e) {
            console.error(`Failed to parse SYSTEM_WINNER_EVENT [${INSTANCE_ID}]`, e);
        }
        return; // Do not broadcast as chat
    } else if (nickname === "SYSTEM_PRODUCT_CART_EVENT") {
        try {
            const payload = JSON.parse(message);
            const code = payload.code;
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

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    pageRef = page;

    await page.exposeFunction('bridgeChat', (nick, msg) => onDOMChat(nick, msg));
    await page.exposeFunction('bridgeLog', (msg) => console.log(`[DOM] ${msg}`));

    // Monitor Frames
    // 4. Expose Browser Console to Node Terminal (CRITICAL FOR DEBUGGING)
    page.on('console', msg => console.log('🌍 [BROWSER LOG]:', msg.text()));

    console.log("✅ Starting MutationObserver & Interval Checks...");

    // Winner Polling
    // let lastWinnerCount = 0; // REMOVED (Use Global)
    setInterval(async () => {
        // if (hasExtractedWinners) return; // Allow re-check for debugging force updates?
        try {
            if (page.isClosed()) return; // Prevent spam if browser was closed

            // Enhanced Evaluation for Debugging
            const winnerInfo = await page.evaluate(() => {
                const items = document.querySelectorAll('li.winner-item');
                if (items.length > 0) console.log(`🔍 [Page] Found ${items.length} winner items.`);

                // Return simple count to Node context
                return { count: items.length };
            });

            const winnerCount = winnerInfo.count;

            // Trigger if Found AND New (or if we reset via code)
            if (winnerCount > 0 && winnerCount !== lastWinnerCount) {
                console.log(`🎉 New Winners Count: ${winnerCount} (Prev: ${lastWinnerCount})`);

                // FORCE RE-EXTRACT
                const winners = await extractWinnersFromPage(page);

                if (winners.length > 0) {
                    lastWinnerCount = winners.length; // Update State
                    // hasExtractedWinners = true; // Optional: Lock it if single-fire

                    const topRank = winners[0];
                    sendBotMessage(`📢 [종료] 1등: ${topRank.nickname} (총 ${winners.length}명)`);

                    // V3.4: Send Structured Event for Modal
                    sendToDashboard('FCFS_WINNERS', {
                        count: winners.length,
                        winners: winners
                    });

                    const csvContent = "Rank,Nickname\n" + winners.map(w => `${w.rank},${w.nickname}`).join("\n");
                    fs.writeFileSync(path.join(OUTPUT_DIR, 'sales_end_winners.csv'), csvContent);
                    fs.writeFileSync(path.join(OUTPUT_DIR, 'sales_end_winners.json'), JSON.stringify(winners, null, 2));
                    console.log("✅ Winner Data Emitted & Saved.");
                }
            } else if (winnerCount > 0) {
                // Log ping for existing winners (Debug only)
                // console.log(`Duplicate Winner Check (${winnerCount}). Ignoring...`);
            }

        } catch (e) {
            // Prevent spamming if the user manually closed the browser/page
            if (!e.message.includes('Target page, context or browser has been closed')) {
                console.error("❌ Polling Error:", e.message);
            }
        }
    }, 1000);

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
                    const count = await frame.evaluate(() => {
                        const el = document.querySelector('span.info-2');
                        if (el) {
                            const txt = el.innerText;
                            console.log(`[SnifferDebug] Found span.info-2, text: "${txt}"`);
                            if (txt.includes('참여')) {
                                const match = txt.match(/(\d+)명 참여 중/);
                                const limitMatch = txt.match(/선착순\s*(\d+)명/);
                                if (match) {
                                    return {
                                        count: parseInt(match[1]),
                                        target: limitMatch ? parseInt(limitMatch[1]) : null
                                    };
                                }
                                else console.log(`[SnifferDebug] Pattern mismatch in text: "${txt}"`);
                            }
                        }
                        return null;
                    });
                    if (count !== null) {
                        participation = count;
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
