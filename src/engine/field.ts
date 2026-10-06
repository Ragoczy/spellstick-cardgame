// Field geometry: rows, lanes, spots, and which way is "forward" for each team.
//
// Each team sees the field from its own goal outward: goal -> defense -> midfield -> forward.
// Team A's goal is row 1 and Team B's goal is row 5, so the same spot is Team A's forward
// line and Team B's defense line. Lanes are numbered 0, 1, ... the same for both teams.

import type { Area } from './cards';

export type Side = 'A' | 'B';
export const SIDES: readonly Side[] = ['A', 'B'];
export const AREAS: readonly Area[] = ['defense', 'midfield', 'forward'];

export type FieldPos = { area: Area; lane: number };
export type Pos = { area: 'goal' } | FieldPos;

export const GOAL: Pos = { area: 'goal' };

export function otherSide(side: Side): Side {
  return side === 'A' ? 'B' : 'A';
}

/** Steps from your own goal: goal 0, defense 1, midfield 2, forward 3. */
export function depth(pos: Pos): number {
  switch (pos.area) {
    case 'goal': return 0;
    case 'defense': return 1;
    case 'midfield': return 2;
    case 'forward': return 3;
  }
}

const AREA_AT_DEPTH: Record<number, Area> = { 1: 'defense', 2: 'midfield', 3: 'forward' };

/** Absolute field row (1–5) for a team's position. Team A's goal is row 1. */
export function absoluteRow(side: Side, pos: Pos): number {
  return side === 'A' ? 1 + depth(pos) : 5 - depth(pos);
}

/** The opposing team's position in the same spot: your forward meets their defender. */
export function opposite(pos: FieldPos): FieldPos {
  const area: Area = pos.area === 'defense' ? 'forward' : pos.area === 'forward' ? 'defense' : 'midfield';
  return { area, lane: pos.lane };
}

export function isFieldPos(pos: Pos): pos is FieldPos {
  return pos.area !== 'goal';
}

export function samePos(a: Pos, b: Pos): boolean {
  if (a.area === 'goal' || b.area === 'goal') return a.area === b.area;
  return a.area === b.area && a.lane === b.lane;
}

export function posLabel(pos: Pos): string {
  return pos.area === 'goal' ? 'goal' : `${pos.area} lane ${pos.lane + 1}`;
}

/** Every field position for one team, in a fixed order. */
export function allFieldPositions(lanes: number): FieldPos[] {
  const result: FieldPos[] = [];
  for (const area of AREAS) {
    for (let lane = 0; lane < lanes; lane++) result.push({ area, lane });
  }
  return result;
}

/**
 * Where the ball holder may pass (RULES.md "Pass"):
 * - same row, another lane;
 * - one row forward, any lane (two rows with a long pass);
 * - any row backward, any lane, but never to the goalie.
 * A goalie's "one row forward" is its defenders.
 */
export function passTargets(from: Pos, lanes: number, longPass = false): FieldPos[] {
  const fromDepth = depth(from);
  const maxForward = longPass ? 2 : 1;
  return allFieldPositions(lanes).filter((to) => {
    const step = depth(to) - fromDepth;
    if (step === 0) return isFieldPos(from) && to.lane !== from.lane;
    if (step > 0) return step <= maxForward;
    return true; // backward; goal is never a field position, so never the goalie
  });
}
