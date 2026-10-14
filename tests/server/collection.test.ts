// Owned cards, saved teams, and constructed matches (online phase 2), against a real (test)
// database.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { Collection, SavedTeam } from '../../src/shared/collectionApi';
import type { MatchDetail, MatchSummary } from '../../src/shared/matchApi';
import { MAX_TEAMS, starterSet } from '../../src/data/teams';
import { prototypeCards } from '../../src/data/prototype';
import { buildApp } from '../../server/app';
import { loadPlayerCards } from '../../server/cardData';
import { unlinkAccount } from '../../server/unlink';
import { PLAYERS_ROLE, databaseAvailable, fakeDiscord, person, signIn, testConfig, testDatabase } from './helpers';

const haveDb = await databaseAvailable();

describe.skipIf(!haveDb)('collections and saved teams', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cookies: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const people = { alice: ['111', 'Alice Hexes'], bob: ['222', 'Bob Wands'], carol: ['333', 'Carol Charms'], dave: ['444', 'Dave Duels'] } as const;
  const discord = fakeDiscord(Object.fromEntries(Object.entries(people).map(([who, [id]]) => [who, person(id, who, [PLAYERS_ROLE])])));

  type Who = keyof typeof people;
  const api = (who: Who, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, cookies: { spellstick_session: cookies[who]! }, ...(payload ? { payload } : {}) });
  const collection = async (who: Who) => (await api(who, 'GET', '/api/collection')).json<Collection>();
  const starterTeam = async (who: Who) => (await collection(who)).teams[0]!;

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    await loadPlayerCards(db);
    app = await buildApp({ config: testConfig(), db, discord });
    for (const [who, [, name]] of Object.entries(people) as [Who, readonly [string, string]][]) {
      cookies[who] = (await signIn(app, who)).cookie!;
      await api(who, 'POST', '/api/me/name', { name });
      ids[who] = Number((await db.query('select id from users where discord_username = $1', [who])).rows[0].id);
    }
  });

  afterAll(async () => {
    await app.close();
    await drop();
  });

  it('needs a signed-in player', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/collection' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/teams', payload: {} })).statusCode).toBe(401);
  });

  it('gives each player the starter set and a ready team on their first visit, once', async () => {
    const [first, again] = await Promise.all([collection('alice'), collection('alice')]);
    const mine = await collection('alice');
    for (const c of [first, again, mine]) expect(c.cards.map((x) => x.cardId).sort()).toEqual([...starterSet.players].sort());
    expect(mine.cards.every((c) => c.source === 'starter')).toBe(true);
    expect(mine.teams).toHaveLength(1);
    const team = mine.teams[0]!;
    expect(team).toMatchObject({ name: starterSet.teamName, spellSet: starterSet.spellSet, problems: [], record: { won: 0, lost: 0, drawn: 0 } });
    expect([...team.cards].sort()).toEqual(mine.cards.map((c) => c.instanceId).sort());
    expect(mine.maxTeams).toBe(MAX_TEAMS);

    // Every card's history starts with the game giving it out.
    const { rows } = await db.query(
      `select h.from_user, h.to_user, h.reason from card_history h join card_instances ci on ci.id = h.instance_id where ci.owner_id = $1`,
      [ids.alice],
    );
    expect(rows).toHaveLength(starterSet.players.length);
    expect(rows.every((r) => r.from_user === null && Number(r.to_user) === ids.alice && r.reason === 'starter')).toBe(true);
  });

  it('numbers each copy of a card in the order they were given out', async () => {
    const alice = await collection('alice');
    const bob = await collection('bob');
    expect(alice.cards.every((c) => c.serial === 1)).toBe(true);
    expect(bob.cards.every((c) => c.serial === 2)).toBe(true);
  });

  it('saves a new team, unfinished teams included, and lists what it still needs', async () => {
    const mine = await collection('carol');
    const players = mine.cards.map((c) => c.instanceId);
    const res = await api('carol', 'POST', '/api/teams', { name: '  The   Owls ', spellSet: 'B', cards: players.slice(0, 20) });
    expect(res.statusCode).toBe(201);
    const team = res.json<SavedTeam>();
    expect(team.name).toBe('The Owls');
    expect(team.spellSet).toBe('B');
    expect(team.problems.length).toBeGreaterThan(0);

    const fixed = await api('carol', 'POST', `/api/teams/${team.id}`, { name: 'The Owls', spellSet: 'B', cards: players });
    expect(fixed.json<SavedTeam>().problems).toEqual([]);
    expect((await collection('carol')).teams.map((t) => t.name)).toEqual([starterSet.teamName, 'The Owls']);
  });

  it('refuses bad team details in plain words', async () => {
    const carol = (await collection('carol')).cards.map((c) => c.instanceId);
    const alice = (await collection('alice')).cards.map((c) => c.instanceId);
    const save = (payload: object) => api('carol', 'POST', '/api/teams', payload);
    expect((await save({ name: 'X', spellSet: 'A', cards: carol })).json().error).toMatch(/3 to 30 characters/);
    expect((await save({ name: 'Good name', spellSet: 'Z', cards: carol })).json().error).toBe('Choose a spell set.');
    expect((await save({ name: 'Good name', spellSet: 'A', cards: 'all' })).json().error).toBe('Choose the cards for the team.');
    const stolen = await save({ name: 'Good name', spellSet: 'A', cards: [...carol.slice(1), alice[0]] });
    expect(stolen.statusCode).toBe(400);
    expect(stolen.json().error).toBe("Some of those cards aren't yours.");
    const twice = await save({ name: 'the owls', spellSet: 'A', cards: carol });
    expect(twice.statusCode).toBe(409);
    expect(twice.json().error).toBe('You already have a team with that name.');
  });

  it(`saves at most ${MAX_TEAMS} teams`, async () => {
    const cards = (await collection('dave')).cards.map((c) => c.instanceId);
    for (let i = 2; i <= MAX_TEAMS; i++) {
      expect((await api('dave', 'POST', '/api/teams', { name: `Team ${i}`, spellSet: 'A', cards })).statusCode).toBe(201);
    }
    const tooMany = await api('dave', 'POST', '/api/teams', { name: 'One more', spellSet: 'A', cards });
    expect(tooMany.statusCode).toBe(409);
  });

  it("deletes a team but keeps its cards, and can't touch someone else's team", async () => {
    const dave = await collection('dave');
    const last = dave.teams.at(-1)!;
    expect((await api('alice', 'POST', `/api/teams/${last.id}/delete`)).statusCode).toBe(404);
    expect((await api('alice', 'POST', `/api/teams/${last.id}`, { name: 'Mine now', spellSet: 'A', cards: [] })).statusCode).toBe(404);
    expect((await api('dave', 'POST', `/api/teams/${last.id}/delete`)).statusCode).toBe(200);
    const after = await collection('dave');
    expect(after.teams).toHaveLength(dave.teams.length - 1);
    expect(after.cards).toHaveLength(dave.cards.length);
  });

  describe('constructed matches', () => {
    const challenge = async (from: Who, to: Who, teamId: number, extra: object = {}) =>
      api(from, 'POST', '/api/matches', { opponentId: ids[to], lanes: 2, players: 'constructed', teamId, ...extra });
    const getMatch = async (who: Who, id: number) => (await api(who, 'GET', `/api/matches/${id}`)).json<MatchDetail>();

    it('each player brings a saved team, and it counts toward the team record', async () => {
      const aliceTeam = await starterTeam('alice');
      const sent = await challenge('alice', 'bob', aliceTeam.id);
      expect(sent.statusCode).toBe(201);
      const match = sent.json<MatchSummary>();
      expect(match).toMatchObject({ constructed: true, draft: false, ranked: false, teamName: starterSet.teamName, opponentTeamName: null });

      // Bob sees whose team is coming, and has to pick one of his own to accept.
      const bobSees = (await api('bob', 'GET', '/api/matches')).json<MatchSummary[]>().find((m) => m.id === match.id)!;
      expect(bobSees).toMatchObject({ constructed: true, teamName: null, opponentTeamName: starterSet.teamName });
      expect((await api('bob', 'POST', `/api/matches/${match.id}/accept`)).json().error).toBe('Choose one of your teams.');
      expect((await api('bob', 'POST', `/api/matches/${match.id}/accept`, { teamId: aliceTeam.id })).json().error).toBe('Choose one of your teams.');

      const bobTeam = await starterTeam('bob');
      await api('bob', 'POST', `/api/teams/${bobTeam.id}`, { name: 'Wand Wavers', spellSet: 'B', cards: bobTeam.cards });
      const accepted = await api('bob', 'POST', `/api/matches/${match.id}/accept`, { teamId: bobTeam.id });
      expect(accepted.statusCode).toBe(200);
      const bob = accepted.json<MatchDetail>();
      expect(bob.match).toMatchObject({ status: 'active', teamName: 'Wand Wavers', opponentTeamName: starterSet.teamName });
      expect(bob.game!.view.pending.kind).toBe('chooseGoalie');

      // Each side plays with the cards it brought: Alice's goalies are her starter goalies.
      const alice = await getMatch('alice', match.id);
      const goalieIds = starterSet.players.filter((id) => id === 'pl-091' || id === 'pl-092');
      expect(alice.game!.view.mine.hand.map((c) => c.def.id).sort()).toEqual(goalieIds);
      // Bob's spells are set B's.
      const { rows } = await db.query('select setup, team_a, team_b, format from matches where id = $1', [match.id]);
      expect(rows[0].format).toBe('constructed');
      expect(rows[0].setup.decks.B.slice(-16)).toEqual(prototypeCards.teams.find((t) => t.id === 'B')!.spells);
      expect([Number(rows[0].team_a), Number(rows[0].team_b)]).toEqual([aliceTeam.id, bobTeam.id]);

      // Changing a team afterwards doesn't change the match.
      await api('bob', 'POST', `/api/teams/${bobTeam.id}`, { name: 'Wand Wavers', spellSet: 'A', cards: bobTeam.cards });
      expect((await db.query('select setup from matches where id = $1', [match.id])).rows[0].setup.decks.B).toEqual(rows[0].setup.decks.B);

      await api('bob', 'POST', `/api/matches/${match.id}/resign`);
      expect((await starterTeam('alice')).record).toEqual({ won: 1, lost: 0, drawn: 0 });
      expect((await starterTeam('bob')).record).toEqual({ won: 0, lost: 1, drawn: 0 });
    });

    it("can't use a team that isn't ready, or someone else's, and can't be ranked", async () => {
      const carol = await collection('carol');
      const unfinished = await api('carol', 'POST', '/api/teams', { name: 'Half a team', spellSet: 'A', cards: carol.cards.slice(0, 10).map((c) => c.instanceId) });
      const res = await challenge('carol', 'alice', unfinished.json<SavedTeam>().id);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/^Half a team can't play yet\. A team needs/);
      expect((await challenge('carol', 'alice', (await starterTeam('alice')).id)).json().error).toBe('Choose one of your teams.');
      expect((await challenge('carol', 'alice', carol.teams[0]!.id, { ranked: true })).json().error).toMatch(/Ranked matches use a draft/);
    });
  });

  it('unlinking deletes the player\'s cards and teams', async () => {
    await collection('dave');
    await unlinkAccount(db, ids.dave!);
    const cards = await db.query('select count(*)::int as n from card_instances where owner_id = $1', [ids.dave]);
    const teams = await db.query('select count(*)::int as n from teams where owner_id = $1', [ids.dave]);
    const history = await db.query('select count(*)::int as n from card_history where to_user = $1 or from_user = $1', [ids.dave]);
    expect([cards.rows[0].n, teams.rows[0].n, history.rows[0].n]).toEqual([0, 0, 0]);
  });
});
