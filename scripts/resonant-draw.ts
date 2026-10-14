// How player cards get their Resonants and Affinities (docs/MAGIC.md, "How players get their magic").
//
// 1. Only useful magic counts: the specializations in data/useful-magic.json. A Resonant is
//    useful if it grants at least one of them. Pros have useful Resonants, or they wouldn't be pros.
// 2. A Resonant: pick one of the wheel roots (Anger, Joy, Heat, ...) at random. 50% of the time
//    the player has the root itself. The other 50% goes to the deeper levels of that root's tree,
//    each level half as likely as the one above it (two levels: 33% and 17%).
// 3. Its Affinity: pick one of the Resonant's useful families at random. 50% of the time the
//    Affinity is the whole family ("fire"). The other 50% goes to one of that Resonant's narrower
//    specializations in the family ("fire.explosion"). A family's own specialization ("fire.fire")
//    is the whole family. If the Resonant has no narrower one, the Affinity is the whole family.

export interface ResonantData {
  id: string;
  name: string;
  wheel: string;
  depth: number;
  rootId: string;
  specializations: string[];
}

export interface DrawnResonant {
  id: string;
  name: string;
  affinity: string;
}

/** A random whole number from 0 to max - 1. */
export type Roll = (max: number) => number;

/** Chance of the root itself, as a share of 1. */
export const TOP_LEVEL_CHANCE = 0.5;

export const familyOf = (magic: string): string => magic.split('.')[0]!;

/** "fire.fire" is the whole fire family; "fire.explosion" is a narrower specialization. */
export const isWholeFamily = (spec: string): boolean => spec.split('.')[1] === familyOf(spec);

export function usefulSpecs(resonant: ResonantData, useful: ReadonlySet<string>): string[] {
  return resonant.specializations.filter((s) => useful.has(s));
}

/** Weights for each depth in one root's tree: 50% for the root, the rest halving level by level. */
export function depthWeights(depths: number[]): Map<number, number> {
  const weights = new Map<number, number>();
  const deeper = depths.filter((d) => d > 0).sort((a, b) => a - b);
  const hasRoot = depths.includes(0);
  if (hasRoot) weights.set(0, deeper.length ? TOP_LEVEL_CHANCE : 1);
  // Shares 1, 1/2, 1/4, ... of what's left, scaled so they add up to it.
  const left = hasRoot ? 1 - TOP_LEVEL_CHANCE : 1;
  const raw = deeper.map((_, i) => 0.5 ** i);
  const total = raw.reduce((a, b) => a + b, 0);
  deeper.forEach((d, i) => weights.set(d, (left * raw[i]!) / total));
  return weights;
}

function pickWeighted<T>(roll: Roll, items: [T, number][]): T {
  const scale = 1_000_000;
  const total = items.reduce((sum, [, w]) => sum + Math.round(w * scale), 0);
  let r = roll(total);
  for (const [item, w] of items) {
    const units = Math.round(w * scale);
    if (r < units) return item;
    r -= units;
  }
  return items[items.length - 1]![0];
}

const pickOne = <T>(roll: Roll, items: T[]): T => items[roll(items.length)]!;

/** Draws one useful Resonant, avoiding the ids and names the player already has. */
export function drawResonant(roll: Roll, useful: ResonantData[], avoid: { ids: Set<string>; names: Set<string> }): ResonantData {
  const open = useful.filter((r) => !avoid.ids.has(r.id) && !avoid.names.has(r.name));
  const roots = [...new Set(open.map((r) => r.rootId))].sort();
  const root = pickOne(roll, roots);
  const tree = open.filter((r) => r.rootId === root);
  const weights = depthWeights([...new Set(tree.map((r) => r.depth))]);
  const depth = pickWeighted(roll, [...weights.entries()]);
  return pickOne(roll, tree.filter((r) => r.depth === depth));
}

/** Draws the Affinity for a Resonant: a family id, or a family.specialization id. */
export function drawAffinity(roll: Roll, resonant: ResonantData, useful: ReadonlySet<string>): string {
  const specs = usefulSpecs(resonant, useful);
  const families = [...new Set(specs.map(familyOf))];
  const family = pickOne(roll, families);
  const narrower = specs.filter((s) => familyOf(s) === family && !isWholeFamily(s));
  if (narrower.length === 0 || roll(100) < TOP_LEVEL_CHANCE * 100) return family;
  return pickOne(roll, narrower);
}

/** Draws `count` different Resonants, each with its Affinity. */
export function drawResonants(roll: Roll, count: number, useful: ResonantData[], usefulSet: ReadonlySet<string>): DrawnResonant[] {
  const ids = new Set<string>();
  const names = new Set<string>();
  const out: DrawnResonant[] = [];
  for (let i = 0; i < count; i++) {
    const r = drawResonant(roll, useful, { ids, names });
    ids.add(r.id);
    names.add(r.name);
    out.push({ id: r.id, name: r.name, affinity: drawAffinity(roll, r, usefulSet) });
  }
  return out;
}
