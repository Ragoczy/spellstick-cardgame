// Online matches: challenges, the server as referee, and hidden information, against a real
// (test) database. Whole games are played through the API by two computer players that see
// only what the API sends them.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { heuristicAgent } from '../../src/ai/heuristic';
import type { Agent } from '../../src/ai/agent';
import { replay, type Action, type GameSetup, type Side } from '../../src/engine';
import { buildApp } from '../../server/app';
import { findLegal, MAX_OPEN_MATCHES, rebuild, type MatchDetail, type MatchSummary } from '../../server/matches';
import { PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase } from './helpers';

describe('matching a sent move to a legal one', () => {
  const legal: Action[] = [
    { type: 'regroup', side: 'A', discard: ['A03', 'A07'] },
    { type: 'pass', side: 'A', to: { area: 'midfield', lane: 1 } },
  ];

  it('ignores key order and the order of regroup cards', () => {
    expect(findLegal(legal, { to: { lane: 1, area: 'midfield' }, side: 'A', type: 'pass' })).toBe(legal[1]);
    expect(findLegal(legal, { type: 'regroup', side: 'A', discard: ['A07', 'A03'] })).toBe(legal[0]);
  });

  it('refuses anything else', () => {
    expect(findLegal(legal, { type: 'pass', side: 'B', to: { area: 'midfield', lane: 1 } })).toBeNull();
    expect(findLegal(legal, { type: 'pass', side: 'A', to: { area: 'midfield', lane: 1 }, extra: true })).toBeNull();
    expect(findLegal(legal, 'pass')).toBeNull();
    expect(findLegal(legal, null)).toBeNull();
  });
});

const haveDb = await databaseAvailable();

