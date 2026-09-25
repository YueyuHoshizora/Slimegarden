import { CONFIG } from '../data/config.js';

export function getPhase(date = new Date()) {
  const hour = date instanceof Date ? date.getHours() : new Date(date).getHours();
  return hour >= CONFIG.time.dayStartHour && hour < CONFIG.time.nightStartHour ? 'day' : 'night';
}

export function splitByPhase(from, to) {
  const start = toTimestamp(from);
  const end = toTimestamp(to);
  const segments = [];
  let cursor = start;

  while (cursor < end) {
    const phase = getPhase(cursor);
    const boundary = nextPhaseBoundary(cursor, phase);
    const segmentEnd = Math.min(boundary, end);
    segments.push({ phase, from: cursor, to: segmentEnd, durationMs: segmentEnd - cursor });
    cursor = segmentEnd;
  }

  return segments;
}

export function toTimestamp(value) {
  return value instanceof Date ? value.getTime() : Number(value);
}

function nextPhaseBoundary(timestamp, phase) {
  const boundary = new Date(timestamp);
  boundary.setHours(phase === 'day' ? CONFIG.time.nightStartHour : CONFIG.time.dayStartHour, 0, 0, 0);
  if (boundary.getTime() <= timestamp) boundary.setDate(boundary.getDate() + 1);
  return boundary.getTime();
}
