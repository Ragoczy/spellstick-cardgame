// The beta dashboard (moderators and admins, online build only): progress toward the phase 1
// gate ("100 finished matches with no disagreements between the browser and the server"), the
// problems found so far, and recent matches.

import { useCallback, useEffect, useState } from 'react';
import { checkAllMatches, fetchBetaOverview, resolveProblem, type BetaOverview } from './online';

const PROBLEM_NAMES: Record<string, string> = {
  'refused-move': 'Move refused',
  'missing-events': 'Missing events',
  'replay-failed': "Match won't replay",
  'result-mismatch': 'Result differs',
  'waiting-mismatch': 'Wrong player to move',
  'count-mismatch': 'Moves missing',
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function BetaDashboard({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<BetaOverview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchBetaOverview().then(setData).catch((err: Error) => setProblem(err.message));
  }, []);
  useEffect(load, [load]);

  const check = async () => {
    setChecking('Replaying every match…');
    try {
      const result = await checkAllMatches();
      setChecking(`Checked ${result.checked} matches: ${result.newProblems === 0 ? 'no new problems' : `${result.newProblems} new problem${result.newProblems === 1 ? '' : 's'}`}.`);
      load();
    } catch (err) {
      setChecking((err as Error).message);
    }
  };

  const resolve = async (id: number) => {
    try {
      setData(await resolveProblem(id));
    } catch (err) {
      setProblem((err as Error).message);
    }
  };

  if (!data) {
    return (
      <div className="screen">
        <h2>Beta dashboard</h2>
        <p className={problem ? 'account-problem' : 'small'}>{problem ?? 'Loading…'}</p>
        <div className="buttons"><button type="button" onClick={onBack}>Back</button></div>
      </div>
    );
  }

  const m = data.matches;
  const open = data.problems.filter((p) => !p.resolved);
  const done = m.finishedPlayed >= data.target && m.withProblems === 0;
  return (
    <div className="screen beta">
      <h2>Beta dashboard</h2>
      <p>
        The goal for this phase: {data.target} matches played to the end, with no disagreements between players'
        browsers and the server.
      </p>
      <div className="beta-progress" role="progressbar" aria-valuemin={0} aria-valuemax={data.target} aria-valuenow={m.finishedPlayed}>
        <div style={{ width: `${Math.min(100, (100 * m.finishedPlayed) / data.target)}%` }} />
      </div>
      <p>
        <strong>{m.finishedPlayed} of {data.target}</strong> played to the end{done ? ' — goal reached.' : '.'}{' '}
        Also: {m.finishedOther} ended by resigning or forfeit, {m.active} in progress, {m.challenged} open challenges.{' '}
        {data.players.played} of {data.players.signedUp} signed-up players have played.
      </p>

      <h3>Problems ({open.length} open)</h3>
      <p className="small">
        Players' browsers report anything that shouldn't happen, and the server replays every match after each deploy
        to check it still comes out the same.
      </p>
      <div className="buttons">
        <button type="button" onClick={check}>Check all matches now</button>
        {checking ? <span className="small">{checking}</span> : null}
      </div>
      {data.problems.length === 0 ? <p className="small">None so far.</p> : (
        <ul className="match-list">
          {data.problems.map((p) => (
            <li key={p.id} className={p.resolved ? 'match-row done' : 'match-row yours'}>
              <span>
                <strong>{PROBLEM_NAMES[p.kind] ?? p.kind}</strong> in match {p.matchId}, reported by {p.reportedBy}, {when(p.createdAt)}.
                <br /><span className="small">{p.detail}</span>
              </span>
              {p.resolved ? <span className="small">Dealt with</span> : (
                <span className="buttons"><button type="button" onClick={() => resolve(p.id)}>Mark as dealt with</button></span>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3>Recent matches</h3>
      <ul className="match-list">
        {data.recent.map((r) => (
          <li key={r.id} className="match-row done">
            <span>
              {r.id}. {r.players[0]} vs {r.players[1]}: {r.status}{r.endReason && r.endReason !== 'played' ? ` (${r.endReason})` : ''},
              {' '}{r.moves} moves{r.draft ? ', draft' : ''}{r.pace ? `, ${r.pace}` : ''}. {when(r.updatedAt)}
            </span>
          </li>
        ))}
      </ul>
      {problem ? <p className="account-problem">{problem}</p> : null}
      <div className="buttons"><button type="button" onClick={onBack}>Back</button></div>
    </div>
  );
}
