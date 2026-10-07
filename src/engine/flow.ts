// Turn flow, goals, the end of the game, and the penalty shootout.

import { cardsLeft, discardTopOfPile, drawCards, handIsFull } from './board';
import type { GameEvent } from './events';
import { otherSide, type Side } from './field';
import type { EndReason, GameState } from './state';

/**
 * Called whenever an action (and any contest it caused) has finished. Works out what the
 * game needs next: a shootout penalty, a faceoff, another action, the discard step, or the
 * next player's turn.
 */
export function continueGame(s: GameState, ev: GameEvent[]): void {
  if (s.result) {
    s.pending = { kind: 'gameOver' };
    return;
  }
  // An injured (or carried-off) player's owner brings on a substitute before anything else.
  if (s.forcedSub) {
    s.pending = { kind: 'forcedSub', side: s.forcedSub.side, pos: s.forcedSub.pos };
    return;
  }
  if (s.shootout) {
    nextPenalty(s, ev);
    return;
  }
  // After a goal (or at the start), the ball goes to a faceoff before anything else.
  if (s.ball === null) {
    s.pending = { kind: 'faceoffLane', side: s.faceoffChooser };
    return;
  }
  // The opening faceoff is done: the first player takes turn 1.
  if (s.turn === 0) {
    startTurn(s, s.firstSide, ev);
    return;
  }
  // The player has actions left this turn.
  if (s.actionsLeft > 0) {
    s.pending = { kind: 'action', side: s.activeSide };
    return;
  }
  // Discard step.
  const extra = s.teams[s.activeSide].hand.length - s.config.handLimit;
  if (extra > 0) {
    s.pending = { kind: 'discard', side: s.activeSide, count: extra };
    return;
  }
  endTurn(s, ev);
}

function startTurn(s: GameState, side: Side, ev: GameEvent[]): void {
  s.turn += 1;
  s.activeSide = side;
  if (s.ball?.side === side) s.ballProtected = false;
  ev.push({ type: 'turnStarted', side, turn: s.turn });

  // Draw step. The decks are the game clock. With cards in both piles, the player chooses.
  s.actionsLeft = s.config.actionsPerTurn;
  const team = s.teams[side];
  if (team.players.length > 0 && team.spells.length > 0) {
    s.pending = { kind: 'draw', side };
    return;
  }
  if (cardsLeft(team) > 0) {
    const pile = team.players.length > 0 ? 'players' : 'spells';
    if (handIsFull(s, side)) discardTopOfPile(s, side, pile, ev);
    else drawCards(s, side, 1, 'turn', ev, pile);
  } else if (s.endgame.finalTurnFor === null) {
    // This player skips the draw but still takes this turn; then the opponent takes the last turn.
    s.endgame.finalTurnFor = otherSide(side);
    ev.push({ type: 'deckOut', side, finalTurnFor: otherSide(side) });
  }
  // (If the final turn is already set, this player just skips the draw.)

  s.pending = { kind: 'action', side };
}

function endTurn(s: GameState, ev: GameEvent[]): void {
  const finished = s.activeSide;

  if (s.endgame.finalTurnFor === finished) {
    // Full time: the last turn after a deck ran out is over.
    const other = otherSide(finished);
    if (s.score[finished] !== s.score[other]) {
      endGame(s, s.score[finished] > s.score[other] ? finished : other, 'time', ev);
    } else {
      startShootout(s, other, ev);
    }
    return;
  }

  if (s.turn >= s.config.maxTurns) {
    endGame(s, null, 'turn_cap', ev);
    return;
  }
  startTurn(s, otherSide(finished), ev);
}

export function scoreGoal(s: GameState, side: Side, ev: GameEvent[]): void {
  s.score[side] += 1;
  s.actionsLeft = 0; // a goal ends the scoring player's turn
  ev.push({ type: 'goal', side, score: { ...s.score } });
  if (s.score[side] >= s.config.goalsToWin) {
    endGame(s, side, 'goals', ev);
  } else {
    // Players stay where they are; the team that was scored on chooses the faceoff lane.
    s.ball = null;
    s.ballProtected = false;
    s.faceoffChooser = otherSide(side);
  }
}

// ---- Penalty shootout ----

/** Tied at full time: teams alternate penalty shots. `first` is the team that didn't take the last turn. */
function startShootout(s: GameState, first: Side, ev: GameEvent[]): void {
  s.ball = null;
  s.ballProtected = false;
  s.shootout = { first, taken: { A: 0, B: 0 }, goals: { A: 0, B: 0 }, shooters: [] };
  ev.push({ type: 'shootoutStarted', first });
  nextPenalty(s, ev);
}

/** Records a penalty's result. */
export function recordPenalty(s: GameState, side: Side, scored: boolean, ev: GameEvent[]): void {
  const so = s.shootout!;
  so.taken[side] += 1;
  if (scored) so.goals[side] += 1;
  ev.push({ type: 'penalty', side, scored, goals: { ...so.goals }, taken: { ...so.taken } });
}

/** The shootout winner so far, if it is already decided. */
function shootoutWinner(s: GameState): Side | null {
  const { taken, goals } = s.shootout!;
  const rounds = s.config.shootoutRounds;
  if (taken.A < rounds || taken.B < rounds) {
    // Within the first rounds: stop as soon as one team can't catch up.
    const leftA = Math.max(0, rounds - taken.A);
    const leftB = Math.max(0, rounds - taken.B);
    if (goals.A > goals.B + leftB) return 'A';
    if (goals.B > goals.A + leftA) return 'B';
    return null;
  }
  // Extra rounds, one shot each: decided when both have shot and the goals differ.
  if (taken.A === taken.B && goals.A !== goals.B) return goals.A > goals.B ? 'A' : 'B';
  return null;
}

/** Whether a side still has a field player who hasn't taken a penalty. */
function hasPenaltyTaker(s: GameState, side: Side): boolean {
  const used = new Set(s.shootout?.shooters ?? []);
  return Object.values(s.teams[side].lineup).flat().some((slot) => slot !== null && !used.has(slot.uid));
}

function nextPenalty(s: GameState, ev: GameEvent[]): void {
  const so = s.shootout!;
  const winner = shootoutWinner(s);
  if (winner) {
    endGame(s, winner, 'shootout', ev);
    return;
  }
  // Teams alternate, the first team going whenever the counts are level.
  const second = otherSide(so.first);
  const side = so.taken[so.first] <= so.taken[second] ? so.first : second;
  if (!hasPenaltyTaker(s, side)) {
    endGame(s, null, 'draw', ev);
    return;
  }
  s.pending = { kind: 'shootoutPick', side };
}

function endGame(s: GameState, winner: Side | null, reason: EndReason, ev: GameEvent[]): void {
  s.result = { winner, reason };
  s.pending = { kind: 'gameOver' };
  ev.push({ type: 'gameOver', result: s.result });
}
