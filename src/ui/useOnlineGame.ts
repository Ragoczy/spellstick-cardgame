// An online match for the game screen: the same GameController as a game against the computer,
// backed by the game server. While it's the other player's decision, it checks for their move
// every few seconds (more slowly after a couple of minutes, and not while the tab is hidden).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action } from '../engine';
import type { MatchDetail } from '../shared/matchApi';
import { matchApi } from './online';
import { OnlineMatchClient, OnlineSeat } from './onlineMatch';
import { opponentWords } from './text';
import { usePlayByPlay, type GameController } from './useGame';

/** How often to check for the other player's move: soon after they got the decision, then less often. */
const QUICK_CHECK_MS = 3_000;
const SLOW_CHECK_MS = 20_000;
const QUICK_FOR_MS = 2 * 60_000;

/** initial: the match as first loaded (it must have started). */
export function useOnlineGame(initial: MatchDetail): GameController {
  const opp = useMemo(() => opponentWords(initial.match.opponent.name), [initial.match.opponent.name]);
  const feed = usePlayByPlay(opp);
  const { show, setLog, clearAnnouncements } = feed;
  const [detail, setDetail] = useState(initial);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const seat = useMemo(() => new OnlineSeat(detail), [detail]);

  // The client lives as long as the screen. Its updates go through a ref so they always reach
  // the latest show().
  const showRef = useRef(show);
  showRef.current = show;
  const [client] = useState(() => new OnlineMatchClient(matchApi, initial, {
    onUpdate: (next, events) => {
      setDetail(next);
      showRef.current(events, new OnlineSeat(next));
    },
    onSending: setSending,
    onProblem: setProblem,
  }));

  // Catch up on everything so far (no pop-ups for old news).
  useEffect(() => {
    const events = initial.game!.events.flatMap((m) => m.events);
    setLog([]);
    show(events, new OnlineSeat(initial), false);
  }, [initial, show, setLog]);

  // While it's the other player's decision, check for their move.
  useEffect(() => {
    if (seat.waitingFor !== 'opponent') return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const waited = Date.now() - Date.parse(detail.match.waitingSince);
      timer = setTimeout(check, waited < QUICK_FOR_MS ? QUICK_CHECK_MS : SLOW_CHECK_MS);
    };
    const check = () => {
      if (!document.hidden) client.refresh();
      schedule();
    };
    const onVisible = () => {
      if (!document.hidden) client.refresh();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [seat, detail, client]);

  const act = useCallback((action: Action) => {
    clearAnnouncements();
    client.act(action);
  }, [client, clearAnnouncements]);

  const autoPlace = useCallback(() => client.autoPlace(), [client]);

  const resign = useCallback(() => {
    if (window.confirm('Resign this match? It counts as a loss.')) client.resign();
  }, [client]);

  return {
    seat,
    version: feed.version,
    log: feed.log,
    announcement: feed.announcement,
    dismissAnnouncement: feed.dismissAnnouncement,
    justRevealed: feed.justRevealed,
    act,
    autoPlace,
    opp,
    online: { match: detail.match, sending, problem, resign },
  };
}
