// Gives every named player in the pool new Resonants and Affinities from the Warlock magic data,
// and writes an analysis to reports/resonants-<date>.md.
//
//   npm run assign-resonants
//
// Each player keeps their name, stats, and how many Resonants they have (1 to 3). Only the
// Resonants and their Affinities change. How they're drawn: scripts/resonant-draw.ts and
// docs/MAGIC.md. Uses a fixed seed, so running it again gives the same players, unless
// data/useful-magic.json or data/warlock-resonants.json changed.
//
// Only rerun this before anyone owns these cards: owned cards would change under their owners.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomInt, seedToState } from '../src/engine/rng';
import { drawResonants, familyOf, TOP_LEVEL_CHANCE, depthWeights, usefulSpecs, type DrawnResonant, type ResonantData } from './resonant-draw';

const SEED = 20261014;

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const cardsPath = new URL('../data/cards.prototype.json', import.meta.url);
const cardSet = JSON.parse(readFileSync(cardsPath, 'utf8'));
const magic = read('../data/warlock-resonants.json') as { resonants: ResonantData[]; specializations: { id: string; name: string }[]; magicFamilies: { id: string; name: string }[] };
const usefulList = (read('../data/useful-magic.json') as { specializations: { id: string; effects: string[] }[] }).specializations;

const known = new Set(magic.specializations.map((s) => s.id));
for (const s of usefulList) if (!known.has(s.id)) throw new Error(`data/useful-magic.json: "${s.id}" isn't in data/warlock-resonants.json`);
const useful = new Set(usefulList.map((s) => s.id));
const usefulResonants = magic.resonants.filter((r) => usefulSpecs(r, useful).length > 0);
const families = [...new Set(usefulList.map((s) => familyOf(s.id)))].sort();

let rng = seedToState(SEED);
const roll = (max: number): number => {
  let value: number;
  [value, rng] = randomInt(rng, max);
  return value;
};

type Player = { id: string; name: string; kind: string; team: string; resonants: DrawnResonant[] };
const players = (cardSet.cards as Player[]).filter((c) => c.team === 'pool');
for (const p of players) p.resonants = drawResonants(roll, p.resonants.length, usefulResonants, useful);

cardSet.families = families;
writeFileSync(cardsPath, `${JSON.stringify(cardSet, null, 2)}\n`);
console.log(`Gave ${players.length} players new Resonants (${families.length} families).`);

// ---- Analysis ----

