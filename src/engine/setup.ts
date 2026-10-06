// Creating a new game (RULES.md "Setup").

import { buildDeck, type CardDef, type CardSet } from './cards';
import { makeConfig, type GameConfig } from './config';
import type { GameEvent } from './events';
import { AREAS, SIDES, type Side } from './field';
import { randomInt, seedToState } from './rng';
import type { GameState, TeamState, Uid } from './state';

export interface GameSetup {
  seed: number;
  cardSet: CardSet;
  /** Which team in the card set plays each side. Defaults to A: "A", B: "B". */
  teams?: Record<Side, string>;
  config?: Partial<GameConfig>;
}

export class SetupError extends Error {}

function emptyLineup(lanes: number): TeamState['lineup'] {
  const lineup = {} as TeamState['lineup'];
  for (const area of AREAS) lineup[area] = Array.from({ length: lanes }, () => null);
  return lineup;
}

/**
 * Starts a game. Each side then decides, in order:
 * A chooses a goalie, B chooses a goalie, A places its lineup, B places its lineup,
 * then the opening faceoff.
 */
export function createGame(setup: GameSetup): { state: GameState; events: GameEvent[] } {
  const config = makeConfig(setup.config);
  const teamIds = setup.teams ?? { A: 'A', B: 'B' };
  const cards: Record<Uid, CardDef> = {};
  const teams = {} as Record<Side, TeamState>;
  const spots = 3 * config.lanes;

  for (const side of SIDES) {
    const deck = buildDeck(setup.cardSet, teamIds[side], config);
    const uids = deck.map((def, i) => {
      const uid = `${side}${String(i + 1).padStart(2, '0')}`;
      cards[uid] = def;
      return uid;
    });
    const goalies = uids.filter((uid) => cards[uid]!.kind === 'goalie');
    const fieldCount = uids.filter((uid) => cards[uid]!.kind === 'field').length;
    if (goalies.length < 1) throw new SetupError(`Team ${teamIds[side]} has no goalie.`);
    if (fieldCount < spots) throw new SetupError(`Team ${teamIds[side]} needs at least ${spots} field players.`);
    // The goalies start in hand so the player can choose one; everything else is the deck.
    teams[side] = {
      deck: uids.filter((uid) => cards[uid]!.kind !== 'goalie'),
      hand: goalies,
      discard: [],
      goalie: null,
      lineup: emptyLineup(config.lanes),
    };
  }

  let rng = seedToState(setup.seed);
  let coin: number;
  [coin, rng] = randomInt(rng, 2);
  const firstSide: Side = coin === 0 ? 'A' : 'B';

  const state: GameState = {
    config,
    elements: [...setup.cardSet.elements],
    opposedPairs: setup.cardSet.opposedPairs.map(([x, y]) => [x, y] as [string, string]),
    cards,
    rng,
    turn: 0,
    firstSide,
    activeSide: firstSide,
    teams,
    ball: null,
    // At the start, the second player chooses the faceoff lane.
    faceoffChooser: firstSide === 'A' ? 'B' : 'A',
    score: { A: 0, B: 0 },
    endgame: { finalTurnFor: null, suddenDeath: false },
    pending: { kind: 'chooseGoalie', side: 'A' },
    result: null,
  };
  return { state, events: [{ type: 'gameStarted', firstSide }] };
}
