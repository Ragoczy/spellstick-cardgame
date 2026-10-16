// Tournaments (online build only): the list, one tournament's standings and rounds, and for
// admins, setting one up and making redeem codes. The rules are on the server
// (server/tournaments.ts); this only shows what it sends.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { prototypeCards } from '../data/prototype';
import { POOL_TEAM } from '../engine/cards';
import type { Collection } from '../shared/collectionApi';
import type { Pace } from '../shared/matchApi';
import type {
  PairingRow, Placing, RedeemCodeRow, TournamentDetail, TournamentFormat, TournamentSummary,
} from '../shared/tournamentApi';
import { liveConnected, listenLive } from './live';
import {
  cancelTournament, createCodes, createTournament, enterTournament, fetchCollection, fetchTournament, leaveTournament, listCodes,
  listTournaments, markPrizeSent, setStartTime, startTournament,
} from './online';

/** How often an open tournament page checks for changes when live updates aren't working. */
const CHECK_MS = 20_000;

/** The named players, for award cards and redeem codes. */
const awardablePlayers = prototypeCards.cards
  .filter((c) => c.team === POOL_TEAM && c.kind !== 'spell')
  .sort((a, b) => a.name.localeCompare(b.name));
const playerName = (cardId: string | null) => prototypeCards.cards.find((c) => c.id === cardId)?.name ?? cardId;

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** An ISO time as the value of a datetime-local input, in the viewer's own time zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value (the viewer's own time zone) as an ISO time, or null if it's empty. */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "Starts Oct 20, 2026, 6:00 PM." or, once that time has passed, that it's waiting for players. */
function startText(t: TournamentSummary): string {
  if (t.status !== 'registration') return '';
  if (!t.startsAt) return 'An admin starts it when everyone is in.';
  if (new Date(t.startsAt).getTime() <= Date.now()) return `Starts as soon as ${MIN_PLAYERS} players have entered.`;
  return `Starts ${when(t.startsAt)}.`;
}

