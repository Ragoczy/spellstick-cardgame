// Gives named field players the v0.17 abilities (PLAN.md, Phase d), by their Resonants:
//
//   Heavy hands (hits_harder +1): Strength, Berserking, Force, Shattering, Earth, Explosion
//   Sturdy (hard_to_hurt 1):      Healing (any), Endurance, Stone, Ice
//   Quick but fragile:            Air (any), Speed, Agility, Danger-sense
//                                 (+2 Speed when evading, and Toughness 1 below their type)
//
// An Affinity fits if it is one of those, a specialization inside one, or the whole family one is
// in (a "Body" Affinity fits Strength). Up to 8 players get each ability, picked with a fixed seed
// from the field players whose Resonants fit and who have no ability yet; nobody gets two.
// Running it again gives the same result (it starts from each player's plain card).
//
//   npm run assign-abilities

import { readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { seedToState, shuffle } from '../src/engine/rng';

const SEED = 17;
const PER_ABILITY = 8;

interface Ability {
  key: string;
  affinities: string[];
  ability: Record<string, unknown>;
  text: string;
  toughness: number;
}

const ABILITIES: Ability[] = [
  {
    key: 'heavy',
    affinities: ['body.strength', 'body.berserking', 'force', 'force.shattering', 'earth', 'fire.explosion'],
    ability: { effect: 'hits_harder', params: { amount: 1 } },
    text: 'Heavy hands: anyone this player hurts rolls 1 higher for how badly.',
    toughness: 0,
  },
  {
    key: 'sturdy',
    affinities: ['healing', 'body.endurance', 'earth.stone', 'ice'],
    ability: { effect: 'hard_to_hurt', params: { amount: 1 } },
    text: "Sturdy: when hurt, this player rolls 1 lower for how badly.",
    toughness: 0,
  },
  {
    key: 'quick',
    affinities: ['air', 'body.speed', 'body.agility', 'divination.danger-sense'],
    ability: { effect: 'bonus', params: { stat: 'speed', amount: 2, when: 'evade' } },
    text: 'Quick but fragile: +2 Speed when dodging a tackle or physical attack. Toughness 1 lower.',
    toughness: -1,
  },
];

/** A Resonant's Affinity fits a listed one: the same, a specialization inside it, or the whole family it's in. */
function fits(affinity: string, listed: string): boolean {
  return affinity === listed || affinity.startsWith(`${listed}.`) || listed.startsWith(`${affinity}.`);
}

type Card = Record<string, unknown> & { id: string; team: string; kind: string; role?: string; resonants?: { affinity: string }[] };

const path = new URL('../data/cards.prototype.json', import.meta.url);
const cardSet = JSON.parse(readFileSync(path, 'utf8')) as { cards: Card[] };
const byRole = DEFAULT_CONFIG.toughnessByRole as Record<string, number>;

// Start from each field player's plain card: no v0.17 ability, Toughness from their type.
const v17Text = new Set(ABILITIES.map((a) => a.text));
for (const card of cardSet.cards) {
  if (card.team !== 'pool' || card.kind !== 'field') continue;
  if (v17Text.has(card.text as string)) {
    delete card.ability;
    delete card.text;
  }
  card.toughness = byRole[card.role ?? ''] ?? 4;
}

let rng = seedToState(SEED);
const taken = new Set<string>();
for (const a of ABILITIES) {
  const eligible = cardSet.cards.filter((c) => c.team === 'pool' && c.kind === 'field' && !c.ability && !taken.has(c.id) &&
    (c.resonants ?? []).some((r) => a.affinities.some((l) => fits(r.affinity, l))));
  let picked: Card[];
  [picked, rng] = shuffle(eligible, rng);
  picked = picked.slice(0, PER_ABILITY);
  for (const card of picked) {
    taken.add(card.id);
    card.ability = a.ability;
    card.text = a.text;
    card.toughness = (card.toughness as number) + a.toughness;
  }
  console.log(`${a.key}: ${picked.length} of ${eligible.length} eligible (${picked.map((c) => c.name).join(', ')})`);
}

// Keep each card's keys in a stable order: ability and text after toughness.
cardSet.cards = cardSet.cards.map((card) => {
  if (card.team !== 'pool' || card.kind !== 'field') return card;
  const { ability, text, ...rest } = card;
  return { ...rest, ...(ability ? { ability } : {}), ...(text ? { text } : {}) } as Card;
});
writeFileSync(path, `${JSON.stringify(cardSet, null, 2)}\n`);
