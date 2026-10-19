// The tutorial (docs/tutorial-design.md): its fixed scenario, the engine's stacked piles, the
// coach's suggestions, and the seed chosen for it.
import { describe, expect, it } from 'vitest';
import type { Agent } from '../src/ai/agent';
import { heuristicAgent } from '../src/ai/heuristic';
import { randomAgent } from '../src/ai/random';
import { runGame } from '../src/ai/runGame';
import { prototypeCards } from '../src/data/prototype';
import { applyAction, createGame, legalActions, viewFor, type Action, type GameState, type PlayerView } from '../src/engine';
import { tutorialAgent } from '../src/tutorial/agent';
import { sameAction, suggest } from '../src/tutorial/coach';
import { commentOn, TutorialCoach } from '../src/tutorial/lessons';
import { coachOptions, computerSeed, playTutorial, seedProblems } from '../src/tutorial/play';
import { TUTORIAL, tutorialConfig, tutorialProblems, tutorialSetup } from '../src/tutorial/scenario';

const names = (s: GameState, uids: string[]) => uids.map((uid) => s.cards[uid]!.id);
const def = (id: string) => prototypeCards.cards.find((c) => c.id === id)!;

describe('tutorial scenario', () => {
  it('has legal decks and lineups under the tutorial settings', () => {
    expect(tutorialProblems(prototypeCards)).toEqual([]);
  });

  it('gives the person the stronger team', () => {
    const save = (id: string) => (def(id) as { save: number }).save;
    expect(save(TUTORIAL.player.goalie)).toBeGreaterThan(save(TUTORIAL.computer.goalie));
    const cost = (ids: string[]) => ids.reduce((sum, id) => sum + ((def(id) as { cost?: number }).cost ?? 0), 0);
    expect(cost(TUTORIAL.player.players)).toBeGreaterThan(cost(TUTORIAL.computer.players) * 1.3);
  });

  it('lets the second player (the person) choose the opening faceoff lane', () => {
    const { state } = createGame(tutorialSetup(prototypeCards));
    expect(state.firstSide).toBe('B');
    expect(state.faceoffChooser).toBe('A');
  });
});

describe('stacked piles', () => {
  it('draws cards in the order listed, with the spare goalie at the bottom', () => {
    let { state } = createGame(tutorialSetup(prototypeCards));
    const goalie = state.teams.A.hand.find((uid) => state.cards[uid]!.id === TUTORIAL.player.goalie)!;
    ({ state } = applyAction(state, { type: 'chooseGoalie', side: 'A', card: goalie }));
    const config = tutorialConfig();
    const spots = 3 * config.lanes;
    expect(names(state, state.teams.A.hand)).toEqual([
      ...TUTORIAL.player.players.slice(0, spots + config.setupExtraPlayers),
      ...TUTORIAL.player.spells.slice(0, config.setupSpells),
    ]);
    // The top of a pile is the end of the list.
    const rest = TUTORIAL.player.players.slice(spots + config.setupExtraPlayers);
    expect(names(state, state.teams.A.players)).toEqual([TUTORIAL.player.goalies[1], ...[...rest].reverse()]);
    expect(names(state, state.teams.A.spells)).toEqual([...TUTORIAL.player.spells.slice(config.setupSpells)].reverse());
  });

  it('is the same for any seed (only the dice change)', () => {
    const hands = [1, 2, 3].map((seed) => {
      let { state } = createGame(tutorialSetup(prototypeCards, seed));
      ({ state } = applyAction(state, { type: 'chooseGoalie', side: 'A', card: state.teams.A.hand[0]! }));
      return names(state, state.teams.A.hand);
    });
    expect(hands[1]).toEqual(hands[0]);
    expect(hands[2]).toEqual(hands[0]);
  });
});

describe('the computer in the tutorial', () => {
  it('puts out the scenario goalie and lineup', () => {
    const record = playTutorial(prototypeCards, TUTORIAL.seed).record;
    // Rebuild the state after setup: both lineups are placed by turn 1.
    let { state } = createGame(record.setup);
    for (const a of record.actions) {
      if (state.turn > 0) break;
      ({ state } = applyAction(state, a));
    }
    expect(state.cards[state.teams.B.goalie!.uid]!.id).toBe(TUTORIAL.computer.goalie);
    for (const area of ['defense', 'midfield', 'forward'] as const) {
      expect(state.teams.B.lineup[area].map((s) => state.cards[s!.uid]!.id)).toEqual(TUTORIAL.computer.lineup[area]);
    }
  });
});

