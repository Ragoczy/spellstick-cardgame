// Generates placeholder card art (players and spells) with OpenAI's image API and saves it to assets/cards/<card id>.webp.
//
//   npm run generate-art -- --dry-run      (prints the prompts; costs nothing)
//   npm run generate-art -- --limit 5      (makes the first 5 missing images, to check the style)
//   npm run generate-art                   (makes every missing image)
//   npm run generate-art -- --only pl-001,pl-002 --force   (remakes those two)
//   npm run generate-art -- --spells --limit 5   (only spells; --players or --physical for only those)
//
// Needs OPENAI_API_KEY in a .env file at the repo root or in scripts/ (git ignores both). Optional settings there:
//   OPENAI_IMAGE_MODEL    default gpt-image-1
//   OPENAI_IMAGE_QUALITY  low, medium (default), or high. Medium is about 6 US cents an image.
//
// The shared player pool, the spell library, and the draft physical attack cards
// (prompts in scripts/physical-art.ts) get art. The canon promo card is left alone on purpose: how that
// character looks is Paul's call. Cards that already have art are skipped unless --force is
// given, so to replace one bad image, delete it (or use --only <id> --force) and run again.
//
// The art is a placeholder until commissioned art replaces it. It aims at the same polished
// fantasy card-game look the commissioned art will have. Every image uses the same style text
// (STYLE below), so a different look for the whole set is one edit here plus a --force run.
// Spell prompts (family look, tier scale, and a scene for each spell) are in scripts/spell-art.ts.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { familyOf, type CardDef, type PlayerRole } from '../src/engine/cards';
import { physicalPromptFor } from './physical-art';
import { spellPromptFor } from './spell-art';

/** Every kind of card that gets art: players, spells, and physical attack cards. */
type ArtCard = CardDef;

const ART_DIR = 'assets/cards';
/** Landscape, for the card's 4:3 art window (see .cf-art in styles.css); the sides get trimmed a little. */
const IMAGE_SIZE = '1536x1024';
/** How many images to request at once. Higher can hit OpenAI's rate limit on new accounts. */
const PARALLEL = 3;
const MAX_TRIES = 4;

/** The look every card shares, players and spells alike. */
const STYLE = [
  'Polished digital fantasy trading card illustration, in the style of modern fantasy card games:',
  'painterly digital rendering, vivid saturated color, bright clean daylight, crisp detail, a',
  'dynamic heroic action pose.',
  'Background: an outdoor spellstick field on a bright day, with stands and sky behind, softly',
  'detailed so it does not distract.',
  'The sport is spellstick: lacrosse played with magic, in a present-day world where magic is hidden.',
  'No logos, no numbers, no text, no letters, and no card border anywhere in the picture.',
].join(' ');

/** Player cards: one athlete, posed like a portrait. Spells are framed differently (scripts/spell-art.ts). */
const PLAYER_STYLE = [
  'Wide landscape composition: one athlete only, shown from the knees up, centered, filling most of',
  'the height, her face in the upper third, with some open space on both sides.',
  'She wears a plain charcoal-grey athletic shirt and shorts: no pads, no gloves, no arm guards,',
  'no helmet, bare hands.',
  'She carries a spellstick: a lacrosse-style stick with a small net pocket and faintly glowing',
  'runes carved along the shaft.',
].join(' ');

/** Pose by player type, so each type reads at a glance. */
const POSES: Record<PlayerRole, string> = {
  striker: 'She is winding up to shoot, stick drawn back over her shoulder, fierce and focused.',
  runner: 'She is mid-sprint, leaning forward, cradling the ball in her stick pocket.',
  playmaker: 'She is looking upfield, about to pass, calm and alert.',
  allrounder: 'She stands ready, stick held across her body, confident.',
  anchor: 'She is planted in a wide, low stance, stick held across her body like a barrier.',
  stopper: 'She is lunging to block, stick angled to intercept a pass.',
  goalie:
    'She is the goalkeeper: a stick with a wider pocket, crouched and guarding a ring-shaped goal ' +
    'behind her.',
};

/** A touch of magic by the family of her first Resonant's Affinity. Families not listed get a plain glow. */
const FAMILY_MAGIC: Record<string, string> = {
  fire: 'Bright orange flames and embers curl around her hands and stick.',
  water: 'Swirling ribbons of clear blue water circle her hands and stick.',
  earth: 'Chunks of rock and a moss-green glow float around her hands and stick.',
  air: 'Pale swirling gusts of wind whip around her, lifting her hair.',
};

// Small variations so 100 players don't all get the same face. Picked from the card id, so the
// same card always gets the same description. Canon: spellstick players are white, because
// spellstick magic is a European tradition (docs/GAME_DESIGN.md, "Canon and content constraints").
const LOOKS = [
  'freckles', 'rosy cheeks', 'a sharp jaw', 'a few freckles across her nose', 'high cheekbones',
  'a strong brow', 'a determined grin', 'a small scar on her chin',
];
const HAIR = [
  'dark curls tied back', 'a long red braid', 'a blonde ponytail', 'long black hair in a ponytail',
  'auburn hair in a high bun', 'shoulder-length brown hair tied back', 'silver-streaked dark hair in a bun',
  'wavy sandy-blonde hair in a braid', 'long black hair in a low braid', 'chestnut curls tied up',
];
const BUILDS = ['lean and wiry', 'tall and athletic', 'stocky and strong', 'compact and quick'];
const AGES = ['early twenties', 'mid twenties', 'late twenties', 'early thirties'];

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function pick<T>(list: T[], id: string, salt: string): T {
  return list[hash(id + salt) % list.length]!;
}

