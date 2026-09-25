import { CONFIG } from '../data/config.js';
import { computeRates } from './engine.js';
import { splitByPhase, toTimestamp } from './time.js';

export function settleOffline(state, from, to) {
  const requestedFrom = toTimestamp(from);
  const end = toTimestamp(to);
  const requestedDuration = Math.max(0, end - requestedFrom);
  const capRates = computeRates(state, 'day');
  const capMs = capRates.offlineCapHours * CONFIG.time.hourMs;
  const start = Math.max(requestedFrom, end - capMs);
  const segments = [];
  const totals = { day: { durationMs: 0, gel: 0 }, night: { durationMs: 0, gel: 0 } };
  let gelEarned = 0;

  for (const segment of splitByPhase(start, end)) {
    const rates = computeRates(state, segment.phase);
    const amount = rates.gelPerSecond * rates.offlineEfficiency * segment.durationMs / CONFIG.time.secondMs;
    const detail = { ...segment, gelPerSecond: rates.gelPerSecond, efficiency: rates.offlineEfficiency, gel: amount };
    segments.push(detail);
    totals[segment.phase].durationMs += segment.durationMs;
    totals[segment.phase].gel += amount;
    gelEarned += amount;
  }

  state.resources.gel += gelEarned;
  const settledMs = end - start;
  state.playMs += settledMs;
  state.lastTickAt = end;
  const breakdown = {
    requestedFrom, requestedTo: end, effectiveFrom: start, settledMs, cappedMs: Math.max(0, requestedDuration - settledMs),
    gelEarned, day: totals.day, night: totals.night, segments,
  };
  state.events.push({ type: 'offlineSettled', at: end, breakdown });
  return breakdown;
}
