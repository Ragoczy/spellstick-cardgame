// RULES.md "The penalty box" (v0.17): an attacker whose final die is a 1 rolls the penalty die,
// and another 1 sends them to the penalty box.
//
// The dice are rigged by choosing the RNG state: the attacker's die, the defender's die, any
// rerolls, then the contact rolls (Toughness, severity), then the penalty die.
import { describe, expect, it } from 'vitest';
import type { PhysicalCardDef } from '../../src/engine/cards';
import type { GameConfig } from '../../src/engine/config';
import { legalActions } from '../../src/engine/legal';
import { randomInt } from '../../src/engine/rng';
import type { GameState } from '../../src/engine/state';
import { viewFor } from '../../src/engine/view';
import { findProblems } from '../../src/sim/invariants';
import { LANE_COUNTS, eventsOfType, fwd, goalie, mid, physicalCard, play, player, scenario, uid } from '../helpers';

const ROLLED: Partial<GameConfig> = { contestDie: 6 };

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

/** A Shirt Pull (no Toughness roll), so the only dice are the contest's and the penalty die. */
const shirtPull = (overrides: Partial<PhysicalCardDef> = {}) => physicalCard('Shirt Pull', { toughness: null, severity: null, ...overrides });

describe.each(LANE_COUNTS)('the penalty box (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  /** A's strong midfielder attacks B's ball carrier in the last lane, flipping `card` from the Physical pile. */
  function setup(card: PhysicalCardDef, extra: { config?: Partial<GameConfig>; dice?: number; aHand?: ReturnType<typeof player>[] } = {}) {
    return scenario({
      lanes, config: { ...ROLLED, ...extra.config }, dice: extra.dice, ball: { side: 'B', pos: mid(LAST) },
      A: { physical: [card], hand: extra.aHand ?? [], lineup: { midfield: { [LAST]: player('A mid', { speed: 9 }) } } },
      B: { lineup: { midfield: { [LAST]: player('B mid', { speed: 0, toughness: 10 }) } } },
    });
  }
  const attack = (s: GameState) => play(s, { type: 'attack', side: 'A', attacker: mid(LAST), target: mid(LAST) });

  it('a 1, then another 1 on the penalty die: the referee calls a penalty, and the spot is empty', () => {
    const s = rigDice(setup(shirtPull()), 3, ([a, , p]) => a === 1 && p === 1);
    const { state, events } = attack(s);
    expect(eventsOfType(events, 'penaltyCheck')).toEqual([expect.objectContaining({ side: 'A', roll: 1, called: true })]);
    expect(eventsOfType(events, 'penalized')).toEqual([expect.objectContaining({ side: 'A', pos: mid(LAST), turns: 1 })]);
    expect(state.teams.A.lineup.midfield[LAST]).toBeNull();
    expect(state.teams.A.penaltyBox).toEqual([{ uid: uid(s, 'A', 'A mid'), pos: mid(LAST), turnsLeft: 1, since: 1 }]);
    // The attack still resolved: it won, so A took the ball, which then goes to the opposing player.
    expect(state.ball).toEqual({ side: 'B', pos: mid(LAST) });
    expect(viewFor(state, 'B').opponent.penaltyBox).toEqual([expect.objectContaining({ pos: mid(LAST), turnsLeft: 1 })]);
    expect(findProblems(state)).toEqual([]);
  });

  it('a 1, then anything else: no penalty', () => {
    const s = rigDice(setup(shirtPull()), 3, ([a, , p]) => a === 1 && p !== 1);
    const { state, events } = attack(s);
    expect(eventsOfType(events, 'penaltyCheck')).toEqual([expect.objectContaining({ called: false })]);
    expect(state.teams.A.penaltyBox).toEqual([]);
  });

  it('no 1 on the attacker\'s die: no penalty check at all', () => {
    const s = rigDice(setup(shirtPull()), 2, ([a]) => a !== 1);
    expect(eventsOfType(attack(s).events, 'penaltyCheck')).toHaveLength(0);
  });

  it('rerolling a 1 away avoids the check, and the penalty die is never rerolled', () => {
    const s = rigDice(setup(shirtPull(), { dice: 1 }), 3, ([a, , r]) => a === 1 && r !== 1);
    const { state, events } = play(s,
      { type: 'attack', side: 'A', attacker: mid(LAST), target: mid(LAST) },
      { type: 'callDice', side: 'A', roll: true },
      { type: 'callDice', side: 'B', roll: false });
    expect(eventsOfType(events, 'rerolled')).toHaveLength(1);
    expect(eventsOfType(events, 'penaltyCheck')).toHaveLength(0);
    expect(state.pending.kind).not.toBe('callDice');
  });

  it("the card's tier sets the length: Minor 1 turn, Major 2, Brutal 3", () => {
    for (const [tier, turns] of [['minor', 1], ['major', 2], ['brutal', 3]] as const) {
      const s = rigDice(setup(shirtPull({ tier })), 3, ([a, , p]) => a === 1 && p === 1);
      expect(eventsOfType(attack(s).events, 'penalized')[0]?.turns).toBe(turns);
    }
  });

  it("with penaltyLength 'result', the length comes from what the attack did", () => {
    const card = physicalCard('Shirt Pull', { toughness: 0, severity: 0 });
    const base = scenario({
      lanes, config: { ...ROLLED, penaltyLength: 'result' }, ball: { side: 'B', pos: mid(LAST) },
      A: { physical: [card], lineup: { midfield: { [LAST]: player('A mid', { speed: 9 }) } } },
      B: { lineup: { midfield: { [LAST]: player('B mid', { speed: 0, toughness: -10 }) } } },
    });
    // Attacker 1, defender, Toughness roll, severity roll (always Injured in scenarios), penalty die 1.
    const s = rigDice(base, 5, ([a, , , , p]) => a === 1 && p === 1);
    const { events } = attack(s);
    expect(eventsOfType(events, 'injured')).toHaveLength(1);
    expect(eventsOfType(events, 'penalized')[0]?.turns).toBe(2);
  });

  it('an attacker injured by their own Spearing still goes to the box, and no forced substitute takes the spot', () => {
    const spearing = physicalCard('Shirt Pull', { toughness: null, severity: null, ability: { effect: 'self_check', params: {} } });
    const base = scenario({
      lanes, config: ROLLED, ball: { side: 'B', pos: mid(LAST) },
      A: { physical: [spearing], hand: [player('Sub')], lineup: { midfield: { [LAST]: player('A mid', { speed: 9, toughness: -10 }) } } },
      B: { lineup: { midfield: { [LAST]: player('B mid', { speed: 0 }) } } },
    });
    // Attacker 1, defender, the attacker's own Toughness roll, severity (always Injured here), penalty die 1.
    const s = rigDice(base, 5, ([a, , , , p]) => a === 1 && p === 1);
    const { state, events } = attack(s);
    expect(eventsOfType(events, 'injured')).toEqual([expect.objectContaining({ side: 'A' })]);
    expect(eventsOfType(events, 'penalized')).toHaveLength(1);
    expect(state.pending.kind).not.toBe('forcedSub');
    expect(state.teams.A.lineup.midfield[LAST]).toBeNull();
    expect(findProblems(state)).toEqual([]);
  });

  it("nobody can be substituted into a penalized player's spot", () => {
    const s = rigDice(setup(shirtPull(), { aHand: [player('Fresh')] }), 3, ([a, , p]) => a === 1 && p === 1);
    const { state } = attack(s);
    const drawStep = { ...state, activeSide: 'A' as const, pending: { kind: 'draw' as const, side: 'A' as const } };
    expect(() => play(drawStep, { type: 'substitute', side: 'A', pos: mid(LAST), card: uid(s, 'A', 'Fresh') })).toThrow(/penalty box/);
  });

  it("counts down at the end of the team's turns after the one it was given in", () => {
    const s = rigDice(setup(shirtPull()), 3, ([a, , p]) => a === 1 && p === 1);
    let { state } = attack(s); // A's turn 1 ends with the attack
    const finishTurn = (side: 'A' | 'B') => {
      for (let p = state.pending; !(p.kind === 'action' && p.side === side); p = state.pending) {
        if (p.kind === 'gameOver') throw new Error('game over');
        state = play(state, legalActions(state, p.side)[0]!).state;
      }
      return play(state, { type: 'regroup', side, discard: [] });
    };
    expect(state.teams.A.penaltyBox).toHaveLength(1); // not on the turn it was given
    ({ state } = finishTurn('B'));
    expect(state.teams.A.penaltyBox).toHaveLength(1); // the other team's turn doesn't count
    const { state: after, events } = finishTurn('A');
    expect(eventsOfType(events, 'penaltyServed')).toEqual([expect.objectContaining({ side: 'A', pos: mid(LAST) })]);
    expect(after.teams.A.lineup.midfield[LAST]?.uid).toBe(uid(s, 'A', 'A mid'));
    expect(after.teams.A.penaltyBox).toEqual([]);
  });

  describe('escalating risk', () => {
    it('a second attack in a row is penalized on both dice 2 or lower', () => {
      const base = setup(shirtPull());
      base.teams.A.attackHeat = 1; // one attack recently
      expect(viewFor(base, 'B').opponent.penaltyLevel).toBe(2);
      const s = rigDice(base, 3, ([a, , p]) => a === 2 && p === 2);
      const { events } = attack(s);
      expect(eventsOfType(events, 'penaltyCheck')).toEqual([expect.objectContaining({ level: 2, attackerRoll: 2, roll: 2, called: true })]);
    });

    it('...but at level 1 a 2 is safe', () => {
      const s = rigDice(setup(shirtPull()), 3, ([a]) => a === 2);
      expect(eventsOfType(attack(s).events, 'penaltyCheck')).toHaveLength(0);
    });

    it('each attack raises the level by one, after its own check', () => {
      const s = rigDice(setup(shirtPull()), 2, ([a]) => a !== 1);
      const { state } = attack(s);
      expect(state.teams.A.attackHeat).toBe(1);
    });

    it("each of the team's turns without an attack lowers it by one, never below level 1", () => {
      const s = scenario({ lanes, ball: { side: 'A', pos: mid(0) } });
      s.teams.A.attackHeat = 2;
      let { state } = play(s, { type: 'regroup', side: 'A', discard: [] });
      expect(state.teams.A.attackHeat).toBe(1);
      state = { ...state, activeSide: 'A', pending: { kind: 'action', side: 'A' }, actionsLeft: 1 };
      ({ state } = play(state, { type: 'regroup', side: 'A', discard: [] }));
      ({ state } = play({ ...state, activeSide: 'A', pending: { kind: 'action', side: 'A' }, actionsLeft: 1 }, { type: 'regroup', side: 'A', discard: [] }));
      expect(state.teams.A.attackHeat).toBe(0);
    });

    it('a turn with an attack keeps the level up', () => {
      const s = rigDice(setup(shirtPull()), 2, ([a]) => a !== 1);
      const { state } = attack(s); // A's only action: the turn ends
      expect(state.teams.A.attackHeat).toBe(1);
    });

    it('with escalation off, the check is always a 1 and a 1', () => {
      const base = setup(shirtPull(), { config: { penaltyEscalation: false } });
      base.teams.A.attackHeat = 3;
      const s = rigDice(base, 3, ([a]) => a === 2);
      expect(eventsOfType(attack(s).events, 'penaltyCheck')).toHaveLength(0);
    });
  });

  it('power play: if the other team scores, every penalized player comes back at once', () => {
    const s = scenario({
      lanes, active: 'B', ball: { side: 'B', pos: fwd(0) },
      A: { goalie: goalie('A goalie', 0) },
      B: { lineup: { forward: { 0: player('B fwd', { shot: 9 }) } } },
    });
    const boxed = s.teams.A.lineup.midfield[LAST]!;
    s.teams.A.lineup.midfield[LAST] = null;
    s.teams.A.penaltyBox = [{ uid: boxed.uid, pos: mid(LAST), turnsLeft: 3, since: 1 }];
    const { state, events } = play(s, { type: 'shoot', side: 'B' });
    expect(eventsOfType(events, 'goal')).toHaveLength(1);
    expect(eventsOfType(events, 'powerPlayReturn')).toEqual([expect.objectContaining({ side: 'A' })]);
    expect(state.teams.A.lineup.midfield[LAST]?.uid).toBe(boxed.uid);
  });

  it('every penalty ends at full time', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: mid(0) } });
    s.endgame.finalTurnFor = 'A';
    const boxed = s.teams.B.lineup.forward[0]!;
    s.teams.B.lineup.forward[0] = null;
    s.teams.B.penaltyBox = [{ uid: boxed.uid, pos: fwd(0), turnsLeft: 3, since: 1 }];
    const { state, events } = play(s, { type: 'regroup', side: 'A', discard: [] });
    expect(eventsOfType(events, 'shootoutStarted')).toHaveLength(1);
    expect(state.teams.B.lineup.forward[0]?.uid).toBe(boxed.uid);
  });
});
