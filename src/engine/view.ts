// What one player is allowed to see. The UI and the computer opponent read this, never the raw
// GameState. The opponent's face-down cards appear only as "unknown" (no id, no stats) unless
// this player has scried them. The opponent's hand and both decks appear only as counts.

import type { Area } from './cards';
import type { GameConfig, InjuryDef } from './config';
import { cardView, injuryOf } from './board';
import type { CardView, GameEvent } from './events';
import { AREAS, otherSide, type Pos, type Side } from './field';
import type { GameResult, GameState, Pending, Shootout, Slot } from './state';

export type SlotView =
  | { state: 'empty' }
  /** An opponent's face-down card you haven't seen. */
  | { state: 'unknown'; injury?: InjuryDef }
  /** Your own face-down card (scried = your opponent has seen it), or an opponent's card you scried. */
  | { state: 'faceDown'; card: CardView; scried: boolean }
  /** images: the player has mirror images around them (public). */
  | { state: 'revealed'; card: CardView; images?: boolean };

export interface PlayerView {
  me: Side;
  /** The rules settings for this game (public). */
  config: GameConfig;
  turn: number;
  activeSide: Side;
  firstSide: Side;
  lanes: number;
  elements: string[];
  opposedPairs: [string, string][];
  score: Record<Side, number>;
  ball: { side: Side; pos: Pos } | null;
  /** Experimental rule: the holder can't be tackled yet. */
  ballProtected: boolean;
  faceoffChooser: Side;
  endgame: { finalTurnFor: Side | null };
  shootout: Shootout | null;
  /** Injury cards left in the shared injury deck. */
  injuryDeckCount: number;
  /** Rolls each side has left to spend (public). */
  diceLeft: Record<Side, number>;
  /** A forced substitution waiting to happen (public). */
  forcedSub: { side: Side; pos: Pos } | null;
  /** What the game is waiting for. All of it is public information. */
  pending: Pending;
  /** Actions the active player has left this turn. */
  actionsLeft: number;
  result: GameResult | null;
  mine: {
    hand: CardView[];
    /** Cards left in both draw piles, and in each. */
    deckCount: number;
    playersLeft: number;
    spellsLeft: number;
    discard: CardView[];
    goalie: SlotView;
    lineup: Record<Area, SlotView[]>;
  };
  opponent: {
    handCount: number;
    deckCount: number;
    playersLeft: number;
    spellsLeft: number;
    discard: CardView[];
    goalie: SlotView;
    lineup: Record<Area, SlotView[]>;
  };
}

function slotView(s: GameState, slot: Slot | null, mine: boolean): SlotView {
  if (!slot) return { state: 'empty' };
  if (slot.revealed) return slot.images ? { state: 'revealed', card: cardView(s, slot.uid), images: true } : { state: 'revealed', card: cardView(s, slot.uid) };
  if (mine || slot.scried) return { state: 'faceDown', card: cardView(s, slot.uid), scried: slot.scried };
  // Injury cards are face up, so an injury shows even on a player you can't see.
  const injury = injuryOf(s, slot.uid);
  return injury ? { state: 'unknown', injury } : { state: 'unknown' };
}

function lineupView(s: GameState, side: Side, mine: boolean): Record<Area, SlotView[]> {
  const result = {} as Record<Area, SlotView[]>;
  for (const area of AREAS) result[area] = s.teams[side].lineup[area].map((slot) => slotView(s, slot, mine));
  return result;
}

export function viewFor(s: GameState, me: Side): PlayerView {
  const them = otherSide(me);
  const my = s.teams[me];
  const their = s.teams[them];
  return structuredClone({
    me,
    config: s.config,
    turn: s.turn,
    activeSide: s.activeSide,
    firstSide: s.firstSide,
    lanes: s.config.lanes,
    elements: s.elements,
    opposedPairs: s.opposedPairs,
    score: s.score,
    ball: s.ball,
    ballProtected: s.ballProtected,
    faceoffChooser: s.faceoffChooser,
    endgame: s.endgame,
    // Only your own shooters are listed (the screen only needs to know who of yours has shot).
    shootout: s.shootout ? { ...s.shootout, shooters: s.shootout.shooters.filter((uid) => uid.startsWith(me)) } : null,
    injuryDeckCount: s.injuryDeck.length,
    diceLeft: s.diceLeft,
    forcedSub: s.forcedSub ? { side: s.forcedSub.side, pos: s.forcedSub.pos } : null,
    pending: s.pending,
    actionsLeft: s.actionsLeft,
    result: s.result,
    mine: {
      hand: my.hand.map((uid) => cardView(s, uid)),
      deckCount: my.players.length + my.spells.length,
      playersLeft: my.players.length,
      spellsLeft: my.spells.length,
      discard: my.discard.map((uid) => cardView(s, uid)),
      goalie: slotView(s, my.goalie, true),
      lineup: lineupView(s, me, true),
    },
    opponent: {
      handCount: their.hand.length,
      deckCount: their.players.length + their.spells.length,
      playersLeft: their.players.length,
      spellsLeft: their.spells.length,
      discard: their.discard.map((uid) => cardView(s, uid)),
      goalie: slotView(s, their.goalie, false),
      lineup: lineupView(s, them, false),
    },
  });
}

/** One player's copy of the events: secrets belonging to the other player are removed. */
export function eventsFor(events: GameEvent[], viewer: Side): GameEvent[] {
  return events.map((event) => {
    if ('secret' in event && event.side !== viewer) {
      const { secret: _hidden, ...rest } = event;
      return rest as GameEvent;
    }
    return event;
  });
}
