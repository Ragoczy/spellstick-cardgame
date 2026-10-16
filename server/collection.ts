// Owned cards and saved teams (online phase 2). See docs/spellstick-multiplayer-design.md,
// "Cards, collection, and persistent teams".
//
// Every new player gets the starter set once: 24 player cards and a ready-made team. A saved
// team is a name, a spell set (one team's spells from the card data), and 24 owned player cards.
// A team can be saved unfinished; it lists its problems and can't play until they're fixed.

import type pg from 'pg';
import { prototypeCards } from '../src/data/prototype';
import { MAX_TEAMS, TEAM_NAME_MAX, TEAM_NAME_MIN, spellSets, starterSet, teamDeck, teamProblems } from '../src/data/teams';
import { makeConfig, type CardSet, type GameConfig } from '../src/engine';
import type { CardEdition, CardSource, Collection, OwnedCard, SavedTeam } from '../src/shared/collectionApi';
import type { User } from './users';

export type { Collection, OwnedCard, SavedTeam };

/** A problem to report to the player, with the HTTP status to send. */
export class CollectionError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** The card data saved teams are built from. */
const cardSet: CardSet = prototypeCards;
/** Saved teams are checked with the base game's rules; a challenge checks again for its own field. */
const baseConfig = makeConfig();

/** Most cards a team can list (well above a full team), so a request can't be huge. */
const MAX_TEAM_CARDS = 60;

// ---- The starter set ----

/**
 * Gives the player the starter set and the starter team, the first time only. Safe to call on
 * every visit: the users row is locked, so two requests at once can't both give it out.
 */
export async function grantStarter(client: pg.PoolClient, userId: number): Promise<boolean> {
  const { rowCount } = await client.query(
    'update users set starter_granted_at = now() where id = $1 and starter_granted_at is null',
    [userId],
  );
  if (rowCount !== 1) return false;
  const instanceIds = await giveCards(client, userId, starterSet.players, 'starter');
  const { rows } = await client.query<{ id: string }>(
    'insert into teams (owner_id, name, spell_set) values ($1, $2, $3) returning id',
    [userId, starterSet.teamName, starterSet.spellSet],
  );
  await client.query('insert into team_cards (team_id, instance_id) select $1, unnest($2::bigint[])', [rows[0]!.id, instanceIds]);
  return true;
}

/**
 * Gives the player one new copy of each card listed (each card id once), with the next serial
 * number for that card, and records it in the card's history. Returns the new instance ids.
 */
export async function giveCards(client: pg.PoolClient, userId: number, cardIds: string[], source: CardSource): Promise<number[]> {
  if (new Set(cardIds).size !== cardIds.length) throw new Error('giveCards: each card id once per call.');
  // Updating player_cards locks each design's row, so serial numbers are never handed out twice.
  const { rows } = await client.query<{ id: string }>(
    `with issued as (
       update player_cards set issued = issued + 1 where id = any($2::text[]) returning id, issued
     )
     insert into card_instances (card_id, serial, owner_id, source)
     select id, issued, $1, $3 from issued
     returning id`,
    [userId, cardIds, source],
  );
  if (rows.length !== cardIds.length) throw new Error('giveCards: some cards are not in player_cards.');
  const ids = rows.map((r) => Number(r.id));
  await client.query(
    'insert into card_history (instance_id, from_user, to_user, reason) select unnest($1::bigint[]), null, $2, $3',
    [ids, userId, source],
  );
  return ids;
}

/** Gives the player one award copy of a card, with its edition. Returns the new instance id. */
export async function giveAwardCard(client: pg.PoolClient, userId: number, cardId: string, edition: CardEdition): Promise<number> {
  const [id] = await giveCards(client, userId, [cardId], 'award');
  await client.query('update card_instances set edition = $2 where id = $1', [id, JSON.stringify(edition)]);
  return id!;
}

// ---- Reading ----

export async function getCollection(db: pg.Pool | pg.PoolClient, user: User): Promise<Collection> {
  const cards = await db.query<{ id: string; card_id: string; serial: number; source: CardSource; edition: Partial<CardEdition> }>(
    'select id, card_id, serial, source, edition from card_instances where owner_id = $1 order by card_id, serial',
    [user.id],
  );
  return {
    cards: cards.rows.map((r) => ({
      instanceId: Number(r.id), cardId: r.card_id, serial: r.serial, source: r.source,
      // Ordinary cards have an empty edition.
      edition: r.edition.label ? (r.edition as CardEdition) : null,
    })),
    teams: await listTeams(db, user.id),
    maxTeams: MAX_TEAMS,
  };
}

