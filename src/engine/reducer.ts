// applyAction: the one way to change a game. Takes a state and an action and returns a new
// state plus the events that happened. The caller's state is never changed.

import type { Action } from './actions';
import { adjustAmount, adjustPenalty, affinityFor, spellFizzles } from './affinity';
import {
  cardView, defOf, discardFromHand, drawCards, moveHandToDiscard, playerAt, reveal, setSlotAt, slotAt, takeFromHand,
} from './board';
import type { ActionSpellDef } from './cards';
import { playReaction, startContest } from './contest';
import type { GameEvent } from './events';
import { AREAS, GOAL, opposite, otherSide, type FieldPos, type Side } from './field';
import { continueGame } from './flow';
import { shuffle } from './rng';
import type { ContestSide, GameState, Modifier } from './state';
import { validateAction } from './validate';

export class IllegalActionError extends Error {}

export function applyAction(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const reason = validateAction(state, action);
  if (reason) throw new IllegalActionError(reason);

  const s = structuredClone(state);
  const ev: GameEvent[] = [];
  const side = action.side;
  if (state.pending.kind === 'action') s.actionsLeft -= 1;

  switch (action.type) {
    case 'chooseGoalie': chooseGoalie(s, side, action.card, ev); break;
    case 'place': place(s, side, action.card, action.pos, ev); break;
    case 'faceoffLane': faceoff(s, side, action.lane, ev); break;
    case 'pass': pass(s, side, action.to, ev); break;
    case 'shoot': shoot(s, side, [], ev); break;
    case 'tackle': tackle(s, side, [], ev); break;
    case 'cast': cast(s, action, ev); break;
    case 'substitute': substitute(s, action, ev); break;
    case 'regroup': regroup(s, side, action.discard, ev); break;
    case 'react': playReaction(s, action.card, ev); break;
    case 'discard':
      discardFromHand(s, side, [action.card], ev);
      continueGame(s, ev);
      break;
  }
  return { state: s, events: ev };
}

// ---- Setup ----

function chooseGoalie(s: GameState, side: Side, card: string, ev: GameEvent[]): void {
  const team = s.teams[side];
  takeFromHand(s, side, card);
  team.goalie = { uid: card, revealed: false, scried: false };
  ev.push({ type: 'goalieChosen', side, secret: { card: cardView(s, card) } });

  // The other goalie is shuffled into the deck.
  team.deck.push(...team.hand);
  team.hand = [];
  [team.deck, s.rng] = shuffle(team.deck, s.rng);

  // Draw enough to fill every spot plus a few extra. If that isn't enough field players,
  // keep drawing one card at a time until it is.
  const spots = 3 * s.config.lanes;
  const fieldPlayersInTop = (n: number) => team.deck.slice(-n).filter((uid) => defOf(s, uid).kind === 'field').length;
  let count = Math.min(spots + s.config.setupExtraCards, team.deck.length);
  while (fieldPlayersInTop(count) < spots && count < team.deck.length) count++;
  drawCards(s, side, count, 'setup', ev);

  s.pending = side === 'A' ? { kind: 'chooseGoalie', side: 'B' } : { kind: 'placeLineup', side: 'A' };
}

function place(s: GameState, side: Side, card: string, pos: FieldPos, ev: GameEvent[]): void {
  takeFromHand(s, side, card);
  setSlotAt(s, side, pos, { uid: card, revealed: false, scried: false });
  ev.push({ type: 'placed', side, pos, secret: { card: cardView(s, card) } });

  const lineup = s.teams[side].lineup;
  const full = AREAS.every((area) => lineup[area].every((slot) => slot !== null));
  if (!full) return;
  if (side === 'A') s.pending = { kind: 'placeLineup', side: 'B' };
  else continueGame(s, ev); // the ball is loose, so this asks for the opening faceoff
}

// ---- Contests started by actions ----

function faceoff(s: GameState, chooser: Side, lane: number, ev: GameEvent[]): void {
  ev.push({ type: 'faceoffStarted', chooser, lane });
  const pos: FieldPos = { area: 'midfield', lane };
  startContest(s, {
    kind: 'faceoff',
    attacker: { side: chooser, pos, stat: 'faceoff', use: 'faceoff', spell: null, modifiers: [] },
    defender: { side: otherSide(chooser), pos, stat: 'faceoff', use: 'faceoff', spell: null, modifiers: [] },
    tiesGoTo: 'attacker',
  }, ev);
}

