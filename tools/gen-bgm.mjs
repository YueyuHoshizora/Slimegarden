// 產生 chiptune BGM 音軌：node tools/gen-bgm.mjs
// 以固定種子作曲，重跑結果完全相同；day1、day2、night1 為手寫曲目，不覆寫。
// 事件格式與 src/audio/bgm.js 相同：[拍位（0.25 拍為單位）, MIDI 音高, 秒數]
import { writeFileSync } from 'node:fs';

const OUT = new URL('../assets/audio/', import.meta.url);

// 調式音階（半音距離）
const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};

// 和弦進行（音階級數，0 起算）；A 段與 B 段各取一組
const PROGRESSIONS = {
  day: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 2, 5], [0, 3, 0, 4], [5, 3, 0, 4], [0, 2, 3, 4], [1, 4, 0, 5], [3, 0, 4, 0]],
  night: [[0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 5, 4], [3, 4, 0, 0], [0, 2, 5, 3], [5, 4, 3, 4]],
};

// 每小節旋律節奏（[起拍, 拍長]），全在 0.25 拍格點上
const RHYTHMS = {
  day: [
    [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 1]],
    [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1]],
    [[0, 0.75], [0.75, 0.25], [1, 1], [2, 0.75], [2.75, 0.25], [3, 1]],
    [[0, 0.5], [0.5, 0.5], [1, 1], [2, 0.5], [2.5, 0.5], [3, 0.5], [3.5, 0.5]],
    [[0, 1.5], [1.5, 0.5], [2, 0.5], [2.5, 0.5], [3, 1]],
    [[0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1], [3, 0.5], [3.5, 0.5]],
  ],
  night: [
    [[0, 2], [2, 2]],
    [[0, 1.5], [1.5, 0.5], [2, 2]],
    [[0, 3], [3, 1]],
    [[0, 1], [1, 1], [2, 2]],
    [[0, 4]],
  ],
};

