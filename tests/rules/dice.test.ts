// RULES.md "Dice": every contest is rolled, and each player has 3 roll tokens a game to reroll
// their own die. Online matches started before v0.16 keep the old rule (5 tokens to call for
// dice, only shots rolled); those tests are at the end.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/engine/config';
import { applyAction } from '../../src/engine/reducer';
import { createGame } from '../../src/engine/setup';
import { viewFor } from '../../src/engine/view';
import { prototypeCards } from '../../src/data/prototype';
import { LANE_COUNTS, actionSpell, boost, dfn, eventsOfType, fwd, lastContest, mid, play, scenario, uid } from '../helpers';

const ROLLED = { contestDie: DEFAULT_CONFIG.contestDie };

describe.each(LANE_COUNTS)('dice (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('give each player 3 roll tokens a game, which everyone can see', () => {
    const { state } = createGame({ seed: 1, cardSet: prototypeCards, config: { lanes } });
    expect(state.config.contestDie).toBe(6);
    expect(state.diceLeft).toEqual({ A: 3, B: 3 });
    expect(viewFor(state, 'A').diceLeft).toEqual({ A: 3, B: 3 });
  });

  it('roll every contest: both players roll a die before reaction spells, and the roll is added', () => {
    const s = scenario({ lanes, config: ROLLED, A: { hand: [boost('A boost')] } });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    const started = eventsOfType(events, 'contestStarted')[0]!;
    for (const roll of [started.attacker.roll, started.defender.roll]) {
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
    }
    // The rolls are already known when A decides on a reaction spell.
    expect(state.pending).toMatchObject({ kind: 'reaction', contest: { attacker: { roll: started.attacker.roll } } });
    const contest = lastContest(play(state, { type: 'react', side: 'A', card: null }).events);
    expect(contest.attacker.total).toBe(3 + started.attacker.roll!);
    expect(contest.attacker.printed).toBe(3);
    expect(contest.defender.parts).toEqual([{ label: 'Roll', amount: started.defender.roll }]);
  });

  it('roll tackles, shots, and hits too', () => {
    const tackle = play(scenario({ lanes, config: ROLLED, ball: { side: 'B', pos: mid(LAST) } }), { type: 'tackle', side: 'A' });
    const shot = play(scenario({ lanes, config: ROLLED, ball: { side: 'A', pos: fwd(LAST) } }), { type: 'shoot', side: 'A' });
    const flambe = actionSpell('Flambé', { effect: 'hit', params: { strength: 4 } });
    const s = scenario({ lanes, config: ROLLED, A: { hand: [flambe] } });
    const hit = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Flambé'), caster: fwd(LAST), target: { kind: 'hit' } });
    for (const { events } of [tackle, shot, hit]) {
      const started = eventsOfType(events, 'contestStarted')[0]!;
      expect(started.attacker.roll).toBeGreaterThanOrEqual(1);
      expect(started.defender.roll).toBeGreaterThanOrEqual(1);
    }
  });

  it("don't roll for an empty spot", () => {
    const s = scenario({ lanes, config: ROLLED });
    s.teams.B.lineup.defense[LAST] = null;
    const started = eventsOfType(play(s, { type: 'pass', side: 'A', to: fwd(LAST) }).events, 'contestStarted')[0]!;
    expect(started.attacker.roll).toBeGreaterThanOrEqual(1);
    expect(started.defender.roll).toBeUndefined();
  });

  it('give the same rolls for the same seed', () => {
    const s = scenario({ lanes, config: ROLLED });
    const a = eventsOfType(play(s, { type: 'pass', side: 'A', to: fwd(LAST) }).events, 'contestStarted')[0];
    const b = eventsOfType(play(s, { type: 'pass', side: 'A', to: fwd(LAST) }).events, 'contestStarted')[0];
    expect(a).toEqual(b);
  });

  it('offer a reroll after the roll and before reaction spells, attacker first', () => {
    const s = scenario({ lanes, config: ROLLED, dice: 3, A: { hand: [boost('A boost')] } });
    let { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'A', role: 'attacker' });
    ({ state } = play(state, { type: 'callDice', side: 'A', roll: false }));
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'B', role: 'defender' });
    ({ state } = play(state, { type: 'callDice', side: 'B', roll: false }));
    expect(state.pending).toMatchObject({ kind: 'reaction', side: 'A' });
    expect(state.diceLeft).toEqual({ A: 3, B: 3 });
  });

  it('reroll only your own die, and spend one token', () => {
    const s = scenario({ lanes, config: ROLLED, dice: 3 });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'callDice', side: 'A', roll: true });
    const started = eventsOfType(events, 'contestStarted')[0]!;
    const rerolled = eventsOfType(events, 'rerolled')[0]!;
    expect(rerolled).toMatchObject({ side: 'A', role: 'attacker', from: started.attacker.roll, left: { A: 2, B: 3 } });
    expect(rerolled.to).toBeGreaterThanOrEqual(1);
    expect(rerolled.to).toBeLessThanOrEqual(6);
    expect(state.diceLeft).toEqual({ A: 2, B: 3 });
    // The defender sees the new roll before deciding.
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'B', contest: { attacker: { roll: rerolled.to }, defender: { roll: started.defender.roll } } });
    const contest = lastContest(play(state, { type: 'callDice', side: 'B', roll: false }).events);
    expect(contest.attacker.total).toBe(3 + rerolled.to);
    expect(contest.defender.total).toBe(3 + started.defender.roll!);
  });

  it('can be used by the defender too, and in shots', () => {
    const s = scenario({ lanes, config: ROLLED, dice: 3, ball: { side: 'A', pos: fwd(LAST) } });
    const { state, events } = play(s, { type: 'shoot', side: 'A' }, { type: 'callDice', side: 'A', roll: false }, { type: 'callDice', side: 'B', roll: true });
    expect(eventsOfType(events, 'rerolled')[0]).toMatchObject({ side: 'B', role: 'defender' });
    expect(state.diceLeft).toEqual({ A: 3, B: 2 });
  });

  it("aren't offered to a player with no tokens left, and can't be used then", () => {
    const s = scenario({ lanes, config: ROLLED, dice: 3 });
    s.diceLeft = { A: 0, B: 1 };
    const { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'B' });
    expect(() => applyAction({ ...state, diceLeft: { A: 0, B: 0 } }, { type: 'callDice', side: 'B', roll: true })).toThrow('You have no rerolls left.');
  });

  it("aren't offered for an empty spot, which didn't roll", () => {
    const s = scenario({ lanes, config: ROLLED, dice: 3 });
    s.teams.B.lineup.defense[LAST] = null;
    let { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'A' });
    ({ state } = play(state, { type: 'callDice', side: 'A', roll: false }));
    expect(state.pending.kind).not.toBe('callDice');
  });
});