interface TeamRow {
  id: string;
  name: string;
  spell_set: string;
  /** Each card on the team: instance id, card id, and whether the team's owner still owns it. */
  cards: { instance: number; card: string; owned: boolean }[];
  won: number;
  lost: number;
  drawn: number;
}

async function listTeams(db: pg.Pool | pg.PoolClient, userId: number, teamId?: number): Promise<SavedTeam[]> {
  const { rows } = await db.query<TeamRow>(
    `select t.id, t.name, t.spell_set,
       coalesce((select json_agg(json_build_object('instance', ci.id, 'card', ci.card_id, 'owned', ci.owner_id = t.owner_id) order by ci.card_id)
                 from team_cards tc join card_instances ci on ci.id = tc.instance_id
                 where tc.team_id = t.id), '[]') as cards,
       (select count(*) filter (where m.winner = t.owner_id) from matches m
         where (m.team_a = t.id or m.team_b = t.id) and m.status = 'finished')::int as won,
       (select count(*) filter (where m.winner <> t.owner_id) from matches m
         where (m.team_a = t.id or m.team_b = t.id) and m.status = 'finished')::int as lost,
       (select count(*) filter (where m.winner is null) from matches m
         where (m.team_a = t.id or m.team_b = t.id) and m.status = 'finished')::int as drawn
     from teams t
     where t.owner_id = $1 and ($2::bigint is null or t.id = $2)
     order by t.created_at, t.id`,
    [userId, teamId ?? null],
  );
  return rows.map(toTeam);
}

function toTeam(row: TeamRow): SavedTeam {
  const problems: string[] = [];
  if (row.cards.some((c) => !c.owned)) problems.push("Some cards on this team aren't yours any more.");
  problems.push(...teamProblems(cardSet, baseConfig, row.cards.map((c) => c.card), row.spell_set));
  return {
    id: Number(row.id),
    name: row.name,
    spellSet: row.spell_set,
    cards: row.cards.map((c) => Number(c.instance)),
    problems,
    record: { won: row.won, lost: row.lost, drawn: row.drawn },
  };
}

/**
 * A team ready for a constructed match on this field, or the reason it can't play. The deck is
 * card ids for GameSetup.decks; the team's cards are copied into the match, so changing the
 * team later doesn't change the match.
 */
export async function teamForMatch(
  db: pg.Pool | pg.PoolClient, userId: number, teamId: unknown, config: GameConfig,
): Promise<{ ok: true; id: number; name: string; deck: string[] } | { ok: false; problem: string }> {
  const id = Number(teamId);
  if (!Number.isSafeInteger(id) || id < 1) return { ok: false, problem: 'Choose one of your teams.' };
  const [team] = await listTeams(db, userId, id);
  if (!team) return { ok: false, problem: 'Choose one of your teams.' };
  const { rows } = await db.query<{ card_id: string }>(
    'select ci.card_id from team_cards tc join card_instances ci on ci.id = tc.instance_id where tc.team_id = $1 and ci.owner_id = $2',
    [id, userId],
  );
  const playerIds = rows.map((r) => r.card_id);
  const problems = team.problems.length ? team.problems : teamProblems(cardSet, config, playerIds, team.spellSet);
  if (problems.length) return { ok: false, problem: `${team.name} can't play yet. ${problems[0]}` };
  return { ok: true, id, name: team.name, deck: teamDeck(cardSet, config, playerIds, team.spellSet) };
}

// ---- Saving ----

