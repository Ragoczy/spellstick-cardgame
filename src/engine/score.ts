// The arithmetic of one side's contest value: stat, ability bonus, reaction spell, modifiers.
// Kept separate and free of game state so the computer opponent can estimate contests with
// exactly the same math the engine uses.

import { adjustAmount } from './affinity';
import { statOf } from './board';
import type { PlayerCardDef, SpellCardDef } from './cards';
import type { GameConfig } from './config';
import type { BreakdownPart } from './events';
import type { Affinity, ContestSide } from './state';

export interface SideScoreInput {
  player: PlayerCardDef;
  /** Which stat, what it's used for, where the player is, and any action-spell modifiers. */
  side: Pick<ContestSide, 'stat' | 'use' | 'pos' | 'modifiers'>;
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

export function scoreSide(input: SideScoreInput, config: GameConfig): SideScore {
  const { player, side, spell, shielded } = input;
  // Shield: this player's stat counts as 0 and their abilities are ignored. Spells still count.
  const base = shielded ? 0 : statOf(player, side.stat);
  const parts: BreakdownPart[] = [];

  const bonus = shielded ? 0 : bonusFor(player, side);
  if (bonus !== 0) parts.push({ label: 'Ability', amount: bonus });

  if (spell && spell.def.ability.effect === 'boost') {
    parts.push({ label: spell.def.name, amount: adjustAmount(spell.def.ability.params.amount, spell.affinity, config) });
  }
  parts.push(...side.modifiers);

  const total = Math.max(0, base + parts.reduce((sum, p) => sum + p.amount, 0));
  return { base, parts, total, shielded };
}
