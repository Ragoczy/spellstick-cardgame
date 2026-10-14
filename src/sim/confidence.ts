// 95% confidence intervals for simulation results. Every number in a comparison report comes with
// one, so a difference that luck alone could explain is visible as such.
//
// All of these use the normal approximation (mean ± 1.96 standard errors). With thousands of
// games that's accurate, and it's simple enough to check by hand.

/** A measured value and the range it would fall in 95% of the time if the run were repeated. */
export interface Interval {
  value: number;
  low: number;
  high: number;
  /** How many samples (games or seeds) it came from. */
  n: number;
}

const Z95 = 1.96;

function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}

/** Sample variance (divides by n − 1). */
function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

/**
 * The average of a per-game (or per-seed) number, such as goals per game. For a win rate, pass
 * each seed's points (win 1, draw ½, loss 0, averaged over that seed's games).
 */
export function meanInterval(values: readonly number[]): Interval {
  const value = mean(values);
  const margin = Z95 * Math.sqrt(variance(values) / Math.max(1, values.length));
  return { value, low: value - margin, high: value + margin, n: values.length };
}

/**
 * A share made of two per-game counts, such as "Shaken out of all hurts": the sum of the tops over
 * the sum of the bottoms. The interval comes from the spread of each game's contribution (the
 * delta method), so games with many events and games with none are both handled fairly.
 */
export function ratioInterval(tops: readonly number[], bottoms: readonly number[]): Interval {
  if (tops.length !== bottoms.length) throw new Error('ratioInterval needs one top and one bottom per game');
  const n = tops.length;
  const meanBottom = mean(bottoms);
  if (n === 0 || meanBottom === 0) return { value: 0, low: 0, high: 0, n };
  const value = mean(tops) / meanBottom;
  // Each game's leftover after the ratio is applied, scaled by the average bottom.
  const leftovers = tops.map((t, i) => (t - value * bottoms[i]!) / meanBottom);
  const margin = Z95 * Math.sqrt(variance(leftovers) / n);
  return { value, low: value - margin, high: value + margin, n };
}

/**
 * The change between two runs on the same seeds: each seed's after minus its before. Pairing by
 * seed removes the luck of the deal, so a small real change shows up with fewer games.
 */
export function pairedDifference(before: readonly number[], after: readonly number[]): Interval {
  if (before.length !== after.length) throw new Error('pairedDifference needs the same seeds in both runs');
  return meanInterval(after.map((a, i) => a - before[i]!));
}

/**
 * The change in a share (as in ratioInterval) between two runs on the same seeds, paired by seed.
 * A per-game average is the special case where every bottom is 1.
 */
export function pairedRatioDifference(
  before: { tops: readonly number[]; bottoms: readonly number[] },
  after: { tops: readonly number[]; bottoms: readonly number[] },
): Interval {
  const n = before.tops.length;
  if (after.tops.length !== n || before.bottoms.length !== n || after.bottoms.length !== n) {
    throw new Error('pairedRatioDifference needs the same seeds in both runs');
  }
  const meanBefore = mean(before.bottoms);
  const meanAfter = mean(after.bottoms);
  if (n === 0 || meanBefore === 0 || meanAfter === 0) return { value: 0, low: 0, high: 0, n };
  const rBefore = mean(before.tops) / meanBefore;
  const rAfter = mean(after.tops) / meanAfter;
  // Each seed's leftover in the after run minus its leftover in the before run.
  const leftovers = after.tops.map((t, i) =>
    (t - rAfter * after.bottoms[i]!) / meanAfter - (before.tops[i]! - rBefore * before.bottoms[i]!) / meanBefore);
  const value = rAfter - rBefore;
  const margin = Z95 * Math.sqrt(variance(leftovers) / n);
  return { value, low: value - margin, high: value + margin, n };
}

/** True if the whole interval is inside [low, high]. Either end may be left open. */
export function insideRange(interval: Interval, low = -Infinity, high = Infinity): boolean {
  return interval.low >= low && interval.high <= high;
}

/** "2.45 (2.41–2.49)", with the same number of decimals throughout. */
export function formatInterval(interval: Interval, decimals = 2, scale = 1): string {
  const f = (n: number) => (n * scale).toFixed(decimals);
  return `${f(interval.value)} (${f(interval.low)}–${f(interval.high)})`;
}
