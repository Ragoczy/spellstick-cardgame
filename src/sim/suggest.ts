// Writes tuning suggestions from the numbers: for each missed target, which experiments
// (if any were run) bring it closest to the target.

import { keyMetrics, TARGETS, type Experiment } from './report';
import type { SimResult } from './simulate';

/** How far a value is outside its target (0 = inside). */
function miss(target: (typeof TARGETS)[number], value: number): number {
  if (target.ok(value)) return 0;
  const [low, high] = target.goal.includes('–')
    ? target.goal.replace('%', '').split('–').map((x) => Number(x.replace('%', '')) / (target.goal.includes('%') ? 100 : 1))
    : [Number(target.goal.replace(/[^0-9.]/g, '')) / 100, Infinity];
  return value < low! ? low! - value : value - high!;
}

export function suggestTuning(baseline: SimResult, experiments: Experiment[]): string[] {
  const lines: string[] = [];
  const base = keyMetrics(baseline.stats);
  for (const target of TARGETS) {
    const value = target.value(base);
    if (target.ok(value)) continue;
    let line = `- **${target.label}** is ${target.format(value)} (target ${target.goal}).`;
    const ranked = experiments
      .map((e) => ({ e, v: target.value(keyMetrics(e.result.stats)) }))
      .filter(({ v }) => miss(target, v) < miss(target, value))
      .sort((a, b) => miss(target, a.v) - miss(target, b.v));
    if (ranked.length) {
      const best = ranked.slice(0, 3).map(({ e, v }) => `${e.name} (${target.format(v)}${target.ok(v) ? ' ✅' : ''})`);
      line += ` Experiments that help most: ${best.join('; ')}.`;
    } else if (experiments.length) {
      line += ' None of the experiments helped.';
    }
    lines.push(line);
  }
  return lines;
}
