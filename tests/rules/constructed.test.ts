// RULES.md "Constructed": each team brings its own deck instead of being dealt players.
import { describe, expect, it } from 'vitest';
import { createGame, deckProblems, makeConfig, SetupError, viewFor } from '../../src/engine';
import { prototypeCards } from '../../src/data/prototype';
import { spellSets, starterSet, teamDeck, teamProblems } from '../../src/data/teams';
import { LANE_COUNTS } from '../helpers';

const config = makeConfig();
const players = prototypeCards.cards.filter((c) => c.team === 'pool');
const goalieIds = players.filter((c) => c.kind === 'goalie').map((c) => c.id);
const fieldIds = players.filter((c) => c.kind === 'field').map((c) => c.id);
const spellsOf = (team: string) => prototypeCards.cards.filter((c) => c.team === team && c.kind === 'spell').map((c) => c.id);

/** A legal deck: the first or last goalies and field players, and one team's spells. */
function deck(from: 'start' | 'end', spells = 'A'): string[] {
  const take = (ids: string[], n: number) => (from === 'start' ? ids.slice(0, n) : ids.slice(-n));
  return [...take(goalieIds, 2), ...take(fieldIds, 22), ...spellsOf(spells)];
}

describe.each(LANE_COUNTS)('constructed games (%i lanes)', (lanes) => {
  it('gives each side exactly the deck it brought, playing for its own team', () => {
    const decks = { A: deck('start'), B: deck('end', 'B') };
    const { state } = createGame({ seed: 5, cardSet: prototypeCards, config: { lanes }, decks });
    for (const side of ['A', 'B'] as const) {
      const team = state.teams[side];
      const uids = [...team.hand, ...team.players, ...team.spells];
      expect(uids.map((u) => state.cards[u]!.id).sort()).toEqual([...decks[side]].sort());
      expect(uids.every((u) => state.cards[u]!.team === side)).toBe(true);
    }
  });

  it('works when both teams bring the same cards', () => {
    const { state } = createGame({ seed: 5, cardSet: prototypeCards, config: { lanes }, decks: { A: deck('start'), B: deck('start') } });
    expect(state.pending).toEqual({ kind: 'chooseGoalie', side: 'A' });
  });

  it("hides the other team's deck", () => {
    const { state } = createGame({ seed: 5, cardSet: prototypeCards, config: { lanes }, decks: { A: deck('start'), B: deck('end') } });
    const view = viewFor(state, 'A');
    expect(JSON.stringify(view)).not.toContain(fieldIds.at(-1));
  });
});

describe('legal decks', () => {
  it('accepts 2 goalies, 22 field players, and 16 spells', () => {
    expect(deckProblems(prototypeCards, deck('start'), config)).toEqual([]);
  });

  it('counts goalies, field players, and spells', () => {
    const short = deck('start').filter((id) => id !== goalieIds[0] && id !== fieldIds[0]);
    expect(deckProblems(prototypeCards, short, config)).toEqual([
      'A team needs 2 goalies (this one has 1).',
      'A team needs 22 field players (this one has 21).',
    ]);
    expect(deckProblems(prototypeCards, deck('start').slice(0, -1), config)).toEqual(['A team needs 16 spells (this one has 15).']);
  });

  it('allows each named player only once', () => {
    const twice = [...deck('start').slice(0, 23), fieldIds[0]!, ...spellsOf('A')];
    const name = players.find((c) => c.id === fieldIds[0])!.name;
    expect(deckProblems(prototypeCards, twice, config)).toEqual([`${name} is on the team twice.`]);
  });

  it('lets spells repeat', () => {
    const spells = spellsOf('A');
    const repeated = [...deck('start').slice(0, 24), ...spells.slice(0, 15), spells[0]!];
    expect(deckProblems(prototypeCards, repeated, config)).toEqual([]);
  });

  it('refuses cards that do not exist', () => {
    expect(deckProblems(prototypeCards, [...deck('start').slice(1), 'no-such-card'], config)).toContain("There's no card no-such-card.");
  });

  it('keeps add-on cards for the center-lane add-on', () => {
    const addon = { ...prototypeCards, cards: prototypeCards.cards.map((c) => (c.id === fieldIds[0] ? { ...c, addon: true } : c)) };
    expect(deckProblems(addon, deck('start'), config)).toHaveLength(1);
    expect(deckProblems(addon, deck('start'), makeConfig({ lanes: 3 }))).toEqual([]);
  });

  it('will not start a game with an illegal deck, or with a draft', () => {
    expect(() => createGame({ seed: 1, cardSet: prototypeCards, decks: { A: deck('start').slice(1), B: deck('end') } })).toThrow(SetupError);
    expect(() => createGame({ seed: 1, cardSet: prototypeCards, config: { draftPicks: 10 }, decks: { A: deck('start'), B: deck('end') } })).toThrow(SetupError);
  });
});

describe('saved teams', () => {
  it('the starter set is a legal team', () => {
    expect(teamProblems(prototypeCards, config, starterSet.players, starterSet.spellSet)).toEqual([]);
    expect(teamDeck(prototypeCards, config, starterSet.players, starterSet.spellSet)).toHaveLength(config.deckSize);
  });

  it('offers each team in the card set as a spell set of 16', () => {
    const sets = spellSets(prototypeCards, config);
    expect(sets.map((s) => s.id)).toEqual(['A', 'B']);
    expect(sets.every((s) => s.spellIds.length === 16)).toBe(true);
  });

  it('needs a real spell set, and players only in the player list', () => {
    expect(teamProblems(prototypeCards, config, starterSet.players, 'Z')).toEqual(['Choose a spell set.']);
    expect(teamProblems(prototypeCards, config, [...starterSet.players.slice(1), spellsOf('A')[0]!], 'A'))
      .toEqual(['Spells come from the spell set, not the player list.']);
  });
});
