// A player controlled by code. It gets exactly what a human would: its own view of the table
// and the list of legal actions. It never gets the raw game state.

import type { Action } from '../engine/actions';
import type { PlayerView } from '../engine/view';

export interface Agent {
  name: string;
  chooseAction(view: PlayerView, legal: Action[]): Action;
}
