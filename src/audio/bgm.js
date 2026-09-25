const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
const TRACKS = {
  day: ['day1.json', 'day2.json'],
  night: ['night1.json'],
};
const CHANNEL_VOLUME = { pulse1: 0.12, pulse2: 0.075, triangle: 0.13, noise: 0.018 };
let context;
let master;
let muted = false;
// 玩家音量（0～1），乘在 master 基準增益上
let volume = 1;
let unlocked = false;
let noiseBuffer;
let nextDay = 0;
let current;
let request = 0;
const loaded = new Map();

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

function loadTrack(file) {
  if (!loaded.has(file)) {
    loaded.set(file, fetch(new URL(`../../assets/audio/${file}`, import.meta.url)).then((response) => {
      if (!response.ok) throw new Error(`無法載入音樂：${file}`);
      return response.json();
    }));
  }
  return loaded.get(file);
}

function midiFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function noteSound(track, channel, event, when, destination) {
  if (channel === 'noise') {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.value = 4300;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(CHANNEL_VOLUME.noise, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + event[2]);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(when);
    source.stop(when + event[2] + 0.01);
    return;
  }
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = channel === 'triangle' ? 'triangle' : 'square';
  oscillator.frequency.value = midiFrequency(event[1]);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(CHANNEL_VOLUME[channel], when + 0.008);
  gain.gain.setValueAtTime(CHANNEL_VOLUME[channel], Math.max(when + 0.012, when + event[2] - 0.025));
  gain.gain.exponentialRampToValueAtTime(0.0001, when + event[2]);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(when);
  oscillator.stop(when + event[2] + 0.012);
}

function startTrack(track, destination) {
  const beatSeconds = 60 / track.tempo;
  const loopBeats = track.bars * track.beatsPerBar;
  const phraseBeats = track.phraseBeats || loopBeats;
  const eventMap = new Map();
  for (const [channel, events] of Object.entries(track.channels)) {
    const byBeat = new Map();
    for (const event of events) {
      const beat = Math.round(event[0] * 1000) / 1000;
      if (!byBeat.has(beat)) byBeat.set(beat, []);
      byBeat.get(beat).push(event);
    }
    eventMap.set(channel, byBeat);
  }
  const origin = context.currentTime + 0.08;
  let beatCursor = 0;
  const timer = setInterval(() => {
    if (current?.destination !== destination) return;
    const nowBeat = (context.currentTime - origin) / beatSeconds;
    const untilBeat = nowBeat + 0.35 / beatSeconds;
    while (beatCursor <= untilBeat) {
      const localBeat = ((beatCursor % loopBeats) % phraseBeats + phraseBeats) % phraseBeats;
      const key = Math.round(localBeat * 1000) / 1000;
      const when = origin + beatCursor * beatSeconds;
      if (when >= context.currentTime - 0.02) {
        for (const [channel, byBeat] of eventMap) {
          for (const event of byBeat.get(key) || []) noteSound(track, channel, event, when, destination);
        }
      }
      beatCursor += 0.25;
    }
  }, 45);
  return timer;
}

async function play(phase) {
  if (!TRACKS[phase] || !unlocked) return;
  const ctx = audio();
  if (!ctx || ctx.state !== 'running') return;
  const myRequest = ++request;
  const file = TRACKS[phase][phase === 'day' ? nextDay++ % TRACKS.day.length : 0];
  let track;
  try {
    track = await loadTrack(file);
  } catch (error) {
    console.warn(error);
    return;
  }
  if (myRequest !== request) return;
  const destination = ctx.createGain();
  destination.gain.setValueAtTime(0, ctx.currentTime);
  destination.connect(master);
  const previous = current;
  current = { destination, timer: null };
  current.timer = startTrack(track, destination);
  destination.gain.setTargetAtTime(1, ctx.currentTime, 0.45);
  if (previous) {
    previous.destination.gain.setTargetAtTime(0, ctx.currentTime, 0.45);
    setTimeout(() => {
      clearInterval(previous.timer);
      try { previous.destination.disconnect(); } catch {}
    }, 1800);
  }
}

function stop() {
  request += 1;
  if (!current || !context) return;
  const previous = current;
  current = null;
  previous.destination.gain.setTargetAtTime(0, context.currentTime, 0.28);
  setTimeout(() => {
    clearInterval(previous.timer);
    try { previous.destination.disconnect(); } catch {}
  }, 1200);
}

function masterGain() {
  return muted ? 0 : 0.55 * volume;
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

export const bgm = {
  async unlock() {
    const ctx = audio();
    if (ctx) {
      if (ctx.state !== 'running') await ctx.resume();
      unlocked = ctx.state === 'running';
    }
  },
  play,
  stop,
  setMuted,
  setVolume,
};
