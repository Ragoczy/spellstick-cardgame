// Runs many computer-vs-computer games and gathers statistics.

import { heuristicAgent } from '../ai/heuristic';
import { runGame } from '../ai/runGame';
import type { CardSet } from '../engine/cards';
import type { GameConfig } from '../engine/config';
import { findProblems } from './invariants';
import { SimStats } from './stats';

export interface SimOptions {
  games: number;
  seed: number;
  config: GameConfig;
  cardSet: CardSet;
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

export function simulate(options: SimOptions): SimResult {
  const started = Date.now();
  const stats = new SimStats(options.cardSet.cards);
  const crashes: string[] = [];
  const problems: string[] = [];
  const capped: string[] = [];

  for (let g = 0; g < options.games; g++) {
    const seed = options.seed * 100_000 + g;
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
