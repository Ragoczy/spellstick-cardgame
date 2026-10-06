// RULES.md "End of the game" (goals, running out of cards, sudden death, turn cap).
import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/actions';
import { applyAction } from '../../src/engine/reducer';
import type { GameState } from '../../src/engine/state';
import { LANE_COUNTS, actionSpell, eventsOfType, fwd, play, player, scenario, uid } from '../helpers';

const regroup = (side: 'A' | 'B'): Action => ({ type: 'regroup', side, discard: [] });

/** Plays "do nothing" turns until the game ends or `max` turns pass. */
function idle(state: GameState, max = 10) {
  let s = state;
  const events = [];
  for (let i = 0; i < max && s.pending.kind === 'action'; i++) {
    const result = applyAction(s, regroup(s.pending.side));
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

describe.each(LANE_COUNTS)('end of the game (%i lanes)', (lanes) => {
  const LAST = lanes - 1;
  const striker = { lineup: { forward: { [LAST]: player('A fwd', { shot: 6 }) } } };

  it('ends immediately when a team reaches 3 goals', () => {
    const s = scenario({ lanes, score: { A: 2, B: 1 }, ball: { side: 'A', pos: fwd(LAST) }, A: striker });
    const { state, events } = play(s, { type: 'shoot', side: 'A' });
    expect(state.result).toEqual({ winner: 'A', reason: 'goals' });
    expect(state.pending).toEqual({ kind: 'gameOver' });
    expect(eventsOfType(events, 'gameOver')).toHaveLength(1);
    expect(() => applyAction(state, regroup('B'))).toThrow('The game is over.');
  });

  it('when a deck is empty at the draw: that player skips the draw and plays, then the opponent takes a final turn', () => {
    const s = scenario({ lanes, active: 'B', score: { A: 1, B: 0 }, A: { deck: [] } });
    let { state, events } = play(s, regroup('B'));
    expect(eventsOfType(events, 'deckOut')).toEqual([{ type: 'deckOut', side: 'A', finalTurnFor: 'B' }]);
    expect(state.pending).toEqual({ kind: 'action', side: 'A' });
    expect(eventsOfType(events, 'drew')).toHaveLength(0);

    ({ state } = play(state, regroup('A')));
    expect(state.pending).toEqual({ kind: 'action', side: 'B' });
    ({ state } = play(state, regroup('B')));
    expect(state.result).toEqual({ winner: 'A', reason: 'deck_out' });
  });

  it('goes to sudden death on a tie: discards are shuffled into new decks and the next goal wins', () => {
    const s = scenario({ lanes, active: 'B', score: { A: 1, B: 1 }, A: { deck: [], discard: [player('d1'), player('d2')], ...striker } });
    let { state, events } = idle(s, 3);
    expect(eventsOfType(events, 'suddenDeath')).toHaveLength(1);
    expect(state.endgame.suddenDeath).toBe(true);
    expect(state.result).toBeNull();
    // A's discards are now A's deck (A drew one of them at the start of this turn).
    expect(state.teams.A.discard).toHaveLength(0);
    expect(state.teams.A.deck.length + 1).toBe(2);
    expect(state.pending).toEqual({ kind: 'action', side: 'A' });

    state.ball = { side: 'A', pos: fwd(LAST) };
    ({ state } = play(state, { type: 'shoot', side: 'A' }));
    expect(state.result).toEqual({ winner: 'A', reason: 'sudden_death' });
  });

  it('is a draw if a deck runs out again during sudden death', () => {
    const s = scenario({ lanes, active: 'B', score: { A: 0, B: 0 }, A: { deck: [] } });
    s.endgame.suddenDeath = true;
    const { state } = play(s, regroup('B'));
    expect(state.result).toEqual({ winner: null, reason: 'draw' });
  });

  it("doesn't end the game when a spell draws from an empty deck", () => {
    const recall = actionSpell('recall', { effect: 'recall', params: { count: 2 } });
    const s = scenario({ lanes, A: { deck: [player('last card')], hand: [recall] } });
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'recall'), caster: fwd(0), target: { kind: 'none' } });
    expect(eventsOfType(events, 'drew')[0]).toMatchObject({ side: 'A', count: 1, reason: 'recall' });
    expect(eventsOfType(events, 'deckOut')).toHaveLength(0);
    expect(state.endgame.finalTurnFor).toBeNull();
  });

  it('still has a faceoff after a goal that ties the game in the final turn, then sudden death', () => {
    const s = scenario({ lanes, score: { A: 0, B: 1 }, ball: { side: 'A', pos: fwd(LAST) }, A: striker });
    s.endgame.finalTurnFor = 'A';
    let { state } = play(s, { type: 'shoot', side: 'A' });
    expect(state.pending).toEqual({ kind: 'faceoffLane', side: 'B' });
    const { state: after, events } = play(state, { type: 'faceoffLane', side: 'B', lane: 0 });
    expect(eventsOfType(events, 'suddenDeath')).toHaveLength(1);
    expect(after.pending).toEqual({ kind: 'action', side: 'B' });
  });

  it('stops at the safety cap on turns and records it as a draw', () => {
    const s = scenario({ lanes, config: { maxTurns: 4 } });
    const { state } = idle(s, 10);
    expect(state.turn).toBe(4);
    expect(state.result).toEqual({ winner: null, reason: 'turn_cap' });
  });
});
