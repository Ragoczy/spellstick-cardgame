// Copies the named player cards and the name lists from the card data into the database.
//
// The JSON in data/ is the master copy. This runs every time the server starts, after the
// migrations, and is safe to run again: rows are added or updated, never deleted. A player
// removed from the JSON keeps their row, because owned cards will point at it.

import type pg from 'pg';
import rawNames from '../data/names.json';
import { POOL_TEAM, type CardSet, type PlayerCardDef } from '../src/engine/cards';
import { prototypeCards } from '../src/data/prototype';

export interface NameLists {
  givenNames: string[];
  surnames: string[];
  compoundSurnames: [string, string][];
}

export const nameLists = rawNames as unknown as NameLists;

/** Splits "Adelaide Carrington-Blair" into its given name and surname. */
export function splitName(name: string): { given: string; surname: string } {
  const space = name.indexOf(' ');
  if (space < 0) throw new Error(`Player name "${name}" needs a given name and a surname.`);
  return { given: name.slice(0, space), surname: name.slice(space + 1) };
}

export async function loadPlayerCards(db: pg.Pool, cardSet: CardSet = prototypeCards, names: NameLists = nameLists): Promise<number> {
  const players = cardSet.cards.filter((c): c is PlayerCardDef => c.team === POOL_TEAM && c.kind !== 'spell');
  const client = await db.connect();
  try {
    await client.query('begin');

    await client.query('insert into given_names (name) select unnest($1::text[]) on conflict (name) do nothing', [names.givenNames]);
    await client.query('insert into surnames (name) select unnest($1::text[]) on conflict (name) do nothing', [names.surnames]);
    for (const [first, second] of names.compoundSurnames) {
      await client.query(
        `insert into surnames (name, first_part_id, second_part_id)
         values ($1, (select id from surnames where name = $2), (select id from surnames where name = $3))
         on conflict (name) do update set first_part_id = excluded.first_part_id, second_part_id = excluded.second_part_id`,
        [`${first}-${second}`, first, second],
      );
    }

    for (const p of players) {
      const { given, surname } = splitName(p.name);
      const field = p.kind === 'field' ? p : null;
      const result = await client.query(
        `insert into player_cards (id, given_name_id, surname_id, kind, role, speed, shot, defense, faceoff, save, bonus_points, resonants, card_set_version)
         select $1, g.id, s.id, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
           from given_names g, surnames s where g.name = $2 and s.name = $3
         on conflict (id) do update set
           given_name_id = excluded.given_name_id, surname_id = excluded.surname_id, kind = excluded.kind, role = excluded.role,
           speed = excluded.speed, shot = excluded.shot, defense = excluded.defense, faceoff = excluded.faceoff, save = excluded.save,
           bonus_points = excluded.bonus_points, resonants = excluded.resonants, card_set_version = excluded.card_set_version,
           updated_at = now()`,
        [
          p.id, given, surname, p.kind, p.role ?? (p.kind === 'goalie' ? 'goalie' : 'allrounder'),
          field?.speed ?? null, field?.shot ?? null, field?.defense ?? null, field?.faceoff ?? null,
          p.kind === 'goalie' ? p.save : null,
          p.bonusPoints ?? 0, JSON.stringify(p.resonants), cardSet.version,
        ],
      );
      if (result.rowCount !== 1) throw new Error(`Player ${p.id} (${p.name}): the given name or surname isn't in data/names.json.`);
    }

    await client.query('commit');
    return players.length;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
