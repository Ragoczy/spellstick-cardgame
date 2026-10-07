// A simple rule-of-thumb computer opponent (ROADMAP M2).
//
// It sees exactly what a human player sees: its own view and the list of legal actions. For
// each legal action it estimates how much better off it would be, on a rough scale where
// scoring a goal is worth 1, and picks the best (with a little randomness).
//
// Rough ideas it follows:
// - Lineup: high Defense on defense, Speed and Shot up front, Speed and Faceoff in midfield.
// - Unknown opposing players are treated as average for their position.
// - Ball value grows the closer the ball is to the other goal.
// - Reaction spells are saved for contests that matter (shots, defending near its own goal).
// - Casters are chosen to match the spell's element, preferring players already face up.
// - Hits go after strong revealed players and the ball carrier (goalies can't be hit).
// - Dirty plays go into contests it expects to win. Mend goes on players it values.

import { affinityFor } from '../engine/affinity';
import type { Action } from '../engine/actions';
import { NUMERIC_EFFECTS, type Area, type CardDef, type FieldCardDef, type PlayerCardDef, type SpellCardDef, type StatName, type StatUse } from '../engine/cards';
import type { GameConfig, InjuryDef, InjuryStat } from '../engine/config';
import { DEFAULT_CONFIG } from '../engine/config';
import type { CardView } from '../engine/events';
import { isFieldPos, opposite, samePos, type FieldPos, type Pos, type Side } from '../engine/field';
import { nextRandom, seedToState } from '../engine/rng';
import { scoreSide } from '../engine/score';
import type { Affinity, Contest, ContestRole, Modifier } from '../engine/state';
import type { PlayerView, SlotView } from '../engine/view';
import type { Agent } from './agent';

// ---- Tunable guesses for the AI's judgement (not game rules) ----

/** How much having the ball is worth, by where it is (for the side holding it). */
const BALL_VALUE: Record<'goal' | Area, number> = { goal: 0.05, defense: 0.12, midfield: 0.25, forward: 0.5 };

/**
 * Guessing an unseen opposing player: start from the average of the opponent's players seen so
 * far (or these starting guesses, before enough have been seen), then adjust for position, since
 * teams put their best Defense on defense, and so on.
 */
const STARTING_GUESS: Record<'speed' | 'shot' | 'defense' | 'faceoff', number> = { speed: 3.3, shot: 3.3, defense: 3.5, faceoff: 3 };
const POSITION_ADJUST: Record<Area, Partial<Record<StatName, number>>> = {
  defense: { defense: 0.75, speed: -0.5, shot: -0.5 },
  midfield: { faceoff: 0.5, speed: 0.25 },
  forward: { shot: 0.5, speed: 0.25, defense: -0.5 },
};

/** Rough worth of keeping a card in hand. */
const SPELL_VALUE: Record<string, number> = {
  boost: 0.12, shield: 0.13, steal: 0.07, long_pass: 0.06, long_shot: 0.06, recall: 0.05, scry: 0.03, swap: 0.02,
  hit: 0.08, dirty_play: 0.07, mend: 0.04,
};

/** Rough worth of injuring an opposing player (on top of what the contest itself is worth). */
const INJURY_WORTH = 0.06;
/** Rough worth of carrying off an opposing player who is already injured. */
const CARRY_OFF_WORTH = 0.12;

/** Holding the ball without passing or shooting counts for this share of its value. */
const STALL_DISCOUNT = 0.5;

/** Cost of revealing a face-down player just to cast a spell. */
const REVEAL_COST = 0.015;

// ---- Helpers for reading the view ----

function slotOf(view: PlayerView, owner: 'mine' | 'opponent', pos: Pos): SlotView {
  const team = view[owner];
  return pos.area === 'goal' ? team.goalie : team.lineup[pos.area][pos.lane]!;
}

/** A card this side can see at a position (its own, or an opponent's face-up/scried card). */
function knownCard(view: PlayerView, owner: 'mine' | 'opponent', pos: Pos): CardView | null {
  const slot = slotOf(view, owner, pos);
  return slot.state === 'faceDown' || slot.state === 'revealed' ? slot.card : null;
}

