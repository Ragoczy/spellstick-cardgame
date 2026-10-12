// The stats dashboard (moderators and admins, online build only): how the online game is going.
// Players, matches, activity over the last 30 days, team and side records, draft picks, ratings,
// the most active players, and Discord notifications. The numbers come from GET /api/admin/stats.

import { useCallback, useEffect, useState } from 'react';
import { fetchStats, type StatsOverview } from './online';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
/** "Oct 3", for a UTC date like 2026-10-03. */
const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
/** "42%", or a dash when there's nothing to divide by. */
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((100 * n) / of)}%` : '–');
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
/** "3 h 20 min", "45 min", or "2.5 days". */
function duration(minutes: number | null): string {
  if (minutes === null) return '–';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h ${Math.round(minutes % 60)} min`;
  return `${Math.round((minutes / 60 / 24) * 10) / 10} days`;
}
const record = (r: { wins: number; losses: number; draws: number }) => `${r.wins}–${r.losses}${r.draws ? `–${r.draws}` : ''}`;

/** Draft cards shown before "Show all". */
const CARDS_SHOWN = 10;

export function StatsDashboard({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<StatsOverview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [allCards, setAllCards] = useState(false);

  const load = useCallback(() => {
    setProblem(null);
    fetchStats().then(setData).catch((err: Error) => setProblem(err.message));
  }, []);
  useEffect(load, [load]);

  if (!data) {
    return (
      <div className="screen">
        <h2>Stats</h2>
        <p className={problem ? 'account-problem' : 'small'}>{problem ?? 'Loading…'}</p>
        <div className="buttons"><button type="button" onClick={onBack}>Back</button></div>
      </div>
    );
  }

  const { players: p, matches: m, sides, ratings, notifications: n } = data;
  const sideGames = sides.challengerWins + sides.challengedWins + sides.draws;
  const cards = allCards ? data.draftCards : data.draftCards.slice(0, CARDS_SHOWN);

  return (
    <div className="screen stats-dashboard">
      <h2>Stats</h2>
      <p className="small">
        How the online game is going. Updated {when(data.generatedAt)}.{' '}
        <button type="button" className="quiet" onClick={load}>Refresh</button>
      </p>
      {problem ? <p className="account-problem">{problem}</p> : null}

      <div className="stat-tiles">
        <StatTile value={p.named} label="players with a name" />
        <StatTile value={p.seenWeek} label="seen this week" />
        <StatTile value={m.finishedWeek} label="matches finished this week" />
        <StatTile value={m.active} label="matches in progress" />
        <StatTile value={m.challenged} label="open challenges" />
        <StatTile value={data.problems.open} label="open problems" />
      </div>

      <h3>The last 30 days</h3>
      <DailyBars days={data.days} pick={(d) => d.finished} title="Matches finished" unit={['match finished', 'matches finished']} />
      <DailyBars days={data.days} pick={(d) => d.players} title="Players who made a move" unit={['player made a move', 'players made a move']} noTotal />
      <details className="stats-details">
        <summary>Show as a table</summary>
        <table className="rankings-table stats-table">
          <thead><tr><th>Day (UTC)</th><th>Started</th><th>Finished</th><th>Players</th></tr></thead>
          <tbody>
            {[...data.days].reverse().map((d) => (
              <tr key={d.day}><td>{shortDay(d.day)}</td><td>{d.started}</td><td>{d.finished}</td><td>{d.players}</td></tr>
            ))}
          </tbody>
        </table>
      </details>

      <h3>Players</h3>
      <table className="rankings-table stats-table">
        <tbody>
          <Row label="Signed in at least once" value={p.accounts} note={`${p.named} picked a name. ${plural(p.byRole.moderator, 'moderator')}, ${plural(p.byRole.admin, 'admin')}.`} />
          <Row label="New this week" value={p.newWeek} note={`${p.newMonth} in the last 30 days.`} />
          <Row label="Seen today" value={p.seenDay} note={`${p.seenWeek} this week, ${p.seenMonth} in the last 30 days.`} />
          <Row label="Started a match" value={p.playedOne} note={`${pct(p.playedOne, p.named)} of players with a name.`} />
          <Row label="Finished 5 or more matches" value={p.playedFive} note={`${pct(p.playedFive, p.playedOne)} of those who started one.`} />
          <Row label="Unlinked their account" value={p.unlinked} note="Deleted their Spellstick data." />
        </tbody>
      </table>

      <h3>Matches</h3>
      <table className="rankings-table stats-table">
        <tbody>
          <Row label="Finished" value={m.finished} note={`${m.finishedWeek} this week, ${m.finishedMonth} in the last 30 days.`} />
          <Row label="Played to the end" value={m.played} note={`${pct(m.played, m.finished)} of finished matches. ${plural(m.draws, 'draw')}.`} />
          <Row label="Ended by resigning" value={m.resigned} note={pct(m.resigned, m.finished)} />
          <Row label="Forfeited (never moved)" value={m.forfeit} note={pct(m.forfeit, m.finished)} />
          <Row label="Computer finished for someone" value={m.autopilot} note={`${pct(m.autopilot, m.finished)}: a player ran out of time.`} />
          <Row label="Challenges declined" value={m.declined} note={`${pct(m.declined, m.declined + m.started)} of challenges answered.`} />
          <Row label="Challenges unanswered for a week" value={m.oldChallenges} />
          <Row label="Average moves" value={m.averageMoves ?? '–'} note="Matches played to the end." />
          <Row label="Typical length, live" value={duration(m.medianMinutesLive)} note="Median, from accepting to the end." />
          <Row label="Typical length, at your own pace" value={duration(m.medianMinutesAsync)} />
        </tbody>
      </table>
      <p className="small">
        What players choose, of {plural(m.started, 'match', 'matches')} started: {pct(m.draft, m.started)} draft, {pct(m.constructed, m.started)} saved teams,{' '}
        {pct(m.ranked, m.started)} ranked, {pct(m.threeLanes, m.started)} three lanes, {pct(m.live, m.started)} live
        and {pct(m.async, m.started)} at their own pace.
      </p>

      <h3>Balance</h3>
      <p>
        {sideGames === 0 ? 'No finished matches yet.' : (
          <>
            Challengers won <strong>{pct(sides.challengerWins, sideGames)}</strong> of {plural(sideGames, 'finished match', 'finished matches')}
            {' '}({sides.challengerWins}), the player challenged won {pct(sides.challengedWins, sideGames)} ({sides.challengedWins})
            {sides.draws ? `, and ${plural(sides.draws, 'was a draw', 'were draws')}` : ''}.
          </>
        )}
      </p>
      <table className="rankings-table stats-table">
        <thead><tr><th>Team</th><th>Finished</th><th>Record</th><th>Won</th></tr></thead>
        <tbody>
          {data.teams.map((t) => (
            <tr key={t.id}><td>{t.name}</td><td>{t.played}</td><td>{record(t)}</td><td>{pct(t.wins, t.played)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="small">Records are wins–losses, then draws if there were any. Resigning and running out of time count as losses. Matches with saved teams aren't included.</p>

      <h3>Draft picks</h3>
      {data.drafts === 0 ? <p className="small">No drafts finished yet.</p> : (
        <>
          <p className="small">
            From {plural(data.drafts, 'draft')}. Picked is how often a player was taken when they were in the pool; the
            pick number is how early (1 is first). Record is how the side that took them did.
          </p>
          <table className="rankings-table stats-table">
            <thead><tr><th>Player</th><th>Picked</th><th>Pick no.</th><th>Record</th></tr></thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}{c.kind === 'goalie' ? <span className="small"> (goalie)</span> : null}</td>
                  <td>{pct(c.picked, c.offered)} <span className="small">({c.picked} of {c.offered})</span></td>
                  <td>{c.averagePick ?? '–'}</td>
                  <td>{c.wins + c.losses ? `${c.wins}–${c.losses}` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.draftCards.length > CARDS_SHOWN ? (
            <button type="button" className="quiet" onClick={() => setAllCards(!allCards)}>
              {allCards ? 'Show the top ten' : `Show all ${data.draftCards.length}`}
            </button>
          ) : null}
        </>
      )}

      <h3>Ratings</h3>
      <p>
        {ratings.rated === 0 ? 'Nobody has a rating yet.' : (
          <>
            {plural(ratings.rated, 'player has', 'players have')} a rating (average {ratings.average}).{' '}
            {ratings.placed === 0 ? 'Nobody has finished their placement matches yet.' : (
              `${ratings.placed} finished their placement matches: ${ratings.tiers.map((t) => `${t.players} ${t.name}`).join(', ')}.`
            )}
          </>
        )}
      </p>

      <h3>Most active players</h3>
      {data.topPlayers.length === 0 ? <p className="small">Nobody has finished a match in the last 30 days.</p> : (
        <table className="rankings-table stats-table">
          <thead><tr><th>Player</th><th>Last 30 days</th><th>All time</th><th>Wins</th><th>Last seen</th></tr></thead>
          <tbody>
            {data.topPlayers.map((t) => (
              <tr key={t.name}>
                <td>{t.name}</td><td>{t.finishedMonth}</td><td>{t.finished}</td><td>{t.wins}</td>
                <td>{new Date(t.lastSeen).toLocaleDateString(undefined, { dateStyle: 'medium' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Discord notifications</h3>
      <p>
        {plural(n.playersOptedIn, 'player has', 'players have')} at least one kind turned on. This week:{' '}
        {n.sentWeek} sent{n.failedWeek ? `, ${n.failedWeek} refused by Discord (usually DMs from friends only)` : ''}.
      </p>

      <div className="buttons"><button type="button" onClick={onBack}>Back</button></div>
    </div>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat-tile">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td><strong>{value}</strong></td>
      <td className="small">{note ?? ''}</td>
    </tr>
  );
}

/** One bar a day for the last 30 days. Hover or focus a day to read its number. */
function DailyBars({ days, pick, title, unit, noTotal }: {
  days: StatsOverview['days']; pick: (d: StatsOverview['days'][number]) => number; title: string; unit: [string, string];
  /** For counts that can't be added up across days (the same player plays on many days). */
  noTotal?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = days.map(pick);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const shown = hover === null ? null : days[hover]!;
  return (
    <figure className="daily-bars">
      <figcaption>
        <strong>{title}</strong>{' '}
        <span className="small">
          {shown ? `${shortDay(shown.day)}: ${values[hover!]} ${values[hover!] === 1 ? unit[0] : unit[1]}` : `${noTotal ? 'Busiest' : `${total} in all, busiest`} day ${Math.max(...values)}.`}
        </span>
      </figcaption>
      <div className="bars" onMouseLeave={() => setHover(null)} role="img" aria-label={`${title}, last 30 days${noTotal ? '' : `: ${total} in all`}. The table below has each day.`}>
        {days.map((d, i) => (
          <div
            key={d.day}
            className={hover === i ? 'bar-slot hover' : 'bar-slot'}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            tabIndex={0}
          >
            {values[i] ? <div className="bar" style={{ height: `${(100 * values[i]!) / max}%` }} /> : null}
          </div>
        ))}
      </div>
      <div className="bars-axis small">
        <span>{shortDay(days[0]!.day)}</span>
        <span>Today</span>
      </div>
    </figure>
  );
}
