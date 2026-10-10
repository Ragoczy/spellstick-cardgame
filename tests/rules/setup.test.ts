// RULES.md "Setup".
import { describe, expect, it } from 'vitest';
import { legalActions } from '../../src/engine/legal';
import { applyAction, IllegalActionError } from '../../src/engine/reducer';
import { createGame } from '../../src/engine/setup';
import { randomInt, seedToState, shuffle } from '../../src/engine/rng';
import { viewFor } from '../../src/engine/view';
import type { CardSet } from '../../src/engine/cards';
import type { GameState } from '../../src/engine/state';
import { prototypeCards } from '../../src/data/prototype';
import { ELEMENTS, LANE_COUNTS, OPPOSED, actionSpell, goalie, player, play } from '../helpers';

function chooseFirstGoalie(state: GameState): GameState {
  const side = (state.pending as { side: 'A' | 'B' }).side;
  return applyAction(state, { type: 'chooseGoalie', side, card: state.teams[side].hand[0]! }).state;
}

/** Fills the lineup with the first legal placement each time. */
function placeAll(state: GameState): GameState {
  let s = state;
  while (s.pending.kind === 'placeLineup') {
    s = applyAction(s, legalActions(s, s.pending.side)[0]!).state;
  }
  return s;
}

describe.each(LANE_COUNTS)('setup (%i lanes)', (lanes) => {
  const spots = 3 * lanes;

  it('picks the first player from the seed, the same way every time', () => {
    const firsts = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => createGame({ seed, cardSet: prototypeCards, config: { lanes } }).state.firstSide);
    expect(new Set(firsts)).toEqual(new Set(['A', 'B']));
    expect(createGame({ seed: 3, cardSet: prototypeCards, config: { lanes } }).state.firstSide).toBe(firsts[2]);
  });

  it('starts with each player choosing one of their two goalies', () => {
    const { state } = createGame({ seed: 1, cardSet: prototypeCards, config: { lanes } });
    expect(state.pending).toEqual({ kind: 'chooseGoalie', side: 'A' });
    expect(state.teams.A.hand.map((u) => state.cards[u]!.kind)).toEqual(['goalie', 'goalie']);
  });

  it('puts the chosen goalie face down in goal and shuffles the other into the Players pile', () => {
    const { state } = createGame({ seed: 1, cardSet: prototypeCards, config: { lanes } });
    const [chosen, other] = state.teams.A.hand;
    const s = applyAction(state, { type: 'chooseGoalie', side: 'A', card: chosen! }).state;
    expect(s.teams.A.goalie).toEqual({ uid: chosen, revealed: false, scried: false });
    expect([...s.teams.A.players, ...s.teams.A.hand]).toContain(other);
    expect(s.teams.A.players.length + s.teams.A.spells.length + s.teams.A.hand.length).toBe(39);
    expect(s.teams.A.players.every((u) => s.cards[u]!.kind !== 'spell')).toBe(true);
    expect(s.teams.A.spells.every((u) => s.cards[u]!.kind === 'spell')).toBe(true);
  });

  it(`draws ${spots} + 2 players and 2 spells`, () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = chooseFirstGoalie(createGame({ seed, cardSet: prototypeCards, config: { lanes } }).state);
      const hand = s.teams.A.hand.map((u) => s.cards[u]!.kind);
      expect(hand).toHaveLength(spots + 4);
      expect(hand.filter((k) => k === 'spell')).toHaveLength(2);
      // At most one of the players drawn is the spare goalie, so every spot can be filled.
      expect(hand.filter((k) => k === 'field').length).toBeGreaterThanOrEqual(spots);
    }
  });

  it('places field players face down, one per spot, keeping the rest as the hand', () => {
    let s = chooseFirstGoalie(chooseFirstGoalie(createGame({ seed: 2, cardSet: prototypeCards, config: { lanes } }).state));
    const handBefore = s.teams.A.hand.length;
    expect(s.pending).toEqual({ kind: 'placeLineup', side: 'A' });
    s = placeAll(s);
    for (const side of ['A', 'B'] as const) {
      const slots = Object.values(s.teams[side].lineup).flat();
      expect(slots).toHaveLength(spots);
      expect(slots.every((slot) => slot && !slot.revealed)).toBe(true);
    }
    expect(s.teams.A.hand.length).toBe(handBefore - spots);
  });

  it("rejects placing a spell, or placing into a filled spot", () => {
    const s = chooseFirstGoalie(chooseFirstGoalie(createGame({ seed: 2, cardSet: prototypeCards, config: { lanes } }).state));
    const spell = s.teams.A.hand.find((u) => s.cards[u]!.kind === 'spell');
    if (spell) {
      expect(() => applyAction(s, { type: 'place', side: 'A', card: spell, pos: { area: 'defense', lane: 0 } })).toThrow(IllegalActionError);
    }
    const [p1, p2] = s.teams.A.hand.filter((u) => s.cards[u]!.kind === 'field');
    const { state } = play(s, { type: 'place', side: 'A', card: p1!, pos: { area: 'defense', lane: 0 } });
    expect(() => applyAction(state, { type: 'place', side: 'A', card: p2!, pos: { area: 'defense', lane: 0 } })).toThrow(IllegalActionError);
  });

  it('lets you look at your own face-down cards but not your opponent\'s', () => {
    const s = placeAll(chooseFirstGoalie(chooseFirstGoalie(createGame({ seed: 2, cardSet: prototypeCards, config: { lanes } }).state)));
    const view = viewFor(s, 'A');
    expect(view.mine.lineup.defense[0]!.state).toBe('faceDown');
    expect(view.mine.goalie.state).toBe('faceDown');
    expect(view.opponent.lineup.defense[0]!.state).toBe('unknown');
    expect(view.opponent.goalie.state).toBe('unknown');
  });

  it('starts with a faceoff where the second player chooses the lane, then the first player takes turn 1', () => {
    let s = placeAll(chooseFirstGoalie(chooseFirstGoalie(createGame({ seed: 2, cardSet: prototypeCards, config: { lanes } }).state)));
    const second = s.firstSide === 'A' ? 'B' : 'A';
    expect(s.pending).toEqual({ kind: 'faceoffLane', side: second });
    expect(s.ball).toBeNull();
    s = applyAction(s, { type: 'faceoffLane', side: second, lane: lanes - 1 }).state;
    while (s.pending.kind === 'reaction' || s.pending.kind === 'callDice') {
      s = applyAction(s, s.pending.kind === 'reaction'
        ? { type: 'react', side: s.pending.side, card: null }
        : { type: 'callDice', side: s.pending.side, roll: false }).state;
    }
    expect(s.turn).toBe(1);
    // Turn 1 starts with the draw step: both piles have cards, so the player chooses.
    expect(s.pending).toEqual({ kind: 'draw', side: s.firstSide });
    expect(s.ball?.pos).toEqual({ area: 'midfield', lane: lanes - 1 });
  });
});

