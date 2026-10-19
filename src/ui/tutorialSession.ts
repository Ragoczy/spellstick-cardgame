// A tutorial game (docs/tutorial-design.md): a game against the computer built from a fixed
// scenario, with the coach watching the person's side. The coach's suggestion is also the
// "hint", so "Place them for me" and the like follow the coach.

import type { Action, CardSet, GameEvent } from '../engine';
import { scenarioSetupAction, tutorialAgent } from '../tutorial/agent';
import { TutorialCoach, type CoachTip, type Lesson } from '../tutorial/lessons';
import { coachOptions, computerSeed } from '../tutorial/play';
import { TUTORIAL, tutorialConfig, tutorialSetup, type TutorialScenario } from '../tutorial/scenario';
import { GameSession } from './session';

/** Browser storage key: a tutorial has been played to the end in this browser. */
function doneKey(id: string): string {
  return id === TUTORIAL.id ? 'spellstick.tutorialDone' : `spellstick.tutorialDone.${id}`;
}

/** Whether this browser has finished a tutorial (false if storage is unavailable). */
export function tutorialDone(id: string = TUTORIAL.id): boolean {
  try {
    return window.localStorage.getItem(doneKey(id)) === '1';
  } catch {
    return false;
  }
}

export function markTutorialDone(id: string = TUTORIAL.id): void {
  try {
    window.localStorage.setItem(doneKey(id), '1');
  } catch {
    // Private windows and blocked storage: the start screen just keeps suggesting the tutorial.
  }
}

export class TutorialSession extends GameSession {
  readonly coach: TutorialCoach;
  /**
   * What the coach has said since the person's last move: a comment on that move (if it wasn't
   * the suggestion), then notes about what happened. Oldest first.
   */
  notes: Lesson[] = [];

  constructor(cardSet: CardSet, readonly scenario: TutorialScenario = TUTORIAL) {
    const setup = tutorialSetup(cardSet, undefined, scenario);
    super({ setup, ai: tutorialAgent(computerSeed(setup.seed), tutorialConfig(scenario), scenario.computer) });
    this.coach = new TutorialCoach(coachOptions(scenario));
    // The second tutorial starts at the faceoff: both teams are put out as the scenario lists.
    if (scenario.setupDone) {
      const setupKinds = ['chooseGoalie', 'placeLineup'];
      while (setupKinds.includes(this.view.pending.kind)) {
        if (this.waitingFor === 'human') super.act(scenarioSetupAction(scenario.player, this.view, this.legal)!);
        else super.computerStep();
      }
    }
  }

  /** The coach's tip for the person's current decision, or null while it's the computer's. */
  tip(): CoachTip | null {
    return this.waitingFor === 'human' ? this.coach.tip(this.view, this.legal) : null;
  }

  override hint(): Action | null {
    return this.tip()?.suggestion?.action ?? null;
  }

  override act(action: Action): GameEvent[] {
    const comment = this.coach.chose(this.view, this.legal, action);
    const events = super.act(action);
    this.notes = [...(comment ? [{ id: 'comment', title: '', text: comment }] : []), ...this.coach.observe(events, this.view)];
    return events;
  }

  override computerStep(): GameEvent[] {
    const events = super.computerStep();
    this.notes = [...this.notes, ...this.coach.observe(events, this.view)];
    return events;
  }

  dismissNotes(): void {
    this.notes = [];
  }
}
