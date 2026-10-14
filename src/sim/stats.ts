// Collects balance statistics from finished games (ROADMAP M2). Reads every event as an
// all-seeing observer; it never feeds anything back into play.

import type { GameRecord } from '../ai/runGame';
import type { Area, CardDef, PlayerCardDef } from '../engine/cards';
import type { GameConfig } from '../engine/config';
import type { InjurySource } from '../engine/events';
import { GOAL, type Side } from '../engine/field';
import { scoreSide } from '../engine/score';
import type { Affinity, ContestKind, EndReason } from '../engine/state';

/**
 * One game's numbers, kept per game so every average can get a confidence interval
 * (src/sim/confidence.ts) and two runs on the same seeds can be compared seed by seed.
 *
 * Counters for rules that don't exist yet (Shaken, knocked out, sent off, penalties) stay 0
 * until the phase that adds the rule counts its events here. That's also the true v0.16 value.
 */
export interface GameTally {
  seed: number;
  /** null for a draw. */
  winner: Side | null;
  firstSide: Side;
  turns: number;
  goals: number;
  shots: number;
  shotGoals: number;
  /** Every spell played, including ones that fizzled. */
  spellsCast: number;
  tackles: number;
  tacklesWon: number;
  hits: number;
  hitsLanded: number;
  /** Every time a player was hurt, whatever the result (Shaken, Injured, Knocked out, carried off). */
  hurts: number;
  hurtsBySource: Record<InjurySource, number>;
  /** Hurt, but only Shaken (v0.17). */
  shaken: number;
  /** Drew an injury card (or would have, if the injury deck was empty). Not carried off. */
  injured: number;
  /** Knocked out of the game for now (v0.17). */
  knockedOut: number;
  /** Injured a second time and carried off. */
  carriedOff: number;
  /** Dirty plays cast. */
  fouls: number;
  /** Fouls the referee caught (v0.17). */
  foulsCaught: number;
  /** Players sent off for the game (v0.17). */
  sentOff: number;
  /** Penalties called on physical attacks (v0.17). */
  penalties: number;
  /** The side that suffered the game's first carry-off or knockout, if any. */
  firstSerious: Side | null;
  /** Shots at a goalie, and the sum of each one's chance to score against an unanswered Shield. */
  shieldShots: number;
  shieldChanceSum: number;
}

/**
 * The chance that a side worth `attacker` beats a side worth `defender` when both add one die of
 * this size, with ties going to the defender. This is the chance before the dice are rolled.
 */
export function winChance(attacker: number, defender: number, die: number): number {
  let wins = 0;
  for (let a = 1; a <= die; a++) for (let d = 1; d <= die; d++) if (attacker + a > defender + d) wins += 1;
  return wins / (die * die);
}

/**
 * The chance this shot would score if the shooter shielded the goalie and nobody answered: the
 * shooter's printed Shot against the goalie's Save after the Shield, both before dice and spells.
 * It uses the engine's own scoring, so it follows whatever the Shield rule is.
 */
export function unansweredShieldChance(shooterPrinted: number, goalie: PlayerCardDef, config: GameConfig): number {
  const shielded = scoreSide({
    player: goalie,
    side: { stat: 'save', use: 'save', pos: GOAL, modifiers: [] },
    spell: null,
    shielded: true,
  }, config);
  // With no dice, spells, or modifiers, the total is the goalie's Save after the Shield.
  return winChance(shooterPrinted, shielded.total, config.contestDie || config.shotDie);
}

/** Reads one finished game into a GameTally. */
export function tallyGame(record: GameRecord): GameTally {
  const s = record.final;
  const t: GameTally = {
    seed: record.setup.seed,
    winner: s.result?.winner ?? null,
    firstSide: s.firstSide,
    turns: s.turn,
    goals: s.score.A + s.score.B,
    shots: 0, shotGoals: 0, spellsCast: 0, tackles: 0, tacklesWon: 0, hits: 0, hitsLanded: 0,
    hurts: 0, hurtsBySource: { hit: 0, dirty_play: 0 },
    shaken: 0, injured: 0, knockedOut: 0, carriedOff: 0,
    fouls: 0, foulsCaught: 0, sentOff: 0, penalties: 0,
    firstSerious: null, shieldShots: 0, shieldChanceSum: 0,
  };
  for (const e of record.events) {
    switch (e.type) {
      case 'spellCast':
        t.spellsCast += 1;
        if (e.card.def.kind === 'spell' && e.card.def.ability.effect === 'dirty_play') t.fouls += 1;
        break;
      case 'injured':
        t.hurts += 1;
        t.hurtsBySource[e.source] += 1;
        if (e.carriedOff) {
          t.carriedOff += 1;
          t.firstSerious ??= e.side;
        } else t.injured += 1;
        break;
      case 'contestResolved': {
        const won = e.winnerRole === 'attacker' ? 1 : 0;
        if (e.kind === 'shot') {
          t.shots += 1;
          t.shotGoals += won;
          if (e.defender.card && e.defender.card.def.kind === 'goalie') {
            t.shieldShots += 1;
            t.shieldChanceSum += unansweredShieldChance(e.attacker.printed, e.defender.card.def, s.config);
          }
        }
        if (e.kind === 'tackle') {
          t.tackles += 1;
          t.tacklesWon += won;
        }
        if (e.kind === 'hit') {
          t.hits += 1;
          t.hitsLanded += won;
        }
        break;
      }
      default:
        break;
    }
  }
  return t;
}

