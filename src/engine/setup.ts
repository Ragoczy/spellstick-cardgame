// Creating a new game (RULES.md "Setup"), including the optional draft (RULES.md "Draft") and
// decks a team brings itself (RULES.md "Constructed").

import { buildDeck, deckProblems, PHYSICAL_TEAM, playerPool, type CardDef, type CardSet, type PlayerCardDef } from './cards';
import { makeConfig, type GameConfig, type InjuryDef } from './config';
import type { GameEvent } from './events';
import { AREAS, SIDES, type Side } from './field';
import { randomInt, seedToState, shuffle } from './rng';
import type { DraftState, GameState, TeamState } from './state';

export interface GameSetup {
  seed: number;
  cardSet: CardSet;
  /** Which team in the card set plays each side. Defaults to A: "A", B: "B". */
  teams?: Record<Side, string>;
  config?: Partial<GameConfig>;
  /**
   * Constructed (RULES.md "Constructed"): the cards each side brings, by card id, one id per card,
   * instead of dealing players from the pool. Each card plays for its side's team. Online saved
   * teams use this.
   */
  decks?: Record<Side, string[]>;
}

export class SetupError extends Error {}

function emptyLineup(lanes: number): TeamState['lineup'] {
  const lineup = {} as TeamState['lineup'];
  for (const area of AREAS) lineup[area] = Array.from({ length: lanes }, () => null);
  return lineup;
}

/**
 * Starts a game. Each side then decides, in order:
 * (the draft, if config.draftPicks > 0), A chooses a goalie, B chooses a goalie, A places its
 * lineup, B places its lineup, then the opening faceoff.
 */
