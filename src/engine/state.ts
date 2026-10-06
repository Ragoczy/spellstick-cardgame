// The full game state. This is the "real" table, including hidden cards. Players (human or
// computer) must never read it directly; they read viewFor(state, side) instead.

import type { Area, CardDef, Element, StatName, StatUse } from './cards';
import type { GameConfig } from './config';
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
}

export interface TeamState {
  /** Top of the deck is the end of the list. */
  deck: Uid[];
  hand: Uid[];
  /** Public. Newest card last. */
  discard: Uid[];
  goalie: Slot | null;
  /** Indexed by lane. null only during setup. */
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
}

export type ContestKind = 'faceoff' | 'pass' | 'tackle' | 'shot';
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
  | { kind: 'action'; side: Side }
  | { kind: 'reaction'; side: Side; role: ContestRole; contest: Contest }
  | { kind: 'discard'; side: Side; count: number }
  | { kind: 'gameOver' };

export type EndReason = 'goals' | 'deck_out' | 'sudden_death' | 'draw' | 'turn_cap';

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
    suddenDeath: boolean;
  };
  pending: Pending;
  result: GameResult | null;
}
