// The full card, laid out like a printed trading card: name bar, art window, type line, text box,
// and footer, at the 2.5" x 3.5" (5:7) poker-card shape. Every size inside is a share of the
// card's width (cqw units in styles.css), so the same design works at any size on screen and
// at print size.

import type { CSSProperties } from 'react';
import type { CardDef, InjuryDef } from '../engine';
import { roleLabel } from '../data/playerTypes';
import { cardArt } from './cardArt';
import { TYPE_POSITION } from './Card';
import { cardText, injuryEffect, magicColor, magicLabel } from './labels';
import { PlayerFigure, type FigurePosition } from './PlayerFigure';

/** The magic whose family colors the frame: a spell's magic, or a player's first Resonant's Affinity. */
function frameMagic(def: CardDef): string | null {
  return def.kind === 'spell' ? def.magic : def.resonants[0]?.affinity ?? null;
}

/** The position a player is drawn in on the type line. */
function figurePosition(def: CardDef): FigurePosition {
  if (def.kind === 'goalie') return 'goal';
  return def.kind === 'field' && def.role ? TYPE_POSITION[def.role] : 'midfield';
}

/** Magic pips in the name bar, like the cost symbols on other card games: one per family. */
function Pips({ def }: { def: CardDef }) {
  const pips = def.kind === 'spell'
    ? [{ key: 'spell', magic: def.magic, title: `${magicLabel(def.magic)} spell` }]
    : def.resonants.map((r) => ({ key: r.name, magic: r.affinity, title: `${r.name} Resonant: ${magicLabel(r.affinity)} Affinity` }));
  return (
    <span className="cf-pips">
      {pips.map((p) => (
        <span key={p.key} className="cf-pip" style={{ background: magicColor(p.magic) }} title={p.title}>
          {p.magic ? p.magic.charAt(0).toUpperCase() : '·'}
        </span>
      ))}
    </span>
  );
}

/**
 * The name's font size in cqw: full size for most names, smaller for long ones so they fit
 * beside the pips. Tuned by eye on the longest names in the card data.
 */
function nameSize(def: CardDef): number {
  const pipCount = def.kind === 'spell' ? 1 : def.resonants.length;
  return Math.min(5.6, (128 - 7 * pipCount) / def.name.length);
}

/** "Anger: Fire · Joy: Wind (air)": the pips spelled out, since a printed card has no tooltips. */
function resonantLine(def: CardDef): string | null {
  if (def.kind === 'spell') return null;
  return def.resonants.map((r) => `${r.name}: ${magicLabel(r.affinity)}`).join(' · ');
}

function typeLine(def: CardDef): string {
  if (def.kind === 'spell') return `${def.spellType === 'reaction' ? 'Reaction' : 'Action'} spell`;
  if (def.kind === 'goalie') return 'Goalie';
  return def.role ? roleLabel(def.role) : 'Field player';
}

function Stats({ def }: { def: CardDef }) {
  if (def.kind === 'goalie') {
    return <div className="cf-stats"><span className="cf-stat"><small>Save</small><b>{def.save}</b></span></div>;
  }
  if (def.kind !== 'field') return null;
  const stats: [string, number][] = [['Speed', def.speed], ['Shot', def.shot], ['Defense', def.defense], ['Faceoff', def.faceoff]];
  return (
    <div className="cf-stats">
      {stats.map(([label, value]) => <span key={label} className="cf-stat"><small>{label}</small><b>{value}</b></span>)}
    </div>
  );
}

export interface CardFaceProps {
  def: CardDef;
  /** Width in pixels. The height follows from the 5:7 card shape. Leave it out to size the card in CSS. */
  width?: number;
  /** Shown in the footer for an owned copy online ("#12"). */
  serial?: number;
  /** An injury on this player (injury cards are face up). */
  injury?: InjuryDef;
  selected?: boolean;
  /** Can't be played right now (shown faded). */
  dim?: boolean;
  /** Highlight: something you can do with this card. */
  highlight?: 'target' | 'match' | 'opposed' | null;
  onClick?: () => void;
}

export function CardFace({ def, width, serial, injury, selected, dim, highlight, onClick }: CardFaceProps) {
  const magic = frameMagic(def);
  const art = cardArt(def.id);
  const text = cardText(def);
  const classes = ['cf', selected ? 'selected' : '', dim ? 'dim' : '', highlight ? `hl-${highlight}` : '', injury ? 'injured' : '']
    .filter(Boolean)
    .join(' ');
  // The outer box sets the size that every cqw inside is measured against. --frame is the frame
  // color; styles.css mixes the lighter frame shades from it.
  const style = { width, '--frame': magicColor(magic) } as CSSProperties;
  const body = (
    <div className="cf-card">
      <div className="cf-inner">
        <div className="cf-bar cf-name">
          <span className="cf-title" style={{ fontSize: `${nameSize(def)}cqw` }}>{def.name}</span>
          <Pips def={def} />
        </div>
        <div className="cf-art">
          {art ? <img src={art} alt="" loading="lazy" /> : def.kind === 'spell'
            ? <span className="cf-art-empty">{magicLabel(magic)}</span>
            : <PlayerFigure position={figurePosition(def)} magic={magic} className="cf-art-figure" />}
          {injury ? <span className="cf-injury">✚ {injury.name}: {injuryEffect(injury, def)}</span> : null}
        </div>
        <div className="cf-bar cf-type">
          <span>{typeLine(def)}</span>
          {def.kind === 'spell' ? null : <PlayerFigure position={figurePosition(def)} magic={magic} className="cf-type-figure" />}
        </div>
        <div className="cf-text">
          <Stats def={def} />
          {resonantLine(def) ? <p className="cf-resonants">{resonantLine(def)}</p> : null}
          {def.kind === 'spell' ? <p className="cf-when">{def.spellType === 'reaction' ? 'Play during a contest.' : 'Play on your turn.'}</p> : null}
          {text ? <p>{text}</p> : null}
          {def.flavor ? <p className="cf-flavor">{def.flavor}</p> : null}
        </div>
      </div>
      <div className="cf-footer">
        <span>{def.id.toUpperCase()}{serial ? ` · #${serial}` : ''}</span>
        <span>Spellstick · fan game</span>
      </div>
    </div>
  );
  return onClick
    ? <button type="button" className={classes} style={style} onClick={onClick}>{body}</button>
    : <div className={classes} style={style}>{body}</div>;
}
