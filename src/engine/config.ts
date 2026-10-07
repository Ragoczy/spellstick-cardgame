// Every tuning number in the rules lives here (marked ⚙ in docs/RULES.md).
// Balance changes should be one-line edits to DEFAULT_CONFIG.

/** Stats an injury can lower. A goalie loses the injury's biggest penalty from Save instead. */
export type InjuryStat = 'speed' | 'shot' | 'defense' | 'faceoff';

/** One kind of injury card in the shared injury deck. */
export interface InjuryDef {
  id: string;
  name: string;
  /** How many of this card are in the injury deck. */
  count: number;
  /** Points taken off each stat while injured. */
  penalty: Partial<Record<InjuryStat, number>>;
}

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
  /** Actions per turn. A goal ends the turn. */
  actionsPerTurn: number;
  /** Penalty shots per team in a shootout before it goes to one shot each. */
  shootoutRounds: number;
  /** Added to the shooter's Shot in a penalty. */
  penaltyBonus: number;
  /** Who wins a tied pass: 'attacker' = the receiver catches it. */
  passTiesGoTo: 'defender' | 'attacker';
  /** The shared injury deck (12 cards), shuffled at setup. */
  injuries: InjuryDef[];

  // Experimental rule switch, used only by simulation what-ifs. Not in RULES.md.
  /** A player who just caught a pass can't be tackled until their team's next turn. The rules say 'off'. */
  protectCatch: 'off' | 'forward' | 'all';
  /** Whether an injured goalie injured again is carried off. The rules say true. */
  goalieCarryOff: boolean;
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
  actionsPerTurn: 2,
  shootoutRounds: 3,
  penaltyBonus: 0,
  passTiesGoTo: 'attacker',
  injuries: [
    { id: 'singed-hair', name: 'Singed hair', count: 3, penalty: { speed: 1 } },
    { id: 'broken-finger', name: 'Broken finger', count: 3, penalty: { shot: 2 } },
    { id: 'twisted-ankle', name: 'Twisted ankle', count: 3, penalty: { speed: 2 } },
    { id: 'bruised-ribs', name: 'Bruised ribs', count: 2, penalty: { defense: 2 } },
    { id: 'concussion', name: 'Concussion', count: 1, penalty: { speed: 1, shot: 1, defense: 1, faceoff: 1 } },
  ],
  protectCatch: 'off',
  goalieCarryOff: true,
};

export function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
