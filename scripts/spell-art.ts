// Prompts for placeholder spell art, used by generate-art.ts.
//
// Each spell picture shows a spellstick player casting, with the magic as the subject. Three parts
// make up each prompt:
//   - FAMILY_LOOK: the colors and motifs shared by every spell of one magic family, so a family
//     reads as a set across cards;
//   - TIER_LOOK: how big and dramatic the magic is, from a small common effect to an overwhelming
//     legendary one;
//   - SPELL_SCENES: what this one spell is doing, from its name and effect.
// A spell with no scene listed still gets art from its name, family, and tier.

import { familyOf, type SpellCardDef, type SpellTier } from '../src/engine/cards';

/** How the athletes look and where the camera is. The magic is the subject; the caster is not a portrait. */
export const SPELL_COMPOSITION = [
  'Wide landscape composition. The spell is the subject; how much of the frame it fills is given below.',
  'The caster is a white European woman spellstick player, seen from behind or from the side at',
  'mid-distance, so the magic matters more than her face. She wears a plain charcoal-grey athletic',
  'shirt and shorts, no pads, no gloves, no helmet, bare hands, and carries a spellstick: a',
  'lacrosse-style stick with a small net pocket and faintly glowing runes along the shaft.',
  'Any teammate of hers wears the same charcoal-grey kit. Any opposing player wears a plain white',
  'athletic kit, also with no pads. All players are white European women.',
].join(' ');

/** Colors and motifs by magic family. Every spell in a family uses these. */
export const FAMILY_LOOK: Record<string, string> = {
  fire: 'Fire magic: roaring orange and gold flames, glowing embers, heat shimmer.',
  water: 'Water magic: clear blue and turquoise water, ribbons and spray, cool silvery mist.',
  ice: 'Ice magic: pale blue and white ice crystals, frost, glittering cold vapor.',
  earth: 'Earth magic: brown rock, cracked ground, moss-green glow, floating chunks of stone.',
  air: 'Air magic: pale white-blue swirling gusts, visible spiraling wind lines, lifting grass and hair.',
  weather: 'Storm magic: dark grey storm clouds, driving rain, slate-blue and silver light.',
  lightning: 'Lightning magic: crackling electric-blue and violet arcs, sparks, bright white flashes.',
  light: 'Light magic: brilliant white and warm gold radiance, light rays, lens-flare glow.',
  shadow: 'Shadow magic: deep purple-black smoky shadow, inky tendrils, dimmed light around it.',
  healing: 'Healing magic: soft warm green and gold light, gentle glowing motes, a calm feel.',
  body: 'Body magic: a crimson-red glowing aura tracing her muscles and veins, an athlete pushed past normal limits.',
  curse: 'Curse magic: sickly green and violet smoke, twisting sigils, a sinister glow.',
  warding: 'Warding magic: translucent pale-gold shields and runic circles, geometric glowing lines.',
  binding: 'Binding magic: glowing cyan chains, bands, and coils of light that wrap and hold.',
  force: 'Force magic: invisible-force ripples shown as distorted air and pale lavender shockwave rings.',
  time: 'Time magic: bronze and amber clock-face rings, motion trails, sand-like glowing particles.',
  translocation: 'Teleport magic: swirling teal portals, streaks of light, a figure half-there and half-gone.',
  divination: 'Seeing magic: silvery blue light, glowing eye symbols, stars and starlight motes.',
  mind: 'Mind magic: soft pink and magenta glowing threads and ripples around the head.',
  enchantment: 'Enchantment magic: rose-gold and magenta spirals, hypnotic glowing swirls and sparkles.',
  illusion: 'Illusion magic: iridescent shimmering rainbow sheen, prismatic glints, things that look not quite real.',
};

/** For a spell with no magic (a plain foul). */
export const NO_MAGIC_LOOK = 'No visible magic at all: a plain, gritty sports moment.';

/** How big and dramatic the magic is, by tier. */
export const TIER_LOOK: Record<SpellTier, string> = {
  common:
    'Scale: modest and contained. The magic is a small burst, no bigger than her head, right at her ' +
    'hands or stick. Most of the picture is an ordinary moment of the match.',
  uncommon:
    'Scale: a clearly visible effect around her and at most one other player, taking up about a third ' +
    'of the picture, with a noticeable glow.',
  rare:
    'Scale: a bold, powerful effect that fills about half the frame, with strong glowing light and a ' +
    'striking composition.',
  legendary:
    'Scale: overwhelming and spectacular. The magic dominates the whole frame, with dramatic light ' +
    'rays, the air and ground reacting, and other players stopping to stare. An epic, awe-inspiring image.',
};

