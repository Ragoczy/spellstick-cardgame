// Measures what each part of a card is worth in wins (PLAN.md, Phase f), for pricing players.
// Writes reports/value-<date>.md (and .json, the measurements).
//
//   npm run measure-value                          (5,000 seeds a change, each played twice)
//   npm run measure-value -- --games 1000 --workers 8
//   npm run measure-value -- --only speed,save     (just some changes)
//   npm run measure-value -- --physical            (also each physical card, 1,000 seeds each)
//   npm run measure-value -- --by-type --name by-type   (each field stat on each type group only)
//   npm run measure-value -- --from reports/value-2026-10-15.json   (rewrite the report only)
//
// The test: one team gets a change (for example +1 Speed on every field player in its deck) and
// plays an unchanged team. Each seed is played twice, with the changed team as A and then as B, so
// the deal and the first player's luck cancel out, and an unchanged team would score exactly 50%.
// The change's "edge" is how far above 50% the changed team scores (a win is 1, a draw ½), with a
// 95% interval from the spread of results per seed. Dividing by the number of cards that got the
// change gives the worth of one point on one card, which is what a card's cost adds up.
//
// It measures the cards as the computer plays them: a change the computer misuses scores low.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { heuristicAgent } from '../src/ai/heuristic';
import { runGame } from '../src/ai/runGame';
import { prototypeCards } from '../src/data/prototype';
import type { CardDef, FieldCardDef, PhysicalCardDef, PlayerAbility, PlayerCardDef } from '../src/engine/cards';
import { makeConfig } from '../src/engine/config';
import type { Side } from '../src/engine/field';
import { seedToState, randomInt } from '../src/engine/rng';
import type { GameState } from '../src/engine/state';
import { meanInterval } from '../src/sim/confidence';
import { arg } from '../src/sim/configArgs';
import { FIELD_STATS, TYPE_GROUPS, typeGroup } from '../src/data/pricing';
import { drawAffinity, drawResonant, usefulSpecs, type ResonantData } from './resonant-draw';

const config = makeConfig();
const games = Number(arg('games') ?? 5000);
const physicalGames = Number(arg('physical-games') ?? 1000);
const withPhysical = process.argv.includes('--physical');
const only = arg('only')?.split(',');
const tmp = new URL('../reports/.measure-value/', import.meta.url);

// ---- The changes ----

/** One change to measure: which cards get it, and how many cards that is in a deck. */
interface Change {
  key: string;
  label: string;
  /** What one card becomes, or null to leave it alone. */
  apply: (def: CardDef) => CardDef | null;
  /** Cards in one deck that get it (the edge is divided by this). */
  cards: number;
  /** Points per card the change adds (−1 for Toughness, so its worth comes out per point of Toughness). */
  points: number;
}

const field = (f: (d: FieldCardDef) => FieldCardDef) => (d: CardDef) => (d.kind === 'field' ? f(d) : null);
const withAbility = (ability: PlayerAbility) => field((d) => ({ ...d, ability }));

/** An extra Resonant for every player, drawn the way scripts/generate-players.ts draws them. */
const extraResonant: Map<string, { id: string; name: string; affinity: string }> = (() => {
  const magic = JSON.parse(readFileSync(new URL('../data/warlock-resonants.json', import.meta.url), 'utf8')) as { resonants: ResonantData[] };
  const usefulMagic = JSON.parse(readFileSync(new URL('../data/useful-magic.json', import.meta.url), 'utf8')) as { specializations: { id: string }[] };
  const useful = new Set(usefulMagic.specializations.map((s) => s.id));
  const usefulResonants = magic.resonants.filter((r) => usefulSpecs(r, useful).length > 0);
  let rng = seedToState(4242);
  const roll = (max: number) => {
    let v: number;
    [v, rng] = randomInt(rng, max);
    return v;
  };
  const out = new Map<string, { id: string; name: string; affinity: string }>();
  for (const card of prototypeCards.cards) {
    if (card.kind !== 'field' && card.kind !== 'goalie') continue;
    const avoid = { ids: new Set(card.resonants.map((r) => r.id ?? '')), names: new Set(card.resonants.map((r) => r.name)) };
    const r = drawResonant(roll, usefulResonants, avoid);
    out.set(card.id, { id: r.id, name: r.name, affinity: drawAffinity(roll, r, useful) });
  }
  return out;
})();

