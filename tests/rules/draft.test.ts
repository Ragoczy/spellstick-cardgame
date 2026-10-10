// RULES.md "Draft": an optional start where both teams pick players from a face-up pool, then
// get the rest of their players at random.

import { describe, expect, it } from 'vitest';
import { heuristicAgent } from '../../src/ai/heuristic';
import { runGame } from '../../src/ai/runGame';
import { prototypeCards } from '../../src/data/prototype';
import {
  applyAction, createGame, eventsFor, IllegalActionError, legalActions, makeConfig, replay, viewFor,
  type Action, type GameSetup, type GameState, type Side,
} from '../../src/engine';
import { draftOrder } from '../../src/engine/setup';
import { findProblems } from '../../src/sim/invariants';

const config = makeConfig({ draftPicks: 10 });
const setup = (seed = 7, lanes = 2): GameSetup => ({ seed, cardSet: prototypeCards, teams: { A: 'A', B: 'B' }, config: { ...config, lanes } });

/** Plays the whole draft, each side taking its first legal pick. Returns the state and every action. */
function draftAll(s: GameState): { state: GameState; actions: Action[] } {
  const actions: Action[] = [];
  while (s.pending.kind === 'draftPick') {
    const action = legalActions(s, s.pending.side)[0]!;
    actions.push(action);
    s = applyAction(s, action).state;
  }
  return { state: s, actions };
}

const kindOf = (s: GameState, uid: string) => s.cards[uid]!.kind;

