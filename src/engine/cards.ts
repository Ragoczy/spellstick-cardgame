// Card definitions and the card-data loader. Cards are data (data/*.json); the engine never
// hard-codes individual cards. The loader checks the shape of the data so a typo in the JSON
// fails loudly instead of breaking a game halfway through.

import type { GameConfig } from './config';

/**
 * A kind of magic: a whole family ("fire") or one specialization in it ("illusion.glamour").
 * The ids come from data/warlock-resonants.json (docs/MAGIC.md).
 */
export type Magic = string;

/** The family a magic id belongs to: "illusion.glamour" -> "illusion", "fire" -> "fire". */
export const familyOf = (magic: Magic): string => magic.split('.')[0]!;

export interface Resonant {
  /** The Resonant's id in data/warlock-resonants.json, for example "emo.anger". */
  id?: string;
  /** For example "Anger". */
  name: string;
  /** What magic it's good at: a family ("fire") or a specialization ("fire.explosion"). */
  affinity: Magic;
}

export type StatName = 'speed' | 'shot' | 'defense' | 'faceoff' | 'save';
/** What a stat is being used for in a contest. */
export type StatUse = 'receive' | 'intercept' | 'tackle' | 'evade' | 'shoot' | 'save' | 'faceoff' | 'resist' | 'attack';
export type Area = 'defense' | 'midfield' | 'forward';

// ---- Effect vocabulary (docs/RULES.md, "Effect vocabulary") ----

export type PlayerAbility =
  | { effect: 'bonus'; params: { stat: StatName; amount: number; when?: StatUse; row?: Area } }
  | { effect: 'draw_on_win'; params: { count: number } }
  /** Heavy hands (v0.17): +amount to the severity roll of anyone this player hurts. */
  | { effect: 'hits_harder'; params: { amount: number } }
  /** Sturdy (v0.17): −amount to the severity roll when this player is hurt. */
  | { effect: 'hard_to_hurt'; params: { amount: number } };

const PLAYER_EFFECTS = ['bonus', 'draw_on_win', 'hits_harder', 'hard_to_hurt'];

export type ReactionEffect =
  | { effect: 'boost'; params: { amount: number; when?: StatUse } }
  | { effect: 'shield'; params: Record<string, never> }
  | { effect: 'dirty_play'; params: Record<string, never> }
  /** Ward (v0.17): if your player is hurt in this contest, they're only Shaken. */
  | { effect: 'ward'; params: Record<string, never> };

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

/**
 * Physical attack cards (v0.17, RULES.md "Physical attacks"): what a card does beyond the
 * standard attack. A card has at most one.
 */
export type PhysicalEffect =
  /** +amount to the attack if the target holds the ball (Tripping). */
  | { effect: 'vs_holder'; params: { amount: number } }
  /** May attack the opposing player in an adjacent lane of the same row instead (Hooking). */
  | { effect: 'reach'; params: Record<string, never> }
  /** Only against the ball carrier (Clothesline). */
  | { effect: 'needs_holder'; params: Record<string, never> }
  /** Only against a Shaken target (Stamp). */
  | { effect: 'needs_shaken'; params: Record<string, never> }
  /** No Toughness roll: if the attack wins, the target is Shaken, never worse (Atomic Wedgie). */
  | { effect: 'only_shaken'; params: Record<string, never> }
  /** If the target passes their Toughness roll, they're Shaken anyway (Gouge). */
  | { effect: 'shaken_anyway'; params: Record<string, never> }
  /** If the target is hurt, Shaken counts as Injured (Kneecap). */
  | { effect: 'shaken_is_injured'; params: Record<string, never> }
  /** The attacker makes a Toughness roll too, win or lose (Spearing). */
  | { effect: 'self_check'; params: Record<string, never> }
  /** +amount for each of your standing players in an adjacent lane of the same row (Pile-on). */
  | { effect: 'pile_on'; params: { amount: number } }
  /** Reaction: after the opposing player in this spot passes or shoots (Late Hit). */
  | { effect: 'after_pass_or_shot'; params: Record<string, never> }
  /** Reaction: when your player loses a contest to the opposing player in this spot (Elbow). */
  | { effect: 'after_losing'; params: Record<string, never> };