export interface CardStats {
  id: string;
  name: string;
  team: string;
  kind: CardDef['kind'];
  /** Player cards: the card's type (runner, striker, ...), if it has one. */
  role?: string;
  /** Spells: times cast. Players: times in a contest. */
  played: number;
  /** Times played where the result depended on a contest. */
  inContest: number;
  /** Of those, how often this card's side won the contest. */
  contestWins: number;
  /** Decided games with this card in a team's deck, and how many that team won. */
  deckGames: number;
  deckWins: number;
  /** Draft games: decided games where a team drafted this card, and how many that team won. */
  draftedGames: number;
  draftedWins: number;
}

export interface AffinityStats {
  cast: number;
  fizzled: number;
  inContest: number;
  contestWins: number;
}

const zeroAffinity = (): AffinityStats => ({ cast: 0, fizzled: 0, inContest: 0, contestWins: 0 });

export class SimStats {
  games = 0;
  wins = { first: 0, second: 0, A: 0, B: 0, draws: 0 };
  reasons: Record<EndReason, number> = { goals: 0, time: 0, shootout: 0, draw: 0, turn_cap: 0 };
  turns: number[] = [];
  goals = 0;
  shots = 0;
  shotGoals = 0;
  /** Attacker wins per contest kind (in a faceoff, the attacker is the team choosing the lane). */
  contests: Record<ContestKind, { count: number; attackerWins: number }> = {
    faceoff: { count: 0, attackerWins: 0 },
    pass: { count: 0, attackerWins: 0 },
    tackle: { count: 0, attackerWins: 0 },
    shot: { count: 0, attackerWins: 0 },
    penalty: { count: 0, attackerWins: 0 },
    hit: { count: 0, attackerWins: 0 },
  };
  /** Injuries suffered, by the injured team and by what caused them (carry-offs included). */
  injuries: Record<Side, Record<InjurySource, number>> = { A: { hit: 0, dirty_play: 0 }, B: { hit: 0, dirty_play: 0 } };
  carriedOff = 0;
  /** Goals (and shootout penalties) scored into an empty goal. */
  emptyGoalGoals = 0;
  /** Rolls spent (experimental dice budget). */
  diceSpent = 0;
  /** Contests between two players where the printed cards differed: how often the weaker card won. */
  upsets = { contests: 0, weakerWon: 0 };
  /** Games where a spot sat empty because nobody could replace a carried-off player. */
  gamesWithEmptySlot = 0;
  /** Decided games where one team suffered more injuries: how often that team still won. */
  moreInjured = { games: 0, wins: 0 };
  /** Passes by the row of the receiver: how often the receiver keeps the ball. */
  passesTo: Record<Area | 'goal', { count: number; attackerWins: number }> = {
    goal: { count: 0, attackerWins: 0 },
    defense: { count: 0, attackerWins: 0 },
    midfield: { count: 0, attackerWins: 0 },
    forward: { count: 0, attackerWins: 0 },
  };
  /** Passes to a forward, by the passing team: how often the receiver started ahead (printed cards) and was caught. */
  forwardPasses: Record<Side, { count: number; aheadOrLevel: number; caught: number }> = {
    A: { count: 0, aheadOrLevel: 0, caught: 0 },
    B: { count: 0, aheadOrLevel: 0, caught: 0 },
  };
  /** Shots by the row of the shooter (midfield = long shot). */
  shotsFrom: Record<Area | 'goal', { count: number; attackerWins: number }> = {
    goal: { count: 0, attackerWins: 0 },
    defense: { count: 0, attackerWins: 0 },
    midfield: { count: 0, attackerWins: 0 },
    forward: { count: 0, attackerWins: 0 },
  };
  affinity: Record<Affinity, AffinityStats> = { specialist: zeroAffinity(), match: zeroAffinity(), neutral: zeroAffinity(), opposed: zeroAffinity() };
  cards = new Map<string, CardStats>();
  /** Each game's numbers, in the order played. */
  tallies: GameTally[] = [];

  constructor(allCards: CardDef[]) {
    for (const def of allCards) {
      if (def.promo) continue;
      const role = def.kind === 'spell' ? undefined : def.role;
      this.cards.set(def.id, {
        id: def.id, name: def.name, team: def.team, kind: def.kind, role,
        played: 0, inContest: 0, contestWins: 0, deckGames: 0, deckWins: 0, draftedGames: 0, draftedWins: 0,
      });
    }
  }

