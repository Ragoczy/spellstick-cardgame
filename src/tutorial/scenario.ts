// The tutorial game's fixed scenario (data/tutorial.json, docs/tutorial-design.md): both decks in
// draw order, the computer's goalie and lineup, the coach's suggested lineup, a few config
// settings, and the seed. It's an ordinary game created with fixed decks, so it replays like any
// other.

import raw from '../../data/tutorial.json';
import {
  AREAS, deckProblems, makeConfig, type Area, type CardSet, type GameConfig, type GameSetup, type Side,
} from '../engine';

export interface TutorialTeam {
  /** The team in the card set whose color the cards play in. */
  team: string;
  /** Card ids, in the order they're drawn. */
  goalies: string[];
  players: string[];
  spells: string[];
  /** The goalie to put in goal, and who goes where (by lane). */
  goalie: string;
  lineup: Record<Area, string[]>;
}

export interface TutorialScenario {
  seed: number;
  firstSide: Side;
  config: Partial<GameConfig>;
  /** The person (side A). Their goalie and lineup are the coach's suggestions. */
  player: TutorialTeam;
  /** The computer (side B). Its goalie and lineup are placed as listed. */
  computer: TutorialTeam;
}

export const TUTORIAL: TutorialScenario = raw as TutorialScenario;

/** The person is side A and the computer side B, as in every game against the computer. */
export const TUTORIAL_HUMAN: Side = 'A';
export const TUTORIAL_COMPUTER: Side = 'B';

export function tutorialConfig(scenario: TutorialScenario = TUTORIAL): GameConfig {
  return makeConfig(scenario.config);
}

const deckOf = (t: TutorialTeam) => [...t.goalies, ...t.players, ...t.spells];

/** The game setup for the tutorial. A different seed is only for finding a good one. */
export function tutorialSetup(cardSet: CardSet, seed?: number, scenario: TutorialScenario = TUTORIAL): GameSetup {
  return {
    seed: seed ?? scenario.seed,
    cardSet,
    config: scenario.config,
    teams: { A: scenario.player.team, B: scenario.computer.team },
    decks: { A: deckOf(scenario.player), B: deckOf(scenario.computer) },
    scenario: { stackedPiles: true, firstSide: scenario.firstSide },
  };
}

/** What's wrong with a scenario, in plain language (empty when it's fine). */
export function tutorialProblems(cardSet: CardSet, scenario: TutorialScenario = TUTORIAL): string[] {
  const config = tutorialConfig(scenario);
  const problems: string[] = [];
  const spots = 3 * config.lanes;
  for (const [who, t] of [['player', scenario.player], ['computer', scenario.computer]] as const) {
    problems.push(...deckProblems(cardSet, deckOf(t), config).map((p) => `${who}: ${p}`));
    if (!t.goalies.includes(t.goalie)) problems.push(`${who}: the goalie ${t.goalie} isn't one of the team's goalies.`);
    // The lineup must come from the players drawn at setup: one per spot, plus the extras.
    const opening = new Set(t.players.slice(0, spots + config.setupExtraPlayers));
    const placed = AREAS.flatMap((area) => t.lineup[area] ?? []);
    if (placed.length !== spots) problems.push(`${who}: the lineup needs ${spots} players (it has ${placed.length}).`);
    if (new Set(placed).size !== placed.length) problems.push(`${who}: a player is in the lineup twice.`);
    for (const id of placed) if (!opening.has(id)) problems.push(`${who}: ${id} in the lineup isn't in the opening hand.`);
    for (const area of AREAS) {
      if ((t.lineup[area] ?? []).length !== config.lanes) problems.push(`${who}: ${area} needs ${config.lanes} players.`);
    }
  }
  return problems;
}
