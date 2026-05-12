const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const BINARY_NAME = 'cloudflared-windows-amd64.exe';
const BINARY_PATH = path.join(__dirname, BINARY_NAME);
const DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

let tunnelProcess = null;

function downloadCloudflared() {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(BINARY_PATH)) {
            console.log(`[Cloudflare] Binary already exists at ${BINARY_PATH}`);
            return resolve(BINARY_PATH);
        }

        console.log(`[Cloudflare] Downloading binary from ${DOWNLOAD_URL} ...`);
        try {
            const { execSync } = require('child_process');
            execSync(`powershell -Command "Invoke-WebRequest -Uri '${DOWNLOAD_URL}' -OutFile '${BINARY_PATH}'"`, { stdio: 'inherit' });
            console.log(`[Cloudflare] Download complete.`);
            resolve(BINARY_PATH);
        } catch (err) {
            console.error("[Cloudflare] Download failed", err);
            reject(err);
        }
    });
}

async function startCloudflareTunnel(port) {
    if (tunnelProcess) {
        throw new Error("Tunnel is already running!");
    }

    try {
        await downloadCloudflared();
    } catch (err) {
        console.error("[Cloudflare] Download failed", err);
        throw err;
    }

    return new Promise((resolve, reject) => {
        let isResolved = false;
        
        // 1. Force kill existing zombies to prevent "delay" / "port in use" bugs
        try {
            console.log(`[Cloudflare] Cleanup: Killing any existing ${BINARY_NAME}...`);
            require('child_process').execSync(`taskkill /f /im ${BINARY_NAME}`, { stdio: 'ignore' });
        } catch (e) {}

        // 2. Timeout fallback so ws_server doesn't hang infinitely
        const fallbackTimer = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                console.error("[Cloudflare] ⚠️ Timeout! Failed to generate Tunnel URL within 30 seconds. Fallback to Local Network only.");
                resolve(null);
            }
        }, 30000);

        console.log(`[Cloudflare] Starting tunnel on port ${port}...`);
        // --config nul : 기존 config.yml(ERP 터널 설정 등) 무시하고 순수 quick tunnel로 실행
        tunnelProcess = spawn(BINARY_PATH, ['tunnel', '--config', 'nul', '--url', `http://127.0.0.1:${port}`]);

        // Cloudflared typically outputs logs and the URL to stderr, not stdout.
        tunnelProcess.stderr.on('data', (data) => {
            const output = data.toString();
            
            // Debug the raw output optionally if URL gets missed
            // console.log("[Cloudflared Log]", output.trim());
            
            // Regex to extract Cloudflare generated URL (e.g. https://funny-apple-cake.trycloudflare.com)
            const match = output.match(/(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/);
            if (match && !isResolved) {
                isResolved = true;
                clearTimeout(fallbackTimer);
                const tunnelUrl = match[1];
                console.log(`[Cloudflare] ✨ Tunnel established: ${tunnelUrl}`);
                resolve(tunnelUrl);
            }
        });

        tunnelProcess.on('error', (err) => {
            console.error('[Cloudflare] Process Error:', err);
            if (!isResolved) {
                isResolved = true;
                clearTimeout(fallbackTimer);
                reject(err);
            }
        });

        tunnelProcess.on('close', (code) => {
            console.log(`[Cloudflare] Process exited with code ${code}`);
            tunnelProcess = null;
        });
    });
}

function stopCloudflareTunnel() {
    if (tunnelProcess) {
        console.log("[Cloudflare] Stopping tunnel process...");
        tunnelProcess.kill('SIGINT');
        tunnelProcess = null;
    }
}

module.exports = {
    startCloudflareTunnel,
    stopCloudflareTunnel
};