  add(record: GameRecord): void {
    const result = record.final.result!;
    const first = record.final.firstSide;
    this.games += 1;
    this.tallies.push(tallyGame(record));
    this.turns.push(record.final.turn);
    this.reasons[result.reason] += 1;
    this.goals += record.final.score.A + record.final.score.B;
    if (result.winner === null) this.wins.draws += 1;
    else {
      this.wins[result.winner] += 1;
      if (result.winner === first) this.wins.first += 1;
      else this.wins.second += 1;
    }

    // Spells cast since the last contest started belong to the next contest to resolve.
    let spellsInPlay: { side: Side; id: string; affinity: Affinity }[] = [];
    const injuredThisGame: Record<Side, number> = { A: 0, B: 0 };
    let emptySlot = false;
    for (const e of record.events) {
      switch (e.type) {
        case 'injured':
          this.injuries[e.side][e.source] += 1;
          injuredThisGame[e.side] += 1;
          if (e.carriedOff) this.carriedOff += 1;
          break;
        case 'slotEmptied':
          emptySlot = true;
          break;
        case 'diceRolled':
          this.diceSpent += 1;
          break;
        case 'turnStarted':
        case 'faceoffStarted':
          spellsInPlay = [];
          break;
        case 'spellCast': {
          this.card(e.card.def.id).played += 1;
          const a = this.affinity[e.affinity];
          a.cast += 1;
          if (e.fizzled) a.fizzled += 1;
          else spellsInPlay.push({ side: e.side, id: e.card.def.id, affinity: e.affinity });
          break;
        }
        case 'contestResolved': {
          const c = this.contests[e.kind];
          c.count += 1;
          if (e.winnerRole === 'attacker') c.attackerWins += 1;
          const won = e.winnerRole === 'attacker' ? 1 : 0;
          if ((e.kind === 'shot' || e.kind === 'penalty') && !e.defender.card) this.emptyGoalGoals += won;
          if (e.attacker.card && e.defender.card && e.attacker.printed !== e.defender.printed) {
            this.upsets.contests += 1;
            const winner = e.winnerRole === 'attacker' ? e.attacker : e.defender;
            const loser = e.winnerRole === 'attacker' ? e.defender : e.attacker;
            if (winner.printed < loser.printed) this.upsets.weakerWon += 1;
          }
          if (e.kind === 'shot') {
            this.shots += 1;
            this.shotGoals += won;
            this.shotsFrom[e.attacker.pos.area].count += 1;
            this.shotsFrom[e.attacker.pos.area].attackerWins += won;
          }
          if (e.kind === 'pass') {
            this.passesTo[e.attacker.pos.area].count += 1;
            this.passesTo[e.attacker.pos.area].attackerWins += won;
            if (e.attacker.pos.area === 'forward' && e.defender.card) {
              const f = this.forwardPasses[e.attacker.side];
              f.count += 1;
              f.caught += won;
              if (e.attacker.printed >= e.defender.printed) f.aheadOrLevel += 1;
            }
          }
          for (const side of [e.attacker, e.defender]) {
            if (!side.card) continue; // an empty spot
            const stats = this.card(side.card.def.id);
            stats.played += 1;
            stats.inContest += 1;
            if (side.side === e.winner) stats.contestWins += 1;
          }
          for (const spell of spellsInPlay) {
            const stats = this.card(spell.id);
            stats.inContest += 1;
            this.affinity[spell.affinity].inContest += 1;
            if (spell.side === e.winner) {
              stats.contestWins += 1;
              this.affinity[spell.affinity].contestWins += 1;
            }
          }
          spellsInPlay = [];
          break;
        }
        default:
          break;
      }
    }
    this.finishInjuries(injuredThisGame, emptySlot, result.winner);
    this.countDecks(record, result.winner);
  }

  /** Win rate by card: which cards each team had (and drafted), and whether that team won. */
  private countDecks(record: GameRecord, winner: Side | null): void {
    if (winner === null) return;
    const s = record.final;
    for (const side of ['A', 'B'] as const) {
      const won = winner === side ? 1 : 0;
      const ids = new Set(Object.entries(s.cards).filter(([uid]) => uid.startsWith(side)).map(([, def]) => def.id));
      for (const id of ids) {
        const card = this.cards.get(id);
        if (!card) continue;
        card.deckGames += 1;
        card.deckWins += won;
      }
      for (const uid of s.draft?.picks[side] ?? []) {
        const card = this.cards.get(s.cards[uid]!.id);
        if (!card) continue;
        card.draftedGames += 1;
        card.draftedWins += won;
      }
    }
  }

  /** Called at the end of add() for each game's injury totals. */
  private finishInjuries(injured: Record<Side, number>, emptySlot: boolean, winner: Side | null): void {
    if (emptySlot) this.gamesWithEmptySlot += 1;
    if (winner === null || injured.A === injured.B) return;
    const moreInjured: Side = injured.A > injured.B ? 'A' : 'B';
    this.moreInjured.games += 1;
    if (winner === moreInjured) this.moreInjured.wins += 1;
  }

  private card(id: string): CardStats {
    const stats = this.cards.get(id);
    if (!stats) throw new Error(`Unknown card ${id}`);
    return stats;
  }
}
