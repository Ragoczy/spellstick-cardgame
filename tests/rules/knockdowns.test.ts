// RULES.md "Contact" (v0.17): Toughness, knockdowns, severity, Shaken, and knocked out.
//
// Contact rolls are forced with config: Toughness 6 is never hurt and 0 always is, and the
// severity table can make every hurt Shaken, Injured, or Knocked out.
import { describe, expect, it } from 'vitest';
import { prototypeCards } from '../../src/data/prototype';
import { CardDataError, loadCardSet } from '../../src/engine/cards';
import { makeConfig, type GameConfig } from '../../src/engine/config';
import { hurtPlayer, shakenUntil } from '../../src/engine/injuries';
import { legalActions } from '../../src/engine/legal';
import { IllegalActionError } from '../../src/engine/reducer';
import { randomInt } from '../../src/engine/rng';
import type { GameState } from '../../src/engine/state';
import { viewFor } from '../../src/engine/view';
import { findProblems } from '../../src/sim/invariants';
import {
  LANE_COUNTS, actionSpell, boost, dfn, eventsOfType, fwd, goalie, lastContest, mid, play, player, reaction, scenario, uid,
} from '../helpers';

const SHAKEN: Partial<GameConfig> = { severity: { shaken: 6, injured: 6 } };
const INJURED: Partial<GameConfig> = { severity: { shaken: 0, injured: 6 } };
const KNOCKED_OUT: Partial<GameConfig> = { severity: { shaken: 0, injured: 0 } };

const hit = () => actionSpell('Flambé', { effect: 'hit', params: { strength: 3 } });
const redMist = () => reaction('Red Mist', { effect: 'dirty_play', params: {} });

