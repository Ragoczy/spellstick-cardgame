// Creating a new game (RULES.md "Setup").

import { buildDeck, playerPool, type CardDef, type CardSet, type PlayerCardDef } from './cards';
import { makeConfig, type GameConfig, type InjuryDef } from './config';
import type { GameEvent } from './events';
import { AREAS, SIDES, type Side } from './field';
import { randomInt, seedToState, shuffle } from './rng';
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

  let rng = seedToState(setup.seed);
  let coin: number;
  [coin, rng] = randomInt(rng, 2);
  const firstSide: Side = coin === 0 ? 'A' : 'B';

  // The shared injury deck: one card id per injury card, shuffled.
  const injuryCards: Record<string, InjuryDef> = {};
  let n = 0;
  for (const injury of config.injuries) {
    for (let i = 0; i < injury.count; i++) injuryCards[`I${String(++n).padStart(2, '0')}`] = injury;
  }
  let injuryDeck: string[];
  [injuryDeck, rng] = shuffle(Object.keys(injuryCards), rng);

  // Players from the shared pool, if the card set has one. Card sets without a pool skip this
  // and use no randomness, so older saved games replay exactly as before.
  let dealt: Record<Side, PlayerCardDef[]> = { A: [], B: [] };
  if (playerPool(setup.cardSet, config).length > 0) [dealt, rng] = dealPool(setup.cardSet, config, teamIds, rng);

  for (const side of SIDES) {
    const deck = [...buildDeck(setup.cardSet, teamIds[side], config), ...dealt[side]];
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
      players: uids.filter((uid) => cards[uid]!.kind === 'field'),
      spells: uids.filter((uid) => cards[uid]!.kind === 'spell'),
      hand: goalies,
      discard: [],
      goalie: null,
      lineup: emptyLineup(config.lanes),
    };
  }

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
    ballProtected: false,
    actionsLeft: 0,
    // At the start, the second player chooses the faceoff lane.
    faceoffChooser: firstSide === 'A' ? 'B' : 'A',
    score: { A: 0, B: 0 },
    endgame: { finalTurnFor: null },
    shootout: null,
    injuryDeck,
    injuryCards,
    injuries: {},
    forcedSub: null,
    diceLeft: { A: config.diceBudget, B: config.diceBudget },
    pending: { kind: 'chooseGoalie', side: 'A' },
    result: null,
  };
  return { state, events: [{ type: 'gameStarted', firstSide }] };
}

/**
 * Deals each side its goalies and field players from the shared pool, at random. A dealt card
 * plays for the side's team for this game, so it shows that team's color.
 */
function dealPool(
  cardSet: CardSet, config: GameConfig, teamIds: Record<Side, string>, rng: number,
): [Record<Side, PlayerCardDef[]>, number] {
  const pool = playerPool(cardSet, config);
  let goalies = pool.filter((c) => c.kind === 'goalie');
  let field = pool.filter((c) => c.kind === 'field');
  if (goalies.length < 2 * config.deckGoalies) throw new SetupError(`The player pool needs at least ${2 * config.deckGoalies} goalies.`);
  if (field.length < 2 * config.deckFieldPlayers) throw new SetupError(`The player pool needs at least ${2 * config.deckFieldPlayers} field players.`);
  [goalies, rng] = shuffle(goalies, rng);
  [field, rng] = shuffle(field, rng);
  const dealt = { A: [], B: [] } as Record<Side, PlayerCardDef[]>;
  SIDES.forEach((side, i) => {
    const picks = [
      ...goalies.slice(i * config.deckGoalies, (i + 1) * config.deckGoalies),
      ...field.slice(i * config.deckFieldPlayers, (i + 1) * config.deckFieldPlayers),
    ];
    dealt[side] = picks.map((card) => ({ ...card, team: teamIds[side] }));
  });
  return [dealt, rng];
}
