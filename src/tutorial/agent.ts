// The tutorial's computer opponent. For setup it puts out the scenario's goalie and lineup,
// through the same legal actions as any player; after that it's the normal heuristic agent,
// seeing only its own view (CLAUDE.md rule 5). The weaker cards are the handicap, not the play.

import type { Agent } from '../ai/agent';
import { heuristicAgent } from '../ai/heuristic';
import type { Action, GameConfig } from '../engine';
import type { TutorialTeam } from './scenario';

/** The legal setup action that matches the scenario, if this is a setup decision. */
export function scenarioSetupAction(team: TutorialTeam, view: Parameters<Agent['chooseAction']>[0], legal: Action[]): Action | null {
  const idOf = (uid: string) => view.mine.hand.find((c) => c.uid === uid)?.def.id;
  if (view.pending.kind === 'chooseGoalie') {
    return legal.find((a) => a.type === 'chooseGoalie' && idOf(a.card) === team.goalie) ?? null;
  }
  if (view.pending.kind === 'placeLineup') {
    return legal.find((a) => a.type === 'place' && idOf(a.card) === team.lineup[a.pos.area]?.[a.pos.lane]) ?? null;
  }
  return null;
}

export function tutorialAgent(seed: number, config: GameConfig, team: TutorialTeam): Agent {
  const ai = heuristicAgent(seed, config);
  return {
    name: 'tutorial',
    chooseAction(view, legal) {
      return scenarioSetupAction(team, view, legal) ?? ai.chooseAction(view, legal);
    },
  };
}
