// Contests (RULES.md "Contests"):
// 1. Reveal both players.
// 2. Fouls (v0.17): the attacker may declare a dirty play, then the defender may. A side that
//    fouls has used its one reaction spell for this contest.
// 3. Both roll a die. The attacker may spend a roll token to reroll theirs. Then the defender may.
// 4. The attacker may play one reaction spell, cast by its player in the contest. Then the
//    defender, having seen it, may do the same. (In a faceoff, the chooser goes first.) Sides
//    that fouled don't.
// 5. Apply abilities, injuries, spells, and dice.
// 6. The attacker wins only with a higher value. Ties go to the defender, except in passes
//    (the receiver) and faceoffs (the chooser).
// 7. The referee (v0.17): if the two dice match, every side that fouled has its player sent off.
// 8. Then hurts: a hit that lands, a dirty play by the winning side, and (v0.17) a successful
//    tackle, which knocks the tackled player down. A player is hurt at most once per contest.
//
// Before v0.17 (config.foulTiming 'reaction'), a dirty play is an ordinary reaction spell, played
// after the dice, and there is no referee.
//
// An empty spot (a player carried off) counts as 0 and can't play reaction spells. Nor can a
// player who has used up their casting limit.

import { affinityFor, spellFizzles } from './affinity';
import {
  cardView, castsLeft, countCast, defOf, drawCards, hasReactionSpell, injuryOf, isFoulSpell, isReactionSpell, moveHandToDiscard, playerAt, reveal, slotAt, topPhysical,
} from './board';
import { familyOf, type PhysicalCardDef, type PlayerCardDef, type SpellCardDef } from './cards';
import type { Breakdown, GameEvent } from './events';
import { GOAL, isFieldPos, opposite, otherSide, samePos, type FieldPos, type Side } from './field';
import { continueGame, recordPenalty, scoreGoal } from './flow';
import {
  hurtPlayer, injurePlayer, isShaken, knockDown, penalize, penaltyRoll, sendOff, shake, type HurtResult,
} from './injuries';
import { randomInt } from './rng';
import { scoreSide } from './score';
import type { Contest, ContestRole, ContestSide, GameState, Modifier, PhysicalTrigger, Uid } from './state';

function otherRole(role: ContestRole): ContestRole {
  return role === 'attacker' ? 'defender' : 'attacker';
}

/**
 * The die both players roll in this contest: every contest is rolled (RULES.md "Contests").
 * In online matches started before v0.16, only shots and penalties were. 0 = not rolled.
 */
function contestDie(s: GameState, contest: Contest): number {
  const isShot = contest.kind === 'shot' || contest.kind === 'penalty';
  return s.config.contestDie || (isShot ? s.config.shotDie : 0);
}

export function startContest(s: GameState, contest: Contest, ev: GameEvent[]): void {
  reveal(s, contest.attacker.side, contest.attacker.pos, ev);
  reveal(s, contest.defender.side, contest.defender.pos, ev);
  // No fouls in a physical attack: it is already the foul.
  if (s.config.foulTiming === 'before' && contest.kind !== 'attack') askForFoul(s, contest, 'attacker', ev);
  else rollDice(s, contest, ev);
}

// ---- Fouls (v0.17, RULES.md "Fouls and the referee") ----

/** Whether the player on this side of the contest can cast now (a spell left, not just on, not Shaken). */
function canCast(s: GameState, side: ContestSide): boolean {
  const slot = slotAt(s, side.side, side.pos);
  return !!slot && castsLeft(s, side.side, side.pos) > 0 && !slot.cameOn && !isShaken(s, side.side, side.pos);
}

/** Asks a side whether to declare a foul, if it holds a dirty play its player can cast; otherwise moves on. */
function askForFoul(s: GameState, contest: Contest, role: ContestRole, ev: GameEvent[]): void {
  const me = contest[role];
  if (canCast(s, me) && hasReactionSpell(s, me.side, me, true)) {
    s.pending = { kind: 'foul', side: me.side, role, contest };
    return;
  }
  afterFoul(s, contest, role, ev);
}

