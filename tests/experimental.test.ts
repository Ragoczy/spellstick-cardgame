// Experimental rule switches used by simulation what-ifs. They are off by default, and the
// real rules (RULES.md) don't include them.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { applyAction } from '../src/engine/reducer';
import { LANE_COUNTS, boost, eventsOfType, fwd, lastContest, mid, play, player, scenario } from './helpers';

describe.each(LANE_COUNTS)('experimental switches (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('are off by default', () => {
    expect(DEFAULT_CONFIG.protectCatch).toBe('off');
    expect(DEFAULT_CONFIG.contestDie).toBe(0);
  });

  it('contestDie: each player rolls before reaction spells, and the roll is added to their value', () => {
    const s = scenario({ lanes, config: { contestDie: 6 }, A: { hand: [boost('A boost')] } });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    const started = eventsOfType(events, 'contestStarted')[0]!;
    expect(started.attacker.roll).toBeGreaterThanOrEqual(1);
    expect(started.attacker.roll).toBeLessThanOrEqual(6);
    expect(started.defender.roll).toBeGreaterThanOrEqual(1);
    // The rolls are already known when A decides on a reaction spell.
    expect(state.pending).toMatchObject({ kind: 'reaction', contest: { attacker: { roll: started.attacker.roll } } });
    const { events: after } = play(state, { type: 'react', side: 'A', card: null });
    const contest = lastContest(after);
    expect(contest.attacker.total).toBe(3 + started.attacker.roll!);
    expect(contest.attacker.printed).toBe(3);
    expect(contest.defender.parts).toEqual([{ label: 'Roll', amount: started.defender.roll }]);
  });

  it("diceBudget ('both'): spending a roll makes both players roll, and only the caller pays", () => {
    const s = scenario({ lanes, config: { diceBudget: 3, diceMode: 'both' } });
    const { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'A', role: 'attacker' });
    const { state: after, events } = play(state, { type: 'callDice', side: 'A', roll: true });
    const rolled = eventsOfType(events, 'diceRolled')[0]!;
    expect(rolled.attackerRoll).toBeGreaterThanOrEqual(1);
    expect(rolled.defenderRoll).toBeGreaterThanOrEqual(1);
    expect(after.diceLeft).toEqual({ A: 2, B: 3 });
    // The defender isn't asked: both have already rolled.
    const contest = lastContest(events);
    expect(contest.attacker.total).toBe(3 + rolled.attackerRoll!);
    expect(contest.defender.total).toBe(3 + rolled.defenderRoll!);
  });

  it("diceBudget: if the attacker doesn't roll, the defender may; with none left, nobody is asked", () => {
    const s = scenario({ lanes, config: { diceBudget: 1, diceMode: 'both' } });
    let { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'callDice', side: 'A', roll: false });
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'B', role: 'defender' });
    ({ state } = play(state, { type: 'callDice', side: 'B', roll: true }));
    expect(state.diceLeft).toEqual({ A: 1, B: 0 });
    expect(() => applyAction({ ...s, diceLeft: { A: 0, B: 0 } }, { type: 'pass', side: 'A', to: fwd(LAST) })).not.toThrow();
    const none = play({ ...s, diceLeft: { A: 0, B: 0 } }, { type: 'pass', side: 'A', to: fwd(LAST) }).state;
    expect(none.pending.kind).not.toBe('callDice');
  });

  it("diceBudget ('self'): a spent roll adds a die to your side only, and the other player may answer", () => {
    const s = scenario({ lanes, config: { diceBudget: 2, diceMode: 'self' } });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'callDice', side: 'A', roll: true });
    const rolled = eventsOfType(events, 'diceRolled')[0]!;
    expect(rolled.attackerRoll).toBeGreaterThanOrEqual(1);
    expect(rolled.defenderRoll).toBeUndefined();
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'B' });
  });

  it('contestDie: the same seed gives the same rolls', () => {
    const s = scenario({ lanes, config: { contestDie: 6 } });
    const a = eventsOfType(play(s, { type: 'pass', side: 'A', to: fwd(LAST) }).events, 'contestStarted')[0];
    const b = eventsOfType(play(s, { type: 'pass', side: 'A', to: fwd(LAST) }).events, 'contestStarted')[0];
    expect(a).toEqual(b);
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