export const PHYSICAL_EFFECTS: PhysicalEffect['effect'][] = [
  'vs_holder', 'reach', 'needs_holder', 'needs_shaken', 'only_shaken', 'shaken_anyway', 'shaken_is_injured',
  'self_check', 'pile_on', 'after_pass_or_shot', 'after_losing',
];

/** Physical cards played as reactions, at the moment they name, instead of as an attack on your turn. */
export const PHYSICAL_REACTIONS: ReadonlySet<string> = new Set(['after_pass_or_shot', 'after_losing']);

/**
 * Whether a reaction spell can be played by this side of a contest. A boost with `when` only
 * works for that use of a stat (for example "receive"); a hit's attacker is never resisting.
 */
export function reactionFits(def: SpellCardDef, side: { use: StatUse; power?: unknown }): boolean {
  if (def.ability.effect !== 'boost' || def.ability.params.when === undefined) return true;
  return def.ability.params.when === side.use && !side.power;
}

/** Effects whose number is adjusted by affinity. The rest fail outright when opposed. */
export const NUMERIC_EFFECTS: ReadonlySet<string> = new Set(['boost', 'long_shot', 'steal', 'recall', 'hit']);

// ---- Card definitions ----

/**
 * Player cards whose team is "pool" belong to no team. At setup each side is dealt its goalies
 * and field players at random from this shared pool (RULES.md "Setup").
 */
export const POOL_TEAM = 'pool';

/**
 * Spell cards whose team is "library" belong to no team. Each is defined once; a team's
 * `spells` list picks the library spells in its deck, by id (RULES.md "Spell library").
 */
export const LIBRARY_TEAM = 'library';

/**
 * Physical attack cards (v0.17) belong to no team. Every team's Physical pile has one copy of each
 * (RULES.md "Physical attacks").
 */
export const PHYSICAL_TEAM = 'physical';

/** A player card's type. It only says what the card is good at: any field player can play any position. */
export type PlayerRole = 'runner' | 'striker' | 'playmaker' | 'allrounder' | 'anchor' | 'stopper' | 'goalie';
export const PLAYER_ROLES: PlayerRole[] = ['runner', 'striker', 'playmaker', 'allrounder', 'anchor', 'stopper', 'goalie'];

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

interface PlayerBase extends CardBase {
  resonants: Resonant[];
  role?: PlayerRole;
  /** Extra skill points the card was made with, on top of its type's base stats (named players only). */
  bonusPoints?: number;
  ability?: PlayerAbility;
}

export interface FieldCardDef extends PlayerBase {
  kind: 'field';
  speed: number;
  shot: number;
  defense: number;
  faceoff: number;
  /**
   * Knocked down, this player is fine on a roll at or below this, and hurt above it (v0.17).
   * Card sets saved by online matches before v0.17 don't have it; those matches never roll it.
   */
  toughness: number;
}

export interface GoalieCardDef extends PlayerBase {
  kind: 'goalie';
  save: number;
}

/**
 * A spell's power tier, named like a card rarity, from strongest to weakest. Measured by
 * npm run spell-tiers (docs/MAGIC.md, "Power tiers"). It changes nothing in play.
 */
export type SpellTier = 'legendary' | 'rare' | 'uncommon' | 'common';
export const SPELL_TIERS: SpellTier[] = ['legendary', 'rare', 'uncommon', 'common'];

export interface ReactionSpellDef extends CardBase {
  kind: 'spell';
  spellType: 'reaction';
  /** The spell's kind of magic, or null for a neutral spell. */
  magic: Magic | null;
  tier?: SpellTier;
  ability: ReactionEffect;
}

export interface ActionSpellDef extends CardBase {
  kind: 'spell';
  spellType: 'action';
  /** The spell's kind of magic, or null for a neutral spell. */
  magic: Magic | null;
  tier?: SpellTier;
  ability: ActionEffect;
}

export type SpellCardDef = ReactionSpellDef | ActionSpellDef;
export type PlayerCardDef = FieldCardDef | GoalieCardDef;
/** Penalty tiers of physical cards, from mildest: they set the Toughness and severity modifiers and the penalty length. */
export type PhysicalTier = 'minor' | 'major' | 'brutal';
export const PHYSICAL_TIERS: PhysicalTier[] = ['minor', 'major', 'brutal'];

