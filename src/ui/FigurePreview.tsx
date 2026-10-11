// Dev preview of the player figures: every position in every element color, healthy and
// injured, at several sizes, and on real cards. Open the game with ?figures in the address
// (for example http://localhost:5173/?figures).

import { prototypeCards } from '../data/prototype';
import { DEFAULT_CONFIG, type CardDef } from '../engine';
import { Card, TeamColors } from './Card';
import { capitalize, roleName } from './labels';
import { PlayerFigure, type FigurePosition } from './PlayerFigure';

const POSITIONS: FigurePosition[] = ['forward', 'midfield', 'defense', 'goal'];
/** Every element in the card data, then "no element" (grey). */
const ELEMENTS: (string | null)[] = [...prototypeCards.elements, null];
const SIZES = [96, 48, 34, 27, 20];

const teamColors = Object.fromEntries(prototypeCards.teams.map((t) => [t.id, t.color]));
const injury = DEFAULT_CONFIG.injuries[0]!;

/** A field player whose first Resonant has this element, and a goalie. */
function sampleCards(element: string): { field?: CardDef; goalie?: CardDef } {
  const first = (kind: 'field' | 'goalie') =>
    prototypeCards.cards.find((c) => c.kind === kind && c.resonants[0]?.affinity === element);
  return { field: first('field'), goalie: first('goalie') };
}

function elementLabel(element: string | null): string {
  return element ? capitalize(element) : 'No element';
}

function FigureGrid({ injured, dark }: { injured?: boolean; dark?: boolean }) {
  return (
    <table className={`figure-grid ${dark ? 'dark' : ''}`}>
      <thead>
        <tr>
          <th />
          {ELEMENTS.map((e) => <th key={e ?? 'none'}>{elementLabel(e)}</th>)}
        </tr>
      </thead>
      <tbody>
        {POSITIONS.map((pos) => (
          <tr key={pos}>
            <th>{capitalize(roleName(pos))}</th>
            {ELEMENTS.map((e) => (
              <td key={e ?? 'none'}>
                <PlayerFigure position={pos} element={e} injured={injured} title={`${elementLabel(e)} ${roleName(pos)}${injured ? ', injured' : ''}`} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FigurePreview() {
  return (
    <TeamColors.Provider value={teamColors}>
      <main className="app figure-preview">
        <h1>Player figures</h1>
        <p className="small">
          Placeholder art: one pictogram per position, colored by the player's first Resonant. Colors are set
          once in styles.css (--el-fire and so on). <a href="./">Back to the game</a>
        </p>

        <h2>Every position, every element</h2>
        <FigureGrid />

        <h2>Injured</h2>
        <FigureGrid injured />

        <h2>On the field</h2>
        <FigureGrid dark />

        <h2>Sizes</h2>
        <p className="small">96, 48, 34 (cards on a computer), 27 (cards on a phone), and 20 pixels.</p>
        {POSITIONS.map((pos) => (
          <div className="figure-sizes" key={pos}>
            {SIZES.map((size) => (
              <span key={size} style={{ width: size, height: size }}>
                <PlayerFigure position={pos} element={prototypeCards.elements[0] ?? null} />
              </span>
            ))}
          </div>
        ))}

        <h2>On cards</h2>
        <p className="small">On the field, a player is drawn in the position they stand in. In hand, they're drawn in the position their type suits best.</p>
        {prototypeCards.elements.map((element) => {
          const { field, goalie } = sampleCards(element);
          return (
            <div key={element}>
              <h3>{capitalize(element)}</h3>
              <div className="hand">
                {field ? (['forward', 'midfield', 'defense'] as const).map((pos) => <Card key={pos} def={field} position={pos} />) : null}
                {goalie ? <Card def={goalie} /> : null}
                {field ? <Card def={field} injury={injury} position="forward" /> : null}
                {field ? <Card def={field} faceDown position="midfield" /> : null}
                {field ? <Card def={field} showText /> : null}
              </div>
            </div>
          );
        })}
      </main>
    </TeamColors.Provider>
  );
}
