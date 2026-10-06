// Writes tuning suggestions from the numbers: for each missed target, which experiments
// (if any were run) bring it closest to the target.

import { distanceFromTarget, keyMetrics, onTarget, TARGETS, type Experiment } from './report';
import type { SimResult } from './simulate';

export function suggestTuning(baseline: SimResult, experiments: Experiment[]): string[] {
  const lines: string[] = [];
  const base = keyMetrics(baseline.stats);
  for (const target of TARGETS) {
    const value = target.value(base);
    if (onTarget(target, value)) continue;
    let line = `- **${target.label}** is ${target.format(value)} (target ${target.goal}).`;
    const ranked = experiments
      .map((e) => ({ e, v: target.value(keyMetrics(e.result.stats)) }))
      .filter(({ v }) => distanceFromTarget(target, v) < distanceFromTarget(target, value))
      .sort((a, b) => distanceFromTarget(target, a.v) - distanceFromTarget(target, b.v));
    if (ranked.length) {
      const best = ranked.slice(0, 3).map(({ e, v }) => `${e.name} (${target.format(v)}${onTarget(target, v) ? ' ✅' : ''})`);
      line += ` Experiments that help most: ${best.join('; ')}.`;
    } else if (experiments.length) {
      line += ' None of the experiments helped.';
    }
    lines.push(line);
  }
  return lines;
}