/** Fewest players a tournament starts with (MIN_ENTRANTS on the server). */
const MIN_PLAYERS = 4;
const hoursText = (hours: number) => (hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'}`);

/** "Draft, two lanes, at your own pace. Rounds last 4 days." */
function formatText(t: TournamentSummary): string {
  const format = t.format === 'draft' ? 'Draft (pick 10 each)' : 'Saved teams';
  const lanes = t.lanes === 3 ? 'three lanes' : 'two lanes';
  const pace = t.pace === 'live' ? 'live (25 minutes each)' : 'at your own pace (36 hours each)';
  return `${format}, ${lanes}, ${pace}. Rounds last ${hoursText(t.roundHours)}.`;
}

/** "Round 2 of 3", "Semi-finals", and so on. */
function stageText(t: TournamentSummary, pairingsInRound: number): string {
  if (t.status === 'registration') return 'Open for entries';
  if (t.status === 'cancelled') return 'Called off';
  if (t.status === 'finished') return t.champion ? `Finished. Champion: ${t.champion}` : 'Finished';
  if (t.status === 'swiss') return `Round ${t.round} of ${t.swissRounds}`;
  return pairingsInRound <= 1 ? 'The final' : pairingsInRound === 2 ? 'Semi-finals' : 'Quarter-finals';
}

const PLACING_TEXT: Record<Placing, string> = {
  champion: 'You won the tournament!',
  finalist: 'You reached the final.',
  knockout: 'You made the knockout.',
  played: 'Thanks for taking part.',
};

export function TournamentsScreen({ isAdmin, onOpen, onBack }: { isAdmin: boolean; onOpen: (id: number) => void; onBack: () => void }) {
  const [list, setList] = useState<TournamentSummary[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const load = useCallback(() => {
    listTournaments().then(setList).catch((err: Error) => setProblem(err.message));
  }, []);
  useEffect(load, [load]);

  const open = list?.filter((t) => t.status === 'registration') ?? [];
  const running = list?.filter((t) => t.status === 'swiss' || t.status === 'knockout') ?? [];
  const past = list?.filter((t) => t.status === 'finished' || t.status === 'cancelled') ?? [];
  const row = (t: TournamentSummary) => (
    <li key={t.id} className={`match-row${t.youEntered ? ' yours' : ''}`}>
      <span>
        <strong>{t.name}</strong>{t.youEntered ? ' (you’re in)' : ''}. {startText(t)} {formatText(t)} {t.entrants} player{t.entrants === 1 ? '' : 's'}.
        {t.topPrize ? <> Top prize: {t.topPrize}.</> : null}
        {t.status === 'finished' && t.champion ? <> Champion: {t.champion}.</> : null}
      </span>
      <span className="buttons"><button type="button" onClick={() => onOpen(t.id)}>{t.status === 'registration' && !t.youEntered ? 'See and enter' : 'Open'}</button></span>
    </li>
  );

  return (
    <div className="screen lobby">
      <h2>Tournaments</h2>
      <p className="small">
        Swiss rounds, then a knockout for the top players. Matches start by themselves each round, and results come
        straight from the games. Everyone who plays gets an award card.
      </p>
      {problem ? <p className="account-problem">{problem}</p> : null}
      {list === null && !problem ? <p className="small">Loading…</p> : null}

      {open.length ? <h3>Open for entries</h3> : null}
      <ul className="match-list">{open.map(row)}</ul>
      {running.length ? <h3>Under way</h3> : null}
      <ul className="match-list">{running.map(row)}</ul>
      {past.length ? <h3>Finished</h3> : null}
      <ul className="match-list">{past.slice(0, 10).map(row)}</ul>
      {list !== null && !list.length ? <p className="small">No tournaments yet. Watch our Discord server for the next one.</p> : null}

      {isAdmin ? <NewTournamentForm onCreated={(t) => { load(); onOpen(t.id); }} /> : null}
      {isAdmin ? <RedeemCodes /> : null}

      <div className="buttons"><button type="button" onClick={onBack}>Back</button></div>
    </div>
  );
}

export function TournamentScreen({ id, isAdmin, onOpenMatch, onBack }: {
  id: number; isAdmin: boolean; onOpenMatch: (matchId: number) => void; onBack: () => void;
}) {
  const [data, setData] = useState<TournamentDetail | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchTournament(id).then(setData).catch((err: Error) => setProblem(err.message));
  }, [id]);
  useEffect(() => {
    load();
    // A match finishing may start the next round, so refresh on any match change.
    const stop = listenLive({ onMatchChange: load, onConnect: load });
    const timer = setInterval(() => {
      if (!document.hidden && !liveConnected()) load();
    }, CHECK_MS);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [load]);

  const t = data?.tournament;
  const needsTeam = t?.format === 'constructed' && t.status === 'registration' && !data?.you.entered;
  useEffect(() => {
    if (needsTeam && !collection) fetchCollection().then(setCollection).catch(() => {});
  }, [needsTeam, collection]);
  const ready = collection?.teams.filter((team) => !team.problems.length) ?? [];
  const chosenTeam = teamId !== null && ready.some((team) => team.id === teamId) ? teamId : ready[0]?.id;

  const run = async (work: () => Promise<TournamentDetail | unknown>, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setProblem(null);
    try {
      const result = await work();
      if (result && typeof result === 'object' && 'tournament' in result) setData(result as TournamentDetail);
      else load();
    } catch (err) {
      setProblem((err as Error).message);
    }
  };

  if (!data || !t) {
    return (
      <div className="screen">
        {problem ? <p className="account-problem">{problem}</p> : <p className="small">Loading the tournament…</p>}
        <div className="buttons"><button type="button" onClick={onBack}>Back to tournaments</button></div>
      </div>
    );
  }

  const rounds = [...new Set(data.pairings.map((p) => p.round))].sort((a, b) => b - a);
  const inRound = (round: number) => data.pairings.filter((p) => p.round === round);
  const underWay = t.status === 'swiss' || t.status === 'knockout';
  const you = data.you;

  return (
    <div className="screen lobby">
      <h2>{t.name}</h2>
      <p>
        {stageText(t, inRound(t.round).length)}.{underWay && t.roundEndsAt ? ` This round ends ${when(t.roundEndsAt)}.` : ''}
        {t.status === 'registration' ? ` ${startText(t)}` : ''}
      </p>
      <p className="small">{formatText(t)}</p>
      {t.topPrize ? (
        <p>
          <strong>Top prize:</strong> {t.topPrize}
          {t.status === 'finished' && t.champion ? ` (won by ${t.champion})` : ''}
        </p>
      ) : null}
      {t.awardCard ? <p className="small">Award cards: {playerName(t.awardCard)}. The champion’s is numbered 1 of 1; knockout players get a foil.</p> : null}
      {problem ? <p className="account-problem">{problem}</p> : null}

      <div className="account">
        {you.placing ? (
          <p>{PLACING_TEXT[you.placing]}{you.placing === 'champion' && t.topPrize ? ' An admin will be in touch about your prize.' : ''}</p>
        ) : you.dropped ? (
          <p>You've left this tournament. Your results so far stay in the standings.</p>
        ) : you.entered ? (
          <div className="account-row">
            <span>{t.status === 'registration'
              ? `You're in. Your first match starts when the tournament does${t.startsAt ? ` (${when(t.startsAt)} or later)` : ''}.`
              : "You're playing."}</span>
            {you.currentMatchId ? (
              <span className="buttons"><button type="button" className="primary" onClick={() => onOpenMatch(you.currentMatchId!)}>Go to your match</button></span>
            ) : null}
            {t.status === 'registration' || underWay ? (
              <button type="button" className="quiet" onClick={() => run(() => leaveTournament(id),
                t.status === 'registration' ? undefined : 'Drop out of this tournament? Your match in progress counts as resigned, and you play no more rounds.')}>
                {t.status === 'registration' ? 'Withdraw' : 'Drop out'}
              </button>
            ) : null}
          </div>
        ) : t.status === 'registration' ? (
          <div className="account-row">
            {t.format === 'constructed' ? (
              ready.length ? (
                <label className="small">
                  Your team{' '}
                  <select value={chosenTeam} onChange={(e) => setTeamId(Number(e.target.value))}>
                    {ready.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                </label>
              ) : <span className="small">{collection ? "You need a saved team that's ready to play." : 'Loading your teams…'}</span>
            ) : null}
            <span className="buttons">
              <button type="button" className="primary" disabled={t.format === 'constructed' && chosenTeam === undefined}
                onClick={() => run(() => enterTournament(id, t.format === 'constructed' ? chosenTeam : undefined))}>
                Enter
              </button>
            </span>
            {t.format === 'constructed' ? <span className="small">Your team is copied when you enter, so later changes don’t count.</span> : null}
          </div>
        ) : (
          <p className="small">Entries for this tournament have closed.</p>
        )}
      </div>

      {t.status === 'registration' ? (
        <>
          <h3>Entered ({data.entrants.length})</h3>
          {data.entrants.length ? (
            <ul>{data.entrants.map((e) => <li key={e.name} className={e.you ? 'you' : undefined}>{e.name}{e.teamName ? `, with ${e.teamName}` : ''}</li>)}</ul>
          ) : <p className="small">Nobody yet.</p>}
        </>
      ) : null}

      {rounds.map((round) => {
        const pairs = inRound(round);
        const stage = pairs[0]!.stage;
        const title = stage === 'swiss' ? `Round ${round}` : pairs.length === 1 ? 'Final' : pairs.length === 2 ? 'Semi-finals' : 'Quarter-finals';
        return (
          <div key={round}>
            <h3>{title}</h3>
            <ul className="match-list">
              {pairs.map((p) => (
                <li key={p.slot} className={`match-row${p.a.you || p.b?.you ? ' yours' : ''}${p.outcome ? ' done' : ''}`}>
                  <span>{pairingText(p)}</span>
                  {p.matchId ? (
                    <span className="buttons"><button type="button" onClick={() => onOpenMatch(p.matchId!)}>{p.outcome ? 'Look' : 'Play'}</button></span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {data.standings.length ? (
        <>
          <h3>Swiss standings</h3>
          <table className="rankings-table">
            <thead>
              <tr><th>#</th><th>Player</th><th>Points</th><th>Record</th><th title="Opponents' match-win percentage">Opp. %</th><th title="Goals scored minus goals let in">Goals +/−</th></tr>
            </thead>
            <tbody>
              {data.standings.map((s) => (
                <tr key={s.name} className={s.you ? 'you' : undefined}>
                  <td>{s.rank}</td>
                  <td>{s.name}{s.teamName ? <span className="small"> ({s.teamName})</span> : null}{s.dropped ? <span className="small"> (left)</span> : null}</td>
                  <td>{s.points}</td>
                  <td>{s.wins}–{s.losses}{s.draws ? `–${s.draws}` : ''}</td>
                  <td>{s.opponentsWin}</td>
                  <td>{s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <h3>How it works</h3>
      <ul className="small">
        <li>Swiss rounds pair players with the same score, and nobody plays the same person twice. A win is 3 points, a draw 1.</li>
        <li>Ties are broken by how well your opponents did, then goals scored minus goals let in.</li>
        <li>If the round ends before your match does, the score at that moment decides it. In the knockout, a level score sends the higher seed through.</li>
        <li>Miss two rounds without making a move and you’re dropped. A player left over in a round gets a bye, which counts as a win.</li>
        {t.knockoutSize ? <li>After the Swiss rounds, the top {t.knockoutSize} play a knockout: one game a match.</li> : <li>The knockout is for the top 4 (top 8 from 32 players); with fewer than 6 players, the Swiss standings decide the champion.</li>}
      </ul>

      {isAdmin ? (
        <div className="account">
          <strong>Admin</strong>
          {t.status === 'registration' ? <StartTimeEditor tournament={t} onSave={(startsAt) => run(() => setStartTime(id, startsAt))} /> : null}
          <div className="buttons">
            {t.status === 'registration' ? (
              <button type="button" className="primary" onClick={() => run(() => startTournament(id),
                `Start ${t.name} with ${data.entrants.length} players? Entries close, and round 1 starts now.`)}>Start it now</button>
            ) : null}
            {t.status === 'registration' || underWay ? (
              <button type="button" onClick={() => run(() => cancelTournament(id),
                'Call this tournament off? Matches under way can still be played, but they no longer count, and nobody gets award cards.')}>Call it off</button>
            ) : null}
            {t.status === 'finished' && t.topPrize ? (
              data.prizeSentAt
                ? <span className="small">Prize marked sent {when(data.prizeSentAt)}.</span>
                : <button type="button" onClick={() => run(() => markPrizeSent(id))}>Mark the top prize sent</button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="buttons"><button type="button" onClick={onBack}>Back to tournaments</button></div>
    </div>
  );
}

/** "Player 1 beat Player 3, 2–1." from the pairing, with seeds in the knockout. */
function pairingText(p: PairingRow): string {
  const name = (who: PairingRow['a']) => `${who.you ? 'You' : who.name}${who.seed ? ` (${who.seed})` : ''}`;
  if (!p.b) return `${name(p.a)}: a bye${p.stage === 'knockout' ? ' (their opponent left)' : ''}, counted as a win.`;
  const a = name(p.a);
  const b = name(p.b);
  const score = `${p.goalsA}–${p.goalsB}`;
  /** How a win came about: the score, or that the other player resigned or never moved. */
  const how = (loser: PairingRow['a'], goals: string) => {
    const them = loser.you ? 'you' : loser.name;
    if (p.ended === 'resigned') return ` (${them} resigned)`;
    if (p.ended === 'forfeit') return ` (${them} ran out of time without moving)`;
    if (p.ended === 'deadline') return `, ${goals} when the round ended`;
    return `, ${goals}`;
  };
  switch (p.outcome) {
    case null: return `${a} v ${b}: being played.`;
    case 'A': return `${a} beat ${b}${how(p.b, score)}.`;
    case 'B': return `${b} beat ${a}${how(p.a, `${p.goalsB}–${p.goalsA}`)}.`;
    case 'draw': return p.stage === 'knockout' ? `${a} v ${b}: level at the deadline, ${score}. The higher seed goes through.` : `${a} drew with ${b}, ${score}.`;
    case 'double_loss': return `${a} v ${b}: neither player moved before the deadline, so both lose.`;
    default: return `${a} v ${b}.`;
  }
}

/** Admins: set up a tournament. */
function NewTournamentForm({ onCreated }: { onCreated: (t: TournamentSummary) => void }) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('draft');
  const [lanes, setLanes] = useState(2);
  const [pace, setPace] = useState<Pace>('async');
  const [roundHours, setRoundHours] = useState(96);
  const [topPrize, setTopPrize] = useState('');
  const [awardCard, setAwardCard] = useState(awardablePlayers[0]?.id ?? '');
  /** A datetime-local value, or '' for "an admin starts it by hand". */
  const [startsAt, setStartsAt] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const changePace = (next: Pace) => {
    setPace(next);
    setRoundHours(next === 'live' ? 2 : 96);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    try {
      onCreated(await createTournament({ name, format, lanes, pace, roundHours, topPrize, awardCard, startsAt: fromLocalInput(startsAt) }));
    } catch (err) {
      setProblem((err as Error).message);
    }
  };

  return (
    <form className="account challenge" onSubmit={submit}>
      <strong>Set up a tournament (admins)</strong>
      <label className="small" htmlFor="tournament-name">Name</label>
      <input id="tournament-name" className="text-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Spring Cup" />
      <div className="options">
        <label>
          Players
          <select value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)}>
            <option value="draft">Draft (pick 10 each)</option>
            <option value="constructed">Saved teams</option>
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
          <select value={pace} onChange={(e) => changePace(e.target.value as Pace)}>
            <option value="async">At your own pace (36 hours each)</option>
            <option value="live">Live (25 minutes each)</option>
          </select>
        </label>
        <label>
          Round length (hours)
          <input className="text-input" type="number" min={pace === 'live' ? 1 : 72} max={336} value={roundHours}
            onChange={(e) => setRoundHours(Number(e.target.value))} />
        </label>
        <label>
          Award card
          <select value={awardCard} onChange={(e) => setAwardCard(e.target.value)}>
            <option value="">No award cards</option>
            {awardablePlayers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <label className="small" htmlFor="tournament-start">
        Start time (optional, your time zone). Players can enter until then, and it starts by itself. Leave it empty to start it by hand.
      </label>
      <input id="tournament-start" className="text-input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      <label className="small" htmlFor="tournament-prize">Top prize (optional). Anything you like; you send it to the champion yourself.</label>
      <input id="tournament-prize" className="text-input" value={topPrize} onChange={(e) => setTopPrize(e.target.value)} maxLength={200}
        placeholder="A signed paperback of the next Warlock book" />
      <p className="small">
        Prize events should use the draft, so nobody can buy an edge. Async rounds need at least 72 hours (both players’ time banks); 96 (4 days) is the plan.
      </p>
      {problem ? <p className="account-problem">{problem}</p> : null}
      <div className="buttons"><button type="submit" className="primary" disabled={!name.trim()}>Set it up</button></div>
      <p className="small">
        Players can enter as soon as it's set up. It needs at least 4 players: if fewer have entered at the start time, it
        starts as soon as the 4th enters. You can also start it early from its page.
      </p>
    </form>
  );
}

/** Admins: make redeem codes for award cards, and see who used them. */
function RedeemCodes() {
  const [codes, setCodes] = useState<RedeemCodeRow[] | null>(null);
  const [cardId, setCardId] = useState(awardablePlayers[0]?.id ?? '');
  const [label, setLabel] = useState('');
  const [count, setCount] = useState(10);
  const [tradeable, setTradeable] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [made, setMade] = useState<RedeemCodeRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(() => {
    listCodes().then(setCodes).catch((err: Error) => setProblem(err.message));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    try {
      setMade(await createCodes({ cardId, label, count, tradeable, expiresInDays }));
      if (codes) load();
    } catch (err) {
      setProblem((err as Error).message);
    }
  };

  return (
    <form className="account challenge" onSubmit={submit}>
      <strong>Redeem codes (admins)</strong>
      <p className="small">Each code gives one award copy of a card, once. Hand them out for book launches, events, or staff picks. Players type them in on their cards page.</p>
      <div className="options">
        <label>
          Card
          <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {awardablePlayers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          How many
          <input className="text-input" type="number" min={1} max={200} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <label>
          Lasts (days, 0 for no end)
          <input className="text-input" type="number" min={0} max={365} value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))} />
        </label>
        <label>
          Trading
          <select value={tradeable ? 'yes' : 'no'} onChange={(e) => setTradeable(e.target.value === 'yes')}>
            <option value="yes">Can be traded</option>
            <option value="no">Stays with the player</option>
          </select>
        </label>
      </div>
      <label className="small" htmlFor="code-label">Label on the card</label>
      <input id="code-label" className="text-input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Book launch week" />
      {problem ? <p className="account-problem">{problem}</p> : null}
      <div className="buttons">
        <button type="submit" className="primary" disabled={!label.trim()}>Make codes</button>
        <button type="button" className="quiet" onClick={load}>{codes ? 'Refresh the list' : 'Show codes made so far'}</button>
      </div>
      {made.length ? (
        <>
          <p className="small">New codes (copy them now):</p>
          <textarea className="text-input code-list" readOnly rows={Math.min(10, made.length)} value={made.map((c) => c.code).join('\n')} />
        </>
      ) : null}
      {codes ? (
        <table className="rankings-table stats-table">
          <thead><tr><th>Code</th><th>Card</th><th>Label</th><th>Used by</th></tr></thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.code}>
                <td><code>{c.code}</code></td>
                <td>{playerName(c.cardId)}</td>
                <td>{c.label}{c.tradeable ? '' : ' (stays)'}</td>
                <td>{c.redeemedBy ?? (c.expiresAt && new Date(c.expiresAt) < new Date() ? 'Expired' : '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </form>
  );
}

/** Admins: change when a tournament still open for entries starts. */
function StartTimeEditor({ tournament, onSave }: { tournament: TournamentSummary; onSave: (startsAt: string | null) => void }) {
  const [value, setValue] = useState(tournament.startsAt ? toLocalInput(tournament.startsAt) : '');
  return (
    <div className="account-row">
      <label className="small" htmlFor="change-start">Start time (your time zone)</label>
      <input id="change-start" className="text-input" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
      <span className="buttons">
        <button type="button" disabled={!value} onClick={() => onSave(fromLocalInput(value))}>Save start time</button>
        {tournament.startsAt ? <button type="button" className="quiet" onClick={() => { setValue(''); onSave(null); }}>Start it by hand instead</button> : null}
      </span>
    </div>
  );
}
