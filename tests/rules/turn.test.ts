// RULES.md "Turn sequence" and "Actions any time" (cast, substitute, regroup).
import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/actions';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { legalActions } from '../../src/engine/legal';
import {
  LANE_COUNTS, GOAL_POS, actionSpell, boost, eventsOfType, fwd, goalie, mid, play, player, scenario, uid,
} from '../helpers';

const pass: Action = { type: 'regroup', side: 'A', discard: [] };

describe.each(LANE_COUNTS)('turn sequence (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('starts each turn by drawing one card', () => {
    const s = scenario({ lanes });
    const before = s.teams.B.hand.length;
    const { state, events } = play(s, pass);
    expect(eventsOfType(events, 'turnStarted')).toEqual([{ type: 'turnStarted', side: 'B', turn: 2 }]);
    expect(eventsOfType(events, 'drew')[0]).toMatchObject({ side: 'B', count: 1, reason: 'turn' });
    expect(state.teams.B.hand.length).toBe(before + 1);
  });

  it("gives each player two actions per turn, then it is the other player's turn", () => {
    const s = scenario({ lanes, actionsLeft: 2 });
    let { state } = play(s, pass);
    expect(state.pending).toEqual({ kind: 'action', side: 'A' });
    ({ state } = play(state, pass));
    expect(state.pending).toEqual({ kind: 'action', side: 'B' });
    expect(state.actionsLeft).toBe(2);
    expect(() => applyAction(state, pass)).toThrow("It isn't your decision right now.");
  });

  it('allows the same action twice in a turn (pass, then shoot)', () => {
    const s = scenario({ lanes, actionsLeft: 2, A: { lineup: { forward: { [LAST]: player('A fwd', { speed: 6, shot: 6 }) } } } });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'shoot', side: 'A' });
    expect(eventsOfType(events, 'goal')).toHaveLength(1);
    expect(state.score.A).toBe(1);
  });

  it("ends the turn when you score, even with an action left", () => {
    const s = scenario({ lanes, actionsLeft: 2, ball: { side: 'A', pos: fwd(LAST) }, A: { lineup: { forward: { [LAST]: player('A fwd', { shot: 6 }) } } } });
    let { state } = play(s, { type: 'shoot', side: 'A' });
    expect(state.pending).toEqual({ kind: 'faceoffLane', side: 'B' });
    ({ state } = play(state, { type: 'faceoffLane', side: 'B', lane: 0 }));
    expect(state.pending).toEqual({ kind: 'action', side: 'B' });
  });

  it('ends with discarding down to 7 cards, one at a time', () => {
    const hand = Array.from({ length: 9 }, (_, i) => player(`card ${i}`));
    let { state } = play(scenario({ lanes, A: { hand } }), pass);
    expect(state.pending).toEqual({ kind: 'discard', side: 'A', count: 2 });
    ({ state } = play(state, { type: 'discard', side: 'A', card: uid(state, 'A', 'card 0') }));
    expect(state.pending).toEqual({ kind: 'discard', side: 'A', count: 1 });
    const { state: after, events } = play(state, { type: 'discard', side: 'A', card: uid(state, 'A', 'card 1') });
    expect(after.teams.A.hand).toHaveLength(7);
    expect(after.teams.A.discard).toHaveLength(2);
    expect(eventsOfType(events, 'turnStarted')[0]?.side).toBe('B');
  });

  it('regroup: discard 1 card, then draw 1 (no more than 1)', () => {
    const s = scenario({ lanes, A: { hand: [player('x'), player('y')] } });
    expect(s.config.regroupMax).toBe(1);
    const { state, events } = play(s, { type: 'regroup', side: 'A', discard: [uid(s, 'A', 'x')] });
    expect(state.teams.A.hand).toHaveLength(2);
    expect(eventsOfType(events, 'discarded')[0]?.cards.map((c) => c.def.name)).toEqual(['x']);
    expect(() => applyAction(s, { type: 'regroup', side: 'A', discard: [uid(s, 'A', 'x'), uid(s, 'A', 'y')] })).toThrow(IllegalActionError);
  });

  it('regroup with no cards is always legal, so there is always something to do', () => {
    const s = scenario({ lanes, ball: { side: 'B', pos: GOAL_POS } });
    expect(legalActions(s, 'A')).toContainEqual(pass);
  });

  it('substitute: the new player comes in face down, the old one is discarded for all to see, and keeps the ball', () => {
    const s = scenario({
      lanes,
      ball: { side: 'A', pos: mid(LAST) },
      A: { lineup: { midfield: { [LAST]: player('old') } }, revealed: [mid(LAST)], hand: [player('new')] },
    });
    const { state, events } = play(s, { type: 'substitute', side: 'A', pos: mid(LAST), card: uid(s, 'A', 'new') });
    expect(state.teams.A.lineup.midfield[LAST]).toEqual({ uid: uid(s, 'A', 'new'), revealed: false, scried: false });
    expect(state.teams.A.discard).toEqual([uid(s, 'A', 'old')]);
    expect(eventsOfType(events, 'substituted')[0]?.removed.def.name).toBe('old');
    expect(state.ball).toEqual({ side: 'A', pos: mid(LAST) });
  });

  it('substitute: goalie for goalie, field player for field player', () => {
    const s = scenario({ lanes, A: { hand: [player('field'), goalie('keeper')] } });
    expect(() => applyAction(s, { type: 'substitute', side: 'A', pos: GOAL_POS, card: uid(s, 'A', 'field') })).toThrow(IllegalActionError);
    expect(() => applyAction(s, { type: 'substitute', side: 'A', pos: mid(0), card: uid(s, 'A', 'keeper') })).toThrow(IllegalActionError);
    const { state } = play(s, { type: 'substitute', side: 'A', pos: GOAL_POS, card: uid(s, 'A', 'keeper') });
    expect(state.teams.A.goalie?.uid).toBe(uid(s, 'A', 'keeper'));
  });

  it('cast: the caster you choose is revealed, including the goalie', () => {
    const recall = actionSpell('recall', { effect: 'recall', params: { count: 1 } });
    const s = scenario({ lanes, A: { hand: [recall] } });
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'recall'), caster: GOAL_POS, target: { kind: 'none' } });
    expect(state.teams.A.goalie!.revealed).toBe(true);
    expect(eventsOfType(events, 'spellCast')[0]).toMatchObject({ side: 'A', caster: GOAL_POS });
    expect(state.teams.A.discard).toContain(uid(s, 'A', 'recall'));
  });

  it("reaction spells can't be cast as an action", () => {
    const s = scenario({ lanes, A: { hand: [boost('boost')] } });
    expect(() => applyAction(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'boost'), caster: mid(0), target: { kind: 'none' } }))
      .toThrow('Reaction spells can only be played during a contest.');
  });

  it('does not let either player act out of turn', () => {
    const s = scenario({ lanes, ball: { side: 'B', pos: mid(0) } });
    expect(() => applyAction(s, { type: 'tackle', side: 'B' })).toThrow("It isn't your decision right now.");
  });
});
