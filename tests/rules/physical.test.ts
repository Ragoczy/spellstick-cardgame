// RULES.md "Physical attacks" (v0.17): the Physical pile, the attack contest, each physical
// card's effect, and the reaction cards (Late Hit, Elbow).
//
// Contests here aren't rolled (scenarios turn the dice off), so the cards' numbers decide. The
// Toughness roll is forced with the target's Toughness: 10 is never hurt, −10 always is. Every
// hurt is Injured unless a test changes the severity table.
import { describe, expect, it } from 'vitest';
import { prototypeCards } from '../../src/data/prototype';
import { createGame } from '../../src/engine/setup';
import type { PhysicalCardDef } from '../../src/engine/cards';
import type { GameConfig } from '../../src/engine/config';
import { legalActions } from '../../src/engine/legal';
import { IllegalActionError } from '../../src/engine/reducer';
import type { GameState } from '../../src/engine/state';
import { viewFor } from '../../src/engine/view';
import { findProblems } from '../../src/sim/invariants';
import {
  LANE_COUNTS, dfn, eventsOfType, fwd, lastContest, mid, physicalCard, play, player, reaction, scenario, uid,
} from '../helpers';

const SHAKEN: Partial<GameConfig> = { severity: { shaken: 6, injured: 6 } };
const NEVER_HURT = 10;
const ALWAYS_HURT = -10;

