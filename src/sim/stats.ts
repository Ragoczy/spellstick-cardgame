// Collects balance statistics from finished games (ROADMAP M2). Reads every event as an
// all-seeing observer; it never feeds anything back into play.

import type { GameRecord } from '../ai/runGame';
import type { Area, CardDef } from '../engine/cards';
import type { Side } from '../engine/field';
import type { Affinity, ContestKind, EndReason } from '../engine/state';

export interface CardStats {
  id: string;
  name: string;
  team: string;
  kind: CardDef['kind'];
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
  };
  /** Passes by the row of the receiver: how often the receiver keeps the ball. */
  passesTo: Record<Area | 'goal', { count: number; attackerWins: number }> = {
    goal: { count: 0, attackerWins: 0 },
    defense: { count: 0, attackerWins: 0 },
    midfield: { count: 0, attackerWins: 0 },
    forward: { count: 0, attackerWins: 0 },
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
      this.cards.set(def.id, { id: def.id, name: def.name, team: def.team, kind: def.kind, played: 0, inContest: 0, contestWins: 0 });
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
    for (const e of record.events) {
      switch (e.type) {
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
          if (e.kind === 'shot') {
            this.shots += 1;
            this.shotGoals += won;
            this.shotsFrom[e.attacker.pos.area].count += 1;
            this.shotsFrom[e.attacker.pos.area].attackerWins += won;
          }
          if (e.kind === 'pass') {
            this.passesTo[e.attacker.pos.area].count += 1;
            this.passesTo[e.attacker.pos.area].attackerWins += won;
          }
          for (const side of [e.attacker, e.defender]) {
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
  }

  private card(id: string): CardStats {
    const stats = this.cards.get(id);
    if (!stats) throw new Error(`Unknown card ${id}`);
    return stats;
  }
}
