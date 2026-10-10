// The rankings (online build only): the leaderboard, your rating, and how ratings work. Admins
// also get the tools to work ratings out again or start them over.

import { useCallback, useEffect, useState } from 'react';
import type { RatingsBoard } from '../shared/matchApi';
import { ordinal } from './labels';
import { fetchRatings, recalculateRatings, resetRatings } from './online';

const record = (r: { wins: number; losses: number; draws: number }) => `${r.wins}–${r.losses}${r.draws ? `–${r.draws}` : ''}`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

export function Rankings({ onBack, isAdmin }: { onBack: () => void; isAdmin: boolean }) {
  const [board, setBoard] = useState<RatingsBoard | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchRatings().then(setBoard).catch((err: Error) => setProblem(err.message));
  }, []);
  useEffect(load, [load]);

  const recalculate = async () => {
    try {
      const { matches } = await recalculateRatings();
      setAdminNote(`Worked out every rating again from ${matches} ranked match${matches === 1 ? '' : 'es'}.`);
      load();
    } catch (err) {
      setAdminNote((err as Error).message);
    }
  };

  const reset = async () => {
    if (!window.confirm('Start ratings over? Everyone becomes unrated, and only ranked matches from now on will count. This cannot be undone.')) return;
    try {
      await resetRatings();
      setAdminNote('Ratings started over.');
      load();
    } catch (err) {
      setAdminNote((err as Error).message);
    }
  };

  const you = board?.you;
  return (
    <div className="screen rankings">
      <h2>Rankings</h2>
      {problem ? <p className="account-problem">{problem}</p> : null}
      {!board && !problem ? <p className="small">Loading…</p> : null}

      {board ? (
        <>
          <p>
            {you
              ? you.tier
                ? <>You're <strong>{you.tier}</strong>, rated <strong>{you.rating}</strong>{you.rank ? <>, {ordinal(you.rank)} on the board</> : null}. Ranked record {record(you)}.</>
                : <>Your rating is <strong>{you.rating}</strong>. Finish {board.placementGames - you.games} more ranked match{board.placementGames - you.games === 1 ? '' : 'es'} to get your tier and a place on the board.</>
              : <>You haven't played a ranked match yet. Challenge someone to a ranked draft to get started.</>}
          </p>

          {board.players.length === 0 ? (
            <p className="small">Nobody has finished {board.placementGames} ranked matches yet.</p>
          ) : (
            <table className="rankings-table">
              <thead>
                <tr><th>#</th><th>Player</th><th>Tier</th><th>Rating</th><th>Record</th></tr>
              </thead>
              <tbody>
                {board.players.map((p) => (
                  <tr key={p.name} className={p.you ? 'you' : undefined}>
                    <td>{p.rank}</td>
                    <td>{p.name}</td>
                    <td>{p.tier}</td>
                    <td>{p.rating}</td>
                    <td>{record(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>How ratings work</h3>
          <ul>
            <li>Only ranked matches count. Ranked matches are always drafts, so both players pick from the same cards.</li>
            <li>Everyone starts at 1200. Win and you take points from the other player; lose and they take points from you.</li>
            <li>Beating a stronger player gains a lot. Beating a much weaker one gains very little. A draw moves you both a little toward each other.</li>
            <li>Your first 20 ranked matches move your rating faster, so you find your level quickly.</li>
            <li>Resigning, or running out of time, counts as a loss.</li>
            <li>Records are wins–losses, then draws if there were any.</li>
            <li>
              After {board.placementGames} ranked matches you get a tier:{' '}
              {board.tiers.map((t, i) => `${t.name} (${t.from === 0 ? `under ${board.tiers[i - 1]!.from}` : `${t.from}+`})`).join(', ')}.
            </li>
          </ul>
          {board.since ? <p className="small">Ratings started over on {day(board.since)}.</p> : null}

          {isAdmin ? (
            <div className="account">
              <strong>Admin</strong>
              <p className="small">
                Work every rating out again from the ranked matches (after changing the rating numbers), or start ratings
                over (for example after the beta). Starting over can't be undone.
              </p>
              <div className="buttons">
                <button type="button" onClick={recalculate}>Recalculate ratings</button>
                <button type="button" onClick={reset}>Start ratings over</button>
              </div>
              {adminNote ? <p className="small">{adminNote}</p> : null}
            </div>
          ) : null}
        </>
      ) : null}

      <div className="buttons"><button type="button" onClick={onBack}>Back</button></div>
    </div>
  );
}
