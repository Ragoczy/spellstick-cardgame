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

/** Both goalies on each team get the same Save. */
const goaliesAt = (save: number) => mapCards((card) => (card.kind === 'goalie' ? { ...card, save } : card));

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
    name: 'Goalies Save 5',
    description: 'Weaker goalies: more shots score.',
    cards: goaliesAt(5),
  },
  {
    name: 'Goalies Save 7',
    description: 'Tougher goalies (penalties +4 to keep shootouts short).',
    config: { penaltyBonus: 4 },
    cards: goaliesAt(7),
  },
  {
    name: 'Pass bonus +1',
    description: 'The receiver adds 1 to their Speed in every pass instead of 2.',
    config: { passBonus: 1 },
  },
  {
    name: 'Regroup 2 cards',
    description: 'Regroup swaps up to 2 cards (the rule before v0.7): shorter games.',
    config: { regroupMax: 2 },
  },
  {
    name: 'No Regroup',
    description: 'Regroup only skips the action: longer games, more shots.',
    config: { regroupMax: 0 },
  },
];
