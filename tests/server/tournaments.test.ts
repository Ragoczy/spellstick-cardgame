// Tournaments, award cards, and redeem codes (online phase 3), against a real (test) database:
// setting one up, Swiss rounds paired from match results, the round deadline, drops, the
// knockout, and the award cards at the end.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { Collection } from '../../src/shared/collectionApi';
import type { MatchDetail } from '../../src/shared/matchApi';
import type { RedeemCodeRow, TournamentDetail, TournamentSummary } from '../../src/shared/tournamentApi';
import { buildApp } from '../../server/app';
import { normalizeCode } from '../../server/codes';
import { unlinkAccount } from '../../server/unlink';
import { ADMIN_ID, ADMINS_ROLE, PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase } from './helpers';

const haveDb = await databaseAvailable();

/** A named player from the card data, for award cards. */
const AWARD_CARD = 'pl-001';

describe.skipIf(!haveDb)('tournaments', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
  const cookies: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const whoIs = new Map<number, string>();
  const discord = fakeDiscord({
    admin: person(ADMIN_ID, 'admin', [ADMINS_ROLE]),
    ...Object.fromEntries(players.map((p, i) => [p, person(String(500 + i), p, [PLAYERS_ROLE])])),
  });

  const api = (who: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, cookies: { spellstick_session: cookies[who]! }, ...(payload ? { payload } : {}) });
  const detail = async (who: string, id: number) => (await api(who, 'GET', `/api/tournaments/${id}`)).json<TournamentDetail>();
  const getMatch = async (who: string, id: number) => (await api(who, 'GET', `/api/matches/${id}`)).json<MatchDetail>();

  const setUp = async (overrides: object = {}): Promise<number> => {
    const res = await api('admin', 'POST', '/api/admin/tournaments', {
      name: 'Spring Cup', format: 'draft', lanes: 2, pace: 'async', roundHours: 96, topPrize: 'A signed paperback', awardCard: AWARD_CARD,
      ...overrides,
    });
    expect(res.statusCode).toBe(201);
    return res.json<TournamentSummary>().id;
  };
  const enter = async (id: number, who: string[], body: object = {}) => {
    for (const w of who) expect((await api(w, 'POST', `/api/tournaments/${id}/enter`, body)).statusCode).toBe(200);
  };
  const start = async (id: number) => {
    const res = await api('admin', 'POST', `/api/admin/tournaments/${id}/start`);
    expect(res.statusCode).toBe(200);
    return res.json<TournamentDetail>();
  };

  /** The round being played, as the database has it: who plays whom, in which match. */
  const currentPairs = async (id: number) => {
    const { rows } = await db.query<{ match_id: string | null; player_a: string; player_b: string | null; outcome: string | null; slot: number }>(
      `select p.match_id, p.player_a, p.player_b, p.outcome, p.slot from tournament_pairings p join tournaments t on t.id = p.tournament_id
       where t.id = $1 and p.round = t.round order by p.slot`,
      [id],
    );
    return rows.map((r) => ({
      matchId: r.match_id === null ? null : Number(r.match_id),
      a: whoIs.get(Number(r.player_a))!, b: r.player_b === null ? null : whoIs.get(Number(r.player_b))!, outcome: r.outcome, slot: r.slot,
    }));
  };

  /** Makes the player's next decision, if it's theirs. */
  const moveOnce = async (who: string, matchId: number): Promise<boolean> => {
    const d = await getMatch(who, matchId);
    if (!d.match.yourMove) return false;
    const res = await api(who, 'POST', `/api/matches/${matchId}/moves`, { action: d.game!.legal[0], seen: d.match.moveCount });
    expect(res.statusCode).toBe(200);
    return true;
  };
  /** Both players make at least one move (so neither counts as a no-show). */
  const bothMove = async (matchId: number, x: string, y: string) => {
    const moved = new Set<string>();
    for (let i = 0; i < 8 && moved.size < 2; i++) {
      for (const who of [x, y]) if (await moveOnce(who, matchId)) moved.add(who);
    }
    expect(moved.size).toBe(2);
  };
  /** The player later in the list loses (resigns), after both have moved. */
  const playRound = async (id: number) => {
    // Reading the tournament waits for any update still running, so the round is the latest.
    await detail('admin', id);
    for (const p of await currentPairs(id)) {
      if (p.matchId === null || p.b === null) continue;
      if ((await getMatch(p.a, p.matchId)).match.status !== 'active') continue;
      await bothMove(p.matchId, p.a, p.b);
      const loser = players.indexOf(p.a) > players.indexOf(p.b) ? p.a : p.b;
      expect((await api(loser, 'POST', `/api/matches/${p.matchId}/resign`)).statusCode).toBe(200);
    }
  };
  const passDeadline = (id: number) => db.query(`update tournaments set round_ends_at = now() - interval '1 second' where id = $1`, [id]);
  /** The player's award cards from one tournament. */
  const awardsOf = async (who: string, tournamentId: number) =>
    (await api(who, 'GET', '/api/collection')).json<Collection>().cards.filter((c) => c.edition?.tournamentId === tournamentId);

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    // The award card must exist in player_cards (main.ts loads them at start-up).
    const { loadPlayerCards } = await import('../../server/cardData');
    await loadPlayerCards(db);
    app = await buildApp({ config: testConfig(), db, discord });
    for (const who of ['admin', ...players]) {
      cookies[who] = (await signIn(app, who)).cookie!;
      await api(who, 'POST', '/api/me/name', { name: who === 'admin' ? 'The Commissioner' : `Player ${who.slice(1)}` });
      ids[who] = Number((await db.query('select id from users where discord_username = $1', [who])).rows[0].id);
      whoIs.set(ids[who]!, who);
    }
  });

  afterAll(async () => {
    await app.close();
    await drop();
  });

  it('only admins set one up, with rounds long enough for both time banks', async () => {
    const asPlayer = await api('p1', 'POST', '/api/admin/tournaments', { name: 'Mine', format: 'draft', lanes: 2, pace: 'async', roundHours: 96, topPrize: '', awardCard: '' });
    expect(asPlayer.statusCode).toBe(403);
    const tooShort = await api('admin', 'POST', '/api/admin/tournaments', { name: 'Quick', format: 'draft', lanes: 2, pace: 'async', roundHours: 24, topPrize: '', awardCard: '' });
    expect(tooShort.statusCode).toBe(400);
    expect(tooShort.json().error).toMatch(/72/);
    const badCard = await api('admin', 'POST', '/api/admin/tournaments', { name: 'Cup', format: 'draft', lanes: 2, pace: 'live', roundHours: 2, topPrize: '', awardCard: 'nope' });
    expect(badCard.statusCode).toBe(400);
  });

  it('players enter and withdraw before the start, and it needs four to start', async () => {
    const id = await setUp();
    await enter(id, ['p1', 'p2', 'p3']);
    expect((await api('p1', 'POST', `/api/tournaments/${id}/enter`)).statusCode).toBe(409);
    expect((await api('admin', 'POST', `/api/admin/tournaments/${id}/start`)).statusCode).toBe(409);
    expect((await api('p3', 'POST', `/api/tournaments/${id}/leave`)).statusCode).toBe(200);
    const d = await detail('p1', id);
    expect(d.entrants.map((e) => e.name)).toEqual(['Player 1', 'Player 2']);
    expect(d.tournament.topPrize).toBe('A signed paperback');
    expect((await api('p1', 'GET', '/api/tournaments')).json<TournamentSummary[]>().some((t) => t.id === id && t.youEntered)).toBe(true);
    await api('admin', 'POST', `/api/admin/tournaments/${id}/cancel`);
  });

  it('runs four players through two Swiss rounds, with no knockout, then gives out the award cards', async () => {
    const id = await setUp();
    const four = ['p1', 'p2', 'p3', 'p4'];
    await enter(id, four);
    const started = await start(id);
    expect(started.tournament).toMatchObject({ status: 'swiss', round: 1, swissRounds: 2, knockoutSize: 0 });

    // Matches start straight away, with no challenge to accept.
    const round1 = await currentPairs(id);
    expect(round1).toHaveLength(2);
    const mine = await detail('p1', id);
    expect(mine.you.currentMatchId).not.toBeNull();
    const match = await getMatch('p1', mine.you.currentMatchId!);
    expect(match.match).toMatchObject({ status: 'active', draft: true, ranked: false, tournament: { id, name: 'Spring Cup' } });

    await playRound(id);
    const after1 = await detail('admin', id);
    expect(after1.tournament.round).toBe(2);
    // Winners meet winners, and nobody meets the same player twice.
    const round2 = await currentPairs(id);
    const met = new Set(round1.map((p) => [p.a, p.b].sort().join()));
    for (const p of round2) expect(met.has([p.a, p.b].sort().join())).toBe(false);

    await playRound(id);
    const done = await detail('p2', id);
    expect(done.tournament.status).toBe('finished');
    expect(done.tournament.champion).toBe('Player 1');
    expect(done.standings[0]).toMatchObject({ rank: 1, name: 'Player 1', points: 6, wins: 2 });
    expect(done.you.placing).toBe('played');
    // Only admins see whether the prize has gone out.
    expect(done.prizeSentAt).toBeNull();
    expect((await api('admin', 'POST', `/api/admin/tournaments/${id}/prize-sent`)).json<TournamentDetail>().prizeSentAt).not.toBeNull();

    // One award card each: the champion's is 1 of 1 and bound to them.
    const champion = await awardsOf('p1', id);
    expect(champion).toHaveLength(1);
    expect(champion[0]).toMatchObject({ cardId: AWARD_CARD, source: 'award', edition: { kind: 'champion', label: 'Spring Cup Champion, 1 of 1', tradeable: false } });
    const other = await awardsOf('p3', id);
    expect(other[0]!.edition).toMatchObject({ kind: 'played', tradeable: true });
    expect(other[0]!.edition!.label).toMatch(/^Spring Cup, \w+ \d{4}$/);
  });

  it('settles matches at the round deadline, and drops a player who misses two rounds', async () => {
    const id = await setUp({ awardCard: AWARD_CARD, name: 'Deadline Cup' });
    const four = ['p1', 'p2', 'p3', 'p4'];
    await enter(id, four);
    await start(id);
    const [x, y] = await currentPairs(id);
    // In one match both players move and nobody scores; in the other, nobody moves at all.
    await bothMove(x!.matchId!, x!.a, x!.b!);
    await passDeadline(id);
    const after1 = await detail('admin', id);
    expect(after1.tournament.round).toBe(2);
    const r1 = after1.pairings.filter((p) => p.round === 1);
    expect(r1.map((p) => p.outcome).sort()).toEqual(['double_loss', 'draw']);
    const settled = await getMatch(x!.a, x!.matchId!);
    expect(settled.match.result).toMatchObject({ outcome: 'draw', reason: 'deadline' });

    // Round 2: nobody moves. The two who missed round 1 too are dropped.
    await passDeadline(id);
    const done = await detail('admin', id);
    expect(done.tournament.status).toBe('finished');
    const noShows = [y!.a, y!.b!].map((w) => `Player ${w.slice(1)}`);
    for (const row of done.standings) expect(row.dropped).toBe(noShows.includes(row.name));
    // Never moving means no award card.
    expect(await awardsOf(y!.a, id)).toHaveLength(0);
    expect((await detail(y!.a, id)).you.placing).toBeNull();
  });

  it('dropping out resigns the match in progress, and a player left over gets a bye', async () => {
    const id = await setUp({ name: 'Drop Cup', awardCard: '' });
    await enter(id, ['p1', 'p2', 'p3', 'p4']);
    await start(id);
    const leaver = 'p4';
    const theirs = (await detail(leaver, id)).you.currentMatchId!;
    expect((await api(leaver, 'POST', `/api/tournaments/${id}/leave`)).statusCode).toBe(200);
    const match = await getMatch(leaver, theirs);
    expect(match.match.result).toMatchObject({ outcome: 'lost', reason: 'resigned' });
    await playRound(id);
    await detail('admin', id);
    const round2 = await currentPairs(id);
    expect(round2.some((p) => p.b === null && p.outcome === 'bye')).toBe(true);
    expect(round2.flatMap((p) => [p.a, p.b])).not.toContain(leaver);
  });

  it('cuts six players to a top-4 knockout, where a tie at the deadline sends the higher seed through', async () => {
    const id = await setUp({ name: 'Knockout Cup' });
    const six = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    await enter(id, six);
    const started = await start(id);
    expect(started.tournament).toMatchObject({ swissRounds: 3, knockoutSize: 4 });
    for (let round = 1; round <= 3; round++) await playRound(id);

    const knockout = await detail('admin', id);
    expect(knockout.tournament.status).toBe('knockout');
    const semis = await currentPairs(id);
    expect(semis).toHaveLength(2);
    const seeds = knockout.pairings.filter((p) => p.stage === 'knockout').map((p) => [p.a.seed!, p.b!.seed!].sort());
    expect(seeds).toEqual([[1, 4], [2, 3]]);

    // Semi 2 ends normally. Semi 1 is still level when the round ends: seed 1 goes through.
    const [semi1, semi2] = semis;
    await bothMove(semi2!.matchId!, semi2!.a, semi2!.b!);
    const semi2Loser = players.indexOf(semi2!.a) > players.indexOf(semi2!.b!) ? semi2!.a : semi2!.b!;
    await api(semi2Loser, 'POST', `/api/matches/${semi2!.matchId}/resign`);
    await bothMove(semi1!.matchId!, semi1!.a, semi1!.b!);
    await passDeadline(id);
    const final = await detail('admin', id);
    const seed1 = final.pairings.find((p) => p.stage === 'knockout' && p.slot === 0 && p.round === 4)!;
    const seed1Name = seed1.a.seed === 1 ? seed1.a.name : seed1.b!.name;
    expect(seed1.outcome).toBe('draw');
    const finalPair = (await currentPairs(id))[0]!;
    expect([finalPair.a, finalPair.b].map((w) => `Player ${w!.slice(1)}`)).toContain(seed1Name);

    await playRound(id);
    const done = await detail('admin', id);
    expect(done.tournament.status).toBe('finished');
    const placings: Record<string, string | null> = {};
    for (const w of six) placings[w] = (await detail(w, id)).you.placing;
    expect(Object.values(placings).sort()).toEqual(['champion', 'finalist', 'knockout', 'knockout', 'played', 'played']);
    const finalist = six.find((w) => placings[w] === 'finalist')!;
    expect((await awardsOf(finalist, id)).at(-1)!.edition).toMatchObject({ kind: 'knockout', label: 'Knockout Cup Finalist', foil: true });
    const semifinalist = six.find((w) => placings[w] === 'knockout')!;
    expect((await awardsOf(semifinalist, id)).at(-1)!.edition).toMatchObject({ label: 'Knockout Cup Top 4' });
  });

  it('saved-team events copy each player\'s team when they enter', async () => {
    const id = await setUp({ name: 'Teams Cup', format: 'constructed', awardCard: '' });
    expect((await api('p1', 'POST', `/api/tournaments/${id}/enter`)).statusCode).toBe(400);
    for (const who of ['p1', 'p2', 'p3', 'p4']) {
      const team = (await api(who, 'GET', '/api/collection')).json<Collection>().teams[0]!;
      await enter(id, [who], { teamId: team.id });
    }
    await start(id);
    const matchId = (await detail('p1', id)).you.currentMatchId!;
    const m = await getMatch('p1', matchId);
    expect(m.match).toMatchObject({ constructed: true, teamName: 'Starter team', opponentTeamName: 'Starter team' });
  });

  it('unlinking drops the player from their tournaments, with no award card', async () => {
    const id = await setUp({ name: 'Leaving Cup' });
    await enter(id, ['p4', 'p5', 'p6', 'p7']);
    await start(id);
    await unlinkAccount(db, ids.p7!);
    const { rows } = await db.query('select drop_reason from tournament_entries where tournament_id = $1 and user_id = $2', [id, ids.p7]);
    expect(rows[0].drop_reason).toBe('left');
  });
});

