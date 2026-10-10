// Beta readiness: spotting disagreements between the browser and the server, and the numbers
// moderators need to judge the phase 1 gate ("a 20-reader beta finishes 100 matches with no
// state disagreements between client and server").
//
// Two sources of problems:
// - the browser reports one: the server refused a move it had offered, or events went missing;
// - the server finds one: a match no longer replays to the state the database says it's in (for
//   example, a rules change that breaks matches already under way).

import type pg from 'pg';
import type { Action, GameSetup } from '../src/engine';
import { rebuild } from './matches';

/** Problems a player's browser may report. */
export const REPORTABLE = ['refused-move', 'missing-events'] as const;
export type ReportableProblem = (typeof REPORTABLE)[number];

/** The gate for phase 1: this many finished matches with no unresolved problems. */
export const BETA_TARGET_MATCHES = 100;
/** Most problem reports one player can send in a day (stops a broken page from flooding the list). */
const REPORTS_PER_DAY = 20;

/** Records a problem unless the same kind is already open for this match. */
async function record(db: pg.Pool, matchId: number, kind: string, detail: string, reportedBy: number | null): Promise<boolean> {
  const { rowCount } = await db.query(
    `insert into match_problems (match_id, kind, detail, reported_by)
     select $1, $2, $3, $4
     where not exists (select 1 from match_problems where match_id = $1 and kind = $2 and resolved_at is null)`,
    [matchId, kind, detail.slice(0, 500), reportedBy],
  );
  return (rowCount ?? 0) > 0;
}

/** A player's browser reports a problem in one of their own matches. Returns false if refused. */
export async function reportProblem(db: pg.Pool, userId: number, matchId: number, kind: unknown, detail: unknown): Promise<boolean> {
  if (!REPORTABLE.includes(kind as ReportableProblem) || typeof detail !== 'string') return false;
  const { rows } = await db.query<{ mine: boolean; today: number }>(
    `select exists (select 1 from matches where id = $2 and (player_a = $1 or player_b = $1)) as mine,
       (select count(*)::int from match_problems where reported_by = $1 and created_at > now() - interval '1 day') as today`,
    [userId, Number.isSafeInteger(matchId) ? matchId : 0],
  );
  if (!rows[0]!.mine || rows[0]!.today >= REPORTS_PER_DAY) return false;
  await record(db, matchId, kind as string, detail, userId);
  return true;
}

/**
 * Replays every match from its saved setup and moves, and checks it agrees with what the
 * database says: same number of moves, the same player to move, the same result.
 * About 40 ms a match. Runs when the server starts and when a moderator asks.
 */
export async function checkAllMatches(db: pg.Pool): Promise<{ checked: number; newProblems: number }> {
  const { rows } = await db.query<{
    id: string; setup: GameSetup; status: string; player_a: string; player_b: string;
    waiting_on: string | null; move_count: number; winner: string | null; end_reason: string | null;
  }>(`select id, setup, status, player_a, player_b, waiting_on, move_count, winner, end_reason
      from matches where status in ('active', 'finished') order by id`);
  let newProblems = 0;
  for (const m of rows) {
    const id = Number(m.id);
    const moves = (await db.query<{ move: Action }>('select move from match_events where match_id = $1 order by seq', [id])).rows.map((r) => r.move);
    const found = (kind: string, detail: string) => record(db, id, kind, detail, null).then((added) => { if (added) newProblems += 1; });
    if (moves.length !== m.move_count) {
      await found('count-mismatch', `The match says ${m.move_count} moves were made, but ${moves.length} are saved.`);
      continue;
    }
    let state;
    try {
      state = rebuild(m.setup, moves).state;
    } catch (err) {
      await found('replay-failed', `Replaying the saved moves failed: ${(err as Error).message}`);
      continue;
    }
    const playerOn = (side: 'A' | 'B') => (side === 'A' ? m.player_a : m.player_b);
    if (m.status === 'active') {
      const p = state.pending;
      if (p.kind === 'gameOver') await found('result-mismatch', 'The replayed game is over, but the match is still in progress.');
      else if (m.waiting_on !== null && playerOn(p.side) !== m.waiting_on) {
        await found('waiting-mismatch', `The replayed game is waiting on side ${p.side}, but the match is waiting on the other player.`);
      }
    } else if (m.end_reason === 'played') {
      const winner = state.result ? (state.result.winner ? playerOn(state.result.winner) : null) : undefined;
      if (winner === undefined) await found('result-mismatch', 'The match is marked finished, but the replayed game is not over.');
      else if (winner !== m.winner) await found('result-mismatch', 'The replayed game has a different winner from the one saved.');
    }
  }
  return { checked: rows.length, newProblems };
}

