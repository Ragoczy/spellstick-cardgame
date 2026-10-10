// Every tuning number in the rules lives here (marked ⚙ in docs/RULES.md).
// Balance changes should be one-line edits to DEFAULT_CONFIG.

/** Stats an injury can lower. (Goalies can't be injured.) */
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
  /** Setup: draw players for every field spot + this many more, from the Players pile. */
  setupExtraPlayers: number;
  /** Setup: draw this many from the Spells pile. */
  setupSpells: number;
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
  /** Goalies per deck. Decks dealt from the shared player pool get this many. */
  deckGoalies: number;
  /** Field players per deck. Decks dealt from the shared player pool get this many. */
  deckFieldPlayers: number;
  /** Draft (RULES.md "Draft"): players each team picks from a face-up pool before the game. 0 = no draft, players are dealt. */
  draftPicks: number;
  /**
   * Draft pool: this many goalies and field players, face up (both teams' picks plus spares).
   * Goalies are left out by default: Save varies so much that whoever picked first got the best
   * goalie and won 58% of games in the simulator; dealing goalies at random keeps it at 50%.
   */
  draftPoolGoalies: number;
  draftPoolField: number;
  /** Actions per turn. A goal ends the turn. */
  actionsPerTurn: number;
  /**
   * When you may substitute. 'draw' (the rule since v0.11): instead of drawing, and the player who
   * comes on can't act that turn. 'action' (the old rule): as your action. Kept only so online
   * matches started before v0.11 replay the way they were played.
   */
  substituteStep: 'draw' | 'action';
  /** Penalty shots per team in a shootout before it goes to one shot each. */
  shootoutRounds: number;
  /** Added to the shooter's Shot in a penalty. */
  penaltyBonus: number;
  /** Who wins a tied pass: 'attacker' = the receiver catches it. */
  passTiesGoTo: 'defender' | 'attacker';
  /** Added to the receiver's Speed in every pass. */
  passBonus: number;
  /** Shots and penalties are always rolled: the shooter and the goalie each roll a die this size and add it (0 = off). */
  shotDie: number;
  /** The shared injury deck (12 cards), shuffled at setup. */
  injuries: InjuryDef[];

  /** Rolls each player may spend in a game ("call for dice"). Spent after the reveal, before reaction spells. */
  diceBudget: number;
  /** The die used when someone calls for dice. */
  budgetDie: number;
  /**
   * mirror_images: how many false images a glamoured player has. Each tackle or hit against them
   * finds the real one with a chance of 1 in (images + 1).
   */
  mirrorImages: number;
  /**
   * Casting limit: a player on the field can cast this many spells per Resonant, then has to be
   * substituted out to recharge. 0 = no limit.
   */
  castsPerResonant: number;

  // Experimental rule switches, used only by simulation what-ifs. Not in RULES.md.
  /** 'both' (the rule): calling for dice makes both players roll; only the caller pays. 'self': only the caller rolls. */
  diceMode: 'both' | 'self';
  /** Each player in every contest rolls a die this size and adds it (0 = off). */
  contestDie: number;
  /** A player who just caught a pass can't be tackled until their team's next turn. The rules say 'off'. */
  protectCatch: 'off' | 'forward' | 'all';
}

export const DEFAULT_CONFIG: GameConfig = {
  lanes: 2,
  goalsToWin: 3,
  handLimit: 7,
  setupExtraPlayers: 2,
  setupSpells: 2,
  regroupMax: 1,
  affinityMatchBonus: 1,
  affinityOpposedPenalty: 1,
  maxTurns: 300,
  deckSize: 40,
  deckGoalies: 2,
  deckFieldPlayers: 22,
  draftPicks: 0,
  draftPoolGoalies: 0,
  draftPoolField: 30,
  actionsPerTurn: 1,
  substituteStep: 'draw',
  shootoutRounds: 3,
  penaltyBonus: 3,
  passTiesGoTo: 'attacker',
  passBonus: 2,
  shotDie: 6,
  diceBudget: 5,
  budgetDie: 6,
  mirrorImages: 2,
  castsPerResonant: 1,
  injuries: [
    { id: 'singed-hair', name: 'Singed hair', count: 3, penalty: { speed: 1 } },
    { id: 'broken-finger', name: 'Broken finger', count: 3, penalty: { shot: 2 } },
    { id: 'twisted-ankle', name: 'Twisted ankle', count: 3, penalty: { speed: 2 } },
    { id: 'bruised-ribs', name: 'Bruised ribs', count: 2, penalty: { defense: 2 } },
    { id: 'concussion', name: 'Concussion', count: 1, penalty: { speed: 1, shot: 1, defense: 1, faceoff: 1 } },
  ],
  protectCatch: 'off',
  contestDie: 0,
  diceMode: 'both',
};

/** Picks each team makes in a draft game (set config.draftPicks to this to play one). */
export const DRAFT_PICKS = 10;

export function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
