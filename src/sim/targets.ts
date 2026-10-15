// The v0.17 targets (PLAN.md, "Targets and how each is measured") and the other measures every
// comparison report shows, each worked out from per-game tallies with a 95% interval.

import type { GoalieCardDef } from '../engine/cards';
import type { GameConfig } from '../engine/config';
import { formatInterval, pairedRatioDifference, ratioInterval, type Interval } from './confidence';
import { unansweredShieldChance, type GameTally } from './stats';

export interface Metric {
  label: string;
  /**
   * Each game's share of the result: the result is sum(top) / sum(bottom). A per-game average
   * leaves `bottom` out (every game counts 1); a rate such as "shots that score" uses the
   * game's shots as its bottom.
   */
  top: (t: GameTally) => number;
  bottom?: (t: GameTally) => number;
  /** Shown as a percentage. */
  percent?: boolean;
  decimals?: number;
  target?: { text: string; low?: number; high?: number };
}

/** v0.16, measured with `npm run sim` on seeds 11–15 (5,000 games) before v0.17 work began. */
export const V016 = { goals: 2.45, spellsCast: 15.7 };

const points = (t: GameTally, side: GameTally['firstSide']) => (t.winner === null ? 0.5 : t.winner === side ? 1 : 0);
const decided = (t: GameTally) => (t.winner === null ? 0 : 1);

export const TARGETS: Metric[] = [
  { label: 'Turns per game', top: (t) => t.turns, decimals: 1, target: { text: '30–50', low: 30, high: 50 } },
  {
    label: 'Goals per game', top: (t) => t.goals,
    target: { text: `${(V016.goals * 0.75).toFixed(2)}–${(V016.goals * 1.25).toFixed(2)} (v0.16 ±25%)`, low: V016.goals * 0.75, high: V016.goals * 1.25 },
  },
  { label: 'Spells cast per game', top: (t) => t.spellsCast, decimals: 1, target: { text: `at least ${V016.spellsCast}`, low: V016.spellsCast } },
  { label: 'Players hurt per game (any result)', top: (t) => t.hurts, target: { text: '4–8', low: 4, high: 8 } },
  { label: 'Shaken share of those', top: (t) => t.shaken, bottom: (t) => t.hurts, percent: true, target: { text: 'at least 50%', low: 0.5 } },
  { label: 'Real injuries per game (Injured, knocked out, carried off)', top: (t) => t.injured + t.knockedOut + t.carriedOff, target: { text: 'at least 3.5', low: 3.5 } },
  { label: 'Carried off + knocked out per game', top: (t) => t.carriedOff + t.knockedOut, target: { text: 'at most 1.5', high: 1.5 } },
  {
    label: 'Team that suffered the first carry-off or knockout lost',
    top: (t) => (t.firstSerious && t.winner ? (t.winner !== t.firstSerious ? 1 : 0) : 0),
    bottom: (t) => (t.firstSerious && t.winner ? 1 : 0),
    percent: true, target: { text: 'at most 60%', high: 0.6 },
  },
  // Paul (2026-10-15): about one penalty a game is fine for now, with blind draw and escalating risk.
  { label: 'Penalties per game', top: (t) => t.penalties, target: { text: '0.1–1.2', low: 0.1, high: 1.2 } },
  {
    label: 'Unanswered Shield scores (before the dice, over every shot)',
    top: (t) => t.shieldChanceSum, bottom: (t) => t.shieldShots, percent: true, target: { text: 'under 75%', high: 0.75 },
  },
];

export const OTHER_MEASURES: Metric[] = [
  { label: 'First player wins (draws count half)', top: (t) => points(t, t.firstSide), percent: true },
  { label: 'Team A wins (draws count half)', top: (t) => points(t, 'A'), percent: true },
  { label: 'Draws', top: (t) => 1 - decided(t), percent: true },
  { label: 'Shots per game', top: (t) => t.shots },
  { label: 'Shots that score', top: (t) => t.shotGoals, bottom: (t) => t.shots, percent: true },
  { label: 'Tackles per game', top: (t) => t.tackles },
  { label: 'Tackles won', top: (t) => t.tacklesWon, bottom: (t) => t.tackles, percent: true },
  { label: 'Hits per game', top: (t) => t.hits },
  { label: 'Hits that land', top: (t) => t.hitsLanded, bottom: (t) => t.hits, percent: true },
  { label: 'Hurt by hits, per game', top: (t) => t.hurtsBySource.hit },
  { label: 'Hurt by dirty plays, per game', top: (t) => t.hurtsBySource.dirty_play },
  { label: 'Hurt by tackles, per game', top: (t) => t.hurtsBySource.tackle },
  { label: 'Hurt by physical attacks, per game', top: (t) => t.hurtsBySource.attack },
  { label: 'Physical attacks per game', top: (t) => t.attacks },
  { label: 'Physical attacks won', top: (t) => t.attacksWon, bottom: (t) => t.attacks, percent: true },
  { label: 'Ball drops per game', top: (t) => t.ballDrops },
  { label: 'Turns in the penalty box per game', top: (t) => t.boxTurns },
  { label: 'Power plays per game', top: (t) => t.powerPlays },
  { label: 'Knockdowns per game', top: (t) => t.knockdowns },
  { label: 'Knockdowns that hurt', top: (t) => t.knockdownHurts, bottom: (t) => t.knockdowns, percent: true },
  { label: 'Shaken per game', top: (t) => t.shaken },
  { label: 'Injured per game (not carried off)', top: (t) => t.injured },
  { label: 'Knocked out per game', top: (t) => t.knockedOut },
  { label: 'Carried off per game', top: (t) => t.carriedOff },
  { label: 'Fouls (dirty plays) per game', top: (t) => t.fouls },
  { label: 'Fouls caught', top: (t) => t.foulsCaught, bottom: (t) => t.fouls, percent: true },
  { label: 'Sent off per game', top: (t) => t.sentOff },
];

