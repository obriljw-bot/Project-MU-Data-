import { chromium } from 'playwright';
import { EventEmitter } from 'events';
import { config } from '../config.js';

export class GripBot extends EventEmitter {
    constructor() {
        super();
        this.browser = null;
        this.context = null;
        this.page = null;
        this.isRunning = false;
    }

    async launch() {
        // 1. Ensure Browser Logic
        if (!this.browser) {
            console.log("🚀 Launching GripBot Browser...");
            this.browser = await chromium.launch({ headless: false });

            this.browser.on('disconnected', () => {
                console.log("⚠️ Browser disconnected.");
                this.browser = null;
                this.context = null;
                this.page = null;
            });

            this.context = await this.browser.newContext();
        }

        // 2. Ensure Page Logic (Create if missing or closed)
        if (!this.page || this.page.isClosed()) {
            console.log("📄 Creating new page...");
            this.page = await this.context.newPage();

            // Handle manual close
            this.page.on('close', () => {
                console.log("⚠️ Page closed by user.");
                this.page = null;
            });
        }

        this.isRunning = true;
        console.log("✔ Browser Ready set.");
    }

    async changeUrl(url) {
        // Lazy Launch: URL 변경 요청 시 브라우저가 없으면 띄운다.
        if (!this.browser || !this.page || this.page.isClosed()) {
            console.log("♻️ Browser not ready. Launching now...");
            await this.launch();
        }

        console.log(`🔗 Navigating to ${url}...`);
        try {
            await this.page.goto(url, { waitUntil: 'domcontentloaded' });
            console.log("✔ Navigation complete. Injecting hooks...");

            // 페이지 이동 시 컨텍스트가 초기화되므로 훅 재주입 필요
            await this.injectHooks();

        } catch (e) {
            console.error("Navigation failed:", e);
            // Retry once if failed due to connectivity or closure
            if (e.message.includes('closed')) {
                this.page = null; // Force reset
                // 한 번만 재시도
                await this.changeUrl(url); // Recursive retry once
            }
        }
    }

    async injectHooks() {
        // 이미 expose된 함수가 있다면 재등록 방지
        try {
            await this.page.exposeFunction('onNewChatMessage', (nickname, text) => {
                this.emit('chat', {
                    ts: Date.now(),
                    nickname,
                    message: text
                });
            });
            await this.page.exposeFunction('onSystemNotification', (type, message) => {
                this.emit('system', {
                    ts: Date.now(),
                    type,
                    message
                });
            });
            // Debug Logger
            await this.page.exposeFunction('botDebug', (msg) => {
                console.log(`[BotDebug] ${msg}`);
            });
        } catch (e) {
            // Already exposed - ignore
        }

        const frames = this.page.frames();
        console.log(`🧲 Injecting Hooks into ${frames.length} frames...`);

        for (const frame of frames) {
            try {
                if (frame.url() === 'about:blank') continue;

                await frame.evaluate(() => {
                    if (window._botHooksInjected) return;
                    window._botHooksInjected = true;

                    console.log("🔔 [GripBot] Hooks Injected into Frame:", document.location.href);
                    window.botDebug(`Hooks Injected: ${document.location.href}`);

                    const seen = new Set();
                    const MAX_SEEN = 500;

                    // Warmup Logic
                    let isWarmingUp = true;
                    setTimeout(() => {
                        isWarmingUp = false;
                        window.botDebug("Warmup complete. Listening...");
                    }, 3000);

                    function extractAndSend(node) {
                        try {
                            if (!node || !node.innerText) return;
                            const fullText = node.innerText.trim();

                            // 1. System Purchase (Priority Check)
                            // Look for "구매가 완료" or system notice classes
                            if (fullText.includes('구매가 완료') || node.classList.contains('content-live-notice')) {
                                const sig = `SYS:${fullText}`;
                                if (seen.has(sig)) return;
                                seen.add(sig);

                                if (isWarmingUp) return;
                                window.onSystemNotification('PURCHASE', fullText);
                                return;
                            }

                            // 2. Chat Message
                            // Try multiple selectors for Nickname & Message
                            let nickname = '';
                            let text = '';

                            // Strategy A: .nickname-wrapper inside .message-item
                            const nickEl = node.querySelector('.nickname-wrapper, .user-name, .nickname');
                            const textEl = node.querySelector('.text, .message-content');

                            if (nickEl) nickname = nickEl.innerText.trim();
                            if (textEl) text = textEl.innerText.trim();

                            // Strategy B: Fallback text parsing if simple structure
                            if (!nickname && !text && fullText.includes(':')) {
                                const parts = fullText.split(':');
                                if (parts.length >= 2) {
                                    nickname = parts[0].trim();
                                    text = parts.slice(1).join(':').trim();
                                }
                            }

                            // Strategy C: Check for known System Messages disguised as chat
                            if (node.classList.contains('onboarding') || node.classList.contains('system')) {
                                // [USER REQUEST] Filter out 'onboarding' messages (e.g. Game instructions "저요")
                                return;
                            }

                            // [USER REQUEST] Handle 'content-notification' (Cart/Purchase)
                            if (node.classList.contains('content-notification')) {
                                const notiText = node.innerText.trim();
                                let type = 'INFO';

                                if (notiText.includes('장바구니')) type = 'CART';
                                else if (notiText.includes('구매')) type = 'PURCHASE';

                                const sig = `NOTI:${type}:${notiText}`;
                                if (seen.has(sig)) return;
                                seen.add(sig);

                                if (isWarmingUp) return;
                                window.onSystemNotification(type, notiText);
                                return;
                            }

                            if (nickname && text) {
                                const sig = `${nickname}:${text}`;
                                if (seen.has(sig)) return;
                                seen.add(sig);

                                if (seen.size > MAX_SEEN) {
                                    const first = seen.keys().next().value;
                                    seen.delete(first);
                                }

                                if (isWarmingUp) return;
                                window.onNewChatMessage(nickname, text);
                            }
                        } catch (err) {
                            // Safe fail
                        }
                    }

                    // Initial Scan
                    function markExisting() {
                        const existing = document.querySelectorAll('.message-item, .content-live-notice');
                        existing.forEach(extractAndSend);
                    }
                    markExisting();

                    // Targeted Observer
                    // We watch 'document.body' but filter strictly for .message-list or .content-live-notice containers
                    const observer = new MutationObserver((mutations) => {
                        for (const mutation of mutations) {
                            if (mutation.type === 'childList') {
                                mutation.addedNodes.forEach(node => {
                                    if (node.nodeType === 1) { // Element
                                        // Case 1: Direct Message Item added
                                        if (node.matches('.message-item')) {
                                            extractAndSend(node);
                                        }
                                        // Case 2: System Notice added
                                        else if (node.matches('.content-live-notice') || node.matches('.content-notification')) {
                                            extractAndSend(node);
                                        }
                                        // Case 3: Container added (e.g. initial load), scan children
                                        else if (node.querySelector) {
                                            const children = node.querySelectorAll('.message-item, .content-live-notice, .content-notification');

                                            children.forEach(extractAndSend);
                                        }
                                    }
                                });
                            }
                        }
                    });

                    // Observe body to catch all
                    observer.observe(document.body, { childList: true, subtree: true });
                });
            } catch (e) {
                console.log(`Failed to inject into frame ${frame.url()}: ${e.message}`);
            }
        }
    }

