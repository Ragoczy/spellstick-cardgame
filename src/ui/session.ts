// One game between a person and the computer, as the screen sees it.
//
// The real game state is private to this class. The screen can only ask for the person's own
// view, their legal actions, and their copy of the events, so it can't show anything the
// person isn't allowed to see (CLAUDE.md rules 4 and 7).

import type { Agent } from '../ai/agent';
import { heuristicAgent } from '../ai/heuristic';
import {
  applyAction, createGame, DRAFT_PICKS, eventsFor, legalActions, makeConfig, otherSide, viewFor,
  type Action, type CardSet, type GameEvent, type GameSetup, type GameState, type PlayerView, type Side,
} from '../engine';
import type { Seat } from './seat';

export interface SessionOptions {
  seed: number;
  cardSet: CardSet;
  lanes: number;
  /** Which team in the card set the person plays. The person always sits on side A. */
  team: string;
  /** Start with a draft (RULES.md "Draft") instead of dealing the players at random. */
  draft?: boolean;
}

export class GameSession implements Seat {
  readonly human: Side = 'A';
  readonly computer: Side = 'B';
  readonly setup: GameSetup;
  private state: GameState;
  private readonly ai: Agent;
  /** Every action taken, so a game can be replayed or reported. */
  readonly actions: Action[] = [];
  /** Events from creating the game (who goes first), as the person may see them. */
  readonly openingEvents: GameEvent[];

  constructor(options: SessionOptions) {
    const config = makeConfig({ lanes: options.lanes, draftPicks: options.draft ? DRAFT_PICKS : 0 });
    const otherTeam = options.cardSet.teams.find((t) => t.id !== options.team)?.id ?? options.team;
    this.setup = { seed: options.seed, cardSet: options.cardSet, config, teams: { A: options.team, B: otherTeam } };
    const created = createGame(this.setup);
    this.state = created.state;
    this.openingEvents = eventsFor(created.events, this.human);
    this.ai = heuristicAgent(options.seed + 1, config);
  }

  /** What the person can see. */
  get view(): PlayerView {
    return viewFor(this.state, this.human);
  }

  get teams(): Record<Side, string> {
    return this.setup.teams!;
  }

  /** Whose decision the game is waiting for. */
  get waitingFor(): 'human' | 'opponent' | 'over' {
    const pending = this.state.pending;
    if (pending.kind === 'gameOver') return 'over';
    return pending.side === this.human ? 'human' : 'opponent';
  }

  /** The person's legal actions (empty when it isn't their decision). */
  get legal(): Action[] {
    return legalActions(this.state, this.human);
  }

  /** A suggested move for the person: what the computer would do, seeing only the person's view. */
  hint(): Action | null {
    const legal = this.legal;
    if (!legal.length) return null;
    return heuristicAgent(this.actions.length + 7, this.state.config).chooseAction(viewFor(this.state, this.human), legal);
  }

  /** The person takes an action. Returns the events they're allowed to see. */
  act(action: Action): GameEvent[] {
    if (this.waitingFor !== 'human') throw new Error("It isn't your decision right now.");
    return this.apply(action);
  }

  /** The computer takes one action. Returns the events the person is allowed to see. */
  computerStep(): GameEvent[] {
    if (this.waitingFor !== 'opponent') return [];
    const action = this.ai.chooseAction(viewFor(this.state, this.computer), legalActions(this.state, this.computer));
    return this.apply(action);
  }

  private apply(action: Action): GameEvent[] {
    const result = applyAction(this.state, action);
    this.state = result.state;
    this.actions.push(action);
    return eventsFor(result.events, this.human);
  }

  get opponent(): Side {
    return otherSide(this.human);
  }
}
