// The browser game's session: a person (played here by the hint) against the computer, through
// the same API the screen uses. Checks a whole game can be played and the text never breaks.
import { describe, expect, it } from 'vitest';
import { prototypeCards } from '../src/data/prototype';
import { GameSession } from '../src/ui/session';
import { describeForPlayer } from '../src/ui/text';
import { LANE_COUNTS } from './helpers';

describe.each(LANE_COUNTS)('browser game session (%i lanes)', (lanes) => {
  it('plays a full game to the end, with a plain-language line for every important event', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const session = new GameSession({ seed, cardSet: prototypeCards, lanes, team: 'A' });
      let steps = 0;
      while (session.waitingFor !== 'over') {
        const events = session.waitingFor === 'human' ? session.act(session.hint()!) : session.computerStep();
        for (const e of events) {
          const line = describeForPlayer(e, 'A', lanes);
          if (line) {
            expect(line.text).not.toMatch(/undefined|NaN|\[object/);
          } else {
            expect(['placed', 'ballMoved', 'drew', 'goalieChosen', 'contestStarted']).toContain(e.type);
          }
        }
        expect(++steps).toBeLessThan(5000);
      }
      expect(session.view.result).not.toBeNull();
    }
  }, 60_000);

  it("only ever shows the person's own view", () => {
    const session = new GameSession({ seed: 3, cardSet: prototypeCards, lanes, team: 'B' });
    expect(session.view.me).toBe('A');
    expect('state' in session.view).toBe(false);
    expect(session.view.opponent.goalie.state).toBe('empty');
  });
});
