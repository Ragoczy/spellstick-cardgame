// Playing whole tutorial games without a screen: for choosing the seed (scripts/tutorial-seed.ts)
// and for tests. The person's side can be played by the coach (always taking its suggestion) or
// by any other agent, to see how the tutorial goes for someone who ignores the coach.

import type { Agent } from '../ai/agent';
import { runGame, type GameRecord } from '../ai/runGame';
import { eventsFor, viewFor, type CardSet } from '../engine';
import { tutorialAgent, withScenarioSetup } from './agent';
import { CONTACT_LESSON_IDS } from './contactLessons';
import { LESSON_IDS, TutorialCoach } from './lessons';
import { TUTORIAL, TUTORIAL_COMPUTER, TUTORIAL_HUMAN, tutorialConfig, tutorialSetup, type TutorialScenario } from './scenario';

/** The coach's options for a scenario: the person's suggested goalie and lineup, and its lessons. */
export function coachOptions(scenario: TutorialScenario = TUTORIAL) {
  return { goalie: scenario.player.goalie, lineup: scenario.player.lineup, lessons: scenario.lessons };
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
  /** Contact (the second tutorial): the person won a physical attack; the computer made one. */
  attackWon: boolean;
  theyAttacked: boolean;
  /** Each side declared a foul. */
  fouled: { A: boolean; B: boolean };
  /** Each side had a player sent off; someone went to the penalty box. */
  sentOff: { A: boolean; B: boolean };
  penalty: boolean;
  /** How many lessons and notes the coach got to teach. */
  taught: number;
}

/** Plays one tutorial game. With no agent given, the person's side follows the coach. */
export function playTutorial(cardSet: CardSet, seed: number, human?: Agent, scenario: TutorialScenario = TUTORIAL): TutorialResult {
  const config = tutorialConfig(scenario);
  const coach = new TutorialCoach(coachOptions(scenario));
  const player = human ?? coachedAgent(coach);
  const agents = {
    // When the scenario's setup is done for the person, their goalie and lineup are the scenario's.
    [TUTORIAL_HUMAN]: scenario.setupDone ? withScenarioSetup(player, scenario.player) : player,
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
  let attackWon = false;
  let theyAttacked = false;
  let penalty = false;
  const fouled = { A: false, B: false };
  const sentOff = { A: false, B: false };
  for (const e of record.events) {
    if (e.type === 'turnStarted') turn = e.turn;
    if (e.type === 'goal' && e.side === me && firstGoalTurn === null) firstGoalTurn = turn;
    if (e.type === 'spellCast' && e.foul) fouled[e.side] = true;
    if (e.type === 'spellCast' && e.side === me && !e.foul && e.card.def.kind === 'spell' && e.card.def.spellType === 'reaction') {
      reacted = true;
      if (e.affinity === 'match' || e.affinity === 'specialist') affinityUsed = true;
    }
    if (e.type === 'attackDeclared' && e.side !== me) theyAttacked = true;
    if (e.type === 'sentOff') sentOff[e.side] = true;
    if (e.type === 'penalized') penalty = true;
    if (e.type !== 'contestResolved') continue;
    if (e.kind === 'faceoff' && faceoffWon === null) faceoffWon = e.winner === me;
    if (e.kind === 'pass' && e.attacker.side === me && firstPassCaught === null) firstPassCaught = e.winner === me;
    if ((e.kind === 'pass' || e.kind === 'shot') && e.attacker.side !== me && e.winner === me) defended = true;
    if (e.kind === 'tackle' && e.attacker.side === me && e.winner === me) tackled = true;
    if (e.kind === 'attack' && e.attacker.side === me && e.winner === me) attackWon = true;
  }
  const ids = scenario.lessons === 'contact' ? [...CONTACT_LESSON_IDS, ...CONTACT_NOTE_IDS] : [...LESSON_IDS, ...NOTE_IDS];
  const taught = ids.filter((id) => coach.hasTaught(id)).length;
  return {
    seed, record, coach,
    won: record.final.result?.winner === me,
    score: { ...record.final.score },
    turns: record.final.turn,
    faceoffWon: !!faceoffWon,
    firstPassCaught: !!firstPassCaught,
    firstGoalTurn,
    defended, reacted, affinityUsed, tackled, attackWon, theyAttacked, fouled, sentOff, penalty, taught,
  };
}

/** Notes the coach can make after events in the first tutorial (see notesFor in lessons.ts). */
export const NOTE_IDS = [
  'their-weak', 'caught-forward', 'intercepted', 'you-intercepted', 'saved', 'goal-mine', 'goal-theirs',
  'knocked-down', 'shaken', 'injured', 'their-spell', 'out-of-spells', 'game-over',
];

/** Notes in the contact tutorial (contactNotes, plus the basic notes it keeps). */
export const CONTACT_NOTE_IDS = [
  'first-flip', 'their-attack', 'penalty-box', 'sent-off', 'heavy-hands', 'sturdy', 'knocked-out', 'power-play',
  'goal-mine', 'goal-theirs', 'knocked-down', 'shaken', 'injured', 'game-over',
];

/**
 * Whether a seed gives a good game when the coach is followed (docs/tutorial-design.md,
 * "Choosing the seed"). Returns the reasons it doesn't, empty when it does.
 */
export function seedProblems(r: TutorialResult, scenario: TutorialScenario = TUTORIAL): string[] {
  const problems: string[] = [];
  if (!r.won) problems.push('the person loses');
  if (scenario.lessons === 'contact') {
    if (!r.attackWon) problems.push('the person never wins a physical attack');
    if (!r.theyAttacked) problems.push('the computer never attacks');
    if (!r.fouled.A) problems.push('the person never fouls');
    if (!r.fouled.B) problems.push('the computer never fouls');
    if (!r.sentOff.B) problems.push('the referee never sends their player off');
    if (r.sentOff.A) problems.push('the person has a player sent off');
    if (r.turns < 10 || r.turns > 26) problems.push(`the game takes ${r.turns} turns`);
    return problems;
  }
  if (!r.faceoffWon) problems.push('the opening faceoff is lost');
  if (!r.firstPassCaught) problems.push('the first pass is intercepted');
  if (r.firstGoalTurn === null || r.firstGoalTurn > 10) problems.push('no goal by turn 10');
  if (!r.defended) problems.push('the person never stops one of their passes or shots');
  if (!r.reacted) problems.push('the person never plays a reaction spell');
  if (!r.affinityUsed) problems.push('the person never plays a spell with an affinity');
  if (r.turns < 16 || r.turns > 30) problems.push(`the game takes ${r.turns} turns`);
  return problems;
}

/** Higher is better, among seeds with no problems: more taught, a tackle (or a penalty), an early goal, the right length. */
export function seedScore(r: TutorialResult, scenario: TutorialScenario = TUTORIAL): number {
  if (scenario.lessons === 'contact') {
    return r.taught * 2 + (r.penalty ? 4 : 0) + (r.firstGoalTurn !== null ? 10 - Math.min(10, r.firstGoalTurn) : 0) - Math.abs(r.turns - 16) / 2;
  }
  return r.taught * 2 + (r.tackled ? 3 : 0) + (r.firstGoalTurn !== null ? 10 - r.firstGoalTurn : 0) + (r.score.B > 0 ? 2 : 0) - Math.abs(r.turns - 22) / 2;
}
