// Measures how much each library spell helps a team win, and sorts the spells into power tiers
// named like card rarities (Legendary, Rare, Uncommon, Common). Writes reports/spell-tiers-<date>.md
// (and .json, the measurements) and each spell's "tier" in data/cards.prototype.json.
//
//   npm run spell-tiers                      (1000 games per spell, split across CPU cores)
//   npm run spell-tiers -- --games 400
//   npm run spell-tiers -- --workers 8           (fewer processes, if memory is short)
//   npm run spell-tiers -- --from reports/spell-tiers-2026-10-14.json   (rewrite the report only)
//   npm run spell-tiers -- --effects shield,boost --set shieldEffect=half --label shield-half
//       (only some effects, or a rule what-if: writes reports/spell-tiers-<date>-<label>.md and
//        leaves the tiers in the card data alone)
//
// The test: both teams use Team A's 16 spells and players dealt from the pool. The test team
// swaps four rarely-cast spells (Tailwind, Precognition, Mend, Blast Shot) for four copies of
// the spell being tested. How often it then wins, against a control run with no swap, is the
// spell's power. It's a measure of the spell as the computer plays it: a spell the computer
// misuses or never casts (swap) scores low even if a person could do more with it.

import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { heuristicAgent } from '../src/ai/heuristic';
import { runGame } from '../src/ai/runGame';
import { prototypeCards } from '../src/data/prototype';
import { LIBRARY_TEAM, type CardSet, type SpellCardDef } from '../src/engine/cards';
import { makeConfig } from '../src/engine/config';
import { arg, args, configOverrides } from '../src/sim/configArgs';

const games = Number(arg('games') ?? 1000);
const config = makeConfig(configOverrides(args('set')));
const effects = arg('effects')?.split(',');
const library = prototypeCards.cards.filter((c): c is SpellCardDef =>
  c.kind === 'spell' && c.team === LIBRARY_TEAM && (!effects || effects.includes(c.ability.effect)));
/** Only some effects, or a rule what-if: its own report, and the card data's tiers stay as they are. */
const partial = effects !== undefined || args('set').length > 0;
const label = arg('label') ?? 'partial';
const base = prototypeCards.teams.find((t) => t.id === 'A')!.spells!;
const SWAPPED_OUT = ['sp-tailwind', 'sp-precognition', 'sp-mend', 'sp-blast-shot'];
const COPIES = SWAPPED_OUT.length;
const CONTROL = 'control';
const tmp = new URL('../reports/.spell-tiers/', import.meta.url);

interface Result { id: string; games: number; points: number; casts: number }

/**
 * Plays the games for one spell (or the control) and returns the test team's score. Each spell
 * gets its own games, so spells with the same effect are separate samples and their average is
 * more precise. Every spell is compared with the control, so it gets four times the games.
 */
function measure(id: string, index: number): Result {
  const count = id === CONTROL ? 4 * games : games;
  const testSpells = id === CONTROL ? base : [...base.filter((s) => !SWAPPED_OUT.includes(s)), ...Array<string>(COPIES).fill(id)];
  const cardSet: CardSet = {
    ...prototypeCards,
    teams: prototypeCards.teams.map((t) => ({ ...t, spells: t.id === 'A' ? testSpells : base })),
  };
  let points = 0;
  let casts = 0;
  for (let g = 0; g < count; g++) {
    const seed = 9_000_000 + index * 10_000 + g;
    const record = runGame({ seed, cardSet, config }, { A: heuristicAgent(seed * 2 + 1, config), B: heuristicAgent(seed * 2 + 2, config) });
    const winner = record.final.result?.winner ?? null;
    points += winner === 'A' ? 1 : winner === null ? 0.5 : 0;
    casts += record.events.filter((e) => e.type === 'spellCast' && e.side === 'A' && e.card.def.id === id).length;
  }
  return { id, games: count, points, casts };
}

