// applyAction: the one way to change a game. Takes a state and an action and returns a new
// state plus the events that happened. The caller's state is never changed.

import type { Action } from './actions';
import { adjustAmount, adjustPenalty, affinityFor, spellFizzles } from './affinity';
import {
  cardView, countCast, defOf, discardFromHand, discardTopOfPile, drawCards, handIsFull, moveHandToDiscard, pileFor, playerAt, reveal, setSlotAt, slotAt, takeFromHand,
} from './board';
import type { ActionSpellDef } from './cards';
import { callDice, playReaction, startContest } from './contest';
import type { GameEvent } from './events';
import { AREAS, GOAL, opposite, otherSide, type FieldPos, type Side } from './field';
import { continueGame } from './flow';
import { completeForcedSub, mend } from './injuries';
import { randomInt, shuffle } from './rng';
import { finishDraft } from './setup';
import type { ContestSide, GameState, Modifier, Pile } from './state';
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
    case 'draftPick': draftPick(s, side, action.card, ev); break;
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
    case 'callDice': callDice(s, action.roll, ev); break;
    case 'shootoutPick': penalty(s, side, action.pos, ev); break;
    case 'forcedSub':
      completeForcedSub(s, action.card, ev);
      continueGame(s, ev);
      break;
    case 'discard':
      discardFromHand(s, side, [action.card], ev);
      continueGame(s, ev);
      break;
    case 'draw':
      draw(s, side, action.pile, ev);
      break;
  }
  return { state: s, events: ev };
}

// ---- Setup ----

/** Draft (RULES.md "Draft"): take a player from the face-up pool. After the last pick, the decks are dealt. */
function draftPick(s: GameState, side: Side, card: string, ev: GameEvent[]): void {
  const d = s.draft!;
  d.pool = d.pool.filter((uid) => uid !== card);
  d.picks[side].push(card);
  ev.push({ type: 'drafted', side, card: cardView(s, card) });
  const made = d.picks.A.length + d.picks.B.length;
  if (made < d.order.length) {
    s.pending = { kind: 'draftPick', side: d.order[made]! };
    return;
  }
  finishDraft(s);
  ev.push({ type: 'draftFinished' });
}