function pass(s: GameState, side: Side, to: FieldPos, ev: GameEvent[]): void {
  startContest(s, {
    kind: 'pass',
    attacker: { side, pos: to, stat: 'speed', use: 'receive', spell: null, modifiers: [] },
    defender: { side: otherSide(side), pos: opposite(to), stat: 'defense', use: 'intercept', spell: null, modifiers: [] },
    tiesGoTo: s.config.passTiesGoTo,
  }, ev);
}

function shoot(s: GameState, side: Side, modifiers: Modifier[], ev: GameEvent[]): void {
  startContest(s, {
    kind: 'shot',
    attacker: { side, pos: s.ball!.pos, stat: 'shot', use: 'shoot', spell: null, modifiers },
    defender: { side: otherSide(side), pos: GOAL, stat: 'save', use: 'save', spell: null, modifiers: [] },
    tiesGoTo: 'defender',
  }, ev);
}

function tackle(s: GameState, side: Side, modifiers: Modifier[], ev: GameEvent[]): void {
  const holderPos = s.ball!.pos as FieldPos;
  const attacker: ContestSide = { side, pos: opposite(holderPos), stat: 'defense', use: 'tackle', spell: null, modifiers };
  const defender: ContestSide = { side: otherSide(side), pos: holderPos, stat: 'speed', use: 'evade', spell: null, modifiers: [] };
  startContest(s, { kind: 'tackle', attacker, defender, tiesGoTo: 'defender' }, ev);
}

// ---- Other actions ----

function cast(s: GameState, action: Extract<Action, { type: 'cast' }>, ev: GameEvent[]): void {
  const { side, card, caster, target } = action;
  const spell = defOf(s, card) as ActionSpellDef;
  moveHandToDiscard(s, side, card);
  reveal(s, side, caster, ev);
  const affinity = affinityFor(playerAt(s, side, caster), spell.element, s.opposedPairs);
  const fizzled = spellFizzles(spell, affinity);
  ev.push({ type: 'spellCast', side, card: cardView(s, card), caster, affinity, fizzled });
  if (fizzled) {
    continueGame(s, ev);
    return;
  }

  const ability = spell.ability;
  switch (ability.effect) {
    case 'scry': {
      if (target.kind !== 'opponent') break;
      const slot = slotAt(s, otherSide(side), target.pos)!;
      slot.scried = true;
      ev.push({ type: 'scried', side, target: target.pos, secret: { card: cardView(s, slot.uid) } });
      continueGame(s, ev);
      return;
    }
    case 'swap': {
      if (target.kind !== 'swap') break;
      // The ball is tracked by spot, so it stays in its slot with the new player.
      const a = slotAt(s, side, target.a);
      const b = slotAt(s, side, target.b);
      setSlotAt(s, side, target.a, b);
      setSlotAt(s, side, target.b, a);
      ev.push({ type: 'swapped', side, a: target.a, b: target.b });
      continueGame(s, ev);
      return;
    }
    case 'long_pass':
      if (target.kind !== 'pass') break;
      pass(s, side, target.to, ev);
      return;
    case 'long_shot': {
      const penalty = adjustPenalty(ability.params.penalty, affinity, s.config);
      shoot(s, side, penalty > 0 ? [{ label: spell.name, amount: -penalty }] : [], ev);
      return;
    }
    case 'steal': {
      const amount = adjustAmount(ability.params.amount, affinity, s.config);
      tackle(s, side, amount > 0 ? [{ label: spell.name, amount }] : [], ev);
      return;
    }
    case 'recall':
      drawCards(s, side, adjustAmount(ability.params.count, affinity, s.config), 'recall', ev);
      continueGame(s, ev);
      return;
  }
  throw new Error(`Spell ${spell.id} has a target that doesn't fit its effect`);
}

function substitute(s: GameState, action: Extract<Action, { type: 'substitute' }>, ev: GameEvent[]): void {
  const { side, pos, card } = action;
  const old = slotAt(s, side, pos)!;
  takeFromHand(s, side, card);
  s.teams[side].discard.push(old.uid);
  // The substitute comes in face down. If the old player held the ball, the substitute does.
  setSlotAt(s, side, pos, { uid: card, revealed: false, scried: false });
  ev.push({ type: 'substituted', side, pos, removed: cardView(s, old.uid) });
  continueGame(s, ev);
}

function regroup(s: GameState, side: Side, discard: string[], ev: GameEvent[]): void {
  discardFromHand(s, side, discard, ev);
  drawCards(s, side, discard.length, 'regroup', ev);
  continueGame(s, ev);
}
