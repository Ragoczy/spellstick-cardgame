// Effect: dirty_play {} (reaction, non-numeric)
import { describe, expect, it } from 'vitest';
import { LANE_COUNTS, dfn, eventsOfType, fwd, lastContest, mid, play, player, reaction, scenario, uid } from '../helpers';

const lateHit = (element: string | null = null) => reaction('Late Hit', { effect: 'dirty_play', params: {} }, element);

describe.each(LANE_COUNTS)('dirty_play (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('injures the opposing player in the contest if your side wins', () => {
    const s = scenario({ lanes, A: { hand: [lateHit()], lineup: { forward: { [LAST]: player('A fwd', { speed: 5 }) } } } });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'react', side: 'A', card: uid(s, 'A', 'Late Hit') });
    expect(lastContest(events).winner).toBe('A');
    expect(eventsOfType(events, 'injured')[0]).toMatchObject({ side: 'B', pos: dfn(LAST), source: 'dirty_play', cause: 'Late Hit' });
    expect(Object.keys(state.injuries)).toHaveLength(1);
  });

  it("does nothing if your side loses", () => {
    const s = scenario({ lanes, A: { hand: [lateHit()], lineup: { forward: { [LAST]: player('A fwd', { speed: 1 }) } } } });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'react', side: 'A', card: uid(s, 'A', 'Late Hit') });
    expect(lastContest(events).winner).toBe('B');
    expect(Object.keys(state.injuries)).toHaveLength(0);
  });

  it('works for the defending side too, and in any contest (a faceoff here)', () => {
    const s = scenario({ lanes, ball: null, B: { hand: [lateHit()], lineup: { midfield: { 0: player('B mid', { faceoff: 6 }) } } } });
    s.pending = { kind: 'faceoffLane', side: 'A' };
    s.faceoffChooser = 'A';
    const { events } = play(s, { type: 'faceoffLane', side: 'A', lane: 0 }, { type: 'react', side: 'B', card: uid(s, 'B', 'Late Hit') });
    expect(eventsOfType(events, 'injured')[0]).toMatchObject({ side: 'A', pos: mid(0) });
  });

  it('fails when the caster is opposed', () => {
    const s = scenario({ lanes, A: { hand: [lateHit('water')], lineup: { forward: { [LAST]: player('A fwd', { speed: 5 }, { affinities: ['fire'] }) } } } });
    const { state, events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) }, { type: 'react', side: 'A', card: uid(s, 'A', 'Late Hit') });
    expect(eventsOfType(events, 'spellCast')[0]?.fizzled).toBe(true);
    expect(Object.keys(state.injuries)).toHaveLength(0);
  });
});
