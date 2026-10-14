// The full card, laid out like a printed trading card: name bar, art window, type line, text box,
// and footer, at the 2.5" x 3.5" (5:7) poker-card shape. Every size inside is a share of the
// card's width (cqw units in styles.css), so the same design works at any size on screen and
// at print size. Players, spells, and the draft physical attack cards (PLAN.md) share it.

import type { CSSProperties } from 'react';
import type { CardDef, InjuryDef } from '../engine';
import { PENALTY_TURNS, type PhysicalCardDef } from '../data/physicalCards';
import { roleLabel } from '../data/playerTypes';
import { cardArt } from './cardArt';
import { TYPE_POSITION } from './Card';
import { capitalize, cardText, injuryEffect, magicColor, magicLabel } from './labels';
import { PlayerFigure, type FigurePosition } from './PlayerFigure';

/** Any card this face can show. */
type FaceDef = CardDef | PhysicalCardDef;

/** The magic whose family colors the frame: a spell's magic, or a player's first Resonant's Affinity. */
function frameMagic(def: CardDef): string | null {
  return def.kind === 'spell' ? def.magic : def.resonants[0]?.affinity ?? null;
}

/** The frame color: a physical card's tier (like a referee's cards), otherwise its magic family. */
function frameColor(def: FaceDef): string {
  return def.kind === 'physical' ? `var(--tier-${def.tier})` : magicColor(frameMagic(def));
}

/** The position a player is drawn in on the type line. */
function figurePosition(def: CardDef): FigurePosition {
  if (def.kind === 'goalie') return 'goal';
  return def.kind === 'field' && def.role ? TYPE_POSITION[def.role] : 'midfield';
}

/**
 * Magic pips in the name bar, like the cost symbols on other card games: one per family. A
 * physical card shows the body Affinity that helps it, lettered by specialization (S for Strength).
 */
function Pips({ def }: { def: FaceDef }) {
  const pips = def.kind === 'physical'
    ? [{ key: 'affinity', magic: def.affinity, letter: (def.affinity.split('.')[1] ?? def.affinity).charAt(0), title: `+1 with a ${magicLabel(def.affinity)} Affinity` }]
    : def.kind === 'spell'
      ? [{ key: 'spell', magic: def.magic, letter: def.magic?.charAt(0) ?? '·', title: `${magicLabel(def.magic)} spell` }]
      : def.resonants.map((r) => ({ key: r.name, magic: r.affinity, letter: r.affinity.charAt(0), title: `${r.name} Resonant: ${magicLabel(r.affinity)} Affinity` }));
  return (
    <span className="cf-pips">
      {pips.map((p) => (
        <span key={p.key} className="cf-pip" style={{ background: magicColor(p.magic) }} title={p.title}>
          {p.letter.toUpperCase()}
        </span>
      ))}
    </span>
  );
}

/**
 * The name's font size in cqw: full size for most names, smaller for long ones so they fit
 * beside the pips (and the cost, when shown). Tuned by eye on the longest names in the card data.
 */
function nameSize(def: FaceDef, hasCost: boolean): number {
  const pipCount = def.kind === 'spell' || def.kind === 'physical' ? 1 : def.resonants.length;
  return Math.min(5.6, (128 - 7 * pipCount - (hasCost ? 9 : 0)) / def.name.length);
}

/**
 * "Anger: Fire · Joy: Wind (air)": the pips spelled out, since a printed card has no tooltips.
 * A physical card says which Affinity helps it.
 */
function resonantLine(def: FaceDef): string | null {
  if (def.kind === 'physical') return `+1 with a ${magicLabel(def.affinity)} Affinity`;
  if (def.kind === 'spell') return null;
  return def.resonants.map((r) => `${r.name}: ${magicLabel(r.affinity)}`).join(' · ');
}

function typeLine(def: FaceDef): string {
  if (def.kind === 'physical') return `${def.when ? 'Reaction' : 'Physical'} attack · ${capitalize(def.tier)}`;
  if (def.kind === 'spell') return `${def.spellType === 'reaction' ? 'Reaction' : 'Action'} spell`;
  if (def.kind === 'goalie') return 'Goalie';
  return def.role ? roleLabel(def.role) : 'Field player';
}

/** "+1", "−2", "±0", or "—" for a roll the card never makes. */
function modifier(n: number | null): string {
  if (n === null) return '—';
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0';
}

/** A physical card's numbers: what it attacks with, what it does to the rolls, and the penalty. */
function PhysicalStats({ def }: { def: PhysicalCardDef }) {
  const statName = def.uses === 'muscle' ? 'Defense' : 'Speed';
  const bonus = def.bonus ? ` +${def.bonus}` : '';
  const stats: [string, string, string][] = [
    ['Attack', `${def.uses === 'muscle' ? 'Def' : 'Spd'}${bonus}`, `Your ${statName}${bonus} against their Speed`],
    ['Toughness', modifier(def.toughness), def.toughness === null ? 'No Toughness roll' : "Change to the target's Toughness roll"],
    ['Severity', modifier(def.severity), def.severity === null ? 'No severity roll' : 'Change to the severity roll if they are hurt'],
    ['Penalty', `${PENALTY_TURNS[def.tier]}`, 'Turns in the penalty box if the referee calls it'],
  ];
  return (
    <div className="cf-stats cf-stats-physical">
      {stats.map(([label, value, title]) => <span key={label} className="cf-stat" title={title}><small>{label}</small><b>{value}</b></span>)}
    </div>
  );
}

