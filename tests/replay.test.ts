// Same seed + same actions = same game (CLAUDE.md rule 1, ROADMAP M1).
import { describe, expect, it } from 'vitest';
import { randomAgent } from '../src/ai/random';
import { runGame } from '../src/ai/runGame';
import { IllegalActionError, applyAction } from '../src/engine/reducer';
import { replay } from '../src/engine/replay';
import { createGame } from '../src/engine/setup';
import { prototypeCards } from '../src/data/prototype';
import { LANE_COUNTS, fwd, scenario } from './helpers';

describe.each(LANE_COUNTS)('replay (%i lanes)', (lanes) => {
  it('rebuilds exactly the same game from the seed and the list of actions', () => {
    const setup = { seed: 42, cardSet: prototypeCards, config: { lanes } };
    const record = runGame(setup, { A: randomAgent(1), B: randomAgent(2) });
    const replayed = replay(setup, record.actions);
    expect(replayed.state).toEqual(record.final);
    expect(replayed.events).toEqual(record.events);
    expect(record.final.result).not.toBeNull();
  });

  it('gives different games for different seeds', () => {
    const a = createGame({ seed: 1, cardSet: prototypeCards, config: { lanes } }).state;
    const b = createGame({ seed: 2, cardSet: prototypeCards, config: { lanes } }).state;
    const deal = (s: typeof a) => applyAction(s, { type: 'chooseGoalie', side: 'A', card: s.teams.A.hand[0]! }).state.teams.A.hand;
    expect(deal(a)).not.toEqual(deal(b));
  });

  it("never changes the state it was given, and rejects illegal actions without changing anything", () => {
    const s = scenario({ lanes });
    const before = structuredClone(s);
    applyAction(s, { type: 'pass', side: 'A', to: fwd(0) });
    expect(s).toEqual(before);
    expect(() => applyAction(s, { type: 'shoot', side: 'A' })).toThrow(IllegalActionError);
    expect(s).toEqual(before);
  });
});