function afterFoul(s: GameState, contest: Contest, role: ContestRole, ev: GameEvent[]): void {
  if (role === 'attacker') askForFoul(s, contest, 'defender', ev);
  else rollDice(s, contest, ev);
}

/** A side declares a foul (a dirty play, cast by its player in the contest), or null for none. */
export function playFoul(s: GameState, card: Uid | null, ev: GameEvent[]): void {
  if (s.pending.kind !== 'foul') throw new Error('No contest is waiting for a foul');
  const { contest, role } = s.pending;
  if (card !== null) castReaction(s, contest[role], card, true, ev);
  afterFoul(s, contest, role, ev);
}

/** The player on this side casts a reaction spell (or a foul) from hand. */
function castReaction(s: GameState, me: ContestSide, card: Uid, foul: boolean, ev: GameEvent[]): void {
  const spell = defOf(s, card) as SpellCardDef;
  const caster = playerAt(s, me.side, me.pos);
  const affinity = affinityFor(caster, spell.magic, s.opposedPairs);
  const fizzled = spellFizzles(spell, affinity);
  me.spell = { uid: card, affinity, fizzled };
  moveHandToDiscard(s, me.side, card);
  countCast(s, me.side, me.pos);
  ev.push({ type: 'spellCast', side: me.side, card: cardView(s, card), caster: me.pos, affinity, fizzled, ...(foul ? { foul: true } : {}) });
}

/** Whether this side declared a foul (a dirty play before the dice), whether or not it worked. */
function fouled(s: GameState, side: ContestSide): boolean {
  return s.config.foulTiming === 'before' && !!side.spell && isFoulSpell(defOf(s, side.spell.uid));
}

/**
 * The referee: if both dice show the same number, every side that fouled has its player sent off.
 * Judged on the final dice, after rerolls.
 */
function referee(s: GameState, contest: Contest, ev: GameEvent[]): void {
  const { attacker, defender } = contest;
  if (!attacker.roll || attacker.roll !== defender.roll) return;
  for (const side of [attacker, defender]) {
    if (fouled(s, side) && slotAt(s, side.side, side.pos)) sendOff(s, side.side, side.pos, side.roll!, ev);
  }
}

/** Both players roll their die (every contest is rolled), then the rerolls. */
function rollDice(s: GameState, contest: Contest, ev: GameEvent[]): void {
  const die = contestDie(s, contest);
  if (die > 0) {
    for (const side of [contest.attacker, contest.defender]) {
      if (!slotAt(s, side.side, side.pos)) continue; // an empty spot doesn't roll
      let roll: number;
      [roll, s.rng] = randomInt(s.rng, die);
      side.roll = roll + 1;
    }
  }
  const rollOf = (side: ContestSide) => (side.roll ? { roll: side.roll } : {});
  ev.push({
    type: 'contestStarted',
    kind: contest.kind,
    attacker: { side: contest.attacker.side, pos: contest.attacker.pos, ...rollOf(contest.attacker) },
    defender: { side: contest.defender.side, pos: contest.defender.pos, ...rollOf(contest.defender) },
  });
  askForDice(s, contest, 'attacker', ev);
}

// ---- Roll tokens (RULES.md "Dice") ----

/**
 * Can this side spend a roll token now? With 'reroll' tokens (the rule), a side that rolled may
 * reroll its own die. With the old 'call' tokens, a side may call for dice in a contest that
 * isn't rolled yet.
 */
function canSpendToken(s: GameState, contest: Contest, role: ContestRole): boolean {
  const me = contest[role];
  if (s.config.diceBudget <= 0 || s.diceLeft[me.side] <= 0 || !slotAt(s, me.side, me.pos)) return false;
  if (s.config.diceTokens === 'reroll') return !!me.roll;
  const alreadyRolled = s.config.diceMode === 'both' ? !!(contest.attacker.roll || contest.defender.roll) : !!me.roll;
  return !alreadyRolled;
}

