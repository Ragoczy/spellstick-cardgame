// The turn-step panel shows the right step of RULES.md "Turn sequence".
import { describe, expect, it } from 'vitest';
import { viewFor } from '../src/engine';
import { turnPhase } from '../src/ui/TurnSteps';
import { boost, fwd, play, scenario } from './helpers';

describe('turn steps', () => {
  it('shows the Act step during the active player\'s action, for both players', () => {
    const s = scenario();
    expect(turnPhase(viewFor(s, 'A'))).toEqual({ kind: 'turn', mine: true, step: 'act', detail: null });
    expect(turnPhase(viewFor(s, 'B'))).toEqual({ kind: 'turn', mine: false, step: 'act', detail: null });
  });

  it('shows the Draw and Discard steps', () => {
    const s = scenario();
    s.pending = { kind: 'draw', side: 'A' };
    expect(turnPhase(viewFor(s, 'A'))).toMatchObject({ step: 'draw' });
    s.pending = { kind: 'discard', side: 'A', count: 2 };
    expect(turnPhase(viewFor(s, 'A'))).toMatchObject({ step: 'discard', detail: '2 to go' });
  });

  it('stays on the Act step during a contest, and says who is deciding', () => {
    const s = scenario({ A: { hand: [boost('Boost')] } });
    const { state } = play(s, { type: 'pass', side: 'A', to: fwd(0) });
    expect(state.pending.kind).toBe('reaction');
    expect(turnPhase(viewFor(state, 'A'))).toMatchObject({ step: 'act', detail: 'Contest: you may play a reaction spell' });
    expect(turnPhase(viewFor(state, 'B'))).toMatchObject({ step: 'act', mine: false, detail: 'Contest: the computer may play a reaction spell' });
  });

  it('shows the opening faceoff before turn 1, and the end of the game', () => {
    const s = scenario({ turn: 0, ball: null });
    s.pending = { kind: 'faceoffLane', side: 'B' };
    expect(turnPhase(viewFor(s, 'A'))).toEqual({ kind: 'opening' });
    s.pending = { kind: 'gameOver' };
    expect(turnPhase(viewFor(s, 'A'))).toEqual({ kind: 'over' });
  });

  it('treats the faceoff after a goal as part of the scorer\'s Act step', () => {
    const s = scenario({ turn: 5, ball: null });
    s.pending = { kind: 'faceoffLane', side: 'B' };
    expect(turnPhase(viewFor(s, 'A'))).toMatchObject({ kind: 'turn', mine: true, step: 'act' });
  });
});
