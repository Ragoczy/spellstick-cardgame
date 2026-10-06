// CLAUDE.md rule 4: hidden information is enforced by the engine. Players (including the
// computer opponent) only ever see viewFor(), legalActions(), and eventsFor().
import { describe, expect, it } from 'vitest';
import type { Agent } from '../src/ai/agent';
import { randomAgent } from '../src/ai/random';
import { runGame } from '../src/ai/runGame';
import type { Action } from '../src/engine/actions';
import { AREAS, otherSide, type Side } from '../src/engine/field';
import type { GameEvent } from '../src/engine/events';
import type { GameState, Uid } from '../src/engine/state';
import { eventsFor, viewFor, type PlayerView } from '../src/engine/view';
import { prototypeCards } from '../src/data/prototype';
import { LANE_COUNTS, dfn, player, scenario } from './helpers';

/** Every card the given side must not be able to identify right now. */
function hiddenFrom(state: GameState, viewer: Side): Uid[] {
  const them = state.teams[otherSide(viewer)];
  const hidden = [...them.hand, ...them.deck, ...state.teams[viewer].deck];
  const onField = [them.goalie, ...AREAS.flatMap((area) => them.lineup[area])];
  for (const slot of onField) if (slot && !slot.revealed && !slot.scried) hidden.push(slot.uid);
  return hidden;
}

/** Fails if any hidden card's instance id or card id appears anywhere in what the player was given. */
function expectNoLeak(state: GameState, viewer: Side, given: unknown) {
  const json = JSON.stringify(given);
  for (const uid of hiddenFrom(state, viewer)) {
    expect(json, `card ${uid} leaked to ${viewer}`).not.toContain(`"${uid}"`);
    expect(json, `card ${state.cards[uid]!.id} leaked to ${viewer}`).not.toContain(`"${state.cards[uid]!.id}"`);
  }
}

describe.each(LANE_COUNTS)('hidden information (%i lanes)', (lanes) => {
  it("shows the opponent's face-down players and goalie only as unknown", () => {
    const s = scenario({ lanes, B: { lineup: { defense: { 0: player('Hidden star', { defense: 6 }) } }, revealed: [dfn(1)] } });
    const view = viewFor(s, 'A');
    expect(view.opponent.lineup.defense[0]).toEqual({ state: 'unknown' });
    expect(view.opponent.goalie).toEqual({ state: 'unknown' });
    expect(view.opponent.lineup.defense[1]!.state).toBe('revealed');
    expect(JSON.stringify(view)).not.toContain('Hidden star');
  });

  it("shows the opponent's hand and both decks only as counts", () => {
    const s = scenario({ lanes, B: { hand: [player('Secret hand card')] } });
    const view = viewFor(s, 'A');
    expect(view.opponent.handCount).toBe(1);
    expect(view.opponent.deckCount).toBe(10);
    expect(view.mine.deckCount).toBe(10);
    expect(JSON.stringify(view)).not.toContain('Secret hand card');
    expect(JSON.stringify(view)).not.toContain('deck filler');
  });

  it("removes the other player's secrets from events", () => {
    const events: GameEvent[] = [
      { type: 'drew', side: 'B', count: 1, reason: 'turn', secret: { cards: [{ uid: 'B05', def: player('Drawn') }] } },
    ];
    expect(eventsFor(events, 'A')).toEqual([{ type: 'drew', side: 'B', count: 1, reason: 'turn' }]);
    expect(eventsFor(events, 'B')).toEqual(events);
  });

  it("never gives a computer player anything it shouldn't see, across whole games", () => {
    // Wraps a random player and checks everything it is handed before it decides.
    for (let seed = 1; seed <= 10; seed++) {
      let latest: GameState | null = null;
      const watched = (side: Side, inner: Agent): Agent => ({
        name: 'watched',
        chooseAction(view: PlayerView, legal: Action[]) {
          // The view and the legal actions never mention a card this side can't see.
          expectNoLeak(latest!, side, { view, legal });
          return inner.chooseAction(view, legal);
        },
      });
      // Each player's copy of the events carries no secrets belonging to the other side.
      // (Old events can mention cards that were public then and hidden now, e.g. discards
      // shuffled back in for sudden death, so events are checked by who owns each secret.)
      const checkEvents = (events: GameEvent[]) => {
        for (const side of ['A', 'B'] as const) {
          for (const event of eventsFor(events, side)) if ('secret' in event) expect(event.side).toBe(side);
        }
      };
      runGame(
        { seed, cardSet: prototypeCards, config: { lanes } },
        { A: watched('A', randomAgent(seed)), B: watched('B', randomAgent(seed + 100)) },
        {
          onStart: (state, events) => {
            latest = state;
            checkEvents(events);
          },
          onStep: (state, _action, events) => {
            latest = state;
            checkEvents(events);
          },
        },
      );
    }
  }, 120_000);
});