/** Asks a side whether to spend a roll token, if it can; otherwise moves on. */
function askForDice(s: GameState, contest: Contest, role: ContestRole, ev: GameEvent[]): void {
  const me = contest[role];
  if (canSpendToken(s, contest, role)) {
    s.pending = { kind: 'callDice', side: me.side, role, contest };
    return;
  }
  afterDice(s, contest, role, ev);
}

function afterDice(s: GameState, contest: Contest, role: ContestRole, ev: GameEvent[]): void {
  if (role === 'attacker') askForDice(s, contest, 'defender', ev);
  else askForReaction(s, contest, 'attacker', ev);
}

/**
 * A side decides whether to spend a roll token. With 'reroll' tokens, they reroll their own die.
 * With the old 'call' tokens, they call for dice: in 'both' mode both players roll; only the
 * caller pays.
 */
export function callDice(s: GameState, roll: boolean, ev: GameEvent[]): void {
  if (s.pending.kind !== 'callDice') throw new Error('No contest is waiting for dice');
  const { contest, role } = s.pending;
  const me = contest[role];
  if (roll && s.config.diceTokens === 'reroll') {
    s.diceLeft[me.side] -= 1;
    const from = me.roll!;
    let value: number;
    [value, s.rng] = randomInt(s.rng, contestDie(s, contest));
    me.roll = value + 1;
    ev.push({ type: 'rerolled', side: me.side, role, from, to: me.roll, left: { ...s.diceLeft } });
  } else if (roll) {
    s.diceLeft[me.side] -= 1;
    const rollers = s.config.diceMode === 'both' ? [contest.attacker, contest.defender] : [me];
    for (const side of rollers) {
      if (!slotAt(s, side.side, side.pos) || side.roll) continue;
      let value: number;
      [value, s.rng] = randomInt(s.rng, s.config.budgetDie);
      side.roll = value + 1;
    }
    ev.push({
      type: 'diceRolled',
      caller: me.side,
      attacker: contest.attacker.side,
      ...(contest.attacker.roll ? { attackerRoll: contest.attacker.roll } : {}),
      ...(contest.defender.roll ? { defenderRoll: contest.defender.roll } : {}),
      left: { ...s.diceLeft },
    });
  }
  afterDice(s, contest, role, ev);
}

/** Waits for a side's reaction spell, or moves on if they have none (or no player to cast it). */
function askForReaction(s: GameState, contest: Contest, role: ContestRole, ev: GameEvent[]): void {
  const me = contest[role];
  // The player in the contest casts it, so they need a spell left (RULES.md "Casting limit").
  // A tired player is announced whatever the hand holds: their spells left are public anyway.
  const left = castsLeft(s, me.side, me.pos);
  if (slotAt(s, me.side, me.pos) && left === 0) ev.push({ type: 'outOfSpells', side: me.side, pos: me.pos });
  // A player who came on this turn can't cast yet, and a Shaken player can't cast at all. A side
  // that fouled has already used its reaction spell.
  if (!me.spell && hasReactionSpell(s, me.side, me) && left > 0 && !slotAt(s, me.side, me.pos)?.cameOn && !isShaken(s, me.side, me.pos)) {
    s.pending = { kind: 'reaction', side: me.side, role, contest };
    return;
  }
  afterReaction(s, contest, role, ev);
}

function afterReaction(s: GameState, contest: Contest, role: ContestRole, ev: GameEvent[]): void {
  if (role === 'attacker') askForReaction(s, contest, 'defender', ev);
  else resolveContest(s, contest, ev);
}

/** A side plays a reaction spell (or null for none) during a contest. */
export function playReaction(s: GameState, card: Uid | null, ev: GameEvent[]): void {
  if (s.pending.kind !== 'reaction') throw new Error('No contest is waiting for a reaction');
  const { contest, role } = s.pending;
  if (card !== null) castReaction(s, contest[role], card, false, ev);
  afterReaction(s, contest, role, ev);
}

/** The reaction spell a side played, if it took effect and has the given effect. */
function activeSpell(s: GameState, side: ContestSide, effect: string): boolean {
  if (!side.spell || side.spell.fizzled) return false;
  const spell = defOf(s, side.spell.uid);
  return isReactionSpell(spell) && spell.ability.effect === effect;
}

