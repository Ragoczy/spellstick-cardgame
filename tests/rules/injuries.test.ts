// RULES.md "Injuries".
import { describe, expect, it } from 'vitest';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { createGame } from '../../src/engine/setup';
import { viewFor } from '../../src/engine/view';
import { findProblems } from '../../src/sim/invariants';
import { prototypeCards } from '../../src/data/prototype';
import type { GameState } from '../../src/engine/state';
import {
  LANE_COUNTS, actionSpell, dfn, eventsOfType, fwd, lastContest, mid, play, player, reaction, scenario, uid,
} from '../helpers';

const hit = () => actionSpell('Flambé', { effect: 'hit', params: { strength: 3 } });

/** A casts Flambé from its forward at B's defender in the same lane. */
function hitDefender(s: GameState, lane: number) {
  return play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Flambé'), caster: fwd(lane), target: { kind: 'hit' } });
}

/** Attaches the top injury card to a player, as if they had been hurt earlier. */
function injure(s: GameState, cardUid: string) {
  s.injuries[cardUid] = s.injuryDeck.pop()!;
}

const weakDefender = (lane: number) => ({ lineup: { defense: { [lane]: player('B def', { defense: 1, speed: 4 }) } } });

describe.each(LANE_COUNTS)('injuries (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('start as a shuffled shared deck of 12: 3 singed hair, 3 broken finger, 3 twisted ankle, 2 bruised ribs, 1 concussion', () => {
    const { state } = createGame({ seed: 5, cardSet: prototypeCards, config: { lanes } });
    expect(state.injuryDeck).toHaveLength(12);
    const names = state.injuryDeck.map((id) => state.injuryCards[id]!.name);
    const count = (name: string) => names.filter((n) => n === name).length;
    expect([count('Singed hair'), count('Broken finger'), count('Twisted ankle'), count('Bruised ribs'), count('Concussion')]).toEqual([3, 3, 3, 2, 1]);
    const other = createGame({ seed: 6, cardSet: prototypeCards, config: { lanes } }).state;
    expect(other.injuryDeck).not.toEqual(state.injuryDeck);
  });

  it('attach the top injury card, which lowers that stat in contests', () => {
    const s = scenario({ lanes, active: 'B', ball: { side: 'A', pos: fwd(LAST) }, A: { lineup: { forward: { [LAST]: player('A fwd', { speed: 4 }) } } } });
    injure(s, uid(s, 'A', 'A fwd')); // Singed hair: −1 Speed
    const { events } = play(s, { type: 'tackle', side: 'B' });
    const holder = lastContest(events).defender;
    expect(holder.total).toBe(3);
    expect(holder.parts).toEqual([{ label: 'Singed hair', amount: -1 }]);
  });

  it("can't happen to goalies: a dirty play that beats the goalie does nothing more", () => {
    const lateHit = reaction('Late Hit', { effect: 'dirty_play', params: {} });
    const s = scenario({ lanes, ball: { side: 'A', pos: fwd(0) }, A: { hand: [lateHit], lineup: { forward: { 0: player('A fwd', { shot: 6 }) } } } });
    const { state, events } = play(s, { type: 'shoot', side: 'A' }, { type: 'react', side: 'A', card: uid(s, 'A', 'Late Hit') });
    expect(state.score.A).toBe(1);
    expect(eventsOfType(events, 'injured')).toHaveLength(0);
    expect(Object.keys(state.injuries)).toHaveLength(0);
  });

  it('a concussion lowers every stat', () => {
    const c = scenario({ lanes, active: 'B', ball: { side: 'A', pos: fwd(0) }, A: { lineup: { forward: { 0: player('A fwd', { speed: 4 }) } } } });
    const concussion = c.injuryDeck.find((id) => c.injuryCards[id]!.name === 'Concussion')!;
    c.injuries[uid(c, 'A', 'A fwd')] = concussion;
    c.injuryDeck = c.injuryDeck.filter((id) => id !== concussion);
    expect(lastContest(play(c, { type: 'tackle', side: 'B' }).events).defender.total).toBe(3);
  });

  it('force an immediate substitution if the owner has a matching card in hand: the new player comes on face down, the injured one goes to hand', () => {
    const s = scenario({ lanes, actionsLeft: 2, ball: { side: 'B', pos: dfn(LAST) }, A: { hand: [hit()] }, B: { ...weakDefender(LAST), hand: [player('B sub')] } });
    let { state } = hitDefender(s, LAST);
    expect(state.pending).toEqual({ kind: 'forcedSub', side: 'B', pos: dfn(LAST) });
    expect(() => applyAction(state, { type: 'regroup', side: 'A', discard: [] })).toThrow(IllegalActionError);
    const result = play(state, { type: 'forcedSub', side: 'B', card: uid(s, 'B', 'B sub') });
    state = result.state;
    expect(state.teams.B.lineup.defense[LAST]).toEqual({ uid: uid(s, 'B', 'B sub'), revealed: false, scried: false });
    expect(state.teams.B.hand).toContain(uid(s, 'B', 'B def'));
    expect(state.injuries[uid(s, 'B', 'B def')]).toBeDefined();
    // The substitute holds the ball, and it didn't cost anyone an action: it's still A's turn with one left.
    expect(state.ball).toEqual({ side: 'B', pos: dfn(LAST) });
    expect(state.pending).toEqual({ kind: 'action', side: 'A' });
    expect(state.actionsLeft).toBe(1);
    expect(eventsOfType(result.events, 'forcedSub')[0]?.toHand?.def.name).toBe('B def');
  });

  it('leave the player in place, playing hurt, if there is no substitute in hand', () => {
    const s = scenario({ lanes, A: { hand: [hit()] }, B: weakDefender(LAST) });
    const { state } = hitDefender(s, LAST);
    expect(state.teams.B.lineup.defense[LAST]!.uid).toBe(uid(s, 'B', 'B def'));
    expect(state.injuries[uid(s, 'B', 'B def')]).toBeDefined();
    expect(state.pending.kind).toBe('action');
  });

  it('stay with a player brought back on later, until mended', () => {
    const s = scenario({ lanes, A: { hand: [player('Back on', { speed: 4 })] }, step: 'draw' });
    injure(s, uid(s, 'A', 'Back on'));
    let { state } = play(s, { type: 'substitute', side: 'A', pos: fwd(LAST), card: uid(s, 'A', 'Back on') });
    expect(state.injuries[uid(s, 'A', 'Back on')]).toBeDefined();
    state.ball = { side: 'A', pos: fwd(LAST) };
    expect(viewFor(state, 'A').mine.lineup.forward[LAST]).toMatchObject({ card: { injury: { name: 'Singed hair' } } });
  });

  it("don't stack: an injured player hurt again is carried off and discarded, and their injury goes back to the deck", () => {
    const s = scenario({ lanes, A: { hand: [hit()] }, B: { ...weakDefender(LAST), hand: [player('B sub')] } });
    injure(s, uid(s, 'B', 'B def'));
    const deckBefore = s.injuryDeck.length;
    const { state, events } = hitDefender(s, LAST);
    expect(eventsOfType(events, 'injured')[0]).toMatchObject({ carriedOff: true, injury: null });
    expect(state.teams.B.discard).toContain(uid(s, 'B', 'B def'));
    expect(state.injuries[uid(s, 'B', 'B def')]).toBeUndefined();
    expect(state.injuryDeck).toHaveLength(deckBefore + 1);
    expect(state.pending).toEqual({ kind: 'forcedSub', side: 'B', pos: dfn(LAST) });
    const after = play(state, { type: 'forcedSub', side: 'B', card: uid(s, 'B', 'B sub') }).state;
    expect(after.teams.B.lineup.defense[LAST]!.uid).toBe(uid(s, 'B', 'B sub'));
    expect(findProblems(after)).toEqual([]);
  });

  it('leave an empty spot that counts as 0 if a carried-off player has no substitute; Substitute can fill it', () => {
    const s = scenario({ lanes, A: { hand: [hit()] }, B: weakDefender(LAST) });
    injure(s, uid(s, 'B', 'B def'));
    const { state, events } = hitDefender(s, LAST);
    expect(eventsOfType(events, 'slotEmptied')).toEqual([{ type: 'slotEmptied', side: 'B', pos: dfn(LAST) }]);
    expect(state.teams.B.lineup.defense[LAST]).toBeNull();
    expect(viewFor(state, 'A').opponent.lineup.defense[LAST]).toEqual({ state: 'empty' });

    // A pass into that spot can't be intercepted: the empty spot counts as 0.
    const passing = structuredClone(state);
    passing.activeSide = 'A';
    passing.pending = { kind: 'action', side: 'A' };
    passing.actionsLeft = 1;
    passing.ball = { side: 'A', pos: mid(0) };
    const pass = play(passing, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(lastContest(pass.events).defender).toMatchObject({ card: null, total: 0 });
    expect(pass.state.ball).toEqual({ side: 'A', pos: fwd(LAST) });

    // B can fill the spot with a Substitute later.
    const filling = structuredClone(state);
    filling.activeSide = 'B';
    filling.pending = { kind: 'draw', side: 'B' };
    filling.actionsLeft = 1;
    filling.cards['Bxx'] = player('B newcomer');
    filling.teams.B.hand.push('Bxx');
    const filled = play(filling, { type: 'substitute', side: 'B', pos: dfn(LAST), card: 'Bxx' }).state;
    expect(filled.teams.B.lineup.defense[LAST]!.uid).toBe('Bxx');
  });

  it('let any shot score into an empty goal', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: fwd(0) }, A: { lineup: { forward: { 0: player('A fwd', { shot: 0 }) } } } });
    s.teams.B.goalie = null;
    const { state } = play(s, { type: 'shoot', side: 'A' });
    expect(state.score.A).toBe(1);
  });

  it("give the ball to the opposing player in the spot if a carried-off ball carrier can't be replaced", () => {
    const s = scenario({ lanes, ball: { side: 'B', pos: dfn(LAST) }, A: { hand: [hit()] }, B: weakDefender(LAST) });
    injure(s, uid(s, 'B', 'B def'));
    const { state } = hitDefender(s, LAST);
    expect(state.ball).toEqual({ side: 'A', pos: fwd(LAST) });
  });

  it('go back to the injury deck when an injured player is discarded for any reason', () => {
    const s = scenario({ lanes, A: { hand: [player('Hurt'), player('Sub')] } });
    injure(s, uid(s, 'A', 'Hurt'));
    const before = s.injuryDeck.length;
    const { state } = play(s, { type: 'regroup', side: 'A', discard: [uid(s, 'A', 'Hurt')] });
    expect(state.injuryDeck).toHaveLength(before + 1);
    expect(state.injuries[uid(s, 'A', 'Hurt')]).toBeUndefined();

  });

  it('stay with a player substituted out to hand', () => {
    const onField = scenario({ lanes, A: { hand: [player('Sub')], lineup: { forward: { 0: player('Hurt') } } }, step: 'draw' });
    injure(onField, uid(onField, 'A', 'Hurt'));
    const replaced = play(onField, { type: 'substitute', side: 'A', pos: fwd(0), card: uid(onField, 'A', 'Sub') }).state;
    expect(replaced.teams.A.hand).toContain(uid(onField, 'A', 'Hurt'));
    expect(replaced.injuries[uid(onField, 'A', 'Hurt')]).toBeDefined();
  });

  it('have no effect beyond the forced substitution when the injury deck is empty', () => {
    const s = scenario({ lanes, A: { hand: [hit()] }, B: { ...weakDefender(LAST), hand: [player('B sub')] } });
    s.injuryDeck = [];
    const { state, events } = hitDefender(s, LAST);
    expect(eventsOfType(events, 'injured')[0]).toMatchObject({ injury: null, carriedOff: false });
    expect(state.injuries[uid(s, 'B', 'B def')]).toBeUndefined();
    expect(state.pending).toEqual({ kind: 'forcedSub', side: 'B', pos: dfn(LAST) });
  });

  it('are face up: the opponent sees an injury even on a face-down player', () => {
    const s = scenario({ lanes, B: { lineup: { midfield: { 0: player('Secret') } } } });
    injure(s, uid(s, 'B', 'Secret'));
    const seen = viewFor(s, 'A').opponent.lineup.midfield[0]!;
    expect(seen).toMatchObject({ state: 'unknown', injury: { name: 'Singed hair' } });
    expect(JSON.stringify(seen)).not.toContain('Secret');
  });

  it("don't let you pick a faceoff lane where both midfielders are missing", () => {
    const s = scenario({ lanes, ball: null });
    s.pending = { kind: 'faceoffLane', side: 'B' };
    s.teams.A.lineup.midfield[0] = null;
    s.teams.B.lineup.midfield[0] = null;
    expect(() => applyAction(s, { type: 'faceoffLane', side: 'B', lane: 0 })).toThrow('Both midfielders in that lane are missing.');
    // With only one missing, the other midfielder takes the ball whoever wins.
    s.teams.B.lineup.midfield[0] = { uid: uid(s, 'B', 'B filler midfield 0'), revealed: false, scried: false };
    const { state } = play(s, { type: 'faceoffLane', side: 'B', lane: 0 });
    expect(state.ball).toEqual({ side: 'B', pos: mid(0) });
  });
});
