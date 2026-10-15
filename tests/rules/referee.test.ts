// RULES.md "Fouls and the referee" (v0.17): dirty plays are declared before the dice, and if the
// two contest dice match, the referee sends every player who fouled off for the game.
//
// The dice are rigged by choosing the RNG state: the attacker's die is rolled first, then the
// defender's, then any rerolls in order.
import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../../src/engine/config';
import { IllegalActionError } from '../../src/engine/reducer';
import { randomInt } from '../../src/engine/rng';
import type { GameState } from '../../src/engine/state';
import { findProblems } from '../../src/sim/invariants';
import {
  LANE_COUNTS, boost, dfn, eventsOfType, fwd, goalie, lastContest, play, player, reaction, scenario, uid, GOAL_POS,
} from '../helpers';

const redMist = (name = 'Red Mist') => reaction(name, { effect: 'dirty_play', params: {} });
/** Every contest rolled, and every hurt only Shaken, so the referee is the only thing being tested. */
const ROLLED: Partial<GameConfig> = { contestDie: 6, severity: { shaken: 6, injured: 6 } };

/** Sets the RNG so the next dice come out as `want` says (given the list of rolls, 1 to 6). */
function rigDice(s: GameState, count: number, want: (rolls: number[]) => boolean): GameState {
  for (let start = 1; ; start++) {
    let rng = start;
    const rolls: number[] = [];
    for (let i = 0; i < count; i++) {
      let r: number;
      [r, rng] = randomInt(rng, 6);
      rolls.push(r + 1);
    }
    if (want(rolls)) return { ...s, rng: start };
  }
}
const doubles = ([a, b]: number[]) => a === b;
const noDoubles = ([a, b]: number[]) => a !== b;