/** A physical attack card (v0.17). Not a spell: it isn't cast, so affinity rules and casting limits don't apply. */
export interface PhysicalCardDef extends CardBase {
  kind: 'physical';
  tier: PhysicalTier;
  /** 'speed' attacks with the attacker's Speed; 'muscle' with their Defense. */
  uses: 'speed' | 'muscle';
  /** Added to the attack. */
  bonus: number;
  /** The body Affinity printed on the card ("body.strength"): an attacker with it gets +1. */
  affinity: string;
  /** The target's Toughness roll modifier (tier and card together), or null: no Toughness roll. */
  toughness: number | null;
  /** The severity roll modifier (tier and card together), or null: no severity roll. */
  severity: number | null;
  ability?: PhysicalEffect;
  /** Printed: the sport (or sports) the foul comes from. */
  from: string;
  /** Printed, for a reaction card: when you play it. */
  when?: string;
}

export type CardDef = FieldCardDef | GoalieCardDef | SpellCardDef | PhysicalCardDef;

export interface TeamDef {
  id: string;
  name: string;
  color: string;
  placeholder?: boolean;
  /** The library spells in this team's deck, by card id. An id listed twice is two copies. */
  spells?: string[];
}

export interface CardSet {
  version: string;
  /** The magic families players and spells may use. */
  families: string[];
  /** Families that weaken each other (RULES.md "Affinity"). Empty in the current card set. */
  opposedPairs: [string, string][];
  teams: TeamDef[];
  cards: CardDef[];
}

// ---- Loader ----

const STATS: StatName[] = ['speed', 'shot', 'defense', 'faceoff', 'save'];
const USES: StatUse[] = ['receive', 'intercept', 'tackle', 'evade', 'shoot', 'save', 'faceoff', 'resist', 'attack'];
const AREAS: Area[] = ['defense', 'midfield', 'forward'];
const REACTION_EFFECTS = ['boost', 'shield', 'dirty_play', 'ward'];
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
    case 'hits_harder':
    case 'hard_to_hurt':
      needInt(params, 'amount', where);
      break;
    case 'boost':
      needInt(params, 'amount', where);
      if (params.when !== undefined && !USES.includes(params.when as StatUse)) fail(where, 'boost "when" is not valid');
      break;
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
    case 'ward':
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

function checkPhysical(card: Record<string, unknown>, ability: Record<string, unknown> | undefined, families: string[], where: string): void {
  if (!PHYSICAL_TIERS.includes(card.tier as PhysicalTier)) fail(where, `unknown tier "${String(card.tier)}"`);
  if (card.uses !== 'speed' && card.uses !== 'muscle') fail(where, '"uses" must be speed or muscle');
  needInt(card, 'bonus', where);
  if (!isKnownMagic(card.affinity, families)) fail(where, `unknown affinity "${String(card.affinity)}"`);
  for (const key of ['toughness', 'severity']) {
    if (card[key] !== null && !Number.isInteger(card[key])) fail(where, `"${key}" must be a whole number or null`);
  }
  if (typeof card.from !== 'string') fail(where, 'needs "from"');
  if (!ability) return;
  if (!PHYSICAL_EFFECTS.includes(ability.effect as PhysicalEffect['effect'])) fail(where, `"${String(ability.effect)}" is not a physical effect`);
  if (!isObject(ability.params)) fail(where, 'ability needs a "params" object');
  if (ability.effect === 'vs_holder' || ability.effect === 'pile_on') needInt(ability.params, 'amount', where);
}

/** A family id ("fire") or a specialization id ("fire.explosion") in one of the card set's families. */
function isKnownMagic(magic: unknown, families: string[]): boolean {
  return typeof magic === 'string' && /^[a-z-]+(\.[a-z-]+)?$/.test(magic) && families.includes(familyOf(magic));
}

function checkResonants(card: Record<string, unknown>, families: string[], where: string): void {
  const list = card.resonants;
  if (!Array.isArray(list) || list.length < 1 || list.length > 3) fail(where, 'needs 1 to 3 resonants');
  for (const r of list) {
    if (!isObject(r) || typeof r.name !== 'string') fail(where, 'each resonant needs a name');
    if (!isKnownMagic(r.affinity, families)) fail(where, `unknown affinity "${String(r.affinity)}"`);
  }
}

