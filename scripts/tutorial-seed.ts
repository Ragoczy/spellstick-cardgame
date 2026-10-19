// Finds a tutorial's seed (docs/tutorial-design.md, "Choosing the seed").
//
// Plays a tutorial scenario for many seeds with the person's side always taking the coach's
// suggestion, keeps the seeds that give a good game, and prints the best few. Then, for the same
// seeds, how often the person wins when they ignore the coach (the normal computer player, and
// random legal moves). Put the chosen seed in the scenario's file in data/.
//
//   npx tsx scripts/tutorial-seed.ts [seeds=2000] [basics|contact]

import { heuristicAgent } from '../src/ai/heuristic';
import { randomAgent } from '../src/ai/random';
import { prototypeCards } from '../src/data/prototype';
import { playTutorial, seedProblems, seedScore, type TutorialResult } from '../src/tutorial/play';
import { scenarioById, tutorialConfig, tutorialProblems } from '../src/tutorial/scenario';

const count = Number(process.argv[2] ?? 2000);
const scenario = scenarioById(process.argv[3] ?? 'basics');
const problems = tutorialProblems(prototypeCards, scenario);
if (problems.length) {
  console.error('The scenario has problems:\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`Scenario: ${scenario.id}`);

const good: TutorialResult[] = [];
let wins = 0;
const why = new Map<string, number>();
for (let seed = 1; seed <= count; seed++) {
  const r = playTutorial(prototypeCards, seed, undefined, scenario);
  if (r.won) wins++;
  const p = seedProblems(r, scenario);
  for (const reason of p) why.set(reason, (why.get(reason) ?? 0) + 1);
  if (!p.length) good.push(r);
}

const pct = (n: number, of = count) => `${((100 * n) / of).toFixed(1)}%`;
console.log(`Following the coach: won ${pct(wins)} of ${count} games.`);
console.log(`Good seeds: ${good.length}. Why the others weren't:`);
for (const [reason, n] of [...why].sort((a, b) => b[1] - a[1])) console.log(`  ${reason}: ${n}`);

good.sort((a, b) => seedScore(b, scenario) - seedScore(a, scenario));
console.log('\nBest seeds:');
for (const r of good.slice(0, 10)) {
  const extra = scenario.lessons === 'contact' ? `, penalty ${r.penalty ? 'yes' : 'no'}` : `, tackle ${r.tackled ? 'yes' : 'no'}`;
  console.log(`  seed ${r.seed}: ${r.score.A}-${r.score.B} in ${r.turns} turns, first goal turn ${r.firstGoalTurn}, taught ${r.taught}${extra}, score ${seedScore(r, scenario).toFixed(1)}`);
}

// Ignoring the coach.
const config = tutorialConfig(scenario);
let heuristicWins = 0;
let randomWins = 0;
const sample = Math.min(count, 1000);
for (let seed = 1; seed <= sample; seed++) {
  if (playTutorial(prototypeCards, seed, heuristicAgent(seed + 2, config), scenario).won) heuristicWins++;
  if (playTutorial(prototypeCards, seed, randomAgent(seed + 3), scenario).won) randomWins++;
}
console.log(`\nIgnoring the coach (${sample} games each): the computer's own judgement won ${pct(heuristicWins, sample)}, random moves won ${pct(randomWins, sample)}.`);
console.log(`Current seed: ${scenario.seed}.`);
