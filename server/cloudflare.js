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

        // Named Tunnel 방식: grip.makemerobot.cloud → localhost:5173 (고정 URL, 삼성브라우저 차단 없음)
        const TUNNEL_NAME = 'onebridge-erp';
        const FIXED_URL = 'https://grip.makemerobot.cloud';
        console.log(`[Cloudflare] Starting named tunnel '${TUNNEL_NAME}'...`);
        tunnelProcess = spawn(BINARY_PATH, ['tunnel', 'run', TUNNEL_NAME]);

        tunnelProcess.stderr.on('data', (data) => {
            const output = data.toString();
            if (!isResolved && output.includes('Registered tunnel connection')) {
                isResolved = true;
                clearTimeout(fallbackTimer);
                console.log(`[Cloudflare] ✨ Tunnel established: ${FIXED_URL}`);
                resolve(FIXED_URL);
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
