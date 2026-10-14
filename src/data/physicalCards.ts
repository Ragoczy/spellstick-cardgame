// DRAFT physical attack cards (PLAN.md, rules v0.17 Phase c2), for card faces and placeholder art.
// The engine doesn't know these cards yet. When Phase c2 is built they move into
// cards.prototype.json, and this file goes away.

import raw from '../../data/physical.draft.json';

export type PhysicalTier = 'minor' | 'major' | 'brutal';

export interface PhysicalCardDef {
  id: string;
  kind: 'physical';
  name: string;
  tier: PhysicalTier;
  /** 'speed' attacks with Speed; 'muscle' attacks with Defense. */
  uses: 'speed' | 'muscle';
  /** Added to the attack. */
  bonus: number;
  /** The body Affinity that gives +1 to the attack ("body.strength"). */
  affinity: string;
  /** The target's Toughness roll modifier, or null if this card never makes one. */
  toughness: number | null;
  /** The severity roll modifier, or null if this card never makes one. */
  severity: number | null;
  /** The sport (or sports) it comes from. */
  from: string;
  /** For a reaction: when you play it. Without this, it's an attack on your turn. */
  when?: string;
  /** Anything the card does beyond the standard attack. */
  text: string;
}

/** Turns in the penalty box if the referee calls it, by tier. */
export const PENALTY_TURNS: Record<PhysicalTier, number> = { minor: 1, major: 2, brutal: 3 };

export const physicalCards: PhysicalCardDef[] = raw.cards.map((c) => ({ ...c, kind: 'physical' }) as PhysicalCardDef);
