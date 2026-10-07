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
    name: 'No dice',
    description: 'No roll tokens (the rules before v0.6).',
    config: { diceBudget: 0 },
  },
  {
    name: '3 rolls each',
    description: 'Each player has 3 roll tokens instead of 5.',
    config: { diceBudget: 3 },
  },
  {
    name: '8 rolls each',
    description: 'Each player has 8 roll tokens instead of 5.',
    config: { diceBudget: 8 },
  },
  {
    name: 'Roll for yourself',
    description: 'A spent roll adds a die to your side only (the other player may answer with their own token).',
    config: { diceMode: 'self' },
  },
  {
    name: 'd6 every contest',
    description: 'No tokens; both players roll a d6 in every contest.',
    config: { diceBudget: 0, contestDie: 6 },
  },
];