/** Works out one side's value in a contest, with a breakdown for plain-language explanations. */
export function contestValue(s: GameState, contest: Contest, role: ContestRole): Breakdown {
  const me = contest[role];
  const them = contest[otherRole(role)];
  const slot = slotAt(s, me.side, me.pos);
  const spell = me.spell && !me.spell.fizzled
    ? { def: defOf(s, me.spell.uid) as SpellCardDef, affinity: me.spell.affinity }
    : null;
  const player = slot ? (defOf(s, slot.uid) as PlayerCardDef) : null;
  const injury = slot ? injuryOf(s, slot.uid) : null;
  const shaken = slot?.shakenUntil !== undefined;
  const score = scoreSide({ player, injury, shaken, side: me, spell, shielded: activeSpell(s, them, 'shield') }, s.config);
  return {
    side: me.side,
    pos: me.pos,
    card: slot ? cardView(s, slot.uid) : null,
    stat: me.stat,
    ...(me.power ? { baseLabel: me.power.label } : {}),
    ...score,
  };
}

function resolveContest(s: GameState, contest: Contest, ev: GameEvent[]): void {
  const attacker = contestValue(s, contest, 'attacker');
  const defender = contestValue(s, contest, 'defender');
  // An empty goal can't save: any shot scores.
  const emptyGoal = (contest.kind === 'shot' || contest.kind === 'penalty') && !defender.card;
  const attackerWins = emptyGoal ||
    attacker.total > defender.total || (attacker.total === defender.total && contest.tiesGoTo === 'attacker');
  const winnerRole: ContestRole = attackerWins ? 'attacker' : 'defender';
  const winner = contest[winnerRole];
  ev.push({ type: 'contestResolved', kind: contest.kind, attacker, defender, winner: winner.side, winnerRole });

  // draw_on_win: ignored if the winner was shielded.
  const winnerSlot = slotAt(s, winner.side, winner.pos);
  const winnerDef = winnerSlot ? (defOf(s, winnerSlot.uid) as PlayerCardDef) : null;
  const winnerShielded = attackerWins ? attacker.shielded : defender.shielded;
  if (winnerDef?.ability?.effect === 'draw_on_win' && !winnerShielded) {
    drawCards(s, winner.side, winnerDef.ability.params.count, 'ability', ev);
  }

  applyOutcome(s, contest, attackerWins, ev);

  // The referee looks before the hurts: a caught foul still takes effect if its side won.
  if (!s.result && s.config.foulTiming === 'before') referee(s, contest, ev);
  if (!s.result) {
    if (contest.kind === 'attack') applyAttack(s, contest, attackerWins, ev);
    else applyHurts(s, contest, attackerWins, ev);
  }
  // A physical reaction card (Late Hit, Elbow) may follow.
  if (!s.result && offerPhysicalReaction(s, contest, attackerWins)) return;
  continueGame(s, ev);
}

/**
 * Hurts after a contest: a hit that lands hurts its target, a dirty play by the winner hurts the
 * loser, and (v0.17) a successful tackle knocks the tackled player down.
 */
function applyHurts(s: GameState, contest: Contest, attackerWins: boolean, ev: GameEvent[]): void {
  const winner = attackerWins ? contest.attacker : contest.defender;
  const loser = attackerWins ? contest.defender : contest.attacker;
  const hitLands = contest.kind === 'hit' && attackerWins;
  const dirty = activeSpell(s, winner, 'dirty_play') ? defOf(s, winner.spell!.uid).name : null;
  const hitName = contest.attacker.power?.label ?? 'Hit';

  if (!s.config.knockdowns) {
    // Before v0.17: every hurt is an injury, and a hit and a dirty play both count.
    if (hitLands) injurePlayer(s, contest.defender.side, contest.defender.pos, 'hit', hitName, ev);
    if (dirty) injurePlayer(s, loser.side, loser.pos, 'dirty_play', dirty, ev);
    return;
  }
  // A player is hurt at most once per contest: a hit first, then a dirty play, then a knockdown.
  if (hitLands) hurtPlayer(s, contest.defender.side, contest.defender.pos, 'hit', hitName, ev);
  else if (dirty) hurtPlayer(s, loser.side, loser.pos, 'dirty_play', dirty, ev);
  else if (contest.kind === 'tackle' && attackerWins) knockDown(s, contest.defender.side, contest.defender.pos, 'Tackle', ev);
}

