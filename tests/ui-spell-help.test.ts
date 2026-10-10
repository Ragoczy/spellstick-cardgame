// The explanations shown when a spell is tapped but can't be played right now.
import { describe, expect, it } from 'vitest';
import { viewFor } from '../src/engine';
import { spellWhen, whyNotNow } from '../src/ui/spellHelp';
import { describeForPlayer } from '../src/ui/text';
import { actionSpell, boost, fwd, play, scenario } from './helpers';

const steal = actionSpell('Steal', { effect: 'steal', params: { amount: 2 } });

describe('spell help', () => {
  it('prints when each kind of spell is played', () => {
    expect(spellWhen(boost('Boost'))).toBe('Play during a contest');
    expect(spellWhen(steal)).toBe('Play on your turn');
  });

  it('explains that reaction spells wait for a contest', () => {
    const s = scenario();
    expect(whyNotNow(viewFor(s, 'A'), boost('Boost'))).toMatch(/reaction spell.*When one starts/);
  });

  it("explains what an action spell needs (Steal needs the other team to have the ball)", () => {
    const s = scenario({ ball: { side: 'A', pos: fwd(0) } });
    expect(whyNotNow(viewFor(s, 'A'), steal)).toMatch(/other team needs to have the ball/);
  });

  it('explains when nobody has a spell left', () => {
    const s = scenario();
    for (const slot of [s.teams.A.goalie!, ...Object.values(s.teams.A.lineup).flat()]) {
      slot!.casts = 9;
      slot!.revealed = true;
    }
    expect(whyNotNow(viewFor(s, 'A'), steal)).toMatch(/None of your players has a spell left/);
  });

  it('says action spells are not for contests', () => {
    const s = scenario({ A: { hand: [boost('Boost')] } });
    const { state } = play(s, { type: 'pass', side: 'A', to: fwd(0) });
    expect(whyNotNow(viewFor(state, 'A'), steal)).toMatch(/action spell.*Only reaction spells work in a contest/);
  });
});

describe('play-by-play for a tired player', () => {
  it('tells you why you were not asked to react, but only if you had a reaction spell', () => {
    const e = { type: 'outOfSpells', side: 'A', pos: fwd(0) } as const;
    expect(describeForPlayer(e, 'A', 2, true)?.text).toBe("Your left forward has no spells left, so you can't play a reaction spell in this contest. Substitute them to recharge.");
    expect(describeForPlayer(e, 'A', 2, false)).toBeNull();
    expect(describeForPlayer(e, 'B', 2, false)?.text).toMatch(/computer can't play a reaction spell/);
  });
});
