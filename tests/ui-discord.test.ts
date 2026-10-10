// Running inside Discord: when the Discord path starts, and what it shows on a player's profile.

import { describe, expect, it } from 'vitest';
import { applyAction, createGame, legalActions, viewFor } from '../src/engine';
import { gamePresence, IN_DISCORD, isDiscordLaunch, setDiscordPresence } from '../src/ui/discord';
import { prototypeCards } from '../src/data/prototype';

describe('Discord launch', () => {
  it('starts only when Discord passes frame_id', () => {
    expect(isDiscordLaunch('?frame_id=abc&instance_id=i&platform=desktop')).toBe(true);
    expect(isDiscordLaunch('')).toBe(false);
    expect(isDiscordLaunch('?seed=12&autoplay=1')).toBe(false);
  });

  it('does nothing outside Discord', () => {
    expect(IN_DISCORD).toBe(false);
    expect(() => setDiscordPresence({ details: 'In the menu' })).not.toThrow();
  });
});

describe('Discord presence', () => {
  it('shows the lineup, then the turn and score, from the player’s side', () => {
    let state = createGame({ seed: 7, cardSet: prototypeCards }).state;
    expect(gamePresence(viewFor(state, 'A'), 'B', false, 1000)).toEqual({ details: 'Playing the computer', state: 'Setting the lineup', startedAt: 1000 });

    // Make the first legal choice until the first turn starts.
    for (let i = 0; i < 200 && state.turn === 0; i++) {
      const side = state.pending.kind === 'gameOver' ? 'A' : state.pending.side;
      state = applyAction(state, legalActions(state, side)[0]!).state;
    }
    const inPlay = gamePresence(viewFor(state, 'A'), 'B', true, 1000);
    expect(inPlay).toMatchObject({ details: 'In an online match', startedAt: 1000 });
    expect(inPlay.state).toMatch(/^Turn \d+ · \d+–\d+$/);
  });

  it('shows the result without a timer when the game is over', () => {
    const view = viewFor(createGame({ seed: 7, cardSet: prototypeCards }).state, 'A');
    const over = { ...view, score: { A: 3, B: 1 }, result: { winner: 'A' as const, reason: 'goals' as const } };
    expect(gamePresence(over, 'B', false, 1000)).toEqual({ details: 'Playing the computer', state: 'Won 3–1' });
    expect(gamePresence({ ...over, result: { winner: 'B', reason: 'goals' } }, 'B', false, 1000).state).toBe('Lost 3–1');
    expect(gamePresence({ ...over, result: { winner: null, reason: 'draw' } }, 'B', false, 1000).state).toBe('Draw 3–1');
  });
});
