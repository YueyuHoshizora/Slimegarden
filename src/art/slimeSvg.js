import { slimeColors } from './palette.js';
import { name, t } from '../i18n/index.js';

let nextSvgId = 0;
const FAMILY_COLORS = {
  origin: ['#fff4d8', '#e0fff1'], fruit: ['#fff0e6', '#ffe1ee'], dessert: ['#fff5d9', '#fff0dc'],
  weather: ['#eaf8ff', '#eef3ff'], star: ['#eeeaff', '#fff0fa'], garden: ['#eaffed', '#e1f7e8'],
  primal: ['#f2e9ff', '#dcf4f5'],
};

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function motifsFor(speciesDef) {
  return String(speciesDef?.motif || 'none').split(',').map((motif) => motif.trim()).filter(Boolean);
}

function starPath(cx, cy, radius) {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const r = index % 2 ? radius * 0.43 : radius;
    return `${index ? 'L' : 'M'}${(cx + Math.cos(angle) * r).toFixed(2)} ${(cy + Math.sin(angle) * r).toFixed(2)}`;
  }).join(' ') + ' Z';
}

function renderMotifs(motifs, colors, tier, id) {
  const result = [];
  const dots = (count, color, radius, opacity = 0.88) => Array.from({ length: count }, (_, index) => {
    const x = 43 + ((index * 19 + tier * 7) % 36);
    const y = 55 + ((index * 13 + tier * 5) % 20);
    return `<ellipse cx="${x}" cy="${y}" rx="${radius}" ry="${radius * 1.22}" fill="${color}" opacity="${opacity}" transform="rotate(-24 ${x} ${y})"/>`;
  }).join('');
  for (const motif of motifs) {
    if (motif === 'seeds') result.push(`<g fill="#fff7d8" stroke="#dc9c82" stroke-width=".45">${dots(9, '#fff7d8', 1.05)}</g>`);
    else if (motif === 'leaf' || motif === 'clover' || motif === 'bud') result.push(`<g fill="${colors.accent}" stroke="#72b98d" stroke-width=".8"><path d="M59 36 Q59 17 72 19 Q73 31 59 36Z"/><path d="M60 36 Q45 20 40 29 Q47 39 60 36Z"/><path d="M60 36v10" fill="none"/></g>`);
    else if (motif === 'petal' || motif === 'flower') result.push(`<g transform="translate(61 35)" fill="${colors.accent}" stroke="#fff8ee" stroke-width=".7"><ellipse cy="-6" rx="3.2" ry="6"/><ellipse cy="6" rx="3.2" ry="6"/><ellipse cx="-6" rx="6" ry="3.2"/><ellipse cx="6" rx="6" ry="3.2"/><circle r="2.7" fill="#ffe58e"/></g>`);
    else if (motif === 'star' || motif === 'sparkle') result.push(`<g fill="#fff8c7" stroke="#fff" stroke-width=".8"><path d="${starPath(39, 52, 5)}"/><path d="${starPath(81, 43, 3.3)}"/><circle cx="86" cy="64" r="1.3" opacity=".8"/></g>`);
    else if (motif === 'drop' || motif === 'dewdrop') result.push(`<g fill="#e8ffff" stroke="#fff" stroke-width=".8"><path d="M74 25 Q70 30 70 33a4 4 0 0 0 8 0q0-3-4-8Z"/><ellipse cx="72" cy="32" rx="1" ry="1.6" fill="#fff" stroke="none"/></g>`);
    else if (motif === 'cloud' || motif === 'puff') result.push(`<g fill="#fff" opacity=".95" stroke="#d8eafa" stroke-width=".7"><circle cx="43" cy="37" r="5"/><circle cx="49" cy="34" r="6"/><circle cx="55" cy="38" r="4"/><path d="M40 38h18v3H40z"/></g>`);
    else if (motif === 'snowflake' || motif === 'snow') result.push(`<g stroke="#fff" stroke-width="1.2" stroke-linecap="round"><path d="M80 34v12m-5-9 10 6m0-6-10 6"/><path d="M80 34l-1.3 2m1.3-2 1.3 2m-6.3 7 2.3-.1m-2.3.1 1-2m8 2-2.3-.1m2.3.1-1-2"/></g>`);
    else if (motif === 'flame') result.push(`<path d="M65 31q-4-7 1-13 0 5 4 7 3-5 2-9 9 8 4 16" fill="#ffbc79" stroke="#fff1be" stroke-width="1"/><path d="M68 29q1-4 3-5 3 4 1 7" fill="#fff6b4"/>`);
    else if (motif === 'wave') result.push(`<g fill="none" stroke="#e9ffff" stroke-width="1.6" stroke-linecap="round"><path d="M35 55q4-4 8 0t8 0"/><path d="M73 51q4-4 8 0t8 0"/></g>`);
    else if (motif === 'cream') result.push(`<path d="M55 36q-5-3-1-7 2-2 4 1 3-7 7-3 4 4-3 9Z" fill="#fff8ec" stroke="#ffe8d1" stroke-width=".8"/>`);
    else if (motif === 'mushroom') result.push(`<g stroke="#fff6e8" stroke-width=".8"><path d="M77 37v8" stroke="#fff" stroke-width="2"/><path d="M71 37q0-7 6-7t6 7Z" fill="#f6a6a5"/><circle cx="74" cy="34" r="1" fill="#fff"/></g>`);
    else if (motif !== 'none') result.push(`<circle cx="${35 + (id.length % 40)}" cy="45" r="2" fill="${colors.accent}" opacity=".85"/>`);
  }
  return result.join('');
}

