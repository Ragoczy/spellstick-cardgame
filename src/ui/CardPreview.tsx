// Dev preview of the full card design: one of each kind of card, at the sizes the game would use.
// Open the game with ?cards in the address (for example http://localhost:5173/?cards).

import { physicalCards } from '../data/physicalCards';
import { prototypeCards } from '../data/prototype';
import type { CardDef, PlayerRole } from '../engine';
import { CardFace } from './CardFace';
import { cardArt } from './cardArt';

const byId = (id: string) => prototypeCards.cards.find((c) => c.id === id);

/** A player with art, a goalie, a player without art yet, both kinds of spell, and the promo card. */
function samples(): CardDef[] {
  // A few players with art, not all 100.
  const withArt = prototypeCards.cards.filter((c) => c.kind !== 'spell' && cardArt(c.id)).slice(0, 4);
  const noArt = prototypeCards.cards.find((c) => c.kind === 'field' && c.team === 'pool' && !cardArt(c.id));
  const reaction = prototypeCards.cards.find((c) => c.kind === 'spell' && c.spellType === 'reaction' && c.magic);
  const action = prototypeCards.cards.find((c) => c.kind === 'spell' && c.spellType === 'action');
  return [...withArt, noArt, reaction, action, byId('promo-canon-01')].filter((c): c is CardDef => Boolean(c));
}

/** PLAN.md (v0.17) Toughness by player type, for the mock-ups below. */
const MOCK_TOUGHNESS: Record<PlayerRole, number> = {
  stopper: 5, anchor: 5, playmaker: 4, allrounder: 4, runner: 3, striker: 3, goalie: 0,
};

/** One field player of each type, with plan Toughness and a made-up cost, to lay out the v0.17 card. */
function mockPlayers(): { def: CardDef; toughness?: number; cost: number }[] {
  const roles: PlayerRole[] = ['runner', 'striker', 'playmaker', 'allrounder', 'anchor', 'stopper'];
  const players = roles
    .map((role) => prototypeCards.cards.find((c) => c.kind === 'field' && c.team === 'pool' && c.role === role))
    .filter((c): c is CardDef => Boolean(c));
  const goalie = prototypeCards.cards.find((c) => c.kind === 'goalie' && c.team === 'pool');
  return [
    ...players.map((def) => ({
      def,
      toughness: def.kind === 'field' && def.role ? MOCK_TOUGHNESS[def.role] : undefined,
      cost: def.kind === 'field' ? Math.round((def.speed + def.shot + def.defense + def.faceoff) / 1.7) : 10,
    })),
    ...(goalie ? [{ def: goalie, cost: 11 }] : []),
  ];
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
      <p className="small">Every card at the 2.5" × 3.5" poker-card shape. Frame color comes from the card's magic family (for a player, their first Resonant's Affinity). The art is AI-generated placeholder art until commissioned art is ready.</p>
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

      <h2>Physical attack cards (draft, rules v0.17)</h2>
      <p className="small">
        From PLAN.md, not in the game yet. The frame is striped, with no magic, and colored by tier like a referee's
        cards: yellow for Minor, orange for Major, red for Brutal. The little card on the type line shows the penalty turns.
      </p>
      <div className="card-row">
        {physicalCards.map((def) => <CardFace key={def.id} def={def} width={260} />)}
      </div>

      <h2>Players with Toughness and cost (mock values, rules v0.17)</h2>
      <p className="small">
        Toughness follows the plan's table by player type. The costs are made up for the layout; real costs come from
        measured win rates.
      </p>
      <div className="card-row">
        {mockPlayers().map(({ def, toughness, cost }) => <CardFace key={def.id} def={def} toughness={toughness} cost={cost} width={260} />)}
      </div>
    </main>
  );
}
