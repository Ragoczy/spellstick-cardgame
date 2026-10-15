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

/**
 * "key=value" pairs into config overrides. Numbers and true/false are converted; anything else
 * stays text. A dotted key changes one part of a setting that holds several numbers, for example
 * severity.shaken=2.
 */
export function configOverrides(pairs: string[]): Partial<GameConfig> {
  const out: Record<string, unknown> = {};
  for (const pair of pairs) {
    const [name, raw] = pair.split('=');
    if (!name || raw === undefined) throw new Error(`Bad setting "${pair}". Use name=value.`);
    const [key, part] = name.split('.') as [string, string | undefined];
    if (!(key in DEFAULT_CONFIG)) throw new Error(`There's no config setting "${key}" (see src/engine/config.ts).`);
    const value = raw === 'true' ? true : raw === 'false' ? false : raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
    if (part === undefined) {
      out[key] = value;
      continue;
    }
    const whole = (out[key] ?? DEFAULT_CONFIG[key as keyof GameConfig]) as Record<string, unknown>;
    if (typeof whole !== 'object' || whole === null || !(part in whole)) throw new Error(`"${key}" has no part "${part}".`);
    out[key] = { ...whole, [part]: value };
  }
  return out as Partial<GameConfig>;
}