const byId = new Map(magic.resonants.map((r) => [r.id, r]));
const familyName = new Map(magic.magicFamilies.map((f) => [f.id, f.name]));
const specName = new Map(magic.specializations.map((s) => [s.id, s.name]));
const label = (a: string) => (a.includes('.') ? `${specName.get(a)} (${familyName.get(familyOf(a))?.toLowerCase()})` : familyName.get(a)!);
const slots = players.flatMap((p) => p.resonants.map((r) => ({ player: p, r, data: byId.get(r.id)! })));
const pct = (n: number, of: number) => `${of ? Math.round((100 * n) / of) : 0}%`;
const count = <T>(items: T[]) => {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const table = (head: string[], rows: (string | number)[][]) =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

const spells = (cardSet.cards as { kind: string; name: string; magic: string | null }[]).filter((c) => c.kind === 'spell');
const spellMagic = [...new Set(spells.map((s) => s.magic).filter((m): m is string => m !== null))];
const spellFamilies = new Set(spellMagic.map(familyOf));
const spellSpecs = new Set(spellMagic.filter((m) => m.includes('.')));

const out: string[] = [];
const date = new Date().toISOString().slice(0, 10);
out.push(`# Player Resonants and Affinities, ${date}`, '');
out.push(`Made by \`npm run assign-resonants\` (seed ${SEED}). The rules for the draw are in docs/MAGIC.md.`, '');

out.push('## The useful pool', '');
out.push(`- ${useful.size} of ${magic.specializations.length} specializations are useful in play, in ${families.length} of ${magic.magicFamilies.length} families.`);
out.push(`- ${usefulResonants.length} of ${magic.resonants.length} Resonants grant at least one, including ${usefulResonants.filter((r) => r.depth === 0).length} of ${magic.resonants.filter((r) => r.depth === 0).length} roots.`);
const left = magic.resonants.filter((r) => usefulSpecs(r, useful).length === 0);
out.push(`- Left out (${left.length}): ${left.map((r) => r.name).join(', ')}.`, '');

out.push('## Resonants', '');
out.push(`${players.length} players, ${slots.length} Resonants, ${new Set(slots.map((s) => s.r.id)).size} different ones.`, '');
const depthTarget = depthWeights([0, 1, 2]);
out.push(table(['Level', 'Target (two-level tree)', 'Result'],
  [0, 1, 2, 3].map((d) => [d === 0 ? 'Root' : `Level ${d}`, depthTarget.has(d) ? pct(depthTarget.get(d)! * 1000, 1000) : 'only 4 Resonants', pct(slots.filter((s) => s.data.depth === d).length, slots.length)])));
out.push('');
out.push(`Wheels: ${count(slots.map((s) => s.data.wheel)).map(([w, n]) => `${w} ${pct(n, slots.length)}`).join(', ')}.`, '');
const roots = count(slots.map((s) => byId.get(s.data.rootId)!.name));
out.push(`Roots (Resonants anywhere in that root's tree): ${roots.map(([r, n]) => `${r} ${n}`).join(', ')}.`, '');
out.push(`Most common Resonants: ${count(slots.map((s) => s.r.name)).slice(0, 12).map(([r, n]) => `${r} ${n}`).join(', ')}.`, '');
const perPlayer = count(players.map((p) => p.resonants.length));
out.push(`Resonants per player: ${perPlayer.sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}: ${n} players`).join(', ')}.`, '');

out.push('## Affinities', '');
const whole = slots.filter((s) => !s.r.affinity.includes('.')).length;
const hadChoice = slots.filter((s) => usefulSpecs(s.data, useful).some((sp) => familyOf(sp) === familyOf(s.r.affinity) && sp.split('.')[1] !== familyOf(sp)));
out.push(`- Whole family: ${pct(whole, slots.length)}; one specialization: ${pct(slots.length - whole, slots.length)}.`);
out.push(`- Of the Affinities where the Resonant had a narrower specialization to offer (${hadChoice.length}), ${pct(hadChoice.filter((s) => !s.r.affinity.includes('.')).length, hadChoice.length)} came out as the whole family (target ${pct(TOP_LEVEL_CHANCE * 100, 100)}). The rest had no narrower one, so they're whole families.`, '');
out.push(table(['Family', 'Affinities', 'Share', 'Whole family', 'Specializations', 'Has a spell now'],
  count(slots.map((s) => familyOf(s.r.affinity))).map(([f, n]) => {
    const inFamily = slots.filter((s) => familyOf(s.r.affinity) === f);
    const specs = count(inFamily.filter((s) => s.r.affinity.includes('.')).map((s) => specName.get(s.r.affinity)!));
    return [familyName.get(f)!, n, pct(n, slots.length), inFamily.filter((s) => !s.r.affinity.includes('.')).length,
      specs.map(([sp, k]) => `${sp} ${k}`).join(', ') || '—', spellFamilies.has(f) ? 'yes' : 'no'];
  })));
out.push('');

out.push('## Against the current spells', '');
out.push(`The prototype spells use: ${spellMagic.map(label).join(', ')}, plus neutral spells.`, '');
const matchable = slots.filter((s) => spellFamilies.has(familyOf(s.r.affinity)));
const specialist = slots.filter((s) => spellSpecs.has(s.r.affinity));
out.push(`- ${pct(matchable.length, slots.length)} of Affinities are in a family that has a spell now (they'd get the family bonus).`);
out.push(`- ${specialist.length} Affinities (${pct(specialist.length, slots.length)}) are exactly a specialization that has a spell (they'd get the specialist bonus).`);
const playersMatching = players.filter((p) => p.resonants.some((r) => spellFamilies.has(familyOf(r.affinity))));
out.push(`- ${pct(playersMatching.length, players.length)} of players have at least one Affinity that some current spell matches.`);
const unmatched = count(slots.filter((s) => !spellFamilies.has(familyOf(s.r.affinity))).map((s) => familyName.get(familyOf(s.r.affinity))!));
out.push(`- Families players have that no spell uses yet: ${unmatched.map(([f, n]) => `${f} (${n})`).join(', ')}.`, '');

out.push('## Every player', '');
out.push(table(['Player', 'Resonants (Affinity)'], players.map((p) => [`${p.name} (${p.id})`, p.resonants.map((r) => `${r.name} (${label(r.affinity)})`).join(' · ')])));
out.push('');

mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
const reportPath = `reports/resonants-${date}.md`;
writeFileSync(new URL(`../${reportPath}`, import.meta.url), out.join('\n'));
console.log(`Report written to ${reportPath}`);
