// Connects a game to React: keeps the screen up to date and turns events into play-by-play
// lines and pop-up announcements. useGame plays against the computer (pacing its moves);
// useOnlineGame (useOnlineGame.ts) plays another person through the game server. Both give the
// game screen the same GameController.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, Breakdown, ContestKind, GameEvent, Pos, Side } from '../engine';
import type { MatchSummary } from '../shared/matchApi';
import type { Seat } from './seat';
import { GameSession, type SessionOptions } from './session';
import { describeForPlayer, opponentWords, type Line, type OpponentWords, type Tone } from './text';

/** A pop-up that pauses the game briefly: a contest result, a goal, or the final whistle. */
export interface Announcement {
  id: number;
  title: string;
  text: string;
  tone: Tone;
  contest?: { kind: ContestKind; mine: Breakdown; theirs: Breakdown };
}

/** How long the computer waits before acting, and how long pop-ups stay up. */
const COMPUTER_DELAY_MS = 650;
const ANNOUNCEMENT_MS = 2600;

const CONTEST_TITLE: Record<ContestKind, string> = {
  pass: 'Pass', tackle: 'Tackle', shot: 'Shot on goal', faceoff: 'Faceoff', penalty: 'Penalty', hit: 'Hit',
};

/** Extra controls for an online match. */
export interface OnlineControls {
  match: MatchSummary;
  /** A move is on its way to the server. */
  sending: boolean;
  /** Something went wrong, in plain language. */
  problem: string | null;
  resign: () => void;
  /** When `match` arrived from the server (Date.now()), for counting the time banks down. */
  receivedAt: number;
}

export interface GameController {
  seat: Seat;
  /** Changes whenever the game changes, so components re-read the seat. */
  version: number;
  log: Line[];
  announcement: Announcement | null;
  dismissAnnouncement: () => void;
  /** Positions revealed by the latest action, for the flip animation. Keys from posKey(). */
  justRevealed: Set<string>;
  act: (action: Action) => void;
  /** Places the rest of your lineup the way the computer would. */
  autoPlace: () => void;
  /** How to name the other team: the computer, or the other player. */
  opp: OpponentWords;
  /** Null when playing the computer. */
  online: OnlineControls | null;
}

export function posKey(side: Side, pos: Pos): string {
  return pos.area === 'goal' ? `${side}:goal` : `${side}:${pos.area}:${pos.lane}`;
}