/** What each spell is doing. Keyed by card id. */
export const SPELL_SCENES: Record<string, string> = {
  // Fire
  'sp-flambe': 'She flicks a burst of flame from her stick at an opposing player, whose shirt sleeve catches a lick of fire.',
  'sp-blast-shot': 'She shoots from far out; the ball leaves her stick with a small fiery explosion behind it, trailing smoke.',
  // Water
  'sp-water-spear': 'A spear of pressurized water lances from her stick into an opposing player.',
  'sp-mist-veil': 'A towering wall of silvery mist rolls up around her, swallowing the opposing player trying to reach her.',
  'sp-fog-bank': 'A low fog bank spreads across the field as she passes, hiding where the ball went.',
  // Ice
  'sp-ice-wall': 'A massive wall of ice erupts from the ground between her and the opposing player, who slams to a halt.',
  // Earth
  'sp-earth-crush': 'The ground heaves up under an opposing player in a burst of rock and turf.',
  'sp-stone-skin': 'Her skin turns to gleaming grey stone as an opposing player crashes into her and bounces off.',
  'sp-heavy-ground': 'The ground around an opposing ball carrier glows green and pulls her down, her feet sinking, as the caster closes in to take the ball.',
  // Air
  'sp-light-as-air': 'Wind lifts her lightly over a diving tackle, floating like a feather.',
  'sp-tailwind': 'A strong gust carries her long pass far up the field.',
  'sp-leap': 'She springs impossibly high on a rush of air to catch a pass.',
  // Weather
  'sp-squall': 'A sudden small storm cloud hammers an opposing player with wind and rain.',
  // Lightning
  'sp-bolt': 'A crackling bolt of lightning leaps from her stick to an opposing player.',
  'sp-jolt': 'A spark of electric shock jumps from her stick as she checks an opposing player, who flinches.',
  'sp-thunderclap': 'A thunderclap shockwave bursts from her stick, knocking an opposing player back.',
  // Light
  'sp-dazzle': 'A storm of dazzling sparkles of light bursts in an opposing player\'s face, who throws up her arms.',
  'sp-blinding-flash': 'A blinding sun-bright flash erupts from her stick, washing the whole field in white light.',
  // Shadow
  'sp-shadow-double': 'A dark shadow copy of her peels away and runs beside her.',
  'sp-cloak-of-night': 'A patch of night-dark shadow wraps the ball as she passes it, hiding it.',
  // Healing
  'sp-mend': 'She kneels beside a hurt teammate who wears the same charcoal-grey kit as her, her glowing hand on the teammate\'s knee.',
  'sp-knit': 'She holds a glowing hand over a teammate\'s gashed arm as the cut closes.',
  'sp-set-the-bone': 'She grips a teammate\'s injured wrist; soft light shows the bone setting straight.',
  'sp-shrug-it-off': 'She takes a hit to the shoulder and barely flinches, a faint glow where it landed.',
  'sp-fresh-legs': 'Bright life energy floods into her legs as she sprints, tired teammates around her glowing too.',
  // Body
  'sp-brute-strength': 'She tackles an opposing player with huge, glowing strength.',
  'sp-second-wind': 'Exhausted, she straightens up as a blazing red aura of renewed energy roars around her.',
  'sp-burst-of-speed': 'She darts forward in a blur of red speed lines to catch a pass.',
  'sp-sidestep': 'She twists aside from a diving tackle with impossible agility, afterimages trailing.',
  'sp-low-stance': 'She sinks into a rock-steady low stance for a faceoff, a red glow rooting her feet.',
  'sp-pinpoint': 'She aims a shot at the goal, a glowing red line tracing a perfect path to the corner.',
  'sp-red-mist': 'She charges in a wild berserker rage, a red haze around her.',
  'sp-empower': 'A pillar of crimson power surges up through her and out to her teammates.',
  // Curse
  'sp-jinx': 'She points her stick at an opposing player; a small green sigil flickers over the player\'s foot as she stumbles.',
  'sp-hex': 'A huge glowing hex sigil burns in the air over an opposing player, who sags under it.',
  'sp-bad-luck': 'Everything goes wrong for an opposing player at once: her stick snaps, her laces snap, and she trips, under a swirl of green curse smoke.',
  'sp-evil-eye': 'A giant glowing green eye opens in the sky, its gaze fixed on an opposing player who freezes in dread.',
  'sp-elf-shot': 'She flicks a tiny glowing green dart from her fingers into an opposing player\'s calf.',
  'sp-wither': 'An opposing player wilts as violet curse smoke drains the color and strength from her.',
  'sp-sting': 'A small violet spark stings an opposing player\'s hand as she grips her stick.',
  // Warding
  'sp-ward': 'A vast golden dome of runic warding light rises over her, and an opposing player\'s charge breaks against it.',
  'sp-alarm-ward': 'A small glowing rune circle on the turf flares as an opposing player steps near it.',
  // Binding
  'sp-snare': 'Glowing cyan bands snap around an opposing ball carrier\'s ankles as the caster moves in to take the ball.',
  'sp-freeze-in-place': 'Glowing chains of light lock an opposing player completely motionless mid-stride.',
  // Force
  'sp-force-shot': 'She shoots from far out; a ripple of force pushes the ball onward.',
  'sp-shatter': 'A wave of force cracks an opposing player\'s stick in two.',
  'sp-turn-aside': 'She guards the ring-shaped goal as goalkeeper; a huge wave of force deflects a screaming shot away.',
  'sp-float-pass': 'The ball floats gently over defenders\' heads on a cushion of force.',
  // Time
  'sp-quicken': 'Everything around her slows while she darts in to intercept a pass, amber time-trails behind her.',
  'sp-slow': 'A huge glowing amber clock ring hangs over an opposing player frozen in slow motion, droplets of sweat hanging in the air.',
  // Translocation
  'sp-blink': 'Two of her teammates vanish and reappear in each other\'s places in flashes of teal light.',
  'sp-sending': 'The ball vanishes into a small teal portal by her stick and comes out of another far up the field.',
  'sp-summon': 'She reaches into a small teal portal in the air and pulls out a spare spellstick and a ball, as if from far away.',
  // Divination
  'sp-divine': 'She closes her eyes, a faint silver glow at her temples as she senses the field.',
  'sp-precognition': 'Ghostly silver images of the next few moments of play flicker around her.',
  'sp-scrying-bowl': 'On the sideline, she gazes into a small bowl of water showing a glowing image of the field.',
  'sp-far-sight': 'Her eyes glow silver as she peers across the field, a faint lens of light before her face.',
  'sp-second-sight': 'Her eyes glow silver, seeing faint glowing outlines of hidden players.',
  'sp-true-sight': 'A glowing third eye opens on her forehead, seeing through a disguise.',
  'sp-danger-sense': 'She ducks a diving tackle without looking, a silver glow of warning at the back of her neck.',
  // Mind
  'sp-read-their-mind': 'Glowing pink threads run from her temple to an opposing player\'s head.',
  'sp-silent-call': 'Pink thought-ripples pass silently between her and two teammates, who swap places.',
  // Enchantment
  'sp-mesmerize': 'Huge hypnotic spirals of rose-gold light whirl before an opposing player, who stares, utterly entranced, her stick drooping.',
  'sp-befuddle': 'Little magenta sparkles swirl around an opposing player\'s head as she looks the wrong way.',
  // Illusion
  'sp-sleight': 'With a shimmer, two of her teammates trade places in a sleight of hand.',
  'sp-glamour-ball': 'She passes; a shimmering fake ball flies off one way while the real one goes the other.',
  'sp-glamour-self': 'She is surrounded by two shimmering illusory copies of herself.',
  'sp-unseen-pass': 'She passes an invisible ball, only a faint shimmer in the air showing where it goes.',
  'sp-hidden-hands': 'Two teammates shimmer and swap places, hidden behind a ripple of illusion.',
  'sp-hall-of-mirrors': 'Glowing mirror panes surround her, each reflecting a different copy of her.',
  'sp-misdirection': 'She fakes a pass one way with a shimmering illusion of a throw while the real pass goes the other way.',
  'sp-trick-pass': 'A shimmering illusion shows her passing to an empty patch of field.',
  // No magic
  'sp-late-hit': 'Well after the whistle, she slams her shoulder into an opposing player, who is caught off guard.',
};

/**
 * The full prompt for one spell card. `style` is the shared painting style from generate-art.ts;
 * `hair` varies the caster from card to card.
 */
export function spellPromptFor(card: SpellCardDef, style: string, hair: string): string {
  const family = card.magic ? familyOf(card.magic) : null;
  const look = family ? FAMILY_LOOK[family] ?? `${family} magic, glowing.` : NO_MAGIC_LOOK;
  const scene = SPELL_SCENES[card.id] ?? `She casts a spell called "${card.name}".`;
  // A spell with no magic has nothing to scale up, so it gets no tier line.
  const scale = family ? TIER_LOOK[card.tier ?? 'common'] : '';
  return [style, SPELL_COMPOSITION, `The caster has ${hair}.`, scene, look, scale].filter(Boolean).join(' ');
}