function chooseGoalie(s: GameState, side: Side, card: string, ev: GameEvent[]): void {
  const team = s.teams[side];
  takeFromHand(s, side, card);
  team.goalie = { uid: card, revealed: false, scried: false };
  ev.push({ type: 'goalieChosen', side, secret: { card: cardView(s, card) } });

  // The other goalie is shuffled into the Players pile; both piles are shuffled.
  team.players.push(...team.hand);
  team.hand = [];
  [team.players, s.rng] = shuffle(team.players, s.rng);
  [team.spells, s.rng] = shuffle(team.spells, s.rng);

  // Draw a player for every spot plus a few extra, and a few spells. (At most one of the
  // players drawn can be the spare goalie, so there are always enough to fill every spot.)
  const spots = 3 * s.config.lanes;
  drawCards(s, side, spots + s.config.setupExtraPlayers, 'setup', ev, 'players');
  drawCards(s, side, s.config.setupSpells, 'setup', ev, 'spells');

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
  // The receiver gets a bonus in every pass (RULES.md "Pass").
  const modifiers: Modifier[] = s.config.passBonus ? [{ label: 'Pass', amount: s.config.passBonus }] : [];
  startContest(s, {
    kind: 'pass',
    attacker: { side, pos: to, stat: 'speed', use: 'receive', spell: null, modifiers },
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
  // The tackler is revealed by going for the holder, even if they only find an image.
  reveal(s, side, attacker.pos, ev);
  if (fooledByImages(s, defender.side, holderPos, 'tackle', ev)) {
    continueGame(s, ev);
    return;
  }
  startContest(s, { kind: 'tackle', attacker, defender, tiesGoTo: 'defender' }, ev);
}

/**
 * mirror_images: a tackle or hit on a player with images goes for an image (and misses) with a
 * chance of images in (images + 1). If it finds the real player, the images are gone.
 */
function fooledByImages(s: GameState, side: Side, pos: FieldPos, action: 'tackle' | 'hit', ev: GameEvent[]): boolean {
  const slot = slotAt(s, side, pos);
  if (!slot?.images) return false;
  let pick: number;
  [pick, s.rng] = randomInt(s.rng, s.config.mirrorImages + 1);
  const fooled = pick < s.config.mirrorImages;
  if (!fooled) delete slot.images;
  ev.push({ type: 'imagesTested', side, pos, action, fooled });
  return fooled;
}

/**
 * decoy_pass: the opponent thinks the ball went to `decoyLane` of the receiver's row. Their
 * player there is revealed, and the pass is caught without a contest, so the receiver stays
 * face down.
 */
function decoyPass(s: GameState, side: Side, to: FieldPos, decoyLane: number, ev: GameEvent[]): void {
  const decoy = opposite({ area: to.area, lane: decoyLane });
  ev.push({ type: 'decoyPass', side, to, decoy });
  reveal(s, otherSide(side), decoy, ev);
  s.ball = { side, pos: to };
  // Experimental: a caught pass can't be tackled until the catcher's team's next turn.
  const protect = s.config.protectCatch;
  s.ballProtected = protect === 'all' || (protect === 'forward' && to.area === 'forward');
  ev.push({ type: 'ballMoved', side, pos: to });
}

function penalty(s: GameState, side: Side, pos: FieldPos, ev: GameEvent[]): void {
  s.shootout!.shooters.push(slotAt(s, side, pos)!.uid);
  startContest(s, {
    kind: 'penalty',
    attacker: { side, pos, stat: 'shot', use: 'shoot', spell: null, modifiers: s.config.penaltyBonus ? [{ label: 'Penalty', amount: s.config.penaltyBonus }] : [] },
    defender: { side: otherSide(side), pos: GOAL, stat: 'save', use: 'save', spell: null, modifiers: [] },
    tiesGoTo: 'defender',
  }, ev);
}

// ---- Other actions ----

function cast(s: GameState, action: Extract<Action, { type: 'cast' }>, ev: GameEvent[]): void {
  const { side, card, caster, target } = action;
  const spell = defOf(s, card) as ActionSpellDef;
  moveHandToDiscard(s, side, card);
  reveal(s, side, caster, ev);
  countCast(s, side, caster);
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
    case 'decoy_pass':
      if (target.kind !== 'decoyPass') break;
      decoyPass(s, side, target.to, target.decoyLane, ev);
      continueGame(s, ev);
      return;
    case 'mirror_images':
      // The caster (just revealed by casting) gets the images. On the table the card stays by the
      // player as a reminder; here it goes to the discard pile straight away, which only changes
      // the order of the discard pile.
      slotAt(s, side, caster)!.images = true;
      ev.push({ type: 'imagesCast', side, pos: caster as FieldPos });
      continueGame(s, ev);
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
    case 'hit': {
      if (target.kind !== 'hit') break;
      // The caster attacks the opposing player in its own spot. Goalies can't be hit.
      const targetPos = opposite(caster as FieldPos);
      if (fooledByImages(s, otherSide(side), targetPos, 'hit', ev)) {
        continueGame(s, ev);
        return;
      }
      const strength = adjustAmount(ability.params.strength, affinity, s.config);
      startContest(s, {
        kind: 'hit',
        attacker: { side, pos: caster, stat: 'defense', use: 'resist', spell: null, modifiers: [], power: { label: spell.name, value: strength } },
        defender: { side: otherSide(side), pos: targetPos, stat: 'defense', use: 'resist', spell: null, modifiers: [] },
        tiesGoTo: 'defender',
      }, ev);
      return;
    }
    case 'mend': {
      if (target.kind === 'mendField') mend(s, side, slotAt(s, side, target.pos)!.uid, ev);
      else if (target.kind === 'mendHand') mend(s, side, target.card, ev);
      else break;
      continueGame(s, ev);
      return;
    }
  }
  throw new Error(`Spell ${spell.id} has a target that doesn't fit its effect`);
}

function substitute(s: GameState, action: Extract<Action, { type: 'substitute' }>, ev: GameEvent[]): void {
  const { side, pos, card } = action;
  const old = slotAt(s, side, pos);
  takeFromHand(s, side, card);
  // The substitute comes in face down. If the old player held the ball, the substitute does.
  // (The spot may be empty after a player was carried off.)
  // At the Draw step, the player coming on can't act until the turn ends.
  setSlotAt(s, side, pos, { uid: card, revealed: false, scried: false, ...(s.config.substituteStep === 'draw' ? { cameOn: true } : {}) });
  if (old) {
    // The old player goes to hand (injury and all), where they recharge their spells. Only a
    // player who was face up is public.
    s.teams[side].hand.push(old.uid);
    const removed = cardView(s, old.uid);
    ev.push(old.revealed
      ? { type: 'substituted', side, pos, removed }
      : { type: 'substituted', side, pos, removed: null, secret: { removed } });
  } else {
    ev.push({ type: 'forcedSub', side, pos, toHand: null });
  }
  continueGame(s, ev);
}

function regroup(s: GameState, side: Side, discard: string[], ev: GameEvent[]): void {
  // Each new card comes from the same pile as the card it replaces.
  const piles = discard.map((uid) => pileFor(defOf(s, uid)));
  discardFromHand(s, side, discard, ev);
  for (const pile of piles) drawCards(s, side, 1, 'regroup', ev, pile);
  continueGame(s, ev);
}

function draw(s: GameState, side: Side, pile: Pile, ev: GameEvent[]): void {
  if (handIsFull(s, side)) discardTopOfPile(s, side, pile, ev);
  else drawCards(s, side, 1, 'turn', ev, pile);
  s.pending = { kind: 'action', side };
}
