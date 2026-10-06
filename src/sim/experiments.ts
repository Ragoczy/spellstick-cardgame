// What-if experiments: the same simulation with one change to the config or the card data.
// These never change the real game. They exist so tuning suggestions come with numbers.

import type { CardDef, CardSet } from '../engine/cards';
import type { GameConfig } from '../engine/config';

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
const defenseCappedAt5 = mapCards((card) => (card.kind === 'field' && card.defense > 5 ? { ...card, defense: 5 } : card));

export const EXPERIMENTS: ExperimentDef[] = [
  {
    name: 'One action per turn',
    description: 'Back to one action per turn (the rules before v0.4).',
    config: { actionsPerTurn: 1 },
  },
  {
    name: 'Goalies Save +1',
    description: 'Goalies at Save 4 and 3.',
    cards: goalieSave(1),
  },
  {
    name: 'Goalies Save +2',
    description: 'Goalies back to Save 5 and 4 (before v0.4).',
    cards: goalieSave(2),
  },
  {
    name: 'Defense max 5',
    description: 'No field player has Defense above 5 (the Defense 6 stoppers become 5).',
    cards: defenseCappedAt5,
  },
  {
    name: 'Safe catch (forwards)',
    description: "A forward who catches a pass can't be tackled until their team's next turn.",
    config: { protectCatch: 'forward' },
  },
  {
    name: 'Penalty +1',
    description: 'Penalty shooters get +1 Shot.',
    config: { penaltyBonus: 1 },
  },
  {
    name: 'Penalty +2',
    description: 'Penalty shooters get +2 Shot.',
    config: { penaltyBonus: 2 },
  },
  {
    name: 'Tied passes intercepted',
    description: 'A tied pass goes to the interceptor (before v0.4).',
    config: { passTiesGoTo: 'defender' },
  },
];
