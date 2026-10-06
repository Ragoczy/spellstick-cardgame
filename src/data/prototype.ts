// The prototype card set, checked and typed.

import raw from '../../data/cards.prototype.json';
import { loadCardSet } from '../engine/cards';

export const prototypeCards = loadCardSet(raw);
