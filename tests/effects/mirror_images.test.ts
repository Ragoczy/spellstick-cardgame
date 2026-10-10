// Effect: mirror_images {} (action, non-numeric) — Glamour Self
import { describe, expect, it } from 'vitest';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { randomInt } from '../../src/engine/rng';
import type { GameState } from '../../src/engine/state';
import { viewFor } from '../../src/engine/view';
import { LANE_COUNTS, GOAL_POS, actionSpell, dfn, eventsOfType, fwd, lastContest, mid, play, player, scenario, uid } from '../helpers';

const glamourSelf = (element: string | null = null) => actionSpell('Glamour Self', { effect: 'mirror_images', params: {} }, element);
const hit = () => actionSpell('Flambé', { effect: 'hit', params: { strength: 3 } });
const steal = () => actionSpell('Steal', { effect: 'steal', params: { amount: 2 } });

/** Sets the RNG so the next images check goes for an image (fooled) or finds the real player. */
function rigImages(s: GameState, fooled: boolean): GameState {
  for (let rng = 1; ; rng++) {
    const [pick] = randomInt(rng, s.config.mirrorImages + 1);
    if ((pick < s.config.mirrorImages) === fooled) return { ...s, rng };
  }
}

describe.each(LANE_COUNTS)('mirror_images (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  /** B holds the ball at its midfield in the last lane, with images. A's turn. */
  function glamouredHolder(extra: { hand?: ReturnType<typeof hit>[] } = {}): GameState {
    const s = scenario({ lanes, ball: { side: 'B', pos: mid(LAST) }, A: { hand: extra.hand ?? [] }, B: { revealed: [mid(LAST)] } });
    s.teams.B.lineup.midfield[LAST]!.images = true;
    return s;
  }

  it('gives the caster images, which both players can see', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: fwd(0) }, A: { hand: [glamourSelf()] } });
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Glamour Self'), caster: fwd(0), target: { kind: 'none' } });
    expect(eventsOfType(events, 'imagesCast')[0]).toMatchObject({ side: 'A', pos: fwd(0) });
    expect(state.teams.A.lineup.forward[0]).toMatchObject({ revealed: true, images: true });
    expect(viewFor(state, 'B').opponent.lineup.forward[0]).toMatchObject({ state: 'revealed', images: true });
  });

  it("can't be cast by a goalie, or on a player who already has images", () => {
    const s = scenario({ lanes, A: { hand: [glamourSelf()] } });
    expect(() => applyAction(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Glamour Self'), caster: GOAL_POS, target: { kind: 'none' } })).toThrow(IllegalActionError);
    s.teams.A.lineup.forward[0]!.images = true;
    expect(() => applyAction(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Glamour Self'), caster: fwd(0), target: { kind: 'none' } })).toThrow(IllegalActionError);
  });

  it('a tackle that goes for an image misses: no contest, the ball stays, the tackler is revealed, the images stay', () => {
    const s = rigImages(glamouredHolder(), true);
    const { state, events } = play(s, { type: 'tackle', side: 'A' });
    expect(eventsOfType(events, 'imagesTested')[0]).toMatchObject({ side: 'B', pos: mid(LAST), action: 'tackle', fooled: true });
    expect(eventsOfType(events, 'contestStarted')).toHaveLength(0);
    expect(state.ball).toEqual({ side: 'B', pos: mid(LAST) });
    expect(state.teams.A.lineup.midfield[LAST]!.revealed).toBe(true);
    expect(state.teams.B.lineup.midfield[LAST]!.images).toBe(true);
  });

  it('a tackle that finds the real player goes ahead, and the images vanish', () => {
    const s = rigImages(glamouredHolder(), false);
    const { state, events } = play(s, { type: 'tackle', side: 'A' });
    expect(eventsOfType(events, 'imagesTested')[0]).toMatchObject({ fooled: false });
    expect(lastContest(events).kind).toBe('tackle');
    expect(state.teams.B.lineup.midfield[LAST]!.images).toBeUndefined();
  });

  it('works against a steal too (the spell is used up)', () => {
    const s = rigImages(glamouredHolder({ hand: [steal()] }), true);
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Steal'), caster: mid(LAST), target: { kind: 'none' } });
    expect(eventsOfType(events, 'contestStarted')).toHaveLength(0);
    expect(state.ball).toEqual({ side: 'B', pos: mid(LAST) });
    expect(state.teams.A.discard).toContain(uid(s, 'A', 'Steal'));
  });

  it('a hit that goes for an image misses: no contest and no injury', () => {
    const s = rigImages(glamouredHolder({ hand: [hit()] }), true);
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Flambé'), caster: mid(LAST), target: { kind: 'hit' } });
    expect(eventsOfType(events, 'imagesTested')[0]).toMatchObject({ action: 'hit', fooled: true });
    expect(eventsOfType(events, 'contestStarted')).toHaveLength(0);
    expect(Object.keys(state.injuries)).toHaveLength(0);
  });

  it('goes for an image about 2 times in 3', () => {
    let fooled = 0;
    const tries = 600;
    for (let seed = 1; seed <= tries; seed++) {
      const { events } = play({ ...glamouredHolder(), rng: seed * 7919 }, { type: 'tackle', side: 'A' });
      if (eventsOfType(events, 'imagesTested')[0]!.fooled) fooled++;
    }
    expect(fooled / tries).toBeGreaterThan(0.6);
    expect(fooled / tries).toBeLessThan(0.73);
  });

  it('ends when the player leaves the field', () => {
    const s = glamouredHolder();
    s.activeSide = 'B';
    s.pending = { kind: 'draw', side: 'B' };
    s.teams.B.hand.push('B99');
    s.cards['B99'] = player('B sub');
    const { state } = play(s, { type: 'substitute', side: 'B', pos: mid(LAST), card: 'B99' });
    expect(state.teams.B.lineup.midfield[LAST]!.images).toBeUndefined();
  });

  it("doesn't affect other players or passes", () => {
    // A passes into the spot facing B's glamoured player: B's player intercepts as normal.
    const s = scenario({ lanes, ball: { side: 'A', pos: dfn(0) }, A: { lineup: { midfield: { [LAST]: player('A mid', { speed: 1 }) } } }, B: { revealed: [mid(LAST)] } });
    s.teams.B.lineup.midfield[LAST]!.images = true;
    const { events } = play(s, { type: 'pass', side: 'A', to: mid(LAST) });
    expect(eventsOfType(events, 'imagesTested')).toHaveLength(0);
    expect(lastContest(events).kind).toBe('pass');
  });

  it('fails when the caster is opposed', () => {
    const s = scenario({ lanes, A: { hand: [glamourSelf('air')], lineup: { forward: { 0: player('Earth caster', {}, { affinities: ['earth'] }) } } } });
    const { state } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Glamour Self'), caster: fwd(0), target: { kind: 'none' } });
    expect(state.teams.A.lineup.forward[0]!.images).toBeUndefined();
  });
});
