// Contests (RULES.md "Contests"):
// 1. Reveal both players.
// 2. The attacker may play one reaction spell, cast by its player in the contest. Then the
//    defender, having seen it, may do the same. (In a faceoff, the chooser goes first.)
// 3. Apply abilities and spells.
// 4. The attacker wins only with a higher value. Ties go to the defender, except at faceoffs,
//    where they go to the chooser.

import { adjustAmount, affinityFor, spellFizzles } from './affinity';
import { cardView, defOf, drawCards, hasReactionSpell, isReactionSpell, moveHandToDiscard, playerAt, reveal, slotAt, statOf } from './board';
import type { PlayerCardDef, SpellCardDef } from './cards';
import type { Breakdown, BreakdownPart, GameEvent } from './events';
import { GOAL, type Side } from './field';
import { continueGame, scoreGoal } from './flow';
import type { Contest, ContestRole, ContestSide, GameState, Uid } from './state';

function otherRole(role: ContestRole): ContestRole {
  return role === 'attacker' ? 'defender' : 'attacker';
}

export function startContest(s: GameState, contest: Contest, ev: GameEvent[]): void {
  reveal(s, contest.attacker.side, contest.attacker.pos, ev);
  reveal(s, contest.defender.side, contest.defender.pos, ev);
  ev.push({
    type: 'contestStarted',
    kind: contest.kind,
    attacker: { side: contest.attacker.side, pos: contest.attacker.pos },
    defender: { side: contest.defender.side, pos: contest.defender.pos },
  });
  askForReaction(s, contest, 'attacker', ev);
}

/** Waits for a side's reaction spell, or moves on if they have none to play. */
function askForReaction(s: GameState, contest: Contest, role: ContestRole, ev: GameEvent[]): void {
  const side = contest[role].side;
  if (hasReactionSpell(s, side)) {
    s.pending = { kind: 'reaction', side, role, contest };
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
    ev.push({ type: 'spellCast', side: me.side, card: cardView(s, card), caster: me.pos, affinity, fizzled });
  }
  afterReaction(s, contest, role, ev);
}

function bonusApplies(def: PlayerCardDef, me: ContestSide): number {
  const ability = def.ability;
  if (ability?.effect !== 'bonus') return 0;
  const { stat, amount, when, row } = ability.params;
  if (stat !== me.stat) return 0;
  if (when !== undefined && when !== me.use) return 0;
  if (row !== undefined && row !== me.pos.area) return 0;
  return amount;
}

function isActiveShield(s: GameState, side: ContestSide): boolean {
  if (!side.spell || side.spell.fizzled) return false;
  const spell = defOf(s, side.spell.uid);
  return isReactionSpell(spell) && spell.ability.effect === 'shield';
}

/** Works out one side's value in a contest, with a breakdown for plain-language explanations. */
export function contestValue(s: GameState, contest: Contest, role: ContestRole): Breakdown {
  const me = contest[role];
  const them = contest[otherRole(role)];
  const slot = slotAt(s, me.side, me.pos)!;
  const def = playerAt(s, me.side, me.pos);
  // Shield: this player's stat counts as 0 and their abilities are ignored. Spells still count.
  const shielded = isActiveShield(s, them);
  const base = shielded ? 0 : statOf(def, me.stat);
  const parts: BreakdownPart[] = [];

  const bonus = shielded ? 0 : bonusApplies(def, me);
  if (bonus !== 0) parts.push({ label: 'Ability', amount: bonus });

  if (me.spell && !me.spell.fizzled) {
    const spell = defOf(s, me.spell.uid);
    if (isReactionSpell(spell) && spell.ability.effect === 'boost') {
      parts.push({ label: spell.name, amount: adjustAmount(spell.ability.params.amount, me.spell.affinity, s.config) });
    }
  }
  parts.push(...me.modifiers);

  const total = Math.max(0, base + parts.reduce((sum, p) => sum + p.amount, 0));
  return { side: me.side, pos: me.pos, card: cardView(s, slot.uid), stat: me.stat, base, parts, total, shielded };
}

function resolveContest(s: GameState, contest: Contest, ev: GameEvent[]): void {
  const attacker = contestValue(s, contest, 'attacker');
  const defender = contestValue(s, contest, 'defender');
  const attackerWins =
    attacker.total > defender.total || (attacker.total === defender.total && contest.tiesGoTo === 'attacker');
  const winnerRole: ContestRole = attackerWins ? 'attacker' : 'defender';
  const winner = contest[winnerRole];
  ev.push({ type: 'contestResolved', kind: contest.kind, attacker, defender, winner: winner.side, winnerRole });

  // draw_on_win: ignored if the winner was shielded.
  const winnerDef = playerAt(s, winner.side, winner.pos);
  const winnerShielded = attackerWins ? attacker.shielded : defender.shielded;
  if (winnerDef.ability?.effect === 'draw_on_win' && !winnerShielded) {
    drawCards(s, winner.side, winnerDef.ability.params.count, 'ability', ev);
  }

  applyOutcome(s, contest, attackerWins, ev);
  continueGame(s, ev);
}

function giveBall(s: GameState, side: Side, pos: ContestSide['pos'], ev: GameEvent[]): void {
  s.ball = { side, pos };
  ev.push({ type: 'ballMoved', side, pos });
}

function applyOutcome(s: GameState, contest: Contest, attackerWins: boolean, ev: GameEvent[]): void {
  const { attacker, defender } = contest;
  switch (contest.kind) {
    case 'faceoff':
    case 'pass': {
      // The winner's player in the contest takes the ball (a lost pass is an interception).
      const winner = attackerWins ? attacker : defender;
      giveBall(s, winner.side, winner.pos, ev);
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
  }
}
