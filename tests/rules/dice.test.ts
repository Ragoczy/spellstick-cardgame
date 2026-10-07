// RULES.md "Dice": each player has 5 rolls a game; calling for dice makes both players roll.
import { describe, expect, it } from 'vitest';
import { applyAction } from '../../src/engine/reducer';
import { createGame } from '../../src/engine/setup';
import { viewFor } from '../../src/engine/view';
import { prototypeCards } from '../../src/data/prototype';
import { LANE_COUNTS, boost, eventsOfType, fwd, lastContest, play, scenario } from '../helpers';

describe.each(LANE_COUNTS)('dice (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('give each player 5 rolls a game, which everyone can see', () => {
    const { state } = createGame({ seed: 1, cardSet: prototypeCards, config: { lanes } });
    expect(state.diceLeft).toEqual({ A: 5, B: 5 });
    expect(viewFor(state, 'A').diceLeft).toEqual({ A: 5, B: 5 });
  });

  it('are offered after the reveal and before reaction spells, attacker first', () => {
    const s = scenario({ lanes, dice: 5, A: { hand: [boost('A boost')] } });
    let { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(eventsOfType(events, 'revealed')).toHaveLength(2);
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'A', role: 'attacker' });
    ({ state } = play(state, { type: 'callDice', side: 'A', roll: false }));
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'B', role: 'defender' });
    ({ state } = play(state, { type: 'callDice', side: 'B', roll: false }));
    expect(state.pending).toMatchObject({ kind: 'reaction', side: 'A' });
  });

  it('when called, make both players roll and add it; only the caller spends a roll', () => {
    const s = scenario({ lanes, dice: 5 });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'callDice', side: 'A', roll: true });
    const rolled = eventsOfType(events, 'diceRolled')[0]!;
    expect(rolled).toMatchObject({ caller: 'A', attacker: 'A', left: { A: 4, B: 5 } });
    const contest = lastContest(events);
    expect(contest.attacker.total).toBe(3 + rolled.attackerRoll!);
    expect(contest.defender.total).toBe(3 + rolled.defenderRoll!);
    expect(contest.attacker.parts).toContainEqual({ label: 'Roll', amount: rolled.attackerRoll });
    expect(state.diceLeft).toEqual({ A: 4, B: 5 });
  });

  it('can be called by the defender if the attacker passes on them', () => {
    const s = scenario({ lanes, dice: 5 });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'callDice', side: 'A', roll: false }, { type: 'callDice', side: 'B', roll: true });
    expect(eventsOfType(events, 'diceRolled')[0]).toMatchObject({ caller: 'B' });
    expect(state.diceLeft).toEqual({ A: 5, B: 4 });
  });

  it("aren't offered to a player with no rolls left, and can't be called then", () => {
    const s = scenario({ lanes, dice: 5 });
    s.diceLeft = { A: 0, B: 1 };
    const { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'B' });
    expect(() => applyAction({ ...state, diceLeft: { A: 0, B: 0 } }, { type: 'callDice', side: 'B', roll: true })).toThrow('You have no rolls left.');
  });

  it("don't roll for an empty spot", () => {
    const s = scenario({ lanes, dice: 5 });
    s.teams.B.lineup.defense[LAST] = null;
    const { events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'callDice', side: 'A', roll: true });
    const rolled = eventsOfType(events, 'diceRolled')[0]!;
    expect(rolled.attackerRoll).toBeGreaterThanOrEqual(1);
    expect(rolled.defenderRoll).toBeUndefined();
  });
});
