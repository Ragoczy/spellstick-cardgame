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
// - Casters are chosen to match the spell's magic, preferring players already face up.
// - Hits go after strong revealed players and the ball carrier (goalies can't be hit).
// - Dirty plays go into contests it expects to win. Mend goes on players it values.
// - Since v0.17, a hurt is worth its chance of each severity (Shaken, Injured, Knocked out), and a
//   tackle also counts the chance of knocking the holder down, from their Toughness (a guess by
//   row for a face-down player, whose card it can't see). Shaken players count as weaker.
// - Fouls (v0.17) are declared before the dice: worth it when the chance of winning times the hurt
//   beats the 1-in-6 risk of the referee sending its player off. Rerolls break or chase doubles.
// - Physical attacks (v0.17) are worth the chance of winning times the ball (if the target has it)
//   and the hurt, less the small chance of a penalty and the card. Late Hit and Elbow the same way.

import { adjustAmount, adjustPenalty, affinityFor } from '../engine/affinity';
import type { Action } from '../engine/actions';
import {
  familyOf, NUMERIC_EFFECTS, type Area, type CardDef, type FieldCardDef, type PhysicalCardDef, type PlayerCardDef, type SpellCardDef, type StatName, type StatUse,
} from '../engine/cards';
import type { GameConfig, InjuryDef, InjuryStat } from '../engine/config';
import { DEFAULT_CONFIG } from '../engine/config';
import type { CardView } from '../engine/events';
import { isFieldPos, opposite, samePos, type FieldPos, type Pos, type Side } from '../engine/field';
import { nextRandom, seedToState } from '../engine/rng';
import { scoreSide } from '../engine/score';
import type { Affinity, Contest, ContestRole, Modifier, Pile } from '../engine/state';
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
  hit: 0.08, dirty_play: 0.07, mend: 0.04, decoy_pass: 0.07, mirror_images: 0.05,
};

/** Rough worth of injuring an opposing player (on top of what the contest itself is worth). */
const INJURY_WORTH = 0.06;
/** Rough worth of carrying off an opposing player who is already injured. */
const CARRY_OFF_WORTH = 0.12;
/** Rough worth of making an opposing player Shaken: they sit out a turn and are weaker meanwhile. */
const SHAKEN_WORTH = 0.04;
/**
 * Rough worth of knocking out an opposing player: off the field until a return roll, about as
 * bad as a carry-off. With the default severity table (half Shaken, a third Injured, a sixth
 * Knocked out) an average hurt is then worth what an injury was before v0.17.
 */
const KNOCKOUT_WORTH = 0.12;
/** A guess at an unseen player's Toughness, by row (Stoppers and Anchors usually play deep). */
const TOUGHNESS_GUESS: Record<Area, number> = { defense: 4.5, midfield: 4, forward: 3.5 };
/** Rough worth (as a loss) of a player sent off for the game: like a carry-off, with the spot empty until a substitute. */
const SENT_OFF_WORTH = 0.15;
/** What playing a dirty play as a foul costs in cards: little, since a dirty play has no other use. */
const FOUL_CARD_COST = 0.03;
/** Rough worth of keeping a physical attack card in hand. */
const PHYSICAL_CARD_VALUE = 0.03;
/**
 * Rough worth (as a loss) of each turn a player spends in the penalty box, their spot empty: worst
 * on defense, where nobody can intercept or tackle the forward in that lane.
 */
const PENALTY_TURN_WORTH: Record<Area, number> = { defense: 0.15, midfield: 0.08, forward: 0.05 };
/** Worth of substituting out a Shaken player, who comes back standing. */
const SHAKEN_SUB_WORTH = 0.015;

/**
 * Rough worth of mirror images that last until found: protection from later tackles (players
 * who often hold the ball) and hits.
 */
const IMAGES_WORTH: Record<Area, number> = { forward: 0.06, midfield: 0.06, defense: 0.035 };

/** Holding the ball without passing or shooting counts for this share of its value. */
const STALL_DISCOUNT = 0.5;

/** Cost of revealing a face-down player just to cast a spell. */
const REVEAL_COST = 0.015;

/** Worth of substituting out a player who has no spells left, so they recharge in hand. */
const RECHARGE_WORTH = 0.02;
/**
 * Draw step: how a substitution's gain compares with drawing a card. Filling an empty spot (gain
 * 0.15) beats drawing almost anything; a small upgrade loses to drawing a needed card.
 */
const SUB_VS_DRAW = 4;
/** A substitution must gain at least this much to beat drawing (or throwing away) a card. */
const SUB_THRESHOLD = 0.02;

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

