// The tutorial coach beside the board (docs/tutorial-design.md, "On screen"): what just happened,
// a lesson the first time a situation comes up, and a suggested move with a "Do it" button.
// Nothing is locked: every normal control still works. It only shows what the coach says.

import { useEffect, useState } from 'react';
import { isFieldPos, opposite, type Action, type Area, type PlayerView } from '../engine';
import { suggestedLineup, firstName } from '../tutorial/coach';
import { coachOptions } from '../tutorial/play';
import { laneName } from './labels';
import { markTutorialDone, type TutorialSession } from './tutorialSession';
import { posKey } from './useGame';

const ROW_TITLE: Record<Area, string> = { forward: 'Forwards', midfield: 'Midfielders', defense: 'Defenders' };

/** The whole suggested lineup in one line, and who stays in hand. */
function lineupSummary(view: PlayerView): string {
  const plan = suggestedLineup(view, coachOptions());
  const rows = (['forward', 'midfield', 'defense'] as Area[]).map((area) => {
    const names = Array.from({ length: view.lanes }, (_, lane) => {
      const card = plan.get(`${area}:${lane}`);
      return card ? `${firstName(card.def.name)} (${laneName(lane, view.lanes)})` : null;
    }).filter(Boolean);
    return names.length ? `${ROW_TITLE[area]}: ${names.join(', ')}.` : '';
  });
  const placed = new Set([...plan.values()].map((c) => c.uid));
  const spares = view.mine.hand.filter((c) => c.def.kind === 'field' && !placed.has(c.uid)).map((c) => firstName(c.def.name));
  return `${rows.filter(Boolean).join(' ')}${spares.length ? ` Keep ${spares.join(' and ')} in your hand.` : ''}`;
}

/** The spot on the board the coach's suggestion is about (for its glow). */
export function coachSpotKey(view: PlayerView, a: Action): string | null {
  const me = view.me;
  switch (a.type) {
    case 'pass': return posKey(me, a.to);
    case 'shoot': return view.ball ? posKey(me, view.ball.pos) : null;
    case 'tackle': return view.ball && isFieldPos(view.ball.pos) ? posKey(me, opposite(view.ball.pos)) : null;
    case 'substitute': return posKey(me, a.pos);
    case 'cast': return posKey(me, a.caster);
    case 'shootoutPick': return posKey(me, a.pos);
    default: return null;
  }
}

/** The card in hand the coach's suggestion is about (for its glow). */
export function coachCardUid(a: Action): string | null {
  switch (a.type) {
    case 'react': case 'foul': return a.card;
    case 'discard': case 'forcedSub': case 'cast': case 'substitute': case 'chooseGoalie': return a.card;
    default: return null;
  }
}

export function CoachPanel({ tutorial, myDecision, onDo, onAutoPlace, onAgain, onQuit }: {
  tutorial: TutorialSession;
  myDecision: boolean;
  onDo: (action: Action) => void;
  onAutoPlace: () => void;
  onAgain?: () => void;
  onQuit: () => void;
}) {
  const [hidden, setHidden] = useState(false);
  const view = tutorial.view;
  const over = view.pending.kind === 'gameOver';
  useEffect(() => {
    if (over) markTutorialDone();
  }, [over]);

  if (hidden) {
    return (
      <div className="coach coach-hidden">
        <button type="button" className="quiet" onClick={() => setHidden(false)}>Show the coach</button>
      </div>
    );
  }

  const tip = myDecision ? tutorial.tip() : null;
  const lineup = view.pending.kind === 'placeLineup';
  const says = lineup ? lineupSummary(view) : tip?.suggestion?.says;
  return (
    <aside className="coach" aria-label="Coach">
      <div className="coach-head">
        <strong>Coach</strong>
        <button type="button" className="quiet" onClick={() => setHidden(true)}>Hide tips</button>
      </div>
      {tutorial.notes.map((n, i) => n.title
        ? <p className="coach-note" key={`${n.id}-${i}`}><b>{/[.!?]$/.test(n.title) ? n.title : `${n.title}.`}</b> {n.text}</p>
        : <p className="coach-comment" key={`${n.id}-${i}`}>{n.text}</p>)}
      {tip?.lesson ? (
        <div className="coach-lesson">
          <h4>{tip.lesson.title}</h4>
          <p>{tip.lesson.text}</p>
        </div>
      ) : null}
      {says && myDecision ? (
        <div className="coach-suggest">
          <span><b>Suggestion:</b> {says}</span>
          <button type="button" className="primary" onClick={() => (lineup ? onAutoPlace() : tip?.suggestion && onDo(tip.suggestion.action))}>
            {lineup ? 'Place them for me' : 'Do it'}
          </button>
        </div>
      ) : null}
      {!myDecision && !over ? <p className="coach-wait">The computer is making its move.</p> : null}
      {over ? (
        <div className="buttons">
          {onAgain ? <button type="button" className="primary" onClick={onAgain}>Play the tutorial again</button> : null}
          <button type="button" onClick={onQuit}>Play a real game</button>
        </div>
      ) : null}
    </aside>
  );
}
