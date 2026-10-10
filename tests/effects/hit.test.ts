// Effect: hit { strength } (action, numeric)
import { describe, expect, it } from 'vitest';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { LANE_COUNTS, GOAL_POS, actionSpell, boost, dfn, eventsOfType, fwd, lastContest, mid, play, player, scenario, shield, uid } from '../helpers';

const hit = (element: string | null = null) => actionSpell('Flambé', { effect: 'hit', params: { strength: 3 } }, element);
const castHit = (s: ReturnType<typeof scenario>, caster: ReturnType<typeof fwd>) =>
  play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Flambé'), caster, target: { kind: 'hit' } });

describe.each(LANE_COUNTS)('hit (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it("attacks the opposing player in the caster's spot: strength 3 against their Defense, and injures them if it lands", () => {
    const s = scenario({ lanes, A: { hand: [hit()] }, B: { lineup: { defense: { [LAST]: player('B def', { defense: 2 }) } } } });
    const { state, events } = castHit(s, fwd(LAST));
    const contest = lastContest(events);
    expect(contest.kind).toBe('hit');
    expect(contest.attacker).toMatchObject({ base: 3, total: 3, baseLabel: 'Flambé' });
    expect(contest.defender).toMatchObject({ stat: 'defense', total: 2 });
    expect(contest.winner).toBe('A');
    expect(eventsOfType(events, 'injured')[0]).toMatchObject({ side: 'B', pos: dfn(LAST), source: 'hit', cause: 'Flambé', carriedOff: false });
    expect(state.injuries[uid(s, 'B', 'B def')]).toBeDefined();
    expect(state.teams.A.lineup.forward[LAST]!.revealed).toBe(true);
    expect(state.teams.B.lineup.defense[LAST]!.revealed).toBe(true);
  });

  it('misses on a tie (ties go to the target)', () => {
    const s = scenario({ lanes, A: { hand: [hit()] } }); // filler Defense 3
    const { state, events } = castHit(s, mid(0));
    expect(lastContest(events).winner).toBe('B');
    expect(Object.keys(state.injuries)).toHaveLength(0);
  });

  it('is stronger on a match and weaker when opposed', () => {
    const casterWith = (affinity: string) => scenario({ lanes, A: { hand: [hit('fire')], lineup: { forward: { [LAST]: player('A fwd', {}, { affinities: [affinity] }) } } } });
    expect(lastContest(castHit(casterWith('fire'), fwd(LAST)).events).attacker.total).toBe(4);
    expect(lastContest(castHit(casterWith('water'), fwd(LAST)).events).attacker.total).toBe(2);
  });

  it("never targets the goalie: a forward's hit goes at the defender in its spot", () => {
    const s = scenario({ lanes, A: { hand: [hit()] } });
    const { events } = castHit(s, fwd(0));
    expect(lastContest(events).defender.pos).toEqual(dfn(0));
    expect(eventsOfType(events, 'contestStarted')[0]?.defender.pos).not.toEqual(GOAL_POS);
  });

  it("can't be cast by a goalie", () => {
    const s = scenario({ lanes, A: { hand: [hit()] } });
    expect(() => castHit(s, GOAL_POS as never)).toThrow("A goalie can't cast a hit.");
  });

  it('is a normal contest: both sides may play reaction spells, and a shield stops it', () => {
    // The hitter needs two Resonants to cast both the hit and a reaction (RULES.md "Casting limit").
    const hitter = player('A fwd', {}, { affinities: ['earth', 'fire'] });
    const s = scenario({ lanes, A: { hand: [hit(), boost('A boost')], lineup: { forward: { [LAST]: hitter } } }, B: { hand: [shield('B shield')], lineup: { defense: { [LAST]: player('B def', { defense: 1 }) } } } });
    let { state } = castHit(s, fwd(LAST));
    ({ state } = play(state, { type: 'react', side: 'A', card: uid(s, 'A', 'A boost') }));
    const { events } = play(state, { type: 'react', side: 'B', card: uid(s, 'B', 'B shield') });
    // Strength 3 shielded to 0, + boost 2 = 2, against Defense 1.
    expect(lastContest(events).attacker.total).toBe(2);
    expect(lastContest(events).winner).toBe('A');
  });

  it('needs someone to hit', () => {
    const s = scenario({ lanes, A: { hand: [hit()] } });
    s.teams.B.lineup.defense[LAST] = null;
    expect(() => castHit(s, fwd(LAST))).toThrow(IllegalActionError);
    expect(() => applyAction(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Flambé'), caster: fwd(0), target: { kind: 'hit' } })).not.toThrow();
  });
});
