// 資產雜湊：為 index.html 引用的 CSS／JS 加上內容雜湊查詢參數（?v=），
// 並以 import map 讓所有 ES module 的相對 import 也取得雜湊網址，避免瀏覽器使用舊快取。
// 同時產生 Service Worker 預快取清單 sw-assets.js（使用相同的雜湊網址）。
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtimeRoots = ['src', 'styles', 'assets'];
const rootRuntimeFiles = ['manifest.webmanifest', 'favicon.ico'];
const runtimeExtensions = new Set(['.html', '.css', '.js', '.json', '.svg', '.png', '.ico', '.webmanifest', '.mp3', '.ogg', '.wav']);
const hashedExtensions = new Set(['.css', '.js']);
const START = '<!-- assets:start -->';
const END = '<!-- assets:end -->';

const shortHash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 10);
const toUrl = (file) => `/${relative(root, file).split(sep).join('/')}`;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile() && runtimeExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = [];
for (const directory of runtimeRoots) files.push(...await walk(join(root, directory)));
for (const file of rootRuntimeFiles) files.push(join(root, file));

// 1. 計算每個 CSS／JS 的內容雜湊
const assets = new Map();
for (const file of files.sort()) {
  const data = await readFile(file);
  const url = toUrl(file);
  assets.set(url, hashedExtensions.has(extname(file)) ? `${url}?v=${shortHash(data)}` : url);
}

// 2. 改寫 index.html 標記區塊：樣式表、import map、進入點
const indexPath = join(root, 'index.html');
const html = await readFile(indexPath, 'utf8');
const start = html.indexOf(START);
const end = html.indexOf(END);
if (start < 0 || end < start) throw new Error(`index.html 缺少 ${START} … ${END} 標記區塊`);

const styles = [...assets.keys()].filter((url) => url.startsWith('/styles/') && url.endsWith('.css'));
const modules = [...assets.keys()].filter((url) => url.startsWith('/src/') && url.endsWith('.js'));
if (!assets.has('/src/main.js')) throw new Error('找不到進入點 src/main.js');
const importMap = { imports: Object.fromEntries(modules.map((url) => [url, assets.get(url)])) };
const block = [
  START,
  ...styles.map((url) => `  <link rel="stylesheet" href="${assets.get(url)}">`),
  `  <script type="importmap">${JSON.stringify(importMap)}</script>`,
  `  <script type="module" src="${assets.get('/src/main.js')}"></script>`,
  `  ${END}`,
].join('\n');
const nextHtml = html.slice(0, start) + block + html.slice(end + END.length);
await writeFile(indexPath, nextHtml);

// 3. Service Worker 預快取清單（index.html 以改寫後內容計入版本）
const swAssets = [...assets.values(), '/index.html'].sort();
const version = createHash('sha256');
for (const url of swAssets) {
  version.update(url);
  if (url === '/index.html') version.update(nextHtml);
}
for (const file of files) version.update(await readFile(file));
const swVersion = version.digest('hex').slice(0, 16);
await writeFile(join(root, 'sw-assets.js'),
  `// 由 tools/build-assets.mjs 產生，請勿手改。\nself.SW_ASSETS = ${JSON.stringify(swAssets, null, 2)};\nself.SW_VERSION = ${JSON.stringify(swVersion)};\n`);

console.log(`已雜湊 ${styles.length + modules.length} 個 CSS／JS，SW 預快取 ${swAssets.length} 項（${swVersion}）。`);
