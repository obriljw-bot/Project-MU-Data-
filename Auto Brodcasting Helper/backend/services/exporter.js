import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

export class ExcelExporter {
    constructor(db) {
        this.db = db;
    }

    async generateReport(targetUrl) {
        console.log(`📊 Generating Excel Report for: ${targetUrl}`);

        // 1. 데이터 조회
        // A. 키워드 트렌드
        const keywords = await this.db.all(
            `SELECT term, frequency, datetime(last_seen/1000, 'unixepoch', 'localtime') as last_seen_time 
             FROM keyword_trends 
             WHERE source_url = ? 
             ORDER BY frequency DESC`,
            [targetUrl]
        );

        // B. 채팅 로그 (chat_logs + chat_analysis JOIN)
        // 현재는 chat_logs에 source_url이 없으므로 시간대나 다른 방식으로 필터링해야 하지만,
        // 일단 전체 로그 중 최근 10000개 혹은 별도 세션 관리가 필요함.
        // *개선*: 채팅 로그에도 source_url을 넣었어야 완벽하지만, 
        // 지금은 "현재 세션" 개념이 모호하므로, 
        // 임시로: 전체 로그를 다 뽑거나, 아니면 키워드가 수집된 시간 범위(min, max timestamp)를 구해 그 사이 로그를 뽑음.

        // 전략: keyword_trends에서 해당 URL의 min/max timestamp를 구해서 그 범위의 chat_logs를 가져온다.
        // 또는 그냥 전체 로그를 뽑고 사용자가 필터링하게 한다. (DB 구조 한계)
        // -> 사용자가 "3시간 진행"했다고 했으므로, 최근 3시간?
        // -> 우선은 최근 5000개 로그를 뽑아준다.

        const logs = await this.db.all(`
            SELECT 
                datetime(l.ts/1000, 'unixepoch', 'localtime') as time,
                l.nickname,
                l.message,
                a.intent
            FROM chat_logs l
            LEFT JOIN chat_analysis a ON l.id = a.chat_id
            ORDER BY l.ts DESC
            LIMIT 5000
        `);

        // 2. 워크북 생성
        const wb = XLSX.utils.book_new();

        // Sheet 1: Summary
        const summaryData = [
            ['Report Generated At', new Date().toLocaleString()],
            ['Target URL', targetUrl],
            ['Total Keywords Collected', keywords.length],
            ['Chat Logs Included', logs.length]
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

        // Sheet 2: Keywords
        const wsKeywords = XLSX.utils.json_to_sheet(keywords);
        XLSX.utils.book_append_sheet(wb, wsKeywords, "Keywords");

        // Sheet 3: Chat Logs
        const wsLogs = XLSX.utils.json_to_sheet(logs);
        XLSX.utils.book_append_sheet(wb, wsLogs, "Chat Logs");

        // 3. 파일 저장
        const reportDir = path.resolve('reports');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir);
        }

        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
        const filename = `Grip_Report_${timestamp}.xlsx`;
        const filePath = path.join(reportDir, filename);

        XLSX.writeFile(wb, filePath);
        console.log(`✅ Report saved: ${filePath}`);

        return { filename, filePath };
    }
}
