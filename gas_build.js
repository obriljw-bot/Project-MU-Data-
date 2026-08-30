import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');
const gasDir = path.join(__dirname, 'gas');

// Ensure gas directory exists
if (!fs.existsSync(gasDir)) {
  fs.mkdirSync(gasDir);
}

// 1. (Skipped) index.html is created at the end to include assets directly

// 2. Find Assets
const assetsDir = path.join(distDir, 'assets');
let jsFile, cssFile;

if (fs.existsSync(assetsDir)) {
  const files = fs.readdirSync(assetsDir);
  jsFile = files.find(f => f.endsWith('.js'));
  cssFile = files.find(f => f.endsWith('.css'));
} else {
  console.error('Error: dist/assets directory not found. Build might have failed.');
  process.exit(1);
}

// 3. Create app-css.html (Tailwind/Styles)
if (cssFile) {
  const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf-8');
  // Wrap in <style> as per standard GAS include pattern for CSS
  fs.writeFileSync(path.join(gasDir, 'app-css.html'), `<style>\n${cssContent}\n</style>`);
  console.log(`Created gas/app-css.html from ${cssFile}`);
} else {
  fs.writeFileSync(path.join(gasDir, 'app-css.html'), '');
  console.log('Created empty gas/app-css.html');
}

// 4. Create app-bundle.html (JS Logic)
if (jsFile) {
  const jsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf-8');
  // Wrap in <script> as per standard GAS include pattern for JS
  // This prevents "Malformed HTML" errors when GAS parses raw JS with '<' characters
  fs.writeFileSync(path.join(gasDir, 'app-bundle.html'), `<script>\n${jsContent}\n</script>`);
  console.log(`Created gas/app-bundle.html from ${jsFile}`);
} else {
  console.error('Error: No JS bundle found in dist/assets');
  process.exit(1);
}

// 5. Create index.html (Master Orchestrator)
// We include everything directly here to avoid nested include issues while keeping files split
const indexHtmlContent = `<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sales Dashboard</title>
    
    <!-- External CDNs -->
    <script crossorigin src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js"></script>
    <script crossorigin src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
    <script crossorigin src="https://cdn.jsdelivr.net/npm/prop-types@15.8.1/prop-types.min.js"></script>
    <script crossorigin src="https://cdn.jsdelivr.net/npm/recharts@2.12.7/umd/Recharts.min.js"></script>
    <script crossorigin src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.47.10/dist/umd/supabase.min.js"></script>
    <script crossorigin src="https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.min.js"></script>
    <script crossorigin src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>

    <!-- Styles -->
    <?!= include('app-css'); ?>
  </head>
  <body>
    <div id="root"></div>
    
    <!-- Vite Bundle -->
    <?!= include('app-bundle'); ?>
  </body>
</html>`;
fs.writeFileSync(path.join(gasDir, 'index.html'), indexHtmlContent);
console.log('Created gas/index.html (with direct includes)');

// Clean up app.html if it exists (no longer needed)
if (fs.existsSync(path.join(gasDir, 'app.html'))) fs.unlinkSync(path.join(gasDir, 'app.html'));

// 6. Update Code.js
const codeJsContent = `
function doGet() {
  return HtmlService.createTemplateFromFile("index")
    .evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setTitle("Sales Dashboard")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
`;
fs.writeFileSync(path.join(gasDir, 'Code.js'), codeJsContent);
console.log('Updated gas/Code.js');
