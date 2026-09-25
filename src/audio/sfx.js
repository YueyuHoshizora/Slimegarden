let unlocked = false;
const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
let context;
let master;
let muted = false;
// 玩家音量（0～1），乘在 master 基準增益上
let volume = 1;
let noiseBuffer;

function audio() {
  if (!AudioContextClass) return null;
  if (!context) {
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = masterGain();
    master.connect(context.destination);
    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  return context;
}

function tone(frequency, start, duration, wave, volume, endFrequency = frequency, destination = master) {
  const ctx = audio();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(Math.max(35, frequency), start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, endFrequency), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.015);
}

function noise(start, duration, volume) {
  const ctx = audio();
  if (!ctx) return;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = noiseBuffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(5200, start);
  filter.frequency.exponentialRampToValueAtTime(700, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(start);
  source.stop(start + duration + 0.02);
}

const jingles = {
  summon: [[659, 0, 0.11], [784, 0.1, 0.12], [988, 0.21, 0.2]],
  merge: [[523, 0, 0.12], [659, 0.09, 0.12], [784, 0.18, 0.12], [1047, 0.27, 0.28]],
  recipeOk: [[784, 0, 0.12], [988, 0.12, 0.12], [1175, 0.24, 0.13], [1568, 0.37, 0.3]],
  recipeFail: [[659, 0, 0.16], [587, 0.14, 0.16], [659, 0.28, 0.25]],
  mutation: [[523, 0, 0.13], [659, 0.11, 0.13], [880, 0.22, 0.13], [1175, 0.33, 0.13], [1568, 0.44, 0.32]],
  prestige: [[392, 0, 0.17], [523, 0.15, 0.17], [659, 0.3, 0.17], [784, 0.45, 0.17], [1047, 0.6, 0.42]],
  codex: [[988, 0, 0.1], [1175, 0.09, 0.1], [1568, 0.18, 0.22]],
};

function play(name) {
  const ctx = audio();
  if (!ctx || muted || !unlocked || ctx.state !== 'running') return;
  const now = ctx.currentTime + 0.01;
  if (name === 'button') {
    tone(740, now, 0.065, 'square', 0.08, 590);
    return;
  }
  if (name === 'pop') {
    tone(580, now, 0.12, 'square', 0.15, 190);
    tone(110, now, 0.18, 'triangle', 0.11, 68);
    noise(now, 0.065, 0.025);
    return;
  }
  if (name === 'purr') {
    tone(115, now, 0.75, 'triangle', 0.12, 82);
    tone(148, now + 0.08, 0.6, 'triangle', 0.045, 104);
    noise(now, 0.52, 0.014);
    return;
  }
  const notes = jingles[name];
  if (!notes) return;
  for (const [frequency, offset, duration] of notes) {
    tone(frequency, now + offset, duration, 'square', 0.1, frequency * 1.015);
  }
  if (name === 'summon' || name === 'merge' || name === 'prestige') {
    tone(130, now, 0.3, 'triangle', 0.045, 90);
  }
}

function masterGain() {
  return muted ? 0 : 0.72 * volume;
}

function applyGain() {
  if (master && context) {
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(masterGain(), context.currentTime, 0.025);
  }
}

function setMuted(value) {
  muted = Boolean(value);
  applyGain();
}

function setVolume(value) {
  volume = Math.min(1, Math.max(0, Number(value) || 0));
  applyGain();
}

export const sfx = {
  async unlock() {
    const ctx = audio();
    if (ctx) {
      if (ctx.state !== 'running') await ctx.resume();
      unlocked = ctx.state === 'running';
    }
  },
  play,
  setMuted,
  setVolume,
};