describe.skipIf(!haveDb)('redeem codes', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies: Record<string, string> = {};
  const discord = fakeDiscord({ admin: person(ADMIN_ID, 'admin', [ADMINS_ROLE]), alice: person('111', 'alice', [PLAYERS_ROLE]) });
  const api = (who: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, cookies: { spellstick_session: cookies[who]! }, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    const { loadPlayerCards } = await import('../../server/cardData');
    await loadPlayerCards(db);
    app = await buildApp({ config: testConfig(), db, discord });
    for (const who of ['admin', 'alice']) {
      cookies[who] = (await signIn(app, who)).cookie!;
      await api(who, 'POST', '/api/me/name', { name: who === 'admin' ? 'The Commissioner' : 'Alice Hexes' });
    }
  });

  afterAll(async () => {
    await app.close();
    await drop();
  });

  it('reads codes however they are typed', () => {
    expect(normalizeCode(' abcde fghjk ')).toBe('ABCDE-FGHJK');
    expect(normalizeCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
  });

  it('only admins make codes; each gives one award card, once', async () => {
    const input = { cardId: AWARD_CARD, label: 'Book launch week', count: 2, tradeable: true, expiresInDays: 30 };
    expect((await api('alice', 'POST', '/api/admin/codes', input)).statusCode).toBe(403);
    const made = await api('admin', 'POST', '/api/admin/codes', input);
    expect(made.statusCode).toBe(201);
    const codes = made.json<RedeemCodeRow[]>();
    expect(codes).toHaveLength(2);
    expect(codes[0]!.code).toMatch(/^[2-9A-Z]{5}-[2-9A-Z]{5}$/);

    const used = await api('alice', 'POST', '/api/redeem', { code: codes[0]!.code.toLowerCase().replace('-', ' ') });
    expect(used.statusCode).toBe(200);
    expect(used.json()).toMatchObject({ cardId: AWARD_CARD, source: 'award', edition: { kind: 'code', label: 'Book launch week', tradeable: true } });
    expect((await api('alice', 'POST', '/api/redeem', { code: codes[0]!.code })).statusCode).toBe(409);
    expect((await api('alice', 'POST', '/api/redeem', { code: 'ZZZZZ-ZZZZZ' })).statusCode).toBe(404);

    await db.query(`update redeem_codes set expires_at = now() - interval '1 minute' where code = $1`, [codes[1]!.code]);
    const expired = await api('alice', 'POST', '/api/redeem', { code: codes[1]!.code });
    expect(expired.statusCode).toBe(409);
    expect(expired.json().error).toMatch(/expired/);

    const list = (await api('admin', 'GET', '/api/admin/codes')).json<RedeemCodeRow[]>();
    expect(list.find((c) => c.code === codes[0]!.code)!.redeemedBy).toBe('Alice Hexes');
  });

  it('stops a player who keeps typing wrong codes', async () => {
    for (let i = 0; i < 10; i++) await api('alice', 'POST', '/api/redeem', { code: `WRONG-${i}` });
    expect((await api('alice', 'POST', '/api/redeem', { code: 'ZZZZZ-ZZZZZ' })).statusCode).toBe(429);
  });
});
