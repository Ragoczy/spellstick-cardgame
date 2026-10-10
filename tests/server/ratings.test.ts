// Ranked matches and ratings: the Elo sums, and ratings changing as ranked matches end, against
// a real (test) database.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { MatchSummary, RatingsBoard } from '../../src/shared/matchApi';
import { buildApp } from '../../server/app';
import { inTransaction } from '../../server/matches';
import { unlinkAccount } from '../../server/unlink';
import {
  expectedScore, K, kFactor, NEW_PLAYER_GAMES, NEW_PLAYER_K, PLACEMENT_GAMES, ratingChanges, recordRankedResult, START_RATING, tierFor,
} from '../../server/ratings';
import { ADMIN_ID, ADMINS_ROLE, PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase } from './helpers';

describe('the Elo sums', () => {
  it('gives equal players an even chance, and a 200-point favorite about 76%', () => {
    expect(expectedScore(1200, 1200)).toBe(0.5);
    expect(expectedScore(1400, 1200)).toBeCloseTo(0.76, 2);
    expect(expectedScore(1200, 1400)).toBeCloseTo(0.24, 2);
  });

  it('moves new players faster', () => {
    expect(kFactor(0)).toBe(NEW_PLAYER_K);
    expect(kFactor(NEW_PLAYER_GAMES - 1)).toBe(NEW_PLAYER_K);
    expect(kFactor(NEW_PLAYER_GAMES)).toBe(K);
  });

  it('a win between equals moves both by half the K factor', () => {
    const regular = { rating: 1200, games: 50 };
    expect(ratingChanges(regular, regular, 'A')).toEqual({ A: K / 2, B: -K / 2 });
    expect(ratingChanges(regular, regular, 'B')).toEqual({ A: -K / 2, B: K / 2 });
  });

  it('a draw between equals changes nothing, and pulls unequal players together', () => {
    expect(ratingChanges({ rating: 1200, games: 50 }, { rating: 1200, games: 50 }, null)).toEqual({ A: 0, B: 0 });
    const draw = ratingChanges({ rating: 1400, games: 50 }, { rating: 1200, games: 50 }, null);
    expect(draw.A).toBeLessThan(0);
    expect(draw.B).toBeGreaterThan(0);
  });

  it('beating a much weaker player gains little; an upset gains a lot', () => {
    const strong = { rating: 1600, games: 50 };
    const weak = { rating: 1200, games: 50 };
    expect(ratingChanges(strong, weak, 'A').A).toBeLessThanOrEqual(2);
    expect(ratingChanges(strong, weak, 'B').B).toBeGreaterThanOrEqual(18);
  });

  it('gives a tier only after the placement matches', () => {
    expect(tierFor(1500, PLACEMENT_GAMES - 1)).toBeNull();
    expect(tierFor(1100, PLACEMENT_GAMES)).toBe('Bronze');
    expect(tierFor(START_RATING, PLACEMENT_GAMES)).toBe('Silver');
    expect(tierFor(1300, PLACEMENT_GAMES)).toBe('Gold');
    expect(tierFor(1450, PLACEMENT_GAMES)).toBe('Spellstick Master');
  });
});

const haveDb = await databaseAvailable();