function giveBall(s: GameState, side: Side, pos: ContestSide['pos'], ev: GameEvent[]): void {
  s.ball = { side, pos };
  s.ballProtected = false;
  ev.push({ type: 'ballMoved', side, pos });
}

function applyOutcome(s: GameState, contest: Contest, attackerWins: boolean, ev: GameEvent[]): void {
  const { attacker, defender } = contest;
  switch (contest.kind) {
    case 'faceoff': {
      // The winner's midfielder takes the ball; if that spot is empty, the other midfielder does.
      const winner = attackerWins ? attacker : defender;
      const other = attackerWins ? defender : attacker;
      if (slotAt(s, winner.side, winner.pos)) giveBall(s, winner.side, winner.pos, ev);
      else if (slotAt(s, other.side, other.pos)) giveBall(s, other.side, other.pos, ev);
      else giveBall(s, attacker.side, GOAL, ev);
      break;
    }
    case 'pass': {
      // The winner's player in the contest takes the ball (a lost pass is an interception).
      // An empty spot can't intercept.
      const winner = attackerWins || !slotAt(s, defender.side, defender.pos) ? attacker : defender;
      giveBall(s, winner.side, winner.pos, ev);
      // Experimental: a caught pass can't be tackled until the catcher's team's next turn.
      const protect = s.config.protectCatch;
      if (attackerWins && (protect === 'all' || (protect === 'forward' && attacker.pos.area === 'forward'))) {
        s.ballProtected = true;
      }
      break;
    }
    case 'tackle':
      // A failed tackle changes nothing.
      if (attackerWins) giveBall(s, attacker.side, attacker.pos, ev);
      break;
    case 'shot':
      if (attackerWins) scoreGoal(s, attacker.side, ev);
      else giveBall(s, defender.side, GOAL, ev);
      break;
    case 'penalty':
      recordPenalty(s, attacker.side, attackerWins, ev);
      break;
    case 'hit':
      // The ball doesn't move; the injury is applied after the outcome.
      break;
    case 'attack':
      // A won attack makes the target drop the ball, and the attacker takes it.
      if (attackerWins && s.ball && s.ball.side === defender.side && samePos(s.ball.pos, defender.pos)) {
        ev.push({ type: 'ballDropped', side: defender.side, pos: defender.pos });
        giveBall(s, attacker.side, attacker.pos, ev);
      }
      break;
  }
}

// ---- Physical attacks (v0.17, RULES.md "Physical attacks") ----

/** Whether a player has this Affinity: exactly, or their whole family ("body" counts for "body.strength"). */
function hasAffinity(player: PlayerCardDef, affinity: string): boolean {
  return player.resonants.some((r) => r.affinity === affinity || r.affinity === familyOf(affinity));
}

/**
 * A physical attack: the attacker's Speed (Defense for a muscle card) plus the card's bonuses,
 * against the target's Speed. It's a contest like any other: rolled, with rerolls and reaction
 * spells, but no fouls. Ties go to the target.
 */
