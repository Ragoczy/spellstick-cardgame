// Contests (RULES.md "Contests"):
// 1. Reveal both players.
// 2. The attacker may play one reaction spell, cast by its player in the contest. Then the
//    defender, having seen it, may do the same. (In a faceoff, the chooser goes first.)
// 3. Apply abilities, injuries, and spells.
// 4. The attacker wins only with a higher value. Ties go to the defender, except in passes
//    (the receiver) and faceoffs (the chooser).
// 5. Then injuries: a hit that lands, and a dirty play by the winning side.
//
// An empty spot (a player carried off) counts as 0 and can't play reaction spells. Nor can a
// player who has used up their casting limit.

import { affinityFor, spellFizzles } from './affinity';
import { cardView, castsLeft, countCast, defOf, drawCards, hasReactionSpell, injuryOf, isReactionSpell, moveHandToDiscard, playerAt, reveal, slotAt } from './board';
import type { PlayerCardDef, SpellCardDef } from './cards';
import type { Breakdown, GameEvent } from './events';
import { GOAL, type Side } from './field';
import { continueGame, recordPenalty, scoreGoal } from './flow';
import { injurePlayer } from './injuries';
import { randomInt } from './rng';
import { scoreSide } from './score';
import type { Contest, ContestRole, ContestSide, GameState, Uid } from './state';

function otherRole(role: ContestRole): ContestRole {
  return role === 'attacker' ? 'defender' : 'attacker';
}

export function startContest(s: GameState, contest: Contest, ev: GameEvent[]): void {
  reveal(s, contest.attacker.side, contest.attacker.pos, ev);
  reveal(s, contest.defender.side, contest.defender.pos, ev);
  // Shots and penalties are always rolled (RULES.md "Shoot"); the experimental contestDie rolls in every contest.
  const isShot = contest.kind === 'shot' || contest.kind === 'penalty';
  const die = s.config.contestDie || (isShot ? s.config.shotDie : 0);
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

// ---- Calling for dice (RULES.md "Dice") ----

/** Asks a side whether to spend a roll, if it can; otherwise moves on. */
function askForDice(s: GameState, contest: Contest, role: ContestRole, ev: GameEvent[]): void {
  const me = contest[role];
  const alreadyRolled = s.config.diceMode === 'both' ? !!(contest.attacker.roll || contest.defender.roll) : !!me.roll;
  if (s.config.diceBudget > 0 && s.diceLeft[me.side] > 0 && slotAt(s, me.side, me.pos) && !alreadyRolled) {
    s.pending = { kind: 'callDice', side: me.side, role, contest };
    return;
  }
  afterDice(s, contest, role, ev);
}

function afterDice(s: GameState, contest: Contest, role: ContestRole, ev: GameEvent[]): void {
  if (role === 'attacker') askForDice(s, contest, 'defender', ev);
  else askForReaction(s, contest, 'attacker', ev);
}

/** A side decides whether to spend a roll. In 'both' mode both players roll; only the caller pays. */
export function callDice(s: GameState, roll: boolean, ev: GameEvent[]): void {
  if (s.pending.kind !== 'callDice') throw new Error('No contest is waiting for dice');
  const { contest, role } = s.pending;
  const me = contest[role];
  if (roll) {
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
  // A player who came on this turn can't cast yet.
  if (hasReactionSpell(s, me.side) && left > 0 && !slotAt(s, me.side, me.pos)?.cameOn) {
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
  const me = contest[role];
  if (card !== null) {
    const spell = defOf(s, card) as SpellCardDef;
    const caster = playerAt(s, me.side, me.pos);
    const affinity = affinityFor(caster, spell.element, s.opposedPairs);
    const fizzled = spellFizzles(spell, affinity);
    me.spell = { uid: card, affinity, fizzled };
    moveHandToDiscard(s, me.side, card);
    countCast(s, me.side, me.pos);
    ev.push({ type: 'spellCast', side: me.side, card: cardView(s, card), caster: me.pos, affinity, fizzled });
  }
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
  const score = scoreSide({ player, injury, side: me, spell, shielded: activeSpell(s, them, 'shield') }, s.config);
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
  const loser = contest[otherRole(winnerRole)];
  ev.push({ type: 'contestResolved', kind: contest.kind, attacker, defender, winner: winner.side, winnerRole });

  // draw_on_win: ignored if the winner was shielded.
  const winnerSlot = slotAt(s, winner.side, winner.pos);
  const winnerDef = winnerSlot ? (defOf(s, winnerSlot.uid) as PlayerCardDef) : null;
  const winnerShielded = attackerWins ? attacker.shielded : defender.shielded;
  if (winnerDef?.ability?.effect === 'draw_on_win' && !winnerShielded) {
    drawCards(s, winner.side, winnerDef.ability.params.count, 'ability', ev);
  }

  applyOutcome(s, contest, attackerWins, ev);

  // Injuries: a hit that lands injures its target; a dirty play by the winner injures the loser.
  if (!s.result) {
    if (contest.kind === 'hit' && attackerWins) {
      injurePlayer(s, contest.defender.side, contest.defender.pos, 'hit', contest.attacker.power?.label ?? 'Hit', ev);
    }
    if (activeSpell(s, winner, 'dirty_play')) {
      injurePlayer(s, loser.side, loser.pos, 'dirty_play', defOf(s, winner.spell!.uid).name, ev);
    }
  }
  continueGame(s, ev);
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
  }
}
