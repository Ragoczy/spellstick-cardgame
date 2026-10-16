// What the game server's collection API sends (server/collection.ts), shared with the browser
// (src/ui/online.ts). Types only: no code.

/** How a player got a card. */
export type CardSource = 'starter' | 'award' | 'store' | 'trade' | 'admin';

/** One card a player owns. cardId points at the card data (data/cards.prototype.json). */
export interface OwnedCard {
  instanceId: number;
  cardId: string;
  /** This copy's number among every copy of the card ever given out ("#12"). */
  serial: number;
  source: CardSource;
  /** Award cards only: what it was awarded for. Null for ordinary cards. */
  edition: CardEdition | null;
}

/**
 * An award card's edition (docs/spellstick-multiplayer-design.md, "Special award cards").
 * champion, knockout, and played come from a tournament; code from a redeem code.
 */
export interface CardEdition {
  kind: 'champion' | 'knockout' | 'played' | 'code';
  /** Shown on the card: "Spring Cup Champion, 1 of 1". */
  label: string;
  /** False for cards bound to the player who earned them (champions). Trading checks this later. */
  tradeable: boolean;
  foil?: boolean;
  tournamentId?: number;
}

/** A saved team: a name, a spell set, and owned player cards. */
export interface SavedTeam {
  id: number;
  name: string;
  /** The team in the card data whose 16 spells this team uses. */
  spellSet: string;
  /** Owned cards (instance ids) on the team. */
  cards: number[];
  /** Why the team can't play yet, in plain words. Empty when it's ready. */
  problems: string[];
  /** Constructed matches this team has finished. */
  record: { won: number; lost: number; drawn: number };
}

/** GET /api/collection: your cards and your saved teams. */
export interface Collection {
  cards: OwnedCard[];
  teams: SavedTeam[];
  /** Most teams you can save. */
  maxTeams: number;
}

/** POST /api/teams (new) and POST /api/teams/:id (change): what to save. */
export interface TeamInput {
  name: string;
  spellSet: string;
  cards: number[];
}
