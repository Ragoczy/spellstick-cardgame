// The numbers the browser game shows in prompts must match what the contest actually comes to.
import { describe, expect, it } from 'vitest';
import { prototypeCards } from '../src/data/prototype';
import { viewFor, type GameEvent } from '../src/engine';
import { GameSession } from '../src/ui/session';
import { dicePreview, matchup, reactionPreview } from '../src/ui/preview';
import { LANE_COUNTS, boost, dfn, fwd, play, player, scenario } from './helpers';

describe.each(LANE_COUNTS)('prompt previews (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('include injuries, for both sides', () => {
    const s = scenario({
      lanes,
      ball: { side: 'B', pos: dfn(LAST) },
      active: 'A',
      A: { hand: [boost('A boost')], lineup: { forward: { [LAST]: player('A fwd', { defense: 4 }) } } },
      B: { lineup: { defense: { [LAST]: player('B def', { speed: 4 }) } }, revealed: [dfn(LAST)] },
    });
    // Twisted ankle (−2 Speed) on their ball carrier.
    const ankle = s.injuryDeck.find((id) => s.injuryCards[id]!.name === 'Twisted ankle')!;
    s.injuries[s.teams.B.lineup.defense[LAST]!.uid] = ankle;
    s.injuryDeck = s.injuryDeck.filter((id) => id !== ankle);
    expect(matchup(viewFor(s, 'A'), { pos: fwd(LAST), stat: 'defense', use: 'tackle' }, { pos: dfn(LAST), stat: 'speed', use: 'evade' }))
      .toEqual({ mine: 4, theirs: 2 });
    const { state } = play(s, { type: 'tackle', side: 'A' });
    const preview = reactionPreview(viewFor(state, 'A'))!;
    expect([preview.mine, preview.theirs]).toEqual([4, 2]);
  });

  it('still offer the reaction prompt when the opposing spot is empty (it counts as 0)', () => {
    const s = scenario({ lanes, A: { hand: [boost('A boost')] } });
    s.teams.B.lineup.defense[LAST] = null;
    const { state } = play(s, { type: 'pass', side: 'A', to: fwd(LAST) });
    const preview = reactionPreview(viewFor(state, 'A'));
    expect(preview).not.toBeNull();
    expect(preview!.theirs).toBe(0);
  });

  it('match the final result in real games when nobody plays a spell or calls for dice', () => {
    let checked = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const session = new GameSession({ seed, cardSet: prototypeCards, lanes, team: 'A' });
      let shown: { mine: number; theirs: number } | null = null;
      while (session.waitingFor !== 'over') {
        let events: GameEvent[];
        if (session.waitingFor === 'human') {
          const view = session.view;
          const pre = view.pending.kind === 'callDice' ? dicePreview(view) : view.pending.kind === 'reaction' ? reactionPreview(view) : null;
          if (pre) shown = { mine: pre.mine, theirs: pre.theirs };
          const pass = session.legal.find((a) => (a.type === 'react' && a.card === null) || (a.type === 'callDice' && !a.roll));
          events = session.act(pass ?? session.hint()!);
        } else {
          events = session.computerStep();
        }
        for (const e of events) {
          if (e.type !== 'contestResolved' || !shown) continue;
          const mine = e.attacker.side === 'A' ? e.attacker : e.defender;
          const theirs = e.attacker.side === 'A' ? e.defender : e.attacker;
          const extras = [...mine.parts, ...theirs.parts].some((x) => x.label === 'Roll' || (x.label !== 'Ability' && x.amount > 0)) || mine.shielded || theirs.shielded;
          if (!extras) {
            checked++;
            expect([mine.total, theirs.total]).toEqual([shown.mine, shown.theirs]);
          }
          shown = null;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  }, 60_000);
});

