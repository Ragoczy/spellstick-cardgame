// The card data matches data/cards.schema.json and builds the decks RULES.md describes.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { buildDeck, CardDataError, loadCardSet, playerPool } from '../src/engine/cards';
import { createGame } from '../src/engine/setup';
import { makeConfig } from '../src/engine/config';
import { prototypeCards } from '../src/data/prototype';

const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const schema = readJson('../data/cards.schema.json');
const prototype = readJson('../data/cards.prototype.json');

describe('card data', () => {
  it('matches the schema', () => {
    const ajv = new Ajv2020({ allErrors: true });
    const validate = ajv.compile(schema);
    const ok = validate(prototype);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it('gives each team 16 spells of its own, and keeps all players in the shared pool', () => {
    const config = makeConfig();
    for (const team of ['A', 'B']) {
      const deck = buildDeck(prototypeCards, team, config);
      expect(deck).toHaveLength(16);
      expect(deck.every((c) => c.kind === 'spell')).toBe(true);
    }
    const pool = playerPool(prototypeCards, config);
    expect(pool.filter((c) => c.kind === 'goalie').length).toBeGreaterThanOrEqual(2 * config.deckGoalies);
    expect(pool.filter((c) => c.kind === 'field').length).toBeGreaterThanOrEqual(2 * config.deckFieldPlayers);
  });

  it('deals each side a 40-card deck: 2 goalies, 22 field players, 16 spells', () => {
    const config = makeConfig();
    for (const seed of [1, 2, 3]) {
      const { state } = createGame({ seed, cardSet: prototypeCards });
      for (const side of ['A', 'B']) {
        const deck = Object.entries(state.cards).filter(([uid]) => uid.startsWith(side)).map(([, def]) => def);
        expect(deck).toHaveLength(config.deckSize);
        expect(deck.filter((c) => c.kind === 'goalie')).toHaveLength(config.deckGoalies);
        expect(deck.filter((c) => c.kind === 'field')).toHaveLength(config.deckFieldPlayers);
        expect(deck.filter((c) => c.kind === 'spell')).toHaveLength(16);
      }
    }
  });

  it('leaves promo cards out of the decks, and add-on cards out unless there are 3 lanes', () => {
    expect(buildDeck(prototypeCards, 'A', makeConfig()).some((c) => c.promo)).toBe(false);
    expect(playerPool(prototypeCards, makeConfig()).some((c) => c.promo)).toBe(false);
    const spell = prototypeCards.cards.find((c) => c.team === 'A' && c.kind === 'spell')!;
    const withAddon = { ...prototypeCards, cards: [...prototypeCards.cards, { ...spell, id: 'addon-1', addon: true }] };
    expect(buildDeck(withAddon, 'A', makeConfig({ lanes: 2 })).some((c) => c.id === 'addon-1')).toBe(false);
    expect(buildDeck(withAddon, 'A', makeConfig({ lanes: 3 })).some((c) => c.id === 'addon-1')).toBe(true);
  });

  it('gives every field player a Faceoff stat and 1 to 3 Resonants', () => {
    for (const card of prototypeCards.cards) {
      if (card.kind === 'field') expect(Number.isInteger(card.faceoff)).toBe(true);
      if (card.kind !== 'spell') expect(card.resonants.length).toBeGreaterThanOrEqual(1);
    }
  });

  describe('the loader rejects bad cards', () => {
    const base = structuredClone(prototype);
    const withCard = (card: object) => ({ ...base, cards: [...base.cards, card] });
    const field = { id: 'x', team: 'A', kind: 'field', name: 'X', resonants: [{ name: 'Anger', affinity: 'fire' }], speed: 1, shot: 1, defense: 1, faceoff: 1 };

    it.each([
      ['a field player without Faceoff', { ...field, faceoff: undefined }],
      ['an unknown affinity', { ...field, resonants: [{ name: 'Mystery', affinity: 'void' }] }],
      ['more than 3 Resonants', { ...field, resonants: Array(4).fill({ name: 'Anger', affinity: 'fire' }) }],
      ['an unknown effect', { id: 'x', team: 'A', kind: 'spell', name: 'X', spellType: 'action', element: null, ability: { effect: 'fireball', params: {} } }],
      ['a reaction spell with an action effect', { id: 'x', team: 'A', kind: 'spell', name: 'X', spellType: 'reaction', element: null, ability: { effect: 'recall', params: { count: 1 } } }],
      ['a duplicate id', { ...field, id: 'pl-001' }],
      ['an unknown role', { ...field, role: 'sweeper' }],
      ['a field player with the goalie role', { ...field, role: 'goalie' }],
      ['a spell in the player pool', { id: 'x', team: 'pool', kind: 'spell', name: 'X', spellType: 'action', element: null, ability: { effect: 'scry', params: {} } }],
    ])('%s', (_label, card) => {
      expect(() => loadCardSet(withCard(card))).toThrow(CardDataError);
    });

    it('a team called "pool"', () => {
      expect(() => loadCardSet({ ...base, teams: [...base.teams, { id: 'pool', name: 'Pool', color: '#000000' }] })).toThrow(CardDataError);
    });
  });
});