function knownPlayer(view: PlayerView, owner: 'mine' | 'opponent', pos: Pos): PlayerCardDef | null {
  return (knownCard(view, owner, pos)?.def as PlayerCardDef | undefined) ?? null;
}

/** The injury showing on a spot (injury cards are face up, even on unknown players). */
function visibleInjury(view: PlayerView, owner: 'mine' | 'opponent', pos: Pos): InjuryDef | null {
  const slot = slotOf(view, owner, pos);
  if (slot.state === 'unknown') return slot.injury ?? null;
  if (slot.state === 'faceDown' || slot.state === 'revealed') return slot.card.injury ?? null;
  return null;
}

function isFaceDown(view: PlayerView, owner: 'mine' | 'opponent', pos: Pos): boolean {
  return slotOf(view, owner, pos).state !== 'revealed';
}

/** Placement fit: how well a field player suits an area. */
function fit(card: PlayerCardDef, area: Area): number {
  if (card.kind !== 'field') return 0;
  const rowBonus = (stat: StatName) =>
    card.ability?.effect === 'bonus' && card.ability.params.stat === stat && (card.ability.params.row ?? area) === area
      ? card.ability.params.amount * 0.5
      : 0;
  switch (area) {
    case 'forward': return 0.55 * (card.shot + rowBonus('shot')) + 0.45 * card.speed;
    case 'midfield': return 0.45 * card.speed + 0.3 * (card.faceoff + rowBonus('faceoff')) + 0.25 * card.defense;
    case 'defense': return 0.7 * (card.defense + rowBonus('defense')) + 0.3 * card.speed;
  }
}

function bestFit(card: PlayerCardDef): number {
  return Math.max(fit(card, 'forward'), fit(card, 'midfield'), fit(card, 'defense'));
}

/** Chance that "my" side wins a contest, from the two expected values. Smooth, to allow for unseen spells. */
function winChance(mine: number, theirs: number, iWinTies: boolean, steepness = 1.1): number {
  const d = mine - theirs + (iWinTies ? 0.5 : -0.5);
  return 1 / (1 + Math.exp(-steepness * d));
}

/** With dice in contests (an experimental option), outcomes are less certain, so the curve is flatter. */
function steepnessFor(config: GameConfig): number {
  const die = config.contestDie;
  if (!die) return 1.1;
  const diceVariance = 2 * (die * die - 1) / 12; // the difference of two rolls
  return 1.1 * 1.5 / Math.sqrt(1.5 * 1.5 + diceVariance);
}

export function heuristicAgent(seed: number, config: GameConfig = DEFAULT_CONFIG): Agent {
  let rng = seedToState(seed);
  const random = (): number => {
    let value: number;
    [value, rng] = nextRandom(rng);
    return value;
  };

  return {
    name: 'heuristic',
    chooseAction(view, legal) {
      const ai = new Thinker(view, config, random);
      let best = legal[0]!;
      let bestScore = -Infinity;
      for (const action of legal) {
        const score = ai.score(action) + random() * 0.01;
        if (score > bestScore) {
          bestScore = score;
          best = action;
        }
      }
      return best;
    },
  };
}

/** For checking the AI's judgement: every legal action with its score (no randomness), best first. */
export function explainChoice(view: PlayerView, legal: Action[], config: GameConfig = DEFAULT_CONFIG): { action: Action; score: number }[] {
  const ai = new Thinker(view, config, () => 0);
  return legal.map((action) => ({ action, score: ai.score(action) })).sort((a, b) => b.score - a.score);
}

/** Scores actions for one decision. Built fresh for each decision from the current view. */
class Thinker {
  private readonly me: Side;
  /** winChance, allowing for dice if the game uses them. */
  private readonly chance: (mine: number, theirs: number, iWinTies: boolean) => number;

  constructor(
    private readonly view: PlayerView,
    private readonly config: GameConfig,
    private readonly random: () => number,
  ) {
    this.me = view.me;
    const steepness = steepnessFor(config);
    this.chance = (mine, theirs, iWinTies) => winChance(mine, theirs, iWinTies, steepness);
  }