const FIELD = config.deckFieldPlayers;
const CHANGES: Change[] = [
  { key: 'speed', label: '+1 Speed', apply: field((d) => ({ ...d, speed: d.speed + 1 })), cards: FIELD, points: 1 },
  { key: 'shot', label: '+1 Shot', apply: field((d) => ({ ...d, shot: d.shot + 1 })), cards: FIELD, points: 1 },
  { key: 'defense', label: '+1 Defense', apply: field((d) => ({ ...d, defense: d.defense + 1 })), cards: FIELD, points: 1 },
  { key: 'faceoff', label: '+1 Faceoff', apply: field((d) => ({ ...d, faceoff: d.faceoff + 1 })), cards: FIELD, points: 1 },
  { key: 'toughness', label: '−1 Toughness', apply: field((d) => ({ ...d, toughness: d.toughness - 1 })), cards: FIELD, points: -1 },
  { key: 'save', label: '+1 Save (goalies)', apply: (d) => (d.kind === 'goalie' ? { ...d, save: d.save + 1 } : null), cards: config.deckGoalies, points: 1 },
  {
    key: 'resonant', label: 'One more Resonant (every player)',
    apply: (d) => (d.kind === 'field' || d.kind === 'goalie' ? { ...d, resonants: [...d.resonants, extraResonant.get(d.id)!] } : null),
    cards: FIELD + config.deckGoalies, points: 1,
  },
  { key: 'heavy', label: 'Heavy hands (every field player)', apply: withAbility({ effect: 'hits_harder', params: { amount: 1 } }), cards: FIELD, points: 1 },
  { key: 'sturdy', label: 'Sturdy (every field player)', apply: withAbility({ effect: 'hard_to_hurt', params: { amount: 1 } }), cards: FIELD, points: 1 },
  {
    key: 'quick', label: 'Quick: +2 Speed when evading (every field player; Toughness priced on its own)',
    apply: withAbility({ effect: 'bonus', params: { stat: 'speed', amount: 2, when: 'evade' } }), cards: FIELD, points: 1,
  },
];

/** Physical cards: 4 copies of the card replace these four in the changed team's Physical pile. */
const PHYSICAL_SWAPPED_OUT = ['ph-shirt-pull', 'ph-tripping', 'ph-hooking', 'ph-atomic-wedgie'];
const physicalDefs = prototypeCards.cards.filter((c): c is PhysicalCardDef => c.kind === 'physical');
const physicalChanges: Change[] = physicalDefs.map((target) => ({
  key: `ph:${target.id}`, label: target.name, cards: PHYSICAL_SWAPPED_OUT.length, points: 1,
  apply: (d) => (d.kind === 'physical' && PHYSICAL_SWAPPED_OUT.includes(d.id) ? { ...target, team: d.team } : null),
}));

/**
 * +1 to one field stat on just one type group's players (for example Defense on Anchors and
 * Stoppers). The edge is divided by that group's expected share of the 22 field players dealt.
 */
const fieldPool = prototypeCards.cards.filter((c): c is FieldCardDef => c.kind === 'field' && c.team === 'pool');
const byTypeChanges: Change[] = Object.entries(TYPE_GROUPS).flatMap(([group, roles]) => {
  const share = fieldPool.filter((c) => typeGroup(c.role) === group).length / fieldPool.length;
  return FIELD_STATS.map((stat): Change => ({
    key: `${stat}@${group}`, label: `+1 ${stat[0]!.toUpperCase()}${stat.slice(1)} on ${roles.join(' and ')} players`,
    apply: field((d) => (typeGroup(d.role) === group ? { ...d, [stat]: d[stat] + 1 } : d)),
    cards: FIELD * share, points: 1,
  }));
});
const byType = process.argv.includes('--by-type');

