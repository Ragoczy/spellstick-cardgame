// Runs many computer-vs-computer games and gathers statistics.

import { heuristicAgent } from '../ai/heuristic';
import { runGame } from '../ai/runGame';
import { LIBRARY_TEAM, type CardSet } from '../engine/cards';
import type { GameConfig } from '../engine/config';
import { findProblems } from './invariants';
import { SimStats } from './stats';

export interface SimOptions {
  games: number;
  seed: number;
  config: GameConfig;
  cardSet: CardSet;
  /** Play exactly these game seeds instead of `games` games numbered from `seed` (used to split a run across processes). */
  seeds?: readonly number[];
  onProgress?: (done: number) => void;
}

export interface SimResult {
  stats: SimStats;
  /** Games that threw an error. Should be empty. */
  crashes: string[];
  /** Impossible states seen during play. Should be empty. */
  problems: string[];
  /** Games stopped by the turn cap. Should be empty. */
  capped: string[];
  milliseconds: number;
}

/** The game seeds a run of `games` games from block `seed` plays: seed 1 is 100000, 100001, ... */
export function gameSeeds(seed: number, games: number): number[] {
  return Array.from({ length: games }, (_, g) => seed * 100_000 + g);
}

export function simulate(options: SimOptions): SimResult {
  const started = Date.now();
  // Library spells no team uses never reach a game, so they'd only clutter the report.
  const listed = new Set(options.cardSet.teams.flatMap((t) => t.spells ?? []));
  const stats = new SimStats(options.cardSet.cards.filter((c) => c.team !== LIBRARY_TEAM || listed.has(c.id)));
  const crashes: string[] = [];
  const problems: string[] = [];
  const capped: string[] = [];

  const seeds = options.seeds ?? gameSeeds(options.seed, options.games);
  for (const [g, seed] of seeds.entries()) {
    try {
      const record = runGame(
        { seed, cardSet: options.cardSet, config: options.config },
        { A: heuristicAgent(seed * 2 + 1, options.config), B: heuristicAgent(seed * 2 + 2, options.config) },
        {
          onStep: (state) => {
            for (const problem of findProblems(state)) problems.push(`game seed ${seed}, turn ${state.turn}: ${problem}`);
          },
        },
      );
      if (record.final.result?.reason === 'turn_cap') capped.push(`game seed ${seed}`);
      stats.add(record);
    } catch (error) {
      crashes.push(`game seed ${seed}: ${(error as Error).message}`);
    }
    options.onProgress?.(g + 1);
  }
  return { stats, crashes, problems, capped, milliseconds: Date.now() - started };
}
