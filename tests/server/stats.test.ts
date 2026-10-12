// The stats dashboard, against a real (test) database: who can see it, and that its numbers add
// up for a few known matches.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { MatchDetail, MatchSummary } from '../../src/shared/matchApi';
import type { StatsOverview } from '../../src/shared/statsApi';
import { DRAFT_PICKS } from '../../src/engine';
import { buildApp } from '../../server/app';
import { settleOverdue } from '../../server/matches';
import { ADMINS_ROLE, MODS_ROLE, PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase } from './helpers';

const haveDb = await databaseAvailable();

describe.skipIf(!haveDb)('stats dashboard', () => {
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
    boss: person('666', 'boss', [ADMINS_ROLE]),
  });

  const api = (who: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, cookies: { spellstick_session: cookies[who]! }, ...(payload ? { payload } : {}) });
  const getMatch = async (who: string, id: number) => (await api(who, 'GET', `/api/matches/${id}`)).json<MatchDetail>();
  const challenge = async (players: 'dealt' | 'draft'): Promise<number> =>
    (await api('alice', 'POST', '/api/matches', { opponentId: ids.bob, lanes: 2, team: 'A', players })).json<MatchSummary>().id;
  /** Whoever the match is waiting on makes their first legal move. */
  const moveOnce = async (id: number) => {
    const a = await getMatch('alice', id);
    const who = a.match.yourMove ? 'alice' : 'bob';
    const d = who === 'alice' ? a : await getMatch('bob', id);
    await api(who, 'POST', `/api/matches/${id}/moves`, { action: d.game!.legal[0], seen: d.match.moveCount });
  };
  /** Both players run out of time: the computer plays the game to the end. */
  const runOutTheClock = async (id: number) => {
    for (let i = 0; i < 2; i++) {
      await db.query(`update matches set waiting_since = waiting_since - interval '37 hours', waiting_due = waiting_due - interval '37 hours' where id = $1`, [id]);
      await settleOverdue(db);
    }
  };

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    app = await buildApp({ config: testConfig(), db, discord });
    for (const [who, name] of [['alice', 'Alice Hexes'], ['bob', 'Bob Wands'], ['dave', 'Dave'], ['mod', 'The Mod'], ['boss', 'The Boss']] as const) {
      cookies[who] = (await signIn(app, who)).cookie!;
      await api(who, 'POST', '/api/me/name', { name });
      ids[who] = Number((await db.query('select id from users where discord_username = $1', [who])).rows[0].id);
    }

    // A dealt match, played a little, then finished by the computer.
    const dealt = await challenge('dealt');
    await api('bob', 'POST', `/api/matches/${dealt}/accept`);
    await moveOnce(dealt);
    await moveOnce(dealt);
    await runOutTheClock(dealt);

    // A draft, picked through by both players, then finished by the computer.
    const draft = await challenge('draft');
    await api('bob', 'POST', `/api/matches/${draft}/accept`);
    for (let pick = 0; pick < 2 * DRAFT_PICKS; pick++) await moveOnce(draft);
    await runOutTheClock(draft);

    // One declined challenge, and one still open.
    await api('bob', 'POST', `/api/matches/${await challenge('dealt')}/decline`);
    await challenge('dealt');
  }, 60_000); // the computer plays two whole games

  afterAll(async () => {
    await app.close();
    await drop();
  });

  it('only moderators and admins see it', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/admin/stats' })).statusCode).toBe(401);
    expect((await api('alice', 'GET', '/api/admin/stats')).statusCode).toBe(403);
    expect((await api('mod', 'GET', '/api/admin/stats')).statusCode).toBe(200);
    expect((await api('boss', 'GET', '/api/admin/stats')).statusCode).toBe(200);
  });

  it('counts players, matches, and the last 30 days', async () => {
    const stats = (await api('mod', 'GET', '/api/admin/stats')).json<StatsOverview>();
    expect(stats.players).toMatchObject({
      accounts: 5, named: 5, byRole: { player: 3, moderator: 1, admin: 1 }, seenDay: 5, newWeek: 5, playedOne: 2, playedFive: 0, unlinked: 0,
    });
    expect(stats.matches).toMatchObject({ finished: 2, active: 0, challenged: 1, declined: 1, started: 2, draft: 1, ranked: 0, finishedWeek: 2 });
    expect(stats.matches.played + stats.matches.resigned + stats.matches.forfeit).toBe(2);
    expect(stats.matches.autopilot).toBe(2);

    expect(stats.days).toHaveLength(30);
    const today = stats.days.at(-1)!;
    expect(today).toMatchObject({ started: 2, finished: 2, players: 2 });
    expect(stats.days.slice(0, -1).every((d) => d.finished === 0)).toBe(true);
  });

  it('gives team and side records that add up', async () => {
    const stats = (await api('mod', 'GET', '/api/admin/stats')).json<StatsOverview>();
    const { challengerWins, challengedWins, draws } = stats.sides;
    expect(challengerWins + challengedWins + draws).toBe(2);
    // Alice always played team A, Bob team B.
    const [a, b] = stats.teams;
    expect(a).toMatchObject({ id: 'A', played: 2, wins: challengerWins, losses: challengedWins, draws });
    expect(b).toMatchObject({ id: 'B', played: 2, wins: challengedWins, losses: challengerWins, draws });
  });

  it('counts draft picks from finished drafts', async () => {
    const stats = (await api('mod', 'GET', '/api/admin/stats')).json<StatsOverview>();
    expect(stats.drafts).toBe(1);
    expect(stats.draftCards.reduce((sum, c) => sum + c.picked, 0)).toBe(2 * DRAFT_PICKS);
    expect(stats.draftCards.every((c) => c.offered === 1 && c.picked <= 1)).toBe(true);
    // The most picked come first, and pick numbers run 1 to 2 × DRAFT_PICKS.
    expect(stats.draftCards[0]!.picked).toBe(1);
    const places = stats.draftCards.filter((c) => c.picked).map((c) => c.averagePick).sort((x, y) => x! - y!);
    expect(places).toEqual(Array.from({ length: 2 * DRAFT_PICKS }, (_, i) => i + 1));
    // A finished match: every pick is on the winning side or the losing one (unless it was a draw).
    if (stats.sides.draws === 0) expect(stats.draftCards.filter((c) => c.picked).every((c) => c.wins + c.losses === 1)).toBe(true);
  });

  it('lists the most active players', async () => {
    const stats = (await api('mod', 'GET', '/api/admin/stats')).json<StatsOverview>();
    expect(stats.topPlayers.map((p) => p.name).sort()).toEqual(['Alice Hexes', 'Bob Wands']);
    expect(stats.topPlayers[0]).toMatchObject({ finishedMonth: 2, finished: 2 });
    expect(stats.topPlayers.reduce((sum, p) => sum + p.wins, 0)).toBe(2 - stats.sides.draws);
  });
});
