// Plain-language names for positions, stats, and elements, from the person's point of view.

import type { Area, CardDef, StatName } from '../engine';
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

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The rules text for a card, or a generated one if the card has none. */
export function cardText(def: CardDef): string {
  if (def.text) return def.text;
  if (def.kind === 'spell') return def.ability.effect;
  return '';
}