// The rule before v0.16, kept for online matches started under it.
describe.each(LANE_COUNTS)('dice before v0.16: calling for dice (%i lanes)', (lanes) => {
  const LAST = lanes - 1;
  const OLD = { contestDie: 0, diceTokens: 'call' as const };

  it('are offered after the reveal and before reaction spells, attacker first', () => {
    const s = scenario({ lanes, config: OLD, dice: 5, A: { hand: [boost('A boost')] } });
    let { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(eventsOfType(events, 'revealed')).toHaveLength(2);
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'A', role: 'attacker' });
    ({ state } = play(state, { type: 'callDice', side: 'A', roll: false }));
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'B', role: 'defender' });
    ({ state } = play(state, { type: 'callDice', side: 'B', roll: false }));
    expect(state.pending).toMatchObject({ kind: 'reaction', side: 'A' });
  });

  it('when called, make both players roll and add it; only the caller spends a roll', () => {
    const s = scenario({ lanes, config: OLD, dice: 5 });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'callDice', side: 'A', roll: true });
    const rolled = eventsOfType(events, 'diceRolled')[0]!;
    expect(rolled).toMatchObject({ caller: 'A', attacker: 'A', left: { A: 4, B: 5 } });
    const contest = lastContest(events);
    expect(contest.attacker.total).toBe(3 + rolled.attackerRoll!);
    expect(contest.defender.total).toBe(3 + rolled.defenderRoll!);
    expect(state.diceLeft).toEqual({ A: 4, B: 5 });
  });

  it('can be called by the defender if the attacker passes on them', () => {
    const s = scenario({ lanes, config: OLD, dice: 5 });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'callDice', side: 'A', roll: false }, { type: 'callDice', side: 'B', roll: true });
    expect(eventsOfType(events, 'diceRolled')[0]).toMatchObject({ caller: 'B' });
    expect(state.diceLeft).toEqual({ A: 5, B: 4 });
  });

  it("aren't offered to a player with no rolls left, and can't be called then", () => {
    const s = scenario({ lanes, config: OLD, dice: 5 });
    s.diceLeft = { A: 0, B: 1 };
    const { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'B' });
    expect(() => applyAction({ ...state, diceLeft: { A: 0, B: 0 } }, { type: 'callDice', side: 'B', roll: true })).toThrow('You have no rolls left.');
  });

  it("don't roll for an empty spot", () => {
    const s = scenario({ lanes, config: OLD, dice: 5 });
    s.teams.B.lineup.defense[LAST] = null;
    const { events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'callDice', side: 'A', roll: true });
    const rolled = eventsOfType(events, 'diceRolled')[0]!;
    expect(rolled.attackerRoll).toBeGreaterThanOrEqual(1);
    expect(rolled.defenderRoll).toBeUndefined();
  });

  it("can't be called in a shot, which is already rolled; a pass still can", () => {
    const old = { ...OLD, shotDie: 6 };
    const s = scenario({ lanes, config: old, dice: 5, ball: { side: 'A', pos: fwd(LAST) } });
    expect(play(s, { type: 'shoot', side: 'A' }).state.pending.kind).not.toBe('callDice');
    const pass = scenario({ lanes, config: old, dice: 5 });
    expect(play(pass, { type: 'pass', side: 'A', to: fwd(LAST) }).state.pending.kind).toBe('callDice');
  });

  it('a tackle in an old match is not rolled unless someone calls for dice', () => {
    const s = scenario({ lanes, config: OLD, ball: { side: 'B', pos: dfn(LAST) } });
    const started = eventsOfType(play(s, { type: 'tackle', side: 'A' }).events, 'contestStarted')[0]!;
    expect(started.attacker.roll).toBeUndefined();
  });
});