    async sendMessage(text) {
        if (!this.page) {
            console.error("❌ Send Failed: Browser not active");
            throw new Error("Browser not active");
        }

        try {
            // Try multiple potential selectors
            const selectors = [
                'input[placeholder*="채팅"]',
                'textarea[placeholder*="채팅"]',
                'input[placeholder*="메시지"]',
                'textarea[placeholder*="메시지"]',
                'input[type="text"]',
                'textarea'
            ];

            let foundSelector = null;
            for (const sel of selectors) {
                try {
                    // Try to find with a short timeout to check existence
                    const el = await this.page.$(sel);
                    if (el && await el.isVisible()) {
                        foundSelector = sel;
                        console.log(`✅ Found chat input using selector: "${sel}"`);
                        break;
                    }
                } catch (e) { continue; }
            }

            if (!foundSelector) {
                throw new Error("Could not find any valid chat input field.");
            }

            await this.page.click(foundSelector);
            await this.page.fill(foundSelector, text);
            await this.page.keyboard.press('Enter');

            console.log(`📤 Sent message: "${text}"`);
            return true;
        } catch (e) {
            console.error(`❌ Failed to send message: ${e.message}`);

            // DEBUG: Dump potential inputs to help find the right selector
            if (this.page) {
                try {
                    const inputs = await this.page.evaluate(() => {
                        const els = [...document.querySelectorAll('input, textarea, [contenteditable="true"]')];
                        return els.map(e => ({
                            tagName: e.tagName,
                            placeholder: e.placeholder || '',
                            className: e.className,
                            id: e.id,
                            type: e.type || '',
                            visible: (e.offsetWidth > 0 && e.offsetHeight > 0)
                        }));
                    });
                    console.log("🔍 [DEBUG] Page Inputs Dump:", JSON.stringify(inputs, null, 2));
                } catch (debugErr) {
                    console.error("Failed to dump debug info:", debugErr);
                }
            }

            throw e; // Let the caller handle the error
        }
    }

    async stop() {
        if (this.browser) {
            await this.browser.close();
        }
        this.isRunning = false;
    }
}
