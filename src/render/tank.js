import { SPECIES } from '../data/species.js';
import { slimeColors } from '../art/palette.js';

const W = 960;
const H = 560;
const TAU = Math.PI * 2;
const bySpecies = new Map(SPECIES.map(species => [species.id, species]));

export function createTank(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const slimes = new Map();
  const decorations = [];
  const selected = new Set();
  const pointer = { id: null, x: 0, y: 0, startX: 0, startY: 0, downAt: 0, long: false, dragging: false, target: null };
  let phase = 'day';
  let phaseFrom = 'day';
  let phaseStarted = 0;
  let phaseDuration = 0;
  let frame = 0;
  let lastTime = 0;
  let hidden = document.hidden;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let destroyed = false;
  let tapHandler = null;
  let longHandler = null;
  let dropHandler = null;
  let merge = null;
  let prestigeAt = 0;
  let observer;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function fit() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    const left = (rect.width - W * scale) / 2;
    const top = (rect.height - H * scale) / 2;
    return { x: (event.clientX - rect.left - left) / scale, y: (event.clientY - rect.top - top) / scale };
  }

  function place(slime, now, index) {
    if (!slime._tank) {
      const angle = index * 2.399;
      const radius = 70 + (index % 5) * 40;
      slime._tank = { x: W * .5 + Math.cos(angle) * radius, y: H * .72 + Math.sin(angle) * radius * .35, vx: 0, vy: 0, seed: Math.random() * TAU, born: now, poke: 0, press: 0, stick: 0 };
    }
    return slime._tank;
  }

  function addSlime(slime, now, index) {
    const old = slimes.get(slime.uid);
    const entry = { ...slime, _tank: old?._tank };
    place(entry, now, index);
    slimes.set(slime.uid, entry);
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawBackground(now, dt) {
    const transition = phaseDuration ? Math.min(1, (now - phaseStarted) / phaseDuration) : 1;
    const night = phase === 'night' ? transition : phaseDuration ? 1 - transition : 0;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, mix('#d8eff8', '#192747', night));
    sky.addColorStop(.72, mix('#fff0d9', '#34446d', night));
    sky.addColorStop(1, mix('#c3d9c5', '#243957', night));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const wallGlow = ctx.createRadialGradient(120 + Math.sin(now / 7000) * 40, 35, 8, 120, 120, 520);
    wallGlow.addColorStop(0, `rgba(255,246,207,${.48 * (1 - night)})`);
    wallGlow.addColorStop(1, 'rgba(255,246,207,0)');
    ctx.fillStyle = wallGlow;
    ctx.fillRect(0, 0, W, H);

    if (night > .01) {
      for (let i = 0; i < 36; i++) {
        const x = ((i * 173 + 37) % 910) + 25;
        const y = ((i * 97 + 23) % 240) + 25;
        const alpha = night * (.25 + .55 * Math.abs(Math.sin(now / 900 + i * 1.7)));
        ctx.fillStyle = `rgba(255,248,208,${alpha})`;
        ctx.beginPath(); ctx.arc(x, y, i % 5 === 0 ? 2 : 1.1, 0, TAU); ctx.fill();
      }
      ctx.save();
      ctx.globalAlpha = night;
      ctx.fillStyle = '#f8edc6';
      ctx.beginPath(); ctx.arc(808, 80, 31, 0, TAU); ctx.fill();
      ctx.fillStyle = '#263454';
      ctx.beginPath(); ctx.arc(822, 69, 28, 0, TAU); ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = .28 * (1 - night);
    ctx.translate(-115, 12);
    ctx.rotate(.42);
    ctx.fillStyle = '#fff8da';
    ctx.fillRect(150, 0, 110, 720);
    ctx.restore();

    ctx.fillStyle = mix('#91aa7e', '#546d6c', night);
    ctx.fillRect(0, 430, W, 130);
    const ground = ctx.createLinearGradient(0, 422, 0, 560);
    ground.addColorStop(0, mix('#a5ba8c', '#536f6a', night));
    ground.addColorStop(1, mix('#758f6d', '#334e5d', night));
    ctx.fillStyle = ground;
    ctx.fillRect(0, 430, W, 130);

    // 玻璃缸的柔和邊框與反光。
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.66)';
    ctx.lineWidth = 12;
    roundedRect(15, 12, W - 30, H - 24, 32); ctx.stroke();
    ctx.strokeStyle = 'rgba(183,222,232,.48)';
    ctx.lineWidth = 2;
    roundedRect(28, 25, W - 56, H - 50, 24); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.beginPath(); ctx.moveTo(48, 44); ctx.lineTo(63, 44); ctx.lineTo(63, 383); ctx.lineTo(48, 410); ctx.fill();
    ctx.restore();
    return night;
  }

  function drawDecoration(item, now, night) {
    const x = item.x ?? W * .5;
    const y = item.y ?? 420;
    const id = String(item.id ?? item.type ?? '');
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(53,67,58,.16)';
    ctx.beginPath(); ctx.ellipse(0, 5, 32, 7, 0, 0, TAU); ctx.fill();
    if (id.includes('pot') || id.includes('plant')) {
      ctx.fillStyle = '#d88978';
      ctx.beginPath(); ctx.moveTo(-22, -31); ctx.lineTo(22, -31); ctx.lineTo(16, 2); ctx.lineTo(-16, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8b684f'; ctx.beginPath(); ctx.ellipse(0, -30, 22, 6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#648c68'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -33); ctx.lineTo(0, -67); ctx.stroke();
      ctx.fillStyle = '#87b887'; ctx.beginPath(); ctx.ellipse(-10, -51, 11, 6, -.5, 0, TAU); ctx.ellipse(10, -61, 11, 6, .5, 0, TAU); ctx.fill();
    } else if (id.includes('fence')) {
      ctx.fillStyle = '#dfc99a';
      for (let i = -2; i <= 2; i++) { roundedRect(i * 14 - 5, -35, 10, 38, 5); ctx.fill(); }
      ctx.fillRect(-37, -27, 74, 6); ctx.fillRect(-37, -11, 74, 6);
    } else if (id.includes('windmill')) {
      ctx.strokeStyle = '#d9a76e'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -41); ctx.stroke();
      ctx.translate(0, -42); ctx.rotate(now / 1800); ctx.fillStyle = '#f1d994';
      for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.ellipse(0, -15, 5, 17, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#df967f'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
    } else {
      const nightlight = id.includes('light');
      ctx.fillStyle = nightlight ? `rgba(255,224,151,${.75 + night * .2})` : '#b8b9b1';
      ctx.beginPath(); ctx.ellipse(0, -8, id.includes('pebble') ? 19 : 14, 10, 0, 0, TAU); ctx.fill();
      if (nightlight) { const glow = ctx.createRadialGradient(0, -13, 3, 0, -13, 40); glow.addColorStop(0, 'rgba(255,231,161,.32)'); glow.addColorStop(1, 'rgba(255,231,161,0)'); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -13, 40, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  function drawSlime(slime, now, night, dt) {
    const state = slime._tank;
    const tier = Math.max(1, Number(slime.tier) || 1);
    const size = 23 + Math.min(tier, 10) * 2.6;
    const asleep = night > .62;
    const birthAge = now - state.born;
    const birth = Math.min(1, birthAge / 520);
    const poke = Math.max(0, 1 - (now - state.poke) / 360);
    const fusion = merge?.ids.has(slime.uid) ? Math.sin(Math.PI * Math.min(1, (now - merge.start) / 800)) : 0;
    const calm = (tier - 1) / 9;
    const speed = (1 - calm * .72) * (asleep ? .15 : 1);
    if (!pointer.dragging || pointer.id !== slime.uid) {
      const t = now / 1000 + state.seed;
      state.vx += Math.sin(t * .67) * .018 * speed;
      state.vy += Math.cos(t * .51) * .014 * speed;
      state.vx *= .992; state.vy *= .992;
      state.x += state.vx * dt * 60; state.y += state.vy * dt * 60;
      if (state.x < 65 || state.x > W - 65) state.vx += (state.x < 65 ? 1 : -1) * .09;
      if (state.y < 280 || state.y > 445) state.vy += (state.y < 280 ? 1 : -1) * .07;
    }
    if (pointer.dragging && pointer.id === slime.uid) { state.x = pointer.x; state.y = pointer.y; }
    const breath = Math.sin(now / 430 + state.seed) * .035;
    const squash = poke * .28;
    const swell = asleep ? .94 : 1;
    const cx = state.x, cy = state.y;
    const colors = slimeColors(bySpecies.get(slime.species) || { palette: { base: '#91c9a0', light: '#d7f0ce', dark: '#599a76', accent: '#f2a4a4' } }, { hue: slime.hue ?? 0, gloss: slime.gloss ?? 0, core: slime.core ?? 0 });
    const base = colors.base || colors.fill || '#91c9a0';
    const light = colors.light || '#d7f0ce';
    const dark = colors.dark || '#599a76';
    const gradient = ctx.createLinearGradient(cx - size, cy - size, cx + size, cy + size);
    gradient.addColorStop(0, light); gradient.addColorStop(.42, base); gradient.addColorStop(1, dark);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(swell * (1 + breath + squash * .35 + fusion * .25), swell * (1 - breath - squash * .38 + fusion * .12) * birth);
    ctx.fillStyle = 'rgba(47,61,53,.19)'; ctx.beginPath(); ctx.ellipse(0, size * .86, size * 1.08, size * .19, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = colors.opacity ?? 1;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-size, size * .5);
    ctx.bezierCurveTo(-size * 1.38, -size * .06, -size * .83, -size * 1.08, -size * .12, -size);
    ctx.bezierCurveTo(size * .68, -size * 1.13, size * 1.32, -size * .51, size, size * .48);
    ctx.bezierCurveTo(size * .83, size * .96, size * .36, size * .94, 0, size * .89);
    ctx.bezierCurveTo(-size * .62, size * .97, -size * .92, size * .86, -size, size * .5);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,255,255,${colors.rimOpacity ?? .32})`; ctx.stroke();
    const gloss = Number(slime.gloss) || 0;
    ctx.globalAlpha = .27 + gloss * .12;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(-size * .36, -size * .57, size * .28, size * .11, -.35, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    if ((Number(slime.tier) || 1) >= 4) {
      ctx.fillStyle = 'rgba(244,129,139,.45)';
      ctx.beginPath(); ctx.ellipse(-size * .62, size * .04, size * .16, size * .075, 0, 0, TAU); ctx.ellipse(size * .62, size * .04, size * .16, size * .075, 0, 0, TAU); ctx.fill();
    }
    const narrowed = pointer.id === slime.uid && pointer.long;
    const eyeY = size * .02;
    if (asleep || narrowed) {
      ctx.strokeStyle = '#35434b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (const ex of [-size * .32, size * .32]) { ctx.beginPath(); ctx.moveTo(ex - 4, eyeY); ctx.quadraticCurveTo(ex, eyeY + 5, ex + 4, eyeY); ctx.stroke(); }
    } else {
      ctx.fillStyle = '#293840';
      for (const ex of [-size * .32, size * .32]) {
        ctx.beginPath(); ctx.ellipse(ex, eyeY, size * .105, size * .16, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex - 2, eyeY - 3, 2.2, 0, TAU); ctx.fill(); ctx.fillStyle = '#293840';
      }
    }
    ctx.strokeStyle = 'rgba(92,74,77,.65)'; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.arc(0, size * .22, 4, .2, Math.PI - .2); ctx.stroke();
    if (slime.core) { ctx.fillStyle = '#fff4bd'; ctx.beginPath(); ctx.arc(0, -size * .55, 4 + Number(slime.core), 0, TAU); ctx.fill(); }
    if (selected.has(slime.uid) || pointer.target === slime.uid) {
      ctx.strokeStyle = '#ffe39e'; ctx.lineWidth = 3; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.ellipse(0, 1, size * 1.3, size * 1.17, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    if (poke && !reducedMotion.matches) {
      ctx.fillStyle = `rgba(255,139,169,${poke})`; ctx.font = '20px sans-serif'; ctx.fillText('♥', size * .65, -size * (.8 + poke * .5));
      ctx.fillText('♥', -size * .9, -size * (1 + poke * .4));
    }
    if (pointer.id === slime.uid && pointer.long) { ctx.fillStyle = 'rgba(255,255,255,.86)'; ctx.font = '16px sans-serif'; ctx.fillText('♫', size * .72, -size * 1.2); }
    ctx.restore();
  }

  function mix(a, b, amount) {
    const pa = a.match(/[\da-f]{2}/gi).map(v => parseInt(v, 16));
    const pb = b.match(/[\da-f]{2}/gi).map(v => parseInt(v, 16));
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * amount)).join(',')})`;
  }

  function tick(time) {
    if (destroyed) return;
    frame = requestAnimationFrame(tick);
    if (hidden || document.hidden) return;
    const now = time;
    const dt = Math.min(.05, lastTime ? (now - lastTime) / 1000 : .016);
    lastTime = now;
    if (pointer.id && !pointer.long && !pointer.dragging && now - pointer.downAt > 520) {
      pointer.long = true;
      const slime = slimes.get(pointer.id);
      if (slime) slime._tank.press = now;
      longHandler?.(pointer.id);
      pointer.long = true;
    }
    const scale = Math.min(width / W, height / H);
    const ox = (width - W * scale) / 2, oy = (height - H * scale) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    ctx.clearRect(0, 0, W, H);
    const night = drawBackground(now, dt);
    for (const decoration of decorations) drawDecoration(decoration, now, night);
    const live = [...slimes.values()];
    for (let i = 0; i < live.length; i++) {
      const a = live[i]._tank;
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j]._tank;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        const reach = 58;
        if (d < reach) { const push = (reach - d) * .0008; a.vx -= dx / d * push; a.vy -= dy / d * push; b.vx += dx / d * push; b.vy += dy / d * push; }
        if (d < 52 && Math.sin(now / 4300 + i * 2.1) > .97) { a.stick = now + 400; b.stick = now + 400; }
      }
    }
    if (merge) {
      const members = [...merge.ids].map(uid => slimes.get(uid)).filter(Boolean);
      if (members.length > 1) {
        const a = members[0]._tank;
        const b = members[1]._tank;
        const progress = Math.min(1, (now - merge.start) / 800);
        const colors = slimeColors(bySpecies.get(members[0].species), { hue: members[0].hue ?? 0, gloss: members[0].gloss ?? 0, core: members[0].core ?? 0 });
        ctx.save();
        ctx.globalAlpha = Math.sin(Math.PI * progress) * .85;
        ctx.strokeStyle = colors.base;
        ctx.lineWidth = 18 + Math.sin(Math.PI * progress) * 22;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - 38, b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (live.length <= 40) live.forEach((slime, i) => drawSlime(slime, now, night, dt));
    else live.slice(0, 40).forEach((slime, i) => drawSlime(slime, now, night, dt));
    if (merge) {
      const progress = Math.min(1, (now - merge.start) / 800);
      if (progress >= 1) { merge.resolve(); merge = null; }
    }
    if (prestigeAt && now - prestigeAt > 1200) prestigeAt = 0;
    if (prestigeAt) { ctx.fillStyle = `rgba(255,246,201,${Math.max(0, 1 - (now - prestigeAt) / 1200) * .62})`; ctx.fillRect(0, 0, W, H); }
  }

  function hit(pos) {
    let found = null, best = Infinity;
    for (const slime of slimes.values()) {
      const s = slime._tank, distance = Math.hypot(pos.x - s.x, pos.y - s.y);
      if (distance < 55 && distance < best) { found = slime; best = distance; }
    }
    return found;
  }

  function onDown(event) {
    const pos = point(event), slime = hit(pos);
    if (!slime) return;
    event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    Object.assign(pointer, { id: slime.uid, x: pos.x, y: pos.y, startX: pos.x, startY: pos.y, downAt: performance.now(), long: false, dragging: false, target: null });
  }
  function onMove(event) {
    if (!pointer.id) return;
    const pos = point(event); pointer.x = pos.x; pointer.y = pos.y;
    if (Math.hypot(pos.x - pointer.startX, pos.y - pointer.startY) > 22) pointer.dragging = true;
    pointer.target = pointer.dragging ? hit(pos)?.uid ?? null : null;
  }
  function onUp(event) {
    if (!pointer.id) return;
    const uid = pointer.id, to = pointer.dragging ? hit(point(event))?.uid : null;
    if (to && to !== uid) dropHandler?.(uid, to);
    else if (!pointer.dragging && !pointer.long) { const slime = slimes.get(uid); if (slime) slime._tank.poke = performance.now(); tapHandler?.(uid, event); }
    pointer.id = null; pointer.target = null; pointer.dragging = false; pointer.long = false;
  }
  function onVisibility() { hidden = document.hidden; lastTime = 0; }
  function resize() { fit(); }
  observer = new ResizeObserver(resize);
  observer.observe(canvas);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  document.addEventListener('visibilitychange', onVisibility);
  fit();
  frame = requestAnimationFrame(tick);

  return {
    setSlimes(list) { const now = performance.now(); const next = new Set(list.map(s => s.uid)); for (const uid of slimes.keys()) if (!next.has(uid)) slimes.delete(uid); list.forEach((slime, i) => addSlime(slime, now, i)); },
    setDecorations(list) { decorations.splice(0, decorations.length, ...list); },
    setPhase(value, transitionMs = 1200) { if (value === phase) return; phaseFrom = phase; phase = value; phaseStarted = performance.now(); phaseDuration = transitionMs; },
    poke(uid) { const slime = slimes.get(uid); if (slime) slime._tank.poke = performance.now(); },
    onSlimeTap(callback) { tapHandler = callback; },
    onSlimeLongPress(callback) { longHandler = callback; },
    onSlimeDrop(callback) { dropHandler = callback; },
    highlight(uids) { selected.clear(); for (const uid of uids || []) selected.add(uid); },
    playMerge(uids, resultSlime) { return new Promise(resolve => { merge = { ids: new Set(uids), start: performance.now(), resultSlime, resolve }; setTimeout(() => { if (merge?.resultSlime === resultSlime) { merge = null; resolve(); } }, 820); }); },
    playBirth(slime) { const now = performance.now(); addSlime(slime, now, slimes.size); if (slime._tank) slime._tank.born = now; },
    playPrestige() { prestigeAt = performance.now(); return new Promise(resolve => setTimeout(resolve, 1200)); },
    resize,
    destroy() { destroyed = true; cancelAnimationFrame(frame); observer?.disconnect(); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); document.removeEventListener('visibilitychange', onVisibility); }
  };
}
