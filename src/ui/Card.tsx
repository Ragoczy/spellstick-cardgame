// Placeholder card frames (CLAUDE.md "Art and print"): name, stats, ability text, team color.

import { createContext, useContext } from 'react';
import type { CardDef } from '../engine';
import { capitalize, cardText, elementColor } from './labels';

/** Team colors by team id, from the card data. */
export const TeamColors = createContext<Record<string, string>>({});

function Resonants({ def }: { def: CardDef }) {
  if (def.kind === 'spell') return null;
  return (
    <span className="resonants">
      {def.resonants.map((r) => (
        <span key={r.name} className="dot" style={{ background: elementColor(r.affinity) }} title={`${r.name} Resonant: ${capitalize(r.affinity)} Affinity`} />
      ))}
    </span>
  );
}

function Stats({ def }: { def: CardDef }) {
  if (def.kind === 'goalie') return <div className="stats"><span>Save <b>{def.save}</b></span></div>;
  if (def.kind === 'field') {
    return (
      <div className="stats">
        <span>Spd <b>{def.speed}</b></span>
        <span>Sht <b>{def.shot}</b></span>
        <span>Def <b>{def.defense}</b></span>
        <span>Fo <b>{def.faceoff}</b></span>
      </div>
    );
  }
  return (
    <div className="stats spell-line">
      <span className="chip" style={{ background: elementColor(def.element) }}>{def.element ? capitalize(def.element) : 'Neutral'}</span>
      <span>{def.spellType === 'reaction' ? 'Reaction' : 'Action'}</span>
    </div>
  );
}

export interface CardProps {
  def: CardDef;
  /** Your own card that the opponent can't see. */
  faceDown?: boolean;
  /** The opponent has scried this face-down card (or you scried theirs). */
  scried?: boolean;
  hasBall?: boolean;
  selected?: boolean;
  /** Highlight: something you can do with this card or spot. */
  highlight?: 'target' | 'match' | 'opposed' | null;
  flip?: boolean;
  showText?: boolean;
  onClick?: () => void;
}

export function Card({ def, faceDown, scried, hasBall, selected, highlight, flip, showText, onClick }: CardProps) {
  const colors = useContext(TeamColors);
  const classes = ['card', def.kind, faceDown ? 'face-down' : '', selected ? 'selected' : '', highlight ? `hl-${highlight}` : '', flip ? 'flip' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} onClick={onClick} style={{ borderTopColor: colors[def.team] ?? '#555' }}>
      <div className="card-name">
        {def.ability && def.kind !== 'spell' ? <span className="star" title={cardText(def)}>★</span> : null}
        {def.name}
      </div>
      <Stats def={def} />
      <Resonants def={def} />
      {showText && cardText(def) ? <div className="card-text">{cardText(def)}</div> : null}
      {faceDown ? <span className="tag">{scried ? 'seen' : 'hidden'}</span> : null}
      {hasBall ? <span className="ball" aria-label="has the ball" title="Has the ball" /> : null}
    </button>
  );
}

export function CardBack({ team, hasBall, highlight, onClick, label }: { team: string; hasBall?: boolean; highlight?: CardProps['highlight']; onClick?: () => void; label?: string }) {
  const colors = useContext(TeamColors);
  return (
    <button type="button" className={`card back ${highlight ? `hl-${highlight}` : ''}`} onClick={onClick} style={{ background: colors[team] ?? '#555' }}>
      <span className="back-mark">?</span>
      {label ? <span className="back-label">{label}</span> : null}
      {hasBall ? <span className="ball" aria-label="has the ball" title="Has the ball" /> : null}
    </button>
  );
}