/** Checks parsed JSON card data and returns it as a typed CardSet. Throws CardDataError if anything is wrong. */
export function loadCardSet(json: unknown): CardSet {
  if (!isObject(json)) fail('card set', 'must be an object');
  const families = json.families;
  if (!Array.isArray(families) || !families.every((e) => typeof e === 'string')) {
    fail('card set', '"families" must be a list of names');
  }
  const opposedPairs = json.opposedPairs;
  if (!Array.isArray(opposedPairs)) fail('card set', '"opposedPairs" must be a list');
  for (const pair of opposedPairs) {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((e) => families.includes(e))) {
      fail('card set', 'each opposed pair must name two known families');
    }
  }
  if (!Array.isArray(json.teams)) fail('card set', '"teams" must be a list');
  if (json.teams.some((t) => isObject(t) && t.id === POOL_TEAM)) fail('card set', `"${POOL_TEAM}" is reserved for the shared player pool`);
  if (json.teams.some((t) => isObject(t) && t.id === LIBRARY_TEAM)) fail('card set', `"${LIBRARY_TEAM}" is reserved for the spell library`);
  if (json.teams.some((t) => isObject(t) && t.id === PHYSICAL_TEAM)) fail('card set', `"${PHYSICAL_TEAM}" is reserved for the physical cards`);
  if (!Array.isArray(json.cards)) fail('card set', '"cards" must be a list');

  const seen = new Set<string>();
  for (const card of json.cards) {
    if (!isObject(card) || typeof card.id !== 'string') fail('card', 'every card needs an "id"');
    const where = `card ${card.id}`;
    if (seen.has(card.id)) fail(where, 'duplicate id');
    seen.add(card.id);
    if (typeof card.team !== 'string' || typeof card.name !== 'string') fail(where, 'needs "team" and "name"');
    if (card.team === POOL_TEAM && card.kind !== 'field' && card.kind !== 'goalie') fail(where, 'only player cards can be in the pool');
    if (card.team === LIBRARY_TEAM && card.kind !== 'spell') fail(where, 'only spells can be in the spell library');
    if ((card.team === PHYSICAL_TEAM) !== (card.kind === 'physical')) fail(where, `physical cards, and only they, have team "${PHYSICAL_TEAM}"`);
    if (card.role !== undefined && !PLAYER_ROLES.includes(card.role as PlayerRole)) fail(where, `unknown role "${String(card.role)}"`);
    if ((card.role === 'goalie') !== (card.kind === 'goalie') && card.role !== undefined) fail(where, 'only goalies have the goalie role');
    if (card.ability !== undefined && !isObject(card.ability)) fail(where, '"ability" must be an object');
    const ability = card.ability as Record<string, unknown> | undefined;

    switch (card.kind) {
      case 'field':
        checkResonants(card, families, where);
        for (const stat of ['speed', 'shot', 'defense', 'faceoff', 'toughness']) needInt(card, stat, where);
        if (ability) {
          if (!PLAYER_EFFECTS.includes(ability.effect as string)) fail(where, `players can only have ${PLAYER_EFFECTS.join(', ')} abilities`);
          checkParams(ability, where);
        }
        break;
      case 'goalie':
        checkResonants(card, families, where);
        needInt(card, 'save', where);
        if (ability) {
          if (!PLAYER_EFFECTS.includes(ability.effect as string)) fail(where, `players can only have ${PLAYER_EFFECTS.join(', ')} abilities`);
          checkParams(ability, where);
        }
        break;
      case 'spell': {
        if (card.magic !== null && !isKnownMagic(card.magic, families)) fail(where, `unknown magic "${String(card.magic)}"`);
        if (card.tier !== undefined && !SPELL_TIERS.includes(card.tier as SpellTier)) fail(where, `unknown tier "${String(card.tier)}"`);
        if (!ability) fail(where, 'spells need an ability');
        const effects = card.spellType === 'reaction' ? REACTION_EFFECTS : card.spellType === 'action' ? ACTION_EFFECTS : null;
        if (!effects) fail(where, '"spellType" must be reaction or action');
        if (!effects.includes(ability.effect as string)) fail(where, `"${String(ability.effect)}" is not a ${String(card.spellType)} effect`);
        checkParams(ability, where);
        break;
      }
      case 'physical':
        checkPhysical(card, ability, families, where);
        break;
      default:
        fail(where, `unknown kind "${String(card.kind)}"`);
    }
  }
  const library = new Set(json.cards.filter((c) => isObject(c) && c.team === LIBRARY_TEAM).map((c) => (c as { id: string }).id));
  for (const team of json.teams) {
    if (!isObject(team) || team.spells === undefined) continue;
    if (!Array.isArray(team.spells)) fail(`team ${String(team.id)}`, '"spells" must be a list of card ids');
    for (const id of team.spells) {
      if (!library.has(id as string)) fail(`team ${String(team.id)}`, `"${String(id)}" is not a spell in the library`);
    }
  }
  return json as unknown as CardSet;
}

