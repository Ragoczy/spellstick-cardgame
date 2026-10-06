// Plays one game between two random players and prints what happened in plain language,
// then replays it from the seed and action list to show it comes out the same.
//
// Usage: npm run demo -- --seed 7 --lanes 2

import { randomAgent } from '../src/ai/random';
import { runGame } from '../src/ai/runGame';
import { prototypeCards } from '../src/data/prototype';
import { replay } from '../src/engine/replay';
import { describeEvent } from '../src/text/describe';

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

const seed = arg('seed', 1);
const lanes = arg('lanes', 2);
const setup = { seed, cardSet: prototypeCards, config: { lanes } };
const names = { A: 'Team A', B: 'Team B' };

const record = runGame(setup, { A: randomAgent(seed * 2), B: randomAgent(seed * 2 + 1) });

console.log(`Spellstick demo — seed ${seed}, ${lanes} lanes, two random players\n`);
for (const event of record.events) {
  const line = describeEvent(event, names);
  if (line) console.log(line);
}

const again = replay(setup, record.actions);
const same = JSON.stringify(again.state) === JSON.stringify(record.final);
console.log(`\n${record.actions.length} actions, ${record.final.turn} turns.`);
console.log(`Replayed from seed ${seed} and the action list: ${same ? 'identical game' : 'MISMATCH (bug)'}.`);
