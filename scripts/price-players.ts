// Prices the 100 named players from a value measurement (PLAN.md, Phase f).
//
//   npm run price-players                                    (the measurements the prices use now)
//   npm run price-players -- --from reports/value-2026-10-15.json
//   npm run price-players -- --check                         (print the costs, change nothing)
//   npm run price-players -- --by-type reports/value-2026-10-15-by-type.json   (field stats by type group)
//   npm run price-players -- --type-weight 1                 (all by type; the default is TYPE_WEIGHT)
//
// Writes data/player-values.json (what each part is worth, and the scale) and each player's
// `cost` in data/cards.prototype.json, then prints the team cap to put in src/engine/config.ts.
// Run it again after scripts/generate-players.ts and scripts/assign-abilities.ts, which don't
// keep costs.

import { readFileSync, writeFileSync } from 'node:fs';
import { FIELD_STATS, playerCost, playerWorth, TYPE_GROUPS, type FieldStatName, type PlayerValues, type PricedPart, type TypeGroup } from '../src/data/pricing';
import { POOL_TEAM, type PlayerCardDef } from '../src/engine/cards';
import { DEFAULT_CONFIG } from '../src/engine/config';
import { arg } from '../src/sim/configArgs';

/**
 * The measurements the prices use now (rules v0.17 with Shaken substitutes), and how much of the
 * by-type values to use: 0.4 by type and 0.6 all-player is the blend that meets both roster
 * targets (reports/sim-2026-10-15-v17f.md).
 */
const VALUES = 'reports/value-2026-10-15-v17g.json';
const BY_TYPE = 'reports/value-2026-10-15-v17g-by-type.json';
const TYPE_WEIGHT = 0.4;

/** The cheapest field player costs this, and the average one this. */
const FLOOR_COST = 6;
const AVERAGE_COST = 10;

interface Measured { key: string; perPoint: number; perPointLow: number; perPointHigh: number }

const from = arg('from') ?? VALUES;
const byTypeFrom = arg('by-type') ?? BY_TYPE;
const measured = JSON.parse(readFileSync(from, 'utf8')) as { items: Measured[] };
if (byTypeFrom) measured.items.push(...(JSON.parse(readFileSync(byTypeFrom, 'utf8')) as { items: Measured[] }).items);
const notes: string[] = [];
const value = (key: string, label: string): number => {
  const m = measured.items.find((i) => i.key === key);
  if (!m) throw new Error(`${from} has no measurement for "${key}".`);
  if (m.perPoint < 0) {
    notes.push(`${label} measured ${m.perPoint.toFixed(3)} (below 0), so it counts 0.`);
    return 0;
  }
  return m.perPoint;
};

const cardsPath = 'data/cards.prototype.json';
const cardSet = JSON.parse(readFileSync(cardsPath, 'utf8')) as { cards: (PlayerCardDef & Record<string, unknown>)[] };
const players = cardSet.cards.filter((c) => c.team === POOL_TEAM && (c.kind === 'field' || c.kind === 'goalie'));
const field = players.filter((p) => p.kind === 'field');
const goalies = players.filter((p) => p.kind === 'goalie');

const lowest = (list: number[]) => Math.min(...list);
const floor: Record<PricedPart, number> = {
  speed: lowest(field.map((p) => p.speed)),
  shot: lowest(field.map((p) => p.shot)),
  defense: lowest(field.map((p) => p.defense)),
  faceoff: lowest(field.map((p) => p.faceoff)),
  toughness: lowest(field.map((p) => p.toughness)),
  save: lowest(goalies.map((p) => p.save)),
  resonants: lowest(players.map((p) => p.resonants.length)),
};

// By-type values, blended with the all-player value: 1 is all by type, 0 all flat.
const typeWeight = Number(arg('type-weight') ?? TYPE_WEIGHT);
const byType = byTypeFrom
  ? Object.fromEntries(Object.keys(TYPE_GROUPS).map((group) => [group, Object.fromEntries(FIELD_STATS.map((stat) => {
    const typed = value(`${stat}@${group}`, `${stat} on ${group}`);
    return [stat, typeWeight * typed + (1 - typeWeight) * value(stat, stat)];
  }))])) as Record<TypeGroup, Record<FieldStatName, number>>
  : undefined;
const values: PlayerValues = {
  measured: [from, byTypeFrom].filter(Boolean).map((f) => f!.replace(/\.json$/, '.md')).join(' and '),
  perPoint: {
    speed: value('speed', 'Speed'), shot: value('shot', 'Shot'), defense: value('defense', 'Defense'), faceoff: value('faceoff', 'Faceoff'),
    toughness: value('toughness', 'Toughness'), save: value('save', 'Save'), resonants: value('resonant', 'A Resonant'),
  },
  ...(byType ? { byType, typeWeight } : {}),
  abilities: { hits_harder: value('heavy', 'Heavy hands'), hard_to_hurt: value('sturdy', 'Sturdy'), quick: value('quick', 'Quick') },
  floor,
  fieldBase: FLOOR_COST,
  goalieBase: 0,
  scale: 1,
};
const average = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
// The cheapest field player costs FLOOR_COST and the average one AVERAGE_COST.
const fieldWorth = field.map((p) => playerWorth(p, values));
values.scale = (AVERAGE_COST - FLOOR_COST) / (average(fieldWorth) - Math.min(...fieldWorth));
values.fieldBase = FLOOR_COST - values.scale * Math.min(...fieldWorth);
// Goalies average the same as field players; Save sets which goalie costs more.
values.goalieBase = AVERAGE_COST - values.scale * average(goalies.map((p) => playerWorth(p, values)));
const round3 = (n: number) => Math.round(n * 1000) / 1000;
values.scale = round3(values.scale);
values.fieldBase = round3(values.fieldBase);
values.goalieBase = round3(values.goalieBase);

const costs = new Map(players.map((p) => [p.id, playerCost(p, values)]));
const cap = Math.round(DEFAULT_CONFIG.deckFieldPlayers * average(field.map((p) => costs.get(p.id)!)) + DEFAULT_CONFIG.deckGoalies * average(goalies.map((p) => costs.get(p.id)!)));

const spread = (list: PlayerCardDef[]) => {
  const c = list.map((p) => costs.get(p.id)!);
  return `${Math.min(...c)} to ${Math.max(...c)}, average ${average(c).toFixed(2)}`;
};
console.log(`From ${values.measured}`);
console.log(`Field players: ${spread(field)}. Goalies: ${spread(goalies)}.`);
console.log(`Team cap (average 24-player team): ${cap}`);
for (const note of notes) console.log(`Note: ${note}`);

if (!process.argv.includes('--check')) {
  writeFileSync('data/player-values.json', `${JSON.stringify(values, null, 2)}\n`);
  cardSet.cards = cardSet.cards.map((card) => {
    if (!costs.has(card.id)) return card;
    // Cost goes right after the name, where it's printed; bonus points are gone (v0.17).
    const { bonusPoints: _bonus, cost: _old, ...rest } = card as typeof card & { bonusPoints?: number };
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(rest)) {
      out[key] = v;
      if (key === 'name') out.cost = costs.get(card.id);
    }
    return out as typeof card;
  });
  writeFileSync(cardsPath, `${JSON.stringify(cardSet, null, 2)}\n`);
  console.log('Wrote data/player-values.json and the costs in data/cards.prototype.json.');
}
