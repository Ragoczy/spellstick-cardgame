import { useState } from 'react';
import { prototypeCards } from '../data/prototype';
import { TeamColors } from './Card';
import { GameScreen } from './GameScreen';
import { HowToPlay } from './HowToPlay';
import type { SessionOptions } from './session';

type Screen = { kind: 'start' } | { kind: 'rules' } | { kind: 'game'; options: SessionOptions; id: number };

const teamColors = Object.fromEntries(prototypeCards.teams.map((t) => [t.id, t.color]));

/** ?autoplay=1 plays your side with the hint: handy for testing and for watching a game. */
const autoplay = new URLSearchParams(window.location.search).get('autoplay') === '1';

/** A seed from the address bar (?seed=123) makes a game repeatable; otherwise it's random. */
function newSeed(): number {
  const fromUrl = Number(new URLSearchParams(window.location.search).get('seed'));
  return Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : Math.floor(Math.random() * 1_000_000);
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'start' });
  const [lanes, setLanes] = useState(2);
  const [team, setTeam] = useState(prototypeCards.teams[0]!.id);

  const start = () => setScreen({ kind: 'game', id: Date.now(), options: { seed: newSeed(), cardSet: prototypeCards, lanes, team } });

  return (
    <TeamColors.Provider value={teamColors}>
      <main className={screen.kind === 'game' ? 'app app-game' : 'app'}>
        {screen.kind === 'start' ? (
          <div className="screen start">
            <h1>Spellstick</h1>
            <p className="tagline">Magical lacrosse from the Warlock series. Hide your best players, pass to find the gaps, and let the spells fly.</p>
            <div className="options">
              <label>
                Your team
                <select value={team} onChange={(e) => setTeam(e.target.value)}>
                  {prototypeCards.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label>
                Field
                <select value={lanes} onChange={(e) => setLanes(Number(e.target.value))}>
                  <option value={2}>Two lanes (base game)</option>
                  <option value={3}>Three lanes (center-lane add-on)</option>
                </select>
              </label>
            </div>
            <div className="buttons">
              <button type="button" className="primary" onClick={start}>Play against the computer</button>
              <button type="button" onClick={() => setScreen({ kind: 'rules' })}>How to play</button>
            </div>
            <p className="small">Prototype: card names, teams, and art are placeholders.</p>
          </div>
        ) : null}
        {screen.kind === 'rules' ? <HowToPlay onBack={() => setScreen({ kind: 'start' })} /> : null}
        {screen.kind === 'game' ? (
          <GameScreen key={screen.id} options={screen.options} autoplay={autoplay} onQuit={() => setScreen({ kind: 'start' })} />
        ) : null}
      </main>
    </TeamColors.Provider>
  );
}
