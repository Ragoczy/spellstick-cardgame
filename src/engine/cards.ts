// Card definitions and the card-data loader. Cards are data (data/*.json); the engine never
// hard-codes individual cards. The loader checks the shape of the data so a typo in the JSON
// fails loudly instead of breaking a game halfway through.

import type { GameConfig } from './config';

export type Element = string;

export interface Resonant {
  /** For example "Anger". */
  name: string;
  /** For example "fire". */
  affinity: Element;
}

export type StatName = 'speed' | 'shot' | 'defense' | 'faceoff' | 'save';
/** What a stat is being used for in a contest. */
export type StatUse = 'receive' | 'intercept' | 'tackle' | 'evade' | 'shoot' | 'save' | 'faceoff' | 'resist';
export type Area = 'defense' | 'midfield' | 'forward';

// ---- Effect vocabulary (docs/RULES.md, "Effect vocabulary") ----

export type PlayerAbility =
  | { effect: 'bonus'; params: { stat: StatName; amount: number; when?: StatUse; row?: Area } }
  | { effect: 'draw_on_win'; params: { count: number } };

export type ReactionEffect =
  | { effect: 'boost'; params: { amount: number } }
  | { effect: 'shield'; params: Record<string, never> }
  | { effect: 'dirty_play'; params: Record<string, never> };

export type ActionEffect =
  | { effect: 'scry'; params: Record<string, never> }
  | { effect: 'swap'; params: Record<string, never> }
  | { effect: 'long_pass'; params: Record<string, never> }
  | { effect: 'long_shot'; params: { penalty: number } }
  | { effect: 'steal'; params: { amount: number } }
  | { effect: 'recall'; params: { count: number } }
  | { effect: 'hit'; params: { strength: number } }
  | { effect: 'mend'; params: Record<string, never> }
  | { effect: 'decoy_pass'; params: Record<string, never> }
  | { effect: 'mirror_images'; params: Record<string, never> };

export type SpellEffect = ReactionEffect | ActionEffect;

/** Effects whose number is adjusted by affinity. The rest fail outright when opposed. */
export const NUMERIC_EFFECTS: ReadonlySet<string> = new Set(['boost', 'long_shot', 'steal', 'recall', 'hit']);

// ---- Card definitions ----

interface CardBase {
  id: string;
  team: string;
  name: string;
  text?: string;
  flavor?: string;
  copies?: number;
  addon?: boolean;
  promo?: boolean;
  placeholder?: boolean;
}

export interface FieldCardDef extends CardBase {
  kind: 'field';
  resonants: Resonant[];
  speed: number;
  shot: number;
  defense: number;
  faceoff: number;
  ability?: PlayerAbility;
}

export interface GoalieCardDef extends CardBase {
  kind: 'goalie';
  resonants: Resonant[];
  save: number;
  ability?: PlayerAbility;
}

export interface ReactionSpellDef extends CardBase {
  kind: 'spell';
  spellType: 'reaction';
  element: Element | null;
  ability: ReactionEffect;
}

export interface ActionSpellDef extends CardBase {
  kind: 'spell';
  spellType: 'action';
  element: Element | null;
  ability: ActionEffect;
}

export type SpellCardDef = ReactionSpellDef | ActionSpellDef;
export type PlayerCardDef = FieldCardDef | GoalieCardDef;
export type CardDef = FieldCardDef | GoalieCardDef | SpellCardDef;

export interface TeamDef {
  id: string;
  name: string;
  color: string;
  placeholder?: boolean;
}

export interface CardSet {
  version: string;
  elements: Element[];
  opposedPairs: [Element, Element][];
  teams: TeamDef[];
  cards: CardDef[];
}

// ---- Loader ----

const STATS: StatName[] = ['speed', 'shot', 'defense', 'faceoff', 'save'];
const USES: StatUse[] = ['receive', 'intercept', 'tackle', 'evade', 'shoot', 'save', 'faceoff', 'resist'];
const AREAS: Area[] = ['defense', 'midfield', 'forward'];
const REACTION_EFFECTS = ['boost', 'shield', 'dirty_play'];
const ACTION_EFFECTS = ['scry', 'swap', 'long_pass', 'long_shot', 'steal', 'recall', 'hit', 'mend', 'decoy_pass', 'mirror_images'];

export class CardDataError extends Error {}

