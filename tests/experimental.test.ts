// Experimental rule switches used by simulation what-ifs. They are off by default, and the
// real rules (RULES.md) don't include them.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { applyAction } from '../src/engine/reducer';
import { LANE_COUNTS, actionSpell, eventsOfType, fwd, goalie, lastContest, mid, play, player, scenario, uid } from './helpers';

describe.each(LANE_COUNTS)('experimental switches (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('are off by default', () => {
    expect(DEFAULT_CONFIG.protectCatch).toBe('off');
    expect(DEFAULT_CONFIG.goalieCarryOff).toBe(true);
  });

  it("goalieCarryOff: false means a goalie injured again stays on with their first injury", () => {
    const s = scenario({ lanes, config: { goalieCarryOff: false }, A: { hand: [actionSpell('Flambé', { effect: 'hit', params: { strength: 3 } })] }, B: { goalie: goalie('B goalie', 1) } });
    s.injuries[uid(s, 'B', 'B goalie')] = s.injuryDeck.pop()!;
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Flambé'), caster: fwd(0), target: { kind: 'hit', at: 'goalie' } });
    expect(state.teams.B.goalie?.uid).toBe(uid(s, 'B', 'B goalie'));
    expect(eventsOfType(events, 'injured')).toHaveLength(0);
  });

  it('passTiesGoTo: defender (the rule before v0.4) gives tied passes to the interceptor', () => {
    const s = scenario({ lanes, config: { passTiesGoTo: 'defender' } }); // fillers: 3 vs 3
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(lastContest(events).winner).toBe('B');
    expect(state.ball).toEqual({ side: 'B', pos: { area: 'defense', lane: LAST } });
  });

  it("protectCatch: forward stops the defender tackling a forward who just caught a pass, until that team's next turn", () => {
    const s = scenario({ lanes, config: { protectCatch: 'forward' }, A: { lineup: { forward: { [LAST]: player('A fwd', { speed: 6 }) } } } });
    let { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.ballProtected).toBe(true);
    expect(() => applyAction(state, { type: 'tackle', side: 'B' })).toThrow("can't be tackled");
    // B's turn (two actions) ends, and protection ends when A's next turn starts.
    ({ state } = play(state, { type: 'regroup', side: 'B', discard: [] }));
    expect(state.ballProtected).toBe(true);
    ({ state } = play(state, { type: 'regroup', side: 'B', discard: [] }));
    expect(state.ballProtected).toBe(false);
  });

  it("protectCatch: forward doesn't protect a midfielder", () => {
    const s = scenario({ lanes, config: { protectCatch: 'forward' }, A: { lineup: { midfield: { [LAST]: player('A mid', { speed: 6 }) } } } });
    const { state } = play(s, { type: 'pass', side: 'A', to: mid(LAST) });
    expect(state.ballProtected).toBe(false);
  });
});
