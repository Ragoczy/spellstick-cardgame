// Placeholder card frames (CLAUDE.md "Art and print"): name, stats, ability text, team color.

import { createContext, useContext } from 'react';
import type { CardDef, InjuryDef, PlayerRole } from '../engine';
import { cardText, injuryEffect, magicColor, magicLabel } from './labels';
import { spellWhen } from './spellHelp';
import { roleLabel } from '../data/playerTypes';
import { PlayerFigure, type FigurePosition } from './PlayerFigure';
import { cardArt } from './cardArt';

/** Team colors by team id, from the card data. */
export const TeamColors = createContext<Record<string, string>>({});

/**
 * Where a player is drawn when they aren't on the field (in hand, in the draft): the row their
 * type suits best. Any field player can still play any position.
 */
export const TYPE_POSITION: Record<PlayerRole, FigurePosition> = {
  striker: 'forward', runner: 'midfield', playmaker: 'midfield', allrounder: 'midfield',
  anchor: 'defense', stopper: 'defense', goalie: 'goal',
};

/**
 * A small square of the card's art at the left of the tile (see .tile-art in styles.css). A
 * player's is edged in their first Resonant's Affinity color and zoomed in on the head and
 * shoulders; a spell's is edged in its magic's color and shows the middle of the picture.
 */
function ArtStrip({ def, injured }: { def: CardDef; injured: boolean }) {
  const art = cardArt(def.id);
  if (!art) return null;
  const edge = magicColor(def.kind === 'spell' ? def.magic : def.resonants[0]?.affinity ?? null);
  const classes = ['tile-art', def.kind === 'spell' ? 'spell' : '', injured ? 'injured' : ''].filter(Boolean).join(' ');
  return <span className={classes} style={{ backgroundImage: `url(${art})`, borderColor: edge }} />;
}

/**
 * The player's figure, for a player with no art yet: the position they stand in, colored by
 * their first Resonant's Affinity.
 */
function Figure({ def, position, injured }: { def: CardDef; position?: FigurePosition; injured: boolean }) {
  if (def.kind === 'spell' || cardArt(def.id)) return null;
  const pos = def.kind === 'goalie' ? 'goal' : position ?? (def.role ? TYPE_POSITION[def.role] : 'midfield');
  return <PlayerFigure position={pos} magic={def.resonants[0]?.affinity ?? null} injured={injured} />;
}

/** Resonant dots. On the field, a dot goes hollow for each Resonant's worth of spells cast. */
function Resonants({ def, usedDots = 0, castsLeft }: { def: CardDef; usedDots?: number; castsLeft?: number }) {
  if (def.kind === 'spell') return null;
  const title = castsLeft === undefined ? undefined
    : castsLeft === 0 ? 'No spells left. Substitute this player out to recharge.'
    : `${castsLeft} ${castsLeft === 1 ? 'spell' : 'spells'} left before this player needs a rest`;
  return (
    <span className="resonants" title={title}>
      {def.resonants.map((r, i) => (
        <span key={r.name} className={`dot ${i < usedDots ? 'used' : ''}`} style={{ background: magicColor(r.affinity) }} title={title ? undefined : `${r.name} Resonant: ${magicLabel(r.affinity)} Affinity`} />
      ))}
      {castsLeft === 0 ? <span className="rest">needs rest</span> : null}
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
    <>
      <div className="stats spell-line">
        <span className="chip" style={{ background: magicColor(def.magic) }}>{magicLabel(def.magic)}</span>
        <span>{def.spellType === 'reaction' ? 'Reaction' : 'Action'}</span>
      </div>
      <div className={`spell-when ${def.spellType}`}>{spellWhen(def)}</div>
    </>
  );
}

export interface CardProps {
  def: CardDef;
  /** An injury card attached to this player (injury cards are face up). */
  injury?: InjuryDef;
  /** On the field: the position the player stands in, for their figure. Elsewhere it comes from the card's type. */
  position?: FigurePosition;
  /** Your own card that the opponent can't see. */
  faceDown?: boolean;
  /** The opponent has scried this face-down card (or you scried theirs). */
  scried?: boolean;
  /** The player has mirror images around them. */
  images?: boolean;
  /** On the field: spells this player can still cast before they need a rest. */
  castsLeft?: number;
  /** On the field: how many Resonant dots to show as used up. */
  usedDots?: number;
  /** On the field: substituted on this turn, so can't act yet. */
  cameOn?: boolean;
  hasBall?: boolean;
  selected?: boolean;
  /** Can't be played right now (shown faded). */
  dim?: boolean;
  /** Highlight: something you can do with this card or spot. */
  highlight?: 'target' | 'match' | 'opposed' | null;
  flip?: boolean;
  showText?: boolean;
  onClick?: () => void;
}

export function Card({ def, injury, position, faceDown, scried, images, castsLeft, usedDots, cameOn, hasBall, selected, dim, highlight, flip, showText, onClick }: CardProps) {
  const colors = useContext(TeamColors);
  const classes = ['card', def.kind, faceDown ? 'face-down' : '', images ? 'has-images' : '', selected ? 'selected' : '', dim ? 'dim' : '', highlight ? `hl-${highlight}` : '', flip ? 'flip' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} onClick={onClick} style={{ borderTopColor: colors[def.team] ?? '#555' }}>
      <ArtStrip def={def} injured={Boolean(injury)} />
      <div className="card-name">
        {def.ability && def.kind !== 'spell' ? <span className="star" title={cardText(def)}>★</span> : null}
        {def.name}
      </div>
      <Figure def={def} position={position} injured={Boolean(injury)} />
      {def.kind !== 'spell' && (def.role || cameOn) ? (
        <div className="card-role">
          {def.role ? roleLabel(def.role) : null}
          {cameOn ? <span className="just-on" title="Came on this turn: can't pass, shoot, tackle, or cast until the next turn">{def.role ? ' · ' : ''}just on</span> : null}
        </div>
      ) : null}
      <Stats def={def} />
      <Resonants def={def} usedDots={usedDots} castsLeft={castsLeft} />
      {injury ? <div className="injury" title={`${injury.name}: ${injuryEffect(injury, def)}`}>✚ {injury.name} {injuryEffect(injury, def)}</div> : null}
      {showText && cardText(def) ? <div className="card-text">{cardText(def)}</div> : null}
      {faceDown ? <span className="tag">{scried ? 'seen' : 'hidden'}</span> : null}
      {images ? <span className="tag images" title="Mirror images: most tackles and hits go for an image and miss">images</span> : null}
      {hasBall ? <span className="ball" aria-label="has the ball" title="Has the ball" /> : null}
    </button>
  );
}

export function CardBack({ team, hasBall, highlight, onClick, label, injury }: { team: string; hasBall?: boolean; highlight?: CardProps['highlight']; onClick?: () => void; label?: string; injury?: InjuryDef }) {
  const colors = useContext(TeamColors);
  return (
    <button type="button" className={`card back ${highlight ? `hl-${highlight}` : ''}`} onClick={onClick} style={{ background: colors[team] ?? '#555' }}>
      <span className="back-mark">?</span>
      {label ? <span className="back-label">{label}</span> : null}
      {injury ? <span className="injury on-back" title={injury.name}>✚ {injury.name}</span> : null}
      {hasBall ? <span className="ball" aria-label="has the ball" title="Has the ball" /> : null}
    </button>
  );
}
