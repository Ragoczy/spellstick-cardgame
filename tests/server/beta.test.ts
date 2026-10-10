// Beta readiness, against a real (test) database: problem reports from browsers, the server's
// replay check of every match, and the moderator dashboard.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { MatchDetail, MatchSummary } from '../../src/shared/matchApi';
import { buildApp } from '../../server/app';
import { checkAllMatches } from '../../server/beta';
import { settleOverdue } from '../../server/matches';
import { MODS_ROLE, PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase } from './helpers';

const haveDb = await databaseAvailable();

describe.skipIf(!haveDb)('beta readiness', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const discord = fakeDiscord({
    alice: person('111', 'alice', [PLAYERS_ROLE]),
    bob: person('222', 'bob', [PLAYERS_ROLE]),
    dave: person('444', 'dave', [PLAYERS_ROLE]),
    mod: person('555', 'mod', [MODS_ROLE]),
  });

  const api = (who: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, cookies: { spellstick_session: cookies[who]! }, ...(payload ? { payload } : {}) });
  const newMatch = async (): Promise<number> => {
    const id = (await api('alice', 'POST', '/api/matches', { opponentId: ids.bob, lanes: 2, team: 'A' })).json<MatchSummary>().id;
    await api('bob', 'POST', `/api/matches/${id}/accept`);
    return id;
  };
  const playFirst = async (who: string, id: number) => {
    const d = (await api(who, 'GET', `/api/matches/${id}`)).json<MatchDetail>();
    await api(who, 'POST', `/api/matches/${id}/moves`, { action: d.game!.legal[0], seen: d.match.moveCount });
  };
  /** Both players make a move, then both run out of time: the computer plays the game to the end. */
  const finishedMatch = async (): Promise<number> => {
    const id = await newMatch();
    await playFirst('alice', id);
    await playFirst('bob', id);
    for (let i = 0; i < 2; i++) {
      await db.query(`update matches set waiting_since = waiting_since - interval '37 hours', waiting_due = waiting_due - interval '37 hours' where id = $1`, [id]);
      await settleOverdue(db);
    }
    return id;
  };

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    app = await buildApp({ config: testConfig(), db, discord });
    for (const [who, name] of [['alice', 'Alice Hexes'], ['bob', 'Bob Wands'], ['dave', 'Dave'], ['mod', 'The Mod']] as const) {
      cookies[who] = (await signIn(app, who)).cookie!;
      await api(who, 'POST', '/api/me/name', { name });
      ids[who] = Number((await db.query('select id from users where discord_username = $1', [who])).rows[0].id);
    }
  });

  afterAll(async () => {
    await app.close();
    await drop();
  });

  it("players can report problems in their own matches only, once per kind until it's dealt with", async () => {
    const id = await newMatch();
    const report = (who: string, kind: string) => api(who, 'POST', `/api/matches/${id}/problems`, { kind, detail: 'The server refused a pass it had offered.' });
    expect((await report('alice', 'refused-move')).statusCode).toBe(204);
    expect((await report('alice', 'refused-move')).statusCode).toBe(204);
    expect((await report('dave', 'refused-move')).statusCode).toBe(400); // not his match
    expect((await report('alice', 'result-mismatch')).statusCode).toBe(400); // only the server finds those
    const { rows } = await db.query('select kind, reported_by from match_problems where match_id = $1', [id]);
    expect(rows).toEqual([{ kind: 'refused-move', reported_by: String(ids.alice) }]);
  });

  it('the replay check finds nothing wrong in good matches, and catches tampered ones', async () => {
    await db.query('delete from match_problems');
    const good = await finishedMatch();
    expect(await checkAllMatches(db)).toMatchObject({ newProblems: 0 });

    // A wrong winner, a lost move, and a move the rules don't allow.
    const wrongWinner = await finishedMatch();
    await db.query(`update matches set winner = case when winner = player_a then player_b else player_a end where id = $1`, [wrongWinner]);
    const lostMove = await newMatch();
    await playFirst('alice', lostMove);
    await db.query('delete from match_events where match_id = $1', [lostMove]);
    const badMove = await newMatch();
    await playFirst('alice', badMove);
    await db.query(`update match_events set move = '{"type":"shoot","side":"A"}' where match_id = $1`, [badMove]);

    const result = await checkAllMatches(db);
    expect(result.newProblems).toBe(3);
    const { rows } = await db.query('select match_id, kind from match_problems order by match_id');
    expect(rows.map((r) => [Number(r.match_id), r.kind])).toEqual([
      [wrongWinner, 'result-mismatch'], [lostMove, 'count-mismatch'], [badMove, 'replay-failed'],
    ]);
    expect(rows.some((r) => Number(r.match_id) === good)).toBe(false);
    // Running it again doesn't repeat open problems.
    expect((await checkAllMatches(db)).newProblems).toBe(0);
  });

  it('only moderators and admins see the dashboard', async () => {
    expect((await api('alice', 'GET', '/api/admin/beta')).statusCode).toBe(403);
    expect((await api('alice', 'POST', '/api/admin/beta/check')).statusCode).toBe(403);
    const res = await api('mod', 'GET', '/api/admin/beta');
    expect(res.statusCode).toBe(200);
    const overview = res.json();
    expect(overview.target).toBe(100);
    expect(overview.matches.finishedPlayed).toBeGreaterThanOrEqual(2);
    expect(overview.problems.filter((p: { resolved: boolean }) => !p.resolved).length).toBe(3);
    expect(overview.problems.find((p: { kind: string }) => p.kind === 'replay-failed').reportedBy).toBe('the server');

    // Marking one as dealt with.
    const first = overview.problems[0];
    const after = (await api('mod', 'POST', `/api/admin/problems/${first.id}/resolve`)).json();
    expect(after.problems.find((p: { id: number }) => p.id === first.id).resolved).toBe(true);
  });
});
