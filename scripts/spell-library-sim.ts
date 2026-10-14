// Checks every spell in the library in real computer-vs-computer games, and writes
// reports/spells-<date>.md.
//
//   npm run spell-library-sim                 (50 games per round)
//   npm run spell-library-sim -- --games 100
//
// The teams' own spell lists only use 32 of the library's spells, so this plays rounds where
// each team gets 16 spells picked at random from the library (a fresh shuffle each round, so
// decks mix all kinds of spell), until every spell has been in about 20 decks. Players are dealt from the pool as usual. For each spell it reports how often
// it was cast, with what affinity, and how often the team holding it won. Exits with an error if
// any game crashed, reached an impossible state, or hit the turn cap.

import { mkdirSync, writeFileSync } from 'node:fs';
import { heuristicAgent } from '../src/ai/heuristic';
import { runGame } from '../src/ai/runGame';
import { prototypeCards } from '../src/data/prototype';
import { LIBRARY_TEAM, type CardSet, type SpellCardDef } from '../src/engine/cards';
import { makeConfig } from '../src/engine/config';
import type { Affinity } from '../src/engine/state';
import { findProblems } from '../src/sim/invariants';
import { seedToState, shuffle } from '../src/engine/rng';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const gamesPerRound = Number(arg('games') ?? 25);
const config = makeConfig();
const library = prototypeCards.cards.filter((c): c is SpellCardDef => c.kind === 'spell' && c.team === LIBRARY_TEAM);
const perDeck = 16;
// Enough rounds that each spell is in about 20 decks.
const rounds = Math.ceil((library.length * 20) / (2 * perDeck));
let rng = seedToState(20261014);

interface SpellStats { decks: number; games: number; casts: number; wins: number; decided: number; by: Record<Affinity, number> }
const stats = new Map(library.map((s) => [s.id, { decks: 0, games: 0, casts: 0, wins: 0, decided: 0, by: { specialist: 0, match: 0, neutral: 0, opposed: 0 } } as SpellStats]));
const failures: string[] = [];
let played = 0;

for (let r = 0; r < rounds; r++) {
  let order: SpellCardDef[];
  [order, rng] = shuffle(library, rng);
  const spells = { A: order.slice(0, perDeck).map((s) => s.id), B: order.slice(perDeck, 2 * perDeck).map((s) => s.id) };
  const cardSet: CardSet = { ...prototypeCards, teams: prototypeCards.teams.map((t) => ({ ...t, spells: spells[t.id as 'A' | 'B'] })) };
  for (const side of ['A', 'B'] as const) for (const id of spells[side]) stats.get(id)!.decks += gamesPerRound;

  for (let g = 0; g < gamesPerRound; g++) {
    const seed = 7_000_000 + r * 1000 + g;
    try {
      const record = runGame({ seed, cardSet, config }, { A: heuristicAgent(seed * 2 + 1, config), B: heuristicAgent(seed * 2 + 2, config) }, {
        onStep: (state) => { for (const p of findProblems(state)) failures.push(`seed ${seed}: ${p}`); },
      });
      played += 1;
      if (record.final.result?.reason === 'turn_cap') failures.push(`seed ${seed}: turn cap`);
      const winner = record.final.result?.winner ?? null;
      for (const side of ['A', 'B'] as const) {
        for (const id of new Set(spells[side])) {
          const s = stats.get(id)!;
          s.games += 1;
          if (winner) { s.decided += 1; if (winner === side) s.wins += 1; }
        }
      }
      for (const e of record.events) {
        if (e.type !== 'spellCast' || e.card.def.kind !== 'spell') continue;
        const s = stats.get(e.card.def.id);
        if (!s) continue;
        s.casts += 1;
        s.by[e.affinity] += 1;
      }
    } catch (error) {
      failures.push(`seed ${seed}: ${(error as Error).message}`);
    }
  }
  process.stdout.write(`\rRound ${r + 1}/${rounds}`);
}
process.stdout.write('\n');

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '—');
const rows = library.map((spell) => {
  const s = stats.get(spell.id)!;
  // Cast rate per deck the spell was in: a deck holds it once per listed copy.
  return { spell, s, perGame: s.casts / Math.max(1, s.decks) };
});
const date = new Date().toISOString().slice(0, 10);
const out: string[] = [];
out.push(`# Spell library check, ${date}`, '');
out.push(`${played} computer games in ${rounds} rounds of ${gamesPerRound}. In each round both teams got 16 different spells picked at random from the ${library.length} in the library; players were dealt from the pool. Made by \`npm run spell-library-sim\`.`, '');
out.push(`Health: ${failures.length ? `❌ ${failures.length} problems (first: ${failures[0]})` : '✅ no crashes, impossible states, or turn caps'}.`, '');
const never = rows.filter((r) => r.s.casts === 0);
out.push(`Never cast: ${never.length ? never.map((r) => r.spell.name).join(', ') : 'none'}.`, '');
out.push('"Cast per game" is per game the spell was in a deck. "Specialist" and "Match" are shares of its casts. "Team won" is how often a team holding it won (decided games). Each spell was in about 20 random decks of 25 games, so the whole deck matters as much as the spell: read anything within about 8 points of 50% as luck.', '');
out.push('| Spell | Magic | Effect | Cast per game | Specialist | Match | Team won |');
out.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const { spell, s, perGame } of [...rows].sort((a, b) => b.perGame - a.perGame)) {
  const effect = spell.ability.effect === 'boost' && spell.ability.params.when ? `boost (${spell.ability.params.when})` : spell.ability.effect;
  out.push(`| ${spell.name} | ${spell.magic ?? 'neutral'} | ${effect} | ${perGame.toFixed(2)} | ${pct(s.by.specialist, s.casts)} | ${pct(s.by.match, s.casts)} | ${pct(s.wins, s.decided)} |`);
}
out.push('');
mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../reports/spells-${date}.md`, import.meta.url), out.join('\n'));
console.log(`Report written to reports/spells-${date}.md`);
if (failures.length) {
  console.error(failures.slice(0, 10).join('\n'));
  process.exit(1);
}
