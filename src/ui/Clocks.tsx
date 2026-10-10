// Both players' time banks during an online match. The server sends what was left when it
// answered; the bank of the player being waited on counts down here between answers.

import { useEffect, useState } from 'react';
import type { MatchSummary } from '../shared/matchApi';
import { clockText } from './labels';
import type { OpponentWords } from './text';

/** Below this, a bank shows in red: 2 minutes in a live match, 6 hours at your own pace. */
const LOW_MS = { live: 2 * 60_000, async: 6 * 60 * 60_000 };

/** receivedAt: when the match (and its clock) arrived from the server. */
export function Clocks({ match, receivedAt, opp }: { match: MatchSummary; receivedAt: number; opp: OpponentWords }) {
  const clock = match.clock;
  const running = match.status === 'active' ? clock?.running ?? null : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  if (!clock) return null;
  const elapsed = Math.max(0, now - receivedAt);
  const left = (who: 'you' | 'them') => Math.max(0, clock[who] - (running === who ? elapsed : 0));
  const low = LOW_MS[match.pace ?? 'async'];
  const show = (who: 'you' | 'them', label: string) => {
    const ms = left(who);
    const computer = match.autopilot[who];
    return (
      <span className={`clock${running === who ? ' running' : ''}${ms < low && !computer ? ' low' : ''}`}>
        {label} <b>{computer ? 'out of time' : clockText(ms)}</b>
      </span>
    );
  };
  return (
    <span className="clocks" title="Time left in each player's time bank. A bank only runs while the game is waiting on that player.">
      ⏱ {show('you', 'You')} · {show('them', opp.Name)}
    </span>
  );
}
