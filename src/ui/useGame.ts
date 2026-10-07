// Connects a GameSession to React: keeps the screen up to date, paces the computer's moves,
// and turns events into play-by-play lines and pop-up announcements.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, Breakdown, ContestKind, GameEvent, Pos, Side } from '../engine';
import { GameSession, type SessionOptions } from './session';
import { describeForPlayer, type Line, type Tone } from './text';

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

export interface GameController {
  session: GameSession;
  /** Changes whenever the game changes, so components re-read the session. */
  version: number;
  log: Line[];
  announcement: Announcement | null;
  dismissAnnouncement: () => void;
  /** Positions revealed by the latest action, for the flip animation. Keys from posKey(). */
  justRevealed: Set<string>;
  act: (action: Action) => void;
}

export function posKey(side: Side, pos: Pos): string {
  return pos.area === 'goal' ? `${side}:goal` : `${side}:${pos.area}:${pos.lane}`;
}

/** autoplay: your side is played by the hint (for testing and for watching a game). */
export function useGame(options: SessionOptions, autoplay = false): GameController {
  const [session] = useState(() => new GameSession(options));
  const [version, setVersion] = useState(0);
  const [log, setLog] = useState<Line[]>([]);
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [justRevealed, setJustRevealed] = useState<Set<string>>(new Set());
  const nextId = useRef(1);

  const handleEvents = useCallback((events: GameEvent[]) => {
    const lanes = session.view.lanes;
    const lines: Line[] = [];
    const announcements: Announcement[] = [];
    const revealed = new Set<string>();
    for (const e of events) {
      const line = describeForPlayer(e, session.human, lanes);
      if (line) lines.push(line);
      if (e.type === 'revealed') revealed.add(posKey(e.side, e.pos));
      if (e.type === 'contestResolved' && line) {
        const mine = e.attacker.side === session.human ? e.attacker : e.defender;
        const theirs = e.attacker.side === session.human ? e.defender : e.attacker;
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
  }, [session]);

  // Opening lines.
  useEffect(() => {
    const opening = session.openingEvents
      .map((e) => describeForPlayer(e, session.human, session.view.lanes))
      .filter((line): line is Line => line !== null);
    setLog([{ text: 'Choose your goalie to begin.', tone: 'turn' }, ...opening]);
  }, [session]);

  const act = useCallback((action: Action) => handleEvents(session.act(action)), [session, handleEvents]);

  const announcement = queue[0] ?? null;
  const dismissAnnouncement = useCallback(() => setQueue((old) => old.slice(1)), []);

  // Pop-ups close by themselves after a moment (or when tapped).
  useEffect(() => {
    if (!announcement || announcement.title === 'Game over') return;
    const timer = setTimeout(dismissAnnouncement, ANNOUNCEMENT_MS);
    return () => clearTimeout(timer);
  }, [announcement, dismissAnnouncement]);

  // The computer moves when it's its turn and no pop-up is showing.
  useEffect(() => {
    if (session.waitingFor !== 'computer' || announcement) return;
    // Setup choices are quick; moves during play get a short pause so you can follow them.
    const quick = ['chooseGoalie', 'placeLineup'].includes(session.view.pending.kind);
    const timer = setTimeout(() => handleEvents(session.computerStep()), quick ? 120 : COMPUTER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [session, version, announcement, handleEvents]);

  // Autoplay: your moves are made for you, using the hint.
  useEffect(() => {
    if (!autoplay || session.waitingFor !== 'human' || announcement) return;
    const timer = setTimeout(() => {
      const hint = session.hint();
      if (hint) handleEvents(session.act(hint));
    }, 150);
    return () => clearTimeout(timer);
  }, [autoplay, session, version, announcement, handleEvents]);

  return { session, version, log, announcement, dismissAnnouncement, justRevealed, act };
}
