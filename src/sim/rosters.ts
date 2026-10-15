// Builds pairs of Constructed decks for the pricing measurements (PLAN.md, Phase f):
//
// - Defense-heavy vs Striker-heavy at equal cost: each deck has 2 goalies, 8 middle players
//   (Playmakers and All-rounders), and 14 Stoppers and Anchors on one side or Strikers and Runners
//   on the other, with the deck totals within 1% of each other. Defenders cost less than attackers
//   (v0.17 prices stats by type), so the Defense-heavy team spends what it saves on better goalies
//   and middle players: the question is which build wins at the same total cost. (Sharing the
//   goalies, as first planned, can't reach equal cost: the dearest defenders and middle players
//   cost less than the cheapest attackers and middle players.)
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
 * Striker-heavy (Strikers and Runners). Each picks its own goalies and middle players. Totals
 * match within `tolerance` of their average.
 */
export function defenseVsStrikerPairs(
  cardSet: CardSet, config: GameConfig, cost: CostOf, spells: readonly string[], count: number, seed: number, tolerance = 0.01,
): RosterPair[] {
  const { goalies, ofRoles } = pool(cardSet, config);
  const middle = ofRoles(ROLES_MIDDLE);
  const middleCount = 8;
  const sideCount = config.deckFieldPlayers - middleCount;
  let rng = seedToState(seed);
  /** One deck in three parts (goalies, middle, its style), each with the pool it may swap from. */
  const deal = (style: readonly PlayerCardDef[]) => {
    let g: GoalieCardDef[], m: FieldCardDef[], d: PlayerCardDef[];
    [g, rng] = shuffle(goalies, rng);
    [m, rng] = shuffle(middle, rng);
    [d, rng] = shuffle(style, rng);
    return [
      { cards: g.slice(0, config.deckGoalies) as PlayerCardDef[], from: goalies as readonly PlayerCardDef[] },
      { cards: m.slice(0, middleCount) as PlayerCardDef[], from: middle as readonly PlayerCardDef[] },
      { cards: d.slice(0, sideCount), from: style },
    ];
  };
  const deckTotal = (deck: ReturnType<typeof deal>) => deck.reduce((sum, part) => sum + total(part.cards, cost), 0);
  const pairs: RosterPair[] = [];
  for (let p = 0; p < count; p++) {
    let found: RosterPair | null = null;
    for (let attempt = 0; attempt < ATTEMPTS && !found; attempt++) {
      const def = deal(ofRoles(ROLES_DEFENSIVE));
      const att = deal(ofRoles(ROLES_ATTACKING));
      // Tune one part at a time toward the other deck's total, taking turns between the decks
      // and their parts, until they match.
      const missOf = () => Math.abs(deckTotal(def) - deckTotal(att)) / ((deckTotal(def) + deckTotal(att)) / 2);
      for (let round = 0; round < 18 && missOf() > tolerance; round++) {
        const [deck, other] = round % 2 === 0 ? [def, att] : [att, def];
        const part = deck[Math.floor(round / 2) % deck.length]!;
        const rest = deckTotal(deck) - total(part.cards, cost);
        const target = deckTotal(other);
        tune(part.cards, part.from, cost, (sum) => Math.abs(rest + sum - target) / ((rest + sum + target) / 2));
      }
      if (missOf() > tolerance) continue;
      const first = def.flatMap((part) => part.cards);
      const second = att.flatMap((part) => part.cards);
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