/** 產生圖鑑用精繪 SVG；相同造型由色相、光澤、核心與階級參數化。 */
export function slimeSvg(speciesDef, { tier = 1, hue = 0, gloss = 0, core = 0, size = 128 } = {}) {
  const colors = slimeColors(speciesDef, { hue, gloss, core });
  const id = `slime-${++nextSvgId}`;
  const [backA, backB] = FAMILY_COLORS[speciesDef?.family] || FAMILY_COLORS.origin;
  const rank = Math.max(1, Math.min(10, Math.trunc(Number(tier) || 1)));
  const plump = (rank - 1) / 9;
  const bodyPath = `M23 77 C${24 - plump * 2} 61 ${31 - plump * 2} ${40 - plump * 3} 44 ${35 - plump * 3} C51 ${29 - plump * 3} 69 ${29 - plump * 3} 77 ${35 - plump * 3} C${91 + plump * 2} ${42 - plump * 2} ${97 + plump * 2} 61 97 77 C96 94 80 102 60 102 C40 102 24 94 23 77Z`;
  const motifs = motifsFor(speciesDef);
  const eyeScale = 1 + plump * 0.08;
  const extraStars = rank >= 7 ? `<g fill="#fff8c7"><path d="${starPath(27, 48, 2.2)}"/><path d="${starPath(94, 54, 2.6)}"/></g>` : '';
  const coreMark = colors.coreMotif === 'none' ? '' : renderMotifs([colors.coreMotif === 'drop' ? 'dewdrop' : colors.coreMotif], colors, rank, id);
  const halo = colors.isNebula ? `<g fill="none" stroke="#fff5d9"><circle cx="60" cy="61" r="44" stroke-width=".7" opacity=".46"/><circle cx="60" cy="61" r="49" stroke-width=".45" stroke-dasharray="1 4" opacity=".5"/><path d="${starPath(21, 60, 2.3)}" fill="#fff8cf" stroke="none"/><path d="${starPath(97, 41, 2.8)}" fill="#fff8cf" stroke="none"/><circle cx="31" cy="34" r="1" fill="#fff"/><circle cx="90" cy="78" r="1.2" fill="#fff"/></g>` : '';
  const glossOverlay = gloss >= 3 ? `<path d="M34 72 C34 52 45 41 57 40" fill="none" stroke="#fff" stroke-width="1.4" opacity=".6"/>` : '';
  const w = Math.max(1, Number(size) || 128);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 120 120" role="img" aria-label="${escapeXml(name(speciesDef?.name) || speciesDef?.id || '')}" preserveAspectRatio="xMidYMid meet">
<defs>
  <radialGradient id="${id}-bg" cx="50%" cy="42%" r="68%"><stop stop-color="${backA}" stop-opacity=".9"/><stop offset="1" stop-color="${backB}" stop-opacity=".08"/></radialGradient>
  <radialGradient id="${id}-body" cx="39%" cy="28%" r="79%"><stop stop-color="${colors.light}"/><stop offset=".45" stop-color="${colors.base}" stop-opacity="${colors.opacity}"/><stop offset="1" stop-color="${colors.dark}" stop-opacity=".96"/></radialGradient>
  <linearGradient id="${id}-shine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".88"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="${id}-shadow"><stop stop-color="#567b78" stop-opacity=".26"/><stop offset="1" stop-color="#567b78" stop-opacity="0"/></radialGradient>
  <filter id="${id}-blur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${colors.glowBlur}"/></filter>
  <clipPath id="${id}-clip"><path d="${bodyPath}"/></clipPath>
</defs>
<rect width="120" height="120" fill="url(#${id}-bg)"/>
<circle cx="60" cy="59" r="34" fill="${colors.light}" opacity="${0.06 + colors.glow * 0.13}" filter="url(#${id}-blur)"/>
<g fill="#fff" opacity=".65"><circle cx="25" cy="28" r="1.2"/><circle cx="92" cy="27" r=".8"/><circle cx="101" cy="73" r="1"/><circle cx="20" cy="82" r=".7"/><circle cx="85" cy="94" r=".8"/></g>
${halo}
<ellipse cx="60" cy="101" rx="38" ry="7" fill="url(#${id}-shadow)"/>
<path d="${bodyPath}" fill="${colors.base}" opacity="${0.12 + colors.fluorescence * 0.12}" filter="url(#${id}-blur)"/>
<path d="${bodyPath}" fill="url(#${id}-body)" stroke="${colors.light}" stroke-opacity="${colors.rimOpacity}" stroke-width="1.35"/>
<g clip-path="url(#${id}-clip)">
  <ellipse cx="43" cy="48" rx="21" ry="11" fill="url(#${id}-shine)" opacity="${colors.highlightOpacity}" transform="rotate(-20 43 48)"/>
  <ellipse cx="81" cy="73" rx="19" ry="28" fill="${colors.accent}" opacity="${0.06 + colors.fluorescence * 0.12}"/>
  <path d="M29 72 C32 52 43 43 55 41" fill="none" stroke="#fff" stroke-width="2.2" opacity="${0.18 + colors.highlightOpacity * 0.45}" stroke-linecap="round"/>
  ${renderMotifs(motifs, colors, rank, id)}
  ${coreMark}
  ${glossOverlay}
</g>
<g fill="#e995a1" opacity="${0.12 + plump * 0.12}"><ellipse cx="42" cy="76" rx="6" ry="3.2"/><ellipse cx="78" cy="76" rx="6" ry="3.2"/></g>
<g fill="#263d48"><ellipse cx="49" cy="68" rx="3.25" ry="${4.1 * eyeScale}"/><ellipse cx="71" cy="68" rx="3.25" ry="${4.1 * eyeScale}"/></g>
<g fill="#fff"><circle cx="50" cy="66.8" r="1.15"/><circle cx="72" cy="66.8" r="1.15"/></g>
<path d="M56 75q4 3 8 0" fill="none" stroke="#547d78" stroke-width="1" stroke-linecap="round" opacity=".75"/>
${extraStars}
<path d="M31 88 Q60 105 89 88" fill="none" stroke="#fff" stroke-opacity="${colors.rimOpacity * 0.35}" stroke-width="1.2"/>
</svg>`;
}

/** 尚未發現的物種以柔和剪影呈現，不洩漏其家族色票。 */
export function silhouetteSvg(size = 128) {
  const w = Math.max(1, Number(size) || 128);
  const id = `silhouette-${++nextSvgId}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 120 120" aria-label="${escapeXml(t('unknown'))}" role="img"><defs><radialGradient id="${id}-g"><stop stop-color="#d9ddd8"/><stop offset="1" stop-color="#aeb9b3"/></radialGradient></defs><ellipse cx="60" cy="101" rx="37" ry="6" fill="#8d9d94" opacity=".16"/><path d="M23 77C24 56 39 36 60 35s36 20 37 42c1 17-16 25-37 25S24 94 23 77Z" fill="url(#${id}-g)" opacity=".56"/><ellipse cx="49" cy="69" rx="3" ry="4" fill="#f8faf7" opacity=".66"/><ellipse cx="71" cy="69" rx="3" ry="4" fill="#f8faf7" opacity=".66"/></svg>`;
}