  score(action: Action): number {
    switch (action.type) {
      case 'chooseGoalie': return this.scoreGoalie(action.card);
      case 'place': return this.scorePlacement(action.card, action.pos);
      case 'faceoffLane': return this.scoreFaceoffLane(action.lane);
      case 'react': return this.scoreReaction(action.card);
      case 'shootoutPick': return this.myValue(action.pos, 'shot', 'shoot') + this.random() * 0.1;
      case 'discard': return -this.cardValue(this.handCard(action.card));
      case 'pass': return this.passValue(action.to, []);
      case 'shoot': return this.shotValue(this.view.ball!.pos, [], 0);
      case 'tackle': return this.tackleValue([]);
      case 'substitute': return this.currentValue() + this.substituteGain(action.pos, this.handCard(action.card));
      case 'regroup': return this.currentValue() + action.discard.reduce((sum, uid) => sum + 0.05 - this.cardValue(this.handCard(uid)), 0);
      case 'cast': return this.castValue(action);
      case 'forcedSub': return this.scoreForcedSub(this.handCard(action.card));
    }
  }

  /** Choosing who comes on after an injury: the best fit for the spot, preferring healthy players. */
  private scoreForcedSub(card: CardDef): number {
    const pending = this.view.pending;
    if (pending.kind !== 'forcedSub' || card.kind === 'spell') return -1;
    const injured = this.view.mine.hand.find((c) => c.def === card)?.injury ? -1 : 0;
    if (pending.pos.area === 'goal') return card.kind === 'goalie' ? card.save + injured : -1;
    return card.kind === 'field' ? fit(card, pending.pos.area) + injured + this.random() * 0.1 : -1;
  }

  // ---- Setup ----

  private scoreGoalie(uid: string): number {
    const def = this.handCard(uid);
    return def.kind === 'goalie' ? def.save + this.random() * 0.5 : 0;
  }

  private scorePlacement(uid: string, pos: FieldPos): number {
    // Prefer the pair where the card suits the spot better than it suits other spots.
    const card = this.handCard(uid) as PlayerCardDef;
    const specialty = fit(card, pos.area) - bestFit(card) * 0.5;
    return specialty + this.random() * 0.8;
  }

  private scoreFaceoffLane(lane: number): number {
    const pos: FieldPos = { area: 'midfield', lane };
    return this.chance(this.myValue(pos, 'faceoff', 'faceoff'), this.theirValue(pos, 'faceoff', 'faceoff'), true);
  }

  // ---- Estimating contest values ----

  private myValue(pos: Pos, stat: StatName, use: StatUse, modifiers: Modifier[] = []): number {
    const card = knownCard(this.view, 'mine', pos);
    if (!card) return 0;
    const player = card.def as PlayerCardDef;
    return scoreSide({ player, injury: card.injury, side: { stat, use, pos, modifiers }, spell: null, shielded: false }, this.config).total;
  }

  private theirValue(pos: Pos, stat: StatName, use: StatUse): number {
    const slot = slotOf(this.view, 'opponent', pos);
    if (slot.state === 'empty') return 0;
    const card = knownCard(this.view, 'opponent', pos);
    if (card) {
      const player = card.def as PlayerCardDef;
      return scoreSide({ player, injury: card.injury, side: { stat, use, pos, modifiers: [] }, spell: null, shielded: false }, this.config).total;
    }
    // Unknown player: a guess for the position, minus any injury showing.
    const injury = visibleInjury(this.view, 'opponent', pos);
    const penalty = injury && stat !== 'save' ? injury.penalty[stat as InjuryStat] ?? 0 : 0;
    return Math.max(0, this.guessUnknown(pos, stat) - penalty);
  }

