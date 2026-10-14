// RULES.md "Goalie clears": a goalie holding the ball must pass it out as your action. If it has
// nobody to pass to, the ball goes to a faceoff and the other team chooses the lane.
import { describe, expect, it } from 'vitest';
import { legalActions } from '../../src/engine/legal';
import { applyAction } from '../../src/engine/reducer';
import {
  LANE_COUNTS, GOAL_POS, actionSpell, dfn, eventsOfType, fwd, goalie, mid, play, player, scenario, uid,
} from '../helpers';

describe.each(LANE_COUNTS)('goalie clears (%i lanes)', (lanes) => {
  const LAST = lanes - 1;
  const longPass = () => actionSpell('Long Pass', { effect: 'long_pass', params: {} });
  const scry = () => actionSpell('Scrying Bowl', { effect: 'scry', params: {} });

  it('only lets you pass the ball out: no regroup, and no spell that keeps it in goal', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: GOAL_POS }, A: { hand: [scry()] } });
    const legal = legalActions(s, 'A');
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every((a) => a.type === 'pass')).toBe(true);
    expect(legal.filter((a) => a.type === 'pass').map((a) => a.type === 'pass' && a.to.area)).toEqual(Array(lanes).fill('defense'));
    expect(() => applyAction(s, { type: 'regroup', side: 'A', discard: [] })).toThrow('must clear it');
    const card = uid(s, 'A', 'Scrying Bowl');
    expect(() => applyAction(s, { type: 'cast', side: 'A', card, caster: fwd(0), target: { kind: 'opponent', pos: dfn(0) } })).toThrow('must clear it');
  });

  it('counts a Long Pass from the goalie as clearing', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: GOAL_POS }, A: { hand: [longPass()] } });
    const card = uid(s, 'A', 'Long Pass');
    const cast = { type: 'cast' as const, side: 'A' as const, card, caster: fwd(0), target: { kind: 'pass' as const, to: mid(LAST) } };
    expect(legalActions(s, 'A')).toContainEqual(cast);
    const { events } = play(s, cast);
    expect(eventsOfType(events, 'contestStarted')[0]).toMatchObject({ kind: 'pass', attacker: { pos: mid(LAST) } });
  });

  it('applies on the next turn after a save', () => {
    const s = scenario({ lanes, active: 'B', ball: { side: 'B', pos: fwd(LAST) }, A: { goalie: goalie('A goalie', 9) } });
    let { state } = play(s, { type: 'shoot', side: 'B' });
    expect(state.ball).toEqual({ side: 'A', pos: GOAL_POS });
    // A's turn: draw, then the action has to be a pass out.
    if (state.pending.kind === 'draw') ({ state } = play(state, legalActions(state, 'A').find((a) => a.type === 'draw')!));
    expect(state.pending).toMatchObject({ kind: 'action', side: 'A' });
    expect(legalActions(state, 'A').every((a) => a.type === 'pass')).toBe(true);
  });

  it("won't let you substitute the goalie while it has the ball", () => {
    const spare = goalie('A spare goalie');
    const s = scenario({ lanes, step: 'draw', ball: { side: 'A', pos: GOAL_POS }, A: { hand: [spare] } });
    const card = uid(s, 'A', 'A spare goalie');
    expect(() => applyAction(s, { type: 'substitute', side: 'A', pos: GOAL_POS, card })).toThrow("can't come off now");
    // Field players can still be substituted.
    const field = scenario({ lanes, step: 'draw', ball: { side: 'A', pos: GOAL_POS }, A: { hand: [player('A sub')] } });
    expect(() => applyAction(field, { type: 'substitute', side: 'A', pos: dfn(0), card: uid(field, 'A', 'A sub') })).not.toThrow();
  });

  it('goes to a faceoff if the goalie has nobody to pass to; the other team chooses the lane', () => {
    // B ends its turn; A's goalie has the ball and both of A's defender spots are empty.
    const s = scenario({ lanes, active: 'B', ball: { side: 'A', pos: GOAL_POS } });
    for (let lane = 0; lane < lanes; lane++) s.teams.A.lineup.defense[lane] = null;
    let { state, events } = play(s, { type: 'regroup', side: 'B', discard: [] });
    expect(eventsOfType(events, 'goalieCantClear')).toEqual([{ type: 'goalieCantClear', side: 'A' }]);
    expect(state.ball).toBeNull();
    expect(state.pending).toMatchObject({ kind: 'faceoffLane', side: 'B' });
    // After the faceoff, A takes its action as usual.
    ({ state } = play(state, { type: 'faceoffLane', side: 'B', lane: 0 }));
    while (state.pending.kind === 'reaction' || state.pending.kind === 'callDice') ({ state } = play(state, legalActions(state, state.pending.side)[0]!));
    expect(state.pending).toMatchObject({ kind: 'action', side: 'A' });
    expect(state.ball?.pos.area).toBe('midfield');
  });

  it('let the goalie hold the ball before v0.16 (online matches started under the old rule)', () => {
    const s = scenario({ lanes, config: { goalieMustClear: false }, ball: { side: 'A', pos: GOAL_POS } });
    expect(() => applyAction(s, { type: 'regroup', side: 'A', discard: [] })).not.toThrow();
  });
});
