// Compares two versions of the rules or cards on exactly the same games, split across CPU cores,
// and writes a Markdown report of every v0.17 target with 95% intervals (PLAN.md, Phase 0).
//
//   npm run sim-compare -- --games 10000                              (one run: a baseline report)
//   npm run sim-compare -- --games 5000 --set shieldEffect=half        (current rules vs the change)
//   npm run sim-compare -- --base-set setupSpells=3 --set setupSpells=3 --set shieldEffect=half
//   npm run sim-compare -- --cards data/my-cards.json                  (current cards vs these)
//   npm run sim-compare -- --base-cards data/old.json --cards data/new.json
//   npm run sim-compare -- --lanes 3 --seed 2 --name "Shield half" --out reports/my-report.md
//   npm run sim-compare -- --workers 8                                (fewer processes, if memory is short)
//
// "Before" is the current rules and cards plus any --base-set and --base-cards. "After" is the
// same plus --set and --cards. Both play the same seeds, so the deals and the first player match
// and every change is measured game by game. With no --set or --cards there's only one run.
//
// Exits with an error if any game crashed, reached an impossible state, or hit the turn cap.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { prototypeCards } from '../src/data/prototype';
import { loadCardSet, type CardSet } from '../src/engine/cards';
import { makeConfig, type GameConfig } from '../src/engine/config';
import { arg, args, configOverrides } from '../src/sim/configArgs';
import { gameSeeds, simulate } from '../src/sim/simulate';
import type { GameTally } from '../src/sim/stats';
import { comparisonTable, matchSeeds, OTHER_MEASURES, shieldExampleChance, singleRunTable, TARGETS } from '../src/sim/targets';

const cardsFrom = (path: string | undefined): CardSet => (path ? loadCardSet(JSON.parse(readFileSync(path, 'utf8'))) : prototypeCards);

const games = Number(arg('games') ?? 5000);
const seedBlock = Number(arg('seed') ?? 1);
const lanes = Number(arg('lanes') ?? 2);
const baseSet = configOverrides(args('base-set'));
const afterSet = configOverrides(args('set'));
const variants = [{ name: 'Before', config: makeConfig({ lanes, ...baseSet }), cardsPath: arg('base-cards') }];
const comparing = args('set').length > 0 || arg('cards') !== undefined;
if (comparing) {
  variants.push({ name: arg('name') ?? 'After', config: makeConfig({ lanes, ...baseSet, ...afterSet }), cardsPath: arg('cards') ?? arg('base-cards') });
}
const tmp = new URL('../reports/.sim-compare/', import.meta.url);

interface Shard {
  /** One list of tallies per variant, in variant order. */
  tallies: GameTally[][];
  failures: string[];
}

// ---- Worker: play every n-th seed for each variant and write the tallies to a file ----

const worker = arg('worker');
if (worker !== undefined) {
  const [index, count] = worker.split('/').map(Number) as [number, number];
  const seeds = gameSeeds(seedBlock, games).filter((_, i) => i % count === index);
  const shard: Shard = { tallies: [], failures: [] };
  for (const v of variants) {
    const result = simulate({ games: seeds.length, seed: seedBlock, seeds, config: v.config, cardSet: cardsFrom(v.cardsPath) });
    shard.tallies.push(result.stats.tallies);
    shard.failures.push(...[...result.crashes, ...result.problems, ...result.capped].map((f) => `${v.name}: ${f}`));
  }
  writeFileSync(new URL(`shard-${index}.json`, tmp), JSON.stringify(shard));
  process.exit(0);
}

// ---- Coordinator: run the workers in parallel, then write the report ----

const started = Date.now();
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const workers = Math.max(1, Math.min(Number(arg('workers') ?? availableParallelism() - 2), 20, games));
console.log(`Playing ${games} games${comparing ? ' twice (before and after)' : ''} on ${workers} workers...`);
await Promise.all(Array.from({ length: workers }, (_, i) => new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1), '--worker', `${i}/${workers}`], { stdio: 'inherit' });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} failed`))));
})));
const shards = Array.from({ length: workers }, (_, i) => JSON.parse(readFileSync(new URL(`shard-${i}.json`, tmp), 'utf8')) as Shard);
rmSync(tmp, { recursive: true, force: true });
const tallies = variants.map((_, v) => shards.flatMap((s) => s.tallies[v]!));
const failures = shards.flatMap((s) => s.failures);
const seconds = (Date.now() - started) / 1000;

// ---- The report ----

const date = new Date().toISOString().slice(0, 10);
const describeSet = (set: Partial<GameConfig>) => Object.entries(set).map(([k, v]) => `\`${k}=${String(v)}\``).join(', ') || 'none';
const pct = (n: number) => `${(100 * n).toFixed(1)}%`;
const out: string[] = [];
out.push(`# ${comparing ? `Comparison: ${variants[1]!.name}` : 'Simulation baseline'}, ${date}`, '');
out.push(`Made by \`npm run sim-compare\`: ${games} computer-vs-computer games per run (seed block ${seedBlock}), ${lanes} lanes, card set ${cardsFrom(variants[0]!.cardsPath).version}. Took ${seconds.toFixed(0)} s on ${workers} workers.`, '');
out.push(`- Before: config changes ${describeSet(baseSet)}; cards ${variants[0]!.cardsPath ?? 'data/cards.prototype.json'}.`);
if (comparing) out.push(`- After (${variants[1]!.name}): config changes ${describeSet({ ...baseSet, ...afterSet })}; cards ${variants[1]!.cardsPath ?? 'data/cards.prototype.json'}.`);
out.push('');
out.push('Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. ' +
  (comparing ? 'Both runs play the same seeds (the same deals and first player), and each change is measured seed by seed, so a small real change still shows. ' : '') +
  'A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.', '');

out.push('## Health', '');
out.push(failures.length
  ? `**${failures.length} problems** (crashes, impossible states, or games that hit the turn cap). First: ${failures[0]}`
  : 'No crashes, no impossible states, and no game hit the turn cap.', '');

out.push('## Targets', '');
out.push(comparing ? comparisonTable(TARGETS, tallies[0]!, tallies[1]!) : singleRunTable(TARGETS, tallies[0]!), '');
const example = variants.map((v) => `${v.name.toLowerCase()} ${pct(shieldExampleChance(v.config))}`).join(', ');
out.push(`Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: ${example} (target: under 75%).`, '');

out.push('## Other measures', '');
out.push(comparing ? comparisonTable(OTHER_MEASURES, tallies[0]!, tallies[1]!) : singleRunTable(OTHER_MEASURES, tallies[0]!), '');
if (comparing) {
  const [b] = matchSeeds(tallies[0]!, tallies[1]!);
  if (b.length < games) out.push(`${games - b.length} seeds crashed in one of the runs and are left out of both.`, '');
}

mkdirSync('reports', { recursive: true });
const suffix = lanes === 2 ? '' : `-${lanes}lanes`;
const path = arg('out') ?? `reports/compare-${date}${comparing ? `-${(arg('name') ?? 'after').toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '-baseline'}${suffix}.md`;
writeFileSync(path, `${out.join('\n')}\n`);
console.log(`\n${comparing ? comparisonTable(TARGETS, tallies[0]!, tallies[1]!) : singleRunTable(TARGETS, tallies[0]!)}\n`);
console.log(`Report written to ${path} (${seconds.toFixed(0)} s)`);

if (failures.length) {
  console.error(`${failures.length} problems found, for example: ${failures[0]}`);
  process.exit(1);
}