// ---- Worker: measure a share of the spells and write them to a file ----

const shard = arg('shard');
if (shard !== undefined) {
  // Worker 0 plays the control, which has four times the games; the rest share the spells.
  const [index, count] = shard.split('/').map(Number) as [number, number];
  const ids = index === 0 ? [{ id: CONTROL, i: 0 }] : library.map((s, i) => ({ id: s.id, i: i + 1 })).filter(({ i }) => i % (count - 1) === index - 1);
  writeFileSync(new URL(`shard-${index}.json`, tmp), JSON.stringify(ids.map(({ id, i }) => measure(id, i))));
  process.exit(0);
}

// ---- Coordinator: run the workers in parallel and save the results ----

interface Saved { games: number; control: number; rows: { id: string; edge: number; castsPerGame: number }[] }

async function measureAll(): Promise<Saved> {
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const workers = Math.max(2, Math.min(Number(arg('workers') ?? availableParallelism() - 2), 20, library.length + 1));
  console.log(`Measuring ${library.length} spells (${games} games each) and a control (${4 * games}) on ${workers} workers...`);
  await Promise.all(Array.from({ length: workers }, (_, i) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1), '--shard', `${i}/${workers}`], { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} failed`))));
  })));
  const results: Result[] = Array.from({ length: workers }, (_, i) => JSON.parse(readFileSync(new URL(`shard-${i}.json`, tmp), 'utf8')) as Result[]).flat();
  rmSync(tmp, { recursive: true, force: true });
  const score = (r: Result) => (100 * r.points) / r.games;
  const control = score(results.find((r) => r.id === CONTROL)!);
  const rows = results.filter((r) => r.id !== CONTROL)
    .map((r) => ({ id: r.id, edge: Number((score(r) - control).toFixed(2)), castsPerGame: Number((r.casts / r.games).toFixed(3)) }));
  return { games, control: Number(control.toFixed(2)), rows };
}

// ---- The report ----

/** Spells with the same effect and numbers are the same card for different magic. */
function variant(spell: SpellCardDef): string {
  const a = spell.ability;
  if (a.effect === 'boost') return a.params.when ? `boost +${a.params.amount}, only ${a.params.when}` : `boost +${a.params.amount}`;
  return a.effect.replace(/_/g, ' ');
}

/**
 * Tiers come from each effect's average edge, since same-effect spells differ only in whose
 * magic they match. Cut points (win-rate points over the control) sit in the gaps the
 * 2026-10-14 run showed.
 */
const TIERS = [
  { name: 'Legendary', rank: 1, min: 15, about: 'Dominant: wins contests outright or nearly so, in almost any contest.' },
  { name: 'Rare', rank: 2, min: 7, about: 'Strong: a big swing in a contest that comes up often, or a steal that wins the ball.' },
  { name: 'Uncommon', rank: 3, min: 2, about: 'Useful: helps, but less often or by less.' },
  { name: 'Common', rank: 4, min: -Infinity, about: 'No clear edge: no better than the rarely-cast spells they replaced, as the computer plays them.' },
];
const tierFor = (edge: number) => TIERS.find((t) => edge >= t.min)!;

function writeReport(saved: Saved): void {
  const byId = new Map(library.map((s) => [s.id, s]));
  const rows = saved.rows.map((r) => ({ ...r, spell: byId.get(r.id)!, variant: variant(byId.get(r.id)!) }));
  const variants = [...new Set(rows.map((r) => r.variant))].map((v) => {
    const members = rows.filter((r) => r.variant === v);
    const edge = members.reduce((sum, r) => sum + r.edge, 0) / members.length;
    return { variant: v, members, edge, tier: tierFor(edge).name };
  }).sort((a, b) => b.edge - a.edge);
  // One standard error of a spell's edge: its own games plus the control's (four times as many).
  const noise = 100 * Math.sqrt(0.25 / saved.games) * Math.sqrt(1 + 1 / 4);

  const sign = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;
  const date = new Date().toISOString().slice(0, 10);
  const out: string[] = [];
  out.push(`# Spell power tiers, ${date}${partial ? ` (${label})` : ''}`, '');
  if (partial) out.push(`Only some spells${effects ? ` (effects: ${effects.join(', ')})` : ''}, with config changes: ${args('set').join(', ') || 'none'}. The tiers in the card data are unchanged.`, '');
  out.push(`Made by \`npm run spell-tiers\`: ${saved.games} computer games per spell. The test team swaps four rarely-cast spells (${SWAPPED_OUT.map((id) => prototypeCards.cards.find((c) => c.id === id)!.name).join(', ')}) for ${COPIES} copies of the spell; the other team keeps Team A's 16. "Edge" is how many more points in 100 games the test team scores than with no swap (a win is 1, a draw ½). The control team scored ${saved.control.toFixed(1)}. Luck moves one spell's edge by about ${noise.toFixed(1)} points either way (one standard error); an effect's average over several spells is steadier, and an edge under about 2 is no clear edge at all.`, '');
  for (const tier of TIERS) {
    const inTier = variants.filter((v) => v.tier === tier.name);
    if (!inTier.length) continue;
    out.push(`## ${tier.name} (tier ${tier.rank})`, '', tier.about, '');
    out.push('| Effect | Average edge | Spells (edge, casts per game with 4 copies) |');
    out.push('| --- | --- | --- |');
    for (const v of inTier) {
      const spells = [...v.members].sort((a, b) => b.edge - a.edge).map((r) => `${r.spell.name} (${sign(r.edge)}, ${r.castsPerGame.toFixed(2)})`).join(', ');
      out.push(`| ${v.variant} | ${sign(v.edge)} | ${spells} |`);
    }
    out.push('');
  }
  const name = partial ? `spell-tiers-${date}-${label}` : `spell-tiers-${date}`;
  writeFileSync(new URL(`../reports/${name}.md`, import.meta.url), out.join('\n'));
  writeFileSync(new URL(`../reports/${name}.json`, import.meta.url), `${JSON.stringify(saved, null, 2)}\n`);
  console.log(`Report written to reports/${name}.md`);
  if (!partial) writeTiersToCards(variants);
}