describe.skipIf(!haveDb)('online matches', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const discord = fakeDiscord({
    alice: person('111', 'alice', [PLAYERS_ROLE]),
    bob: person('222', 'bob', [PLAYERS_ROLE]),
    carol: person('333', 'carol', [PLAYERS_ROLE]), // never picks a name
    dave: person('444', 'dave', [PLAYERS_ROLE]),
    erin: person('555', 'erin', [PLAYERS_ROLE]),
  });
  const names: Record<string, string | null> = { alice: 'Alice Hexes', bob: 'Bob Wands', carol: null, dave: 'Dave', erin: 'Erin' };

  /** Calls the API as one of the players. */
  const api = (who: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, cookies: { spellstick_session: cookies[who]! }, ...(payload ? { payload } : {}) });

  const challenge = async (from: string, to: string, extra: object = {}) =>
    api(from, 'POST', '/api/matches', { opponentId: ids[to], lanes: 2, team: 'A', ...extra });

  const newMatch = async (from: string, to: string): Promise<number> => {
    const res = await challenge(from, to);
    expect(res.statusCode).toBe(201);
    const id = res.json<MatchSummary>().id;
    expect((await api(to, 'POST', `/api/matches/${id}/accept`)).statusCode).toBe(200);
    return id;
  };

  const getMatch = async (who: string, id: number, since?: number) =>
    (await api(who, 'GET', `/api/matches/${id}${since === undefined ? '' : `?since=${since}`}`)).json<MatchDetail>();

  const move = (who: string, id: number, action: unknown, seen: number) => api(who, 'POST', `/api/matches/${id}/moves`, { action, seen });

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    app = await buildApp({ config: testConfig(), db, discord });
    for (const who of Object.keys(names)) {
      cookies[who] = (await signIn(app, who)).cookie!;
      if (names[who]) await api(who, 'POST', '/api/me/name', { name: names[who] });
      ids[who] = Number((await db.query('select id from users where discord_username = $1', [who])).rows[0].id);
    }
  });

  afterAll(async () => {
    await app.close();
    await drop();
  });

  it('needs sign-in', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/matches' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/matches', payload: {} })).statusCode).toBe(401);
  });

  it('finds players to challenge by name, never yourself or players without a name', async () => {
    const found = (await api('alice', 'GET', '/api/players?name=bo')).json<{ id: number; name: string }[]>();
    expect(found).toEqual([{ id: ids.bob, name: 'Bob Wands' }]);
    const all = (await api('alice', 'GET', '/api/players')).json<{ name: string }[]>().map((p) => p.name);
    expect(all).toContain('Dave');
    expect(all).not.toContain('Alice Hexes');
    expect(all).toHaveLength(3);
  });

  it('refuses bad challenges', async () => {
    expect((await challenge('alice', 'alice')).json().error).toMatch(/yourself/);
    expect((await challenge('carol', 'bob')).json().error).toMatch(/name first/);
    expect((await challenge('alice', 'carol')).statusCode).toBe(404);
    expect((await api('alice', 'POST', '/api/matches', { opponentId: 999999, lanes: 2, team: 'A' })).statusCode).toBe(404);
    expect((await challenge('alice', 'bob', { lanes: 4 })).statusCode).toBe(400);
    expect((await challenge('alice', 'bob', { team: 'Z' })).statusCode).toBe(400);
  });

  it('challenge, accept, and who sees what before the first move', async () => {
    const res = await challenge('alice', 'bob', { lanes: 3, team: 'B' });
    expect(res.statusCode).toBe(201);
    const sent = res.json<MatchSummary>();
    expect(sent).toMatchObject({
      status: 'challenged', side: 'A', youChallenged: true, yourMove: false, lanes: 3, team: 'B', opponentTeam: 'A',
      opponent: { id: ids.bob, name: 'Bob Wands' },
    });

    // Bob sees the challenge waiting on him, with Alice's chosen name (never her Discord name).
    const bobList = (await api('bob', 'GET', '/api/matches')).json<MatchSummary[]>();
    const received = bobList.find((m) => m.id === sent.id)!;
    expect(received).toMatchObject({ status: 'challenged', side: 'B', youChallenged: false, yourMove: true, opponent: { name: 'Alice Hexes' } });
    expect(JSON.stringify(bobList)).not.toContain('alice');
    expect((await getMatch('bob', sent.id)).game).toBeNull();

    // Players outside the match can't see it or touch it.
    expect((await api('dave', 'GET', `/api/matches/${sent.id}`)).statusCode).toBe(404);
    expect((await api('dave', 'POST', `/api/matches/${sent.id}/accept`)).statusCode).toBe(404);
    // Only Bob can accept, and no moves until he does.
    expect((await api('alice', 'POST', `/api/matches/${sent.id}/accept`)).statusCode).toBe(409);
    expect((await move('alice', sent.id, { type: 'chooseGoalie', side: 'A', card: 'A01' }, 0)).statusCode).toBe(409);

    const accepted = (await api('bob', 'POST', `/api/matches/${sent.id}/accept`)).json<MatchDetail>();
    expect(accepted.match.status).toBe('active');
    expect(accepted.game!.view.me).toBe('B');
    expect(accepted.game!.view.lanes).toBe(3);
    expect(accepted.game!.events[0]).toMatchObject({ seq: 0, events: [{ type: 'gameStarted' }] });
    // Side A chooses a goalie first.
    expect(accepted.match.yourMove).toBe(false);
    expect(accepted.game!.legal).toEqual([]);
    const alice = await getMatch('alice', sent.id);
    expect(alice.match.yourMove).toBe(true);
    expect(alice.game!.legal.every((a) => a.type === 'chooseGoalie' && a.side === 'A')).toBe(true);
    // Accepting twice doesn't work.
    expect((await api('bob', 'POST', `/api/matches/${sent.id}/accept`)).statusCode).toBe(409);
  });

  it('either player can call off a challenge before it starts', async () => {
    const id = (await challenge('alice', 'dave')).json<MatchSummary>().id;
    const declined = (await api('dave', 'POST', `/api/matches/${id}/decline`)).json<MatchSummary>();
    expect(declined).toMatchObject({ status: 'declined', yourMove: false });
    expect((await api('dave', 'POST', `/api/matches/${id}/accept`)).statusCode).toBe(409);

    const withdrawn = (await challenge('alice', 'dave')).json<MatchSummary>().id;
    expect((await api('alice', 'POST', `/api/matches/${withdrawn}/decline`)).json().status).toBe('declined');
  });

  it('accepts only legal moves from the player whose decision it is', async () => {
    const id = await newMatch('alice', 'bob');
    const legal = (await getMatch('alice', id)).game!.legal;

    // Not Bob's decision, a stale move count, a made-up card, and Alice moving for Bob.
    expect((await move('bob', id, { type: 'chooseGoalie', side: 'B', card: 'B01' }, 0)).json().error).toMatch(/isn't your decision/);
    const stale = await move('alice', id, legal[0], 5);
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('stale');
    expect((await move('alice', id, { type: 'chooseGoalie', side: 'A', card: 'A99' }, 0)).statusCode).toBe(400);
    expect((await move('alice', id, { ...legal[0], side: 'B' }, 0)).statusCode).toBe(400);
    expect((await move('alice', id, 'chooseGoalie', 0)).statusCode).toBe(400);

    const ok = await move('alice', id, legal[0], 0);
    expect(ok.statusCode).toBe(200);
    const after = ok.json<MatchDetail>();
    expect(after.match.moveCount).toBe(1);
    // Only the events from this move come back.
    expect(after.game!.events.map((e) => e.seq)).toEqual([1]);
    expect(after.game!.events[0]!.events[0]).toMatchObject({ type: 'goalieChosen', side: 'A' });
    // Now it's Bob's turn to choose a goalie, and he isn't told which goalie Alice chose.
    const bob = await getMatch('bob', id, 0);
    expect(bob.match.yourMove).toBe(true);
    expect(bob.game!.events[0]!.events[0]).toEqual({ type: 'goalieChosen', side: 'A' });
  });

  it('handles a double click: the same move sent twice counts once', async () => {
    const id = await newMatch('alice', 'bob');
    const action = (await getMatch('alice', id)).game!.legal[0];
    const results = await Promise.all([move('alice', id, action, 0), move('alice', id, action, 0)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect((await db.query('select count(*)::int as n from match_events where match_id = $1', [id])).rows[0].n).toBe(1);
  });

  it('plays a whole game through the API, keeping each side\'s face-down cards secret', { timeout: 120_000 }, async () => {
    const id = await newMatch('alice', 'bob');
    const player: Record<Side, string> = { A: 'alice', B: 'bob' };
    const latest: Partial<Record<Side, MatchDetail>> = {};
    const agents: Partial<Record<Side, Agent>> = {};
    let moveCount = 0;
    let checkedSecrets = false;

    for (let guard = 0; guard < 2000; guard++) {
      const a = latest.A ?? (latest.A = await getMatch('alice', id));
      const side: Side = a.game!.view.pending.kind === 'gameOver' ? 'A' : (a.game!.view.pending as { side: Side }).side;
      if (a.match.status === 'finished') break;
      // Use the mover's last answer if it's up to date; otherwise ask for the latest.
      let mine = latest[side];
      if (!mine || mine.match.moveCount !== moveCount) mine = await getMatch(player[side], id, mine?.match.moveCount);
      const view = mine.game!.view;

      // Every event a player receives has the other side's secrets removed.
      for (const e of mine.game!.events.flatMap((m) => m.events)) {
        if ('secret' in e) expect((e as { side: Side }).side).toBe(side);
      }
      // Once both lineups are down (before anything is revealed), check the opponent's view directly.
      if (!checkedSecrets && view.pending.kind === 'faceoffLane') {
        checkedSecrets = true;
        const other: Side = side === 'A' ? 'B' : 'A';
        const theirs = await getMatch(player[other], id);
        const mineFromTheirSide = theirs.game!.view.opponent;
        for (const row of Object.values(mineFromTheirSide.lineup)) for (const slot of row) expect(slot.state).toBe('unknown');
        // None of my hidden card ids (lineup and hand) appear anywhere in what they were sent.
        const { rows } = await db.query<{ setup: GameSetup }>('select setup from matches where id = $1', [id]);
        const moves = (await db.query<{ move: Action }>('select move from match_events where match_id = $1 order by seq', [id])).rows.map((r) => r.move);
        const { state } = rebuild(rows[0]!.setup, moves);
        const team = state.teams[side];
        const hidden = [...Object.values(team.lineup).flat().filter((s) => s && !s.revealed).map((s) => s!.uid), ...team.hand]
          .map((uid) => state.cards[uid]!.id);
        const visible = new Set([team.goalie, ...Object.values(team.lineup).flat()].filter((s) => s?.revealed).map((s) => state.cards[s!.uid]!.id));
        const sent = JSON.stringify(theirs);
        for (const cardId of hidden) if (!visible.has(cardId)) expect(sent).not.toContain(`"${cardId}"`);
      }

      const agent = agents[side] ?? (agents[side] = heuristicAgent(side === 'A' ? 11 : 22, view.config));
      const res = await move(player[side], id, agent.chooseAction(view, mine.game!.legal), moveCount);
      expect(res.statusCode).toBe(200);
      latest[side] = res.json<MatchDetail>();
      moveCount = latest[side]!.match.moveCount;
      if (side === 'B') latest.A = undefined; // Alice's copy is now out of date
    }

    expect(checkedSecrets).toBe(true);
    const alice = await getMatch('alice', id);
    const bob = await getMatch('bob', id);
    expect(alice.match.status).toBe('finished');
    expect(alice.game!.legal).toEqual([]);
    const outcomes = [alice.match.result!.outcome, bob.match.result!.outcome].sort();
    expect([['draw', 'draw'], ['lost', 'won']]).toContainEqual(outcomes);
    expect(alice.match.yourMove || bob.match.yourMove).toBe(false);

    // The stored setup and moves replay to exactly the same finished game.
    const row = (await db.query('select setup, move_count, winner from matches where id = $1', [id])).rows[0];
    const moves = (await db.query<{ move: Action }>('select move from match_events where match_id = $1 order by seq', [id])).rows.map((r) => r.move);
    expect(moves).toHaveLength(row.move_count);
    const { state } = replay(row.setup, moves);
    expect(state.result).toEqual(alice.game!.view.result);
    const winnerId = state.result!.winner ? ids[player[state.result!.winner]] : null;
    expect(row.winner === null ? null : Number(row.winner)).toBe(winnerId);
    // No more moves once it's over.
    expect((await move('alice', id, { type: 'shoot', side: 'A' }, moveCount)).json().error).toMatch(/over/);
  });

  it('lets a player resign', async () => {
    const id = await newMatch('alice', 'bob');
    const resigned = (await api('alice', 'POST', `/api/matches/${id}/resign`)).json<MatchSummary>();
    expect(resigned).toMatchObject({ status: 'finished', result: { outcome: 'lost', reason: 'resigned' } });
    expect((await getMatch('bob', id)).match.result).toEqual({ outcome: 'won', reason: 'resigned' });
    expect((await getMatch('bob', id)).game!.legal).toEqual([]);
    expect((await api('bob', 'POST', `/api/matches/${id}/resign`)).statusCode).toBe(409);
  });

  it(`limits each player to ${MAX_OPEN_MATCHES} open matches`, async () => {
    for (let i = 0; i < MAX_OPEN_MATCHES; i++) expect((await challenge('erin', 'dave')).statusCode).toBe(201);
    expect((await challenge('erin', 'dave')).json().error).toMatch(/matches going already/);
    // Dave is full too, so others can't pile on.
    expect((await challenge('alice', 'dave')).json().error).toMatch(/Dave has too many/);
  });
});
