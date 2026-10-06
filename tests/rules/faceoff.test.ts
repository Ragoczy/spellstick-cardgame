// RULES.md "Faceoff".
import { describe, expect, it } from 'vitest';
import type { Side } from '../../src/engine/field';
import type { GameState } from '../../src/engine/state';
import { LANE_COUNTS, boost, eventsOfType, lastContest, mid, play, player, scenario, uid, type ScenarioOptions } from '../helpers';

/** A game waiting for `chooser` to pick a faceoff lane, partway through (turn 5, A just scored). */
function faceoffScenario(chooser: Side, options: ScenarioOptions): GameState {
  const s = scenario({ ...options, ball: null, turn: 5, active: chooser === 'A' ? 'B' : 'A' });
  s.faceoffChooser = chooser;
  s.pending = { kind: 'faceoffLane', side: chooser };
  return s;
}

describe.each(LANE_COUNTS)('faceoff (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('compares the two midfielders in the chosen lane using the Faceoff stat', () => {
    const s = faceoffScenario('B', {
      lanes,
      A: { lineup: { midfield: { [LAST]: player('A mid', { faceoff: 4, speed: 1 }) } } },
      B: { lineup: { midfield: { [LAST]: player('B mid', { faceoff: 2, speed: 6 }) } } },
    });
    const { state, events } = play(s, { type: 'faceoffLane', side: 'B', lane: LAST });
    const contest = lastContest(events);
    expect(contest.kind).toBe('faceoff');
    expect(contest.attacker.total).toBe(2);
    expect(contest.defender.total).toBe(4);
    expect(state.ball).toEqual({ side: 'A', pos: mid(LAST) });
  });

  it('reveals both midfielders', () => {
    const s = faceoffScenario('B', { lanes });
    const { state } = play(s, { type: 'faceoffLane', side: 'B', lane: LAST });
    expect(state.teams.A.lineup.midfield[LAST]!.revealed).toBe(true);
    expect(state.teams.B.lineup.midfield[LAST]!.revealed).toBe(true);
    expect(state.teams.A.lineup.midfield[0 === LAST ? 1 : 0]!.revealed).toBe(false);
  });

  it('gives ties to the team choosing the lane', () => {
    const s = faceoffScenario('B', { lanes }); // all fillers have Faceoff 3
    const { state, events } = play(s, { type: 'faceoffLane', side: 'B', lane: 0 });
    expect(lastContest(events).winner).toBe('B');
    expect(state.ball).toEqual({ side: 'B', pos: mid(0) });
  });

  it('lets the chooser play a reaction spell first, then the other team', () => {
    const s = faceoffScenario('A', {
      lanes,
      A: { hand: [boost('A boost')] },
      B: { hand: [boost('B boost')] },
    });
    let { state } = play(s, { type: 'faceoffLane', side: 'A', lane: 0 });
    expect(state.pending).toMatchObject({ kind: 'reaction', side: 'A', role: 'attacker' });
    ({ state } = play(state, { type: 'react', side: 'A', card: uid(state, 'A', 'A boost') }));
    expect(state.pending).toMatchObject({ kind: 'reaction', side: 'B', role: 'defender' });
    const { events } = play(state, { type: 'react', side: 'B', card: uid(state, 'B', 'B boost') });
    // 3 + 2 vs 3 + 2: tie goes to the chooser.
    expect(lastContest(events).winner).toBe('A');
  });

  it('is not a turn: the team that was scored on takes the next turn whoever wins', () => {
    // A just scored on its turn 5, so B chooses. A wins the faceoff, but B still plays next.
    const s = faceoffScenario('B', {
      lanes,
      A: { lineup: { midfield: { 0: player('A mid', { faceoff: 6 }) } } },
    });
    const { state, events } = play(s, { type: 'faceoffLane', side: 'B', lane: 0 });
    expect(state.ball?.side).toBe('A');
    expect(eventsOfType(events, 'turnStarted')).toEqual([{ type: 'turnStarted', side: 'B', turn: 6 }]);
    expect(state.pending).toEqual({ kind: 'action', side: 'B' });
  });
});