export interface BetaOverview {
  target: number;
  matches: { finishedPlayed: number; finishedOther: number; active: number; challenged: number; withProblems: number };
  players: { signedUp: number; played: number };
  problems: {
    id: number; matchId: number; kind: string; detail: string; reportedBy: string; createdAt: string; resolved: boolean;
  }[];
  recent: {
    id: number; players: [string, string]; status: string; endReason: string | null; moves: number;
    pace: string | null; draft: boolean; updatedAt: string;
  }[];
}

/** What the moderator dashboard shows. */
export async function betaOverview(db: pg.Pool): Promise<BetaOverview> {
  const counts = (await db.query<Record<string, number>>(
    `select
       count(*) filter (where status = 'finished' and end_reason = 'played')::int as finished_played,
       count(*) filter (where status = 'finished' and end_reason <> 'played')::int as finished_other,
       count(*) filter (where status = 'active')::int as active,
       count(*) filter (where status = 'challenged')::int as challenged,
       (select count(distinct match_id)::int from match_problems where resolved_at is null) as with_problems,
       (select count(*)::int from users where display_name is not null) as signed_up,
       (select count(distinct p)::int from (select player_a as p from matches where status in ('active', 'finished')
          union select player_b from matches where status in ('active', 'finished')) x) as played
     from matches`,
  )).rows[0]!;
  const problems = await db.query<{
    id: string; match_id: string; kind: string; detail: string; reporter: string | null; created_at: Date; resolved_at: Date | null;
  }>(
    `select p.id, p.match_id, p.kind, p.detail, u.display_name as reporter, p.created_at, p.resolved_at
     from match_problems p left join users u on u.id = p.reported_by
     order by (p.resolved_at is null) desc, p.created_at desc limit 50`,
  );
  const recent = await db.query<{
    id: string; a: string | null; b: string | null; status: string; end_reason: string | null; move_count: number;
    pace: string | null; draft_picks: string | null; waiting_since: Date;
  }>(
    `select m.id, ua.display_name as a, ub.display_name as b, m.status, m.end_reason, m.move_count, m.pace,
       m.setup->'config'->>'draftPicks' as draft_picks, m.waiting_since
     from matches m join users ua on ua.id = m.player_a join users ub on ub.id = m.player_b
     order by m.waiting_since desc limit 20`,
  );
  return {
    target: BETA_TARGET_MATCHES,
    matches: {
      finishedPlayed: counts.finished_played!, finishedOther: counts.finished_other!, active: counts.active!,
      challenged: counts.challenged!, withProblems: counts.with_problems!,
    },
    players: { signedUp: counts.signed_up!, played: counts.played! },
    problems: problems.rows.map((p) => ({
      id: Number(p.id), matchId: Number(p.match_id), kind: p.kind, detail: p.detail,
      // Problems the browser reports have a reporter (unless they have since unlinked); the rest the server found.
      reportedBy: p.reporter ?? (REPORTABLE.includes(p.kind as ReportableProblem) ? 'a player' : 'the server'),
      createdAt: p.created_at.toISOString(), resolved: p.resolved_at !== null,
    })),
    recent: recent.rows.map((m) => ({
      id: Number(m.id), players: [m.a ?? 'Deleted player', m.b ?? 'Deleted player'], status: m.status, endReason: m.end_reason,
      moves: m.move_count, pace: m.pace, draft: Number(m.draft_picks ?? 0) > 0, updatedAt: m.waiting_since.toISOString(),
    })),
  };
}

export async function resolveProblem(db: pg.Pool, problemId: number): Promise<void> {
  await db.query('update match_problems set resolved_at = now() where id = $1 and resolved_at is null', [problemId]);
}
