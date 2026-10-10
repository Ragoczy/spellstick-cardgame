// Player card types: what each type is good at. Used by the player generator
// (scripts/generate-players.ts), the card data tests, and the UI labels.
// A type only describes the card: any field player can play any position.

import type { PlayerRole } from '../engine/cards';

export type FieldStat = 'speed' | 'shot' | 'defense' | 'faceoff';

export interface FieldType {
  label: string;
  /**
   * Stats before bonus points: the weakest prototype card of this type, except that Anchors and
   * Stoppers start at Defense 3, not 4. At 4, tackles won too often and goals fell below the
   * simulation target (2026-10-10).
   */
  base: Record<FieldStat, number>;
  /** Where bonus points go. A Runner's points go to Speed half the time (5 out of 10). */
  weights: Record<FieldStat, number>;
}

export const FIELD_TYPES: Record<Exclude<PlayerRole, 'goalie'>, FieldType> = {
  runner: { label: 'Runner', base: { speed: 4, shot: 3, defense: 2, faceoff: 4 }, weights: { speed: 5, shot: 1, defense: 1, faceoff: 3 } },
  striker: { label: 'Striker', base: { speed: 3, shot: 4, defense: 2, faceoff: 2 }, weights: { speed: 3, shot: 5, defense: 1, faceoff: 1 } },
  playmaker: { label: 'Playmaker', base: { speed: 3, shot: 3, defense: 3, faceoff: 4 }, weights: { speed: 2, shot: 1, defense: 2, faceoff: 5 } },
  allrounder: { label: 'All-rounder', base: { speed: 3, shot: 3, defense: 3, faceoff: 3 }, weights: { speed: 1, shot: 1, defense: 1, faceoff: 1 } },
  anchor: { label: 'Anchor', base: { speed: 3, shot: 2, defense: 3, faceoff: 3 }, weights: { speed: 1, shot: 1, defense: 5, faceoff: 3 } },
  stopper: { label: 'Stopper', base: { speed: 3, shot: 2, defense: 3, faceoff: 2 }, weights: { speed: 3, shot: 1, defense: 5, faceoff: 1 } },
};

/**
 * A goalie's Save before bonus points. All of a goalie's bonus points go to Save, so goalies
 * average about 4, like the prototype goalies. (At 3 they averaged 5 and too few shots scored.)
 */
export const GOALIE_BASE_SAVE = 2;

/** Highest value a field stat can reach (data/cards.schema.json). */
export const FIELD_STAT_MAX = 6;
/** Highest Save a goalie can reach (data/cards.schema.json). */
export const SAVE_MAX = 8;

export function roleLabel(role: PlayerRole): string {
  return role === 'goalie' ? 'Goalie' : FIELD_TYPES[role].label;
}