export function startAttack(s: GameState, side: Side, chosen: Uid | undefined, attacker: FieldPos, target: FieldPos, ev: GameEvent[]): void {
  // Blind draw: the top card of the Physical pile is flipped and played.
  const card = chosen ?? topPhysical(s, side)!;
  const def = defOf(s, card) as PhysicalCardDef;
  if (chosen) moveHandToDiscard(s, side, card);
  else s.teams[side].physicalDiscard.push(card);
  ev.push({ type: 'attackDeclared', side, card: cardView(s, card), attacker, target, ...(chosen ? {} : { flipped: true }) });
  const other = otherSide(side);
  startContest(s, {
    kind: 'attack',
    physical: card,
    attacker: { side, pos: attacker, stat: def.uses === 'muscle' ? 'defense' : 'speed', use: 'attack', spell: null, modifiers: attackBonuses(s, side, def, attacker, target) },
    defender: { side: other, pos: target, stat: 'speed', use: 'evade', spell: null, modifiers: dodgeBonuses(s, other, target) },
    tiesGoTo: 'defender',
  }, ev);
}

/** The attack's bonuses: the card's own, the body Affinity on the card, and the card's rule (Tripping, Pile-on). */
function attackBonuses(s: GameState, side: Side, def: PhysicalCardDef, attacker: FieldPos, target: FieldPos): Modifier[] {
  const mods: Modifier[] = [];
  if (def.bonus) mods.push({ label: def.name, amount: def.bonus });
  if (s.config.affinityAttackBonus && hasAffinity(playerAt(s, side, attacker), def.affinity)) {
    mods.push({ label: 'Affinity', amount: s.config.affinityAttackBonus });
  }
  const ability = def.ability;
  if (ability?.effect === 'vs_holder' && s.ball && s.ball.side !== side && samePos(s.ball.pos, target)) {
    mods.push({ label: 'Has the ball', amount: ability.params.amount });
  }
  if (ability?.effect === 'pile_on') {
    const helpers = [attacker.lane - 1, attacker.lane + 1].filter((lane) => {
      if (lane < 0 || lane >= s.config.lanes) return false;
      const slot = slotAt(s, side, { area: attacker.area, lane });
      return !!slot && slot.shakenUntil === undefined;
    }).length;
    if (helpers) mods.push({ label: 'Pile-on', amount: helpers * ability.params.amount });
  }
  return mods;
}

/** The target's bonus to dodge any physical attack (Danger-sense). */
function dodgeBonuses(s: GameState, side: Side, target: FieldPos): Modifier[] {
  const { affinity, amount } = s.config.physicalDodge;
  return amount && hasAffinity(playerAt(s, side, target), affinity) ? [{ label: 'Dodge', amount }] : [];
}

/** The target's bonus to Toughness against any physical attack (Endurance). */
function enduranceBonus(s: GameState, side: ContestSide): number {
  const { affinity, amount } = s.config.physicalEndurance;
  const slot = slotAt(s, side.side, side.pos);
  return slot && hasAffinity(defOf(s, slot.uid) as PlayerCardDef, affinity) ? amount : 0;
}

/**
 * After a physical attack: if it won, the target is knocked down with the card's modifiers (or
 * simply Shaken, for Atomic Wedgie). Spearing knocks the attacker down too, win or lose. Then the
 * penalty check.
 */
function applyAttack(s: GameState, contest: Contest, attackerWins: boolean, ev: GameEvent[]): void {
  const def = defOf(s, contest.physical!) as PhysicalCardDef;
  const { attacker, defender } = contest;
  const effect = def.ability?.effect;
  let worst: HurtResult = null;
  if (attackerWins) {
    if (effect === 'only_shaken') worst = shake(s, defender.side, defender.pos, 'attack', def.name, ev);
    else if (def.toughness !== null) {
      worst = knockDown(s, defender.side, defender.pos, def.name, ev, {
        source: 'attack',
        toughness: def.toughness + enduranceBonus(s, defender),
        severity: def.severity ?? 0,
        shakenAnyway: effect === 'shaken_anyway',
        shakenIsInjured: effect === 'shaken_is_injured',
      });
    }
  }
  if (effect === 'self_check') knockDown(s, attacker.side, attacker.pos, def.name, ev, { source: 'attack' });
  penaltyCheck(s, contest, def, worst, ev);
}

/**
 * The penalty check: if the attacker's final die is at or under the penalty risk level (1 at
 * first), they roll the penalty die (never rerolled). At or under the level again and the referee
 * calls a penalty: the attacker goes to the penalty box.
 */
