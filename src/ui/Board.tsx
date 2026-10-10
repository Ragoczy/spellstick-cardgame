// The field: five rows, with your goal at the bottom. Each spot in rows 2–4 shows the
// opponent's player (top) facing yours (bottom).

import type { Area, FieldPos, PlayerView, Pos, Side, SlotView } from '../engine';
import { opposite, samePos } from '../engine';
import { Card, CardBack, type CardProps } from './Card';
import { laneName, roleName } from './labels';
import { posKey } from './useGame';

export interface BoardProps {
  view: PlayerView;
  teams: Record<Side, string>;
  highlights: Map<string, CardProps['highlight']>;
  selectedKey: string | null;
  justRevealed: Set<string>;
  onSpot: (side: Side, pos: Pos) => void;
}

function Spot({ slot, side, pos, team, props }: { slot: SlotView; side: Side; pos: Pos; team: string; props: BoardProps }) {
  const key = posKey(side, pos);
  const hasBall = props.view.ball?.side === side && samePos(props.view.ball.pos, pos);
  const common = {
    hasBall,
    highlight: props.highlights.get(key) ?? null,
    selected: props.selectedKey === key,
    flip: props.justRevealed.has(key),
    onClick: () => props.onSpot(side, pos),
  };
  if (slot.state === 'empty') {
    // Only during play: a player was carried off with nobody to replace them.
    return (
      <button type="button" className={`card empty ${common.highlight ? `hl-${common.highlight}` : ''}`} onClick={common.onClick}>
        {props.view.turn > 0 ? <span className="empty-label">Empty</span> : null}
      </button>
    );
  }
  if (slot.state === 'unknown') return <CardBack team={team} injury={slot.injury} {...common} />;
  // Casting limit: each Resonant is worth castsPerResonant spells, so a dot goes hollow per that many cast.
  const def = slot.card.def;
  const perResonant = props.view.config.castsPerResonant;
  const usedDots = slot.castsLeft !== undefined && def.kind !== 'spell'
    ? def.resonants.length - Math.ceil(slot.castsLeft / perResonant)
    : 0;
  return (
    <Card def={def} injury={slot.card.injury} faceDown={slot.state === 'faceDown'} scried={slot.state === 'faceDown' && slot.scried}
      images={slot.state === 'revealed' && slot.images} castsLeft={slot.castsLeft} usedDots={usedDots} cameOn={slot.cameOn} {...common} />
  );
}

export function Board(props: BoardProps) {
  const { view, teams } = props;
  const me = view.me;
  const them: Side = me === 'A' ? 'B' : 'A';
  const lanes = Array.from({ length: view.lanes }, (_, i) => i);
  const goal: Pos = { area: 'goal' };

  // My rows from the far end of the field to my goal.
  const rows: Area[] = ['forward', 'midfield', 'defense'];

  return (
    <div className="board" style={{ ['--lanes' as string]: view.lanes }}>
      <div className="goal-row">
        <span className="row-label">Their goal</span>
        <div className="goal-spot">
          <Spot slot={view.opponent.goalie} side={them} pos={goal} team={teams[them]} props={props} />
        </div>
      </div>
      {rows.map((area) => (
        <div className="field-row" key={area}>
          <span className="row-label">
            Your {roleName(area)}s · their {roleName(opposite({ area, lane: 0 }).area)}s
          </span>
          <div className="lanes">
            {lanes.map((lane) => {
              const mine: FieldPos = { area, lane };
              const theirs = opposite(mine);
              return (
                <div className="spot" key={lane} aria-label={`${laneName(lane, view.lanes)} lane`}>
                  <Spot slot={view.opponent.lineup[theirs.area][lane]!} side={them} pos={theirs} team={teams[them]} props={props} />
                  <Spot slot={view.mine.lineup[area][lane]!} side={me} pos={mine} team={teams[me]} props={props} />
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="goal-row">
        <span className="row-label">Your goal</span>
        <div className="goal-spot">
          <Spot slot={view.mine.goalie} side={me} pos={goal} team={teams[me]} props={props} />
        </div>
      </div>
    </div>
  );
}