/** Whether the player at a spot is Shaken (public: the card is sideways). */
function isShakenAt(view: PlayerView, owner: 'mine' | 'opponent', pos: Pos): boolean {
  const slot = slotOf(view, owner, pos);
  return slot.state !== 'empty' && !!slot.shaken;
}

/** Whether the player at a spot has mirror images (public). */
function hasImages(view: PlayerView, owner: 'mine' | 'opponent', pos: Pos): boolean {
  const slot = slotOf(view, owner, pos);
  return slot.state === 'revealed' && !!slot.images;
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
  private ballLadder: Record<'goal' | Area, number> | null = null;
  private scale = 1;

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
      case 'draftPick': return this.scoreDraftPick(action.card);
      case 'chooseGoalie': return this.scoreGoalie(action.card);
      case 'place': return this.scorePlacement(action.card, action.pos);
      case 'faceoffLane': return this.scoreFaceoffLane(action.lane);
      case 'foul': return this.scoreFoul(action.card);
      case 'attack': return this.currentValue() + (action.card === undefined
        ? this.blindAttackGain(action.attacker, action.target)
        : this.attackGain(this.handCard(action.card) as PhysicalCardDef, action.attacker, action.target));
      case 'physicalReaction': {
        const pending = this.view.pending;
        if (action.card === null || pending.kind !== 'physicalReaction') return 0;
        return this.attackGain(this.handCard(action.card) as PhysicalCardDef, pending.attacker, pending.target);
      }
      case 'react': return this.scoreReaction(action.card);
      case 'callDice': return action.roll ? this.scoreDice() : 0;
      case 'shootoutPick': return this.myValue(action.pos, 'shot', 'shoot') + this.random() * 0.1;
      case 'discard': return -this.cardValue(this.handCard(action.card));
      case 'draw': return this.scoreDraw(action.pile);
      case 'pass': return this.passValue(action.to, []);
      case 'shoot': return this.shotValue(this.view.ball!.pos, [], 0);
      case 'tackle': return this.tackleValue([]);
      case 'substitute': {
        const gain = this.substituteGain(action.pos, this.handCard(action.card));
        // At the Draw step a substitution is weighed against drawing a card (scoreDraw's scale);
        // under the old rule it was an action, weighed against the other actions.
        return this.view.pending.kind === 'draw' ? (gain - SUB_THRESHOLD) * SUB_VS_DRAW : this.currentValue() + this.unit() * gain;
      }
      case 'regroup': return this.currentValue() + this.unit() * action.discard.reduce((sum, uid) => sum + 0.05 - this.cardValue(this.handCard(uid)), 0);
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

  /**
   * Draft: take the strongest player, with goalies valued by Save. A team only ever has one
   * goalie in goal, so a second goalie is worth much less than the first.
   */
  private scoreDraftPick(uid: string): number {
    const draft = this.view.draft!;
    const card = draft.pool.find((c) => c.uid === uid)!.def as PlayerCardDef;
    if (card.kind !== 'goalie') return bestFit(card);
    const goaliesSoFar = draft.picks[this.me].filter((c) => c.def.kind === 'goalie').length;
    return goaliesSoFar === 0 ? card.save * 1.2 : card.save * 0.4;
  }

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
    const shaken = isShakenAt(this.view, 'mine', pos);
    return scoreSide({ player, injury: card.injury, shaken, side: { stat, use, pos, modifiers }, spell: null, shielded: false }, this.config).total;
  }

  private theirValue(pos: Pos, stat: StatName, use: StatUse): number {
    const slot = slotOf(this.view, 'opponent', pos);
    if (slot.state === 'empty') return 0;
    const card = knownCard(this.view, 'opponent', pos);
    const shaken = isShakenAt(this.view, 'opponent', pos);
    if (card) {
      const player = card.def as PlayerCardDef;
      return scoreSide({ player, injury: card.injury, shaken, side: { stat, use, pos, modifiers: [] }, spell: null, shielded: false }, this.config).total;
    }
    // Unknown player: a guess for the position, minus any injury showing (and Shaken, if sideways).
    const injury = visibleInjury(this.view, 'opponent', pos);
    const penalty = (injury && stat !== 'save' ? injury.penalty[stat as InjuryStat] ?? 0 : 0) + (shaken ? this.config.shakenPenalty : 0);
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

  /**
   * The biggest boost this side could add with a reaction spell cast by the player at `pos`,
   * using their stat for `use` (a boost with a "when" only counts for that use). No use: a hit.
   */
  private bestBoost(pos: Pos, use?: StatUse): number {
    const caster = knownPlayer(this.view, 'mine', pos);
    if (!caster) return 0;
    let best = 0;
    for (const { def } of this.view.mine.hand) {
      if (def.kind === 'spell' && def.ability.effect === 'boost' && (def.ability.params.when ?? use) === use) {
        best = Math.max(best, this.adjusted(def.ability.params.amount, this.affinity(caster, def)));
      }
    }
    return best;
  }

  private affinity(caster: PlayerCardDef, spell: SpellCardDef): Affinity {
    return affinityFor(caster, spell.magic, this.view.opposedPairs);
  }

  private adjusted(amount: number, affinity: Affinity): number {
    return adjustAmount(amount, affinity, this.config);
  }

  // ---- Ball values ----

  /**
   * Value of my holding the ball at `pos`, allowing for the chance of being tackled before I act
   * again. A forward is worth what its shot is worth; other spots are worth a fixed amount.
   */
  private holdValue(pos: Pos, safeFromTackles = false, images = hasImages(this.view, 'mine', pos)): number {
    if (!isFieldPos(pos)) return this.ladder().goal;
    const worth = pos.area === 'forward' ? Math.max(this.ladder().midfield, this.shotChance(pos, [])) : this.ladder()[pos.area];
    if (safeFromTackles) return worth;
    const tackler = opposite(pos);
    const keep = this.chance(this.myValue(pos, 'speed', 'evade') + 0.6 * this.bestBoost(pos, 'evade'), this.theirValue(tackler, 'defense', 'tackle'), true);
    // The opponent tackles when it looks worthwhile; images make most tackles miss.
    const lose = 0.7 * (1 - keep) * (images ? this.findsRealPlayer() : 1);
    return (1 - lose) * worth - lose * this.ladder()[tackler.area];
  }

  /**
   * How things stand if this turn's action doesn't touch the ball. Holding on without passing
   * or shooting is discounted: it doesn't score, and the deck keeps shrinking.
   */
  private currentValue(): number {
    const ball = this.view.ball;
    if (!ball) return 0;
    if (ball.side === this.me) return STALL_DISCOUNT * this.holdValue(ball.pos, this.view.ballProtected);
    return -this.ladder()[ball.pos.area];
  }

  private passValue(to: FieldPos, modifiers: Modifier[]): number {
    const interceptor = opposite(to);
    const passBonus = this.config.passBonus ? [{ label: 'Pass', amount: this.config.passBonus }] : [];
    const mine = this.myValue(to, 'speed', 'receive', [...modifiers, ...passBonus]) + 0.6 * this.bestBoost(to, 'receive');
    const p = this.chance(mine, this.theirValue(interceptor, 'defense', 'intercept'), this.config.passTiesGoTo === 'attacker');
    const protect = this.config.protectCatch;
    const safe = protect === 'all' || (protect === 'forward' && to.area === 'forward');
    return p * this.afterGaining(to, safe) - (1 - p) * this.ladder()[interceptor.area];
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
    const mine = this.myValue(from, 'shot', 'shoot', modifiers) + 0.6 * this.bestBoost(from, 'shoot');
    return this.shotOdds(mine, this.theirValue({ area: 'goal' }, 'save', 'save'));
  }

  /** Shot against Save, allowing for the shooter and goalie both rolling (experimental config.shotDie). */
  private shotOdds(mine: number, theirs: number): number {
    const die = this.config.shotDie;
    if (!die || this.config.contestDie) return this.chance(mine, theirs, false);
    let p = 0;
    for (let a = 1; a <= die; a++) for (let b = 1; b <= die; b++) p += this.chance(mine + a, theirs + b, false);
    return p / (die * die);
  }

  /**
   * What having the ball in each area is worth. When goalies stop most shots, getting the ball
   * upfield is worth less, so the ladder is scaled to a typical forward's shot.
   */
  private ladder(): Record<'goal' | Area, number> {
    if (!this.ballLadder) {
      const typical = this.shotOdds(4, this.theirValue({ area: 'goal' }, 'save', 'save'));
      const scale = Number.isFinite(typical) ? Math.min(1, typical / 0.5) : 1;
      this.scale = scale;
      this.ballLadder = { goal: BALL_VALUE.goal * scale, defense: BALL_VALUE.defense * scale, midfield: BALL_VALUE.midfield * scale, forward: BALL_VALUE.forward * scale };
    }
    return this.ballLadder;
  }

  /**
   * Everything other than a goal (cards, injuries, field position) is valued in "goals", tuned for
   * games where a typical shot is about even. When goals are rarer, those values shrink to match.
   */
  private unit(): number {
    this.ladder();
    return this.scale;
  }

  private shotValue(from: Pos, modifiers: Modifier[], extraCost: number): number {
    const p = this.shotChance(from, modifiers);
    return p * 1 - (1 - p) * this.ladder().goal - extraCost;
  }

  private tackleValue(modifiers: Modifier[]): number {
    const holder = this.view.ball!.pos as FieldPos;
    const tackler = opposite(holder);
    const mine = this.myValue(tackler, 'defense', 'tackle', modifiers) + 0.6 * this.bestBoost(tackler, 'tackle');
    const p = this.chance(mine, this.theirValue(holder, 'speed', 'evade'), false);
    const lost = -this.ladder()[holder.area];
    // Since v0.17 a won tackle also knocks the holder down (who no longer has the ball by then).
    const knockdown = this.config.knockdowns ? this.knockdownChance('opponent', holder) * this.injuryWorth(holder, true) : 0;
    const tackled = p * (this.afterGaining(tackler) + knockdown) + (1 - p) * lost;
    // Against mirror images, the tackle usually goes for an image and changes nothing.
    if (!hasImages(this.view, 'opponent', holder)) return tackled;
    const real = this.findsRealPlayer();
    return real * tackled + (1 - real) * lost;
  }

  /** Chance that a tackle or hit on a player with mirror images finds the real one. */
  private findsRealPlayer(): number {
    return 1 / (this.config.mirrorImages + 1);
  }

  // ---- Other actions ----

  private substituteGain(pos: Pos, incoming: CardDef): number {
    const incomingInjured = this.view.mine.hand.find((c) => c.def === incoming)?.injury ? 0.03 : 0;
    const outgoing = knownPlayer(this.view, 'mine', pos);
    // Filling an empty spot (a player was carried off) is well worth an action.
    if (!outgoing) return (pos.area === 'goal' ? incoming.kind === 'goalie' : incoming.kind === 'field') ? 0.15 - incomingInjured : -1;
    // Taking off an injured player is worth more.
    const outgoingInjured = (visibleInjury(this.view, 'mine', pos) ? 0.03 : 0) + (isShakenAt(this.view, 'mine', pos) ? SHAKEN_SUB_WORTH : 0);
    const hidesRevealed = isFaceDown(this.view, 'mine', pos) ? 0 : 0.01;
    // A player who has cast all the spells they can recharges by resting in hand.
    const outgoingSlot = slotOf(this.view, 'mine', pos);
    const recharges = outgoingSlot.state === 'revealed' && outgoingSlot.castsLeft === 0 ? RECHARGE_WORTH : 0;
    if (pos.area === 'goal') {
      if (incoming.kind !== 'goalie' || outgoing.kind !== 'goalie') return -1;
      return 0.04 * (incoming.save - outgoing.save) + hidesRevealed + recharges + outgoingInjured - incomingInjured - 0.02;
    }
    if (incoming.kind !== 'field') return -1;
    return 0.03 * (fit(incoming, pos.area) - fit(outgoing, pos.area)) + hidesRevealed + recharges + outgoingInjured - incomingInjured - 0.02;
  }

  /**
   * How much hurting the opposing player at `pos` is worth. Before v0.17 every hurt is an injury;
   * since then it's the chance of each severity times its worth. ignoreBall: they won't have the
   * ball by then (a won tackle has already taken it).
   */
  private injuryWorth(pos: Pos, ignoreBall = false): number {
    const slot = slotOf(this.view, 'opponent', pos);
    if (slot.state === 'empty' || pos.area === 'goal') return 0; // goalies can't be hurt
    const ball = this.view.ball;
    const carrier = !ignoreBall && !!ball && ball.side !== this.me && samePos(ball.pos, pos) ? 0.05 : 0;
    const player = knownPlayer(this.view, 'opponent', pos);
    const star = player?.kind === 'field' ? 0.015 * Math.max(0, Math.max(player.speed, player.shot, player.defense) - 4) : 0;
    const injury = visibleInjury(this.view, 'opponent', pos) ? CARRY_OFF_WORTH : INJURY_WORTH + carrier + star;
    if (!this.config.knockdowns) return injury * this.unit();
    // A Shaken carrier keeps the ball; a knocked-out one loses it (like an injury).
    const odds = this.severityOdds();
    return (odds.shaken * (SHAKEN_WORTH + star) + odds.injured * injury + odds.knockedOut * Math.max(KNOCKOUT_WORTH + carrier + star, injury)) * this.unit();
  }

  /** The chance of each severity (v0.17), from the severity table. */
  private severityOdds(): { shaken: number; injured: number; knockedOut: number } {
    const die = this.config.contactDie;
    const shaken = Math.min(1, this.config.severity.shaken / die);
    const injured = Math.min(1 - shaken, Math.max(0, this.config.severity.injured - this.config.severity.shaken) / die);
    return { shaken, injured, knockedOut: 1 - shaken - injured };
  }

  /** Rough worth (as a loss) of one of my players being hurt, on the same scale as INJURY_WORTH. */
  private ownHurtWorth(): number {
    if (!this.config.knockdowns) return INJURY_WORTH;
    const odds = this.severityOdds();
    return odds.shaken * SHAKEN_WORTH + odds.injured * INJURY_WORTH + odds.knockedOut * KNOCKOUT_WORTH;
  }

  /**
   * Chance that a knocked-down player at `pos` is hurt: a roll above their Toughness (plus
   * `modifier`, from a physical card). A face-down opponent's Toughness can't be seen, so it's
   * guessed by row.
   */
  private knockdownChance(owner: 'mine' | 'opponent', pos: Pos, modifier = 0): number {
    if (!isFieldPos(pos)) return 0;
    const player = knownPlayer(this.view, owner, pos);
    const toughness = (player?.kind === 'field' ? player.toughness : TOUGHNESS_GUESS[pos.area]) + modifier;
    const die = this.config.contactDie;
    return Math.min(1, Math.max(0, die - toughness) / die);
  }

  private castValue(action: Extract<Action, { type: 'cast' }>): number {
    const spell = this.handCard(action.card) as SpellCardDef;
    const caster = knownPlayer(this.view, 'mine', action.caster);
    if (!caster) return -1;
    const affinity = this.affinity(caster, spell);
    const fizzles = affinity === 'opposed' && !NUMERIC_EFFECTS.has(spell.ability.effect);
    const revealCost = isFaceDown(this.view, 'mine', action.caster) ? REVEAL_COST : 0;
    const unit = this.unit();
    const cost = ((SPELL_VALUE[spell.ability.effect] ?? 0.05) * 0.5 + revealCost) * unit;
    const base = this.currentValue();
    if (fizzles) return base - cost - 0.1 * unit;

    const ability = spell.ability;
    const target = action.target;
    switch (ability.effect) {
      case 'recall':
        return base + unit * 0.04 * this.adjusted(ability.params.count, affinity) - cost;
      case 'steal': {
        const amount = this.adjusted(ability.params.amount, affinity);
        return this.tackleValue([{ label: spell.name, amount }]) - cost;
      }
      case 'long_pass':
        return target.kind === 'pass' ? this.passValue(target.to, []) - cost : -1;
      case 'decoy_pass':
        // Can't be intercepted; the receiver stays hidden and one of theirs is revealed.
        return target.kind === 'decoyPass' ? this.afterGaining(target.to) + 0.01 * unit - cost : -1;
      case 'mirror_images': {
        // Safer to hold the ball now (if the caster has it), and protection from later tackles and hits.
        if (!isFieldPos(action.caster)) return -1;
        const ball = this.view.ball;
        const holding = ball?.side === this.me && samePos(ball.pos, action.caster);
        const hold = holding ? STALL_DISCOUNT * this.holdValue(action.caster, this.view.ballProtected, true) : base;
        return hold + IMAGES_WORTH[action.caster.area] * unit - cost;
      }
      case 'long_shot': {
        const penalty = adjustPenalty(ability.params.penalty, affinity, this.config);
        return this.shotValue(this.view.ball!.pos, [{ label: spell.name, amount: -penalty }], cost);
      }
      case 'scry': {
        if (target.kind !== 'opponent') return -1;
        const ballIsMine = this.view.ball?.side === this.me;
        const useful = target.pos.area === 'goal' && ballIsMine ? 0.04 : 0.015;
        return base + unit * useful - cost;
      }
      case 'hit': {
        if (target.kind !== 'hit' || !isFieldPos(action.caster)) return -1;
        const targetPos = opposite(action.caster);
        const strength = this.adjusted(ability.params.strength, affinity) + 0.6 * this.bestBoost(action.caster);
        const resist = this.theirValue(targetPos, 'defense', 'resist');
        const real = hasImages(this.view, 'opponent', targetPos) ? this.findsRealPlayer() : 1;
        const p = real * this.chance(strength, resist, false);
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
        return base + unit * (onField ? worth : worth * 0.5) - cost;
      }
      case 'swap': {
        if (target.kind !== 'swap') return -1;
        const a = knownPlayer(this.view, 'mine', target.a);
        const b = knownPlayer(this.view, 'mine', target.b);
        if (!a || !b) return -1;
        const gain = fit(a, target.b.area) + fit(b, target.a.area) - fit(a, target.a.area) - fit(b, target.b.area);
        return base + unit * 0.02 * gain - cost;
      }
      default:
        return -1; // reaction spells can't be cast as actions
    }
  }

  // ---- Roll tokens ----

  /** Worth of spending a roll token now: the gain in win chance in a contest that matters, minus the token's value. */
  private scoreDice(): number {
    const pending = this.view.pending;
    if (pending.kind !== 'callDice') return -1;
    const { contest, role } = pending;
    const other: ContestRole = role === 'attacker' ? 'defender' : 'attacker';
    const me = contest[role];
    const them = contest[other];
    const myCard = knownCard(this.view, 'mine', me.pos)!;
    const theirCard = knownCard(this.view, 'opponent', them.pos);
    const total = (card: CardView | null, side: typeof me, owner: 'mine' | 'opponent') =>
      scoreSide({ player: (card?.def as PlayerCardDef | undefined) ?? null, injury: card?.injury, shaken: isShakenAt(this.view, owner, side.pos), side, spell: null, shielded: false }, this.config).total;
    const mine = total(myCard, me, 'mine');
    const theirs = total(theirCard, them, 'opponent');
    const iWinTies = contest.tiesGoTo === role;
    // Rerolling: the dice are already showing, so only spells are still unknown.
    const reroll = this.config.diceTokens === 'reroll';
    const now = reroll ? winChance(mine, theirs, iWinTies) : this.chance(mine, theirs, iWinTies);
    const die = reroll ? (this.config.contestDie || this.config.shotDie) : this.config.budgetDie;
    let withDice = 0;
    for (let a = 1; a <= die; a++) {
      if (reroll) { withDice += winChance(mine - me.roll! + a, theirs, iWinTies) / die; continue; }
      if (this.config.diceMode === 'self') withDice += this.chance(mine + a, theirs, iWinTies) / die;
      else for (let b = 1; b <= die; b++) withDice += this.chance(mine + a, theirs + b, iWinTies) / (die * die);
    }
    // Rolls are scarce: worth more as the pile runs down.
    const left = this.view.diceLeft[this.me];
    const rollValue = (left > this.config.diceBudget / 2 ? 0.05 : 0.1) * this.unit();
    return this.importance(contest, role) * (withDice - now) - rollValue + this.refereeGain(me, them, die);
  }

  /**
   * The referee (v0.17): rerolling my die changes whether the dice match. Worth it to break a
   * double when I fouled, or to chase one when they did.
   */
  private refereeGain(me: Contest['attacker'], them: Contest['attacker'], die: number): number {
    if (this.config.foulTiming !== 'before' || this.config.diceTokens !== 'reroll' || !me.roll || !them.roll) return 0;
    const iFouled = this.isFoul(me.spell?.uid);
    const theyFouled = this.isFoul(them.spell?.uid);
    if (!iFouled && !theyFouled) return 0;
    const doublesNow = me.roll === them.roll ? 1 : 0;
    const stake = (theyFouled ? SENT_OFF_WORTH : 0) - (iFouled ? SENT_OFF_WORTH : 0);
    return (1 / die - doublesNow) * stake * this.unit();
  }

  /** Whether a spell played in this contest was a dirty play (it's on a discard pile by now). */
  private isFoul(uid: string | undefined): boolean {
    if (!uid) return false;
    const card = [...this.view.mine.discard, ...this.view.opponent.discard].find((c) => c.uid === uid);
    return card?.def.kind === 'spell' && card.def.ability.effect === 'dirty_play';
  }

  // ---- Physical attacks (v0.17) ----

  /**
   * What a physical attack is worth, beyond what I have now: if it wins, the target drops the ball
   * (if they have it) and may be hurt. Less the chance of a penalty (a 1 on my die, then another 1)
   * and the card itself. Spearing risks my own player too.
   */
  private attackGain(def: PhysicalCardDef, attacker: FieldPos, target: FieldPos): number {
    const attackerCard = knownPlayer(this.view, 'mine', attacker);
    const targetCard = knownPlayer(this.view, 'opponent', target);
    if (!attackerCard) return -1;
    const mods: Modifier[] = def.bonus ? [{ label: def.name, amount: def.bonus }] : [];
    if (this.hasAffinity(attackerCard, def.affinity)) mods.push({ label: 'Affinity', amount: this.config.affinityAttackBonus });
    const ball = this.view.ball;
    const theyHoldIt = !!ball && ball.side !== this.me && samePos(ball.pos, target);
    const ability = def.ability;
    if (ability?.effect === 'vs_holder' && theyHoldIt) mods.push({ label: 'Has the ball', amount: ability.params.amount });
    if (ability?.effect === 'pile_on') {
      const helpers = [attacker.lane - 1, attacker.lane + 1].filter((lane) => {
        if (lane < 0 || lane >= this.view.lanes) return false;
        const slot = slotOf(this.view, 'mine', { area: attacker.area, lane });
        return slot.state !== 'empty' && !slot.shaken;
      }).length;
      if (helpers) mods.push({ label: 'Pile-on', amount: helpers * ability.params.amount });
    }
    const stat: StatName = def.uses === 'muscle' ? 'defense' : 'speed';
    const mine = this.myValue(attacker, stat, 'attack', mods) + 0.6 * this.bestBoost(attacker, 'attack');
    const dodge = targetCard && this.hasAffinity(targetCard, this.config.physicalDodge.affinity) ? this.config.physicalDodge.amount : 0;
    const p = this.chance(mine, this.theirValue(target, 'speed', 'evade') + dodge, false);

    const ballGain = theyHoldIt ? this.afterGaining(attacker) - this.currentValue() : 0;
    let hurt = 0;
    if (ability?.effect === 'only_shaken') hurt = SHAKEN_WORTH * this.unit();
    else if (def.toughness !== null) {
      const endurance = targetCard && this.hasAffinity(targetCard, this.config.physicalEndurance.affinity) ? this.config.physicalEndurance.amount : 0;
      const chance = ability?.effect === 'shaken_anyway' ? 1 : this.knockdownChance('opponent', target, def.toughness + endurance);
      hurt = chance * this.injuryWorth(target, true);
    }
    const selfRisk = ability?.effect === 'self_check' ? this.knockdownChance('mine', attacker) * this.ownHurtWorth() * this.unit() : 0;
    // The penalty check needs both dice at the team's penalty risk level or lower.
    const level = this.view.mine.penaltyLevel;
    const die = this.config.contestDie || 6;
    const penaltyRisk = Math.min(1, level / die) * Math.min(1, level / this.config.contactDie) * this.config.penaltyTurns[def.tier] * PENALTY_TURN_WORTH[attacker.area] * this.unit();
    return p * (ballGain + hurt) - selfRisk - penaltyRisk - PHYSICAL_CARD_VALUE * this.unit();
  }

  /**
   * A blind attack (config.physicalDraw 'blind'): the card is the unseen top of my Physical pile,
   * so it's worth the average over the cards still in it (after a reshuffle, the discards).
   */
  private blindAttackGain(attacker: FieldPos, target: FieldPos): number {
    const remaining = this.view.mine.physicalRemaining.length
      ? this.view.mine.physicalRemaining
      : this.view.mine.physicalDiscard.map((c) => c.def);
    const cards = remaining.filter((d): d is PhysicalCardDef => d.kind === 'physical');
    if (!cards.length) return -1;
    return cards.reduce((sum, def) => sum + this.attackGain(def, attacker, target), 0) / cards.length;
  }

  /** Whether a player has this Affinity: exactly, or their whole family. */
  private hasAffinity(player: PlayerCardDef, affinity: string): boolean {
    return player.resonants.some((r) => r.affinity === affinity || r.affinity === familyOf(affinity));
  }

  // ---- Fouls (v0.17) ----

  /**
   * Declaring a foul before the dice: if my side wins, their player is hurt; if the dice match,
   * the referee sends mine off. It also uses up my reaction spell for this contest.
   */
  private scoreFoul(uid: string | null): number {
    const pending = this.view.pending;
    if (uid === null || pending.kind !== 'foul') return 0;
    const { contest, role } = pending;
    const me = contest[role];
    const them = contest[role === 'attacker' ? 'defender' : 'attacker'];
    const myCard = knownCard(this.view, 'mine', me.pos);
    if (!myCard) return -1;
    const spell = this.handCard(uid) as SpellCardDef;
    if (this.affinity(myCard.def as PlayerCardDef, spell) === 'opposed') return -1; // it would fail
    const theirCard = knownCard(this.view, 'opponent', them.pos);
    const total = (card: CardView | null, side: typeof me, owner: 'mine' | 'opponent') =>
      scoreSide({ player: (card?.def as PlayerCardDef | undefined) ?? null, injury: card?.injury, shaken: isShakenAt(this.view, owner, side.pos), side, spell: null, shielded: false }, this.config).total;
    const pWin = this.chance(total(myCard, me, 'mine'), total(theirCard, them, 'opponent'), contest.tiesGoTo === role);
    // An empty spot doesn't roll, so there can be no doubles.
    const die = this.config.contestDie || this.config.shotDie;
    const caught = theirCard && die ? 1 / die : 0;
    return pWin * this.injuryWorth(them.pos) - caught * SENT_OFF_WORTH * this.unit() - FOUL_CARD_COST * this.unit();
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
      player: myPlayer, injury: myCard.injury, shaken: isShakenAt(this.view, 'mine', me.pos), side: me, shielded: theyShieldMe,
      spell: mySpellWorks ? { def: mySpell, affinity: myAffinity } : null,
    }, this.config).total;
    const theirTotal = scoreSide({
      player: theirPlayer, injury: theirCard?.injury, shaken: isShakenAt(this.view, 'opponent', them.pos), side: them, spell: theirSpell, shielded: !!iShield,
    }, this.config).total;

    const iWinTies = contest.tiesGoTo === role;
    // The defender reacts last, so knows the outcome. The attacker has to allow for a reply
    // (the dice are already showing, so that's the only thing left unknown).
    const pWin = role === 'defender'
      ? (myTotal > theirTotal || (myTotal === theirTotal && iWinTies) ? 1 : 0)
      : (me.roll || them.roll) ? winChance(myTotal, theirTotal, iWinTies) : this.chance(myTotal, theirTotal, iWinTies);

    const reactionsInHand = this.view.mine.hand.filter((c) => c.def.kind === 'spell' && c.def.spellType === 'reaction').length;
    const cost = mySpell ? (reactionsInHand > 1 ? 0.08 : 0.12) * this.unit() : 0;
    let importance = this.importance(contest, role);
    // Winning also injures their player if I play a dirty play; losing injures mine if they did.
    const iDirty = mySpellWorks && mySpell.ability.effect === 'dirty_play';
    if (iDirty) importance += this.injuryWorth(them.pos);
    if (theyDirty) importance += this.ownHurtWorth();
    // In a hit, the defender losing means a hurt; in a tackle (v0.17), a knockdown.
    if (contest.kind === 'hit' && role === 'defender') importance += this.ownHurtWorth();
    if (contest.kind === 'tackle' && role === 'defender' && this.config.knockdowns) {
      importance += this.knockdownChance('mine', me.pos) * this.ownHurtWorth();
    }
    return importance * pWin - cost;
  }

  private playedSpell(uid: string | null, affinity?: Affinity, fizzled?: boolean): { def: SpellCardDef; affinity: Affinity } | null {
    if (!uid || fizzled || !affinity) return null;
    const card = [...this.view.mine.discard, ...this.view.opponent.discard].find((c) => c.uid === uid);
    return card ? { def: card.def as SpellCardDef, affinity } : null;
  }

  /** How much a contest matters to this side (a goal is 1). */
  private importance(contest: Contest, role: ContestRole): number {
    if (contest.kind === 'shot' || contest.kind === 'penalty') return 1;
    return this.unit() * this.fieldImportance(contest, role);
  }

  /** How much a contest away from goal matters, before scaling (see unit). */
  private fieldImportance(contest: Contest, role: ContestRole): number {
    const attackerArea = contest.attacker.pos.area;
    switch (contest.kind) {
      case 'shot': return 1;
      case 'penalty': return 1;
      case 'hit': return role === 'attacker' ? this.injuryWorth(contest.defender.pos) / this.unit() : 0.05;
      case 'faceoff': return 0.5;
      case 'attack': return 0.35;
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
    if (def.kind === 'physical') return PHYSICAL_CARD_VALUE;
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

  /** Draw step: a player when short of substitutes (or someone is hurt), otherwise a spell. */
  private scoreDraw(pile: Pile): number {
    const hand = this.view.mine.hand;
    const players = hand.filter((c) => c.def.kind === 'field').length;
    const spells = hand.filter((c) => c.def.kind === 'spell').length;
    const want = pile === 'players'
      ? (players === 0 ? 0.6 : players === 1 ? 0.3 : 0.1) + (this.hasInjuredPlayer() ? 0.1 : 0)
      : spells === 0 ? 0.6 : spells <= 2 ? 0.4 : 0.15;
    // With a full hand nothing is drawn: the top card of the chosen pile is thrown away instead.
    // That costs little (the hand is full anyway), so it scores just below zero: throw away the
    // pile you want less.
    const handFull = hand.length >= this.config.handLimit;
    return handFull ? -0.1 * want + this.random() * 0.005 : want + this.random() * 0.05;
  }

  private hasInjuredPlayer(): boolean {
    const field = [this.view.mine.goalie, ...Object.values(this.view.mine.lineup).flat()];
    return field.some((slot) => (slot.state === 'faceDown' || slot.state === 'revealed') && slot.card.injury) ||
      this.view.mine.hand.some((c) => c.injury);
  }
}
