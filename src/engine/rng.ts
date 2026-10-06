// Seeded random numbers (mulberry32). The RNG state is a single number stored in the game
// state, so the same seed and the same actions always produce the same game.

/** Returns a number in [0, 1) and the next RNG state. */
export function nextRandom(rngState: number): [number, number] {
  const next = (rngState + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

/** Returns a whole number from 0 to max - 1 and the next RNG state. */
export function randomInt(rngState: number, max: number): [number, number] {
  const [value, next] = nextRandom(rngState);
  return [Math.floor(value * max), next];
}

/** Returns a shuffled copy of the list and the next RNG state (Fisher–Yates). */
export function shuffle<T>(items: readonly T[], rngState: number): [T[], number] {
  const result = [...items];
  let state = rngState;
  for (let i = result.length - 1; i > 0; i--) {
    let j: number;
    [j, state] = randomInt(state, i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return [result, state];
}

/** Turns any seed number into a starting RNG state. */
export function seedToState(seed: number): number {
  return seed | 0;
}
