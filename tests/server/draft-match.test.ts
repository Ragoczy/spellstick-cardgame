// An online match that starts with the head-to-head draft (RULES.md "Draft"), against a real
// (test) database: picks go through the referee and use the time banks like any other decision.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { MatchDetail, MatchSummary } from '../../src/shared/matchApi';
import { buildApp } from '../../server/app';
import { settleOverdue } from '../../server/matches';
import { PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase } from './helpers';

const haveDb = await databaseAvailable();

describe.skipIf(!haveDb)('online draft matches', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const discord = fakeDiscord({ alice: person('111', 'alice', [PLAYERS_ROLE]), bob: person('222', 'bob', [PLAYERS_ROLE]) });

  const api = (who: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, cookies: { spellstick_session: cookies[who]! }, ...(payload ? { payload } : {}) });
  const getMatch = async (who: string, id: number) => (await api(who, 'GET', `/api/matches/${id}`)).json<MatchDetail>();
  const newDraft = async (): Promise<number> => {
    const res = await api('alice', 'POST', '/api/matches', { opponentId: ids.bob, lanes: 2, team: 'A', players: 'draft' });
    const match = res.json<MatchSummary>();
    expect(match.draft).toBe(true);
    await api('bob', 'POST', `/api/matches/${match.id}/accept`);
    return match.id;
  };

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

  it('both players draft through the server, then choose goalies as usual', async () => {
    const id = await newDraft();
    for (let pick = 0; pick < 20; pick++) {
      const [a, b] = [await getMatch('alice', id), await getMatch('bob', id)];
      expect(a.game!.view.pending.kind).toBe('draftPick');
      // Both see the same face-up pool.
      expect(a.game!.view.draft!.pool.map((c) => c.def.id)).toEqual(b.game!.view.draft!.pool.map((c) => c.def.id));
      const who = a.match.yourMove ? 'alice' : 'bob';
      const mine = who === 'alice' ? a : b;
      const res = await api(who, 'POST', `/api/matches/${id}/moves`, { action: mine.game!.legal[0], seen: mine.match.moveCount });
      expect(res.statusCode).toBe(200);
    }
    const alice = await getMatch('alice', id);
    expect(alice.game!.view.draft!.done).toBe(true);
    expect(alice.game!.view.pending).toEqual({ kind: 'chooseGoalie', side: 'A' });
    expect(alice.game!.view.draft!.picks.A).toHaveLength(10);
    // Alice's goalies (dealt at random) are in her hand; Bob only sees how many cards she holds.
    expect(alice.game!.view.mine.hand.every((c) => c.def.kind === 'goalie')).toBe(true);
    const bob = await getMatch('bob', id);
    expect(bob.game!.view.opponent.handCount).toBe(2);
    for (const c of alice.game!.view.mine.hand) expect(JSON.stringify(bob)).not.toContain(`"${c.def.id}"`);
  });

  it('when a player runs out of time mid-draft, the computer picks for them', async () => {
    const id = await newDraft();
    const first = (await getMatch('alice', id)).match.yourMove ? 'alice' : 'bob';
    const d = await getMatch(first, id);
    await api(first, 'POST', `/api/matches/${id}/moves`, { action: d.game!.legal[0], seen: 0 });
    // Now the other player is picking; the first player's next pick comes after theirs. Let the
    // first player run out of time when the decision comes back to them.
    const other = first === 'alice' ? 'bob' : 'alice';
    for (let i = 0; i < 2; i++) {
      const o = await getMatch(other, id);
      await api(other, 'POST', `/api/matches/${id}/moves`, { action: o.game!.legal[0], seen: o.match.moveCount });
    }
    await db.query(`update matches set waiting_since = waiting_since - interval '37 hours', waiting_due = waiting_due - interval '37 hours' where id = $1`, [id]);
    await settleOverdue(db);
    const after = await getMatch(other, id);
    expect(after.match.autopilot.them).toBe(true);
    expect(after.match.yourMove).toBe(true);
    // The computer made the first player's two picks in a row.
    expect(after.game!.view.draft!.picks[after.match.side === 'A' ? 'B' : 'A']).toHaveLength(3);
  });
});