describe.each(LANE_COUNTS)('contact (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  /** B holds the ball at midfield; A's midfielder there tackles. */
  function tackleSetup(options: { toughness?: number; tacklerDefense?: number; config?: Partial<GameConfig>; aHand?: ReturnType<typeof redMist>[] } = {}) {
    return scenario({
      lanes,
      config: options.config,
      ball: { side: 'B', pos: mid(LAST) },
      A: { hand: options.aHand ?? [], lineup: { midfield: { [LAST]: player('A mid', { defense: options.tacklerDefense ?? 6 }) } } },
      B: { lineup: { midfield: { [LAST]: player('B mid', { speed: 1, toughness: options.toughness ?? 4 }) } } },
    });
  }

  /** A's forward hits B's defender in the same lane. */
  function hitSetup(config: Partial<GameConfig>, b: { hand?: ReturnType<typeof player>[]; ball?: boolean } = {}) {
    return scenario({
      lanes,
      config,
      ball: b.ball ? { side: 'B', pos: dfn(LAST) } : undefined,
      A: { hand: [hit()] },
      B: { hand: b.hand ?? [], lineup: { defense: { [LAST]: player('B def', { defense: 1, toughness: 6 }) } } },
    });
  }
  const castHit = (s: GameState) => play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Flambé'), caster: fwd(LAST), target: { kind: 'hit' } });

  describe('knockdowns', () => {
    it('a successful tackle knocks the tackled player down: at or below their Toughness, no harm done', () => {
      const { state, events } = play(tackleSetup({ toughness: 6 }), { type: 'tackle', side: 'A' });
      expect(state.ball).toEqual({ side: 'A', pos: mid(LAST) });
      expect(eventsOfType(events, 'knockedDown')).toEqual([expect.objectContaining({ side: 'B', pos: mid(LAST), toughness: 6, hurt: false })]);
      expect(eventsOfType(events, 'hurt')).toHaveLength(0);
    });

    it('above their Toughness, they are hurt and roll for severity', () => {
      const { state, events } = play(tackleSetup({ toughness: 0, config: SHAKEN }), { type: 'tackle', side: 'A' });
      expect(eventsOfType(events, 'knockedDown')[0]).toMatchObject({ hurt: true, toughness: 0 });
      expect(eventsOfType(events, 'hurt')[0]).toMatchObject({ side: 'B', pos: mid(LAST), source: 'tackle', cause: 'Tackle', result: 'shaken' });
      expect(state.teams.B.lineup.midfield[LAST]!.shakenUntil).toBeDefined();
    });

    it('a failed tackle knocks nobody down', () => {
      const { state, events } = play(tackleSetup({ toughness: 0, tacklerDefense: 0 }), { type: 'tackle', side: 'A' });
      expect(state.ball).toEqual({ side: 'B', pos: mid(LAST) });
      expect(eventsOfType(events, 'knockedDown')).toHaveLength(0);
    });

    it('a tackle that goes for a mirror image knocks nobody down', () => {
      const s = tackleSetup({ toughness: 0 });
      s.teams.B.lineup.midfield[LAST]!.revealed = true;
      s.teams.B.lineup.midfield[LAST]!.images = true;
      // Find an RNG state where the tackle goes for an image.
      for (let rng = 1; ; rng++) {
        const [pick] = randomInt(rng, s.config.mirrorImages + 1);
        if (pick < s.config.mirrorImages) { s.rng = rng; break; }
      }
      const { events } = play(s, { type: 'tackle', side: 'A' });
      expect(eventsOfType(events, 'imagesTested')[0]).toMatchObject({ fooled: true });
      expect(eventsOfType(events, 'knockedDown')).toHaveLength(0);
    });

    it('a hit that lands hurts straight away, with no Toughness check', () => {
      const { events } = castHit(hitSetup(SHAKEN));
      expect(lastContest(events).winner).toBe('A');
      expect(eventsOfType(events, 'knockedDown')).toHaveLength(0);
      expect(eventsOfType(events, 'hurt')[0]).toMatchObject({ side: 'B', pos: dfn(LAST), source: 'hit', cause: 'Flambé', result: 'shaken' });
    });

    it('a dirty play hurts with no Toughness check, and a player is hurt only once per contest', () => {
      const s = tackleSetup({ toughness: 6, config: SHAKEN, aHand: [redMist()] });
      const { events } = play(s, { type: 'tackle', side: 'A' }, { type: 'foul', side: 'A', card: uid(s, 'A', 'Red Mist') });
      expect(lastContest(events).winner).toBe('A');
      expect(eventsOfType(events, 'knockedDown')).toHaveLength(0);
      expect(eventsOfType(events, 'hurt')).toEqual([expect.objectContaining({ side: 'B', source: 'dirty_play', cause: 'Red Mist' })]);
    });

    it("never hurts a goalie: a dirty play by a scoring shooter does nothing to them", () => {
      const s = scenario({
        lanes, config: SHAKEN, ball: { side: 'A', pos: fwd(0) },
        A: { hand: [redMist()], lineup: { forward: { 0: player('A fwd', { shot: 6 }) } } },
        B: { goalie: goalie('B goalie', 0) },
      });
      const { events } = play(s, { type: 'shoot', side: 'A' }, { type: 'foul', side: 'A', card: uid(s, 'A', 'Red Mist') });
      expect(eventsOfType(events, 'goal')).toHaveLength(1);
      expect(eventsOfType(events, 'hurt')).toHaveLength(0);
    });

    it('never offers a reroll for a Toughness or severity roll', () => {
      const { state } = play(scenarioWithDice(), { type: 'tackle', side: 'A' }, { type: 'callDice', side: 'A', roll: false }, { type: 'callDice', side: 'B', roll: false });
      expect(state.pending.kind).not.toBe('callDice');
      function scenarioWithDice() {
        return scenario({
          lanes, dice: 3, config: { ...SHAKEN, contestDie: 6 }, ball: { side: 'B', pos: mid(LAST) },
          A: { lineup: { midfield: { [LAST]: player('A mid', { defense: 6 }) } } },
          B: { lineup: { midfield: { [LAST]: player('B mid', { speed: 0, toughness: 0 }) } } },
        });
      }
    });
  });

  describe('severity', () => {
    it('Injured: draws an injury card, as before', () => {
      const { state, events } = castHit(hitSetup(INJURED));
      expect(eventsOfType(events, 'hurt')[0]).toMatchObject({ result: 'injured' });
      expect(eventsOfType(events, 'injured')[0]).toMatchObject({ side: 'B', source: 'hit', carriedOff: false });
      expect(state.injuries[uid(state, 'B', 'B def')]).toBeDefined();
    });

    it('Knocked out: off the field beside the mat, and a forced substitution if there is someone in hand', () => {
      const { state, events } = castHit(hitSetup(KNOCKED_OUT, { hand: [player('B sub')] }));
      expect(eventsOfType(events, 'hurt')[0]).toMatchObject({ result: 'knockedOut' });
      expect(state.teams.B.knockedOut).toEqual([uid(state, 'B', 'B def')]);
      expect(state.pending).toEqual({ kind: 'forcedSub', side: 'B', pos: dfn(LAST) });
      expect(findProblems(state)).toEqual([]);
    });

    it('Knocked out with nobody to come on: the spot is empty and the ball goes to the opposing player', () => {
      const { state, events } = castHit(hitSetup(KNOCKED_OUT, { ball: true }));
      expect(state.teams.B.lineup.defense[LAST]).toBeNull();
      expect(eventsOfType(events, 'slotEmptied')).toHaveLength(1);
      expect(state.ball).toEqual({ side: 'A', pos: fwd(LAST) });
      expect(findProblems(state)).toEqual([]);
    });

    it('Shaken: a player holding the ball keeps it', () => {
      const { state } = castHit(hitSetup(SHAKEN, { ball: true }));
      expect(state.ball).toEqual({ side: 'B', pos: dfn(LAST) });
      expect(state.teams.B.lineup.defense[LAST]!.shakenUntil).toBeDefined();
    });
  });

  describe('Shaken players', () => {
    /** A's forward holds the ball and is Shaken. */
    function shakenHolder(hand: ReturnType<typeof hit>[] = []) {
      const s = scenario({ lanes, ball: { side: 'A', pos: fwd(0) }, A: { hand, revealed: [fwd(0)] } });
      s.teams.A.lineup.forward[0]!.shakenUntil = 3;
      return s;
    }

    it("can't pass, shoot, or cast", () => {
      const s = shakenHolder([hit()]);
      expect(() => play(s, { type: 'shoot', side: 'A' })).toThrow(/Shaken/);
      expect(() => play(s, { type: 'pass', side: 'A', to: mid(0) })).toThrow(/Shaken/);
      expect(() => play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Flambé'), caster: fwd(0), target: { kind: 'hit' } })).toThrow(IllegalActionError);
      expect(legalActions(s, 'A').some((a) => a.type === 'shoot' || a.type === 'pass')).toBe(false);
    });

    it("can't tackle", () => {
      const s = scenario({ lanes, ball: { side: 'B', pos: mid(0) }, A: { revealed: [mid(0)] } });
      s.teams.A.lineup.midfield[0]!.shakenUntil = 3;
      expect(() => play(s, { type: 'tackle', side: 'A' })).toThrow(/Shaken/);
    });

    it("loses 2 from every skill in a contest, and can't play a reaction spell", () => {
      const s = scenario({
        lanes, active: 'B', ball: { side: 'A', pos: mid(0) },
        A: { hand: [boost('A boost')], revealed: [mid(0)], lineup: { midfield: { 0: player('A mid', { speed: 5 }) } } },
        B: { lineup: { midfield: { 0: player('B mid', { defense: 4 }) } } },
      });
      s.teams.A.lineup.midfield[0]!.shakenUntil = 3;
      const { events } = play(s, { type: 'tackle', side: 'B' });
      // No reaction was offered to A: the tackle resolved straight away.
      expect(eventsOfType(events, 'spellCast')).toHaveLength(0);
      const defender = lastContest(events).defender;
      expect(defender.parts).toEqual([{ label: 'Shaken', amount: -2 }]);
      expect(defender.total).toBe(3);
      expect(lastContest(events).winner).toBe('B'); // Defense 4 beats Speed 5 − 2
    });

    it("stand up at the end of their team's next turn", () => {
      // Hurt on A's turn 1, so B's player sits out B's turn 2 and stands up at its end.
      let { state } = play(tackleSetup({ toughness: 0, config: SHAKEN }), { type: 'tackle', side: 'A' });
      expect(state.teams.B.lineup.midfield[LAST]!.shakenUntil).toBe(2);
      // Play on to B's action (A's turn ends; B draws).
      for (let p = state.pending; p.kind !== 'action' && p.kind !== 'gameOver'; p = state.pending) {
        state = play(state, legalActions(state, p.side)[0]!).state;
      }
      expect(state.activeSide).toBe('B');
      expect(state.teams.B.lineup.midfield[LAST]!.shakenUntil).toBe(2);
      const { state: after, events } = play(state, { type: 'regroup', side: 'B', discard: [] });
      expect(eventsOfType(events, 'stoodUp')).toEqual([expect.objectContaining({ side: 'B', pos: mid(LAST) })]);
      expect(after.teams.B.lineup.midfield[LAST]!.shakenUntil).toBeUndefined();
    });

    it('sit out the following turn instead when hurt on their own turn, and start over if Shaken again', () => {
      const s = scenario({ lanes, config: SHAKEN, turn: 4, active: 'B' });
      expect(shakenUntil(s, 'B')).toBe(6); // B's own turn 4: they sit out turn 6
      expect(shakenUntil(s, 'A')).toBe(5); // A's next turn
      s.teams.B.lineup.midfield[0]!.shakenUntil = 4;
      hurtPlayer(s, 'B', mid(0), 'hit', 'Flambé', []);
      expect(s.teams.B.lineup.midfield[0]!.shakenUntil).toBe(6);
    });

    it('stand up when substituted out', () => {
      const s = scenario({ lanes, step: 'draw', A: { hand: [player('Fresh')] } });
      s.teams.A.lineup.midfield[0]!.shakenUntil = 3;
      const { state } = play(s, { type: 'substitute', side: 'A', pos: mid(0), card: uid(s, 'A', 'Fresh') });
      expect(state.teams.A.lineup.midfield[0]!.shakenUntil).toBeUndefined();
    });

    it('stand up at full time', () => {
      const s = scenario({ lanes, ball: { side: 'A', pos: mid(0) } });
      s.endgame.finalTurnFor = 'A';
      s.teams.B.lineup.forward[0]!.shakenUntil = 99;
      const { state, events } = play(s, { type: 'regroup', side: 'A', discard: [] });
      expect(eventsOfType(events, 'shootoutStarted')).toHaveLength(1);
      expect(eventsOfType(events, 'stoodUp')).toEqual([expect.objectContaining({ side: 'B', pos: fwd(0) })]);
      expect(state.teams.B.lineup.forward[0]!.shakenUntil).toBeUndefined();
    });

    it('are public: both players see the card sideways', () => {
      const s = shakenHolder();
      expect(viewFor(s, 'A').mine.lineup.forward[0]).toMatchObject({ shaken: true });
      expect(viewFor(s, 'B').opponent.lineup.forward[0]).toMatchObject({ state: 'revealed', shaken: true });
    });
  });

  describe('knocked-out players', () => {
    /** A scores, so a faceoff follows. B has one knocked-out player. */
    function goalWithKnockedOut(knockedOutReturn: number) {
      const s = scenario({
        lanes, config: { knockedOutReturn }, ball: { side: 'A', pos: fwd(0) },
        A: { lineup: { forward: { 0: player('A fwd', { shot: 6 }) } } },
        B: { goalie: goalie('B goalie', 0), knockedOut: [player('Dazed')] },
      });
      return play(s, { type: 'shoot', side: 'A' });
    }

    it('roll at each faceoff, before the lane is chosen: 4 or more goes back to the hand', () => {
      const { state, events } = goalWithKnockedOut(1);
      expect(eventsOfType(events, 'returnRoll')).toEqual([expect.objectContaining({ side: 'B', returned: true })]);
      expect(state.pending).toEqual({ kind: 'faceoffLane', side: 'B' });
      expect(state.teams.B.knockedOut).toEqual([]);
      expect(state.teams.B.hand).toContain(uid(state, 'B', 'Dazed'));
      expect(findProblems(state)).toEqual([]);
    });

    it('stay out on a lower roll', () => {
      const { state, events } = goalWithKnockedOut(7);
      expect(eventsOfType(events, 'returnRoll')).toEqual([expect.objectContaining({ returned: false })]);
      expect(state.teams.B.knockedOut).toEqual([uid(state, 'B', 'Dazed')]);
    });

    it('are public, face up beside the mat', () => {
      const { state } = goalWithKnockedOut(7);
      expect(viewFor(state, 'A').opponent.knockedOut.map((c) => c.def.name)).toEqual(['Dazed']);
      expect(viewFor(state, 'B').mine.knockedOut.map((c) => c.def.name)).toEqual(['Dazed']);
    });
  });

  describe('before v0.17 (online matches started earlier)', () => {
    it('a tackle knocks nobody down, and a hit always injures', () => {
      const tackled = play(tackleSetup({ toughness: 0, config: { knockdowns: false } }), { type: 'tackle', side: 'A' });
      expect(eventsOfType(tackled.events, 'knockedDown')).toHaveLength(0);
      const hitEvents = castHit(hitSetup({ knockdowns: false, ...KNOCKED_OUT })).events;
      expect(eventsOfType(hitEvents, 'hurt')).toHaveLength(0);
      expect(eventsOfType(hitEvents, 'injured')).toHaveLength(1);
    });
  });
});

describe('Toughness on the cards', () => {
  it('every field player has the Toughness of their type: Stoppers and Anchors 5, Playmakers and All-rounders 4, Runners and Strikers 3', () => {
    const byRole = makeConfig().toughnessByRole as Record<string, number>;
    const pool = prototypeCards.cards.filter((c) => c.kind === 'field' && c.team === 'pool');
    expect(pool.length).toBeGreaterThan(0);
    for (const card of pool) {
      if (card.kind !== 'field') continue;
      expect(card.toughness, card.name).toBe(byRole[card.role!]);
    }
  });

  it('the card loader refuses a field player without Toughness', () => {
    const card = prototypeCards.cards.find((c) => c.kind === 'field' && c.team === 'pool')!;
    const { toughness: _, ...withoutToughness } = card as typeof card & { toughness: number };
    const broken = { ...prototypeCards, cards: [withoutToughness] };
    expect(() => loadCardSet(JSON.parse(JSON.stringify(broken)))).toThrow(CardDataError);
  });
});