function fail(where: string, message: string): never {
  throw new CardDataError(`${where}: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function needInt(card: Record<string, unknown>, key: string, where: string): void {
  if (!Number.isInteger(card[key])) fail(where, `"${key}" must be a whole number`);
}

function checkParams(ability: Record<string, unknown>, where: string): void {
  const params = ability.params;
  if (!isObject(params)) fail(where, 'ability needs a "params" object');
  const effect = ability.effect;
  switch (effect) {
    case 'bonus':
      if (!STATS.includes(params.stat as StatName)) fail(where, 'bonus needs a valid "stat"');
      needInt(params, 'amount', where);
      if (params.when !== undefined && !USES.includes(params.when as StatUse)) fail(where, 'bonus "when" is not valid');
      if (params.row !== undefined && !AREAS.includes(params.row as Area)) fail(where, 'bonus "row" is not valid');
      break;
    case 'draw_on_win':
    case 'recall':
      needInt(params, 'count', where);
      break;
    case 'boost':
    case 'steal':
      needInt(params, 'amount', where);
      break;
    case 'long_shot':
      needInt(params, 'penalty', where);
      break;
    case 'hit':
      needInt(params, 'strength', where);
      break;
    case 'dirty_play':
    case 'mend':
    case 'shield':
    case 'scry':
    case 'swap':
    case 'long_pass':
    case 'decoy_pass':
    case 'mirror_images':
      break;
    default:
      fail(where, `unknown effect "${String(effect)}"`);
  }
}

function checkResonants(card: Record<string, unknown>, elements: string[], where: string): void {
  const list = card.resonants;
  if (!Array.isArray(list) || list.length < 1 || list.length > 3) fail(where, 'needs 1 to 3 resonants');
  for (const r of list) {
    if (!isObject(r) || typeof r.name !== 'string') fail(where, 'each resonant needs a name');
    if (!elements.includes(r.affinity as string)) fail(where, `unknown affinity "${String(r.affinity)}"`);
  }
}

/** Checks parsed JSON card data and returns it as a typed CardSet. Throws CardDataError if anything is wrong. */
export function loadCardSet(json: unknown): CardSet {
  if (!isObject(json)) fail('card set', 'must be an object');
  const elements = json.elements;
  if (!Array.isArray(elements) || !elements.every((e) => typeof e === 'string')) {
    fail('card set', '"elements" must be a list of names');
  }
  const opposedPairs = json.opposedPairs;
  if (!Array.isArray(opposedPairs)) fail('card set', '"opposedPairs" must be a list');
  for (const pair of opposedPairs) {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((e) => elements.includes(e))) {
      fail('card set', 'each opposed pair must name two known elements');
    }
  }
  if (!Array.isArray(json.teams)) fail('card set', '"teams" must be a list');
  if (!Array.isArray(json.cards)) fail('card set', '"cards" must be a list');

  const seen = new Set<string>();
  for (const card of json.cards) {
    if (!isObject(card) || typeof card.id !== 'string') fail('card', 'every card needs an "id"');
    const where = `card ${card.id}`;
    if (seen.has(card.id)) fail(where, 'duplicate id');
    seen.add(card.id);
    if (typeof card.team !== 'string' || typeof card.name !== 'string') fail(where, 'needs "team" and "name"');
    if (card.ability !== undefined && !isObject(card.ability)) fail(where, '"ability" must be an object');
    const ability = card.ability as Record<string, unknown> | undefined;

    switch (card.kind) {
      case 'field':
        checkResonants(card, elements, where);
        for (const stat of ['speed', 'shot', 'defense', 'faceoff']) needInt(card, stat, where);
        if (ability) {
          if (ability.effect !== 'bonus' && ability.effect !== 'draw_on_win') fail(where, 'players can only have bonus or draw_on_win abilities');
          checkParams(ability, where);
        }
        break;
      case 'goalie':
        checkResonants(card, elements, where);
        needInt(card, 'save', where);
        if (ability) {
          if (ability.effect !== 'bonus' && ability.effect !== 'draw_on_win') fail(where, 'players can only have bonus or draw_on_win abilities');
          checkParams(ability, where);
        }
        break;
      case 'spell': {
        if (card.element !== null && !elements.includes(card.element as string)) fail(where, `unknown element "${String(card.element)}"`);
        if (!ability) fail(where, 'spells need an ability');
        const effects = card.spellType === 'reaction' ? REACTION_EFFECTS : card.spellType === 'action' ? ACTION_EFFECTS : null;
        if (!effects) fail(where, '"spellType" must be reaction or action');
        if (!effects.includes(ability.effect as string)) fail(where, `"${String(ability.effect)}" is not a ${String(card.spellType)} effect`);
        checkParams(ability, where);
        break;
      }
      default:
        fail(where, `unknown kind "${String(card.kind)}"`);
    }
  }
  return json as unknown as CardSet;
}

/**
 * Builds one team's deck from a card set: expands copies, leaves out promo cards, and leaves
 * out add-on cards unless the game uses 3 or more lanes.
 */
export function buildDeck(cardSet: CardSet, teamId: string, config: GameConfig): CardDef[] {
  const deck: CardDef[] = [];
  for (const card of cardSet.cards) {
    if (card.team !== teamId || card.promo) continue;
    if (card.addon && config.lanes < 3) continue;
    for (let i = 0; i < (card.copies ?? 1); i++) deck.push(card);
  }
  return deck;
}
