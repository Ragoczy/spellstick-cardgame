// Replays a game: the same setup (seed, cards, config) and the same actions always give the
// same game.

import type { Action } from './actions';
import type { GameEvent } from './events';
import { applyAction } from './reducer';
import { createGame, type GameSetup } from './setup';
import type { GameState } from './state';

export function replay(setup: GameSetup, actions: Action[]): { state: GameState; events: GameEvent[] } {
  let { state, events } = createGame(setup);
  const all = [...events];
  for (const action of actions) {
    ({ state, events } = applyAction(state, action));
    all.push(...events);
  }
  return { state, events: all };
}