function Stats({ def, toughness }: { def: CardDef; toughness?: number }) {
  if (def.kind === 'goalie') {
    return <div className="cf-stats"><span className="cf-stat"><small>Save</small><b>{def.save}</b></span></div>;
  }
  if (def.kind !== 'field') return null;
  const stats: [string, number][] = [['Speed', def.speed], ['Shot', def.shot], ['Defense', def.defense], ['Faceoff', def.faceoff]];
  if (toughness !== undefined) stats.push(['Tough', toughness]);
  return (
    <div className={`cf-stats ${toughness !== undefined ? 'cf-stats-five' : ''}`}>
      {stats.map(([label, value]) => <span key={label} className="cf-stat"><small>{label}</small><b>{value}</b></span>)}
    </div>
  );
}

/** "From hockey", for the footer. The made-up ones say so. */
function sportLine(def: PhysicalCardDef): string {
  return def.from.toLowerCase() === 'made up' ? 'Made up for spellstick' : `From ${def.from.toLowerCase()}`;
}

export interface CardFaceProps {
  def: FaceDef;
  /**
   * Toughness to show instead of the card's own (v0.17). Field players show their own Toughness
   * without it; card sets saved before v0.17 have none. Cost isn't in the card data yet, so for
   * now only the design preview passes it.
   */
  toughness?: number;
  cost?: number;
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

export function CardFace({ def, toughness: toughnessShown, cost, width, serial, injury, selected, dim, highlight, onClick }: CardFaceProps) {
  const art = cardArt(def.id);
  const toughness = toughnessShown ?? (def.kind === 'field' ? def.toughness : undefined);
  const classes = ['cf', def.kind === 'physical' ? 'physical' : '', selected ? 'selected' : '', dim ? 'dim' : '', highlight ? `hl-${highlight}` : '', injury ? 'injured' : '']
    .filter(Boolean)
    .join(' ');
  // The outer box sets the size that every cqw inside is measured against. --frame is the frame
  // color; styles.css mixes the lighter frame shades from it.
  const style = { width, '--frame': frameColor(def) } as CSSProperties;
  const body = (
    <div className="cf-card">
      <div className="cf-inner">
        <div className="cf-bar cf-name">
          {cost !== undefined ? <span className="cf-cost" title="Cost: what this player counts against a team's cap">{cost}</span> : null}
          <span className="cf-title" style={{ fontSize: `${nameSize(def, cost !== undefined)}cqw` }}>{def.name}</span>
          <Pips def={def} />
        </div>
        <div className="cf-art">
          {art ? <img src={art} alt="" loading="lazy" />
            : def.kind === 'physical' ? <span className="cf-art-empty">{def.from}</span>
            : def.kind === 'spell' ? <span className="cf-art-empty">{magicLabel(def.magic)}</span>
            : <PlayerFigure position={figurePosition(def)} magic={frameMagic(def)} className="cf-art-figure" />}
          {injury && def.kind !== 'physical' ? <span className="cf-injury">✚ {injury.name}: {injuryEffect(injury, def)}</span> : null}
        </div>
        <div className="cf-bar cf-type">
          <span>{typeLine(def)}</span>
          {def.kind === 'physical'
            ? <span className="cf-penalty-card" title={`Penalty if the referee calls it: ${PENALTY_TURNS[def.tier]} turns in the box`}>{PENALTY_TURNS[def.tier]}</span>
            : def.kind === 'spell' ? null
            : <PlayerFigure position={figurePosition(def)} magic={frameMagic(def)} className="cf-type-figure" />}
        </div>
        <div className="cf-text">
          {def.kind === 'physical' ? <PhysicalStats def={def} /> : <Stats def={def} toughness={toughness} />}
          {resonantLine(def) ? <p className="cf-resonants">{resonantLine(def)}</p> : null}
          {def.kind === 'physical' ? (
            <>
              {def.when ? <p className="cf-when">{def.when}</p> : null}
              {def.text ? <p>{def.text}</p> : null}
            </>
          ) : (
            <>
              {def.kind === 'spell' ? <p className="cf-when">{def.spellType === 'reaction' ? 'Play during a contest.' : 'Play on your turn.'}</p> : null}
              {cardText(def) ? <p>{cardText(def)}</p> : null}
              {def.flavor ? <p className="cf-flavor">{def.flavor}</p> : null}
            </>
          )}
        </div>
      </div>
      <div className="cf-footer">
        <span>{def.id.toUpperCase()}{serial ? ` · #${serial}` : ''}{def.kind === 'physical' ? ` · ${sportLine(def)}` : ''}</span>
        <span>Spellstick · fan game</span>
      </div>
    </div>
  );
  return onClick
    ? <button type="button" className={classes} style={style} onClick={onClick}>{body}</button>
    : <div className={classes} style={style}>{body}</div>;
}
