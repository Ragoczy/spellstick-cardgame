// Helpers for building exact game situations in tests, so each rule can be checked directly
// without playing a whole game to get there.

import type { Action } from '../src/engine/actions';
import type {
  ActionEffect, Area, CardDef, FieldCardDef, GoalieCardDef, PlayerAbility, ReactionEffect, SpellCardDef,
} from '../src/engine/cards';
import { makeConfig, type GameConfig, type InjuryDef } from '../src/engine/config';
import type { GameEvent } from '../src/engine/events';
import { AREAS, type FieldPos, type Pos, type Side } from '../src/engine/field';
import { applyAction } from '../src/engine/reducer';
import type { GameState, Slot, TeamState, Uid } from '../src/engine/state';

export const LANE_COUNTS = [2, 3] as const;

export const ELEMENTS = ['fire', 'water', 'earth', 'air'];
export const OPPOSED: [string, string][] = [['fire', 'water'], ['earth', 'air']];

let counter = 0;
const nextId = () => `t-${++counter}`;

export function player(
  name: string,
  stats: Partial<{ speed: number; shot: number; defense: number; faceoff: number }> = {},
  options: { affinities?: string[]; ability?: PlayerAbility } = {},
): FieldCardDef {
  return {
    id: nextId(), team: 'T', kind: 'field', name,
    resonants: (options.affinities ?? ['earth']).map((affinity) => ({ name: `${affinity} resonant`, affinity })),
    speed: stats.speed ?? 3, shot: stats.shot ?? 3, defense: stats.defense ?? 3, faceoff: stats.faceoff ?? 3,
    ...(options.ability ? { ability: options.ability } : {}),
  };
}

export function goalie(name: string, save = 4, options: { affinities?: string[]; ability?: PlayerAbility } = {}): GoalieCardDef {
  return {
    id: nextId(), team: 'T', kind: 'goalie', name,
    resonants: (options.affinities ?? ['earth']).map((affinity) => ({ name: `${affinity} resonant`, affinity })),
    save,
    ...(options.ability ? { ability: options.ability } : {}),
  };
}

export function reaction(name: string, ability: ReactionEffect, element: string | null = null): SpellCardDef {
  return { id: nextId(), team: 'T', kind: 'spell', name, spellType: 'reaction', element, ability };
}

export function actionSpell(name: string, ability: ActionEffect, element: string | null = null): SpellCardDef {
  return { id: nextId(), team: 'T', kind: 'spell', name, spellType: 'action', element, ability };
}

export const boost = (name: string, amount = 2, element: string | null = null) =>
  reaction(name, { effect: 'boost', params: { amount } }, element);
export const shield = (name: string, element: string | null = null) =>
  reaction(name, { effect: 'shield', params: {} }, element);

export interface SideSpec {
  goalie?: GoalieCardDef;
  /** Players by area and lane. Missing spots get a filler player with all stats 3. */
  lineup?: Partial<Record<Area, Record<number, FieldCardDef>>>;
  /** Positions that start face up. */
  revealed?: Pos[];
  hand?: CardDef[];
  /** deck[0] is drawn first. Defaults to 10 filler players. */
  deck?: CardDef[];
  discard?: CardDef[];
}

export interface ScenarioOptions {
  lanes?: number;
  config?: Partial<GameConfig>;
  /** Whose turn it is (they are waiting to take an action). Default A. */
  active?: Side;
  ball?: { side: Side; pos: Pos } | null;
  score?: Record<Side, number>;
  turn?: number;
  /** Actions the active player has left this turn. Default 1: their last action. */
  actionsLeft?: number;
  /** Rolls each player has left to call for dice. Default 0. */
  dice?: number;
  A?: SideSpec;
  B?: SideSpec;
}

function diceFor(options: ScenarioOptions): Record<Side, number> {
  const n = options.dice ?? options.config?.diceBudget ?? 0;
  return { A: n, B: n };
}

/** Scenario contests are decided by printed numbers unless a test turns these back on. */
export const PLAIN_CONTESTS: Partial<GameConfig> = { passBonus: 0, shotDie: 0, penaltyBonus: 0 };

/** The injury deck in a fixed, unshuffled order: the first injury in config is drawn last. */
export function injuryDeckFor(config: GameConfig): { injuryDeck: string[]; injuryCards: Record<string, InjuryDef> } {
  const injuryCards: Record<string, InjuryDef> = {};
  let n = 0;
  for (const injury of config.injuries) {
    for (let i = 0; i < injury.count; i++) injuryCards[`I${String(++n).padStart(2, '0')}`] = injury;
  }
  return { injuryDeck: Object.keys(injuryCards).reverse(), injuryCards };
}

