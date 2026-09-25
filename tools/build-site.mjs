// 僅壓縮部署副本，保留可直接執行與閱讀的原始碼。
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { transform } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = join(root, 'dist');
const entries = [
  'src', 'styles', 'assets', 'index.html', 'sw.js',
  'manifest.webmanifest', 'favicon.ico', 'CNAME', '.nojekyll',
  'robots.txt', 'sitemap.xml', 'LICENSE',
];

// dist 為此工具專用的生成目錄，每次重建避免保留已移除的資源。
await rm(destination, { recursive: true, force: true });
await mkdir(destination);
for (const entry of entries) await cp(join(root, entry), join(destination, entry), { recursive: true });

let count = 0;
let originalBytes = 0;
let minifiedBytes = 0;
async function minifyFile(path) {
  const loader = extname(path).slice(1);
  const source = await readFile(path, 'utf8');
  const { code, warnings } = await transform(source, {
    loader,
    minify: true,
    // 模組保留 ESM 邊界；傳統 Service Worker 腳本不可改成模組。
    ...(loader === 'js' && path.startsWith(join(destination, 'src') + '/') ? { format: 'esm' } : {}),
    legalComments: 'inline',
    sourcefile: path,
  });
  for (const warning of warnings) console.warn(warning.text);
  await writeFile(path, code);
  count++;
  originalBytes += Buffer.byteLength(source);
  minifiedBytes += Buffer.byteLength(code);
}

async function minifyDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await minifyDirectory(path);
    else if (['.js', '.css'].includes(extname(path))) await minifyFile(path);
  }
}

await minifyDirectory(destination);
// 雜湊及 SW 版本必須取自壓縮後的實際內容。
execFileSync(process.execPath, [join(root, 'tools/build-assets.mjs'), destination], { stdio: 'inherit' });
await minifyFile(join(destination, 'sw-assets.js'));
console.log(`已壓縮 ${count} 個 JS／CSS：${originalBytes} → ${minifiedBytes} bytes，輸出至 dist/。`);