function columns(metric: Metric, tallies: readonly GameTally[]) {
  return { tops: tallies.map(metric.top), bottoms: tallies.map((t) => (metric.bottom ? metric.bottom(t) : 1)) };
}

export function measure(metric: Metric, tallies: readonly GameTally[]): Interval {
  const { tops, bottoms } = columns(metric, tallies);
  return ratioInterval(tops, bottoms);
}

/**
 * Whether a result meets its target: 'met' if the whole interval is inside, 'missed' if the
 * whole interval is outside, and 'borderline' if luck could put it either side.
 */
export function verdict(metric: Metric, interval: Interval): 'met' | 'borderline' | 'missed' | '' {
  const target = metric.target;
  if (!target) return '';
  const low = target.low ?? -Infinity;
  const high = target.high ?? Infinity;
  if (interval.low >= low && interval.high <= high) return 'met';
  if (interval.high < low || interval.low > high) return 'missed';
  return 'borderline';
}

const VERDICT_TEXT = { met: 'Yes', borderline: 'Borderline', missed: 'No', '': '' };

function show(metric: Metric, interval: Interval): string {
  if (!metric.percent) return formatInterval(interval, metric.decimals ?? 2);
  const f = (n: number) => (100 * n).toFixed(1);
  return `${f(interval.value)}% (${f(interval.low)}–${f(interval.high)})`;
}

function showChange(metric: Metric, interval: Interval): string {
  const scale = metric.percent ? 100 : 1;
  const decimals = metric.percent ? 1 : metric.decimals ?? 2;
  const f = (n: number) => `${n * scale >= 0 ? '+' : '−'}${Math.abs(n * scale).toFixed(decimals)}`;
  return `${f(interval.value)} (${f(interval.low)} to ${f(interval.high)})${metric.percent ? ' points' : ''}`;
}

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

/** A Markdown table of one run: each measure with its interval, target, and whether it's met. */
export function singleRunTable(metrics: readonly Metric[], tallies: readonly GameTally[]): string {
  const withTargets = metrics.some((m) => m.target);
  const header = withTargets ? ['Measure', 'Result (95% interval)', 'Target', 'Met?'] : ['Measure', 'Result (95% interval)'];
  return table(header, metrics.map((m) => {
    const interval = measure(m, tallies);
    return withTargets ? [m.label, show(m, interval), m.target?.text ?? '', VERDICT_TEXT[verdict(m, interval)]] : [m.label, show(m, interval)];
  }));
}

/**
 * A Markdown table comparing two runs on the same seeds. Seeds that crashed in either run are
 * left out of both, so every row compares the same games.
 */
export function comparisonTable(metrics: readonly Metric[], before: readonly GameTally[], after: readonly GameTally[]): string {
  const [b, a] = matchSeeds(before, after);
  const withTargets = metrics.some((m) => m.target);
  const header = ['Measure', 'Before', 'After', 'Change (95% interval)', ...(withTargets ? ['Target', 'After meets it?'] : [])];
  return table(header, metrics.map((m) => {
    const bi = measure(m, b);
    const ai = measure(m, a);
    const change = pairedRatioDifference(columns(m, b), columns(m, a));
    const row = [m.label, show(m, bi), show(m, ai), showChange(m, change)];
    return withTargets ? [...row, m.target?.text ?? '', VERDICT_TEXT[verdict(m, ai)]] : row;
  }));
}

/** The two runs' tallies for the seeds both have, in the same order. */
export function matchSeeds(before: readonly GameTally[], after: readonly GameTally[]): [GameTally[], GameTally[]] {
  const afterBySeed = new Map(after.map((t) => [t.seed, t]));
  const b = before.filter((t) => afterBySeed.has(t.seed)).sort((x, y) => x.seed - y.seed);
  return [b, b.map((t) => afterBySeed.get(t.seed)!)];
}

/**
 * The exact chance that a Shot `shot` shooter scores against a Save `save` goalie the shooter has
 * shielded, with nobody answering (PLAN.md Phase a's example is Shot 5 vs Save 6).
 */
export function shieldExampleChance(config: GameConfig, shot = 5, save = 6): number {
  const goalie: GoalieCardDef = { id: 'example', team: '', kind: 'goalie', name: 'Example goalie', resonants: [], save };
  return unansweredShieldChance(shot, goalie, config);
}