  /** A guess at an unseen opposing player's stat (see STARTING_GUESS). */
  private guessUnknown(pos: Pos, stat: StatName): number {
    if (pos.area === 'goal') {
      // Assume their goalie is about as good as mine.
      const mine = knownPlayer(this.view, 'mine', { area: 'goal' });
      return mine?.kind === 'goalie' ? mine.save : 3;
    }
    if (stat === 'save') return 0;
    const seen = this.seenOpponentFieldPlayers();
    const average = seen.length >= 3 ? seen.reduce((sum, p) => sum + p[stat], 0) / seen.length : STARTING_GUESS[stat];
    return average + (POSITION_ADJUST[pos.area][stat] ?? 0);
  }

  /** Opposing field players this side has seen: face up, scried, or in their discard pile. */
  private seenOpponentFieldPlayers(): FieldCardDef[] {
    const onField = [this.view.opponent.goalie, ...Object.values(this.view.opponent.lineup).flat()]
      .flatMap((slot) => (slot.state === 'revealed' || slot.state === 'faceDown' ? [slot.card.def] : []));
    return [...onField, ...this.view.opponent.discard.map((c) => c.def)].filter((d): d is FieldCardDef => d.kind === 'field');
  }

  /** The biggest boost this side could add with a reaction spell cast by the player at `pos`. */
  private bestBoost(pos: Pos): number {
    const caster = knownPlayer(this.view, 'mine', pos);
    if (!caster) return 0;
    let best = 0;
    for (const { def } of this.view.mine.hand) {
      if (def.kind === 'spell' && def.ability.effect === 'boost') {
        best = Math.max(best, this.adjusted(def.ability.params.amount, this.affinity(caster, def)));
      }
    }
    return best;
  }

  private affinity(caster: PlayerCardDef, spell: SpellCardDef): Affinity {
    return affinityFor(caster, spell.element, this.view.opposedPairs);
  }

  private adjusted(amount: number, affinity: Affinity): number {
    if (affinity === 'match') return amount + this.config.affinityMatchBonus;
    if (affinity === 'opposed') return Math.max(0, amount - this.config.affinityOpposedPenalty);
    return amount;
  }

  // ---- Ball values ----

  /**
   * Value of my holding the ball at `pos`, allowing for the chance of being tackled before I act
   * again. A forward is worth what its shot is worth; other spots are worth a fixed amount.
   */
  private holdValue(pos: Pos, safeFromTackles = false): number {
    if (!isFieldPos(pos)) return BALL_VALUE.goal;
    const worth = pos.area === 'forward' ? Math.max(BALL_VALUE.midfield, this.shotChance(pos, [])) : BALL_VALUE[pos.area];
    if (safeFromTackles) return worth;
    const tackler = opposite(pos);
    const keep = this.chance(this.myValue(pos, 'speed', 'evade') + 0.6 * this.bestBoost(pos), this.theirValue(tackler, 'defense', 'tackle'), true);
    const lose = 0.7 * (1 - keep); // the opponent tackles when it looks worthwhile
    return (1 - lose) * worth - lose * BALL_VALUE[tackler.area];
  }

  /**
   * How things stand if this turn's action doesn't touch the ball. Holding on without passing
   * or shooting is discounted: it doesn't score, and the deck keeps shrinking.
   */
  private currentValue(): number {
    const ball = this.view.ball;
    if (!ball) return 0;
    if (ball.side === this.me) return STALL_DISCOUNT * this.holdValue(ball.pos, this.view.ballProtected);
    return -BALL_VALUE[ball.pos.area];
  }

  private passValue(to: FieldPos, modifiers: Modifier[]): number {
    const interceptor = opposite(to);
    const mine = this.myValue(to, 'speed', 'receive', modifiers) + 0.6 * this.bestBoost(to);
    const p = this.chance(mine, this.theirValue(interceptor, 'defense', 'intercept'), this.config.passTiesGoTo === 'attacker');
    const protect = this.config.protectCatch;
    const safe = protect === 'all' || (protect === 'forward' && to.area === 'forward');
    return p * this.afterGaining(to, safe) - (1 - p) * BALL_VALUE[interceptor.area];
  }