describe.each(LANE_COUNTS)('physical attacks (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  /**
   * B holds the ball at its last-lane midfield (unless `ball` says otherwise); A's midfielder in
   * that lane attacks with `card`.
   */
  function setup(card: PhysicalCardDef, options: {
    aSpeed?: number; aDefense?: number; aAffinities?: string[]; bSpeed?: number; bToughness?: number; bAffinities?: string[];
    config?: Partial<GameConfig>; ball?: GameState['ball']; extraA?: Record<number, ReturnType<typeof player>>;
  } = {}) {
    return scenario({
      lanes, config: options.config,
      ball: options.ball === undefined ? { side: 'B', pos: mid(LAST) } : options.ball,
      A: {
        hand: [card],
        lineup: { midfield: { [LAST]: player('A mid', { speed: options.aSpeed ?? 5, defense: options.aDefense ?? 1 }, { affinities: options.aAffinities }), ...options.extraA } },
      },
      B: { lineup: { midfield: { [LAST]: player('B mid', { speed: options.bSpeed ?? 3, toughness: options.bToughness ?? NEVER_HURT }, { affinities: options.bAffinities }) } } },
    });
  }
  const attack = (s: GameState, name: string, target = mid(LAST), attacker = mid(LAST)) =>
    play(s, { type: 'attack', side: 'A', card: uid(s, 'A', name), attacker, target });

  describe('the attack', () => {
    it("is the attacker's Speed against the target's Speed; if it wins, the target drops the ball to the attacker", () => {
      const s = setup(physicalCard('Shove'));
      const { state, events } = attack(s, 'Shove');
      expect(eventsOfType(events, 'attackDeclared')[0]).toMatchObject({ side: 'A', attacker: mid(LAST), target: mid(LAST) });
      const contest = lastContest(events);
      expect(contest).toMatchObject({ kind: 'attack', winner: 'A' });
      expect(contest.attacker).toMatchObject({ stat: 'speed', total: 5 });
      expect(contest.defender).toMatchObject({ stat: 'speed', total: 3 });
      expect(eventsOfType(events, 'ballDropped')).toEqual([expect.objectContaining({ side: 'B', pos: mid(LAST) })]);
      expect(state.ball).toEqual({ side: 'A', pos: mid(LAST) });
      expect(state.teams.A.physicalDiscard).toEqual([uid(s, 'A', 'Shove')]);
      expect(findProblems(state)).toEqual([]);
    });

    it('then knocks the target down: a Toughness roll, with the card\'s modifier', () => {
      const { events } = attack(setup(physicalCard('Slash', { tier: 'major', toughness: -1 }), { bToughness: 4 }), 'Slash');
      expect(eventsOfType(events, 'knockedDown')[0]).toMatchObject({ side: 'B', toughness: 3 });
    });

    it('ties go to the target, and a lost attack does nothing', () => {
      const { state, events } = attack(setup(physicalCard('Shove'), { aSpeed: 3, bSpeed: 3, bToughness: ALWAYS_HURT }), 'Shove');
      expect(lastContest(events).winner).toBe('B');
      expect(state.ball).toEqual({ side: 'B', pos: mid(LAST) });
      expect(eventsOfType(events, 'knockedDown')).toHaveLength(0);
    });

    it('a muscle card attacks with Defense', () => {
      const { events } = attack(setup(physicalCard('Shoulder', { uses: 'muscle' }), { aSpeed: 0, aDefense: 6 }), 'Shoulder');
      expect(lastContest(events).attacker).toMatchObject({ stat: 'defense', total: 6 });
    });

    it('adds the card bonus, and +1 for the body Affinity on the card (exactly, or the whole body family)', () => {
      const card = () => physicalCard('Slash', { bonus: 1, affinity: 'body.berserking' });
      const exact = lastContest(attack(setup(card(), { aAffinities: ['body.berserking'] }), 'Slash').events).attacker;
      expect(exact.parts).toEqual([{ label: 'Slash', amount: 1 }, { label: 'Affinity', amount: 1 }]);
      expect(lastContest(attack(setup(card(), { aAffinities: ['body'] }), 'Slash').events).attacker.total).toBe(7);
      expect(lastContest(attack(setup(card(), { aAffinities: ['body.speed'] }), 'Slash').events).attacker.total).toBe(6);
    });

    it('Danger-sense helps the target dodge, and Endurance helps their Toughness', () => {
      const { events } = attack(setup(physicalCard('Shove'), { bToughness: 4, bAffinities: ['divination.danger-sense', 'body.endurance'] }), 'Shove');
      expect(lastContest(events).defender.parts).toEqual([{ label: 'Dodge', amount: 1 }]);
      expect(eventsOfType(events, 'knockedDown')[0]).toMatchObject({ toughness: 5 });
    });

    it('the severity roll takes the card\'s modifier: a Brutal card pushes Injured to Knocked out', () => {
      const s = setup(physicalCard('Chop', { tier: 'brutal', toughness: -1, severity: 1 }), {
        bToughness: ALWAYS_HURT, config: { severity: { shaken: 0, injured: 6 } },
      });
      // Severity rolls 1 to 6 are all Injured here; +1 makes a 6 a 7. Find a state where it rolls 6.
      let found = false;
      for (let rng = 1; rng < 500 && !found; rng++) {
        const { events } = attack({ ...s, rng }, 'Chop');
        const hurt = eventsOfType(events, 'hurt')[0];
        if (hurt?.roll === 7) {
          expect(hurt.result).toBe('knockedOut');
          found = true;
        }
      }
      expect(found).toBe(true);
    });

    it("can't be made by a player holding the ball, a Shaken player, or with a reaction card", () => {
      const holding = setup(physicalCard('Shove'), { ball: { side: 'A', pos: mid(LAST) } });
      expect(() => attack(holding, 'Shove')).toThrow(/holding the ball/);
      const shaken = setup(physicalCard('Shove'));
      shaken.teams.A.lineup.midfield[LAST]!.shakenUntil = 3;
      expect(() => attack(shaken, 'Shove')).toThrow(/Shaken/);
      const late = setup(physicalCard('Late Hit', { ability: { effect: 'after_pass_or_shot', params: {} } }));
      expect(() => attack(late, 'Late Hit')).toThrow(IllegalActionError);
    });

    it('only at the opposing player in your spot', () => {
      const s = setup(physicalCard('Shove'));
      expect(() => attack(s, 'Shove', fwd(LAST))).toThrow(/in your spot/);
    });

    it('has no fouls: a dirty play in hand is never asked for', () => {
      const s = setup(physicalCard('Shove'));
      s.teams.A.hand.push(...[reaction('Red Mist', { effect: 'dirty_play', params: {} })].map((def) => {
        const id = `A${90}`;
        s.cards[id] = { ...def, team: 'A' };
        return id;
      }));
      const { events } = attack(s, 'Shove');
      expect(eventsOfType(events, 'contestResolved')).toHaveLength(1);
    });

    it('are listed as legal actions for each physical card in hand', () => {
      const s = setup(physicalCard('Shove'));
      expect(legalActions(s, 'A')).toContainEqual({ type: 'attack', side: 'A', card: uid(s, 'A', 'Shove'), attacker: mid(LAST), target: mid(LAST) });
    });
  });

  describe('the cards', () => {
    it('Shirt Pull (no Toughness roll): the target only drops the ball', () => {
      const { state, events } = attack(setup(physicalCard('Shirt Pull', { toughness: null, severity: null }), { bToughness: ALWAYS_HURT }), 'Shirt Pull');
      expect(state.ball).toEqual({ side: 'A', pos: mid(LAST) });
      expect(eventsOfType(events, 'knockedDown')).toHaveLength(0);
    });

    it('Tripping: +2 if the target holds the ball', () => {
      const card = () => physicalCard('Tripping', { ability: { effect: 'vs_holder', params: { amount: 2 } } });
      expect(lastContest(attack(setup(card()), 'Tripping').events).attacker.total).toBe(7);
      const offBall = setup(card(), { ball: { side: 'B', pos: dfn(0) } });
      expect(lastContest(attack(offBall, 'Tripping').events).attacker.total).toBe(5);
    });

    it('Hooking: may attack the opposing player one lane over', () => {
      if (lanes < 2) return;
      const card = physicalCard('Hooking', { ability: { effect: 'reach', params: {} } });
      const s = setup(card, { ball: { side: 'B', pos: mid(LAST - 1) } });
      const { events } = attack(s, 'Hooking', mid(LAST - 1));
      expect(lastContest(events).defender.pos).toEqual(mid(LAST - 1));
    });

    it('Atomic Wedgie: no Toughness roll, the target is Shaken', () => {
      const { state, events } = attack(setup(physicalCard('Atomic Wedgie', { toughness: null, severity: null, ability: { effect: 'only_shaken', params: {} } })), 'Atomic Wedgie');
      expect(eventsOfType(events, 'knockedDown')).toHaveLength(0);
      expect(eventsOfType(events, 'hurt')[0]).toMatchObject({ result: 'shaken', source: 'attack', cause: 'Atomic Wedgie' });
      expect(state.teams.B.lineup.midfield[LAST]!.shakenUntil).toBeDefined();
    });

    it('Clothesline: only against the ball carrier', () => {
      const card = () => physicalCard('Clothesline', { ability: { effect: 'needs_holder', params: {} } });
      expect(() => attack(setup(card(), { ball: { side: 'B', pos: dfn(0) } }), 'Clothesline')).toThrow(/ball carrier/);
      expect(() => attack(setup(card()), 'Clothesline')).not.toThrow();
    });

    it('Gouge: passing the Toughness roll still leaves the target Shaken', () => {
      const { events } = attack(setup(physicalCard('Gouge', { ability: { effect: 'shaken_anyway', params: {} } })), 'Gouge');
      expect(eventsOfType(events, 'knockedDown')[0]).toMatchObject({ hurt: false });
      expect(eventsOfType(events, 'hurt')[0]).toMatchObject({ result: 'shaken' });
    });

    it('Kneecap: Shaken counts as Injured', () => {
      const card = physicalCard('Kneecap', { ability: { effect: 'shaken_is_injured', params: {} } });
      const { events } = attack(setup(card, { bToughness: ALWAYS_HURT, config: SHAKEN }), 'Kneecap');
      expect(eventsOfType(events, 'hurt')[0]).toMatchObject({ result: 'injured' });
      expect(eventsOfType(events, 'injured')).toHaveLength(1);
    });

    it('Spearing: the attacker makes a Toughness roll too, win or lose', () => {
      const card = physicalCard('Spearing', { ability: { effect: 'self_check', params: {} } });
      const { events } = attack(setup(card, { aSpeed: 0 }), 'Spearing');
      expect(lastContest(events).winner).toBe('B');
      expect(eventsOfType(events, 'knockedDown')).toEqual([expect.objectContaining({ side: 'A', pos: mid(LAST) })]);
    });

    it('Stamp: only against a Shaken target', () => {
      const card = () => physicalCard('Stamp', { bonus: 3, ability: { effect: 'needs_shaken', params: {} } });
      expect(() => attack(setup(card()), 'Stamp')).toThrow(/Shaken/);
      const s = setup(card());
      s.teams.B.lineup.midfield[LAST]!.shakenUntil = 2;
      expect(lastContest(attack(s, 'Stamp').events).attacker.total).toBe(8);
    });

    it('Pile-on: +1 for each standing teammate one lane over in the same row', () => {
      if (lanes < 2) return;
      const card = () => physicalCard('Pile-on', { ability: { effect: 'pile_on', params: { amount: 1 } } });
      expect(lastContest(attack(setup(card()), 'Pile-on').events).attacker.parts).toEqual([{ label: 'Pile-on', amount: 1 }]);
      const s = setup(card());
      s.teams.A.lineup.midfield[LAST - 1]!.shakenUntil = 3; // a Shaken teammate doesn't help
      expect(lastContest(attack(s, 'Pile-on').events).attacker.parts).toEqual([]);
    });
  });

  describe('reaction cards', () => {
    const lateHit = () => physicalCard('Late Hit', { ability: { effect: 'after_pass_or_shot', params: {} } });
    const elbow = () => physicalCard('Elbow', { bonus: 1, ability: { effect: 'after_losing', params: {} } });

    it('Late Hit: after the opposing player in your spot passes, attack them', () => {
      const s = scenario({
        lanes, ball: { side: 'A', pos: mid(0) },
        A: { lineup: { midfield: { 0: player('A passer', { speed: 2, toughness: NEVER_HURT }) }, forward: { 0: player('A fwd', { speed: 6 }) } } },
        B: { hand: [lateHit()], lineup: { midfield: { 0: player('B mid', { speed: 5 }) } } },
      });
      const { state } = play(s, { type: 'pass', side: 'A', to: fwd(0) });
      expect(state.pending).toEqual({ kind: 'physicalReaction', side: 'B', trigger: 'after_pass_or_shot', attacker: mid(0), target: mid(0) });
      const { events } = play(state, { type: 'physicalReaction', side: 'B', card: uid(s, 'B', 'Late Hit') });
      expect(lastContest(events)).toMatchObject({ kind: 'attack', winner: 'B' });
      expect(eventsOfType(events, 'ballDropped')).toHaveLength(0); // the passer has no ball to drop
    });

    it('Elbow: when your player loses a contest to the opposing player in their spot, that result stands, then attack', () => {
      const s = scenario({
        lanes, ball: { side: 'B', pos: mid(LAST) },
        A: { hand: [elbow()], lineup: { midfield: { [LAST]: player('A mid', { defense: 0, speed: 6 }) } } },
        B: { lineup: { midfield: { [LAST]: player('B mid', { speed: 4, toughness: NEVER_HURT }) } } },
      });
      const { state } = play(s, { type: 'tackle', side: 'A' });
      expect(state.ball).toEqual({ side: 'B', pos: mid(LAST) }); // the tackle failed, and that stands
      expect(state.pending).toMatchObject({ kind: 'physicalReaction', side: 'A', trigger: 'after_losing' });
      const { state: after, events } = play(state, { type: 'physicalReaction', side: 'A', card: uid(s, 'A', 'Elbow') });
      expect(lastContest(events).attacker.parts).toEqual([{ label: 'Elbow', amount: 1 }]);
      expect(after.ball).toEqual({ side: 'A', pos: mid(LAST) });
    });

    it('are only offered to a side that has one, and can be declined', () => {
      const s = scenario({
        lanes, ball: { side: 'B', pos: mid(LAST) },
        A: { hand: [elbow()], lineup: { midfield: { [LAST]: player('A mid', { defense: 0 }) } } },
      });
      const { state } = play(s, { type: 'tackle', side: 'A' }, { type: 'physicalReaction', side: 'A', card: null });
      expect(state.pending.kind).not.toBe('physicalReaction');
      expect(state.teams.A.hand).toContain(uid(s, 'A', 'Elbow'));
    });
  });

  describe('the Physical pile', () => {
    it('each side gets one of each physical card; it draws 2 at setup and 1 at each faceoff', () => {
      const { state } = createGame({ seed: 3, cardSet: prototypeCards, config: { lanes } });
      for (const side of ['A', 'B'] as const) {
        const physical = Object.entries(state.cards).filter(([u, d]) => u.startsWith(side) && d.kind === 'physical');
        expect(physical).toHaveLength(16);
        expect(state.teams[side].physical).toHaveLength(16);
      }
      const s = scenario({
        lanes, ball: { side: 'A', pos: fwd(0) }, A: { lineup: { forward: { 0: player('A fwd', { shot: 9 }) } }, physical: [physicalCard('P1')] },
        B: { physical: [physicalCard('P2'), physicalCard('P3')] },
      });
      const { state: after } = play(s, { type: 'shoot', side: 'A' });
      expect(after.pending.kind).toBe('faceoffLane');
      expect(after.teams.A.hand).toContain(uid(s, 'A', 'P1'));
      expect(after.teams.B.hand).toContain(uid(s, 'B', 'P2'));
      expect(after.teams.B.physical).toEqual([uid(s, 'B', 'P3')]);
    });

    it('is shuffled again from its own discards when it runs out', () => {
      const s = scenario({ lanes, ball: { side: 'A', pos: fwd(0) }, A: { lineup: { forward: { 0: player('A fwd', { shot: 9 }) } } } });
      const used = physicalCard('Used');
      s.cards.A95 = { ...used, team: 'A' };
      s.teams.A.physicalDiscard = ['A95'];
      const { state } = play(s, { type: 'shoot', side: 'A' });
      expect(state.teams.A.hand).toContain('A95');
      expect(state.teams.A.physicalDiscard).toEqual([]);
    });

    it('physical cards in hand are hidden from the opponent, like spells', () => {
      const s = setup(physicalCard('Secret Shove'));
      expect(JSON.stringify(viewFor(s, 'B'))).not.toContain('Secret Shove');
    });

    it('before v0.17, there are no physical cards', () => {
      const { state } = createGame({ seed: 3, cardSet: prototypeCards, config: { lanes, physicalAttacks: false } });
      expect(Object.values(state.cards).some((d) => d.kind === 'physical')).toBe(false);
    });
  });
});