export function createGame(setup: GameSetup): { state: GameState; events: GameEvent[] } {
  const config = makeConfig(setup.config);
  const teamIds = setup.teams ?? { A: 'A', B: 'B' };

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

  const empty = (): TeamState => ({
    players: [], spells: [], physical: [], physicalDiscard: [], penaltyBox: [], hand: [], discard: [], knockedOut: [], goalie: null, lineup: emptyLineup(config.lanes),
  });
  const state: GameState = {
    config,
    families: [...setup.cardSet.families],
    opposedPairs: setup.cardSet.opposedPairs.map(([x, y]) => [x, y] as [string, string]),
    cards: {},
    rng,
    turn: 0,
    firstSide,
    activeSide: firstSide,
    teams: { A: empty(), B: empty() },
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
  const teamCards = {
    A: [...buildDeck(setup.cardSet, teamIds.A, config), ...physicalPile(setup.cardSet, config, teamIds.A)],
    B: [...buildDeck(setup.cardSet, teamIds.B, config), ...physicalPile(setup.cardSet, config, teamIds.B)],
  };

  if (setup.decks) {
    if (config.draftPicks > 0) throw new SetupError('A game with its own decks has no draft.');
    const decks = setup.decks;
    dealTeams(state, {
      A: [...constructedDeck(setup.cardSet, decks.A, config, teamIds.A), ...physicalPile(setup.cardSet, config, teamIds.A)],
      B: [...constructedDeck(setup.cardSet, decks.B, config, teamIds.B), ...physicalPile(setup.cardSet, config, teamIds.B)],
    }, teamIds);
  } else if (config.draftPicks > 0) {
    startDraft(state, setup.cardSet, teamIds, teamCards);
  } else {
    // Players from the shared pool, if the card set has one. Card sets without a pool skip this
    // and use no randomness, so older saved games replay exactly as before.
    let dealt: Record<Side, PlayerCardDef[]> = { A: [], B: [] };
    if (playerPool(setup.cardSet, config).length > 0) [dealt, state.rng] = dealPool(setup.cardSet, config, teamIds, state.rng);
    dealTeams(state, { A: [...teamCards.A, ...dealt.A], B: [...teamCards.B, ...dealt.B] }, teamIds);
  }
  return { state, events: [{ type: 'gameStarted', firstSide }] };
}

/**
 * A team's Physical pile (v0.17): one of each physical card in the card set (up to the pile size),
 * playing in the team's color. None with the old rules.
 */
function physicalPile(cardSet: CardSet, config: GameConfig, teamId: string): CardDef[] {
  if (!config.physicalAttacks) return [];
  return cardSet.cards
    .filter((c) => c.kind === 'physical' && c.team === PHYSICAL_TEAM)
    .slice(0, config.physicalPileSize)
    .map((c) => ({ ...c, team: teamId }));
}

/** A deck a team brings (Constructed), checked, with every card playing for the team. */
function constructedDeck(cardSet: CardSet, ids: string[], config: GameConfig, teamId: string): CardDef[] {
  const problems = deckProblems(cardSet, ids, config);
  if (problems.length) throw new SetupError(`Team ${teamId}: ${problems.join(' ')}`);
  const byId = new Map(cardSet.cards.map((c) => [c.id, c]));
  return ids.map((id) => ({ ...byId.get(id)!, team: teamId }));
}

/**
 * Gives each side its deck: every card gets an id ("A01"...), the goalies start in hand so the
 * player can choose one, and everything else goes in the Players and Spells piles.
 */
function dealTeams(s: GameState, decks: Record<Side, CardDef[]>, teamIds: Record<Side, string>): void {
  const spots = 3 * s.config.lanes;
  for (const side of SIDES) {
    const uids = decks[side].map((def, i) => {
      const uid = `${side}${String(i + 1).padStart(2, '0')}`;
      s.cards[uid] = def;
      return uid;
    });
    const goalies = uids.filter((uid) => s.cards[uid]!.kind === 'goalie');
    const fieldCount = uids.filter((uid) => s.cards[uid]!.kind === 'field').length;
    if (goalies.length < 1) throw new SetupError(`Team ${teamIds[side]} has no goalie.`);
    if (fieldCount < spots) throw new SetupError(`Team ${teamIds[side]} needs at least ${spots} field players.`);
    s.teams[side] = {
      players: uids.filter((uid) => s.cards[uid]!.kind === 'field'),
      spells: uids.filter((uid) => s.cards[uid]!.kind === 'spell'),
      physical: uids.filter((uid) => s.cards[uid]!.kind === 'physical'),
      physicalDiscard: [],
      penaltyBox: [],
      hand: goalies,
      discard: [],
      knockedOut: [],
      goalie: null,
      lineup: emptyLineup(s.config.lanes),
    };
  }
}

/**
 * The draft's snake order: the side that takes the second turn picks first (as it chooses the
 * opening faceoff lane), then two each: B, A, A, B, B, A... when B picks first.
 */
export function draftOrder(first: Side, picksEach: number): Side[] {
  const second: Side = first === 'A' ? 'B' : 'A';
  return Array.from({ length: 2 * picksEach }, (_, i) => (i === 0 || Math.floor((i + 1) / 2) % 2 === 0 ? first : second));
}

/** Deals the face-up draft pool from the shared player pool and starts the draft. */
function startDraft(s: GameState, cardSet: CardSet, teamIds: Record<Side, string>, teamCards: Record<Side, CardDef[]>): void {
  const c = s.config;
  let goalies = playerPool(cardSet, c).filter((card) => card.kind === 'goalie');
  let field = playerPool(cardSet, c).filter((card) => card.kind === 'field');
  if (2 * c.draftPicks > c.draftPoolGoalies + c.draftPoolField) throw new SetupError('The draft pool is too small for both sides to pick.');
  if (goalies.length < Math.max(c.draftPoolGoalies, 2 * c.deckGoalies) || field.length < Math.max(c.draftPoolField, 2 * c.deckFieldPlayers)) {
    throw new SetupError('The player pool is too small for a draft.');
  }
  [goalies, s.rng] = shuffle(goalies, s.rng);
  [field, s.rng] = shuffle(field, s.rng);
  const pool = [...goalies.slice(0, c.draftPoolGoalies), ...field.slice(0, c.draftPoolField)].map((def, i) => {
    const uid = `P${String(i + 1).padStart(2, '0')}`;
    s.cards[uid] = def;
    return uid;
  });
  const firstPicker: Side = s.firstSide === 'A' ? 'B' : 'A';
  const order = draftOrder(firstPicker, c.draftPicks);
  s.draft = {
    pool,
    picks: { A: [], B: [] },
    order,
    rest: [...goalies.slice(c.draftPoolGoalies), ...field.slice(c.draftPoolField)],
    teamCards,
    teamIds,
    done: false,
  } satisfies DraftState;
  s.pending = { kind: 'draftPick', side: order[0]! };
}

/**
 * After the last pick: each side's other players are dealt at random from the rest of the pool
 * (leftover spares included), then the game goes on as usual with choosing goalies.
 */
export function finishDraft(s: GameState): void {
  const d = s.draft!;
  const leftovers = [...d.pool.map((uid) => s.cards[uid] as PlayerCardDef), ...d.rest];
  let goalies = leftovers.filter((card) => card.kind === 'goalie');
  let field = leftovers.filter((card) => card.kind === 'field');
  [goalies, s.rng] = shuffle(goalies, s.rng);
  [field, s.rng] = shuffle(field, s.rng);
  const decks = {} as Record<Side, CardDef[]>;
  for (const side of SIDES) {
    const picked = d.picks[side].map((uid) => s.cards[uid] as PlayerCardDef);
    const pickedGoalies = picked.filter((card) => card.kind === 'goalie').length;
    const fill = [
      ...goalies.splice(0, s.config.deckGoalies - pickedGoalies),
      ...field.splice(0, s.config.deckFieldPlayers - (picked.length - pickedGoalies)),
    ];
    decks[side] = [...d.teamCards[side], ...[...picked, ...fill].map((card) => ({ ...card, team: d.teamIds[side] }))];
  }
  dealTeams(s, decks, d.teamIds);
  d.done = true;
  s.pending = { kind: 'chooseGoalie', side: 'A' };
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
