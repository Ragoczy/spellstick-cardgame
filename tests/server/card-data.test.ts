// Loading the named player cards and name lists from data/ into the database (server/cardData.ts).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { loadPlayerCards, nameLists, splitName } from '../../server/cardData';
import { POOL_TEAM, type FieldCardDef } from '../../src/engine/cards';
import { prototypeCards } from '../../src/data/prototype';
import { databaseAvailable, testDatabase } from './helpers';

describe('splitName', () => {
  it('splits at the first space, so compound surnames stay whole', () => {
    expect(splitName('Adelaide Carrington-Blair')).toEqual({ given: 'Adelaide', surname: 'Carrington-Blair' });
    expect(() => splitName('Adelaide')).toThrow();
  });
});

const haveDb = await databaseAvailable();

describe.skipIf(!haveDb)('loading player cards into the database', () => {
  let db: pg.Pool;
  let drop: () => Promise<void>;
  const players = prototypeCards.cards.filter((c) => c.team === POOL_TEAM);

  beforeAll(async () => {
    ({ db, drop } = await testDatabase());
    await loadPlayerCards(db);
  });
  afterAll(async () => {
    await drop?.();
  });

  it('stores 100 given names and 40 surnames, with compound surnames pointing at their parts', async () => {
    const given = await db.query('select count(*)::int as n from given_names');
    expect(given.rows[0].n).toBe(100);
    const surnames = await db.query<{ name: string; first: string | null; second: string | null }>(
      `select s.name, a.name as first, b.name as second from surnames s
         left join surnames a on a.id = s.first_part_id left join surnames b on b.id = s.second_part_id`,
    );
    expect(surnames.rows).toHaveLength(40);
    expect(surnames.rows.find((r) => r.name === 'Carrington-Blair')).toMatchObject({ first: 'Carrington', second: 'Blair' });
    expect(surnames.rows.filter((r) => r.first !== null)).toHaveLength(nameLists.compoundSurnames.length);
  });

  it('stores every named player with their names, stats, and Resonants', async () => {
    const { rows } = await db.query(
      `select p.*, g.name as given, s.name as surname from player_cards p
         join given_names g on g.id = p.given_name_id join surnames s on s.id = p.surname_id order by p.id`,
    );
    expect(rows).toHaveLength(players.length);
    const card = players.find((c) => c.kind === 'field') as FieldCardDef;
    const row = rows.find((r) => r.id === card.id);
    expect(`${row.given} ${row.surname}`).toBe(card.name);
    expect(row).toMatchObject({
      kind: 'field', role: card.role, speed: card.speed, shot: card.shot, defense: card.defense, faceoff: card.faceoff,
      save: null, bonus_points: card.bonusPoints, resonants: card.resonants, card_set_version: prototypeCards.version,
    });
    expect(rows.filter((r) => r.kind === 'goalie').every((r) => r.save !== null && r.speed === null)).toBe(true);
  });

  it('can run again, and updates players whose card data changed', async () => {
    const changed = {
      ...prototypeCards,
      cards: prototypeCards.cards.map((c) => (c.id === 'pl-001' && c.kind === 'field' ? { ...c, speed: 1 } : c)),
    };
    await loadPlayerCards(db, changed);
    const { rows } = await db.query('select speed from player_cards where id = $1', ['pl-001']);
    expect(rows[0].speed).toBe(1);
    expect((await db.query('select count(*)::int as n from player_cards')).rows[0].n).toBe(players.length);
    expect((await db.query('select count(*)::int as n from given_names')).rows[0].n).toBe(100);
  });

  it("refuses a player whose name isn't in the name lists, and changes nothing", async () => {
    const bad = {
      ...prototypeCards,
      cards: prototypeCards.cards.map((c) => (c.id === 'pl-002' ? { ...c, name: 'Nobody Special' } : c)),
    };
    await expect(loadPlayerCards(db, bad)).rejects.toThrow(/pl-002/);
    const { rows } = await db.query('select speed from player_cards where id = $1', ['pl-001']);
    expect(rows[0].speed).toBe(1);
  });
});
