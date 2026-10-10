// Time banks (docs/spellstick-multiplayer-design.md, "Time banks"), against a real (test)
// database. Time "passes" by moving a match's clock times back in the database.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { heuristicAgent } from '../../src/ai/heuristic';
import type { MatchDetail, MatchSummary } from '../../src/shared/matchApi';
import { buildApp } from '../../server/app';
import { settleOverdue, TIME_BANKS } from '../../server/matches';
import { PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase } from './helpers';

const haveDb = await databaseAvailable();
const HOUR = 60 * 60_000;

describe.skipIf(!haveDb)('time banks', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const discord = fakeDiscord({ alice: person('111', 'alice', [PLAYERS_ROLE]), bob: person('222', 'bob', [PLAYERS_ROLE]) });

  const api = (who: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, cookies: { spellstick_session: cookies[who]! }, ...(payload ? { payload } : {}) });
  const getMatch = async (who: string, id: number) => (await api(who, 'GET', `/api/matches/${id}`)).json<MatchDetail>();
  /** Alice challenges Bob and he accepts. Alice (side A) chooses a goalie first. */
  const newMatch = async (pace?: string): Promise<number> => {
    const res = await api('alice', 'POST', '/api/matches', { opponentId: ids.bob, lanes: 2, team: 'A', ...(pace ? { pace } : {}) });
    const id = res.json<MatchSummary>().id;
    await api('bob', 'POST', `/api/matches/${id}/accept`);
    return id;
  };
  /**
   * Makes the next move for whoever's decision it is, the way the computer would. Pass the
   * player's latest view (a move's answer includes it) to skip fetching it again.
   */
  const playOne = async (who: string, id: number, latest?: MatchDetail) => {
    const d = latest ?? (await getMatch(who, id));
    const action = heuristicAgent(d.match.moveCount + 1, d.game!.view.config).chooseAction(d.game!.view, d.game!.legal);
    const res = await api(who, 'POST', `/api/matches/${id}/moves`, { action, seen: d.match.moveCount });
    expect(res.statusCode).toBe(200);
    return res.json<MatchDetail>();
  };
  /**
   * Makes a match short and the same every run, for tests that play a whole game: first to one
   * goal, with a fixed seed instead of a random one. Every move replays the game so far on the
   * server, so a long game takes seconds, and with a random seed some games ran past the test's
   * time limit. Seed 9 gives a game of about 50 moves.
   */
  const shortGame = (id: number) =>
    db.query(
      `update matches set setup = jsonb_set(jsonb_set(setup::jsonb, '{config,goalsToWin}', '1'), '{seed}', '9')::json where id = $1`,
      [id],
    );
  /** Pretends ms milliseconds have passed in this match. */
  const passTime = (id: number, ms: number) =>
    db.query(
      `update matches set waiting_since = waiting_since - make_interval(secs => $2 / 1000.0),
         waiting_due = waiting_due - make_interval(secs => $2 / 1000.0) where id = $1`,
      [id, ms],
    );
  /** Within a couple of seconds (requests take a moment). */
  const about = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(2000);

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    app = await buildApp({ config: testConfig(), db, discord });
    for (const [who, name] of [['alice', 'Alice Hexes'], ['bob', 'Bob Wands']] as const) {
      cookies[who] = (await signIn(app, who)).cookie!;
      await api(who, 'POST', '/api/me/name', { name });
      ids[who] = Number((await db.query('select id from users where discord_username = $1', [who])).rows[0].id);
    }
  });

  afterAll(async () => {
    await app.close();
    await drop();
  });

  it('gives each player 36 hours, or 25 minutes for a live match', async () => {
    const async = await getMatch('alice', await newMatch());
    expect(async.match.pace).toBe('async');
    expect(async.match.clock!.running).toBe('you');
    about(async.match.clock!.you, 36 * HOUR);
    about(async.match.clock!.them, 36 * HOUR);
    const live = await getMatch('bob', await newMatch('live'));
    expect(live.match.clock!.running).toBe('them');
    about(live.match.clock!.them, TIME_BANKS.live);
    expect((await api('alice', 'POST', '/api/matches', { opponentId: ids.bob, lanes: 2, team: 'A', pace: 'blitz' })).statusCode).toBe(400);
  });

  it("only uses up a bank while the match is waiting on that player", async () => {
    const id = await newMatch();
    await passTime(id, 1 * HOUR);
    await playOne('alice', id); // Alice took an hour to choose her goalie
    let bob = await getMatch('bob', id);
    expect(bob.match.clock!.running).toBe('you');
    about(bob.match.clock!.them, 35 * HOUR);
    about(bob.match.clock!.you, 36 * HOUR);

    await passTime(id, 2 * HOUR); // Bob thinks for two hours
    bob = await getMatch('bob', id);
    about(bob.match.clock!.you, 34 * HOUR);
    about(bob.match.clock!.them, 35 * HOUR); // Alice's bank stood still
  });

  it('a player who never moves forfeits when their bank runs out', async () => {
    const id = await newMatch();
    await passTime(id, 36 * HOUR + 1000);
    const bob = await getMatch('bob', id); // any request settles the clocks
    expect(bob.match.status).toBe('finished');
    expect(bob.match.result).toEqual({ outcome: 'won', reason: 'forfeit' });
    expect((await getMatch('alice', id)).match.result).toEqual({ outcome: 'lost', reason: 'forfeit' });
    expect(bob.game!.legal).toEqual([]);
  });

  it('after a player has moved, running out hands their decisions to the computer', async () => {
    const id = await newMatch();
    await shortGame(id);
    await playOne('alice', id); // Alice's goalie
    await playOne('bob', id); // Bob's goalie
    // Alice is placing her lineup, and her time runs out.
    await passTime(id, 36 * HOUR + 1000);
    expect(await settleOverdue(db)).toEqual([
      { playerIds: [ids.alice, ids.bob], change: expect.objectContaining({ matchId: id, status: 'active' }) },
    ]);

    // The computer placed Alice's lineup; now Bob places his.
    const bob = await getMatch('bob', id);
    expect(bob.match.autopilot).toEqual({ you: false, them: true });
    expect(bob.match.yourMove).toBe(true);
    expect(bob.match.clock!.them).toBe(0);
    expect(bob.game!.view.pending.kind).toBe('placeLineup');
    const byComputer = await db.query('select player_id from match_events where match_id = $1 and by_computer', [id]);
    expect(byComputer.rows.length).toBeGreaterThan(0);
    expect(byComputer.rows.every((r) => Number(r.player_id) === ids.alice)).toBe(true);

    // Alice can't take over again.
    const alice = await getMatch('alice', id);
    expect(alice.match.autopilot.you).toBe(true);
    expect(alice.game!.legal).toEqual([]);

    // Bob plays on; the computer answers for Alice at once, every time, until the game ends normally.
    let latest = bob;
    for (let guard = 0; guard < 1000 && latest.match.status === 'active'; guard++) {
      expect(latest.match.yourMove).toBe(true);
      latest = await playOne('bob', id, latest);
    }
    expect(latest.match.status).toBe('finished');
    expect(latest.match.result!.reason).toBe('played');
  });

  it("refuses a move sent after the player's time ran out", async () => {
    const id = await newMatch();
    await playOne('alice', id);
    await playOne('bob', id);
    const stale = await getMatch('alice', id);
    await passTime(id, 36 * HOUR + 1000);
    const res = await api('alice', 'POST', `/api/matches/${id}/moves`, { action: stale.game!.legal[0], seen: stale.match.moveCount });
    expect(res.statusCode).toBe(409);
  });

  it('if both players run out, the computer finishes the game', async () => {
    const id = await newMatch();
    await shortGame(id);
    await playOne('alice', id);
    await playOne('bob', id);
    await passTime(id, 36 * HOUR + 1000);
    await settleOverdue(db); // Alice runs out; it's Bob's decision
    await passTime(id, 36 * HOUR + 1000);
    await settleOverdue(db); // Bob runs out too
    const done = await getMatch('alice', id);
    expect(done.match.status).toBe('finished');
    expect(done.match.result!.reason).toBe('played');
    expect(done.match.autopilot).toEqual({ you: true, them: true });
  });

  it('matches from before time banks have no clock and never run out', async () => {
    const id = await newMatch();
    await db.query('update matches set pace = null, bank_a_ms = null, bank_b_ms = null, waiting_due = null where id = $1', [id]);
    await passTime(id, 1000 * HOUR);
    const alice = await getMatch('alice', id);
    expect(alice.match.clock).toBeNull();
    expect(alice.match.status).toBe('active');
    await playOne('alice', id);
    expect((await getMatch('bob', id)).match.clock).toBeNull();
  });
});
