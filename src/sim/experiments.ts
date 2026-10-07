// What-if experiments: the same simulation with one change to the config or the card data.
// These never change the real game. They exist so tuning suggestions come with numbers.

import type { CardDef, CardSet } from '../engine/cards';
import { DEFAULT_CONFIG, type GameConfig, type InjuryDef } from '../engine/config';

export interface ExperimentDef {
  name: string;
  description: string;
  config?: Partial<GameConfig>;
  /** Returns a changed copy of the card set. */
  cards?: (cardSet: CardSet) => CardSet;
}

function mapCards(change: (card: CardDef) => CardDef) {
  return (cardSet: CardSet): CardSet => ({ ...cardSet, cards: cardSet.cards.map((card) => change({ ...card })) });
}

const goalieSave = (delta: number) => mapCards((card) => (card.kind === 'goalie' ? { ...card, save: card.save + delta } : card));

const hitStrength = (strength: number) =>
  mapCards((card) => (card.kind === 'spell' && card.ability.effect === 'hit' ? { ...card, ability: { effect: 'hit', params: { strength } } } as CardDef : card));

/** Each team's last hit card becomes a Neutral Boost (two hits per team instead of three). */
function twoHitsPerTeam(cardSet: CardSet): CardSet {
  const lastHit = new Map<string, string>();
  for (const card of cardSet.cards) if (card.kind === 'spell' && card.ability.effect === 'hit') lastHit.set(card.team, card.id);
  const replaced = new Set(lastHit.values());
  return {
    ...cardSet,
    cards: cardSet.cards.map((card) => replaced.has(card.id)
      ? { ...card, name: 'Neutral Boost', spellType: 'reaction', element: null, ability: { effect: 'boost', params: { amount: 2 } }, text: '+2 to your side in this contest.' } as CardDef
      : card),
  };
}

/** Every injury takes off 1 point instead of 2. */
const milderInjuries: InjuryDef[] = DEFAULT_CONFIG.injuries.map((injury) => ({
  ...injury,
  penalty: Object.fromEntries(Object.entries(injury.penalty).map(([stat, n]) => [stat, Math.min(1, n ?? 0)])),
}));


export const EXPERIMENTS: ExperimentDef[] = [
  {
    name: 'Hit strength 2',
    description: 'Hits have strength 2 instead of 3 (match 3, opposed 1).',
    cards: hitStrength(2),
  },
  {
    name: 'Two hits per team',
    description: "Each team's third hit becomes a Neutral Boost.",
    cards: twoHitsPerTeam,
  },
  {
    name: 'Milder injuries',
    description: 'Every injury takes off 1 point instead of 2 (Concussion stays −1 to all).',
    config: { injuries: milderInjuries },
  },
  {
    name: 'Goalies Save +1',
    description: 'Goalies at Save 4 and 3, so they resist hits (and shots) better.',
    cards: goalieSave(1),
  },
  {
    name: 'Two hits + milder injuries',
    description: 'Both changes together.',
    config: { injuries: milderInjuries },
    cards: twoHitsPerTeam,
  },
];
