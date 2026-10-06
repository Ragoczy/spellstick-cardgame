// Affinity (RULES.md "Affinity"): compare a spell's element to the caster's Resonants.
// - Match: any Resonant has the spell's element. Numeric effects get stronger.
// - Opposed: no match, and some Resonant is opposed to the spell's element. Numeric effects
//   get weaker (never below 0); non-numeric effects fail.
// - Neutral: anything else, including neutral spells (no element).

import { NUMERIC_EFFECTS, type Element, type PlayerCardDef, type SpellCardDef } from './cards';
import type { GameConfig } from './config';
import type { Affinity } from './state';

export function affinityFor(
  caster: PlayerCardDef,
  spellElement: Element | null,
  opposedPairs: [Element, Element][],
): Affinity {
  if (spellElement === null) return 'neutral';
  const casterElements = caster.resonants.map((r) => r.affinity);
  if (casterElements.includes(spellElement)) return 'match';
  const isOpposed = opposedPairs.some(
    ([x, y]) =>
      (x === spellElement && casterElements.includes(y)) || (y === spellElement && casterElements.includes(x)),
  );
  return isOpposed ? 'opposed' : 'neutral';
}

/** Adjusts a numeric effect's amount (boost, steal, recall). */
export function adjustAmount(amount: number, affinity: Affinity, config: GameConfig): number {
  if (affinity === 'match') return amount + config.affinityMatchBonus;
  if (affinity === 'opposed') return Math.max(0, amount - config.affinityOpposedPenalty);
  return amount;
}

/** Adjusts a penalty (long shot). A stronger spell means a smaller penalty. */
export function adjustPenalty(penalty: number, affinity: Affinity, config: GameConfig): number {
  if (affinity === 'match') return Math.max(0, penalty - config.affinityMatchBonus);
  if (affinity === 'opposed') return penalty + config.affinityOpposedPenalty;
  return penalty;
}

/** A non-numeric spell cast with an opposed affinity fails entirely. */
export function spellFizzles(spell: SpellCardDef, affinity: Affinity): boolean {
  return affinity === 'opposed' && !NUMERIC_EFFECTS.has(spell.ability.effect);
}
