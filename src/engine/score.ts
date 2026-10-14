// The arithmetic of one side's contest value: stat, ability bonus, reaction spell, modifiers.
// Kept separate and free of game state so the computer opponent can estimate contests with
// exactly the same math the engine uses.

import { adjustAmount } from './affinity';
import { statOf } from './board';
import { reactionFits, type PlayerCardDef, type SpellCardDef } from './cards';
import type { GameConfig, InjuryDef } from './config';
import { injuryPenalty } from './injuries';
import type { BreakdownPart } from './events';
import type { Affinity, ContestSide } from './state';

export interface SideScoreInput {
  /** null for an empty spot (a player was carried off): it counts as 0. */
  player: PlayerCardDef | null;
  /** The player's injury, if any. */
  injury?: InjuryDef | null;
  /** Which stat, what it's used for, where the player is, and any action-spell modifiers. */
  side: Pick<ContestSide, 'stat' | 'use' | 'pos' | 'modifiers' | 'power' | 'roll'>;
  /** This side's reaction spell, if one was played and didn't fail. */
  spell: { def: SpellCardDef; affinity: Affinity } | null;
  /** The other side played a shield that didn't fail. */
  shielded: boolean;
}

export interface SideScore {
  base: number;
  parts: BreakdownPart[];
  total: number;
  shielded: boolean;
  /** The value from the printed card alone (stat, ability, injury), before spells and dice. */
  printed: number;
}

export function bonusFor(player: PlayerCardDef, side: SideScoreInput['side']): number {
  const ability = player.ability;
  if (ability?.effect !== 'bonus') return 0;
  const { stat, amount, when, row } = ability.params;
  if (stat !== side.stat) return 0;
  if (when !== undefined && when !== side.use) return 0;
  if (row !== undefined && row !== side.pos.area) return 0;
  return amount;
}

/** What a Shield leaves of a player's value (or a hit's strength), by config.shieldEffect. */
export function shieldedValue(value: number, config: GameConfig): number {
  switch (config.shieldEffect) {
    case 'zero':
      return 0;
    case 'half':
      return Math.ceil(value / 2);
    case 'minus':
      return Math.max(0, value - config.shieldAmount);
  }
}

export function scoreSide(input: SideScoreInput, config: GameConfig): SideScore {
  const { player, side, spell, shielded } = input;
  // An empty spot counts as 0.
  if (!player) return { base: 0, parts: [], total: 0, shielded, printed: 0 };
  // The old Shield (before v0.17): this player's stat (or a hit's strength) counts as 0 and their
  // abilities and injuries are ignored. Spells still count.
  const zeroed = shielded && config.shieldEffect === 'zero';
  const base = zeroed ? 0 : side.power ? side.power.value : statOf(player, side.stat);
  const parts: BreakdownPart[] = [];

  // A hit's strength isn't a player stat, so abilities and injuries don't change it.
  if (!zeroed && !side.power) {
    const bonus = bonusFor(player, side);
    if (bonus !== 0) parts.push({ label: 'Ability', amount: bonus });
    const penalty = injuryPenalty(input.injury, player, side.stat);
    if (penalty !== 0) parts.push({ label: input.injury!.name, amount: -penalty });
  }
  const printed = Math.max(0, base + parts.reduce((sum, p) => sum + p.amount, 0));
  // Shield (v0.17): the value worked out so far is cut down. Dice and spells are added after.
  if (shielded && !zeroed) {
    const cut = printed - shieldedValue(printed, config);
    if (cut !== 0) parts.push({ label: 'Shield', amount: -cut });
  }
  if (side.roll) parts.push({ label: 'Roll', amount: side.roll });

  if (spell && spell.def.ability.effect === 'boost' && reactionFits(spell.def, side)) {
    parts.push({ label: spell.def.name, amount: adjustAmount(spell.def.ability.params.amount, spell.affinity, config) });
  }
  parts.push(...side.modifiers);

  const total = Math.max(0, base + parts.reduce((sum, p) => sum + p.amount, 0));
  return { base, parts, total, shielded, printed };
}
