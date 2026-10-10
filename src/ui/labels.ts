// Plain-language names for positions, stats, and elements, from the person's point of view.

import type { Area, CardDef, InjuryDef, StatName } from '../engine';
import type { Pos } from '../engine';

export function laneName(lane: number, lanes: number): string {
  if (lanes === 2) return lane === 0 ? 'left' : 'right';
  if (lanes === 3) return ['left', 'center', 'right'][lane] ?? `lane ${lane + 1}`;
  return `lane ${lane + 1}`;
}

const ROLE: Record<Area | 'goal', string> = { goal: 'goalie', defense: 'defender', midfield: 'midfielder', forward: 'forward' };

export function roleName(area: Area | 'goal'): string {
  return ROLE[area];
}

/** "left forward", "goalie". */
export function posName(pos: Pos, lanes: number): string {
  return pos.area === 'goal' ? 'goalie' : `${laneName(pos.lane, lanes)} ${ROLE[pos.area]}`;
}

export const STAT_LABEL: Record<StatName, string> = {
  speed: 'Speed', shot: 'Shot', defense: 'Defense', faceoff: 'Faceoff', save: 'Save',
};

export const STAT_SHORT: Record<StatName, string> = {
  speed: 'Spd', shot: 'Sht', defense: 'Def', faceoff: 'Fo', save: 'Save',
};

/** Colors for placeholder elements. Unknown elements get grey. */
const ELEMENT_COLOR: Record<string, string> = {
  fire: '#d9572b', water: '#2f7fd1', earth: '#7a8b2e', air: '#8fa6b8',
};

export function elementColor(element: string | null): string {
  return element ? ELEMENT_COLOR[element] ?? '#888' : '#888';
}

/** "−1 Speed", "−2 Save", or "−1 to all stats". A goalie loses the biggest penalty from Save. */
export function injuryEffect(injury: InjuryDef, def?: CardDef): string {
  const entries = Object.entries(injury.penalty).filter(([, n]) => n);
  if (def?.kind === 'goalie') return `−${Math.max(...entries.map(([, n]) => n!))} Save`;
  if (entries.length >= 4) return `−${entries[0]![1]} to all stats`;
  return entries.map(([stat, n]) => `−${n} ${STAT_LABEL[stat as StatName]}`).join(', ');
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The rules text for a card, or a generated one if the card has none. */
export function cardText(def: CardDef): string {
  if (def.text) return def.text;
  if (def.kind === 'spell') return def.ability.effect;
  return '';
}

/** Time left in a time bank: "35 h 12 m", or "4:05" under an hour. */
export function clockText(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} h ${minutes} m`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
