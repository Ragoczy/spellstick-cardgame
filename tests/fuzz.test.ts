// Plays many complete games and checks that nothing impossible ever happens and every game
// ends: random legal moves (to reach odd corners), and the heuristic computer opponent.
// `npm run sim` does the same with 1,000 games.
import { describe, expect, it } from 'vitest';
import type { Agent } from '../src/ai/agent';
import { heuristicAgent } from '../src/ai/heuristic';
import { randomAgent } from '../src/ai/random';
import { runGame } from '../src/ai/runGame';
import { makeConfig } from '../src/engine/config';
import type { Side } from '../src/engine/field';
import { findProblems } from '../src/sim/invariants';
import { prototypeCards } from '../src/data/prototype';
import { LANE_COUNTS } from './helpers';

function playMany(lanes: number, games: number, makeAgents: (seed: number) => Record<Side, Agent>) {
  for (let seed = 1; seed <= games; seed++) {
    const record = runGame({ seed, cardSet: prototypeCards, config: { lanes } }, makeAgents(seed), {
      onStep: (state) => expect(findProblems(state)).toEqual([]),
    });
    expect(record.final.result).not.toBeNull();
    expect(record.final.result!.reason).not.toBe('turn_cap');
  }
}

describe.each(LANE_COUNTS)('whole games (%i lanes)', (lanes) => {
  it('random players: no crashes, no impossible states, no endless games', () => {
    playMany(lanes, 50, (seed) => ({ A: randomAgent(seed * 2), B: randomAgent(seed * 2 + 1) }));
  }, 120_000);

  it('computer players: no crashes, no impossible states, no endless games', () => {
    const config = makeConfig({ lanes });
    playMany(lanes, 30, (seed) => ({ A: heuristicAgent(seed * 2, config), B: heuristicAgent(seed * 2 + 1, config) }));
  }, 120_000);
});
