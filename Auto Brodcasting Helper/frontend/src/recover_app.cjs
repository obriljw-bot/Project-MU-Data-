const fs = require('fs');
const logPath = 'C:\\Users\\주식회사 원브릿지\\.gemini\\antigravity\\brain\\1b932160-6473-4e48-98c9-d05d419c7fd7\\.system_generated\\logs\\overview.txt';
const targetPath = 'c:\\OneBridge\\apps-script\\data\\Project-MU-Data-\\Auto Brodcasting Helper\\frontend\\src\\App.jsx';

try {
    const data = fs.readFileSync(logPath, 'utf8');
    const lines = data.split('\n');
    const targetLine = lines.find(line => line.includes('"step_index":1713'));
    
    if (targetLine) {
        const json = JSON.parse(targetLine);
        let code = json.tool_calls[0].args.CodeContent;
        
        // Robust multi-stage decoding
        if (typeof code === 'string') {
            // Unquote if it's a JSON string
            if (code.trim().startsWith('"')) {
                try {
                    code = JSON.parse(code);
                } catch(e) {
                    code = code.trim().replace(/^"/, '').replace(/"$/, '');
                }
            }
            
            // Critical: Convert all variants of newline placeholders to real newlines
            // Some logs use literal \n, some use \\n, some use actual newlines.
            code = code.split(/\\n|\n/).join('\n');
            // Clean up escaped quotes
            code = code.split(/\\"/).join('"');
        }
        
        fs.writeFileSync(targetPath, code, 'utf8');
        console.log('✅ App.jsx 부활 성공! (줄 바꿈 강제 교정 완료)');
    } else {
        console.error('❌ 로그에서 Step 1713을 찾을 수 없습니다.');
    }
} catch (err) {
    console.error('❌ 복구 실패:', err);
}
