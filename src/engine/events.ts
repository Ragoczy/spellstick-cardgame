// Events describe what happened, in order, so the UI can animate it and explain it in plain
// language. Anything only one player may know goes in `secret`; eventsFor() strips it from
// the other player's copy.

import type { CardDef, StatName } from './cards';
import type { InjuryDef } from './config';
import type { FieldPos, Pos, Side } from './field';
import type { Affinity, ContestKind, ContestRole, GameResult, Pile, Uid } from './state';

/** A card as a player sees it. Injury cards are face up, so an injury is shown with its player. */
export interface CardView {
  uid: Uid;
  def: CardDef;
  injury?: InjuryDef;
}

export interface BreakdownPart {
  label: string;
  amount: number;
}

/** How one side's contest value was worked out, e.g. Speed 4 + Boost 3 = 7. */
export interface Breakdown {
  side: Side;
  pos: Pos;
  /** null if the spot is empty (a player was carried off). */
  card: CardView | null;
  stat: StatName;
  /** Shown instead of the stat name when the value isn't a stat (a hit's strength). */
  baseLabel?: string;
  /** The printed stat (0 if shielded under the old zero Shield; the v0.17 Shield is a "Shield" part). */
  base: number;
  /** Abilities, spells, and modifiers added to the base. */
  parts: BreakdownPart[];
  total: number;
  shielded: boolean;
  /** The value from the printed card alone (stat, ability, injury), before spells and dice. */
  printed: number;
}

export type DrawReason = 'setup' | 'turn' | 'recall' | 'ability' | 'regroup';
/** What hurt a player: a hit, a dirty play, or (v0.17) being knocked down by a tackle. */
export type InjurySource = 'hit' | 'dirty_play' | 'tackle';
/** How badly a player was hurt (v0.17). */
export type Severity = 'shaken' | 'injured' | 'knockedOut';

export type GameEvent =
  | { type: 'gameStarted'; firstSide: Side }
  /** Draft: a pick from the face-up pool (public). */
  | { type: 'drafted'; side: Side; card: CardView }
  /** Draft over: each team's other players have been dealt at random (who they are stays hidden). */
  | { type: 'draftFinished' }
  | { type: 'goalieChosen'; side: Side; secret?: { card: CardView } }
  | { type: 'drew'; side: Side; count: number; reason: DrawReason; pile: Pile; secret?: { cards: CardView[] } }
  | { type: 'placed'; side: Side; pos: FieldPos; secret?: { card: CardView } }
  | { type: 'faceoffStarted'; chooser: Side; lane: number }
  | { type: 'turnStarted'; side: Side; turn: number }
  | { type: 'deckOut'; side: Side; finalTurnFor: Side }
  | { type: 'revealed'; side: Side; pos: Pos; card: CardView }
  | {
      type: 'contestStarted';
      kind: ContestKind;
      attacker: { side: Side; pos: Pos; roll?: number };
      defender: { side: Side; pos: Pos; roll?: number };
    }
  | {
      type: 'spellCast';
      side: Side;
      card: CardView;
      caster: Pos;
      affinity: Affinity;
      /** True if an opposed non-numeric spell had no effect. */
      fizzled: boolean;
    }
  | { type: 'contestResolved'; kind: ContestKind; attacker: Breakdown; defender: Breakdown; winner: Side; winnerRole: ContestRole }
  | { type: 'ballMoved'; side: Side; pos: Pos }
  | { type: 'goal'; side: Side; score: Record<Side, number> }
  /** Goalie clears: this side's goalie had the ball but nobody to pass to, so it goes to a faceoff. */
  | { type: 'goalieCantClear'; side: Side }
  /** The replaced player goes to hand. `removed` is null if they were face down (only their owner knows who). */
  /** A player in a contest has used up their casting limit, so their side can't play a reaction spell (public). */
  | { type: 'outOfSpells'; side: Side; pos: Pos }
  | { type: 'substituted'; side: Side; pos: Pos; removed: CardView | null; secret?: { removed: CardView } }
  | { type: 'swapped'; side: Side; a: FieldPos; b: FieldPos }
  | { type: 'scried'; side: Side; target: Pos; secret?: { card: CardView } }
  /**
   * decoy_pass: `side` passed to `to` without a contest; the opponent went for `decoy` (their own
   * spot in another lane of that row) instead. The receiver stays face down.
   */
  | { type: 'decoyPass'; side: Side; to: FieldPos; decoy: FieldPos }
  /** mirror_images: `side`'s player at `pos` now has false images around them. */
  | { type: 'imagesCast'; side: Side; pos: FieldPos }
  /**
   * A tackle or hit went for `side`'s glamoured player at `pos`. fooled: it went for an image and
   * missed. Otherwise it found the real player, the images are gone, and the action goes ahead.
   */
  | { type: 'imagesTested'; side: Side; pos: FieldPos; action: 'tackle' | 'hit'; fooled: boolean }
  /** fromPile: a full hand at the draw step, so the top card of that pile went to the discard pile. */
  | { type: 'discarded'; side: Side; cards: CardView[]; fromPile?: Pile }
  | { type: 'shootoutStarted'; first: Side }
  /** A player called for dice: both players rolled (only the caller spent a roll). Old 'call' tokens only. */
  | { type: 'diceRolled'; caller: Side; attacker: Side; attackerRoll?: number; defenderRoll?: number; left: Record<Side, number> }
  /** A player spent a roll token to reroll their own die in a contest. */
  | { type: 'rerolled'; side: Side; role: ContestRole; from: number; to: number; left: Record<Side, number> }
  | {
      type: 'injured';
      side: Side;
      pos: Pos;
      card: CardView;
      /** The injury card drawn, or null if the injury deck was empty or the player was carried off. */
      injury: InjuryDef | null;
      source: InjurySource;
      /** The spell that did it, e.g. "Flambé" or "Red Mist". */
      cause: string;
      /** Already injured, so carried off and discarded. */
      carriedOff: boolean;
    }
  /** A forced substitution: a new player comes on face down. `toHand` is the injured player going to hand. */
  | { type: 'forcedSub'; side: Side; pos: Pos; toHand: CardView | null }
  /**
   * A tackle knocked a player down (v0.17): they rolled against their Toughness, fine at or below
   * it, hurt above it.
   */
  | { type: 'knockedDown'; side: Side; pos: Pos; card: CardView; toughness: number; roll: number; hurt: boolean }
  /**
   * A player was hurt and rolled for how badly (v0.17). An injury is followed by an 'injured'
   * event; a knocked-out player leaves the field (then a forced substitution, or an empty spot).
   * until: a Shaken player stands up at the end of this turn.
   */
  | { type: 'hurt'; side: Side; pos: Pos; card: CardView; source: InjurySource; cause: string; roll: number; result: Severity; until?: number }
  /** A Shaken player stood up: at the end of their team's turn, or at full time. */
  | { type: 'stoodUp'; side: Side; pos: Pos; card: CardView }
  /** At a faceoff, a knocked-out player rolled to come back: returned means back in the hand. */
  | { type: 'returnRoll'; side: Side; card: CardView; roll: number; returned: boolean }
  /** Nobody could replace a carried-off player: the spot is empty. */
  | { type: 'slotEmptied'; side: Side; pos: Pos }
  | { type: 'mended'; side: Side; card: CardView; injury: InjuryDef }
  | { type: 'penalty'; side: Side; scored: boolean; goals: Record<Side, number>; taken: Record<Side, number> }
  | { type: 'gameOver'; result: GameResult };
