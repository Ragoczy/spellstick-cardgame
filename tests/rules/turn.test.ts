// RULES.md "Turn sequence" (draw or substitute) and "Actions any time" (cast, regroup).
import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/actions';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { legalActions } from '../../src/engine/legal';
import { viewFor } from '../../src/engine/view';
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

  it("gives each player one action per turn, then it is the other player's turn", () => {
    const s = scenario({ lanes });
    expect(s.config.actionsPerTurn).toBe(1);
    const { state } = play(s, pass);
    expect(state.pending).toEqual({ kind: 'action', side: 'B' });
    expect(state.actionsLeft).toBe(1);
    expect(() => applyAction(state, pass)).toThrow("It isn't your decision right now.");
  });

  it('lets you choose which pile to draw from when both have cards', () => {
    const recall = actionSpell('B recall', { effect: 'recall', params: { count: 1 } });
    const s = scenario({ lanes, B: { deck: [player('B top player'), recall] } });
    let { state, events } = play(s, pass);
    expect(state.pending).toEqual({ kind: 'draw', side: 'B' });
    expect(eventsOfType(events, 'drew')).toHaveLength(0);
    // You can't act before drawing.
    expect(() => applyAction(state, { type: 'regroup', side: 'B', discard: [] })).toThrow(IllegalActionError);
    ({ state, events } = play(state, { type: 'draw', side: 'B', pile: 'spells' }));
    expect(eventsOfType(events, 'drew')[0]).toMatchObject({ side: 'B', count: 1, reason: 'turn', pile: 'spells' });
    expect(state.teams.B.hand.map((u) => state.cards[u]!.name)).toContain('B recall');
    expect(state.pending).toEqual({ kind: 'action', side: 'B' });
  });

  it("with a full hand, doesn't draw: the top card of the chosen pile goes to the discard pile", () => {
    const recall = (name: string) => actionSpell(name, { effect: 'recall', params: { count: 1 } });
    const hand = Array.from({ length: 7 }, (_, i) => player(`B hand ${i}`));
    const s = scenario({ lanes, B: { hand, deck: [player('B top player'), recall('B top spell')] } });
    let { state } = play(s, pass);
    expect(state.pending).toEqual({ kind: 'draw', side: 'B' });
    let events;
    ({ state, events } = play(state, { type: 'draw', side: 'B', pile: 'spells' }));
    expect(eventsOfType(events, 'drew')).toHaveLength(0);
    expect(eventsOfType(events, 'discarded')[0]).toMatchObject({ side: 'B', fromPile: 'spells', cards: [{ def: { name: 'B top spell' } }] });
    expect(state.teams.B.hand).toHaveLength(7);
    expect(state.teams.B.spells).toHaveLength(0);
    expect(state.teams.B.discard.map((u) => state.cards[u]!.name)).toEqual(['B top spell']);
    expect(state.pending).toEqual({ kind: 'action', side: 'B' });
  });

  it('with a full hand and only one pile left, its top card goes to the discard pile without asking', () => {
    // A hand of spells, so substituting isn't an option either.
    const hand = Array.from({ length: 7 }, (_, i) => actionSpell(`B hand ${i}`, { effect: 'recall', params: { count: 1 } }));
    const s = scenario({ lanes, B: { hand, deck: [player('B top player')] } });
    const { state, events } = play(s, pass);
    expect(eventsOfType(events, 'discarded')[0]).toMatchObject({ fromPile: 'players' });
    expect(state.teams.B.hand).toHaveLength(7);
    expect(state.pending).toEqual({ kind: 'action', side: 'B' });
  });

  it("draws from the other pile without asking when one is empty, and can't choose an empty pile", () => {
    const s = scenario({ lanes, B: { deck: [player('B only player')] } });
    const { state, events } = play(s, pass);
    expect(eventsOfType(events, 'drew')[0]).toMatchObject({ pile: 'players' });
    expect(state.pending).toEqual({ kind: 'action', side: 'B' });
    const both = scenario({ lanes, B: { deck: [player('p'), actionSpell('r', { effect: 'recall', params: { count: 1 } })] } });
    const atDraw = play(both, pass).state;
    expect(legalActions(atDraw, 'B')).toEqual([
      { type: 'draw', side: 'B', pile: 'players' },
      { type: 'draw', side: 'B', pile: 'spells' },
    ]);
  });

  it('allows the same action twice in a turn when playing with two actions (pass, then shoot)', () => {
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

  it('regroup: the new card comes from the same pile as the one you discarded', () => {
    const recall = actionSpell('A recall', { effect: 'recall', params: { count: 1 } });
    const s = scenario({ lanes, A: { hand: [recall], deck: [player('A top player'), actionSpell('A top spell', { effect: 'recall', params: { count: 1 } })] } });
    const { state, events } = play(s, { type: 'regroup', side: 'A', discard: [uid(s, 'A', 'A recall')] });
    expect(eventsOfType(events, 'drew')[0]).toMatchObject({ reason: 'regroup', pile: 'spells' });
    expect(state.teams.A.hand.map((u) => state.cards[u]!.name)).toEqual(['A top spell']);
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

  it('substitute: the new player comes in face down and keeps the ball; the old one goes to hand', () => {
    const s = scenario({
      lanes,
      ball: { side: 'A', pos: mid(LAST) },
      A: { lineup: { midfield: { [LAST]: player('old') } }, revealed: [mid(LAST)], hand: [player('new')] },
      step: 'draw',
    });
    const { state, events } = play(s, { type: 'substitute', side: 'A', pos: mid(LAST), card: uid(s, 'A', 'new') });
    expect(state.teams.A.lineup.midfield[LAST]).toEqual({ uid: uid(s, 'A', 'new'), revealed: false, scried: false, cameOn: true });
    expect(state.teams.A.hand).toEqual([uid(s, 'A', 'old')]);
    expect(state.teams.A.discard).toEqual([]);
    expect(eventsOfType(events, 'substituted')[0]?.removed?.def.name).toBe('old');
    expect(state.ball).toEqual({ side: 'A', pos: mid(LAST) });
  });

  it('substitute: goalie for goalie, field player for field player', () => {
    const s = scenario({ lanes, A: { hand: [player('field'), goalie('keeper')] }, step: 'draw' });
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

// RULES.md "Turn sequence": substitute at the Draw step, instead of drawing (v0.11).
describe.each(LANE_COUNTS)('substituting at the Draw step (%i lanes)', (lanes) => {
  const LAST = lanes - 1;
  const recall = () => actionSpell('recall', { effect: 'recall', params: { count: 1 } });

  /** It's A's Draw step with a player in hand, holding the ball in midfield lane 0. */
  function drawStep(extra: Parameters<typeof scenario>[0] = {}) {
    return scenario({ lanes, step: 'draw', A: { hand: [player('new', { speed: 5, defense: 5 }), recall(), boost('boost')] }, ...extra });
  }
  const subIn = (s: ReturnType<typeof scenario>, pos = mid(0)) =>
    play(s, { type: 'substitute', side: 'A', pos, card: uid(s, 'A', 'new') });

  it('is a choice at the Draw step, even when only one pile has cards', () => {
    const s = scenario({ lanes, A: { hand: [regroupOnly()] }, B: { hand: [player('B bench')], deck: [player('B only player')] } });
    const { state, events } = play(s, pass);
    expect(state.pending).toEqual({ kind: 'draw', side: 'B' });
    expect(eventsOfType(events, 'drew')).toEqual([]);
    const legal = legalActions(state, 'B');
    expect(legal).toContainEqual({ type: 'draw', side: 'B', pile: 'players' });
    expect(legal).not.toContainEqual({ type: 'draw', side: 'B', pile: 'spells' });
    expect(legal.some((a) => a.type === 'substitute')).toBe(true);
  });

  it('replaces the draw: no card is drawn, and the action is still to come', () => {
    const s = drawStep();
    const piles = { players: s.teams.A.players.length, spells: s.teams.A.spells.length };
    const { state, events } = subIn(s);
    expect(eventsOfType(events, 'drew')).toEqual([]);
    expect({ players: state.teams.A.players.length, spells: state.teams.A.spells.length }).toEqual(piles);
    expect(state.pending).toEqual({ kind: 'action', side: 'A' });
    expect(state.actionsLeft).toBe(1);
  });

  it("isn't an action any more", () => {
    const s = scenario({ lanes, A: { hand: [player('new')] } });
    expect(() => applyAction(s, { type: 'substitute', side: 'A', pos: mid(0), card: uid(s, 'A', 'new') })).toThrow(/instead of drawing/);
    expect(legalActions(s, 'A').some((a) => a.type === 'substitute')).toBe(false);
  });

  it("the player who came on can't pass or shoot this turn (holding the ball)", () => {
    const { state } = subIn(drawStep({ ball: { side: 'A', pos: fwd(0) } }), fwd(0));
    expect(state.ball).toEqual({ side: 'A', pos: fwd(0) });
    expect(() => applyAction(state, { type: 'shoot', side: 'A' })).toThrow(/just came on/);
    expect(() => applyAction(state, { type: 'pass', side: 'A', to: mid(0) })).toThrow(/just came on/);
    expect(legalActions(state, 'A').some((a) => a.type === 'pass' || a.type === 'shoot')).toBe(false);
  });

  it("the player who came on can't tackle or cast this turn", () => {
    const { state } = subIn(drawStep({ ball: { side: 'B', pos: mid(0) } }), mid(0));
    expect(() => applyAction(state, { type: 'tackle', side: 'A' })).toThrow(/just came on/);
    expect(() => applyAction(state, { type: 'cast', side: 'A', card: uid(state, 'A', 'recall'), caster: mid(0), target: { kind: 'none' } })).toThrow(/just came on/);
    // Another player can still cast.
    expect(legalActions(state, 'A')).toContainEqual({ type: 'cast', side: 'A', card: uid(state, 'A', 'recall'), caster: GOAL_POS, target: { kind: 'none' } });
  });

  it("can still receive a pass, but isn't asked for a reaction spell this turn", () => {
    const { state } = subIn(drawStep(), fwd(LAST));
    const after = play(state, { type: 'pass', side: 'A', to: fwd(LAST) }).state;
    expect(after.pending.kind).not.toBe('reaction');
    // Without the substitution, the receiver could react.
    const control = play(scenario({ lanes, A: { hand: [boost('boost')] } }), { type: 'pass', side: 'A', to: fwd(LAST) }).state;
    expect(control.pending).toMatchObject({ kind: 'reaction', side: 'A' });
  });

  it('acts normally from the end of the turn', () => {
    const { state } = subIn(drawStep());
    expect(state.teams.A.lineup.midfield[0]!.cameOn).toBe(true);
    const next = play(state, pass).state;
    expect(next.teams.A.lineup.midfield[0]!.cameOn).toBeUndefined();
  });

  it('shows the player who came on in the view', () => {
    const { state } = subIn(drawStep());
    expect(viewFor(state, 'A').mine.lineup.midfield[0]).toMatchObject({ state: 'faceDown', cameOn: true });
  });

  it("isn't offered when both piles are empty (the Draw step is skipped)", () => {
    const s = scenario({ lanes, A: { hand: [regroupOnly()] }, B: { hand: [player('B bench')], deck: [] } });
    const { state } = play(s, pass);
    expect(state.pending).toEqual({ kind: 'action', side: 'B' });
    expect(legalActions(state, 'B').some((a) => a.type === 'substitute')).toBe(false);
  });

  it('old rule (online matches from before v0.11): substitute as your action', () => {
    const s = scenario({ lanes, config: { substituteStep: 'action' }, A: { hand: [player('new')] } });
    const { state } = play(s, { type: 'substitute', side: 'A', pos: mid(0), card: uid(s, 'A', 'new') });
    expect(state.teams.A.lineup.midfield[0]).toEqual({ uid: uid(s, 'A', 'new'), revealed: false, scried: false });
    expect(state.activeSide).toBe('B');
  });
});

function regroupOnly() {
  return actionSpell('spare', { effect: 'recall', params: { count: 1 } });
}