describe('dealing players from the shared pool', () => {
  const playerIds = (state: GameState, side: 'A' | 'B') =>
    Object.entries(state.cards).filter(([uid, def]) => uid.startsWith(side) && def.kind !== 'spell').map(([, def]) => def.id);

  it('deals each side different players, the same way for the same seed', () => {
    const a = createGame({ seed: 7, cardSet: prototypeCards }).state;
    const again = createGame({ seed: 7, cardSet: prototypeCards }).state;
    const other = createGame({ seed: 8, cardSet: prototypeCards }).state;
    expect(playerIds(again, 'A')).toEqual(playerIds(a, 'A'));
    expect(playerIds(other, 'A')).not.toEqual(playerIds(a, 'A'));
    const both = [...playerIds(a, 'A'), ...playerIds(a, 'B')];
    expect(new Set(both).size).toBe(both.length);
  });

  it("dealt players play for their side's team", () => {
    const { state } = createGame({ seed: 1, cardSet: prototypeCards, teams: { A: 'B', B: 'A' } });
    for (const [uid, def] of Object.entries(state.cards)) expect(def.team).toBe(uid.startsWith('A') ? 'B' : 'A');
  });

  it('uses no randomness when the card set has no pool, so older saved games replay the same', () => {
    // An old-style card set: every player belongs to a team.
    const pool = prototypeCards.cards.filter((c) => c.kind !== 'spell' && c.team === 'pool');
    const goalies = pool.filter((c) => c.kind === 'goalie');
    const field = pool.filter((c) => c.kind === 'field');
    const assign = (side: string, i: number) => [...goalies.slice(i * 2, i * 2 + 2), ...field.slice(i * 22, i * 22 + 22)].map((c) => ({ ...c, team: side }));
    const oldStyle: CardSet = { ...prototypeCards, cards: [...prototypeCards.cards.filter((c) => c.kind === 'spell'), ...assign('A', 0), ...assign('B', 1)] };
    const withPool = createGame({ seed: 5, cardSet: prototypeCards }).state;
    const without = createGame({ seed: 5, cardSet: oldStyle }).state;
    expect(without.firstSide).toBe(withPool.firstSide);
    expect(without.injuryDeck).toEqual(withPool.injuryDeck);
    // The RNG has moved only for the coin toss and the injury deck shuffle.
    let rng = seedToState(5);
    [, rng] = randomInt(rng, 2);
    [, rng] = shuffle(without.injuryDeck, rng);
    expect(without.rng).toBe(rng);
    expect(withPool.rng).not.toBe(rng);
    expect(playerIds(without, 'A')).toEqual(assign('A', 0).map((c) => c.id));
  });

  it('refuses to start if the pool is too small for two decks', () => {
    const small: CardSet = { ...prototypeCards, cards: prototypeCards.cards.filter((c) => !(c.kind === 'goalie' && c.team === 'pool')).concat(prototypeCards.cards.filter((c) => c.kind === 'goalie').slice(0, 3)) };
    expect(() => createGame({ seed: 1, cardSet: small })).toThrow(/goalies/);
  });
});