/** The play-by-play log, pop-ups, and flip animations. Shared by both kinds of game. */
export function usePlayByPlay(opp: OpponentWords) {
  const [version, setVersion] = useState(0);
  const [log, setLog] = useState<Line[]>([]);
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [justRevealed, setJustRevealed] = useState<Set<string>>(new Set());
  const nextId = useRef(1);

  /** Adds new events (as seen from this seat, after they happened). announce: false for catching up on old events. */
  const show = useCallback((events: GameEvent[], seat: Seat, announce = true) => {
    const lanes = seat.view.lanes;
    const lines: Line[] = [];
    const announcements: Announcement[] = [];
    const revealed = new Set<string>();
    // A tired player can't react: only worth saying if you had a reaction spell to play.
    const holdingReaction = seat.view.mine.hand.some((c) => c.def.kind === 'spell' && c.def.spellType === 'reaction');
    for (const e of events) {
      const line = describeForPlayer(e, seat.human, lanes, holdingReaction, opp);
      if (line) lines.push(line);
      if (!announce) continue;
      if (e.type === 'revealed') revealed.add(posKey(e.side, e.pos));
      if (e.type === 'contestResolved' && line) {
        const mine = e.attacker.side === seat.human ? e.attacker : e.defender;
        const theirs = e.attacker.side === seat.human ? e.defender : e.attacker;
        announcements.push({ id: nextId.current++, title: CONTEST_TITLE[e.kind], text: line.text, tone: line.tone, contest: { kind: e.kind, mine, theirs } });
      }
      if (e.type === 'injured' && line) {
        announcements.push({ id: nextId.current++, title: e.carriedOff ? 'Carried off!' : 'Injury!', text: line.text, tone: line.tone });
      }
      if ((e.type === 'goal' || e.type === 'shootoutStarted' || e.type === 'gameOver') && line) {
        const title = e.type === 'goal' ? 'Goal!' : e.type === 'shootoutStarted' ? 'Penalty shootout' : 'Game over';
        announcements.push({ id: nextId.current++, title, text: line.text, tone: 'goal' });
      }
    }
    const newestFirst = [...lines].reverse();
    setLog((old) => [...newestFirst, ...old].slice(0, 200));
    if (announcements.length) setQueue((old) => [...old, ...announcements]);
    setJustRevealed(revealed);
    setVersion((v) => v + 1);
  }, [opp]);

  /** When you act, any pop-ups still showing are out of date. */
  const clearAnnouncements = useCallback(() => setQueue([]), []);
  const announcement = queue[0] ?? null;
  const dismissAnnouncement = useCallback(() => setQueue((old) => old.slice(1)), []);

  // Pop-ups close by themselves after a moment (or when tapped).
  useEffect(() => {
    if (!announcement || announcement.title === 'Game over') return;
    const timer = setTimeout(dismissAnnouncement, ANNOUNCEMENT_MS);
    return () => clearTimeout(timer);
  }, [announcement, dismissAnnouncement]);

  return { version, log, setLog, show, announcement, dismissAnnouncement, clearAnnouncements, justRevealed };
}

/** A game against the computer. autoplay: your side is played by the hint (for testing and for watching a game). */
export function useGame(options: SessionOptions, autoplay = false): GameController {
  const [session] = useState(() => new GameSession(options));
  const opp = useMemo(() => opponentWords(), []);
  const feed = usePlayByPlay(opp);
  const { show, setLog, announcement, clearAnnouncements } = feed;

  // Opening lines.
  useEffect(() => {
    const opening = session.openingEvents
      .map((e) => describeForPlayer(e, session.human, session.view.lanes, true, opp))
      .filter((line): line is Line => line !== null);
    const first = session.view.pending.kind === 'draftPick' ? 'Draft your players to begin.' : 'Choose your goalie to begin.';
    setLog([{ text: first, tone: 'turn' }, ...opening]);
  }, [session, opp, setLog]);

  const act = useCallback((action: Action) => {
    clearAnnouncements();
    show(session.act(action), session);
  }, [session, show, clearAnnouncements]);

  const autoPlace = useCallback(() => {
    while (session.view.pending.kind === 'placeLineup' && session.waitingFor === 'human') act(session.hint()!);
  }, [session, act]);

  // The computer moves when it's its turn and no pop-up is showing.
  useEffect(() => {
    if (session.waitingFor !== 'opponent' || announcement) return;
    // Setup choices are quick; moves during play get a short pause so you can follow them.
    const quick = ['draftPick', 'chooseGoalie', 'placeLineup'].includes(session.view.pending.kind);
    const timer = setTimeout(() => show(session.computerStep(), session), quick ? 120 : COMPUTER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [session, feed.version, announcement, show]);

  // Autoplay: your moves are made for you, using the hint.
  useEffect(() => {
    if (!autoplay || session.waitingFor !== 'human' || announcement) return;
    const timer = setTimeout(() => {
      const hint = session.hint();
      if (hint) show(session.act(hint), session);
    }, 150);
    return () => clearTimeout(timer);
  }, [autoplay, session, feed.version, announcement, show]);

  return {
    seat: session,
    version: feed.version,
    log: feed.log,
    announcement,
    dismissAnnouncement: feed.dismissAnnouncement,
    justRevealed: feed.justRevealed,
    act,
    autoPlace,
    opp,
    online: null,
  };
}
