const HUE_LEVELS = [
  { saturation: 1, lightness: 0, glow: 0, accent: 0, hueShift: 0 },
  { saturation: 0.72, lightness: 0.12, glow: 0.08, accent: 0.08, hueShift: 0 },
  { saturation: 1.32, lightness: 0.02, glow: 0.48, accent: 0.24, hueShift: 18 },
  { saturation: 0.9, lightness: 0.18, glow: 0.88, accent: 0.42, hueShift: 58 },
];

const GLOSS_LEVELS = [
  { opacity: 0.9, highlight: 0.42, fluorescence: 0.02, blur: 0.08 },
  { opacity: 0.84, highlight: 0.62, fluorescence: 0.08, blur: 0.16 },
  { opacity: 0.78, highlight: 0.78, fluorescence: 0.52, blur: 0.32 },
  { opacity: 0.54, highlight: 0.94, fluorescence: 0.24, blur: 0.2 },
];

const CORE_MOTIFS = ['none', 'leaf', 'drop', 'petal', 'star'];

function clampIndex(value, max) {
  return Math.max(0, Math.min(max, Math.trunc(Number(value) || 0)));
}

function hexToHsl(hex) {
  const normalized = String(hex || '#8bd8c0').replace('#', '');
  const full = normalized.length === 3 ? [...normalized].map((part) => part + part).join('') : normalized;
  const value = Number.parseInt(full, 16);
  let r = ((value >> 16) & 255) / 255;
  let g = ((value >> 8) & 255) / 255;
  let b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (delta) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hslToHex({ h, s, l }) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - chroma / 2;
  let rgb;
  if (h < 60) rgb = [chroma, x, 0];
  else if (h < 120) rgb = [x, chroma, 0];
  else if (h < 180) rgb = [0, chroma, x];
  else if (h < 240) rgb = [0, x, chroma];
  else if (h < 300) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  return `#${rgb.map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function adjust(hex, saturation, lightness, hueShift) {
  const hsl = hexToHsl(hex);
  return hslToHex({
    h: (hsl.h + hueShift) % 360,
    s: Math.max(0, Math.min(1, hsl.s * saturation)),
    l: Math.max(0.04, Math.min(0.96, hsl.l + lightness)),
  });
}

/** 依物種色票與三個變異維度，產生 SVG／Canvas 共用的柔亮色彩參數。 */
export function slimeColors(speciesDef, { hue = 0, gloss = 0, core = 0 } = {}) {
  const palette = speciesDef?.palette || {};
  const hueParams = HUE_LEVELS[clampIndex(hue, HUE_LEVELS.length - 1)];
  const glossParams = GLOSS_LEVELS[clampIndex(gloss, GLOSS_LEVELS.length - 1)];
  const base = palette.base || '#8bd8c0';
  const light = palette.light || '#d9fff0';
  const dark = palette.dark || '#429d88';
  const accent = palette.accent || '#fff0a8';
  const nebula = clampIndex(hue, HUE_LEVELS.length - 1) === 3;
  const coreLevel = clampIndex(core, CORE_MOTIFS.length - 1);
  return {
    base: adjust(base, hueParams.saturation, hueParams.lightness, hueParams.hueShift),
    light: adjust(light, hueParams.saturation, hueParams.lightness * 0.65, hueParams.hueShift),
    dark: adjust(dark, hueParams.saturation, hueParams.lightness * 0.35, hueParams.hueShift),
    accent: adjust(accent, 1 + hueParams.accent, hueParams.lightness * 0.45, hueParams.hueShift),
    opacity: glossParams.opacity,
    highlightOpacity: glossParams.highlight,
    fluorescence: Math.min(1, glossParams.fluorescence + hueParams.glow * 0.42),
    glow: Math.min(1, hueParams.glow + glossParams.blur),
    glowBlur: 2 + hueParams.glow * 9 + glossParams.blur * 5,
    rimOpacity: Math.min(0.95, 0.28 + glossParams.highlight * 0.44 + hueParams.glow * 0.28),
    hueLevel: clampIndex(hue, HUE_LEVELS.length - 1),
    isNebula: nebula,
    coreMotif: CORE_MOTIFS[coreLevel],
  };
}