describe('the chosen seed', () => {
  it('gives a good first game when the person follows the coach', () => {
    const r = playTutorial(prototypeCards, TUTORIAL.seed);
    expect(seedProblems(r)).toEqual([]);
    // The lessons the design counts on.
    for (const id of ['welcome', 'field', 'faceoff', 'dice', 'reaction', 'affinity', 'draw', 'pass', 'shoot', 'goal-mine', 'game-over']) {
      expect(r.coach.hasTaught(id), id).toBe(true);
    }
  });
});

/** An agent that checks every coach tip on the way: legal, and naming no card the person can't see. */
function checkingAgent(inner: Agent, coach: TutorialCoach, hiddenNames: (view: PlayerView) => string[]): Agent {
  return {
    name: 'checking',
    chooseAction(view, legal) {
      const tip = coach.tip(view, legal);
      expect(tip.suggestion, `no suggestion for ${view.pending.kind}`).not.toBeNull();
      expect(legal.some((a) => sameAction(a, tip.suggestion!.action)), `illegal suggestion for ${view.pending.kind}`).toBe(true);
      const words = `${tip.suggestion!.says} ${tip.lesson?.text ?? ''}`;
      for (const name of hiddenNames(view)) expect(words, `named a hidden card: ${name}`).not.toContain(name);
      const action = inner.chooseAction(view, legal);
      coach.chose(view, legal, action);
      return action;
    },
  };
}

describe('the coach', () => {
  // The computer's players the person hasn't seen: everyone on its team not face up in this view.
  const computerNames = [...TUTORIAL.computer.goalies, ...TUTORIAL.computer.players].map((id) => def(id).name);
  const hiddenNames = (view: PlayerView) => {
    const seen = new Set<string>();
    const team = view.opponent;
    for (const s of [team.goalie, ...team.lineup.defense, ...team.lineup.midfield, ...team.lineup.forward]) {
      if (s && (s.state === 'revealed' || s.state === 'faceDown')) seen.add(s.card.def.name);
    }
    for (const c of [...team.discard, ...team.knockedOut]) seen.add(c.def.name);
    return computerNames.filter((n) => !seen.has(n));
  };

  const humans: [string, (seed: number) => Agent | null][] = [
    ['following the coach', () => null],
    ['playing like the computer', (seed) => heuristicAgent(seed + 2, tutorialConfig())],
    ['making random moves', (seed) => randomAgent(seed + 3)],
  ];
  for (const [label, make] of humans) {
    it(`suggests a legal move every time and never names a hidden card, with the person ${label}`, () => {
      for (let seed = 1; seed <= 40; seed++) {
        const coach = new TutorialCoach(coachOptions());
        const inner = make(seed) ?? { name: 'coach', chooseAction: (view: PlayerView, legal: Action[]) => coach.tip(view, legal).suggestion!.action };
        const record = runGame(tutorialSetup(prototypeCards, seed), {
          A: checkingAgent(inner, coach, hiddenNames),
          B: tutorialAgent(computerSeed(seed), tutorialConfig(), TUTORIAL.computer),
        });
        expect(record.final.result).not.toBeNull();
        expect(record.final.result!.reason).not.toBe('turn_cap');
      }
    }, 60_000);
  }

  it('wins nearly every game when followed', () => {
    let wins = 0;
    for (let seed = 1; seed <= 100; seed++) if (playTutorial(prototypeCards, seed).won) wins++;
    expect(wins).toBeGreaterThanOrEqual(95);
  }, 60_000);

  it('suggests the better goalie, and says so kindly when the person picks the other', () => {
    const { state } = createGame(tutorialSetup(prototypeCards));
    const view = viewFor(state, 'A');
    const legal = legalActions(state, 'A');
    const s = suggest(view, legal, coachOptions())!;
    expect(s.action.type === 'chooseGoalie' && state.cards[s.action.card]!.id).toBe(TUTORIAL.player.goalie);
    const other = legal.find((a) => !sameAction(a, s.action))!;
    expect(commentOn(view, s, other)?.text).toMatch(/^That works\./);
    expect(commentOn(view, s, s.action)).toBeNull();
  });

  it('comments on each kind of different choice only once', () => {
    const { state } = createGame(tutorialSetup(prototypeCards));
    const view = viewFor(state, 'A');
    const legal = legalActions(state, 'A');
    const coach = new TutorialCoach(coachOptions());
    const other = legal.find((a) => !sameAction(a, coach.tip(view, legal).suggestion!.action))!;
    expect(coach.chose(view, legal, other)).not.toBeNull();
    expect(coach.chose(view, legal, other)).toBeNull();
  });
});
