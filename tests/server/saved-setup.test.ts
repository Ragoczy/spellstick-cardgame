// Matches saved before a rules setting existed keep the rules they were played with.
import { describe, expect, it } from 'vitest';
import { savedSetup } from '../../server/matches';
import { makeConfig } from '../../src/engine/config';
import { prototypeCards } from '../../src/data/prototype';

describe('savedSetup', () => {
  it('gives matches from before v0.11 the old substitution rule', () => {
    const { substituteStep: _, ...oldConfig } = makeConfig();
    const setup = savedSetup({ seed: 1, cardSet: prototypeCards, config: oldConfig });
    expect(setup.config?.substituteStep).toBe('action');
  });

  it('gives matches from before v0.16 the old dice and goalie rules, with the old settings they saved', () => {
    // A match saved before v0.16 had every setting but diceTokens, with the old values.
    const { diceTokens: _, goalieMustClear: __, ...rest } = makeConfig();
    const oldConfig = { ...rest, contestDie: 0, protectCatch: 'off' as const, diceBudget: 5 };
    const setup = savedSetup({ seed: 1, cardSet: prototypeCards, config: oldConfig });
    expect(setup.config).toMatchObject({ diceTokens: 'call', goalieMustClear: false, contestDie: 0, protectCatch: 'off', diceBudget: 5, shotDie: 6 });
  });

  it('gives card sets from before v0.14 the new names for their magic, keeping the old rules', () => {
    const { families: _, ...rest } = prototypeCards;
    const oldSet = {
      ...rest,
      elements: ['fire', 'water', 'earth', 'air'],
      opposedPairs: [['fire', 'water'], ['earth', 'air']],
      cards: [{ id: 's-1', team: 'A', kind: 'spell', name: 'Water Shield', spellType: 'reaction', element: 'water', ability: { effect: 'shield', params: {} } }],
    };
    const setup = savedSetup({ seed: 1, cardSet: oldSet as never, config: makeConfig() });
    expect(setup.cardSet.families).toEqual(['fire', 'water', 'earth', 'air']);
    expect(setup.cardSet.opposedPairs).toEqual([['fire', 'water'], ['earth', 'air']]);
    expect(setup.cardSet.cards[0]).toMatchObject({ magic: 'water' });
    expect(setup.cardSet.cards[0]).not.toHaveProperty('element');
  });

  it('leaves newer matches alone', () => {
    const setup = { seed: 1, cardSet: prototypeCards, config: makeConfig() };
    expect(savedSetup(setup)).toBe(setup);
    expect(setup.config.substituteStep).toBe('draw');
    expect(setup.config.diceTokens).toBe('reroll');
    expect(setup.config.goalieMustClear).toBe(true);
  });
});