/** The full prompt for one card. */
function promptFor(card: ArtCard): string {
  if (card.kind === 'physical') return physicalPromptFor(card, STYLE);
  if (card.kind === 'spell') return spellPromptFor(card, STYLE, pick(HAIR, card.id, 'hair'));
  const role: PlayerRole = card.kind === 'goalie' ? 'goalie' : card.role ?? 'allrounder';
  const family = familyOf(card.resonants[0]?.affinity ?? '');
  const person =
    `The athlete is a white European woman in her ${pick(AGES, card.id, 'age')}, ${pick(BUILDS, card.id, 'build')}, ` +
    `with fair, light skin, a clearly feminine face, ${pick(LOOKS, card.id, 'look')}, and ${pick(HAIR, card.id, 'hair')}.`;
  const magic = FAMILY_MAGIC[family] ?? `A faint glow of ${family} magic surrounds her hands.`;
  return [STYLE, PLAYER_STYLE, person, POSES[role], magic].join(' ');
}

// ---- Command line ----

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const dryRun = flag('dry-run');
const force = flag('force');
const limit = option('limit') ? Number(option('limit')) : Infinity;
const only = option('only')?.split(',').map((id) => id.trim());
const spellsOnly = flag('spells');
const playersOnly = flag('players');
const physicalOnly = flag('physical');

// The key can live in .env at the repo root or in scripts/.env.
for (const envFile of ['.env', 'scripts/.env']) if (existsSync(envFile)) process.loadEnvFile(envFile);
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const quality = process.env.OPENAI_IMAGE_QUALITY || 'medium';

/** Card ids that already have art, in any image format. */
function existingArt(): Set<string> {
  if (!existsSync(ART_DIR)) return new Set();
  return new Set(
    readdirSync(ART_DIR)
      .filter((file) => /\.(png|webp|jpe?g)$/i.test(file))
      .map((file) => file.replace(/\.[^.]+$/, '')),
  );
}

async function generate(card: ArtCard): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        prompt: promptFor(card),
        size: IMAGE_SIZE,
        quality,
        output_format: 'webp',
        output_compression: 85,
        n: 1,
      }),
    });
    if (response.ok) {
      const body = (await response.json()) as { data: { b64_json: string }[] };
      writeFileSync(`${ART_DIR}/${card.id}.webp`, Buffer.from(body.data[0]!.b64_json, 'base64'));
      return;
    }
    const message = await response.text();
    // Out of credits also comes back as 429, but waiting won't fix it: stop the whole run.
    if (message.includes('insufficient_quota')) {
      console.error('The OpenAI account is out of API credits. Add some at https://platform.openai.com/settings/organization/billing/');
      process.exit(1);
    }
    // Rate limits and server hiccups are worth waiting out; anything else (a bad key, a prompt the
    // safety filter refused) is reported and skipped.
    const retry = response.status === 429 || response.status >= 500;
    if (!retry || attempt >= MAX_TRIES) throw new Error(`HTTP ${response.status}: ${message.slice(0, 300)}`);
    const waitSeconds = 20 * attempt;
    console.log(`  ${card.id}: HTTP ${response.status}, trying again in ${waitSeconds}s`);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
  }
}

async function main(): Promise<void> {
  const cardSet = JSON.parse(readFileSync('data/cards.prototype.json', 'utf8')) as { cards: CardDef[] };
  // With --spells, --players, or --physical, only that kind; with none of them, every kind.
  const anyKindFlag = spellsOnly || playersOnly || physicalOnly;
  const wanted = (c: ArtCard): boolean => {
    if (only) return only.includes(c.id);
    if (c.kind === 'physical') return !anyKindFlag || physicalOnly;
    if (c.kind === 'spell') return (!anyKindFlag || spellsOnly) && c.team === 'library';
    return (!anyKindFlag || playersOnly) && c.team === 'pool';
  };
  const cards = cardSet.cards.filter(wanted);
  const have = existingArt();
  const todo = cards.filter((c) => force || !have.has(c.id)).slice(0, limit);

  if (dryRun) {
    for (const card of todo) console.log(`${card.id} (${card.name})\n${promptFor(card)}\n`);
    console.log(`${todo.length} image(s) would be made.`);
    return;
  }
  if (!apiKey) {
    console.error('OPENAI_API_KEY is missing. Add it to a .env file at the repo root.');
    process.exit(1);
  }
  if (todo.length === 0) {
    console.log('Every card already has art. Use --force to remake it.');
    return;
  }

  mkdirSync(ART_DIR, { recursive: true });
  console.log(`Making ${todo.length} image(s) with ${model} at ${quality} quality...`);
  const failed: string[] = [];
  let done = 0;
  const queue = [...todo];
  async function worker(): Promise<void> {
    for (let card = queue.shift(); card; card = queue.shift()) {
      try {
        await generate(card);
        done++;
        console.log(`  ${card.id} ${card.name} (${done}/${todo.length})`);
      } catch (error) {
        failed.push(card.id);
        console.log(`  ${card.id} failed: ${(error as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  console.log(`Done: ${done} made, ${failed.length} failed.`);
  if (failed.length > 0) console.log(`Run again to retry: npm run generate-art -- --only ${failed.join(',')}`);
}

await main();
