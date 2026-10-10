// Lists every legal action for a side. Candidates are generated broadly and then filtered by
// validateAction, so this can never disagree with what applyAction accepts.
//
// Only a side's own hand and public information are used to build the list, so it is safe to
// hand to a player alongside viewFor().

import type { Action, SpellTarget } from './actions';
import { defOf, isActionSpell, isReactionSpell, playerPositions, slotAt } from './board';
import { allFieldPositions, isFieldPos, otherSide, passTargets, type Side } from './field';
import type { GameState, Uid } from './state';
import { validateAction } from './validate';

/** Every way to pick 0 to `max` items from a list. */
function subsets<T>(items: T[], max: number): T[][] {
  const result: T[][] = [[]];
  const build = (start: number, current: T[]) => {
    for (let i = start; i < items.length; i++) {
      const next = [...current, items[i]!];
      result.push(next);
      if (next.length < max) build(i + 1, next);
    }
  };
  if (max > 0) build(0, []);
  return result;
}

function spellTargets(s: GameState, side: Side, effect: string): SpellTarget[] {
  const lanes = s.config.lanes;
  switch (effect) {
    case 'scry':
      return playerPositions(s)
        .filter((pos) => !slotAt(s, otherSide(side), pos)?.revealed)
        .map((pos) => ({ kind: 'opponent', pos }));
    case 'swap': {
      const faceDown = allFieldPositions(lanes).filter((pos) => !slotAt(s, side, pos)?.revealed);
      const pairs: SpellTarget[] = [];
      for (let i = 0; i < faceDown.length; i++) {
        for (let j = i + 1; j < faceDown.length; j++) pairs.push({ kind: 'swap', a: faceDown[i]!, b: faceDown[j]! });
      }
      return pairs;
    }
    case 'long_pass':
      if (!s.ball || s.ball.side !== side) return [];
      return passTargets(s.ball.pos, lanes, true).map((to) => ({ kind: 'pass', to }));
    case 'decoy_pass': {
      if (!s.ball || s.ball.side !== side) return [];
      const targets: SpellTarget[] = [];
      for (const to of passTargets(s.ball.pos, lanes)) {
        for (let decoyLane = 0; decoyLane < lanes; decoyLane++) {
          if (decoyLane !== to.lane) targets.push({ kind: 'decoyPass', to, decoyLane });
        }
      }
      return targets;
    }
    case 'hit':
      return [{ kind: 'hit' }];
    case 'mend':
      return [
        ...playerPositions(s).map((pos): SpellTarget => ({ kind: 'mendField', pos })),
        ...s.teams[side].hand.map((card): SpellTarget => ({ kind: 'mendHand', card })),
      ];
    default:
      return [{ kind: 'none' }];
  }
}

export function legalActions(s: GameState, side: Side): Action[] {
  const p = s.pending;
  if (p.kind === 'gameOver' || p.side !== side) return [];
  const hand = s.teams[side].hand;
  const candidates: Action[] = [];

  switch (p.kind) {
    case 'draftPick':
      for (const card of s.draft?.pool ?? []) candidates.push({ type: 'draftPick', side, card });
      break;

    case 'chooseGoalie':
      for (const card of hand) candidates.push({ type: 'chooseGoalie', side, card });
      break;

    case 'placeLineup':
      for (const card of hand) {
        if (defOf(s, card).kind !== 'field') continue;
        for (const pos of allFieldPositions(s.config.lanes)) candidates.push({ type: 'place', side, card, pos });
      }
      break;

    case 'faceoffLane':
      for (let lane = 0; lane < s.config.lanes; lane++) candidates.push({ type: 'faceoffLane', side, lane });
      break;

    case 'callDice':
      candidates.push({ type: 'callDice', side, roll: false }, { type: 'callDice', side, roll: true });
      break;

    case 'reaction':
      candidates.push({ type: 'react', side, card: null });
      for (const card of hand) if (isReactionSpell(defOf(s, card))) candidates.push({ type: 'react', side, card });
      break;

    case 'discard':
      for (const card of hand) candidates.push({ type: 'discard', side, card });
      break;

    case 'draw':
      candidates.push({ type: 'draw', side, pile: 'players' }, { type: 'draw', side, pile: 'spells' });
      if (s.config.substituteStep === 'draw') candidates.push(...substitutions(s, side, hand));
      break;

    case 'forcedSub':
      for (const card of hand) candidates.push({ type: 'forcedSub', side, card });
      break;

    case 'shootoutPick':
      for (const pos of allFieldPositions(s.config.lanes)) candidates.push({ type: 'shootoutPick', side, pos });
      break;

    case 'action': {
      if (s.ball && s.ball.side === side) {
        for (const to of passTargets(s.ball.pos, s.config.lanes)) candidates.push({ type: 'pass', side, to });
      }
      candidates.push({ type: 'shoot', side }, { type: 'tackle', side });

      for (const card of hand) {
        const def = defOf(s, card);
        if (isActionSpell(def)) {
          const targets = spellTargets(s, side, def.ability.effect);
          for (const caster of playerPositions(s)) {
            for (const target of targets) candidates.push({ type: 'cast', side, card, caster, target });
          }
        }
      }
      if (s.config.substituteStep === 'action') candidates.push(...substitutions(s, side, hand));

      for (const discard of subsets(hand, s.config.regroupMax)) candidates.push({ type: 'regroup', side, discard });
      break;
    }
  }

  return candidates.filter((action) => validateAction(s, action) === null);
}

/** Every substitution: each player in hand into each spot of the same kind (filled or empty). */
function substitutions(s: GameState, side: Side, hand: Uid[]): Action[] {
  const result: Action[] = [];
  for (const card of hand) {
    const kind = defOf(s, card).kind;
    if (kind === 'spell') continue;
    for (const pos of playerPositions(s)) {
      if (kind === 'goalie' ? !isFieldPos(pos) : isFieldPos(pos)) result.push({ type: 'substitute', side, pos, card });
    }
  }
  return result;
}