  /**
   * What getting the ball at `pos` is worth. With another action still to come this turn, a
   * forward can shoot straight away, before the other team gets a chance to tackle.
   */
  private afterGaining(pos: FieldPos, safeFromTackles = false): number {
    const hold = this.holdValue(pos, safeFromTackles);
    if (this.view.actionsLeft >= 2 && pos.area === 'forward') return Math.max(hold, this.shotValue(pos, [], 0));
    return hold;
  }

  /** Chance a shot from `from` goes in. */
  private shotChance(from: Pos, modifiers: Modifier[]): number {
    const mine = this.myValue(from, 'shot', 'shoot', modifiers) + 0.6 * this.bestBoost(from);
    return this.chance(mine, this.theirValue({ area: 'goal' }, 'save', 'save'), false);
  }

  private shotValue(from: Pos, modifiers: Modifier[], extraCost: number): number {
    const p = this.shotChance(from, modifiers);
    return p * 1 - (1 - p) * BALL_VALUE.goal - extraCost;
  }

  private tackleValue(modifiers: Modifier[]): number {
    const holder = this.view.ball!.pos as FieldPos;
    const tackler = opposite(holder);
    const mine = this.myValue(tackler, 'defense', 'tackle', modifiers) + 0.6 * this.bestBoost(tackler);
    const p = this.chance(mine, this.theirValue(holder, 'speed', 'evade'), false);
    return p * this.afterGaining(tackler) - (1 - p) * BALL_VALUE[holder.area];
  }

  // ---- Other actions ----

  private substituteGain(pos: Pos, incoming: CardDef): number {
    const incomingInjured = this.view.mine.hand.find((c) => c.def === incoming)?.injury ? 0.03 : 0;
    const outgoing = knownPlayer(this.view, 'mine', pos);
    // Filling an empty spot (a player was carried off) is well worth an action.
    if (!outgoing) return (pos.area === 'goal' ? incoming.kind === 'goalie' : incoming.kind === 'field') ? 0.15 - incomingInjured : -1;
    // Taking off an injured player is worth more.
    const outgoingInjured = visibleInjury(this.view, 'mine', pos) ? 0.03 : 0;
    const hidesRevealed = isFaceDown(this.view, 'mine', pos) ? 0 : 0.01;
    if (pos.area === 'goal') {
      if (incoming.kind !== 'goalie' || outgoing.kind !== 'goalie') return -1;
      return 0.04 * (incoming.save - outgoing.save) + hidesRevealed + outgoingInjured - incomingInjured - 0.02;
    }
    if (incoming.kind !== 'field') return -1;
    return 0.03 * (fit(incoming, pos.area) - fit(outgoing, pos.area)) + hidesRevealed + outgoingInjured - incomingInjured - 0.02;
  }

  /** How much injuring the opposing player at `pos` is worth. */
  private injuryWorth(pos: Pos): number {
    const slot = slotOf(this.view, 'opponent', pos);
    if (slot.state === 'empty' || pos.area === 'goal') return 0; // goalies can't be injured
    if (visibleInjury(this.view, 'opponent', pos)) return CARRY_OFF_WORTH;
    let worth = INJURY_WORTH;
    const ball = this.view.ball;
    if (ball && ball.side !== this.me && samePos(ball.pos, pos)) worth += 0.05; // the ball carrier
    const player = knownPlayer(this.view, 'opponent', pos);
    if (player?.kind === 'field') worth += 0.015 * Math.max(0, Math.max(player.speed, player.shot, player.defense) - 4);
    return worth;
  }

