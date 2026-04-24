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
        
        // Remove the starting/ending double quotes if they were stringified as raw JSON value
        if (code.startsWith('"') && code.endsWith('"')) {
            code = JSON.parse(code); // Unescape the string content
        }
        
        fs.writeFileSync(targetPath, code);
        console.log('✅ App.jsx successfully recovered from Log (Step 1713)!');
    } else {
        console.error('❌ Could not find Step 1713 in logs.');
    }
} catch (err) {
    console.error('❌ Recovery failed:', err);
}
