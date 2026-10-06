// Plays a whole game between two agents. Each agent only sees its own view.

import type { Action } from '../engine/actions';
import type { GameEvent } from '../engine/events';
import type { Side } from '../engine/field';
import { legalActions } from '../engine/legal';
import { applyAction } from '../engine/reducer';
import { createGame, type GameSetup } from '../engine/setup';
import type { GameState } from '../engine/state';
import { viewFor } from '../engine/view';
import type { Agent } from './agent';

export interface GameRecord {
  setup: GameSetup;
  actions: Action[];
  events: GameEvent[];
  final: GameState;
}

export interface RunOptions {
  /** Called once with the new game, before anyone acts. */
  onStart?: (state: GameState, events: GameEvent[]) => void;
  /** Called after every action, e.g. to check invariants in tests. */
  onStep?: (state: GameState, action: Action, events: GameEvent[]) => void;
  /** Stops a runaway game. Well above the engine's own turn cap. */
  maxActions?: number;
}

export function runGame(setup: GameSetup, agents: Record<Side, Agent>, options: RunOptions = {}): GameRecord {
  let { state, events } = createGame(setup);
  const allEvents = [...events];
  const actions: Action[] = [];
  const maxActions = options.maxActions ?? 20000;
  options.onStart?.(state, events);

  while (state.pending.kind !== 'gameOver') {
    if (actions.length >= maxActions) throw new Error(`Game did not finish within ${maxActions} actions`);
    const side = state.pending.side;
    const legal = legalActions(state, side);
    if (legal.length === 0) throw new Error(`No legal actions for ${side} while waiting for ${state.pending.kind}`);
    const action = agents[side].chooseAction(viewFor(state, side), legal);
    ({ state, events } = applyAction(state, action));
    actions.push(action);
    allEvents.push(...events);
    options.onStep?.(state, action, events);
  }
  return { setup, actions, events: allEvents, final: state };
}
