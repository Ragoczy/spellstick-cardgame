// Turn flow, goals, and the end of the game.

import { drawCards } from './board';
import type { GameEvent } from './events';
import { otherSide, SIDES, type Side } from './field';
import { shuffle } from './rng';
import type { EndReason, GameState } from './state';

/**
 * Called whenever an action (and any contest it caused) has finished. Works out what the
 * game needs next: a faceoff, the discard step, or the next player's turn.
 */
export function continueGame(s: GameState, ev: GameEvent[]): void {
  if (s.result) {
    s.pending = { kind: 'gameOver' };
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
  ev.push({ type: 'turnStarted', side, turn: s.turn });

  // Draw step.
  if (s.teams[side].deck.length > 0) {
    drawCards(s, side, 1, 'turn', ev);
  } else if (s.endgame.suddenDeath) {
    // A deck ran out again during sudden death: the game is a draw.
    endGame(s, null, 'draw', ev);
    return;
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
    // The last turn after a deck ran out is over.
    const other = otherSide(finished);
    if (s.score[finished] !== s.score[other]) {
      endGame(s, s.score[finished] > s.score[other] ? finished : other, 'deck_out', ev);
      return;
    }
    startSuddenDeath(s, ev);
  }

  if (s.turn >= s.config.maxTurns) {
    endGame(s, null, 'turn_cap', ev);
    return;
  }
  startTurn(s, otherSide(finished), ev);
}

/** Each player shuffles their discard pile and any remaining deck into a new deck. */
function startSuddenDeath(s: GameState, ev: GameEvent[]): void {
  s.endgame.suddenDeath = true;
  s.endgame.finalTurnFor = null;
  for (const side of SIDES) {
    const team = s.teams[side];
    [team.deck, s.rng] = shuffle([...team.deck, ...team.discard], s.rng);
    team.discard = [];
  }
  ev.push({ type: 'suddenDeath' });
}

export function scoreGoal(s: GameState, side: Side, ev: GameEvent[]): void {
  s.score[side] += 1;
  ev.push({ type: 'goal', side, score: { ...s.score } });
  if (s.endgame.suddenDeath) {
    endGame(s, side, 'sudden_death', ev);
  } else if (s.score[side] >= s.config.goalsToWin) {
    endGame(s, side, 'goals', ev);
  } else {
    // Players stay where they are; the team that was scored on chooses the faceoff lane.
    s.ball = null;
    s.faceoffChooser = otherSide(side);
  }
}

function endGame(s: GameState, winner: Side | null, reason: EndReason, ev: GameEvent[]): void {
  s.result = { winner, reason };
  s.pending = { kind: 'gameOver' };
  ev.push({ type: 'gameOver', result: s.result });
}
