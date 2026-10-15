// Every tuning number in the rules lives here (marked ⚙ in docs/RULES.md).
// Balance changes should be one-line edits to DEFAULT_CONFIG.

import type { PhysicalTier } from './cards';

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
  /** Setup: draw this many from the Spells pile (3 since v0.17, which shortened games by about a turn; 2 before). */
  setupSpells: number;
  /** Regroup: discard up to this many cards, then draw that many. */
  regroupMax: number;
  /** Numeric spell effects get this much stronger when the caster's affinity matches the spell's family. */
  affinityMatchBonus: number;
  /** Instead, this much stronger when the caster's affinity is exactly the spell's specialization. */
  affinitySpecialistBonus: number;
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
  /**
   * Every contest is rolled (v0.16): each player in a contest rolls a die this size and adds it,
   * before reaction spells (0 = off). Online matches started before v0.16 have 0.
   */
  contestDie: number;
  /**
   * Before v0.16 only shots and penalties were rolled, with a die this size. Used only when
   * contestDie is 0 (online matches started before v0.16).
   */
  shotDie: number;
  /** The shared injury deck (12 cards), shuffled at setup. */
  injuries: InjuryDef[];

  /** Roll tokens each player may spend in a game. Spent after the roll, before reaction spells. */
  diceBudget: number;
  /**
   * What a roll token does. 'reroll' (the rule since v0.16): reroll your own die in a contest.
   * 'call' (the old rule): call for dice in a contest that isn't rolled. Kept only so online
   * matches started before v0.16 replay the way they were played.
   */
  diceTokens: 'reroll' | 'call';
  /** The die used when someone calls for dice ('call' tokens only). */
  budgetDie: number;
  /**
   * Catch and shoot (v0.16): a player who just caught a pass can't be tackled until their team's
   * next turn. The rule is 'forward' (forwards only). Online matches started before v0.16 have
   * 'off'; 'all' is a simulation what-if.
   */
  protectCatch: 'off' | 'forward' | 'all';
  /**
   * Goalie clears (v0.16): a goalie holding the ball must pass it out as your action; if it has
   * nobody to pass to, the ball goes to a faceoff. Online matches started before this have false.
   */
  goalieMustClear: boolean;
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
  /**
   * What a Shield does to the opposing player's value (their stat after abilities and injuries,
   * or a hit's strength). 'minus' (the rule since v0.17): it loses shieldAmount, but not below 0.
   * 'half': it counts half, rounded up (a simulation what-if). 'zero' (the old rule): it counts as
   * 0 and their abilities and injuries are ignored; online matches started before v0.17 keep it.
   */
  shieldEffect: 'minus' | 'half' | 'zero';
  /** With shieldEffect 'minus': how much a Shield takes off. */
  shieldAmount: number;
  /**
   * Contact (v0.17): a successful tackle knocks the tackled player down (a Toughness check), and
   * every hurt rolls for severity: Shaken, Injured, or Knocked out. false (the old rule): only
   * hits and dirty plays hurt, and every hurt is an injury; online matches started before v0.17
   * keep it.
   */
  knockdowns: boolean;
  /** The die for Toughness checks, severity rolls, and knocked-out return rolls. */
  contactDie: number;
  /**
   * Toughness by player type, printed on each field player (scripts/generate-players.ts). A
   * knocked-down player is fine on a roll at or below their Toughness, and hurt above it.
   */
  toughnessByRole: Record<'stopper' | 'anchor' | 'playmaker' | 'allrounder' | 'runner' | 'striker', number>;
  /** Severity roll: up to `shaken` is Shaken, up to `injured` is Injured, anything higher Knocked out. */
  severity: { shaken: number; injured: number };
  /** Taken off every skill of a Shaken player in a contest. */
  shakenPenalty: number;
  /** At each faceoff, each knocked-out player goes back to their owner's hand on this roll or higher. */
  knockedOutReturn: number;
  /**
   * When dirty plays are played. 'before' (the rule since v0.17): declared as a foul before the
   * dice, and if the two contest dice match, the referee sends the fouler off for the game.
   * 'reaction' (the old rule): an ordinary reaction spell, played after the dice, with no
   * referee; online matches started before v0.17 keep it.
   */
  foulTiming: 'before' | 'reaction';
  /**
   * Physical attack cards (v0.17): each team has a Physical pile, and a player can attack the
   * opposing player in their spot as an action. false (the old rule): no physical cards; online
   * matches started before v0.17 keep it.
   */
  physicalAttacks: boolean;
  /** Cards in each team's Physical pile (one of each physical card, up to this many). */
  physicalPileSize: number;
  /**
   * How physical cards are played. 'hand' (the plan): drawn into the hand (2 at setup, 1 at each
   * faceoff) and chosen. 'blind' (Paul's idea, being tried 2026-10-15): never in the hand; an
   * attack flips the top card of the face-down Physical pile, so the move is decided in the moment.
   * A flipped card's own condition (only against the ball carrier, only against a Shaken player,
   * one lane over) is ignored, and Late Hit and Elbow are plain attacks: there are no reactions.
   */
  physicalDraw: 'hand' | 'blind';
  /**
   * With 'blind': each team can flip this many physical cards a game, and the pile isn't
   * reshuffled (0 = no limit, reshuffled when it runs out). A simulation what-if for now.
   */
  physicalAttackLimit: number;
  /** Physical cards drawn at setup, and by each team at each faceoff ('hand' only). */
  physicalSetupDraw: number;
  physicalFaceoffDraw: number;
  /** Added to an attack when the attacker has the body Affinity printed on the card. */
  affinityAttackBonus: number;
  /** A player holding the ball may make a physical attack. */
  attackWithBall: boolean;
  /** Against any physical attack: this Affinity adds to the target's Speed to dodge, */
  physicalDodge: { affinity: string; amount: number };
  /** and this one to their Toughness. */
  physicalEndurance: { affinity: string; amount: number };
  /** Turns in the penalty box, by the card's tier ('card'), or by what the attack did ('result'). */
  penaltyLength: 'card' | 'result';
  penaltyTurns: Record<PhysicalTier, number>;
  /** With penaltyLength 'result': turns for no hurt (or only Shaken), Injured, and Knocked out or carried off. */
  penaltyTurnsByResult: { none: number; injured: number; out: number };
  /** If the other team scores, a team's penalized players all come back at once. */
  powerPlayReturn: boolean;
  /** Nobody can be substituted into a penalized player's spot. */
  penaltyNoSubstitution: boolean;

  // Experimental rule switches, used only by simulation what-ifs. Not in RULES.md.
  /** With 'call' tokens: 'both' (the old rule) makes both players roll; only the caller pays. 'self': only the caller rolls. */
  diceMode: 'both' | 'self';
}