// 各曲設定：調性主音（MIDI）、調式、速度、進行與節奏種子
const DAY = [
  { n: 3, root: 67, mode: 'major', tempo: 108, style: 'arp' },
  { n: 4, root: 65, mode: 'lydian', tempo: 96, style: 'stab' },
  { n: 5, root: 62, mode: 'major', tempo: 116, style: 'arp' },
  { n: 6, root: 69, mode: 'mixolydian', tempo: 104, style: 'bounce' },
  { n: 7, root: 64, mode: 'major', tempo: 92, style: 'stab' },
  { n: 8, root: 60, mode: 'lydian', tempo: 112, style: 'arp' },
  { n: 9, root: 67, mode: 'mixolydian', tempo: 120, style: 'bounce' },
  { n: 10, root: 65, mode: 'major', tempo: 100, style: 'arp' },
  { n: 11, root: 70, mode: 'major', tempo: 110, style: 'stab' },
  { n: 12, root: 62, mode: 'lydian', tempo: 98, style: 'bounce' },
  { n: 13, root: 68, mode: 'major', tempo: 124, style: 'arp' },
  { n: 14, root: 63, mode: 'mixolydian', tempo: 94, style: 'stab' },
  { n: 15, root: 66, mode: 'major', tempo: 106, style: 'bounce' },
  { n: 16, root: 61, mode: 'lydian', tempo: 114, style: 'arp' },
];
const NIGHT = [
  { n: 2, root: 62, mode: 'dorian', tempo: 66 },
  { n: 3, root: 65, mode: 'major', tempo: 62 },
  { n: 4, root: 69, mode: 'aeolian', tempo: 70 },
  { n: 5, root: 60, mode: 'lydian', tempo: 64 },
  { n: 6, root: 64, mode: 'dorian', tempo: 72 },
  { n: 7, root: 67, mode: 'major', tempo: 60 },
  { n: 8, root: 63, mode: 'aeolian', tempo: 68 },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const round = (value) => Math.round(value * 1000) / 1000;

// 音階上第 degree 級（可跨八度）的 MIDI 音高
function scaleNote(root, mode, degree) {
  const scale = MODES[mode];
  const octave = Math.floor(degree / scale.length);
  return root + octave * 12 + scale[((degree % scale.length) + scale.length) % scale.length];
}

function chordDegrees(chord) {
  return [chord, chord + 2, chord + 4];
}

// 離 target 最近、且屬於指定級數集合（任意八度）的級數
function nearestDegree(target, allowed, scaleLength) {
  let best = target;
  let bestDistance = Infinity;
  for (let d = target - scaleLength; d <= target + scaleLength; d += 1) {
    const inSet = allowed.some((a) => ((d - a) % scaleLength + scaleLength) % scaleLength === 0);
    if (inSet && Math.abs(d - target) < bestDistance) { best = d; bestDistance = Math.abs(d - target); }
  }
  return best;
}

// 一個樂句（4 小節）的旋律：強拍落和弦音，其餘級進，範圍限制在 low～high 級
function phraseMelody(rng, chords, rhythms, beatsPerChord, { low, high, start, cadence }) {
  const scaleLength = 7;
  const notes = [];
  let degree = start;
  chords.forEach((chord, barIndex) => {
    const rhythm = rhythms[barIndex % rhythms.length];
    for (let rep = 0; rep < beatsPerChord / 4; rep += 1) {
      rhythm.forEach(([offset, length], index) => {
        const beat = barIndex * beatsPerChord + rep * 4 + offset;
        const strong = offset === 0 || offset === 2;
        if (strong) degree = nearestDegree(degree + pick(rng, [-2, -1, 0, 1, 2]), chordDegrees(chord), scaleLength);
        else degree += pick(rng, [-1, -1, 1, 1, 2, -2]);
        if (degree > high) degree -= 2;
        if (degree < low) degree += 2;
        const last = barIndex === chords.length - 1 && rep === beatsPerChord / 4 - 1 && index === rhythm.length - 1;
        if (last && cadence !== undefined) degree = nearestDegree(degree, [cadence], scaleLength);
        notes.push({ beat, length, degree });
      });
    }
  });
  return notes;
}

function compose(spec, phase) {
  const rng = mulberry32(spec.root * 1000 + spec.tempo * 7 + spec.n * 131 + (phase === 'night' ? 99991 : 0));
  // 把主音收斂到 C4 附近，避免高調性旋律過尖
  const pitchClass = spec.root % 12;
  spec = { ...spec, root: pitchClass <= 5 ? 60 + pitchClass : 48 + pitchClass };
  const secondsPerBeat = 60 / spec.tempo;
  const beatsPerChord = phase === 'day' ? 4 : 8;
  const progA = pick(rng, PROGRESSIONS[phase]);
  let progB = pick(rng, PROGRESSIONS[phase]);
  if (progB === progA) progB = PROGRESSIONS[phase][(PROGRESSIONS[phase].indexOf(progA) + 3) % PROGRESSIONS[phase].length];
  const rhythmsA = [pick(rng, RHYTHMS[phase]), pick(rng, RHYTHMS[phase])];
  const rhythmsB = [pick(rng, RHYTHMS[phase]), pick(rng, RHYTHMS[phase])];
  const range = phase === 'day' ? { low: 5, high: 13 } : { low: 3, high: 11 };

  // A A' B A''：A' 與 A'' 沿用 A 的旋律，只把句尾改成解決到主音
  const a = phraseMelody(rng, progA, rhythmsA, beatsPerChord, { ...range, start: 7, cadence: 4 });
  const aEnd = phraseMelody(rng, progA, rhythmsA, beatsPerChord, { ...range, start: 7, cadence: 0 });
  const b = phraseMelody(rng, progB, rhythmsB, beatsPerChord, { ...range, start: 9, cadence: 4 });
  const phraseBeats = beatsPerChord * 4;
  const aPrime = [...a.filter((n) => n.beat < phraseBeats - beatsPerChord), ...aEnd.filter((n) => n.beat >= phraseBeats - beatsPerChord)];
  const sections = [[a, progA], [aPrime, progA], [b, progB], [aPrime, progA]];

  const channels = { pulse1: [], pulse2: [], triangle: [], noise: [] };
  const legato = phase === 'day' ? 0.85 : 0.95;
  sections.forEach(([melody, progression], sectionIndex) => {
    const base = sectionIndex * phraseBeats;
    for (const note of melody) {
      channels.pulse1.push([round(base + note.beat), scaleNote(spec.root, spec.mode, note.degree), round(note.length * secondsPerBeat * legato)]);
    }
    progression.forEach((chord, chordIndex) => {
      const start = base + chordIndex * beatsPerChord;
      // 和聲放在主音八度（約 C4），IV 級以上的和弦降八度避免蓋過旋律；低音落在 C2～B2
      const [r, third, fifth] = chordDegrees(chord).map((d) => scaleNote(spec.root, spec.mode, d) - (chord >= 3 ? 12 : 0));
      const bassRoot = spec.root >= 60 ? spec.root - 24 : spec.root - 12;
      const bass = scaleNote(bassRoot, spec.mode, chord);
      if (phase === 'night') {
        // 夜間：長音和弦分解＋整段低音，打擊只剩隔段一聲輕響
        [r, fifth, third + 12, fifth].forEach((pitch, i) => channels.pulse2.push([start + i * 2, pitch, round(2 * secondsPerBeat * 0.95)]));
        channels.triangle.push([start, bass, round(beatsPerChord * secondsPerBeat * 0.92)]);
        if (chordIndex % 2 === 0) channels.noise.push([start, 0, 0.14]);
        return;
      }
      if (spec.style === 'arp') {
        [r, third, fifth, third + 12, fifth, third, r + 12, fifth].forEach((pitch, i) => channels.pulse2.push([start + i * 0.5, pitch, round(0.5 * secondsPerBeat * 0.8)]));
      } else if (spec.style === 'stab') {
        [0.5, 1.5, 2.5, 3.5].forEach((offset, i) => channels.pulse2.push([start + offset, i % 2 ? fifth : third, round(0.5 * secondsPerBeat * 0.6)]));
      } else {
        [[0, r], [1, fifth], [2, third + 12], [3, fifth]].forEach(([offset, pitch]) => channels.pulse2.push([start + offset, pitch, round(secondsPerBeat * 0.7)]));
      }
      const bassFifth = scaleNote(bassRoot, spec.mode, chord + 4);
      [[0, bass], [1.5, bass], [2, bassFifth], [3, bass]].forEach(([offset, pitch]) => channels.triangle.push([start + offset, pitch, round(0.9 * secondsPerBeat)]));
      for (let hat = 0; hat < 4; hat += spec.style === 'bounce' ? 0.5 : 1) channels.noise.push([start + hat, 0, hat % 1 ? 0.05 : 0.09]);
    });
  });

  const loopBeats = phraseBeats * 4;
  return { tempo: spec.tempo, beatsPerBar: 4, bars: loopBeats / 4, phraseBeats: loopBeats, channels };
}

function format(track) {
  const lines = Object.entries(track.channels).map(([channel, events]) => `    "${channel}": ${JSON.stringify(events).replace(/\],\[/g, '], [')}`);
  return `{\n  "tempo": ${track.tempo},\n  "beatsPerBar": ${track.beatsPerBar},\n  "bars": ${track.bars},\n  "phraseBeats": ${track.phraseBeats},\n  "channels": {\n${lines.join(',\n')}\n  }\n}\n`;
}

for (const spec of DAY) writeFileSync(new URL(`day${spec.n}.json`, OUT), format(compose(spec, 'day')));
for (const spec of NIGHT) writeFileSync(new URL(`night${spec.n}.json`, OUT), format(compose(spec, 'night')));
console.log(`已產生白天 ${DAY.length} 首、夜晚 ${NIGHT.length} 首（另保留手寫 day1、day2、night1）。`);