function penaltyCheck(s: GameState, contest: Contest, def: PhysicalCardDef, worst: HurtResult, ev: GameEvent[]): void {
  const a = contest.attacker;
  const team = s.teams[a.side];
  // Escalating penalties: the level is 1 plus the team's recent attacks; this attack then adds one.
  const level = s.config.penaltyEscalation ? Math.min(1 + team.attackHeat, s.config.contactDie) : 1;
  if (s.config.penaltyEscalation) {
    team.attackHeat = Math.min(team.attackHeat + 1, s.config.contactDie - 1);
    team.attackedSinceTurn = true;
  }
  if (!a.roll || a.roll > level || !isFieldPos(a.pos) || !slotAt(s, a.side, a.pos)) return;
  const roll = penaltyRoll(s);
  const called = roll <= level;
  ev.push({ type: 'penaltyCheck', side: a.side, pos: a.pos, roll, called, level, attackerRoll: a.roll });
  if (!called) return;
  const byResult = s.config.penaltyTurnsByResult;
  const turns = s.config.penaltyLength === 'card'
    ? s.config.penaltyTurns[def.tier]
    : worst === 'injured' ? byResult.injured : worst === 'knockedOut' || worst === 'carriedOff' ? byResult.out : byResult.none;
  penalize(s, a.side, a.pos, turns, ev);
}

/**
 * Physical reaction cards: Late Hit after the opposing player in your spot passes or shoots, and
 * Elbow when your player loses a contest to the opposing player in their spot. Offered only if
 * that side holds such a card, hasn't played a reaction spell in the contest, and its player can
 * act. Not after an attack (no chains), and not while a forced substitution is waiting.
 */
function offerPhysicalReaction(s: GameState, contest: Contest, attackerWins: boolean): boolean {
  if (!s.config.physicalAttacks || s.forcedSub || contest.kind === 'attack') return false;
  if (contest.kind === 'pass' || contest.kind === 'shot') {
    const from = contest.kind === 'pass' ? contest.passer : contest.attacker.pos;
    const side = otherSide(contest.attacker.side);
    if (from && isFieldPos(from) && offer(s, contest, side, 'after_pass_or_shot', opposite(from), from)) return true;
  }
  if (contest.kind === 'pass' || contest.kind === 'tackle' || contest.kind === 'faceoff' || contest.kind === 'hit') {
    const winner = attackerWins ? contest.attacker : contest.defender;
    const loser = attackerWins ? contest.defender : contest.attacker;
    if (isFieldPos(loser.pos) && isFieldPos(winner.pos) && samePos(opposite(loser.pos), winner.pos)) {
      if (offer(s, contest, loser.side, 'after_losing', loser.pos, winner.pos)) return true;
    }
  }
  return false;
}

function offer(s: GameState, contest: Contest, side: Side, trigger: PhysicalTrigger, attacker: FieldPos, target: FieldPos): boolean {
  const inContest = contest.attacker.side === side ? contest.attacker : contest.defender;
  if (inContest.spell) return false; // that side's reaction is used up
  const slot = slotAt(s, side, attacker);
  if (!slot || slot.cameOn || slot.shakenUntil !== undefined || !slotAt(s, otherSide(side), target)) return false;
  if (!s.config.attackWithBall && s.ball?.side === side && samePos(s.ball.pos, attacker)) return false;
  const hasCard = s.teams[side].hand.some((uid) => {
    const def = defOf(s, uid);
    return def.kind === 'physical' && def.ability?.effect === trigger;
  });
  if (!hasCard) return false;
  s.pending = { kind: 'physicalReaction', side, trigger, attacker, target };
  return true;
}

/** A side plays a physical reaction card (or null for none). */
export function playPhysicalReaction(s: GameState, card: Uid | null, ev: GameEvent[]): void {
  if (s.pending.kind !== 'physicalReaction') throw new Error('No physical reaction is waiting');
  const { side, attacker, target } = s.pending;
  if (card === null) continueGame(s, ev);
  else startAttack(s, side, card, attacker, target, ev);
}
