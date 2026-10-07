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
    name: 'Pass bonus +2',
    description: 'The receiver adds 2 to their Speed in every pass.',
    config: { passBonus: 2 },
  },
  {
    name: 'Rolled shots, Save 6',
    description: 'Pass bonus +2. Every shot and penalty is rolled (shooter and goalie each roll a die). Goalies Save 6.',
    config: { passBonus: 2, shotDie: 6 },
    cards: goaliesAt(6),
  },
  {
    name: 'Rolled shots, Save 6, penalties +3',
    description: 'As above, and penalty shots get +3.',
    config: { passBonus: 2, shotDie: 6, penaltyBonus: 3 },
    cards: goaliesAt(6),
  },
  {
    name: 'Hockey package',
    description: 'As above, and Regroup swaps at most 1 card (games run longer, more shots).',
    config: { passBonus: 2, shotDie: 6, penaltyBonus: 3, regroupMax: 1 },
    cards: goaliesAt(6),
  },
  {
    name: 'Hockey package, Save 7',
    description: 'The hockey package with tougher goalies (Save 7) and penalties +4.',
    config: { passBonus: 2, shotDie: 6, penaltyBonus: 4, regroupMax: 1 },
    cards: goaliesAt(7),
  },
  {
    name: 'Hockey package, no Regroup',
    description: 'The hockey package, but Regroup only skips the action (no card swaps): longer games.',
    config: { passBonus: 2, shotDie: 6, penaltyBonus: 3, regroupMax: 0 },
    cards: goaliesAt(6),
  },
];
