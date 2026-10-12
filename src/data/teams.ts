// Saved teams for online Constructed play (RULES.md "Constructed"): the starter set every player
// gets, and the spell sets a team can use. Shared by the game server and the browser.
//
// Players own their player cards. Spells aren't collected yet: each saved team uses the 16
// spells of one of the teams in the card set (a "spell set").

import raw from '../../data/starter.json';
import { buildDeck, deckProblems, type CardSet, type GameConfig } from '../engine';

export interface StarterSet {
  /** The name of the team made from the starter set. */
  teamName: string;
  /** The team in the card set whose spells the starter team uses. */
  spellSet: string;
  /** Player card ids: 2 goalies and 22 field players. */
  players: string[];
}

export const starterSet: StarterSet = raw;

/** Most teams one player can save. */
export const MAX_TEAMS = 10;
export const TEAM_NAME_MIN = 3;
export const TEAM_NAME_MAX = 30;

export interface SpellSet {
  id: string;
  name: string;
  /** One id per card (a spell with two copies is listed twice). */
  spellIds: string[];
}

/** The spell sets a saved team can choose from: each team in the card set that has spells. */
export function spellSets(cardSet: CardSet, config: GameConfig): SpellSet[] {
  return cardSet.teams
    .map((team) => ({
      id: team.id,
      name: `${team.name} spells`,
      spellIds: buildDeck(cardSet, team.id, config).filter((c) => c.kind === 'spell').map((c) => c.id),
    }))
    .filter((set) => set.spellIds.length > 0);
}

/** A saved team's full deck: its players plus its spell set, as card ids for GameSetup.decks. */
export function teamDeck(cardSet: CardSet, config: GameConfig, playerIds: readonly string[], spellSetId: string): string[] {
  const spells = spellSets(cardSet, config).find((s) => s.id === spellSetId);
  return [...playerIds, ...(spells?.spellIds ?? [])];
}

/** What's wrong with a saved team, in plain words (empty when it's ready to play). */
export function teamProblems(cardSet: CardSet, config: GameConfig, playerIds: readonly string[], spellSetId: string): string[] {
  if (!spellSets(cardSet, config).some((s) => s.id === spellSetId)) return ['Choose a spell set.'];
  const byId = new Map(cardSet.cards.map((c) => [c.id, c]));
  if (playerIds.some((id) => byId.get(id)?.kind === 'spell')) return ['Spells come from the spell set, not the player list.'];
  return deckProblems(cardSet, teamDeck(cardSet, config, playerIds, spellSetId), config);
}
