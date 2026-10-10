// Collects balance statistics from finished games (ROADMAP M2). Reads every event as an
// all-seeing observer; it never feeds anything back into play.

import type { GameRecord } from '../ai/runGame';
import type { Area, CardDef } from '../engine/cards';
import type { InjurySource } from '../engine/events';
import type { Side } from '../engine/field';
import type { Affinity, ContestKind, EndReason } from '../engine/state';

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
  affinity: Record<Affinity, AffinityStats> = { match: zeroAffinity(), neutral: zeroAffinity(), opposed: zeroAffinity() };
  cards = new Map<string, CardStats>();

  constructor(allCards: CardDef[]) {
    for (const def of allCards) {
      if (def.promo) continue;
      const role = def.kind === 'spell' ? undefined : def.role;
      this.cards.set(def.id, { id: def.id, name: def.name, team: def.team, kind: def.kind, role, played: 0, inContest: 0, contestWins: 0 });
    }
  }

  add(record: GameRecord): void {
    const result = record.final.result!;
    const first = record.final.firstSide;
    this.games += 1;
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
