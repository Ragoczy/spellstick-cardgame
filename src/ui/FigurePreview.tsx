// Dev preview of the player figures: every position in every magic family color, healthy and
// injured, at several sizes, and on real cards. Open the game with ?figures in the address
// (for example http://localhost:5173/?figures).

import { prototypeCards } from '../data/prototype';
import { DEFAULT_CONFIG, familyOf, type CardDef } from '../engine';
import { Card, TeamColors } from './Card';
import { capitalize, magicLabel, roleName } from './labels';
import { PlayerFigure, type FigurePosition } from './PlayerFigure';

const POSITIONS: FigurePosition[] = ['forward', 'midfield', 'defense', 'goal'];
/** Every magic family in the card data, then "none" (grey). */
const FAMILIES: (string | null)[] = [...prototypeCards.families, null];
const SIZES = [96, 48, 34, 27, 20];

const teamColors = Object.fromEntries(prototypeCards.teams.map((t) => [t.id, t.color]));
const injury = DEFAULT_CONFIG.injuries[0]!;

/** A field player whose first Resonant's Affinity is in this family, and a goalie. */
function sampleCards(family: string): { field?: CardDef; goalie?: CardDef } {
  const first = (kind: 'field' | 'goalie') =>
    prototypeCards.cards.find((c) => c.kind === kind && familyOf(c.resonants[0]?.affinity ?? '') === family);
  return { field: first('field'), goalie: first('goalie') };
}

function familyLabel(family: string | null): string {
  return family ? magicLabel(family) : 'None';
}

function FigureGrid({ injured, dark }: { injured?: boolean; dark?: boolean }) {
  return (
    <table className={`figure-grid ${dark ? 'dark' : ''}`}>
      <thead>
        <tr>
          <th />
          {FAMILIES.map((e) => <th key={e ?? 'none'}>{familyLabel(e)}</th>)}
        </tr>
      </thead>
      <tbody>
        {POSITIONS.map((pos) => (
          <tr key={pos}>
            <th>{capitalize(roleName(pos))}</th>
            {FAMILIES.map((e) => (
              <td key={e ?? 'none'}>
                <PlayerFigure position={pos} magic={e} injured={injured} title={`${familyLabel(e)} ${roleName(pos)}${injured ? ', injured' : ''}`} />
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
          once in styles.css (--fam-fire and so on). <a href="./">Back to the game</a>
        </p>

        <h2>Every position, every magic family</h2>
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
                <PlayerFigure position={pos} magic={prototypeCards.families[0] ?? null} />
              </span>
            ))}
          </div>
        ))}

        <h2>On cards</h2>
        <p className="small">On the field, a player is drawn in the position they stand in. In hand, they're drawn in the position their type suits best.</p>
        {prototypeCards.families.map((family) => {
          const { field, goalie } = sampleCards(family);
          return (
            <div key={family}>
              <h3>{familyLabel(family)}</h3>
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
