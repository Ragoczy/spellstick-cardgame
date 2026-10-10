// The full game state. This is the "real" table, including hidden cards. Players (human or
// computer) must never read it directly; they read viewFor(state, side) instead.

import type { Area, CardDef, Element, StatName, StatUse } from './cards';
import type { GameConfig, InjuryDef } from './config';
import type { Pos, Side } from './field';

/** A card instance id within one game, e.g. "A07". Every physical card has its own. */
export type Uid = string;

/** One player card on the field. */
export interface Slot {
  uid: Uid;
  /** Face up for everyone. */
  revealed: boolean;
  /** The opponent has looked at this face-down card with a scry. Follows the card if swapped. */
  scried: boolean;
  /**
   * mirror_images: this player has false images around them (public). Stays with the slot, so it
   * ends when the player leaves the field.
   */
  images?: boolean;
  /**
   * Spells this player has cast since coming on the field (public: casting reveals the caster).
   * Starts again when they leave the field, so it follows the card if swapped.
   */
  casts?: number;
  /** Substituted on at the Draw step this turn: can't pass, shoot, tackle, or cast until the turn ends. */
  cameOn?: boolean;
}

/** The two face-down draw piles each team has. */
export type Pile = 'players' | 'spells';

export interface TeamState {
  /** Draw pile of field players (and the spare goalie). Top of the pile is the end of the list. */
  players: Uid[];
  /** Draw pile of spells. Top of the pile is the end of the list. */
  spells: Uid[];
  hand: Uid[];
  /** Public. Newest card last. */
  discard: Uid[];
  /** null during setup, or if the goalie was carried off with nobody to replace them. */
  goalie: Slot | null;
  /** Indexed by lane. null during setup, or if a player was carried off with nobody to replace them. */
  lineup: Record<Area, (Slot | null)[]>;
}

export type Affinity = 'match' | 'neutral' | 'opposed';

/** A reaction spell played in a contest. */
export interface PlayedSpell {
  uid: Uid;
  affinity: Affinity;
  /** A non-numeric spell cast with an opposed affinity has no effect. */
  fizzled: boolean;
}

export interface Modifier {
  /** Plain-language label, e.g. "Steal". */
  label: string;
  amount: number;
}

export interface ContestSide {
  side: Side;
  pos: Pos;
  stat: StatName;
  use: StatUse;
  spell: PlayedSpell | null;
  /** Bonuses from the action spell that started the contest (steal, long shot). */
  modifiers: Modifier[];
  /** A hit's strength, used instead of the player's stat (no abilities or injuries apply). */
  power?: { label: string; value: number };
  /** This side's die roll in this contest, if dice were called. */
  roll?: number;
}

export type ContestKind = 'faceoff' | 'pass' | 'tackle' | 'shot' | 'penalty' | 'hit';
export type ContestRole = 'attacker' | 'defender';

export interface Contest {
  kind: ContestKind;
  /** Plays a reaction spell first. In a faceoff, the team choosing the lane. */
  attacker: ContestSide;
  defender: ContestSide;
  /** Who wins a tie: the defender, except at faceoffs where it's the chooser (the attacker). */
  tiesGoTo: ContestRole;
}

/** The decision the engine is waiting for, and who must make it. */
export type Pending =
  | { kind: 'chooseGoalie'; side: Side }
  | { kind: 'placeLineup'; side: Side }
  | { kind: 'faceoffLane'; side: Side }
  /** Draw step: draw from a pile, or substitute instead (asked when there is a choice to make). */
  | { kind: 'draw'; side: Side }
  | { kind: 'action'; side: Side }
  | { kind: 'reaction'; side: Side; role: ContestRole; contest: Contest }
  /** Call for dice in this contest (spend one of your rolls)? */
  | { kind: 'callDice'; side: Side; role: ContestRole; contest: Contest }
  | { kind: 'discard'; side: Side; count: number }
  /** A player was injured or carried off: their owner must bring on a substitute from hand. */
  | { kind: 'forcedSub'; side: Side; pos: Pos }
  | { kind: 'shootoutPick'; side: Side }
  | { kind: 'gameOver' };

/**
 * goals: reached the goal target. time: more goals when the cards ran out. shootout: won the
 * penalty shootout. draw: the shootout ran out of shooters. turn_cap: safety cap (a bug).
 */
export type EndReason = 'goals' | 'time' | 'shootout' | 'draw' | 'turn_cap';

export interface Shootout {
  /** Shoots first in each round: the team that didn't take the last turn. */
  first: Side;
  taken: Record<Side, number>;
  goals: Record<Side, number>;
  /** Players who have already taken a penalty (each player shoots at most once). */
  shooters: Uid[];
}

export interface GameResult {
  /** null for a draw. */
  winner: Side | null;
  reason: EndReason;
}

export interface GameState {
  config: GameConfig;
  elements: Element[];
  opposedPairs: [Element, Element][];
  /** Definition for every card instance in the game. */
  cards: Record<Uid, CardDef>;
  /** Seeded RNG state. */
  rng: number;
  /** Turns taken so far. 0 during setup and the opening faceoff. */
  turn: number;
  firstSide: Side;
  activeSide: Side;
  teams: Record<Side, TeamState>;
  /** The ball holder, or null while a faceoff is due. */
  ball: { side: Side; pos: Pos } | null;
  /** Experimental (config.protectCatch): the holder just caught a pass and can't be tackled yet. */
  ballProtected: boolean;
  /** Actions the active player may still take this turn (experimental config.actionsPerTurn). */
  actionsLeft: number;
  /** Who chooses the lane at the next faceoff. */
  faceoffChooser: Side;
  score: Record<Side, number>;
  endgame: {
    /** Set when a deck runs out: this team takes the last turn of the game. */
    finalTurnFor: Side | null;
  };
  /** The penalty shootout, once it has started. */
  shootout: Shootout | null;
  /** The shared injury deck: injury card ids, top of the deck last. */
  injuryDeck: string[];
  /** The kind of each injury card, by injury card id (e.g. "I03" -> Singed hair). */
  injuryCards: Record<string, InjuryDef>;
  /** Injuries attached to players, by player card id -> injury card id. */
  injuries: Record<Uid, string>;
  /** Rolls each side has left to spend this game (config.diceBudget at the start). */
  diceLeft: Record<Side, number>;
  /** A forced substitution waiting to happen. `injured` is the injured player still in the spot (null if carried off). */
  forcedSub: { side: Side; pos: Pos; injured: Uid | null } | null;
  pending: Pending;
  result: GameResult | null;
}
