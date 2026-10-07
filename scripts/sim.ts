// Runs computer-vs-computer games and writes a balance report to reports/sim-<date>.md.
//
// Usage:
//   npm run sim -- --games 1000 --seed 1
//   npm run sim -- --lanes 3
//   npm run sim -- --set goalsToWin=2          (try a different config value, without changing the game)
//   npm run sim -- --experiments               (also run the what-if experiments in src/sim/experiments.ts)
//   npm run sim -- --experiment-games 300      (games per experiment; default: same as --games)
//   npm run sim -- --cards data/cards.balanced.json   (use a different card file)
//
// Exits with an error if any game crashed, reached an impossible state, or hit the turn cap.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { makeConfig, type GameConfig } from '../src/engine/config';
import { prototypeCards } from '../src/data/prototype';
import { loadCardSet } from '../src/engine/cards';
import { EXPERIMENTS } from '../src/sim/experiments';
import { buildReport, type Experiment } from '../src/sim/report';
import { simulate, type SimResult } from '../src/sim/simulate';
import { suggestTuning } from '../src/sim/suggest';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function configOverrides(): Partial<GameConfig> {
  const overrides: Record<string, number> = {};
  process.argv.forEach((value, i) => {
    if (value !== '--set') return;
    const [key, raw] = (process.argv[i + 1] ?? '').split('=');
    if (!key || raw === undefined || Number.isNaN(Number(raw))) throw new Error(`Bad --set "${process.argv[i + 1]}". Use --set name=number.`);
    overrides[key] = Number(raw);
  });
  return overrides;
}

function progress(label: string, total: number) {
  return (done: number) => {
    if (done % 100 === 0 || done === total) process.stdout.write(`\r${label}: ${done}/${total} games`);
    if (done === total) process.stdout.write('\n');
  };
}

const cardsPath = arg('cards');
const cardSet = cardsPath ? loadCardSet(JSON.parse(readFileSync(cardsPath, 'utf8'))) : prototypeCards;
const games = Number(arg('games') ?? 1000);
const seed = Number(arg('seed') ?? 1);
const config = makeConfig({ ...configOverrides(), lanes: Number(arg('lanes') ?? configOverrides().lanes ?? 2) });
const runExperiments = process.argv.includes('--experiments');
const experimentGames = Number(arg('experiment-games') ?? games);

const baseline = simulate({ games, seed, config, cardSet, onProgress: progress('Current rules', games) });

const experiments: Experiment[] = [];
if (runExperiments) {
  for (const e of EXPERIMENTS) {
    const result: SimResult = simulate({
      games: experimentGames,
      seed,
      config: makeConfig({ ...config, ...e.config }),
      cardSet: e.cards ? e.cards(cardSet) : cardSet,
      onProgress: progress(e.name, experimentGames),
    });
    experiments.push({ name: e.name, description: e.description, result });
  }
}

const date = new Date().toISOString().slice(0, 10);
const report = buildReport({
  date,
  seed,
  config,
  cardSetVersion: cardSet.version,
  baseline,
  experiments,
  suggestions: suggestTuning(baseline, experiments),
});

mkdirSync('reports', { recursive: true });
const suffix = config.lanes === 2 ? '' : `-${config.lanes}lanes`;
const path = arg('out') ?? `reports/sim-${date}${suffix}.md`;
writeFileSync(path, report);
console.log(`Report written to ${path}`);

const failures = [...baseline.crashes, ...baseline.problems, ...baseline.capped];
for (const e of experiments) failures.push(...e.result.crashes, ...e.result.problems, ...e.result.capped);
if (failures.length) {
  console.error(`${failures.length} problems found, for example: ${failures[0]}`);
  process.exit(1);
}
