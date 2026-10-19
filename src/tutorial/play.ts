// Playing whole tutorial games without a screen: for choosing the seed (scripts/tutorial-seed.ts)
// and for tests. The person's side can be played by the coach (always taking its suggestion) or
// by any other agent, to see how the tutorial goes for someone who ignores the coach.

import type { Agent } from '../ai/agent';
import { runGame, type GameRecord } from '../ai/runGame';
import { eventsFor, viewFor, type CardSet } from '../engine';
import { tutorialAgent } from './agent';
import { LESSON_IDS, TutorialCoach } from './lessons';
import { TUTORIAL, TUTORIAL_COMPUTER, TUTORIAL_HUMAN, tutorialConfig, tutorialSetup, type TutorialScenario } from './scenario';

/** The coach's options for a scenario: the person's suggested goalie and lineup. */
export function coachOptions(scenario: TutorialScenario = TUTORIAL) {
  return { goalie: scenario.player.goalie, lineup: scenario.player.lineup };
}

/** A player who always does what the coach suggests. */
export function coachedAgent(coach: TutorialCoach): Agent {
  return {
    name: 'coached',
    chooseAction(view, legal) {
      const action = coach.tip(view, legal).suggestion?.action ?? legal[0]!;
      coach.chose(view, legal, action);
      return action;
    },
  };
}

/** The seed for the computer player in a tutorial game with this game seed. */
export const computerSeed = (seed: number) => seed + 1;

export interface TutorialResult {
  seed: number;
  record: GameRecord;
  coach: TutorialCoach;
  won: boolean;
  score: { A: number; B: number };
  turns: number;
  faceoffWon: boolean;
  firstPassCaught: boolean;
  /** The turn of the person's first goal (null if none). */
  firstGoalTurn: number | null;
  /** The computer passed or shot and the person stopped it. */
  defended: boolean;
  /** The person played a reaction spell. */
  reacted: boolean;
  /** The person played a reaction spell with an affinity for its caster. */
  affinityUsed: boolean;
  /** The person won a tackle. */
  tackled: boolean;
  /** How many lessons and notes the coach got to teach. */
  taught: number;
}

/** Plays one tutorial game. With no agent given, the person's side follows the coach. */
export function playTutorial(cardSet: CardSet, seed: number, human?: Agent, scenario: TutorialScenario = TUTORIAL): TutorialResult {
  const config = tutorialConfig(scenario);
  const coach = new TutorialCoach(coachOptions(scenario));
  const agents = {
    [TUTORIAL_HUMAN]: human ?? coachedAgent(coach),
    [TUTORIAL_COMPUTER]: tutorialAgent(computerSeed(seed), config, scenario.computer),
  } as Record<'A' | 'B', Agent>;
  const record = runGame(tutorialSetup(cardSet, seed, scenario), agents, {
    onStep: (state, _action, events) => { coach.observe(eventsFor(events, TUTORIAL_HUMAN), viewFor(state, TUTORIAL_HUMAN)); },
  });

  const me = TUTORIAL_HUMAN;
  let turn = 0;
  let firstGoalTurn: number | null = null;
  let faceoffWon: boolean | null = null;
  let firstPassCaught: boolean | null = null;
  let defended = false;
  let reacted = false;
  let affinityUsed = false;
  let tackled = false;
  for (const e of record.events) {
    if (e.type === 'turnStarted') turn = e.turn;
    if (e.type === 'goal' && e.side === me && firstGoalTurn === null) firstGoalTurn = turn;
    if (e.type === 'spellCast' && e.side === me && e.card.def.kind === 'spell' && e.card.def.spellType === 'reaction') {
      reacted = true;
      if (e.affinity === 'match' || e.affinity === 'specialist') affinityUsed = true;
    }
    if (e.type !== 'contestResolved') continue;
    if (e.kind === 'faceoff' && faceoffWon === null) faceoffWon = e.winner === me;
    if (e.kind === 'pass' && e.attacker.side === me && firstPassCaught === null) firstPassCaught = e.winner === me;
    if ((e.kind === 'pass' || e.kind === 'shot') && e.attacker.side !== me && e.winner === me) defended = true;
    if (e.kind === 'tackle' && e.attacker.side === me && e.winner === me) tackled = true;
  }
  const taught = [...LESSON_IDS, ...NOTE_IDS].filter((id) => coach.hasTaught(id)).length;
  return {
    seed, record, coach,
    won: record.final.result?.winner === me,
    score: { ...record.final.score },
    turns: record.final.turn,
    faceoffWon: !!faceoffWon,
    firstPassCaught: !!firstPassCaught,
    firstGoalTurn,
    defended, reacted, affinityUsed, tackled, taught,
  };
}

/** Notes the coach can make after events (see notesFor in lessons.ts). */
export const NOTE_IDS = [
  'their-weak', 'caught-forward', 'intercepted', 'you-intercepted', 'saved', 'goal-mine', 'goal-theirs',
  'knocked-down', 'shaken', 'injured', 'their-spell', 'out-of-spells', 'game-over',
];

/**
 * Whether a seed gives a good first game when the coach is followed (docs/tutorial-design.md,
 * "Choosing the seed"). Returns the reasons it doesn't, empty when it does.
 */
export function seedProblems(r: TutorialResult): string[] {
  const problems: string[] = [];
  if (!r.won) problems.push('the person loses');
  if (!r.faceoffWon) problems.push('the opening faceoff is lost');
  if (!r.firstPassCaught) problems.push('the first pass is intercepted');
  if (r.firstGoalTurn === null || r.firstGoalTurn > 10) problems.push('no goal by turn 10');
  if (!r.defended) problems.push('the person never stops one of their passes or shots');
  if (!r.reacted) problems.push('the person never plays a reaction spell');
  if (!r.affinityUsed) problems.push('the person never plays a spell with an affinity');
  if (r.turns < 16 || r.turns > 30) problems.push(`the game takes ${r.turns} turns`);
  return problems;
}

/** Higher is better, among seeds with no problems: more taught, a tackle, an early goal, a close game. */
export function seedScore(r: TutorialResult): number {
  return r.taught * 2 + (r.tackled ? 3 : 0) + (r.firstGoalTurn !== null ? 10 - r.firstGoalTurn : 0) + (r.score.B > 0 ? 2 : 0) - Math.abs(r.turns - 22) / 2;
}
