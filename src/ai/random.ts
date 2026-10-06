// A player that picks a random legal action. Used to stress-test the engine; the real computer
// opponent arrives in milestone 2.
//
// It first picks an action type at random, then an action of that type, so it doesn't spend
// every turn casting just because spells have many possible casters and targets.

import { nextRandom, seedToState } from '../engine/rng';
import type { Action } from '../engine/actions';
import type { Agent } from './agent';

export function randomAgent(seed: number): Agent {
  let rng = seedToState(seed);
  const pick = <T>(items: T[]): T => {
    let value: number;
    [value, rng] = nextRandom(rng);
    return items[Math.floor(value * items.length)]!;
  };
  return {
    name: 'random',
    chooseAction(_view, legal: Action[]): Action {
      const types = [...new Set(legal.map((a) => a.type))];
      const type = pick(types);
      return pick(legal.filter((a) => a.type === type));
    },
  };
}