export const DEFAULT_CONFIG: GameConfig = {
  lanes: 2,
  goalsToWin: 3,
  handLimit: 7,
  setupExtraPlayers: 2,
  setupSpells: 3,
  regroupMax: 1,
  affinityMatchBonus: 1,
  affinitySpecialistBonus: 2,
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
  contestDie: 6,
  shotDie: 6,
  diceBudget: 3,
  diceTokens: 'reroll',
  budgetDie: 6,
  protectCatch: 'forward',
  goalieMustClear: true,
  mirrorImages: 2,
  castsPerResonant: 1,
  shieldEffect: 'minus',
  shieldAmount: 2,
  knockdowns: true,
  contactDie: 6,
  toughnessByRole: { stopper: 5, anchor: 5, playmaker: 4, allrounder: 4, runner: 3, striker: 3 },
  severity: { shaken: 3, injured: 5 },
  shakenPenalty: 2,
  knockedOutReturn: 4,
  foulTiming: 'before',
  physicalAttacks: true,
  physicalPileSize: 16,
  physicalDraw: 'hand',
  physicalAttackLimit: 0,
  physicalSetupDraw: 2,
  physicalFaceoffDraw: 1,
  affinityAttackBonus: 1,
  attackWithBall: false,
  physicalDodge: { affinity: 'divination.danger-sense', amount: 1 },
  physicalEndurance: { affinity: 'body.endurance', amount: 1 },
  penaltyLength: 'card',
  penaltyTurns: { minor: 1, major: 2, brutal: 3 },
  penaltyTurnsByResult: { none: 1, injured: 2, out: 3 },
  powerPlayReturn: true,
  penaltyNoSubstitution: true,
  injuries: [
    { id: 'singed-hair', name: 'Singed hair', count: 3, penalty: { speed: 1 } },
    { id: 'broken-finger', name: 'Broken finger', count: 3, penalty: { shot: 2 } },
    { id: 'twisted-ankle', name: 'Twisted ankle', count: 3, penalty: { speed: 2 } },
    { id: 'bruised-ribs', name: 'Bruised ribs', count: 2, penalty: { defense: 2 } },
    { id: 'concussion', name: 'Concussion', count: 1, penalty: { speed: 1, shot: 1, defense: 1, faceoff: 1 } },
  ],
  diceMode: 'both',
};

/** Picks each team makes in a draft game (set config.draftPicks to this to play one). */
export const DRAFT_PICKS = 10;

export function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
