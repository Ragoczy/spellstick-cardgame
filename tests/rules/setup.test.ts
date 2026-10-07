// RULES.md "Setup".
import { describe, expect, it } from 'vitest';
import { legalActions } from '../../src/engine/legal';
import { applyAction, IllegalActionError } from '../../src/engine/reducer';
import { createGame } from '../../src/engine/setup';
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

  it('puts the chosen goalie face down in goal and shuffles the other into the deck', () => {
    const { state } = createGame({ seed: 1, cardSet: prototypeCards, config: { lanes } });
    const [chosen, other] = state.teams.A.hand;
    const s = applyAction(state, { type: 'chooseGoalie', side: 'A', card: chosen! }).state;
    expect(s.teams.A.goalie).toEqual({ uid: chosen, revealed: false, scried: false });
    expect([...s.teams.A.deck, ...s.teams.A.hand]).toContain(other);
    expect(s.teams.A.deck.length + s.teams.A.hand.length).toBe(39);
  });

  it(`draws ${spots} + 4 cards`, () => {
    // Pick a seed where the first draw already has enough field players.
    for (let seed = 1; seed < 50; seed++) {
      const s = chooseFirstGoalie(createGame({ seed, cardSet: prototypeCards, config: { lanes } }).state);
      const fieldCount = s.teams.A.hand.filter((u) => s.cards[u]!.kind === 'field').length;
      if (s.teams.A.hand.length === spots + 4) {
        expect(fieldCount).toBeGreaterThanOrEqual(spots);
        return;
      }
    }
    throw new Error('No seed drew exactly the normal setup hand');
  });

  it('keeps drawing one card at a time until every spot can be filled', () => {
    // A deck with only just enough field players, so the normal draw usually falls short.
    const cards = [
      goalie('G1'), goalie('G2'),
      ...Array.from({ length: spots }, (_, i) => player(`P${i}`)),
      ...Array.from({ length: 30 }, (_, i) => actionSpell(`S${i}`, { effect: 'recall', params: { count: 1 } })),
    ].map((c) => ({ ...c, team: 'X' }));
    const cardSet: CardSet = { version: 't', elements: ELEMENTS, opposedPairs: OPPOSED, teams: [], cards };
    for (let seed = 1; seed <= 5; seed++) {
      const s = chooseFirstGoalie(createGame({ seed, cardSet, teams: { A: 'X', B: 'X' }, config: { lanes, deckSize: cards.length } }).state);
      const hand = s.teams.A.hand;
      expect(hand.filter((u) => s.cards[u]!.kind === 'field')).toHaveLength(spots);
      expect(hand.length).toBeGreaterThanOrEqual(spots + 4);
      // The last card drawn was the field player that completed the lineup (unless the normal draw was enough).
      if (hand.length > spots + 4) expect(s.cards[hand[hand.length - 1]!]!.kind).toBe('field');
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
    expect(s.pending).toEqual({ kind: 'action', side: s.firstSide });
    expect(s.ball?.pos).toEqual({ area: 'midfield', lane: lanes - 1 });
  });
});
