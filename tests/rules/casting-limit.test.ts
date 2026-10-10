// RULES.md "Casting limit": a player can cast one spell per Resonant while on the field, then
// has to be substituted out (back to hand) to recharge.

import { describe, expect, it } from 'vitest';
import { legalActions } from '../../src/engine/legal';
import { IllegalActionError, applyAction } from '../../src/engine/reducer';
import { eventsFor, viewFor } from '../../src/engine/view';
import type { GameState } from '../../src/engine/state';
import {
  LANE_COUNTS, actionSpell, boost, eventsOfType, fwd, mid, play, player, scenario, uid,
} from '../helpers';

const recall = (name = 'Recall', element: string | null = null) =>
  actionSpell(name, { effect: 'recall', params: { count: 1 } }, element);

/** Marks the player at midfield lane 0 of side A as having cast `n` spells already (and so face up). */
function alreadyCast(s: GameState, n: number): void {
  const slot = s.teams.A.lineup.midfield[0]!;
  slot.casts = n;
  slot.revealed = true;
}

describe.each(LANE_COUNTS)('Casting limit (%i lanes)', (lanes) => {
  const LAST = lanes - 1;

  it('counts each action spell against its caster', () => {
    const s = scenario({ lanes, A: { hand: [recall()] } });
    const { state } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Recall'), caster: mid(0), target: { kind: 'none' } });
    expect(state.teams.A.lineup.midfield[0]!.casts).toBe(1);
  });

  it('stops a player casting once they have cast one spell per Resonant', () => {
    const s = scenario({ lanes, A: { hand: [recall()], lineup: { midfield: { 0: player('One Resonant') } } } });
    alreadyCast(s, 1);
    const cast = { type: 'cast', side: 'A', card: uid(s, 'A', 'Recall'), caster: mid(0), target: { kind: 'none' } } as const;
    expect(() => applyAction(s, cast)).toThrow(IllegalActionError);
    expect(legalActions(s, 'A')).not.toContainEqual(cast);
    // Another player can still cast it.
    expect(legalActions(s, 'A')).toContainEqual({ ...cast, caster: fwd(0) });
  });

  it('lets a player with more Resonants cast more spells', () => {
    const s = scenario({ lanes, A: { hand: [recall()], lineup: { midfield: { 0: player('Two Resonants', {}, { affinities: ['earth', 'fire'] }) } } } });
    alreadyCast(s, 1);
    const cast = { type: 'cast', side: 'A', card: uid(s, 'A', 'Recall'), caster: mid(0), target: { kind: 'none' } } as const;
    expect(play(s, cast).state.teams.A.lineup.midfield[0]!.casts).toBe(2);
    alreadyCast(s, 2);
    expect(() => applyAction(s, cast)).toThrow(IllegalActionError);
  });

  it('counts a spell that fizzles from an opposed affinity', () => {
    const s = scenario({ lanes, A: { hand: [actionSpell('Scry', { effect: 'scry', params: {} }, 'water')], lineup: { midfield: { 0: player('Fire', {}, { affinities: ['fire'] }) } } } });
    const { state, events } = play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Scry'), caster: mid(0), target: { kind: 'opponent', pos: mid(0) } });
    expect(eventsOfType(events, 'spellCast')[0]?.fizzled).toBe(true);
    expect(state.teams.A.lineup.midfield[0]!.casts).toBe(1);
  });

  it('counts reaction spells too, and a player with none left is not asked to react', () => {
    const s = scenario({ lanes, ball: { side: 'A', pos: mid(0) }, A: { hand: [boost('Boost'), boost('Boost 2')] } });
    const passTo = { type: 'pass', side: 'A', to: fwd(LAST) } as const;
    const first = play(s, passTo, { type: 'react', side: 'A', card: uid(s, 'A', 'Boost') }).state;
    expect(first.teams.A.lineup.forward[LAST]!.casts).toBe(1);

    // The receiver has cast its one spell, so the pass resolves without asking A for a reaction.
    const again = structuredClone(s);
    again.teams.A.lineup.forward[LAST]!.casts = 1;
    const { state, events } = play(again, passTo);
    expect(eventsOfType(events, 'contestResolved')).toHaveLength(1);
    expect(state.teams.A.hand).toHaveLength(2);
    // Both players are told why (a tired player's spells left are public anyway).
    expect(eventsOfType(eventsFor(events, 'B'), 'outOfSpells')).toEqual([{ type: 'outOfSpells', side: 'A', pos: fwd(LAST) }]);
  });

  it('recharges a player who is substituted out: they go to hand, and come back with their spells', () => {
    const s = scenario({ lanes, A: { hand: [player('Bench'), recall()], lineup: { midfield: { 0: player('Tired') } } } });
    alreadyCast(s, 1);
    let { state, events } = play(s, { type: 'substitute', side: 'A', pos: mid(0), card: uid(s, 'A', 'Bench') });
    expect(state.teams.A.hand).toContain(uid(s, 'A', 'Tired'));
    expect(state.teams.A.discard).not.toContain(uid(s, 'A', 'Tired'));
    expect(eventsOfType(events, 'substituted')[0]?.removed?.def.name).toBe('Tired');

    // Later, back on the field, they can cast again.
    state = { ...structuredClone(state), activeSide: 'A', pending: { kind: 'action', side: 'A' }, actionsLeft: 1 };
    state = play(state, { type: 'substitute', side: 'A', pos: mid(0), card: uid(s, 'A', 'Tired') }).state;
    expect(state.teams.A.lineup.midfield[0]).toEqual({ uid: uid(s, 'A', 'Tired'), revealed: false, scried: false });
    state = { ...structuredClone(state), activeSide: 'A', pending: { kind: 'action', side: 'A' }, actionsLeft: 1 };
    expect(legalActions(state, 'A')).toContainEqual({ type: 'cast', side: 'A', card: uid(s, 'A', 'Recall'), caster: mid(0), target: { kind: 'none' } });
  });

  it("doesn't tell the opponent who a face-down substituted player was", () => {
    const s = scenario({ lanes, A: { hand: [player('Bench')], lineup: { midfield: { 0: player('Secret') } } } });
    const { events } = play(s, { type: 'substitute', side: 'A', pos: mid(0), card: uid(s, 'A', 'Bench') });
    const theirs = eventsOfType(eventsFor(events, 'B'), 'substituted')[0]!;
    expect(theirs.removed).toBeNull();
    expect(JSON.stringify(theirs)).not.toContain('Secret');
    expect(eventsOfType(eventsFor(events, 'A'), 'substituted')[0]?.secret?.removed.def.name).toBe('Secret');
  });

  it('shows how many spells a face-up player has left, to both players', () => {
    const s = scenario({ lanes, A: { lineup: { midfield: { 0: player('Two', {}, { affinities: ['earth', 'fire'] }) } } } });
    alreadyCast(s, 1);
    expect(viewFor(s, 'B').opponent.lineup.midfield[0]).toMatchObject({ state: 'revealed', castsLeft: 1 });
    expect(viewFor(s, 'A').mine.lineup.midfield[0]).toMatchObject({ state: 'revealed', castsLeft: 1 });
    // A face-down opponent shows nothing.
    expect(viewFor(s, 'B').opponent.lineup.forward[0]).toEqual({ state: 'unknown' });
  });

  it('has no limit when castsPerResonant is 0', () => {
    const s = scenario({ lanes, config: { castsPerResonant: 0 }, A: { hand: [recall()] } });
    alreadyCast(s, 5);
    expect(() => play(s, { type: 'cast', side: 'A', card: uid(s, 'A', 'Recall'), caster: mid(0), target: { kind: 'none' } })).not.toThrow();
    expect(viewFor(s, 'A').mine.lineup.midfield[0]).not.toHaveProperty('castsLeft');
  });
});
