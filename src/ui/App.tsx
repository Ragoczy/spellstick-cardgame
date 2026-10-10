import { useEffect, useState } from 'react';
import { prototypeCards } from '../data/prototype';
import { Account } from './Account';
import { IN_DISCORD, MENU_PRESENCE, setDiscordPresence } from './discord';
import { ONLINE, type Me } from './online';
import { OnlineLobby, OnlineMatchScreen } from './OnlineLobby';
import { TeamColors } from './Card';
import { LocalGameScreen } from './GameScreen';
import { FutureFeatures } from './FutureFeatures';
import { HowToPlay } from './HowToPlay';
import { ReportProblem } from './ReportProblem';
import type { SessionOptions } from './session';

type Screen =
  | { kind: 'start' } | { kind: 'rules' } | { kind: 'future' } | { kind: 'game'; options: SessionOptions; id: number }
  // Online build only: your matches, and one match.
  | { kind: 'lobby' } | { kind: 'match'; id: number };

const teamColors = Object.fromEntries(prototypeCards.teams.map((t) => [t.id, t.color]));

/** ?autoplay=1 plays your side with the hint: handy for testing and for watching a game. */
const autoplay = new URLSearchParams(window.location.search).get('autoplay') === '1';

/** A seed from the address bar (?seed=123) makes a game repeatable; otherwise it's random. */
function newSeed(): number {
  const fromUrl = Number(new URLSearchParams(window.location.search).get('seed'));
  return Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : Math.floor(Math.random() * 1_000_000);
}

/** Online build: ?match=123 opens that match (links from Discord, later). */
function firstScreen(): Screen {
  const id = Number(new URLSearchParams(window.location.search).get('match'));
  return ONLINE && Number.isInteger(id) && id > 0 ? { kind: 'match', id } : { kind: 'start' };
}

export function App() {
  const [screen, setScreen] = useState<Screen>(firstScreen);
  /** Online build: the signed-in player (null when signed out or still checking). */
  const [me, setMe] = useState<Me | null>(null);
  const [lanes, setLanes] = useState(2);
  const [team, setTeam] = useState(prototypeCards.teams[0]!.id);

  // Inside Discord: game screens set their own presence; everything else is "In the menu".
  const inGame = screen.kind === 'game' || screen.kind === 'match';
  useEffect(() => {
    if (!inGame) setDiscordPresence(MENU_PRESENCE);
  }, [inGame]);

  const start = () => setScreen({ kind: 'game', id: Date.now(), options: { seed: newSeed(), cardSet: prototypeCards, lanes, team } });

  return (
    <TeamColors.Provider value={teamColors}>
      <main className={screen.kind === 'game' || screen.kind === 'match' ? 'app app-game' : 'app'}>
        {screen.kind === 'start' ? (
          <div className="screen start">
            <h1>Spellstick</h1>
            <p className="tagline">Magical lacrosse from the Warlock series. Hide your best players, pass to find the gaps, and let the spells fly.</p>
            {ONLINE && !IN_DISCORD ? <Account onChange={setMe} /> : null}
            {ONLINE && IN_DISCORD ? <p className="small">Online matches aren't available inside Discord yet. Open the game in your browser to play other readers.</p> : null}
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
              {ONLINE && me?.displayName ? <button type="button" className="primary" onClick={() => setScreen({ kind: 'lobby' })}>Play online</button> : null}
              <button type="button" onClick={() => setScreen({ kind: 'rules' })}>How to play</button>
            </div>
            <p className="small">Prototype: card names, teams, and art are placeholders.</p>
            <button type="button" className="quiet" onClick={() => setScreen({ kind: 'future' })}>Future features</button>
          </div>
        ) : null}
        {screen.kind === 'rules' ? <HowToPlay onBack={() => setScreen({ kind: 'start' })} reporter={me} /> : null}
        {screen.kind === 'future' ? <FutureFeatures onBack={() => setScreen({ kind: 'start' })} /> : null}
        {screen.kind === 'lobby' ? (
          <OnlineLobby onOpen={(id) => setScreen({ kind: 'match', id })} onBack={() => setScreen({ kind: 'start' })} />
        ) : null}
        {screen.kind === 'match' ? (
          <OnlineMatchScreen key={screen.id} matchId={screen.id} onBack={() => { clearMatchLink(); setScreen({ kind: 'lobby' }); }} />
        ) : null}
        {screen.kind === 'game' ? (
          <LocalGameScreen key={screen.id} options={screen.options} autoplay={autoplay} onQuit={() => setScreen({ kind: 'start' })} />
        ) : null}
        {!inGame ? (
          <footer className="footer">
            {ONLINE ? <a className="quiet" href="privacy.html">Privacy</a> : null}
            <ReportProblem reporter={me} />
          </footer>
        ) : null}
      </main>
    </TeamColors.Provider>
  );
}

/** Takes ?match= out of the address bar, so reloading the page doesn't jump back into the match. */
function clearMatchLink(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('match')) return;
  params.delete('match');
  const query = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
}