describe.skipIf(!haveDb)('ranked matches', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const discord = fakeDiscord({
    alice: person('111', 'alice', [PLAYERS_ROLE]),
    bob: person('222', 'bob', [PLAYERS_ROLE]),
    carol: person('333', 'carol', [PLAYERS_ROLE]),
    admin: person(ADMIN_ID, 'admin', [ADMINS_ROLE]),
  });

  const api = (who: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, cookies: { spellstick_session: cookies[who]! }, ...(payload ? { payload } : {}) });
  const board = async (who: string) => (await api(who, 'GET', '/api/ratings')).json<RatingsBoard>();

  /** A match between two players, accepted. ranked: a ranked draft. */
  const newMatch = async (from: string, to: string, ranked: boolean): Promise<number> => {
    const res = await api(from, 'POST', '/api/matches', { opponentId: ids[to], lanes: 2, team: 'A', players: 'draft', ranked });
    expect(res.statusCode).toBe(201);
    const id = res.json<MatchSummary>().id;
    expect((await api(to, 'POST', `/api/matches/${id}/accept`)).statusCode).toBe(200);
    return id;
  };
  /** loser resigns a new match against winner. */
  const beats = async (winner: string, loser: string, ranked = true): Promise<number> => {
    const id = await newMatch(winner, loser, ranked);
    expect((await api(loser, 'POST', `/api/matches/${id}/resign`)).statusCode).toBe(200);
    return id;
  };
  const summary = async (who: string, id: number) => (await api(who, 'GET', `/api/matches/${id}`)).json<{ match: MatchSummary }>().match;

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    app = await buildApp({ config: testConfig(), db, discord });
    for (const [who, name] of [['alice', 'Alice Hexes'], ['bob', 'Bob Wands'], ['carol', 'Carol'], ['admin', 'Paul']] as const) {
      cookies[who] = (await signIn(app, who)).cookie!;
      await api(who, 'POST', '/api/me/name', { name });
      ids[who] = Number((await db.query('select id from users where discord_username = $1', [who])).rows[0].id);
    }
  });

  afterAll(async () => {
    await app.close();
    await drop();
  });

  it('needs sign-in', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/ratings' })).statusCode).toBe(401);
  });

  it('only draft challenges can be ranked', async () => {
    const dealt = await api('alice', 'POST', '/api/matches', { opponentId: ids.bob, lanes: 2, team: 'A', players: 'dealt', ranked: true });
    expect(dealt.statusCode).toBe(400);
    expect(dealt.json().error).toMatch(/Ranked matches use a draft/);
    const odd = await api('alice', 'POST', '/api/matches', { opponentId: ids.bob, lanes: 2, team: 'A', players: 'draft', ranked: 'yes' });
    expect(odd.statusCode).toBe(400);
  });

  it('an unranked match changes no ratings', async () => {
    const id = await beats('alice', 'bob', false);
    expect((await summary('alice', id)).result).toEqual({ outcome: 'won', reason: 'resigned', ratingChange: null });
    expect((await board('alice')).you).toBeNull();
  });

  it('a ranked match changes both ratings, and both players see by how much', async () => {
    const id = await beats('alice', 'bob');
    const sent = await summary('alice', id);
    expect(sent.ranked).toBe(true);
    expect(sent.result).toEqual({ outcome: 'won', reason: 'resigned', ratingChange: NEW_PLAYER_K / 2 });
    expect((await summary('bob', id)).result).toEqual({ outcome: 'lost', reason: 'resigned', ratingChange: -NEW_PLAYER_K / 2 });

    const alice = (await board('alice')).you!;
    expect(alice).toMatchObject({ rating: START_RATING + NEW_PLAYER_K / 2, games: 1, wins: 1, losses: 0, draws: 0, tier: null, rank: null });
    expect((await board('bob')).you).toMatchObject({ rating: START_RATING - NEW_PLAYER_K / 2, games: 1, losses: 1 });
  });

  it('counts a draw, and never counts a match twice', async () => {
    const id = await newMatch('bob', 'carol', true);
    // Draws are rare in play, so end this one as a draw directly.
    await inTransaction(db, async (client) => {
      await client.query(`update matches set status = 'finished', winner = null, end_reason = 'played', finished_at = now(), waiting_on = null where id = $1`, [id]);
      await recordRankedResult(client, id);
      await recordRankedResult(client, id);
    });
    const carol = (await board('carol')).you!;
    expect(carol).toMatchObject({ games: 1, draws: 1 });
    // Bob was 20 below Carol, so the draw moves him up a little and her down a little.
    expect(carol.rating).toBeLessThan(START_RATING);
    expect((await board('bob')).you).toMatchObject({ games: 2, draws: 1 });
  });

  it('puts players on the board after their placement matches, best first', async () => {
    for (let i = 0; i < PLACEMENT_GAMES; i++) await beats('alice', 'carol');
    const view = await board('carol');
    expect(view.placementGames).toBe(PLACEMENT_GAMES);
    expect(view.tiers.map((t) => t.name)).toEqual(['Spellstick Master', 'Gold', 'Silver', 'Bronze']);
    // Alice and Carol have finished their placement matches; Bob hasn't.
    expect(view.players.map((p) => p.name)).toEqual(['Alice Hexes', 'Carol']);
    expect(view.players[0]).toMatchObject({ rank: 1, you: false, games: PLACEMENT_GAMES + 1, wins: PLACEMENT_GAMES + 1 });
    expect(view.players[0]!.tier).not.toBeNull();
    expect(view.players[1]).toMatchObject({ rank: 2, you: true, tier: 'Bronze' });
    expect(view.you).toMatchObject({ rank: 2, tier: 'Bronze' });
    expect((await board('bob')).you).toMatchObject({ rank: null, tier: null });
  });

  it('admins can work every rating out again and get the same answer', async () => {
    const before = await board('alice');
    expect((await api('alice', 'POST', '/api/admin/ratings/recalculate')).statusCode).toBe(403);
    const res = await api('admin', 'POST', '/api/admin/ratings/recalculate');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ matches: PLACEMENT_GAMES + 2 });
    const after = await board('alice');
    expect(after.you).toEqual(before.you);
    expect(after.players).toEqual(before.players);
  });

  it('a player who unlinks loses their rating; their opponents keep theirs', async () => {
    const aliceBefore = (await board('alice')).you!.rating;
    await unlinkAccount(db, ids.carol!);
    expect((await db.query('select 1 from ratings where user_id = $1', [ids.carol])).rowCount).toBe(0);
    expect((await board('alice')).you!.rating).toBe(aliceBefore);
    // Working ratings out again doesn't bring Carol back, and Alice's wins over her still count.
    await api('admin', 'POST', '/api/admin/ratings/recalculate');
    expect((await db.query('select 1 from ratings where user_id = $1', [ids.carol])).rowCount).toBe(0);
    expect((await board('alice')).you!.rating).toBe(aliceBefore);
  });

  it('admins can start ratings over; only ranked matches after that count', async () => {
    expect((await api('bob', 'POST', '/api/admin/ratings/reset')).statusCode).toBe(403);
    expect((await api('admin', 'POST', '/api/admin/ratings/reset')).statusCode).toBe(200);
    const fresh = await board('alice');
    expect(fresh.you).toBeNull();
    expect(fresh.players).toEqual([]);
    expect(fresh.since).not.toBeNull();

    await beats('bob', 'alice');
    expect((await board('bob')).you).toMatchObject({ rating: START_RATING + NEW_PLAYER_K / 2, games: 1 });
    await api('admin', 'POST', '/api/admin/ratings/recalculate');
    expect((await board('bob')).you).toMatchObject({ rating: START_RATING + NEW_PLAYER_K / 2, games: 1 });
  });
});
