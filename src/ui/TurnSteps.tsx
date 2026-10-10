// The turn order (RULES.md "Turn sequence"), shown beside the board: which step the game is on,
// what's done, and what's left. It only reads the view's `pending` decision; it decides nothing.

import type { PlayerView } from '../engine';

export type StepId = 'draw' | 'act' | 'discard';

export type TurnPhase =
  /** Before turn 1: the opening faceoff. */
  | { kind: 'opening' }
  | { kind: 'turn'; mine: boolean; step: StepId; detail: string | null }
  | { kind: 'shootout' }
  | { kind: 'over' };

/** Works out where the game is in the turn order, from what it's waiting for. */
export function turnPhase(view: PlayerView): TurnPhase {
  const p = view.pending;
  if (p.kind === 'gameOver') return { kind: 'over' };
  if (view.shootout) return { kind: 'shootout' };
  if (view.turn === 0 || p.kind === 'chooseGoalie' || p.kind === 'placeLineup') return { kind: 'opening' };

  const mine = view.activeSide === view.me;
  const decider = p.side === view.me ? 'you' : 'the computer';
  switch (p.kind) {
    case 'draw':
      return { kind: 'turn', mine, step: 'draw', detail: null };
    case 'discard':
      return { kind: 'turn', mine, step: 'discard', detail: `${p.count} to go` };
    case 'action':
      return { kind: 'turn', mine, step: 'act', detail: null };
    case 'callDice':
      return { kind: 'turn', mine, step: 'act', detail: `Contest: ${decider} may call for dice` };
    case 'reaction':
      return { kind: 'turn', mine, step: 'act', detail: `Contest: ${decider} may play a reaction spell` };
    case 'forcedSub':
      return { kind: 'turn', mine, step: 'act', detail: `Injury: ${decider} must bring on a substitute` };
    case 'faceoffLane':
      // After a goal, the faceoff comes straight away, before the scorer's discard step.
      return { kind: 'turn', mine, step: 'act', detail: 'Goal! Faceoff, then the discard step' };
    default:
      return { kind: 'turn', mine, step: 'act', detail: null };
  }
}

const STEPS: { id: StepId; title: string; text: (view: PlayerView) => string }[] = [
  { id: 'draw', title: 'Draw', text: (v) => `Take a player or a spell. With ${v.config.handLimit} or more cards, the top card is discarded instead.` },
  { id: 'act', title: 'Act', text: (v) => v.config.actionsPerTurn === 1
    ? 'One action: pass, shoot, tackle, cast, substitute, or regroup.'
    : `${v.config.actionsPerTurn} actions: pass, shoot, tackle, cast, substitute, or regroup.` },
  { id: 'discard', title: 'Discard', text: (v) => `Down to ${v.config.handLimit} cards, if you have more.` },
];

export function TurnSteps({ view }: { view: PlayerView }) {
  const phase = turnPhase(view);
  const order = STEPS.map((s) => s.id);
  const currentIndex = phase.kind === 'turn' ? order.indexOf(phase.step) : -1;
  const lastTurn = view.endgame.finalTurnFor !== null && view.endgame.finalTurnFor === view.activeSide;

  let heading: string;
  let next: string | null = null;
  if (phase.kind === 'turn') {
    heading = phase.mine ? `Your turn (turn ${view.turn})` : `Computer's turn (turn ${view.turn})`;
    next = lastTurn ? 'Then full time.' : `Then ${phase.mine ? "the computer's" : 'your'} turn.`;
  } else if (phase.kind === 'opening') {
    heading = 'Opening faceoff';
    next = `Then ${view.firstSide === view.me ? 'you take' : 'the computer takes'} turn 1.`;
  } else if (phase.kind === 'shootout') {
    heading = 'Penalty shootout';
  } else {
    heading = 'Full time';
  }

  return (
    <aside className="turn-steps" aria-label="Turn order">
      <div className={`turn-heading ${phase.kind === 'turn' && phase.mine ? 'mine' : ''}`}>{heading}</div>
      {lastTurn ? <div className="turn-note">Last turn of the game</div> : null}

      {phase.kind === 'shootout' && view.shootout ? (
        <ShootoutProgress view={view} />
      ) : (
        <ol className="steps">
          {STEPS.map((step, i) => {
            const state = currentIndex < 0 ? 'upcoming' : i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
            const detail = state === 'current' && phase.kind === 'turn' ? phase.detail : null;
            return (
              <li key={step.id} className={`step ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                <span className="step-mark">{state === 'done' ? '✓' : i + 1}</span>
                <span className="step-body">
                  <span className="step-title">{step.title}{state === 'current' ? <span className="now">now</span> : null}</span>
                  <span className="step-text">{step.text(view)}</span>
                  {detail ? <span className="step-detail">{detail}</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {next ? <div className="turn-next">{next}</div> : null}
    </aside>
  );
}

function ShootoutProgress({ view }: { view: PlayerView }) {
  const s = view.shootout!;
  const them = view.me === 'A' ? 'B' : 'A';
  const rounds = view.config.shootoutRounds;
  const line = (side: typeof them, who: string) => `${who}: ${s.goals[side]} scored from ${s.taken[side]} taken`;
  return (
    <div className="steps shootout">
      <p className="step-text">Teams take turns: {rounds} penalties each, then one each until one scores and the other misses.</p>
      <p>{line(view.me, 'You')}</p>
      <p>{line(them, 'Computer')}</p>
    </div>
  );
}
