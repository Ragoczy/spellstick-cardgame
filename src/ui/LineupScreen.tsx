// Setting out your lineup face down. Placements are arranged here first and only sent to the
// game when you press Ready, so you can change your mind.

import { useState } from 'react';
import { allFieldPositions, type Action, type Area, type FieldPos, type PlayerView } from '../engine';
import { Card } from './Card';
import { capitalize, laneName, roleName } from './labels';

const ROWS: Area[] = ['forward', 'midfield', 'defense'];

const ROLE_TIP: Record<Area, string> = {
  forward: 'Speed to catch passes, Shot to score.',
  midfield: 'Faceoff to win the ball, Speed to catch passes.',
  defense: 'Defense to intercept and tackle.',
};

const key = (pos: FieldPos) => `${pos.area}:${pos.lane}`;

export function LineupScreen({ view, legal, onPlace, onAuto }: {
  view: PlayerView;
  legal: Action[];
  onPlace: (actions: Action[]) => void;
  onAuto: () => void;
}) {
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string | null>(null);

  const placeable = new Set(legal.filter((a) => a.type === 'place').map((a) => (a as Extract<Action, { type: 'place' }>).card));
  const fieldCards = view.mine.hand.filter((c) => placeable.has(c.uid));
  const placedUids = new Set(Object.values(placed));
  const unplaced = fieldCards.filter((c) => !placedUids.has(c.uid));
  const others = view.mine.hand.filter((c) => !placeable.has(c.uid));
  const spots = allFieldPositions(view.lanes);
  const done = spots.every((pos) => placed[key(pos)]);

  const tapSpot = (pos: FieldPos) => {
    const k = key(pos);
    if (picked) {
      setPlaced({ ...Object.fromEntries(Object.entries(placed).filter(([, uid]) => uid !== picked)), [k]: picked });
      setPicked(null);
    } else if (placed[k]) {
      const { [k]: _removed, ...rest } = placed;
      setPlaced(rest);
    }
  };

  const ready = () => {
    const side = view.me;
    onPlace(spots.map((pos) => ({ type: 'place', side, card: placed[key(pos)]!, pos })));
  };

  const cardFor = (uid: string) => view.mine.hand.find((c) => c.uid === uid)!.def;

  return (
    <div className="screen setup lineup">
      <h2>Set out your lineup</h2>
      <p>
        Tap a player, then tap a spot. Your players go face down, so your opponent can't see who is where.
        Tap a placed player to take them back.
      </p>
      <div className="lineup-grid" style={{ ['--lanes' as string]: view.lanes }}>
        {ROWS.map((area) => (
          <div className="lineup-row" key={area}>
            <div className="row-label">{capitalize(roleName(area))}s · {ROLE_TIP[area]}</div>
            <div className="lanes">
              {Array.from({ length: view.lanes }, (_, lane) => {
                const pos: FieldPos = { area, lane };
                const uid = placed[key(pos)];
                return uid ? (
                  <Card key={lane} def={cardFor(uid)} onClick={() => tapSpot(pos)} />
                ) : (
                  <button type="button" key={lane} className={`card empty-spot ${picked ? 'hl-target' : ''}`} onClick={() => tapSpot(pos)}>
                    {capitalize(laneName(lane, view.lanes))} {roleName(area)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="buttons">
        <button type="button" className="primary" disabled={!done} onClick={ready}>Ready</button>
        <button type="button" onClick={onAuto}>Place them for me</button>
      </div>
      <h3>Your field players</h3>
      <div className="hand">
        {unplaced.map((c) => <Card key={c.uid} def={c.def} showText selected={picked === c.uid} onClick={() => setPicked(picked === c.uid ? null : c.uid)} />)}
      </div>
      {others.length ? (
        <>
          <h3>The rest of your hand</h3>
          <div className="hand">{others.map((c) => <Card key={c.uid} def={c.def} showText />)}</div>
        </>
      ) : null}
    </div>
  );
}
