const { startCloudflareTunnel } = require('./cloudflare');

(async () => {
    console.log("Starting cloudflare test...");
    try {
        const url = await startCloudflareTunnel(5173);
        console.log("SUCCESS URL:", url);
        process.exit(0);
    } catch(err) {
        console.error("FAIL:", err);
        process.exit(1);
    }
})();