describe('draft', () => {
  it('snake order: the second player picks first, then two at a time', () => {
    expect(draftOrder('B', 3)).toEqual(['B', 'A', 'A', 'B', 'B', 'A']);
    expect(draftOrder('A', 2)).toEqual(['A', 'B', 'B', 'A']);
    const { state } = createGame(setup());
    const second: Side = state.firstSide === 'A' ? 'B' : 'A';
    expect(state.pending).toEqual({ kind: 'draftPick', side: second });
    expect(state.draft!.order).toEqual(draftOrder(second, 10));
  });

  it('deals a face-up pool of 30 field players from the player pool (goalies are dealt later, at random)', () => {
    const { state } = createGame(setup());
    const pool = state.draft!.pool;
    expect(pool.filter((uid) => kindOf(state, uid) === 'field')).toHaveLength(30);
    expect(new Set(pool.map((uid) => state.cards[uid]!.id)).size).toBe(30);
  });

  it('the pool and both teams\' picks are public; the random fill is not', () => {
    let { state } = createGame(setup());
    const first = state.pending.kind === 'draftPick' ? state.pending.side : 'A';
    const other: Side = first === 'A' ? 'B' : 'A';
    const pick = legalActions(state, first)[0] as Extract<Action, { type: 'draftPick' }>;
    const { state: next, events } = applyAction(state, pick);
    state = next;
    // Both sides see the pick, and the pick's name, in the pool view and in the events.
    for (const side of [first, other]) {
      const view = viewFor(state, side);
      expect(view.draft!.picks[first].map((c) => c.uid)).toEqual([pick.card]);
      expect(view.draft!.pool).toHaveLength(29);
      expect(eventsFor(events, side)[0]).toMatchObject({ type: 'drafted', side: first, card: { uid: pick.card } });
    }
    // The players outside the pool are never in the view.
    const rest = new Set(state.draft!.rest.map((c) => c.id));
    const sent = JSON.stringify(viewFor(state, other));
    for (const id of rest) expect(sent).not.toContain(`"${id}"`);
  });

  it('only the picker can pick, and only cards still in the pool', () => {
    const { state } = createGame(setup());
    const picker = (state.pending as { side: Side }).side;
    const other: Side = picker === 'A' ? 'B' : 'A';
    const card = state.draft!.pool[0]!;
    expect(() => applyAction(state, { type: 'draftPick', side: other, card })).toThrow(IllegalActionError);
    expect(() => applyAction(state, { type: 'draftPick', side: picker, card: 'A01' })).toThrow(/from the pool/);
    const after = applyAction(state, { type: 'draftPick', side: picker, card }).state;
    expect(legalActions(after, other).map((a) => (a as { card: string }).card)).not.toContain(card);
  });

  it('with goalies in the pool (a config option), a team can draft at most 2', () => {
    const withGoalies = (seed: number): GameSetup => ({ ...setup(seed), config: { ...config, draftPoolGoalies: 4, draftPoolField: 26 } });
    let { state } = createGame(withGoalies(7));
    // Each side grabs goalies while it can.
    while (state.pending.kind === 'draftPick') {
      const side = state.pending.side;
      const legal = legalActions(state, side) as Extract<Action, { type: 'draftPick' }>[];
      const goalie = legal.find((a) => kindOf(state, a.card) === 'goalie');
      state = applyAction(state, goalie ?? legal[0]!).state;
    }
    for (const side of ['A', 'B'] as const) {
      expect(state.draft!.picks[side].filter((uid) => kindOf(state, uid) === 'goalie').length).toBeLessThanOrEqual(2);
    }
    const s2 = createGame(withGoalies(9)).state;
    const side = (s2.pending as { side: Side }).side;
    s2.draft!.picks[side] = s2.draft!.pool.filter((uid) => kindOf(s2, uid) === 'goalie').slice(0, 2);
    s2.draft!.pool = s2.draft!.pool.filter((uid) => !s2.draft!.picks[side].includes(uid));
    const third = s2.draft!.pool.find((uid) => kindOf(s2, uid) === 'goalie')!;
    expect(() => applyAction(s2, { type: 'draftPick', side, card: third })).toThrow(/2 goalies/);
  });

  it('after 10 picks each, every team has a full deck: its picks, 2 goalies, 22 field players, and its spells', () => {
    for (const lanes of [2, 3]) {
      const { state } = draftAll(createGame(setup(11, lanes)).state);
      expect(state.pending).toEqual({ kind: 'chooseGoalie', side: 'A' });
      expect(state.draft!.done).toBe(true);
      expect(findProblems(state)).toEqual([]);
      for (const side of ['A', 'B'] as const) {
        const uids = Object.keys(state.cards).filter((uid) => uid.startsWith(side));
        const kinds = uids.map((uid) => state.cards[uid]!.kind);
        expect(kinds.filter((k) => k === 'goalie')).toHaveLength(2);
        expect(kinds.filter((k) => k === 'field')).toHaveLength(22);
        expect(kinds.filter((k) => k === 'spell')).toHaveLength(16);
        // Every drafted player is in the team's deck, in the team's color.
        const ids = uids.map((uid) => state.cards[uid]!.id);
        for (const pick of state.draft!.picks[side]) expect(ids).toContain(state.cards[pick]!.id);
        expect(uids.every((uid) => state.cards[uid]!.team === side)).toBe(true);
      }
      // No named player is on both teams.
      const all = Object.keys(state.cards).filter((uid) => !uid.startsWith('P') && state.cards[uid]!.kind !== 'spell').map((uid) => state.cards[uid]!.id);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('the same seed and picks always give the same game', () => {
    const { state, actions } = draftAll(createGame(setup(21)).state);
    expect(replay(setup(21), actions).state).toEqual(state);
  });

  it('games without a draft are dealt exactly as before', () => {
    const plain = createGame({ seed: 21, cardSet: prototypeCards, teams: { A: 'A', B: 'B' } }).state;
    expect(plain.draft).toBeUndefined();
    expect(plain.pending).toEqual({ kind: 'chooseGoalie', side: 'A' });
  });

  it('the computer can draft and play whole games', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const record = runGame(setup(seed, seed % 2 ? 2 : 3), { A: heuristicAgent(seed, config), B: heuristicAgent(seed + 100, config) });
      expect(record.final.result).not.toBeNull();
      expect(findProblems(record.final)).toEqual([]);
    }
  });

  it('given goalies in the pool, the computer drafts one', () => {
    let { state } = createGame({ ...setup(5), config: { ...config, draftPoolGoalies: 4, draftPoolField: 26 } });
    while (state.pending.kind === 'draftPick') {
      const side = state.pending.side;
      state = applyAction(state, heuristicAgent(1, config).chooseAction(viewFor(state, side), legalActions(state, side))).state;
    }
    for (const side of ['A', 'B'] as const) {
      expect(state.draft!.picks[side].filter((uid) => kindOf(state, uid) === 'goalie').length).toBeGreaterThanOrEqual(1);
    }
  });
});