/** Builds a game in the middle of play: it's `active`'s turn and they must choose an action. */
export function scenario(options: ScenarioOptions = {}): GameState {
  // Plain contests unless the test asks otherwise: no pass bonus, no rolled shots, no penalty bonus,
  // so printed numbers decide. Those rules have their own tests (pass, shoot, and endgame).
  const config = makeConfig({ ...PLAIN_CONTESTS, ...options.config, lanes: options.lanes ?? options.config?.lanes ?? 2 });
  const cards: Record<Uid, CardDef> = {};
  const teams = {} as Record<Side, TeamState>;
  const active = options.active ?? 'A';

  for (const side of ['A', 'B'] as const) {
    const spec = options[side] ?? {};
    let n = 0;
    const add = (def: CardDef): Uid => {
      const uid = `${side}${String(++n).padStart(2, '0')}`;
      cards[uid] = def;
      return uid;
    };
    const isRevealed = (pos: Pos) =>
      (spec.revealed ?? []).some((r) => r.area === pos.area && (r.area === 'goal' || (pos.area !== 'goal' && r.lane === pos.lane)));
    const slot = (def: CardDef, pos: Pos): Slot => ({ uid: add(def), revealed: isRevealed(pos), scried: false });

    const lineup = {} as TeamState['lineup'];
    for (const area of AREAS) {
      lineup[area] = [];
      for (let lane = 0; lane < config.lanes; lane++) {
        const def = spec.lineup?.[area]?.[lane] ?? player(`${side} filler ${area} ${lane}`);
        lineup[area].push(slot(def, { area, lane }));
      }
    }
    // spec.deck lists cards top first; they go into the Players or Spells pile by kind.
    const deck = (spec.deck ?? Array.from({ length: 10 }, (_, i) => player(`${side} deck filler ${i}`))).map(add);
    const pile = (kind: 'players' | 'spells') => deck.filter((uid) => (cards[uid]!.kind === 'spell') === (kind === 'spells')).reverse();
    teams[side] = {
      goalie: slot(spec.goalie ?? goalie(`${side} goalie`), { area: 'goal' }),
      lineup,
      hand: (spec.hand ?? []).map(add),
      players: pile('players'), // top of each pile is the end of the list
      spells: pile('spells'),
      discard: (spec.discard ?? []).map(add),
    };
  }

  return {
    config,
    elements: ELEMENTS,
    opposedPairs: OPPOSED,
    cards,
    rng: 12345,
    turn: options.turn ?? 1,
    firstSide: 'A',
    activeSide: active,
    teams,
    ball: options.ball === undefined ? { side: active, pos: { area: 'midfield', lane: 0 } } : options.ball,
    ballProtected: false,
    actionsLeft: options.actionsLeft ?? 1,
    faceoffChooser: active === 'A' ? 'B' : 'A',
    score: options.score ?? { A: 0, B: 0 },
    endgame: { finalTurnFor: null },
    shootout: null,
    ...injuryDeckFor(config),
    injuries: {},
    forcedSub: null,
    // No rolls unless the test asks for them (via options.dice or an explicit config.diceBudget),
    // so contests don't stop to ask about dice.
    diceLeft: diceFor(options),
    pending: { kind: 'action', side: active },
    result: null,
  };
}

/** Finds the instance id of a named card belonging to a side. */
export function uid(state: GameState, side: Side, name: string): Uid {
  const found = Object.entries(state.cards).find(([id, def]) => id.startsWith(side) && def.name === name);
  if (!found) throw new Error(`No card named "${name}" for side ${side}`);
  return found[0];
}

/** Applies several actions in a row and collects all events. */
export function play(state: GameState, ...actions: Action[]): { state: GameState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyAction(current, action);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

export function eventsOfType<T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

export function lastContest(events: GameEvent[]) {
  const contests = eventsOfType(events, 'contestResolved');
  const last = contests[contests.length - 1];
  if (!last) throw new Error('No contest happened');
  return last;
}

export const mid = (lane: number): FieldPos => ({ area: 'midfield', lane });
export const fwd = (lane: number): FieldPos => ({ area: 'forward', lane });
export const dfn = (lane: number): FieldPos => ({ area: 'defense', lane });
export const GOAL_POS: Pos = { area: 'goal' };
