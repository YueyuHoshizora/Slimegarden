import { getLang, t } from '../i18n/index.js';

const EXPORTERS = new Map();
const CARD = { width: 1200, padding: 56, columns: 3, cellWidth: 362, imageSize: 150, rowHeight: 246 };

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function wrapText(context, text, maxWidth, lineHeight, maxLines = 3) {
  // 依目前語系斷詞：英文以單字換行，中日文以詞／字換行；單一詞過長時再拆成字元
  const segmenter = new Intl.Segmenter(getLang(), { granularity: 'word' });
  const characters = Array.from(segmenter.segment(String(text ?? '').trim()), ({ segment }) => segment)
    .flatMap((segment) => (context.measureText(segment).width > maxWidth ? Array.from(segment) : [segment]));
  const lines = [];
  let line = '';
  let truncated = false;
  for (const character of characters) {
    const candidate = line + character;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line.trimEnd());
      line = character.trimStart();
      if (lines.length === maxLines) {
        truncated = true;
        break;
      }
    } else line = candidate;
  }
  if (line && lines.length < maxLines) lines.push(line.trimEnd());
  if (truncated && lines.length) {
    const last = lines.length - 1;
    while (lines[last] && context.measureText(`${lines[last]}…`).width > maxWidth) {
      lines[last] = Array.from(lines[last]).slice(0, -1).join('');
    }
    lines[last] += '…';
  }
  return { lines, lineHeight };
}

function drawText(context, text, x, y, width, lineHeight, maxLines, color, font) {
  context.fillStyle = color;
  context.font = font;
  const { lines } = wrapText(context, text, width, lineHeight, maxLines);
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
}

function imageFromSvg(svg) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('圖鑑插畫無法載入')); };
    image.src = url;
  });
}

/** 匯出高解析度圖鑑卡；SVG 先以向量載入，再繪製至雙倍尺寸畫布。 */
export async function exportCardPng({ title = t('codex'), entries = [], footer = '' } = {}) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('PNG 匯出需要瀏覽器畫布');
  const safeEntries = Array.isArray(entries) ? entries : [];
  const rows = Math.max(1, Math.ceil(safeEntries.length / CARD.columns));
  const height = CARD.padding * 2 + 100 + rows * CARD.rowHeight + 64;
  const ratio = 2;
  const canvas = document.createElement('canvas');
  // 標註語系，讓中日文共用漢字選到正確字形
  canvas.lang = getLang();
  canvas.width = CARD.width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext('2d');
  if (context && 'lang' in context) context.lang = getLang();
  if (!context) throw new Error('無法建立圖鑑畫布');
  context.scale(ratio, ratio);
  context.fillStyle = '#fffaf1';
  context.fillRect(0, 0, CARD.width, height);
  const background = context.createLinearGradient(0, 0, CARD.width, height);
  background.addColorStop(0, '#fff8ec');
  background.addColorStop(1, '#f1fbf3');
  context.fillStyle = background;
  context.fillRect(0, 0, CARD.width, height);
  context.fillStyle = '#fff';
  context.globalAlpha = 0.58;
  for (const [x, y, radius] of [[80, 72, 22], [1110, 115, 32], [1090, height - 70, 42]]) {
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  }
  context.globalAlpha = 1;
  context.textAlign = 'center';
  context.fillStyle = '#526a5b';
  context.font = '700 38px system-ui, sans-serif';
  context.fillText(String(title), CARD.width / 2, 76);
  context.fillStyle = '#a1b5a5';
  context.beginPath(); context.roundRect(CARD.width / 2 - 42, 94, 84, 4, 2); context.fill();

  const images = await Promise.all(safeEntries.map((entry) => imageFromSvg(entry.svg)));
  for (let index = 0; index < safeEntries.length; index += 1) {
    const col = index % CARD.columns;
    const row = Math.floor(index / CARD.columns);
    const x = CARD.padding + col * (CARD.cellWidth + 8);
    const y = 120 + row * CARD.rowHeight;
    roundedRect(context, x, y, CARD.cellWidth, CARD.rowHeight - 12, 22);
    context.fillStyle = 'rgba(255,255,255,.82)';
    context.shadowColor = 'rgba(99,126,104,.12)';
    context.shadowBlur = 14;
    context.fill();
    context.shadowBlur = 0;
    context.drawImage(images[index], x + (CARD.cellWidth - CARD.imageSize) / 2, y + 12, CARD.imageSize, CARD.imageSize);
    context.textAlign = 'center';
    drawText(context, safeEntries[index]?.name, x + 18, y + 181, CARD.cellWidth - 36, 25, 1, '#536c5d', '700 19px system-ui, sans-serif');
    context.textAlign = 'left';
    drawText(context, safeEntries[index]?.note, x + 25, y + 211, CARD.cellWidth - 50, 17, 2, '#809183', '14px system-ui, sans-serif');
  }
  context.textAlign = 'center';
  context.fillStyle = '#93a596';
  context.font = '14px system-ui, sans-serif';
  context.fillText(String(footer), CARD.width / 2, height - 28);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('圖鑑 PNG 產生失敗')), 'image/png'));
}

/** 註冊其他匯出格式，回傳解除註冊函式以方便模組生命週期管理。 */
export function registerExporter(id, fn) {
  if (!id || typeof fn !== 'function') throw new TypeError('匯出格式需要名稱與函式');
  if (EXPORTERS.has(id)) throw new Error(`匯出格式已註冊：${id}`);
  EXPORTERS.set(id, fn);
  return () => EXPORTERS.delete(id);
}

/** 依格式名稱呼叫已註冊的匯出器。 */
export function exportWith(format, options) {
  const exporter = EXPORTERS.get(format);
  if (!exporter) throw new RangeError(`找不到匯出格式：${format}`);
  return exporter(options);
}

registerExporter('png', exportCardPng);

export function downloadBlob(blob, filename = 'slimegarden-codex.png') {
  if (!(blob instanceof Blob)) throw new TypeError('下載內容必須是 Blob');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
