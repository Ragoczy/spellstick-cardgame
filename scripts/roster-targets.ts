// Checks the player costs with built teams (PLAN.md, Phase f, "Roster targets").
//
//   npm run roster-targets                       (20 pairs × 250 seeds × 2 sides, per target)
//   npm run roster-targets -- --pairs 10 --seeds 100 --workers 8
//
// - Defense-heavy vs Striker-heavy at equal cost (within 1%): should score 45–55%.
// - A 10% cost gap (±1%): the dearer team should score 55–65%.
// Both teams in a pair use Team A's 16 spells, and each seed is played with the teams both ways
// round. Writes reports/roster-targets-<date>.md.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { heuristicAgent } from '../src/ai/heuristic';
import { runGame } from '../src/ai/runGame';
import { prototypeCards } from '../src/data/prototype';
import type { PlayerCardDef } from '../src/engine/cards';
import { makeConfig } from '../src/engine/config';
import { meanInterval } from '../src/sim/confidence';
import { arg } from '../src/sim/configArgs';
import { costGapPairs, defenseVsStrikerPairs, type RosterPair } from '../src/sim/rosters';

// No team cap: these teams test the costs, and a 10% dearer team is over it on purpose.
const config = makeConfig({ rosterCap: 0 });
const pairCount = Number(arg('pairs') ?? 20);
const seedCount = Number(arg('seeds') ?? 250);
const tmp = new URL('../reports/.roster-targets/', import.meta.url);
const spells = prototypeCards.teams.find((t) => t.id === 'A')!.spells!;
const cost = (card: PlayerCardDef) => card.cost ?? 0;

const TARGETS = [
  { key: 'style', label: 'Defense-heavy vs Striker-heavy, equal cost', who: 'Defense-heavy team', low: 45, high: 55, pairs: defenseVsStrikerPairs(prototypeCards, config, cost, spells, pairCount, 101) },
  { key: 'gap', label: '10% cost gap', who: 'Dearer team', low: 55, high: 65, pairs: costGapPairs(prototypeCards, config, cost, spells, pairCount, 202) },
];

/** The `second` team's points (A win is 1, a draw ½) over one seed played both ways round. */
function playSeed(pair: RosterPair, seed: number): number {
  let points = 0;
  for (const secondSide of ['A', 'B'] as const) {
    const decks = secondSide === 'A' ? { A: pair.second, B: pair.first } : { A: pair.first, B: pair.second };
    const record = runGame({ seed, cardSet: prototypeCards, config, decks }, { A: heuristicAgent(seed * 2 + 1, config), B: heuristicAgent(seed * 2 + 2, config) });
    const winner = record.final.result?.winner ?? null;
    points += winner === secondSide ? 1 : winner === null ? 0.5 : 0;
  }
  return points / 2;
}

/** Every game to play, as [target, pair, seed]. */
const jobs = TARGETS.flatMap((_, t) => Array.from({ length: pairCount * seedCount }, (_, i) => [t, Math.floor(i / seedCount), 9_000_000 + i] as const));

const worker = arg('worker');
if (worker !== undefined) {
  const [index, count] = worker.split('/').map(Number) as [number, number];
  const out = jobs.filter((_, i) => i % count === index).map(([t, p, seed]) => [t, playSeed(TARGETS[t]!.pairs[p]!, seed)]);
  writeFileSync(new URL(`shard-${index}.json`, tmp), JSON.stringify(out));
  process.exit(0);
}

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const workers = Math.max(1, Math.min(Number(arg('workers') ?? availableParallelism() - 2), 20));
console.log(`Playing ${jobs.length * 2} games on ${workers} workers...`);
await Promise.all(Array.from({ length: workers }, (_, i) => new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1), '--worker', `${i}/${workers}`], { stdio: 'inherit' });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} failed`))));
})));
const results = Array.from({ length: workers }, (_, i) => JSON.parse(readFileSync(new URL(`shard-${i}.json`, tmp), 'utf8')) as [number, number][]).flat();
rmSync(tmp, { recursive: true, force: true });

const date = new Date().toISOString().slice(0, 10);
const out: string[] = [`# Roster targets, ${date}`, ''];
out.push(`Made by \`npm run roster-targets\` (PLAN.md, Phase f). ${pairCount} team pairs per target, each played on ${seedCount} seeds with the teams both ways round (${2 * pairCount * seedCount} games per target). Both teams use Team A's 16 spells. Scores count a win as 1 and a draw as ½, with a 95% interval. The team cap is off for these games, so the dearer teams can go over it.`, '');
out.push('| Target | Team | Score (95% interval) | Wanted | Average costs |', '| --- | --- | --- | --- | --- |');
TARGETS.forEach((target, t) => {
  const iv = meanInterval(results.filter(([i]) => i === t).map(([, v]) => v));
  // style pairs: `second` is the Striker-heavy team, so the Defense-heavy score is 1 − it.
  const flip = target.key === 'style';
  const [value, low, high] = flip ? [1 - iv.value, 1 - iv.high, 1 - iv.low] : [iv.value, iv.low, iv.high];
  const ok = 100 * value >= target.low && 100 * value <= target.high;
  const avg = (f: (p: RosterPair) => number) => (target.pairs.reduce((s, p) => s + f(p), 0) / target.pairs.length).toFixed(1);
  const costs = flip ? `${avg((p) => p.firstCost)} vs ${avg((p) => p.secondCost)}` : `${avg((p) => p.secondCost)} vs ${avg((p) => p.firstCost)}`;
  out.push(`| ${target.label} | ${target.who} | ${(100 * value).toFixed(1)}% (${(100 * low).toFixed(1)} to ${(100 * high).toFixed(1)})${ok ? '' : ' ✗'} | ${target.low}–${target.high}% | ${costs} |`);
});
const path = `reports/roster-targets-${date}.md`;
writeFileSync(path, `${out.join('\n')}\n`);
console.log(out.join('\n'));
console.log(`Report written to ${path}`);