describe.each(LANE_COUNTS)('fouls and the referee (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  /** A passes to its strong forward, holding a dirty play (and maybe more). B's defender is weak. */
  function passWithFoul(extra: { aHand?: ReturnType<typeof redMist>[]; bHand?: ReturnType<typeof redMist>[]; dice?: number } = {}) {
    return scenario({
      lanes, config: ROLLED, dice: extra.dice,
      A: { hand: [redMist(), ...(extra.aHand ?? [])], lineup: { forward: { [LAST]: player('A fwd', { speed: 6 }, { affinities: ['earth', 'fire'] }) } } },
      B: { hand: extra.bHand ?? [], lineup: { defense: { [LAST]: player('B def', { defense: 0 }, { affinities: ['earth', 'fire'] }) } } },
    });
  }
  const pass = { type: 'pass', side: 'A', to: fwd(LAST) } as const;
  const foulA = (s: GameState) => ({ type: 'foul', side: 'A', card: uid(s, 'A', 'Red Mist') }) as const;

  it('a foul is declared before the dice are rolled', () => {
    const { state, events } = play(passWithFoul(), pass);
    expect(state.pending).toMatchObject({ kind: 'foul', side: 'A', role: 'attacker' });
    expect(eventsOfType(events, 'contestStarted')).toHaveLength(0);
  });

  it('a foul uses up your reaction spell for the contest', () => {
    const s = passWithFoul({ aHand: [boost('A boost')] });
    const { events } = play(s, pass, foulA(s));
    expect(eventsOfType(events, 'spellCast')).toEqual([expect.objectContaining({ side: 'A', foul: true })]);
    expect(eventsOfType(events, 'contestResolved')).toHaveLength(1); // no reaction was asked for
  });

  it("a dirty play can't be played after the dice, as a reaction", () => {
    const s = passWithFoul({ aHand: [boost('A boost')] });
    const { state } = play(s, pass, { type: 'foul', side: 'A', card: null });
    expect(state.pending).toMatchObject({ kind: 'reaction', side: 'A' });
    expect(() => play(state, { type: 'react', side: 'A', card: uid(s, 'A', 'Red Mist') })).toThrow(IllegalActionError);
  });

  it('doubles: the referee sends the fouler off, the spot stays empty, and the ball goes to the opposing player', () => {
    const s = rigDice(passWithFoul(), 2, doubles);
    const { state, events } = play(s, pass, foulA(s));
    expect(lastContest(events).winner).toBe('A');
    const sentOff = eventsOfType(events, 'sentOff');
    expect(sentOff).toEqual([expect.objectContaining({ side: 'A', pos: fwd(LAST) })]);
    expect(state.teams.A.lineup.forward[LAST]).toBeNull();
    expect(state.teams.A.discard).toContain(uid(s, 'A', 'A fwd'));
    expect(state.pending.kind).not.toBe('forcedSub'); // no free replacement
    expect(state.ball).toEqual({ side: 'B', pos: dfn(LAST) });
    expect(findProblems(state)).toEqual([]);
  });

  it('a caught foul still takes effect if its side won', () => {
    const s = rigDice(passWithFoul(), 2, doubles);
    const { events } = play(s, pass, foulA(s));
    expect(eventsOfType(events, 'hurt')).toEqual([expect.objectContaining({ side: 'B', source: 'dirty_play' })]);
  });

  it('no doubles: nothing happens to the fouler', () => {
    const s = rigDice(passWithFoul(), 2, noDoubles);
    const { state, events } = play(s, pass, foulA(s));
    expect(eventsOfType(events, 'sentOff')).toHaveLength(0);
    expect(state.teams.A.lineup.forward[LAST]).not.toBeNull();
  });

  it('when both sides foul, doubles send both off', () => {
    const s = rigDice(passWithFoul({ bHand: [redMist('Jolt')] }), 2, doubles);
    const { events } = play(s, pass, foulA(s), { type: 'foul', side: 'B', card: uid(s, 'B', 'Jolt') });
    expect(eventsOfType(events, 'sentOff').map((e) => e.side).sort()).toEqual(['A', 'B']);
  });

  it('doubles are judged on the final dice: a reroll can break them', () => {
    // Rolled a double, then the fouler rerolls into something different.
    const s = rigDice(passWithFoul({ dice: 1 }), 3, ([a, b, c]) => a === b && c !== b);
    const { events } = play(s, pass, foulA(s), { type: 'callDice', side: 'A', roll: true }, { type: 'callDice', side: 'B', roll: false });
    expect(eventsOfType(events, 'rerolled')).toHaveLength(1);
    expect(eventsOfType(events, 'sentOff')).toHaveLength(0);
  });

  it('...and the other side can reroll hoping to make one', () => {
    const s = rigDice(passWithFoul({ dice: 1 }), 3, ([a, b, c]) => a !== b && c === a);
    const { events } = play(s, pass, foulA(s), { type: 'callDice', side: 'A', roll: false }, { type: 'callDice', side: 'B', roll: true });
    expect(eventsOfType(events, 'sentOff')).toEqual([expect.objectContaining({ side: 'A' })]);
  });

  it('a goalie can be sent off too, leaving an empty goal', () => {
    const base = scenario({
      lanes, config: ROLLED, ball: { side: 'A', pos: fwd(0) },
      A: { lineup: { forward: { 0: player('A fwd', { shot: 0 }) } } },
      B: { goalie: goalie('B goalie', 6, { affinities: ['earth', 'fire'] }), hand: [redMist()] },
    });
    const s = rigDice(base, 2, doubles);
    const { state, events } = play(s, { type: 'shoot', side: 'A' }, { type: 'foul', side: 'B', card: uid(s, 'B', 'Red Mist') });
    expect(lastContest(events).winner).toBe('B');
    expect(eventsOfType(events, 'sentOff')).toEqual([expect.objectContaining({ side: 'B', pos: GOAL_POS })]);
    expect(state.teams.B.goalie).toBeNull();
    expect(findProblems(state)).toEqual([]);
  });

  it('before v0.17, a dirty play is a reaction after the dice, and there is no referee', () => {
    const base = scenario({
      lanes, config: { ...ROLLED, foulTiming: 'reaction' },
      A: { hand: [redMist()], lineup: { forward: { [LAST]: player('A fwd', { speed: 6 }) } } },
      B: { lineup: { defense: { [LAST]: player('B def', { defense: 0 }) } } },
    });
    const s = rigDice(base, 2, doubles);
    const { state } = play(s, pass);
    expect(state.pending).toMatchObject({ kind: 'reaction', side: 'A' });
    const { events } = play(state, { type: 'react', side: 'A', card: uid(s, 'A', 'Red Mist') });
    expect(eventsOfType(events, 'sentOff')).toHaveLength(0);
    expect(eventsOfType(events, 'hurt')).toHaveLength(1);
  });
});
