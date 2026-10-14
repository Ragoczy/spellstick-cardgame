// Builds pairs of Constructed decks for the pricing measurements (PLAN.md, Phase f):
//
// - Defense-heavy vs Striker-heavy at equal cost: both decks share 2 goalies and 8 middle players
//   (Playmakers and All-rounders). The other 14 are Stoppers and Anchors on one side and Strikers
//   and Runners on the other, with the deck totals within 1% of each other.
// - A cost gap: two random legal decks, one costing 10% (±1%) more than the other.
//
// Player costs don't exist yet (they come from the measurements), so the cost of a card is passed
// in. Both decks in a pair get the same spells. Everything is seeded, so a pair can be rebuilt.

import { playerPool, type CardSet, type FieldCardDef, type GoalieCardDef, type PlayerCardDef } from '../engine/cards';
import type { GameConfig } from '../engine/config';
import { seedToState, shuffle } from '../engine/rng';

export type CostOf = (card: PlayerCardDef) => number;

export interface RosterPair {
  /** Card ids for each deck, players then spells: ready for GameSetup.decks. */
  first: string[];
  second: string[];
  /** Total player cost of each deck. */
  firstCost: number;
  secondCost: number;
}

const ROLES_DEFENSIVE = ['stopper', 'anchor'];
const ROLES_ATTACKING = ['striker', 'runner'];
const ROLES_MIDDLE = ['playmaker', 'allrounder'];
/** Fresh shuffles to try before giving up on a pair. */
const ATTEMPTS = 50;

const total = (cards: readonly PlayerCardDef[], cost: CostOf) => cards.reduce((sum, c) => sum + cost(c), 0);

/**
 * Improves `chosen` one swap at a time: each step makes the single swap (a chosen card for an
 * unused card from `group`) that brings miss(total) down the most. Stops when no swap helps.
 * Returns the final miss.
 */
function tune(chosen: PlayerCardDef[], group: readonly PlayerCardDef[], cost: CostOf, miss: (total: number) => number): number {
  let sum = total(chosen, cost);
  for (;;) {
    const used = new Set(chosen.map((c) => c.id));
    let best = { miss: miss(sum), index: -1, card: null as PlayerCardDef | null };
    chosen.forEach((out, index) => {
      for (const card of group) {
        if (used.has(card.id)) continue;
        const m = miss(sum - cost(out) + cost(card));
        if (m < best.miss) best = { miss: m, index, card };
      }
    });
    if (best.index < 0) return best.miss;
    sum += cost(best.card!) - cost(chosen[best.index]!);
    chosen[best.index] = best.card!;
  }
}

function pool(cardSet: CardSet, config: GameConfig) {
  const players = playerPool(cardSet, config);
  const field = players.filter((c): c is FieldCardDef => c.kind === 'field');
  return {
    goalies: players.filter((c): c is GoalieCardDef => c.kind === 'goalie'),
    field,
    ofRoles: (roles: string[]) => field.filter((c) => roles.includes(c.role ?? '')),
  };
}

const ids = (cards: readonly PlayerCardDef[], spells: readonly string[]) => [...cards.map((c) => c.id), ...spells];

/**
 * Pairs of decks at equal cost: `first` is Defense-heavy (Stoppers and Anchors), `second` is
 * Striker-heavy (Strikers and Runners). Totals match within `tolerance` of their average.
 */
export function defenseVsStrikerPairs(
  cardSet: CardSet, config: GameConfig, cost: CostOf, spells: readonly string[], count: number, seed: number, tolerance = 0.01,
): RosterPair[] {
  const { goalies, ofRoles } = pool(cardSet, config);
  const middle = ofRoles(ROLES_MIDDLE);
  const defensive = ofRoles(ROLES_DEFENSIVE);
  const attacking = ofRoles(ROLES_ATTACKING);
  const middleCount = 8;
  const sideCount = config.deckFieldPlayers - middleCount;
  let rng = seedToState(seed);
  const pairs: RosterPair[] = [];
  for (let p = 0; p < count; p++) {
    let found: RosterPair | null = null;
    for (let attempt = 0; attempt < ATTEMPTS && !found; attempt++) {
      let g: GoalieCardDef[], m: FieldCardDef[], d: FieldCardDef[], a: FieldCardDef[];
      [g, rng] = shuffle(goalies, rng);
      [m, rng] = shuffle(middle, rng);
      [d, rng] = shuffle(defensive, rng);
      [a, rng] = shuffle(attacking, rng);
      const shared = [...g.slice(0, config.deckGoalies), ...m.slice(0, middleCount)];
      const def: PlayerCardDef[] = d.slice(0, sideCount);
      const att: PlayerCardDef[] = a.slice(0, sideCount);
      // Tune one side's total toward the other's, then the other way, until they match. Both
      // sides take turns because one group may be cheaper overall than the other.
      const sharedCost = total(shared, cost);
      const missAgainst = (other: PlayerCardDef[]) => {
        const y = sharedCost + total(other, cost);
        return (sum: number) => Math.abs(sharedCost + sum - y) / ((sharedCost + sum + y) / 2);
      };
      let miss = Infinity;
      for (let round = 0; round < 4 && miss > tolerance; round++) {
        miss = round % 2 === 0 ? tune(def, defensive, cost, missAgainst(att)) : tune(att, attacking, cost, missAgainst(def));
      }
      if (miss > tolerance) continue;
      const first = [...shared, ...def];
      const second = [...shared, ...att];
      found = { first: ids(first, spells), second: ids(second, spells), firstCost: total(first, cost), secondCost: total(second, cost) };
    }
    if (!found) throw new Error(`Couldn't build a Defense-vs-Striker pair within ${tolerance * 100}% after ${ATTEMPTS} tries.`);
    pairs.push(found);
  }
  return pairs;
}

/**
 * Pairs of random legal decks where `second` costs `gap` more than `first` (10% by default),
 * within `tolerance` (±1 percentage point).
 */
export function costGapPairs(
  cardSet: CardSet, config: GameConfig, cost: CostOf, spells: readonly string[], count: number, seed: number,
  gap = 0.1, tolerance = 0.01,
): RosterPair[] {
  const { goalies, field } = pool(cardSet, config);
  let rng = seedToState(seed);
  const deal = (): PlayerCardDef[] => {
    let g: GoalieCardDef[], f: FieldCardDef[];
    [g, rng] = shuffle(goalies, rng);
    [f, rng] = shuffle(field, rng);
    return [...g.slice(0, config.deckGoalies), ...f.slice(0, config.deckFieldPlayers)];
  };
  const pairs: RosterPair[] = [];
  for (let p = 0; p < count; p++) {
    let found: RosterPair | null = null;
    for (let attempt = 0; attempt < ATTEMPTS && !found; attempt++) {
      const first = deal();
      const second = deal();
      const firstCost = total(first, cost);
      const goalieCost = total(second.slice(0, config.deckGoalies), cost);
      // Only the field players are tuned; the goalies stay as dealt.
      const secondField = second.slice(config.deckGoalies);
      const miss = (sum: number) => Math.abs((goalieCost + sum) / firstCost - (1 + gap));
      if (tune(secondField, field, cost, miss) > tolerance) continue;
      const tuned = [...second.slice(0, config.deckGoalies), ...secondField];
      found = { first: ids(first, spells), second: ids(tuned, spells), firstCost, secondCost: total(tuned, cost) };
    }
    if (!found) throw new Error(`Couldn't build a ${gap * 100}% cost-gap pair after ${ATTEMPTS} tries.`);
    pairs.push(found);
  }
  return pairs;
}
