// Player costs (v0.17, PLAN.md Phase f): what each named player counts against a team's cap.
//
// A cost adds up what the player's stats, Toughness, Resonants, and ability are worth in wins,
// measured by `npm run measure-value`. `npm run price-players` turns a measurement into
// data/player-values.json (the numbers below) and writes each player's cost into the card data.
// The tests check that every cost in the card data still matches this formula.

import type { FieldCardDef, GoalieCardDef, PlayerAbility, PlayerCardDef } from '../engine/cards';

export type PricedPart = 'speed' | 'shot' | 'defense' | 'faceoff' | 'toughness' | 'save' | 'resonants';

export interface PlayerValues {
  /** The measurement these values came from. */
  measured: string;
  /**
   * What one more point adds on one card, in points per 100 games (a win is 1, a draw ½). A part
   * measured at less than 0 counts 0 here, so no card is cheaper for being better.
   */
  perPoint: Record<PricedPart, number>;
  /** What each ability adds on one card (key: abilityKey). */
  abilities: Record<string, number>;
  /**
   * The weakest value of each part in the player pool. A card is priced on how far it's above
   * these: the measurements say what one more point is worth, not what the first point is worth.
   */
  floor: Record<PricedPart, number>;
  /** Cost = base + scale × worth above the floor, rounded, and at least 1. */
  fieldBase: number;
  goalieBase: number;
  scale: number;
}

/** The name an ability is priced under: its effect, or "quick" for +Speed when evading. */
export function abilityKey(ability: PlayerAbility): string {
  return ability.effect === 'bonus' && ability.params.when === 'evade' ? 'quick' : ability.effect;
}

/** How much a player is worth above the weakest card, in points per 100 games. */
export function playerWorth(def: FieldCardDef | GoalieCardDef, values: PlayerValues): number {
  const part = (name: PricedPart, have: number) => values.perPoint[name] * (have - values.floor[name]);
  let worth = part('resonants', def.resonants.length);
  if (def.kind === 'goalie') return worth + part('save', def.save);
  worth += part('speed', def.speed) + part('shot', def.shot) + part('defense', def.defense) + part('faceoff', def.faceoff);
  worth += part('toughness', def.toughness);
  if (def.ability) worth += values.abilities[abilityKey(def.ability)] ?? 0;
  return worth;
}

export function playerCost(def: PlayerCardDef, values: PlayerValues): number {
  const base = def.kind === 'goalie' ? values.goalieBase : values.fieldBase;
  return Math.max(1, Math.round(base + values.scale * playerWorth(def, values)));
}