const allChanges = byType
  ? byTypeChanges
  : [...CHANGES.filter((c) => !only || only.includes(c.key)), ...(withPhysical ? physicalChanges : [])];

// ---- Playing ----

/** Gives one side's cards the change, after dealing and before anyone acts. */
function prepareFor(change: Change, side: Side) {
  return (state: GameState) => {
    for (const [uid, def] of Object.entries(state.cards)) {
      if (!uid.startsWith(side)) continue;
      const changed = change.apply(def);
      if (changed) state.cards[uid] = changed;
    }
  };
}

/** The changed team's points over the two games on one seed (as A, then as B). */
function playSeed(change: Change, seed: number): number {
  let points = 0;
  for (const side of ['A', 'B'] as Side[]) {
    const record = runGame({ seed, cardSet: prototypeCards, config }, { A: heuristicAgent(seed * 2 + 1, config), B: heuristicAgent(seed * 2 + 2, config) }, { prepare: prepareFor(change, side) });
    const winner = record.final.result?.winner ?? null;
    points += winner === side ? 1 : winner === null ? 0.5 : 0;
  }
  return points / 2;
}

const seedsFor = (change: Change) => Array.from({ length: change.key.startsWith('ph:') ? physicalGames : games }, (_, i) => 7_000_000 + i);

// ---- Worker: every n-th seed of every change ----

const worker = arg('worker');
if (worker !== undefined) {
  const [index, count] = worker.split('/').map(Number) as [number, number];
  const out: Record<string, number[]> = {};
  for (const change of allChanges) out[change.key] = seedsFor(change).filter((_, i) => i % count === index).map((seed) => playSeed(change, seed));
  writeFileSync(new URL(`shard-${index}.json`, tmp), JSON.stringify(out));
  process.exit(0);
}

// ---- Coordinator ----

interface Measured { key: string; label: string; seeds: number; edge: number; low: number; high: number; cards: number; points: number; perPoint: number; perPointLow: number; perPointHigh: number }
interface Saved { date: string; games: number; physicalGames: number; items: Measured[] }

