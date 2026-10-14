// Affinity (RULES.md "Affinity"): compare a spell's magic to the caster's Resonants.
// - Specialist: a Resonant's Affinity is exactly the spell's specialization ("illusion.glamour").
//   Numeric effects get much stronger.
// - Match: a Resonant's Affinity is in the spell's family (a whole family like "illusion", or any
//   specialization in it). Numeric effects get stronger.
// - Opposed: no match, and some Resonant's family is opposed to the spell's family. Numeric
//   effects get weaker (never below 0); non-numeric effects fail. The current card set has no
//   opposed families, so this never happens with it.
// - Neutral: anything else, including neutral spells (no magic).

import { NUMERIC_EFFECTS, familyOf, type Magic, type PlayerCardDef, type SpellCardDef } from './cards';
import type { GameConfig } from './config';
import type { Affinity } from './state';

export function affinityFor(
  caster: PlayerCardDef,
  spellMagic: Magic | null,
  opposedPairs: [string, string][],
): Affinity {
  if (spellMagic === null) return 'neutral';
  const affinities = caster.resonants.map((r) => r.affinity);
  if (spellMagic.includes('.') && affinities.includes(spellMagic)) return 'specialist';
  const spellFamily = familyOf(spellMagic);
  const casterFamilies = affinities.map(familyOf);
  if (casterFamilies.includes(spellFamily)) return 'match';
  const isOpposed = opposedPairs.some(
    ([x, y]) =>
      (x === spellFamily && casterFamilies.includes(y)) || (y === spellFamily && casterFamilies.includes(x)),
  );
  return isOpposed ? 'opposed' : 'neutral';
}

/** How much stronger (or, if negative, weaker) a numeric effect gets. */
export function affinityBonus(affinity: Affinity, config: GameConfig): number {
  if (affinity === 'specialist') return config.affinitySpecialistBonus;
  if (affinity === 'match') return config.affinityMatchBonus;
  if (affinity === 'opposed') return -config.affinityOpposedPenalty;
  return 0;
}

/** Adjusts a numeric effect's amount (boost, steal, recall, hit). */
export function adjustAmount(amount: number, affinity: Affinity, config: GameConfig): number {
  return Math.max(0, amount + affinityBonus(affinity, config));
}

/** Adjusts a penalty (long shot). A stronger spell means a smaller penalty. */
export function adjustPenalty(penalty: number, affinity: Affinity, config: GameConfig): number {
  return Math.max(0, penalty - affinityBonus(affinity, config));
}

/** A non-numeric spell cast with an opposed affinity fails entirely. */
export function spellFizzles(spell: SpellCardDef, affinity: Affinity): boolean {
  return affinity === 'opposed' && !NUMERIC_EFFECTS.has(spell.ability.effect);
}
