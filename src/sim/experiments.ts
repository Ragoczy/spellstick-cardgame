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

const weakerGoalies = mapCards((card) => (card.kind === 'goalie' ? { ...card, save: card.save - 1 } : card));
const defenseCappedAt5 = mapCards((card) => (card.kind === 'field' && card.defense > 5 ? { ...card, defense: 5 } : card));

export const EXPERIMENTS: ExperimentDef[] = [
  {
    name: 'Win at 2 goals',
    description: 'First to 2 goals wins instead of 3.',
    config: { goalsToWin: 2 },
  },
  {
    name: 'Goalies Save −1',
    description: 'Goalie cards have Save 4 and 3 instead of 5 and 4.',
    cards: weakerGoalies,
  },
  {
    name: 'Defense max 5',
    description: 'No field player has Defense above 5 (the Defense 6 stoppers become 5).',
    cards: defenseCappedAt5,
  },
  {
    name: 'Tied passes caught',
    description: 'A tied pass goes to the receiver instead of the interceptor.',
    config: { passTiesGoTo: 'attacker' },
  },
  {
    name: 'Safe catch (forwards)',
    description: "A forward who catches a pass can't be tackled until their team's next turn, so they always get a chance to shoot.",
    config: { protectCatch: 'forward' },
  },
  {
    name: 'Safe catch + Save −1',
    description: 'Safe catch for forwards, and goalies have Save 4 and 3.',
    config: { protectCatch: 'forward' },
    cards: weakerGoalies,
  },
  {
    name: 'Two actions per turn',
    description: 'Each turn you take 2 actions instead of 1 (for example, pass and then shoot). A goal ends your turn.',
    config: { actionsPerTurn: 2 },
  },
  {
    name: 'Two actions + Save −1',
    description: 'Two actions per turn, and goalies have Save 4 and 3.',
    config: { actionsPerTurn: 2 },
    cards: weakerGoalies,
  },
  {
    name: 'Safe catch + Save −1 + 2 goals',
    description: 'All three together: safe catch for forwards, goalies Save 4 and 3, first to 2 goals.',
    config: { protectCatch: 'forward', goalsToWin: 2 },
    cards: weakerGoalies,
  },
];