  private castValue(action: Extract<Action, { type: 'cast' }>): number {
    const spell = this.handCard(action.card) as SpellCardDef;
    const caster = knownPlayer(this.view, 'mine', action.caster);
    if (!caster) return -1;
    const affinity = this.affinity(caster, spell);
    const fizzles = affinity === 'opposed' && !NUMERIC_EFFECTS.has(spell.ability.effect);
    const revealCost = isFaceDown(this.view, 'mine', action.caster) ? REVEAL_COST : 0;
    const cost = (SPELL_VALUE[spell.ability.effect] ?? 0.05) * 0.5 + revealCost;
    const base = this.currentValue();
    if (fizzles) return base - cost - 0.1;

    const ability = spell.ability;
    const target = action.target;
    switch (ability.effect) {
      case 'recall':
        return base + 0.04 * this.adjusted(ability.params.count, affinity) - cost;
      case 'steal': {
        const amount = this.adjusted(ability.params.amount, affinity);
        return this.tackleValue([{ label: spell.name, amount }]) - cost;
      }
      case 'long_pass':
        return target.kind === 'pass' ? this.passValue(target.to, []) - cost : -1;
      case 'long_shot': {
        const penalty = affinity === 'match'
          ? Math.max(0, ability.params.penalty - this.config.affinityMatchBonus)
          : affinity === 'opposed' ? ability.params.penalty + this.config.affinityOpposedPenalty : ability.params.penalty;
        return this.shotValue(this.view.ball!.pos, [{ label: spell.name, amount: -penalty }], cost);
      }
      case 'scry': {
        if (target.kind !== 'opponent') return -1;
        const ballIsMine = this.view.ball?.side === this.me;
        const useful = target.pos.area === 'goal' && ballIsMine ? 0.04 : 0.015;
        return base + useful - cost;
      }
      case 'hit': {
        if (target.kind !== 'hit' || !isFieldPos(action.caster)) return -1;
        const targetPos = opposite(action.caster);
        const strength = this.adjusted(ability.params.strength, affinity) + 0.6 * this.bestBoost(action.caster);
        const resist = this.theirValue(targetPos, 'defense', 'resist');
        const p = this.chance(strength, resist, false);
        return base + p * this.injuryWorth(targetPos) - cost;
      }
      case 'mend': {
        let card: CardView | null | undefined = null;
        let onField = false;
        if (target.kind === 'mendField') {
          card = knownCard(this.view, 'mine', target.pos);
          onField = true;
        } else if (target.kind === 'mendHand') {
          card = this.view.mine.hand.find((c) => c.uid === target.card);
        }
        if (!card?.injury) return -1;
        const def = card.def as PlayerCardDef;
        const worth = def.kind === 'goalie' ? 0.06 : 0.02 + 0.02 * Math.max(0, bestFit(def) - 3);
        return base + (onField ? worth : worth * 0.5) - cost;
      }
      case 'swap': {
        if (target.kind !== 'swap') return -1;
        const a = knownPlayer(this.view, 'mine', target.a);
        const b = knownPlayer(this.view, 'mine', target.b);
        if (!a || !b) return -1;
        const gain = fit(a, target.b.area) + fit(b, target.a.area) - fit(a, target.a.area) - fit(b, target.b.area);
        return base + 0.02 * gain - cost;
      }
      default:
        return -1; // reaction spells can't be cast as actions
    }
  }

  // ---- Reactions ----

