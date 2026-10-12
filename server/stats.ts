// The stats dashboard (moderators and admins): how the online game is going. Players, matches,
// activity over the last 30 days, team and side records, draft picks, ratings, and notifications.
//
// Everything is worked out from the database each time the page is opened, so there is nothing to
// keep up to date. Draft picks need each draft's pool, which is rebuilt from the saved setup with
// createGame (a few milliseconds a match; no moves are replayed).

import type pg from 'pg';
import { createGame, type Action, type CardDef, type GameSetup, type Side } from '../src/engine';
import { prototypeCards } from '../src/data/prototype';
import type { StatsOverview } from '../src/shared/statsApi';
import { savedSetup } from './matches';
import { PLACEMENT_GAMES, tierFor, TIERS } from './ratings';

export type { StatsOverview };

/** Players listed under "Most active". */
const TOP_PLAYERS = 10;

/** Rounds to one decimal place, or null. */
const oneDecimal = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

export async function statsOverview(db: pg.Pool): Promise<StatsOverview> {
  const [players, matches, days, sides, teams, draftCards, ratings, topPlayers, notifications, problems] = await Promise.all([
    playerCounts(db), matchCounts(db), lastThirtyDays(db), sideRecord(db), teamRecords(db), draftPicks(db),
    ratingSpread(db), mostActive(db), notificationCounts(db), problemCounts(db),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    players, matches, days, sides, teams, ...draftCards, ratings, topPlayers, notifications, problems,
  };
}

async function playerCounts(db: pg.Pool): Promise<StatsOverview['players']> {
  const r = (await db.query<Record<string, number>>(
    `select
       count(*)::int as accounts,
       count(*) filter (where display_name is not null)::int as named,
       count(*) filter (where role = 'player')::int as players,
       count(*) filter (where role = 'moderator')::int as moderators,
       count(*) filter (where role = 'admin')::int as admins,
       count(*) filter (where last_seen_at > now() - interval '1 day')::int as seen_day,
       count(*) filter (where last_seen_at > now() - interval '7 days')::int as seen_week,
       count(*) filter (where last_seen_at > now() - interval '30 days')::int as seen_month,
       count(*) filter (where created_at > now() - interval '7 days')::int as new_week,
       count(*) filter (where created_at > now() - interval '30 days')::int as new_month,
       (select count(distinct p)::int from (
          select player_a as p from matches where status in ('active', 'finished')
          union all select player_b from matches where status in ('active', 'finished')) x) as played_one,
       (select count(*)::int from (
          select p from (
            select player_a as p from matches where status = 'finished'
            union all select player_b from matches where status = 'finished') x
          group by p having count(*) >= 5) y) as played_five,
       (select count(*)::int from account_events where event = 'account unlinked') as unlinked
     from users where unlinked_at is null`,
  )).rows[0]!;
  return {
    accounts: r.accounts!, named: r.named!,
    byRole: { player: r.players!, moderator: r.moderators!, admin: r.admins! },
    seenDay: r.seen_day!, seenWeek: r.seen_week!, seenMonth: r.seen_month!,
    newWeek: r.new_week!, newMonth: r.new_month!,
    playedOne: r.played_one!, playedFive: r.played_five!, unlinked: r.unlinked!,
  };
}

async function matchCounts(db: pg.Pool): Promise<StatsOverview['matches']> {
  const started = `status in ('active', 'finished')`;
  const r = (await db.query<Record<string, number | null>>(
    `select
       count(*) filter (where status = 'challenged')::int as challenged,
       count(*) filter (where status = 'active')::int as active,
       count(*) filter (where status = 'finished')::int as finished,
       count(*) filter (where status = 'declined')::int as declined,
       count(*) filter (where status = 'finished' and finished_at > now() - interval '7 days')::int as finished_week,
       count(*) filter (where status = 'finished' and finished_at > now() - interval '30 days')::int as finished_month,
       count(*) filter (where status = 'finished' and end_reason = 'played')::int as played,
       count(*) filter (where status = 'finished' and end_reason = 'resigned')::int as resigned,
       count(*) filter (where status = 'finished' and end_reason = 'forfeit')::int as forfeit,
       count(*) filter (where status = 'finished' and end_reason = 'played' and winner is null)::int as draws,
       count(*) filter (where status = 'finished' and (autopilot_a or autopilot_b))::int as autopilot,
       count(*) filter (where ${started})::int as started,
       count(*) filter (where ${started} and ranked)::int as ranked,
       count(*) filter (where ${started} and coalesce((setup->'config'->>'draftPicks')::int, 0) > 0)::int as draft,
       count(*) filter (where ${started} and (setup->'config'->>'lanes')::int = 3)::int as three_lanes,
       count(*) filter (where ${started} and pace = 'live')::int as live,
       count(*) filter (where ${started} and pace = 'async')::int as async,
       avg(move_count) filter (where status = 'finished' and end_reason = 'played')::float as average_moves,
       (percentile_cont(0.5) within group (order by extract(epoch from finished_at - started_at) / 60)
          filter (where status = 'finished' and end_reason = 'played' and pace = 'live'))::float as median_live,
       (percentile_cont(0.5) within group (order by extract(epoch from finished_at - started_at) / 60)
          filter (where status = 'finished' and end_reason = 'played' and pace = 'async'))::float as median_async,
       count(*) filter (where status = 'challenged' and created_at < now() - interval '7 days')::int as old_challenges
     from matches`,
  )).rows[0]!;
  const n = (key: string) => r[key] as number;
  return {
    challenged: n('challenged'), active: n('active'), finished: n('finished'), declined: n('declined'),
    finishedWeek: n('finished_week'), finishedMonth: n('finished_month'),
    played: n('played'), resigned: n('resigned'), forfeit: n('forfeit'), draws: n('draws'), autopilot: n('autopilot'),
    started: n('started'), ranked: n('ranked'), draft: n('draft'), threeLanes: n('three_lanes'), live: n('live'), async: n('async'),
    averageMoves: oneDecimal(r.average_moves ?? null),
    medianMinutesLive: oneDecimal(r.median_live ?? null),
    medianMinutesAsync: oneDecimal(r.median_async ?? null),
    oldChallenges: n('old_challenges'),
  };
}

/**
 * Matches started and finished each day, and players who made a move themselves (not the computer).
 * Declined challenges have a finished_at too, so finished counts only status 'finished'.
 */
async function lastThirtyDays(db: pg.Pool): Promise<StatsOverview['days']> {
  const { rows } = await db.query<{ day: string; started: number; finished: number; players: number }>(
    `with days as (
       select d from generate_series(date_trunc('day', now(), 'UTC') - interval '29 days', date_trunc('day', now(), 'UTC'), interval '1 day') d
     )
     select to_char(d at time zone 'UTC', 'YYYY-MM-DD') as day,
       (select count(*)::int from matches where started_at >= d and started_at < d + interval '1 day') as started,
       (select count(*)::int from matches where status = 'finished' and finished_at >= d and finished_at < d + interval '1 day') as finished,
       (select count(distinct player_id)::int from match_events where at >= d and at < d + interval '1 day' and not by_computer) as players
     from days order by d`,
  );
  return rows;
}

async function sideRecord(db: pg.Pool): Promise<StatsOverview['sides']> {
  const r = (await db.query<Record<string, number>>(
    `select
       count(*) filter (where winner = player_a)::int as a,
       count(*) filter (where winner = player_b)::int as b,
       count(*) filter (where winner is null)::int as draws
     from matches where status = 'finished'`,
  )).rows[0]!;
  return { challengerWins: r.a!, challengedWins: r.b!, draws: r.draws! };
}

async function teamRecords(db: pg.Pool): Promise<StatsOverview['teams']> {
  const { rows } = await db.query<{ team: string | null; played: number; wins: number; losses: number; draws: number }>(
    `select t.team, count(*)::int as played,
       count(*) filter (where m.winner = t.player)::int as wins,
       count(*) filter (where m.winner is not null and m.winner <> t.player)::int as losses,
       count(*) filter (where m.winner is null)::int as draws
     from matches m
     cross join lateral (values (m.setup->'teams'->>'A', m.player_a), (m.setup->'teams'->>'B', m.player_b)) t(team, player)
     where m.status = 'finished'
     group by t.team order by t.team`,
  );
  // Matches from before team picks played A against B (GameSetup.teams defaults).
  const byId = new Map<string, Omit<StatsOverview['teams'][number], 'id' | 'name'>>();
  for (const r of rows) {
    const id = r.team ?? 'A';
    const seen = byId.get(id) ?? { played: 0, wins: 0, losses: 0, draws: 0 };
    byId.set(id, { played: seen.played + r.played, wins: seen.wins + r.wins, losses: seen.losses + r.losses, draws: seen.draws + r.draws });
  }
  return prototypeCards.teams.map((t) => ({ id: t.id, name: t.name, ...(byId.get(t.id) ?? { played: 0, wins: 0, losses: 0, draws: 0 }) }));
}

/** How often each card in a draft pool was picked, how early, and how the side that picked it did. */
async function draftPicks(db: pg.Pool): Promise<{ draftCards: StatsOverview['draftCards']; drafts: number }> {
  const matches = await db.query<{ id: string; setup: GameSetup; status: string; winner: string | null; player_a: string }>(
    `select id, setup, status, winner, player_a from matches
     where status in ('active', 'finished') and coalesce((setup->'config'->>'draftPicks')::int, 0) > 0`,
  );
  const picks = await db.query<{ match_id: string; move: Action }>(
    `select e.match_id, e.move from match_events e
     join matches m on m.id = e.match_id
     where m.status in ('active', 'finished') and e.move->>'type' = 'draftPick'
     order by e.match_id, e.seq`,
  );
  const picksByMatch = new Map<string, Action[]>();
  for (const p of picks.rows) picksByMatch.set(p.match_id, [...(picksByMatch.get(p.match_id) ?? []), p.move]);

  type Tally = { def: CardDef; offered: number; picked: number; pickPlaces: number; wins: number; losses: number };
  const tally = new Map<string, Tally>();
  let drafts = 0;
  for (const m of matches.rows) {
    const setup = savedSetup(m.setup);
    const moves = picksByMatch.get(m.id) ?? [];
    // Only drafts that are over, so a card still in the pool isn't counted as passed over.
    if (moves.length < 2 * (setup.config?.draftPicks ?? 0)) continue;
    let state;
    try {
      state = createGame(setup).state;
    } catch {
      continue; // A setup that no longer builds shows up on the beta dashboard's replay check.
    }
    drafts += 1;
    const winnerSide: Side | null = m.status !== 'finished' || m.winner === null ? null : m.winner === m.player_a ? 'A' : 'B';
    const entry = (uid: string): Tally | null => {
      const def = state.cards[uid];
      if (!def) return null;
      const t = tally.get(def.id) ?? { def, offered: 0, picked: 0, pickPlaces: 0, wins: 0, losses: 0 };
      tally.set(def.id, t);
      return t;
    };
    for (const uid of state.draft?.pool ?? []) {
      const t = entry(uid);
      if (t) t.offered += 1;
    }
    moves.forEach((move, i) => {
      if (move.type !== 'draftPick') return;
      const t = entry(move.card);
      if (!t) return;
      t.picked += 1;
      t.pickPlaces += i + 1;
      if (winnerSide === move.side) t.wins += 1;
      else if (winnerSide !== null) t.losses += 1;
    });
  }

  const draftCards = [...tally.values()]
    .filter((t) => t.def.kind !== 'spell')
    .map((t) => ({
      id: t.def.id, name: t.def.name, kind: t.def.kind as 'field' | 'goalie',
      offered: t.offered, picked: t.picked,
      averagePick: t.picked ? oneDecimal(t.pickPlaces / t.picked) : null,
      wins: t.wins, losses: t.losses,
    }))
    .sort((a, b) => b.picked / Math.max(1, b.offered) - a.picked / Math.max(1, a.offered) || (a.averagePick ?? 99) - (b.averagePick ?? 99) || a.name.localeCompare(b.name));
  return { draftCards, drafts };
}

async function ratingSpread(db: pg.Pool): Promise<StatsOverview['ratings']> {
  const { rows } = await db.query<{ rating: number; games: number }>('select rating, games from ratings');
  const placed = rows.filter((r) => r.games >= PLACEMENT_GAMES);
  const tiers = TIERS.map((t) => ({ name: t.name, players: placed.filter((r) => tierFor(r.rating, r.games) === t.name).length }));
  return {
    rated: rows.length,
    placed: placed.length,
    average: rows.length ? Math.round(rows.reduce((sum, r) => sum + r.rating, 0) / rows.length) : null,
    tiers,
  };
}

async function mostActive(db: pg.Pool): Promise<StatsOverview['topPlayers']> {
  const { rows } = await db.query<{ name: string; finished_month: number; finished: number; wins: number; last_seen_at: Date }>(
    `select u.display_name as name,
       count(*) filter (where m.finished_at > now() - interval '30 days')::int as finished_month,
       count(*)::int as finished,
       count(*) filter (where m.winner = u.id)::int as wins,
       u.last_seen_at
     from users u
     join matches m on m.status = 'finished' and (m.player_a = u.id or m.player_b = u.id)
     where u.display_name is not null
     group by u.id
     having count(*) filter (where m.finished_at > now() - interval '30 days') > 0
     order by finished_month desc, finished desc, lower(u.display_name)
     limit $1`,
    [TOP_PLAYERS],
  );
  return rows.map((r) => ({ name: r.name, finishedMonth: r.finished_month, finished: r.finished, wins: r.wins, lastSeen: r.last_seen_at.toISOString() }));
}

async function notificationCounts(db: pg.Pool): Promise<StatsOverview['notifications']> {
  const r = (await db.query<Record<string, number>>(
    `select
       (select count(distinct user_id)::int from notification_settings where enabled) as opted_in,
       count(*) filter (where ok)::int as sent,
       count(*) filter (where not ok)::int as failed
     from notifications_sent where sent_at > now() - interval '7 days'`,
  )).rows[0]!;
  return { playersOptedIn: r.opted_in!, sentWeek: r.sent!, failedWeek: r.failed! };
}

async function problemCounts(db: pg.Pool): Promise<StatsOverview['problems']> {
  const r = (await db.query<Record<string, number>>(
    `select count(*) filter (where resolved_at is null)::int as open, count(*)::int as total from match_problems`,
  )).rows[0]!;
  return { open: r.open!, total: r.total! };
}
