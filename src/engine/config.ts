// Every tuning number in the rules lives here (marked ⚙ in docs/RULES.md).
// Balance changes should be one-line edits to DEFAULT_CONFIG.

export interface GameConfig {
  /** Lanes on the field. Base game 2, center-lane add-on 3. */
  lanes: number;
  /** First team to this many goals wins. */
  goalsToWin: number;
  /** Discard down to this many cards at the end of your turn. */
  handLimit: number;
  /** Setup draw = number of field spots + this (10 with 2 lanes, 13 with 3). */
  setupExtraCards: number;
  /** Regroup: discard up to this many cards, then draw that many. */
  regroupMax: number;
  /** Numeric spell effects get this much stronger when the caster's affinity matches. */
  affinityMatchBonus: number;
  /** Numeric spell effects get this much weaker when the caster's affinity is opposed. */
  affinityOpposedPenalty: number;
  /** Safety cap on total turns. Reaching it ends the game as a draw and counts as a bug. */
  maxTurns: number;
  /** Expected cards per team deck (used to check card data). */
  deckSize: number;

  // Experimental rule switches, used only by simulation what-ifs. Not in RULES.md.
  /** Who wins a tied pass. The rules say the defender. */
  passTiesGoTo: 'defender' | 'attacker';
  /** A player who just caught a pass can't be tackled until their team's next turn. The rules say 'off'. */
  protectCatch: 'off' | 'forward' | 'all';
  /** Actions per turn. The rules say 1. A goal ends the turn's actions. */
  actionsPerTurn: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  lanes: 2,
  goalsToWin: 3,
  handLimit: 7,
  setupExtraCards: 4,
  regroupMax: 2,
  affinityMatchBonus: 1,
  affinityOpposedPenalty: 1,
  maxTurns: 300,
  deckSize: 40,
  passTiesGoTo: 'defender',
  protectCatch: 'off',
  actionsPerTurn: 1,
};

export function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