  private scoreReaction(uid: string | null): number {
    const pending = this.view.pending;
    if (pending.kind !== 'reaction') return 0;
    const { contest, role } = pending;
    const other: ContestRole = role === 'attacker' ? 'defender' : 'attacker';
    const me = contest[role];
    const them = contest[other];
    const myCard = knownCard(this.view, 'mine', me.pos)!;
    const myPlayer = myCard.def as PlayerCardDef;
    const theirCard = knownCard(this.view, 'opponent', them.pos);
    const theirPlayer = (theirCard?.def as PlayerCardDef | undefined) ?? null;
    const theirSpell = this.playedSpell(them.spell?.uid ?? null, them.spell?.affinity, them.spell?.fizzled);
    const theyShieldMe = theirSpell?.def.ability.effect === 'shield';
    const theyDirty = theirSpell?.def.ability.effect === 'dirty_play';

    const mySpell = uid ? this.handCard(uid) as SpellCardDef : null;
    const myAffinity = mySpell ? this.affinity(myPlayer, mySpell) : 'neutral';
    const mySpellWorks = mySpell && !(myAffinity === 'opposed' && !NUMERIC_EFFECTS.has(mySpell.ability.effect));
    const iShield = mySpellWorks && mySpell.ability.effect === 'shield';

    const myTotal = scoreSide({
      player: myPlayer, injury: myCard.injury, side: me, shielded: theyShieldMe,
      spell: mySpellWorks ? { def: mySpell, affinity: myAffinity } : null,
    }, this.config).total;
    const theirTotal = scoreSide({ player: theirPlayer, injury: theirCard?.injury, side: them, spell: theirSpell, shielded: !!iShield }, this.config).total;

    const iWinTies = contest.tiesGoTo === role;
    // The defender reacts last, so knows the outcome. The attacker has to allow for a reply.
    const pWin = role === 'defender'
      ? (myTotal > theirTotal || (myTotal === theirTotal && iWinTies) ? 1 : 0)
      : this.chance(myTotal, theirTotal, iWinTies);

    const reactionsInHand = this.view.mine.hand.filter((c) => c.def.kind === 'spell' && c.def.spellType === 'reaction').length;
    const cost = mySpell ? (reactionsInHand > 1 ? 0.08 : 0.12) : 0;
    let importance = this.importance(contest, role);
    // Winning also injures their player if I play a dirty play; losing injures mine if they did.
    const iDirty = mySpellWorks && mySpell.ability.effect === 'dirty_play';
    if (iDirty) importance += this.injuryWorth(them.pos);
    if (theyDirty) importance += INJURY_WORTH;
    // In a hit, the defender losing means an injury.
    if (contest.kind === 'hit' && role === 'defender') importance += INJURY_WORTH;
    return importance * pWin - cost;
  }

  private playedSpell(uid: string | null, affinity?: Affinity, fizzled?: boolean): { def: SpellCardDef; affinity: Affinity } | null {
    if (!uid || fizzled || !affinity) return null;
    const card = [...this.view.mine.discard, ...this.view.opponent.discard].find((c) => c.uid === uid);
    return card ? { def: card.def as SpellCardDef, affinity } : null;
  }

  /** How much a contest matters to this side (a goal is 1). */
  private importance(contest: Contest, role: ContestRole): number {
    const attackerArea = contest.attacker.pos.area;
    switch (contest.kind) {
      case 'shot': return 1;
      case 'penalty': return 1;
      case 'hit': return role === 'attacker' ? this.injuryWorth(contest.defender.pos) : 0.05;
      case 'faceoff': return 0.5;
      case 'pass':
        if (attackerArea === 'forward') return role === 'attacker' ? 0.6 : 0.7;
        if (attackerArea === 'defense') return role === 'attacker' ? 0.3 : 0.5;
        return 0.3;
      case 'tackle': {
        // The holder (defender) deep in my half is dangerous.
        const holderArea = contest.defender.pos.area;
        if (holderArea === 'forward') return role === 'attacker' ? 0.7 : 0.6;
        return 0.35;
      }
    }
  }

  // ---- Cards in hand ----

  private handCard(uid: string): CardDef {
    const card: CardView | undefined = this.view.mine.hand.find((c) => c.uid === uid);
    if (!card) throw new Error(`AI: card ${uid} not in hand`);
    return card.def;
  }

  private cardValue(def: CardDef): number {
    if (def.kind === 'spell') {
      if (def.ability.effect === 'mend' && this.hasInjuredPlayer()) return 0.08;
      return SPELL_VALUE[def.ability.effect] ?? 0.05;
    }
    if (def.kind === 'goalie') {
      const current = knownPlayer(this.view, 'mine', { area: 'goal' });
      const currentSave = current?.kind === 'goalie' ? current.save : 4;
      return 0.02 + 0.03 * Math.max(0, def.save - currentSave);
    }
    const injured = this.view.mine.hand.find((c) => c.def === def)?.injury ? 0.015 : 0;
    return 0.02 + 0.015 * Math.max(0, bestFit(def) - 3) - injured;
  }

  private hasInjuredPlayer(): boolean {
    const field = [this.view.mine.goalie, ...Object.values(this.view.mine.lineup).flat()];
    return field.some((slot) => (slot.state === 'faceDown' || slot.state === 'revealed') && slot.card.injury) ||
      this.view.mine.hand.some((c) => c.injury);
  }
}
