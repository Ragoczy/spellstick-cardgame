// Online play (online build only): your matches, challenges to answer, and challenging another
// player. Opening a match shows the usual game screen, played through the game server.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { prototypeCards } from '../data/prototype';
import type { MatchDetail, MatchSummary, Pace, PlayerListing } from '../shared/matchApi';
import { clockText } from './labels';
import { GameScreen } from './GameScreen';
import { liveConnected, listenLive } from './live';
import { acceptChallenge, declineChallenge, findPlayers, listMatches, matchApi, sendChallenge } from './online';
import { useOnlineGame } from './useOnlineGame';

/** How often the match list checks for changes while it's open, when live updates aren't working. */
const LIST_CHECK_MS = 15_000;

const lanesText = (lanes: number) => (lanes === 3 ? 'three lanes' : 'two lanes');
const paceText = (pace: Pace | null) => (pace === 'live' ? ', live' : '');
/** " (35 h 12 m left)" for your own bank, when the match is timed. */
const yourTimeLeft = (m: MatchSummary) => (m.clock && !m.autopilot.you ? ` (${clockText(m.clock.you)} left)` : '');
const teamName = (id: string) => prototypeCards.teams.find((t) => t.id === id)?.name ?? id;

export function OnlineLobby({ onOpen, onBack }: { onOpen: (id: number) => void; onBack: () => void }) {
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setMatches(await listMatches());
    } catch (err) {
      setProblem((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void reload();
    // Any change to one of your matches (or a reconnect) refreshes the list.
    const stop = listenLive({ onMatchChange: () => void reload(), onConnect: () => void reload() });
    const timer = setInterval(() => {
      if (!document.hidden && !liveConnected()) void reload();
    }, LIST_CHECK_MS);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [reload]);

  /** Runs a button's request, then refreshes the list. */
  const run = async (work: () => Promise<unknown>) => {
    setProblem(null);
    try {
      await work();
    } catch (err) {
      setProblem((err as Error).message);
    }
    await reload();
  };

  const accept = async (id: number) => {
    setProblem(null);
    try {
      await acceptChallenge(id);
      onOpen(id);
    } catch (err) {
      setProblem((err as Error).message);
      await reload();
    }
  };

  const open = matches ?? [];
  const yourMove = open.filter((m) => m.yourMove);
  const theirMove = open.filter((m) => !m.yourMove && (m.status === 'active' || m.status === 'challenged'));
  const done = open.filter((m) => m.status === 'finished' || m.status === 'declined').slice(0, 10);

  return (
    <div className="screen lobby">
      <h2>Online play</h2>
      <p className="small">
        Matches are played at your own pace. Make your move whenever you like; the other player gets theirs
        when they next look. Hints are off in online matches.
      </p>
      {problem ? <p className="account-problem">{problem}</p> : null}

      <ChallengeForm onSent={() => reload()} onProblem={setProblem} />

      {matches === null ? <p className="small">Loading your matches…</p> : null}

      {yourMove.length ? <h3>Waiting on you</h3> : null}
      <ul className="match-list">
        {yourMove.map((m) => (
          <li key={m.id} className="match-row yours">
            {m.status === 'challenged' ? (
              <>
                <span><strong>{m.opponent.name}</strong> challenged you ({lanesText(m.lanes)}{paceText(m.pace)}, you play {teamName(m.team)}).</span>
                <span className="buttons">
                  <button type="button" className="primary" onClick={() => accept(m.id)}>Accept</button>
                  <button type="button" onClick={() => run(() => declineChallenge(m.id))}>Decline</button>
                </span>
              </>
            ) : (
              <>
                <span>Your move against <strong>{m.opponent.name}</strong>{yourTimeLeft(m)}.</span>
                <span className="buttons"><button type="button" className="primary" onClick={() => onOpen(m.id)}>Play</button></span>
              </>
            )}
          </li>
        ))}
      </ul>

      {theirMove.length ? <h3>Waiting on them</h3> : null}
      <ul className="match-list">
        {theirMove.map((m) => (
          <li key={m.id} className="match-row">
            {m.status === 'challenged' ? (
              <>
                <span>Waiting for <strong>{m.opponent.name}</strong> to accept ({lanesText(m.lanes)}{paceText(m.pace)}).</span>
                <span className="buttons"><button type="button" onClick={() => run(() => declineChallenge(m.id))}>Withdraw</button></span>
              </>
            ) : (
              <>
                <span><strong>{m.opponent.name}</strong>'s move.</span>
                <span className="buttons"><button type="button" onClick={() => onOpen(m.id)}>Look</button></span>
              </>
            )}
          </li>
        ))}
      </ul>

      {done.length ? <h3>Finished</h3> : null}
      <ul className="match-list">
        {done.map((m) => (
          <li key={m.id} className="match-row done">
            <span>{finishedText(m)}</span>
            {m.status === 'finished' ? <span className="buttons"><button type="button" onClick={() => onOpen(m.id)}>Look</button></span> : null}
          </li>
        ))}
      </ul>

      {matches !== null && open.length === 0 ? <p className="small">No matches yet. Challenge someone to get started.</p> : null}

      <div className="buttons">
        <button type="button" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

function finishedText(m: MatchSummary): string {
  const name = m.opponent.name;
  if (m.status === 'declined') return m.youChallenged ? `Your challenge to ${name} was called off.` : `Challenge from ${name} called off.`;
  const r = m.result!;
  const resigned = r.reason === 'resigned' ? (r.outcome === 'won' ? ` (${name} resigned)` : ' (you resigned)')
    : r.reason === 'forfeit' ? (r.outcome === 'won' ? ` (${name} ran out of time)` : ' (you ran out of time)') : '';
  if (r.outcome === 'draw') return `Draw with ${name}.`;
  return r.outcome === 'won' ? `You beat ${name}${resigned}.` : `${name} beat you${resigned}.`;
}

/** Find a player by name, choose the field and your team, and send a challenge. */
function ChallengeForm({ onSent, onProblem }: { onSent: () => void; onProblem: (message: string | null) => void }) {
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<PlayerListing[]>([]);
  const [picked, setPicked] = useState<PlayerListing | null>(null);
  const [lanes, setLanes] = useState(2);
  const [pace, setPace] = useState<Pace>('async');
  const [team, setTeam] = useState(prototypeCards.teams[0]!.id);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  // Look names up as the player types (after a short pause).
  useEffect(() => {
    if (picked) return;
    const timer = setTimeout(() => {
      findPlayers(search).then(setFound).catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, picked]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!picked) return;
    setSending(true);
    onProblem(null);
    try {
      await sendChallenge(picked.id, lanes, team, pace);
      setSent(`Challenge sent to ${picked.name}.`);
      setPicked(null);
      setSearch('');
      onSent();
    } catch (err) {
      onProblem((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="account challenge" onSubmit={submit}>
      <strong>Challenge a player</strong>
      {picked ? (
        <div className="account-row">
          <span>Opponent: <strong>{picked.name}</strong></span>
          <button type="button" className="quiet" onClick={() => setPicked(null)}>Change</button>
        </div>
      ) : (
        <>
          <label className="small" htmlFor="opponent-search">Type part of their team or manager name, or pick someone who was on recently.</label>
          <input id="opponent-search" className="text-input" value={search} onChange={(e) => { setSearch(e.target.value); setSent(null); }} maxLength={24} autoComplete="off" placeholder="Name" />
          <div className="player-results">
            {found.map((p) => (
              <button type="button" key={p.id} onClick={() => setPicked(p)}>{p.name}</button>
            ))}
            {search && !found.length ? <span className="small">Nobody by that name yet.</span> : null}
          </div>
        </>
      )}
      <div className="options">
        <label>
          Your team
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            {prototypeCards.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>
          Field
          <select value={lanes} onChange={(e) => setLanes(Number(e.target.value))}>
            <option value={2}>Two lanes (base game)</option>
            <option value={3}>Three lanes (center-lane add-on)</option>
          </select>
        </label>
        <label>
          Pace
          <select value={pace} onChange={(e) => setPace(e.target.value as Pace)}>
            <option value="async">At your own pace (36 hours each)</option>
            <option value="live">Live (25 minutes each)</option>
          </select>
        </label>
      </div>
      <p className="small">Each player has a time bank that only runs while the game is waiting on them. If yours runs out, the computer makes the rest of your moves (or, if you never moved, you lose by forfeit).</p>
      <div className="buttons">
        <button type="submit" className="primary" disabled={!picked || sending}>Send challenge</button>
      </div>
      {sent ? <p className="small">{sent} They'll see it in their matches.</p> : null}
    </form>
  );
}

/** Loads one match and shows it on the game screen. */
export function OnlineMatchScreen({ matchId, onBack }: { matchId: number; onBack: () => void }) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    matchApi.get(matchId).then(setDetail).catch((err: Error) => setProblem(err.message));
  }, [matchId]);

  if (problem || (detail && !detail.game)) {
    const text = problem ?? (detail!.match.status === 'declined'
      ? 'This challenge was called off.'
      : detail!.match.youChallenged ? `Waiting for ${detail!.match.opponent.name} to accept your challenge.` : 'Accept this challenge from your matches to start playing.');
    return (
      <div className="screen">
        <p>{text}</p>
        <div className="buttons"><button type="button" onClick={onBack}>Back to your matches</button></div>
      </div>
    );
  }
  if (!detail) return <div className="screen"><p className="small">Loading the match…</p></div>;
  return <OnlineGame initial={detail} onBack={onBack} />;
}

function OnlineGame({ initial, onBack }: { initial: MatchDetail; onBack: () => void }) {
  const game = useOnlineGame(initial);
  return <GameScreen game={game} onQuit={onBack} />;
}
