// Command-line helpers shared by the simulation scripts.

import { DEFAULT_CONFIG, type GameConfig } from '../engine/config';

/** The value after --name, if given. */
export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Every value given with --name (for flags that may repeat, such as --set). */
export function args(name: string): string[] {
  return process.argv.flatMap((value, i) => (value === `--${name}` ? [process.argv[i + 1] ?? ''] : []));
}

/** "key=value" pairs into config overrides. Numbers and true/false are converted; anything else stays text. */
export function configOverrides(pairs: string[]): Partial<GameConfig> {
  const out: Record<string, unknown> = {};
  for (const pair of pairs) {
    const [key, raw] = pair.split('=');
    if (!key || raw === undefined) throw new Error(`Bad setting "${pair}". Use name=value.`);
    if (!(key in DEFAULT_CONFIG)) throw new Error(`There's no config setting "${key}" (see src/engine/config.ts).`);
    out[key] = raw === 'true' ? true : raw === 'false' ? false : raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
  }
  return out as Partial<GameConfig>;
}
