// The browser side of an online match: moves go out one at a time with the right move count,
// refused moves don't leave the screen out of date, and each event is shown once.

import { describe, expect, it } from 'vitest';
import { prototypeCards } from '../src/data/prototype';
import { applyAction, createGame, eventsFor, legalActions, makeConfig, viewFor, type Action, type GameEvent, type GameState } from '../src/engine';
import type { MatchDetail, MoveEvents } from '../src/shared/matchApi';
import { OnlineMatchClient, OnlineSeat, StaleMatchError, type MatchApi } from '../src/ui/onlineMatch';

/** A pretend game server for one match, seen by player A. */
function fakeServer() {
  const setup = { seed: 5, cardSet: prototypeCards, teams: { A: 'A', B: 'B' }, config: makeConfig({ lanes: 2 }) };
  const created = createGame(setup);
  let state: GameState = created.state;
  const events: GameEvent[][] = [created.events];
  const calls: string[] = [];
  let refuseNext: Error | null = null;

  const detail = (since: number): MatchDetail => ({
    match: {
      id: 1, status: state.result ? 'finished' : 'active', side: 'A', opponent: { id: 2, name: 'Bob Wands' }, youChallenged: true,
      lanes: 2, team: 'A', opponentTeam: 'B', yourMove: state.pending.kind !== 'gameOver' && state.pending.side === 'A',
      moveCount: events.length - 1, waitingSince: new Date().toISOString(), result: null, createdAt: new Date().toISOString(),
      pace: null, clock: null, autopilot: { you: false, them: false },
    },
    game: {
      view: viewFor(state, 'A'),
      legal: legalActions(state, 'A'),
      events: events.map((e, seq): MoveEvents => ({ seq, events: eventsFor(e, 'A') })).filter((m) => m.seq > since),
    },
  });

  /** Moves for either side, as the server would take them. */
  const play = (action: Action) => {
    const result = applyAction(state, action);
    state = result.state;
    events.push(result.events);
  };

  const api: MatchApi = {
    async get(_id, since = -1) {
      calls.push(`get since ${since}`);
      return detail(since);
    },
    async move(_id, action, seen) {
      calls.push(`move ${action.type} seen ${seen}`);
      await new Promise((r) => setTimeout(r, 5));
      if (refuseNext) {
        const err = refuseNext;
        refuseNext = null;
        throw err;
      }
      if (seen !== events.length - 1) throw new StaleMatchError('moved on');
      const before = events.length - 1;
      play(action);
      return detail(before);
    },
    async resign() {
      throw new Error('not used');
    },
  };
  return { api, calls, detail, play, state: () => state, refuse: (err: Error) => { refuseNext = err; } };
}

function listen() {
  const shown: GameEvent[] = [];
  const problems: (string | null)[] = [];
  return {
    shown,
    problems,
    listener: { onUpdate: (_d: MatchDetail, e: GameEvent[]) => { shown.push(...e); }, onSending: () => {}, onProblem: (p: string | null) => { problems.push(p); } },
  };
}

describe('online match client', () => {
  it('sends moves one at a time, each with the latest move count', async () => {
    const server = fakeServer();
    const { listener, shown } = listen();
    const client = new OnlineMatchClient(server.api, server.detail(-1), listener);
    // Choose a goalie, then (after B chooses) place the whole lineup in one go, as the lineup screen does.
    client.act(client.seat.legal[0]!);
    await client.idle();
    server.play(legalActions(server.state(), 'B')[0]!);
    client.refresh();
    await client.idle();
    expect(client.seat.view.pending.kind).toBe('placeLineup');
    client.autoPlace();
    await client.idle();
    expect(server.calls.filter((c) => c.startsWith('move')).map((c) => c.split(' seen ')[1])).toEqual(['0', '2', '3', '4', '5', '6', '7']);
    expect(client.seat.waitingFor).toBe('opponent');
    // Every event was shown exactly once, in order: goalie, B's goalie, then the placements.
    expect(shown.filter((e) => e.type === 'goalieChosen').map((e) => (e as { side: string }).side)).toEqual(['A', 'B']);
    expect(shown.filter((e) => e.type === 'placed')).toHaveLength(6);
  });

  it("doesn't fetch when nothing changed", async () => {
    const server = fakeServer();
    const { listener, shown } = listen();
    const client = new OnlineMatchClient(server.api, server.detail(-1), listener);
    client.refresh();
    client.refresh(); // a second check while one is waiting is skipped
    await client.idle();
    expect(server.calls).toEqual(['get since 0']);
    expect(shown).toEqual([]);
  });

  it('after a refused move, drops the moves queued behind it and catches up quietly', async () => {
    const server = fakeServer();
    const { listener, problems } = listen();
    const client = new OnlineMatchClient(server.api, server.detail(-1), listener);
    const [first, second] = client.seat.legal;
    server.refuse(new StaleMatchError('moved on'));
    client.act(first!);
    client.act(second!); // chosen from the same out-of-date view
    await client.idle();
    expect(server.calls).toEqual(['move chooseGoalie seen 0', 'get since 0']);
    expect(problems).toEqual([]);
  });

  it('shows a problem in plain language when the server says no', async () => {
    const server = fakeServer();
    const { listener, problems } = listen();
    const client = new OnlineMatchClient(server.api, server.detail(-1), listener);
    server.refuse(new Error("That move isn't allowed right now."));
    client.act(client.seat.legal[0]!);
    await client.idle();
    expect(problems).toEqual(["That move isn't allowed right now."]);
    // The next good move clears it.
    client.act(client.seat.legal[0]!);
    await client.idle();
    expect(problems.at(-1)).toBeNull();
  });

  it('knows whose decision it is, and your team colors', () => {
    const server = fakeServer();
    const seat = new OnlineSeat(server.detail(-1));
    expect(seat.waitingFor).toBe('human');
    expect(seat.teams).toEqual({ A: 'A', B: 'B' });
    expect(seat.hint()).not.toBeNull();
  });
});

describe('time bank display', () => {
  it('shows hours and minutes, or minutes and seconds under an hour', async () => {
    const { clockText } = await import('../src/ui/labels');
    expect(clockText(36 * 3600_000)).toBe('36 h 0 m');
    expect(clockText(35 * 3600_000 + 12 * 60_000 + 30_000)).toBe('35 h 12 m');
    expect(clockText(25 * 60_000)).toBe('25:00');
    expect(clockText(65_400)).toBe('1:06');
    expect(clockText(-5)).toBe('0:00');
  });
});