async function measureAll(): Promise<Saved> {
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const workers = Math.max(1, Math.min(Number(arg('workers') ?? availableParallelism() - 2), 20));
  const total = allChanges.reduce((sum, c) => sum + 2 * seedsFor(c).length, 0);
  console.log(`Measuring ${allChanges.length} changes (${total} games) on ${workers} workers...`);
  await Promise.all(Array.from({ length: workers }, (_, i) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1), '--worker', `${i}/${workers}`], { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${i} failed`))));
  })));
  const shards = Array.from({ length: workers }, (_, i) => JSON.parse(readFileSync(new URL(`shard-${i}.json`, tmp), 'utf8')) as Record<string, number[]>);
  rmSync(tmp, { recursive: true, force: true });
  const items = allChanges.map((change): Measured => {
    const points = shards.flatMap((s) => s[change.key] ?? []);
    const iv = meanInterval(points);
    // Per point on one card: the edge (in points of win rate out of 100) spread over the cards that got it.
    const per = (x: number) => (100 * (x - 0.5)) / (change.cards * change.points);
    const [a, b] = [per(iv.low), per(iv.high)].sort((x, y) => x - y) as [number, number];
    return {
      key: change.key, label: change.label, seeds: points.length,
      edge: 100 * (iv.value - 0.5), low: 100 * (iv.low - 0.5), high: 100 * (iv.high - 0.5),
      cards: change.cards, points: change.points, perPoint: per(iv.value), perPointLow: a, perPointHigh: b,
    };
  });
  return { date: new Date().toISOString().slice(0, 10), games, physicalGames, items };
}

// ---- The report ----

function writeReport(saved: Saved): void {
  const f = (n: number, d = 2) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;
  const out: string[] = [];
  out.push(`# What a card is worth, ${saved.date}`, '');
  out.push(`Made by \`npm run measure-value\` (PLAN.md, Phase f). For each change, one team gets it and plays an unchanged team; each of ${saved.games} seeds is played twice, with the changed team as A and then as B, so an unchanged team would score exactly 50%. **Edge** is how many more points in 100 games the changed team scores (a win is 1, a draw ½), with a 95% interval. **Per point, per card** spreads the edge over the cards that got the change: it's what one point of that stat on one card adds, and what a card's cost adds up.`, '');
  out.push('| Change | Edge (95% interval) | Cards that got it | Per point, per card (95% interval) |');
  out.push('| --- | --- | --- | --- |');
  for (const m of saved.items.filter((i) => !i.key.startsWith('ph:'))) {
    if (m.key.includes('@')) continue;
    out.push(`| ${m.label} | ${f(m.edge, 1)} (${f(m.low, 1)} to ${f(m.high, 1)}) | ${m.cards} | ${f(m.perPoint, 3)} (${f(m.perPointLow, 3)} to ${f(m.perPointHigh, 3)}) |`);
  }
  const typed = saved.items.filter((i) => i.key.includes('@'));
  if (typed.length) {
    out.push('', '## By type group', '');
    out.push(`+1 to one stat on just one type group's field players. The edge is divided by that group's expected count among the 22 field players dealt (about ${typed[0]!.cards.toFixed(1)}).`, '');
    out.push('| Stat | Runners and Strikers | Playmakers and All-rounders | Anchors and Stoppers |', '| --- | --- | --- | --- |');
    for (const stat of FIELD_STATS) {
      const cell = (group: string) => {
        const m = typed.find((i) => i.key === `${stat}@${group}`);
        return m ? `${f(m.perPoint, 3)} (${f(m.perPointLow, 3)} to ${f(m.perPointHigh, 3)})` : '';
      };
      out.push(`| ${stat[0]!.toUpperCase()}${stat.slice(1)} | ${cell('attackers')} | ${cell('middle')} | ${cell('defenders')} |`);
    }
    out.push('', 'Per point, per card, with a 95% interval.');
  }
  const physical = saved.items.filter((i) => i.key.startsWith('ph:'));
  if (physical.length) {
    out.push('', '## Physical cards', '');
    out.push(`Each physical card: 4 copies replace ${PHYSICAL_SWAPPED_OUT.length} cards (${PHYSICAL_SWAPPED_OUT.join(', ')}) in the changed team's Physical pile; ${saved.physicalGames} seeds, each played twice. The edge compares the card with those four. Informational: physical cards aren't priced.`, '');
    out.push('| Card | Edge (95% interval) |', '| --- | --- |');
    for (const m of [...physical].sort((a, b) => b.edge - a.edge)) out.push(`| ${m.label} | ${f(m.edge, 1)} (${f(m.low, 1)} to ${f(m.high, 1)}) |`);
  }
  const name = arg('name');
  const path = `reports/value-${saved.date}${name ? `-${name}` : ''}`;
  writeFileSync(`${path}.md`, `${out.join('\n')}\n`);
  writeFileSync(`${path}.json`, `${JSON.stringify(saved, null, 2)}\n`);
  console.log(`Report written to ${path}.md`);
}

const from = arg('from');
let saved: Saved;
if (from) saved = JSON.parse(readFileSync(from, 'utf8')) as Saved;
else {
  saved = await measureAll();
  writeFileSync(new URL('../reports/.measure-value-last.json', import.meta.url), JSON.stringify(saved));
}
writeReport(saved);
