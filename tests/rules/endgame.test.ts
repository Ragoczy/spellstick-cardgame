// RULES.md "End of the game": 3 goals, full time when the cards run out, the penalty
// shootout, and the turn cap.
import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/engine/actions';
import type { FieldCardDef } from '../../src/engine/cards';
import { allFieldPositions, type FieldPos, type Side } from '../../src/engine/field';
import { applyAction } from '../../src/engine/reducer';
import type { GameState } from '../../src/engine/state';
import type { GameEvent } from '../../src/engine/events';
import { LANE_COUNTS, actionSpell, boost, dfn, eventsOfType, fwd, goalie, lastContest, play, player, scenario, uid, type SideSpec } from '../helpers';

const regroup = (side: Side): Action => ({ type: 'regroup', side, discard: [] });

/** Plays "do nothing" actions until the game stops waiting for actions (or `max` actions pass). */
function idle(state: GameState, max = 20) {
  let s = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < max && s.pending.kind === 'action'; i++) {
    const result = applyAction(s, regroup(s.pending.side));
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

/** Every field player on a side with the given Shot. */
function allShooters(lanes: number, shot: number, name: string): SideSpec['lineup'] {
  const lineup: Record<string, Record<number, FieldCardDef>> = {};
  for (const pos of allFieldPositions(lanes)) {
    (lineup[pos.area] ??= {})[pos.lane] = player(`${name} ${pos.area} ${pos.lane}`, { shot });
  }
  return lineup;
}

/** A game at the start of a penalty shootout, with A shooting first. */
function shootout(lanes: number, A: SideSpec, B: SideSpec): GameState {
  const s = scenario({ lanes, A, B, score: { A: 1, B: 1 }, ball: null });
  s.shootout = { first: 'A', taken: { A: 0, B: 0 }, goals: { A: 0, B: 0 }, shooters: [] };
  s.pending = { kind: 'shootoutPick', side: 'A' };
  return s;
}

/** Takes penalties with the given shooters, alternating A then B. */
function shoot(state: GameState, picks: FieldPos[]) {
  let s = state;
  const events: GameEvent[] = [];
  for (const pos of picks) {
    if (s.pending.kind !== 'shootoutPick') break;
    const result = applyAction(s, { type: 'shootoutPick', side: s.pending.side, pos });
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

  it('at full time (a deck is empty at the draw), that player still plays, the opponent takes the last turn, and more goals wins', () => {
    const s = scenario({ lanes, active: 'B', score: { A: 1, B: 0 }, A: { deck: [] } });
    let { state, events } = play(s, regroup('B'));
    expect(eventsOfType(events, 'deckOut')).toEqual([{ type: 'deckOut', side: 'A', finalTurnFor: 'B' }]);
    expect(state.pending).toEqual({ kind: 'action', side: 'A' });
    expect(eventsOfType(events, 'drew')).toHaveLength(0);

    ({ state } = idle(state, 2)); // A's two actions
    expect(state.pending).toEqual({ kind: 'action', side: 'B' });
    ({ state } = idle(state, 2)); // B's last turn
    expect(state.result).toEqual({ winner: 'A', reason: 'time' });
  });

  it('goes to a penalty shootout when tied at full time; the team that did not take the last turn shoots first', () => {
    const s = scenario({ lanes, active: 'B', score: { A: 1, B: 1 }, A: { deck: [] } });
    const { state, events } = idle(s);
    expect(eventsOfType(events, 'shootoutStarted')).toEqual([{ type: 'shootoutStarted', first: 'A' }]);
    expect(state.result).toBeNull();
    expect(state.pending).toEqual({ kind: 'shootoutPick', side: 'A' });
  });

  it("compares the shooter's Shot with the goalie's Save, and reaction spells can be played", () => {
    const s = shootout(lanes,
      { lineup: allShooters(lanes, 4, 'A'), hand: [boost('A boost')] },
      { goalie: goalie('B goalie', 5) });
    const { state } = shoot(s, [dfn(0)]);
    expect(state.pending).toMatchObject({ kind: 'reaction', side: 'A' });
    const { state: after, events } = play(state, { type: 'react', side: 'A', card: uid(s, 'A', 'A boost') });
    expect(lastContest(events)).toMatchObject({ kind: 'penalty', winner: 'A' });
    expect(eventsOfType(events, 'penalty')[0]).toMatchObject({ side: 'A', scored: true, goals: { A: 1, B: 0 } });
    expect(after.pending).toEqual({ kind: 'shootoutPick', side: 'B' });
  });

  it('adds the penalty bonus (a tuning value, 0 by default) to the shooter', () => {
    const s = shootout(lanes, { lineup: allShooters(lanes, 3, 'A') }, { goalie: goalie('B goalie', 4) });
    s.config = { ...s.config, penaltyBonus: 2 };
    const { events } = shoot(s, [dfn(0)]);
    expect(lastContest(events).attacker.total).toBe(5);
    expect(lastContest(events).winner).toBe('A');
  });

  it('stops early once one team cannot catch up in the first 3 rounds', () => {
    const s = shootout(lanes, { lineup: allShooters(lanes, 6, 'A') }, { lineup: allShooters(lanes, 1, 'B') });
    // A scores, B misses, A scores, B misses: 2–0 with B having one shot left.
    const { state, events } = shoot(s, [dfn(0), dfn(0), dfn(LAST), dfn(LAST), fwd(0), fwd(0)]);
    expect(eventsOfType(events, 'penalty')).toHaveLength(4);
    expect(state.result).toEqual({ winner: 'A', reason: 'shootout' });
  });

  it('goes to one shot each after 3 rounds, until one team scores and the other misses', () => {
    const A = allShooters(lanes, 6, 'A')!;
    A.defense![0] = player('A weak', { shot: 1 });
    const s = shootout(lanes, { lineup: A }, { lineup: allShooters(lanes, 6, 'B') });
    const picks = [fwd(0), fwd(0), fwd(LAST), fwd(LAST), { area: 'midfield', lane: 0 } as FieldPos, { area: 'midfield', lane: 0 } as FieldPos, dfn(0), dfn(0)];
    const { state, events } = shoot(s, picks);
    expect(eventsOfType(events, 'penalty')).toHaveLength(8);
    expect(state.result).toEqual({ winner: 'B', reason: 'shootout' });
  });

  it('lets each player take only one penalty, and is a draw if a team runs out of shooters', () => {
    const s = shootout(lanes, { lineup: allShooters(lanes, 6, 'A') }, { lineup: allShooters(lanes, 6, 'B') });
    let { state } = shoot(s, [dfn(0)]);
    expect(() => applyAction(state, { type: 'shootoutPick', side: 'B', pos: dfn(0) })).not.toThrow();
    ({ state } = shoot(state, [dfn(0)]));
    expect(() => applyAction(state, { type: 'shootoutPick', side: 'A', pos: dfn(0) })).toThrow('Each player can only take one penalty.');

    const everyone = allFieldPositions(lanes).slice(1).flatMap((pos) => [pos, pos]);
    const { state: end, events } = shoot(state, everyone);
    expect(eventsOfType(events, 'penalty')).toHaveLength(everyone.length);
    expect(end.result).toEqual({ winner: null, reason: 'draw' });
  });

  it("doesn't end the game when a spell draws from an empty deck", () => {
    const recall = actionSpell('recall', { effect: 'recall', params: { count: 2 } });
    const s = scenario({ lanes, A: { deck: [player('last card')], hand: [recall] } });
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'recall'), caster: fwd(0), target: { kind: 'none' } });
    expect(eventsOfType(events, 'drew')[0]).toMatchObject({ side: 'A', count: 1, reason: 'recall' });
    expect(eventsOfType(events, 'deckOut')).toHaveLength(0);
    expect(state.endgame.finalTurnFor).toBeNull();
  });

  it('still has a faceoff after a goal that ties the game in the final turn, then the shootout', () => {
    const s = scenario({ lanes, score: { A: 0, B: 1 }, ball: { side: 'A', pos: fwd(LAST) }, A: striker });
    s.endgame.finalTurnFor = 'A';
    let { state } = play(s, { type: 'shoot', side: 'A' });
    expect(state.pending).toEqual({ kind: 'faceoffLane', side: 'B' });
    const { state: after, events } = play(state, { type: 'faceoffLane', side: 'B', lane: 0 });
    expect(eventsOfType(events, 'shootoutStarted')).toEqual([{ type: 'shootoutStarted', first: 'B' }]);
    expect(after.pending).toEqual({ kind: 'shootoutPick', side: 'B' });
  });

  it('stops at the safety cap on turns and records it as a draw', () => {
    const s = scenario({ lanes, config: { maxTurns: 4 } });
    const { state } = idle(s, 20);
    expect(state.turn).toBe(4);
    expect(state.result).toEqual({ winner: null, reason: 'turn_cap' });
  });
});
