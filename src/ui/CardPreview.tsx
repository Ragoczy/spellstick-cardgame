// Dev preview of the full card design: one of each kind of card, at the sizes the game would use.
// Open the game with ?cards in the address (for example http://localhost:5173/?cards).

import { prototypeCards } from '../data/prototype';
import type { CardDef } from '../engine';
import { CardFace } from './CardFace';
import { cardArt } from './cardArt';

const byId = (id: string) => prototypeCards.cards.find((c) => c.id === id);

/** A player with art, a goalie, a player without art yet, both kinds of spell, and the promo card. */
function samples(): CardDef[] {
  const withArt = prototypeCards.cards.filter((c) => c.kind !== 'spell' && cardArt(c.id));
  const noArt = prototypeCards.cards.find((c) => c.kind === 'field' && c.team === 'pool' && !cardArt(c.id));
  const reaction = prototypeCards.cards.find((c) => c.kind === 'spell' && c.spellType === 'reaction' && c.element);
  const action = prototypeCards.cards.find((c) => c.kind === 'spell' && c.spellType === 'action');
  return [...withArt, noArt, reaction, action, byId('promo-canon-01')].filter((c): c is CardDef => Boolean(c));
}

/** Widths to compare: half of print resolution, a zoomed-in card, and a card in hand. */
const SIZES = [
  { width: 375, label: '375 px: half of print resolution (print is 750 × 1050 at 300 DPI)' },
  { width: 260, label: '260 px: a card you click to look at' },
  { width: 180, label: '180 px: a card in your hand' },
  { width: 120, label: '120 px: too small to read; the field needs a compact version' },
];

export function CardPreview() {
  const cards = samples();
  return (
    <main className="screen card-preview">
      <h1>Card design preview</h1>
      <p className="small">Every card at the 2.5" × 3.5" poker-card shape. Frame color comes from the card's element (a player's first Resonant).</p>
      <h2>All kinds of card at 260 px</h2>
      <div className="card-row">
        {cards.map((def) => <CardFace key={def.id} def={def} width={260} />)}
      </div>
      <h2>One card at each size</h2>
      <div className="card-row">
        {SIZES.map((s) => (
          <figure key={s.width}>
            <CardFace def={cards[0]!} width={s.width} serial={12} />
            <figcaption style={{ width: s.width }}>{s.label}</figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
