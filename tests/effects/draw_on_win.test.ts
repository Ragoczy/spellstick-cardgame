// Effect: draw_on_win { count }
import { describe, expect, it } from 'vitest';
import type { PlayerAbility } from '../../src/engine/cards';
import { LANE_COUNTS, dfn, eventsOfType, fwd, play, player, scenario, shield, uid } from '../helpers';

const drawOnWin: PlayerAbility = { effect: 'draw_on_win', params: { count: 1 } };

describe.each(LANE_COUNTS)('draw_on_win (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it("draws for the player's owner when the player wins a contest", () => {
    const s = scenario({ lanes, A: { lineup: { forward: { [LAST]: player('A fwd', { speed: 5 }, { ability: drawOnWin }) } } } });
    const { events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(eventsOfType(events, 'drew')[0]).toMatchObject({ side: 'A', count: 1, reason: 'ability' });
  });

  it('does nothing when the player loses', () => {
    const s = scenario({ lanes, A: { lineup: { forward: { [LAST]: player('A fwd', { speed: 1 }, { ability: drawOnWin }) } } } });
    const { events } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    expect(eventsOfType(events, 'drew').filter((e) => e.side === 'A')).toHaveLength(0);
  });

  it('counts faceoffs as contests', () => {
    const s = scenario({ lanes, ball: null, A: { lineup: { midfield: { 0: player('A mid', { faceoff: 6 }, { ability: drawOnWin }) } } } });
    s.pending = { kind: 'faceoffLane', side: 'B' };
    const { events } = play(s, { type: 'faceoffLane', side: 'B', lane: 0 });
    expect(eventsOfType(events, 'drew').find((e) => e.side === 'A' && e.reason === 'ability')).toBeDefined();
  });

  it('is ignored when the player is shielded', () => {
    // A tackles with Defense 0 and shields B's holder (Speed 0), so B still wins the 0–0 tie.
    const s = scenario({
      lanes,
      ball: { side: 'B', pos: dfn(LAST) },
      A: { hand: [shield('A shield')], lineup: { forward: { [LAST]: player('A fwd', { defense: 0 }) } } },
      B: { lineup: { defense: { [LAST]: player('B def', { speed: 3 }, { ability: drawOnWin }) } } },
    });
    const { events } = play(s, { type: 'tackle', side: 'A' }, { type: 'react', side: 'A', card: uid(s, 'A', 'A shield') });
    expect(eventsOfType(events, 'contestResolved')[0]?.winner).toBe('B');
    expect(eventsOfType(events, 'drew').filter((e) => e.reason === 'ability')).toHaveLength(0);
  });
});