/**
 * Builds one team's deck from a card set: the team's own cards (copies expanded) and the library
 * spells its `spells` list names. Leaves out promo cards, and add-on cards unless the game uses 3
 * or more lanes.
 */
export function buildDeck(cardSet: CardSet, teamId: string, config: GameConfig): CardDef[] {
  if (teamId === PHYSICAL_TEAM) return [];
  const deck: CardDef[] = [];
  const leftOut = (card: CardDef) => card.promo || (card.addon && config.lanes < 3);
  for (const card of cardSet.cards) {
    if (card.team !== teamId || leftOut(card)) continue;
    for (let i = 0; i < (card.copies ?? 1); i++) deck.push(card);
  }
  // The team's spells from the library: one card for each time an id is listed, playing for the team.
  const byId = new Map(cardSet.cards.map((c) => [c.id, c]));
  for (const id of cardSet.teams.find((t) => t.id === teamId)?.spells ?? []) {
    const card = byId.get(id)!;
    if (!leftOut(card)) deck.push({ ...card, team: teamId });
  }
  return deck;
}

/** Spells per deck: whatever the deck size leaves after the goalies and field players. */
export function deckSpells(config: GameConfig): number {
  return config.deckSize - config.deckGoalies - config.deckFieldPlayers;
}

/**
 * Constructed (RULES.md "Constructed"): what's wrong with a deck a team brings, in plain words.
 * An empty list means the deck is legal. ids are card ids from the card set, one per card.
 */
export function deckProblems(cardSet: CardSet, ids: readonly string[], config: GameConfig): string[] {
  const byId = new Map(cardSet.cards.map((c) => [c.id, c]));
  const problems: string[] = [];
  const cards: CardDef[] = [];
  for (const id of ids) {
    const card = byId.get(id);
    if (card) cards.push(card);
    else problems.push(`There's no card ${id}.`);
  }
  const count = (kind: CardDef['kind']) => cards.filter((c) => c.kind === kind).length;
  const need = (wanted: number, have: number, what: string) => {
    if (have !== wanted) problems.push(`A team needs ${wanted} ${what} (this one has ${have}).`);
  };
  need(config.deckGoalies, count('goalie'), 'goalies');
  need(config.deckFieldPlayers, count('field'), 'field players');
  need(deckSpells(config), count('spell'), 'spells');
  // Each named player is one person, so a team can't have the same player twice.
  const seen = new Set<string>();
  for (const card of cards) {
    if (card.kind === 'spell') continue;
    if (seen.has(card.id)) problems.push(`${card.name} is on the team twice.`);
    seen.add(card.id);
  }
  for (const card of cards) {
    if (card.addon && config.lanes < 3) problems.push(`${card.name} is only for the center-lane add-on.`);
  }
  return [...new Set(problems)];
}

/** The shared player pool: player cards with team "pool", with the same copy, promo, and add-on rules as buildDeck. */
export function playerPool(cardSet: CardSet, config: GameConfig): PlayerCardDef[] {
  return buildDeck(cardSet, POOL_TEAM, config).filter((card): card is PlayerCardDef => card.kind === 'field' || card.kind === 'goalie');
}
