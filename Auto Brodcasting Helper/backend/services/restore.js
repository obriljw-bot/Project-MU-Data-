import fs from 'fs';
import path from 'path';
import { initDB } from '../db.js';
import { ExcelExporter } from './exporter.js';
import { config } from '../config.js';

async function restore() {
    console.log("♻️ Starting Data Restoration from Log File...");

    // 1. DB 연결
    const db = await initDB();
    const exporter = new ExcelExporter(db);

    // 2. 파일 읽기
    const logPath = path.resolve('CHATING LIST.txt');
    if (!fs.existsSync(logPath)) {
        console.error("❌ Log file not found:", logPath);
        return;
    }

    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n');
    console.log(`📄 Found ${lines.length} lines. Processing...`);

    let successCount = 0;

    // 타임스탬프 시뮬레이션 (3시간 전부터 시작)
    let simulatedTs = Date.now() - (3 * 60 * 60 * 1000);

    for (const line of lines) {
        // Format: [CHAT] nickname: message => [INTENT] keywords
        const paramRegex = /^\[CHAT\] (.*?): (.*?) => \[(.*?)\] (.*)$/;
        const match = line.trim().match(paramRegex);

        if (match) {
            const nickname = match[1];
            const message = match[2];
            const intent = match[3];
            const keywordStr = match[4];

            // 키워드 파싱 (공백이나 콤마로 구분되어 있을 수 있음)
            // 로그 예시: "애플크림, 한번만, 더요" or "톤업"
            const keywords = keywordStr ? keywordStr.split(',').map(k => k.trim()).filter(k => k) : [];

            try {
                // A. chat_logs 저장
                const result = await db.run(
                    `INSERT INTO chat_logs (ts, nickname, message) VALUES (?, ?, ?)`,
                    [simulatedTs, nickname, message]
                );
                const chatId = result.lastID;

                // B. chat_analysis 저장
                await db.run(
                    `INSERT INTO chat_analysis (chat_id, intent, details) VALUES (?, ?, ?)`,
                    [chatId, intent, JSON.stringify({ intent, keywords })]
                );

                // C. keyword_trends 업데이트 (복구 모드)
                // config.targetUrl을 사용하거나, 로그 파일 분석 시점의 URL을 알 수 없으므로
                // 현재 설정된 URL 또는 'restored_log'로 저장. 
                // 사용자가 "3시간 짜리 방송" 이라고 했으니 현재 context인 config.targetUrl에 몰아넣는 게 리포트 뽑기 좋음.
                const restoreUrl = config.targetUrl || 'restored_session';

                for (const keyword of keywords) {
                    await db.run(`
                        INSERT INTO keyword_trends (term, source_url, frequency, last_seen) 
                        VALUES (?, ?, 1, ?)
                        ON CONFLICT(term, source_url) DO UPDATE SET 
                        frequency = frequency + 1,
                        last_seen = excluded.last_seen
                    `, [keyword, restoreUrl, simulatedTs]);
                }

                successCount++;
                simulatedTs += 100; // 0.1초씩 증가

            } catch (err) {
                console.error("Insert Error:", err.message);
            }
        }
    }

    console.log(`✅ Restoration Complete. ${successCount} messages restored.`);

    // 3. 리포트 자동 생성
    console.log("📊 Generating Report...");
    try {
        const restoreUrl = config.targetUrl || 'restored_session';
        const report = await exporter.generateReport(restoreUrl);
        console.log(`✨ DONE! Report saved at: ${report.filePath}`);
    } catch (e) {
        console.error("Report Generation Failed:", e);
    }
}

restore().catch(console.error);
