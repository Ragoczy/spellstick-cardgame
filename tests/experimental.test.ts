// Experimental rule switches used by simulation what-ifs. They are off by default, and the
// real rules (RULES.md) don't include them. (Dice in every contest and catch and shoot started
// here and became rules in v0.16: see tests/rules/dice.test.ts and tackle.test.ts.)
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { applyAction } from '../src/engine/reducer';
import { LANE_COUNTS, boost, eventsOfType, fwd, lastContest, mid, play, player, scenario } from './helpers';

describe.each(LANE_COUNTS)('experimental switches (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('are off by default', () => {
    expect(DEFAULT_CONFIG.diceMode).toBe('both');
  });

  it("diceBudget ('self'): a spent roll adds a die to your side only, and the other player may answer", () => {
    const s = scenario({ lanes, config: { diceBudget: 2, diceTokens: 'call', diceMode: 'self' } });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'callDice', side: 'A', roll: true });
    const rolled = eventsOfType(events, 'diceRolled')[0]!;
    expect(rolled.attackerRoll).toBeGreaterThanOrEqual(1);
    expect(rolled.defenderRoll).toBeUndefined();
    expect(state.pending).toMatchObject({ kind: 'callDice', side: 'B' });
  });

  it('passTiesGoTo: defender (the rule before v0.4) gives tied passes to the interceptor', () => {
    const s = scenario({ lanes, config: { passTiesGoTo: 'defender' } }); // fillers: 3 vs 3
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(lastContest(events).winner).toBe('B');
    expect(state.ball).toEqual({ side: 'B', pos: { area: 'defense', lane: LAST } });
  });

  it("protectCatch: all protects any player who just caught a pass", () => {
    const s = scenario({ lanes, config: { protectCatch: 'all' }, A: { lineup: { midfield: { [LAST]: player('A mid', { speed: 6 }) } } } });
    const { state } = play(s, { type: 'pass', side: 'A', to: mid(LAST) });
    expect(state.ballProtected).toBe(true);
  });
});
