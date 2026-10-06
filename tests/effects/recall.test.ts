// Effect: recall { count } (action, numeric)
import { describe, expect, it } from 'vitest';
import { LANE_COUNTS, actionSpell, eventsOfType, mid, play, player, scenario, uid } from '../helpers';

describe.each(LANE_COUNTS)('recall (%i lanes)', (lanes) => {
  function recallWith(casterAffinity: string, element: string | null = 'fire') {
    const s = scenario({
      lanes,
      A: {
        hand: [actionSpell('Recall', { effect: 'recall', params: { count: 2 } }, element)],
        lineup: { midfield: { 0: player('caster', {}, { affinities: [casterAffinity] }) } },
      },
    });
    return play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Recall'), caster: mid(0), target: { kind: 'none' } });
  }

  const drawn = (events: ReturnType<typeof recallWith>['events']) =>
    eventsOfType(events, 'drew').find((e) => e.side === 'A' && e.reason === 'recall')?.count;

  it('draws its count, adjusted by affinity', () => {
    expect(drawn(recallWith('earth').events)).toBe(2);
    expect(drawn(recallWith('fire').events)).toBe(3);
    expect(drawn(recallWith('water').events)).toBe(1);
    expect(drawn(recallWith('water', null).events)).toBe(2);
  });

  it('adds the cards to your hand', () => {
    const { state } = recallWith('earth');
    expect(state.teams.A.hand).toHaveLength(2);
  });
});