/** Tidies spacing, so "  The  Hexes " becomes "The Hexes". */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Checks what the player sent and returns it tidied, or throws a CollectionError saying what's wrong. */
async function checkTeamInput(
  client: pg.PoolClient, user: User, input: { name?: unknown; spellSet?: unknown; cards?: unknown },
): Promise<{ name: string; spellSet: string; cards: number[] }> {
  if (typeof input.name !== 'string') throw new CollectionError(400, 'Give the team a name.');
  const name = normalizeName(input.name);
  if (name.length < TEAM_NAME_MIN || name.length > TEAM_NAME_MAX) {
    throw new CollectionError(400, `Team names are ${TEAM_NAME_MIN} to ${TEAM_NAME_MAX} characters long.`);
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '.&-]*$/u.test(name)) {
    throw new CollectionError(400, 'Use letters, numbers, spaces, and \' . & - only, starting with a letter or number.');
  }
  if (typeof input.spellSet !== 'string' || !spellSets(cardSet, baseConfig).some((s) => s.id === input.spellSet)) {
    throw new CollectionError(400, 'Choose a spell set.');
  }
  const cards = input.cards;
  if (!Array.isArray(cards) || cards.length > MAX_TEAM_CARDS || !cards.every((id) => Number.isSafeInteger(id) && id > 0)) {
    throw new CollectionError(400, 'Choose the cards for the team.');
  }
  const unique = [...new Set(cards as number[])];
  const { rows } = await client.query<{ n: number }>(
    'select count(*)::int as n from card_instances where id = any($1::bigint[]) and owner_id = $2',
    [unique, user.id],
  );
  if (rows[0]!.n !== unique.length) throw new CollectionError(400, "Some of those cards aren't yours.");
  return { name, spellSet: input.spellSet, cards: unique };
}

async function saveCards(client: pg.PoolClient, teamId: number, cards: number[]): Promise<void> {
  await client.query('delete from team_cards where team_id = $1', [teamId]);
  await client.query('insert into team_cards (team_id, instance_id) select $1, unnest($2::bigint[])', [teamId, cards]);
}

/** Runs a save, turning "you already have a team called that" into a plain answer. */
async function withNameCheck<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new CollectionError(409, 'You already have a team with that name.');
    throw err;
  }
}

export async function createTeam(client: pg.PoolClient, user: User, input: { name?: unknown; spellSet?: unknown; cards?: unknown }): Promise<SavedTeam> {
  // Lock the player's row so two saves at once can't go over the limit.
  await client.query('select id from users where id = $1 for update', [user.id]);
  const { rows } = await client.query<{ n: number }>('select count(*)::int as n from teams where owner_id = $1', [user.id]);
  if (rows[0]!.n >= MAX_TEAMS) throw new CollectionError(409, `You can save up to ${MAX_TEAMS} teams. Delete one first.`);
  const team = await checkTeamInput(client, user, input);
  const inserted = await withNameCheck(() => client.query<{ id: string }>(
    'insert into teams (owner_id, name, spell_set) values ($1, $2, $3) returning id',
    [user.id, team.name, team.spellSet],
  ));
  const id = Number(inserted.rows[0]!.id);
  await saveCards(client, id, team.cards);
  return (await listTeams(client, user.id, id))[0]!;
}

export async function updateTeam(client: pg.PoolClient, user: User, teamId: number, input: { name?: unknown; spellSet?: unknown; cards?: unknown }): Promise<SavedTeam> {
  const { rows } = await client.query('select id from teams where id = $1 and owner_id = $2 for update', [teamId, user.id]);
  if (!rows.length) throw new CollectionError(404, 'No such team.');
  const team = await checkTeamInput(client, user, input);
  await withNameCheck(() => client.query(
    'update teams set name = $3, spell_set = $4, updated_at = now() where id = $1 and owner_id = $2',
    [teamId, user.id, team.name, team.spellSet],
  ));
  await saveCards(client, teamId, team.cards);
  return (await listTeams(client, user.id, teamId))[0]!;
}

/** Deletes a saved team. The cards stay in the collection, and finished matches keep their record. */
export async function deleteTeam(client: pg.PoolClient, user: User, teamId: number): Promise<void> {
  const { rowCount } = await client.query('delete from teams where id = $1 and owner_id = $2', [teamId, user.id]);
  if (rowCount !== 1) throw new CollectionError(404, 'No such team.');
}

/** Unlinking: the player's teams and cards go. Cards they once owned keep their history, without them in it. */
export async function deleteCollection(client: pg.PoolClient, userId: number): Promise<void> {
  await client.query('delete from teams where owner_id = $1', [userId]);
  await client.query('delete from card_instances where owner_id = $1', [userId]);
  await client.query('update card_history set from_user = null where from_user = $1', [userId]);
  await client.query('update card_history set to_user = null where to_user = $1', [userId]);
}
