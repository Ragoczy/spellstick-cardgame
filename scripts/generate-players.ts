// Generates the named player cards and writes them into data/cards.prototype.json.
//
//   npm run generate-players              (refuses if named players already exist)
//   npm run generate-players -- --force   (replaces them: only before anyone owns these cards)
//
// What it makes (all from a fixed seed, so the output is reproducible):
// - 100 players, split evenly across the 7 types (runner, striker, playmaker, all-rounder,
//   anchor, stopper, goalie): about 14 of each.
// - Each player gets 1 to 4 extra skill points on top of their type's base stats: about 40 at +1,
//   30 at +2, 20 at +3, and 10 at +4, spread evenly across the types.
// - Points go mostly to the stats that type is known for (see src/data/playerTypes.ts), never above the
//   card limits (6 for field stats, 8 for Save).
// - Each player gets one given name (each used once) and one surname from data/names.json.
// - 1 to 3 Resonants, mostly 2 (the same mix as the prototype decks: 75% two, 20% one, 5% three).
//
// The players go in the shared pool (team "pool"), replacing the old placeholder players.
// Each game deals both sides their players from this pool.

import { readFileSync, writeFileSync } from 'node:fs';
import type { PlayerRole } from '../src/engine/cards';
import { randomInt, seedToState, shuffle } from '../src/engine/rng';
import { FIELD_STAT_MAX, FIELD_TYPES, GOALIE_BASE_SAVE, SAVE_MAX, type FieldStat } from '../src/data/playerTypes';

const SEED = 20261010;
const PLAYER_COUNT = 100;
/** How many cards get each bonus size, out of 100. */
const BONUS_MIX: Record<number, number> = { 1: 40, 2: 30, 3: 20, 4: 10 };
/** Order the types are dealt in: goalie last, so it's one of the types that gets 14. */
const ROLE_ORDER: PlayerRole[] = ['runner', 'striker', 'playmaker', 'allrounder', 'anchor', 'stopper', 'goalie'];

const RESONANTS = [
  { name: 'Anger', affinity: 'fire' },
  { name: 'Love', affinity: 'water' },
  { name: 'Pain', affinity: 'earth' },
  { name: 'Joy', affinity: 'air' },
];

const cardsPath = new URL('../data/cards.prototype.json', import.meta.url);
const namesPath = new URL('../data/names.json', import.meta.url);
const cardSet = JSON.parse(readFileSync(cardsPath, 'utf8'));
const names = JSON.parse(readFileSync(namesPath, 'utf8')) as { givenNames: string[]; surnames: string[]; compoundSurnames: [string, string][] };

const isNamed = (card: { team: string; kind: string }) => card.team === 'pool';
if (cardSet.cards.some(isNamed) && !process.argv.includes('--force')) {
  console.error('Named players already exist in data/cards.prototype.json. Use --force to replace them (only before anyone owns them).');
  process.exit(1);
}

let rng = seedToState(SEED);
const roll = (max: number): number => {
  let value: number;
  [value, rng] = randomInt(rng, max);
  return value;
};
const pickWeighted = <K extends string>(weights: Partial<Record<K, number>>): K => {
  const entries = Object.entries(weights) as [K, number][];
  let r = roll(entries.reduce((sum, [, w]) => sum + w, 0));
  for (const [key, w] of entries) {
    if (r < w) return key;
    r -= w;
  }
  return entries[entries.length - 1]![0];
};

// Types and bonuses: deal the sorted bonus list around the types, so each type gets a similar mix.
const bonuses = Object.entries(BONUS_MIX).flatMap(([size, count]) => Array<number>(count).fill(Number(size)));
if (bonuses.length !== PLAYER_COUNT) throw new Error('BONUS_MIX must add up to PLAYER_COUNT');
const slots = bonuses.map((bonus, i) => ({ role: ROLE_ORDER[i % ROLE_ORDER.length]!, bonus }));

// Names: each given name once, surnames spread as evenly as they go (each used two or three times).
const allSurnames = [...names.surnames, ...names.compoundSurnames.map(([a, b]) => `${a}-${b}`)];
let givenNames: string[];
[givenNames, rng] = shuffle(names.givenNames, rng);
let surnames: string[];
[surnames, rng] = shuffle(Array.from({ length: PLAYER_COUNT }, (_, i) => allSurnames[i % allSurnames.length]!), rng);
if (givenNames.length < PLAYER_COUNT) throw new Error(`Need ${PLAYER_COUNT} given names, found ${givenNames.length}`);

function resonants(): { name: string; affinity: string }[] {
  const r = roll(100);
  const count = r < 20 ? 1 : r < 95 ? 2 : 3;
  let order: typeof RESONANTS;
  [order, rng] = shuffle(RESONANTS, rng);
  return order.slice(0, count);
}

// Sort by type so the file reads in groups; ids follow that order.
const byRole = [...slots].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || b.bonus - a.bonus);
const players = byRole.map((slot, i) => {
  const id = `pl-${String(i + 1).padStart(3, '0')}`;
  const name = `${givenNames[i]} ${surnames[i]}`;
  if (slot.role === 'goalie') {
    const save = Math.min(SAVE_MAX, GOALIE_BASE_SAVE + slot.bonus);
    return { id, team: 'pool', kind: 'goalie', role: 'goalie', name, bonusPoints: slot.bonus, resonants: resonants(), save };
  }
  const role = FIELD_TYPES[slot.role];
  const stats = { ...role.base };
  for (let p = 0; p < slot.bonus; p++) {
    const open = Object.fromEntries(Object.entries(role.weights).filter(([stat]) => stats[stat as FieldStat] < FIELD_STAT_MAX)) as Partial<Record<FieldStat, number>>;
    stats[pickWeighted(open)] += 1;
  }
  return { id, team: 'pool', kind: 'field', role: slot.role, name, bonusPoints: slot.bonus, resonants: resonants(), ...stats };
});

// Replace the old placeholder players (team players and goalies) and any earlier named players.
// Spells and promo cards stay.
const kept = cardSet.cards.filter((card: { kind: string; team: string; promo?: boolean }) => card.kind === 'spell' || card.promo);
cardSet.cards = [...players, ...kept];
writeFileSync(cardsPath, `${JSON.stringify(cardSet, null, 2)}\n`);

const counts = Object.fromEntries(ROLE_ORDER.map((r) => [r, players.filter((p) => p.role === r).length]));
console.log(`Wrote ${players.length} players to data/cards.prototype.json`, counts);
