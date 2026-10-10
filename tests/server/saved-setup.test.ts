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

  it('leaves newer matches alone', () => {
    const setup = { seed: 1, cardSet: prototypeCards, config: makeConfig() };
    expect(savedSetup(setup)).toBe(setup);
    expect(setup.config.substituteStep).toBe('draw');
  });
});
