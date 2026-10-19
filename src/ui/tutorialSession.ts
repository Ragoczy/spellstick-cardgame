// The tutorial game (docs/tutorial-design.md): a game against the computer built from the fixed
// scenario, with the coach watching the person's side. The coach's suggestion is also the
// "hint", so "Place them for me" and the like follow the coach.

import type { Action, CardSet, GameEvent } from '../engine';
import { tutorialAgent } from '../tutorial/agent';
import { TutorialCoach, type CoachTip, type Lesson } from '../tutorial/lessons';
import { coachOptions, computerSeed } from '../tutorial/play';
import { TUTORIAL, tutorialConfig, tutorialSetup } from '../tutorial/scenario';
import { GameSession } from './session';

/** Browser storage key: the tutorial has been played to the end in this browser. */
const DONE_KEY = 'spellstick.tutorialDone';

/** Whether this browser has finished the tutorial (false if storage is unavailable). */
export function tutorialDone(): boolean {
  try {
    return window.localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialDone(): void {
  try {
    window.localStorage.setItem(DONE_KEY, '1');
  } catch {
    // Private windows and blocked storage: the start screen just keeps suggesting the tutorial.
  }
}

export class TutorialSession extends GameSession {
  readonly coach = new TutorialCoach(coachOptions());
  /**
   * What the coach has said since the person's last move: a comment on that move (if it wasn't
   * the suggestion), then notes about what happened. Oldest first.
   */
  notes: Lesson[] = [];

  constructor(cardSet: CardSet) {
    const setup = tutorialSetup(cardSet);
    super({ setup, ai: tutorialAgent(computerSeed(setup.seed), tutorialConfig(), TUTORIAL.computer) });
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