/**
 * Writes each library spell's tier into data/cards.prototype.json, the master card data. A spell
 * takes its effect's tier, since same-effect spells measured the same within luck.
 */
function writeTiersToCards(variants: { variant: string; edge: number }[]): void {
  const path = new URL('../data/cards.prototype.json', import.meta.url);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { cards: Record<string, unknown>[] };
  const effectEdge = new Map(variants.map((v) => [v.variant, v.edge]));
  const byId = new Map(library.map((s) => [s.id, s]));
  const counts = new Map<string, number>();
  raw.cards = raw.cards.map((card) => {
    const spell = byId.get(card.id as string);
    if (!spell) return card;
    const tier = tierFor(effectEdge.get(variant(spell))!).name.toLowerCase();
    counts.set(tier, (counts.get(tier) ?? 0) + 1);
    // Rebuild the card so "tier" sits after "magic".
    const { tier: _old, ...rest } = card;
    return Object.fromEntries(Object.entries(rest).flatMap(([k, v]) => (k === 'magic' ? [[k, v], ['tier', tier]] : [[k, v]])));
  });
  writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`);
  console.log(`Tiers written to data/cards.prototype.json: ${[...counts].map(([t, n]) => `${n} ${t}`).join(', ')}`);
}

const from = arg('from');
let saved: Saved;
if (from) saved = JSON.parse(readFileSync(from, 'utf8')) as Saved;
else {
  saved = await measureAll();
  // Saved before the report is written, so a long run is never lost (rewrite it with --from).
  writeFileSync(new URL('../reports/.spell-tiers-last.json', import.meta.url), JSON.stringify(saved));
}
writeReport(saved);
