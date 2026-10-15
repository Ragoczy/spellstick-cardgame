// Prompts for placeholder art on the physical attack cards (rules v0.17),
// used by generate-art.ts.
//
// Each picture is the foul itself: an attacker in the charcoal-grey kit fouling a target in white,
// with no magic at all, so these read differently from spells at a glance. Three parts:
//   - PHYSICAL_COMPOSITION: who is in the picture, how they're dressed, and the tone (no gore);
//   - TIER_LOOK: how nasty it looks, and whether the referee has noticed;
//   - SCENES: what this one card shows.

import type { PhysicalCardDef, PhysicalTier } from '../src/engine/cards';

export const PHYSICAL_COMPOSITION = [
  'Wide landscape composition of one moment in a spellstick match: a foul.',
  'The attacker is a white European woman in a plain charcoal-grey athletic shirt and shorts. The',
  'target is a white European woman in a plain white athletic shirt and shorts. No pads, no gloves,',
  'no helmets, bare hands. Each carries a spellstick: a lacrosse-style stick with a small net pocket.',
  'No magic at all: no glow, no sparks, no energy effects. A plain, gritty sports moment.',
  'Dramatic but not gory: no blood and no visible wounds. Faces show effort, shock, or mischief.',
].join(' ');

/** How nasty it looks, by tier. The referee notices more as fouls get worse. */
export const TIER_LOOK: Record<PhysicalTier, string> = {
  minor:
    'Tone: cheeky and sneaky, a little comic. In the far background a referee in a black-and-white ' +
    'striped shirt is looking the other way.',
  major:
    'Tone: hard, aggressive, and clearly illegal. In the background a referee in a black-and-white ' +
    'striped shirt is raising a whistle.',
  brutal:
    'Tone: shocking and dangerous-looking, with the crowd in the stands gasping. In the background a ' +
    'referee in a black-and-white striped shirt blows a whistle and points.',
};

/** What each card shows, by card id. */
export const SCENES: Record<string, string> = {
  'ph-shirt-pull':
    'The attacker grabs a fistful of the back of the target\'s shirt and yanks, stretching the fabric, ' +
    'as the target strains forward reaching for the ball.',
  'ph-tripping':
    'The attacker hooks her stick around the running target\'s ankle. The target, carrying the ball in ' +
    'her stick pocket, pitches forward off balance mid-stride.',
  'ph-hooking':
    'The attacker reaches across from the neighboring lane and hooks the crook of her stick around the ' +
    'target\'s waist, dragging her backward.',
  'ph-atomic-wedgie':
    'A slapstick moment played for laughs: the attacker grabs the back waistband of the target\'s ' +
    'shorts and hoists it upward, and the target rises onto her tiptoes with a comic, wide-eyed yelp.',
  'ph-slashing':
    'The attacker swings her stick hard and chops it down across the target\'s stick and forearm, wood ' +
    'cracking against wood.',
  'ph-cross-check':
    'The attacker holds her stick horizontally in both hands and drives it into the target\'s chest, ' +
    'shoving her backward off her feet.',
  'ph-clothesline':
    'The target sprints with the ball and runs straight into the attacker\'s outstretched straight arm ' +
    'at shoulder height, her legs flying out in front of her.',
  'ph-gouge':
    'In a tangle of players on the grass, the attacker shoves a splayed hand into the side of the ' +
    'target\'s face, pushing her head away, the target grimacing.',
  'ph-slew-foot':
    'The attacker sweeps the target\'s feet out from behind with her leg while pulling her shoulders ' +
    'backward, and the target topples backward through the air.',
  'ph-late-hit':
    'The target has just released a pass, the ball already flying away, when the attacker barrels into ' +
    'her from the side, shoulder first, a moment too late.',
  'ph-elbow':
    'Two players jostle shoulder to shoulder for position. The attacker throws a sharp elbow into the ' +
    'target\'s ribs while looking innocently the other way.',
  'ph-kneecap':
    'The attacker swings her stick low at the side of the target\'s knee just as the target plants her ' +
    'leg mid-run, with motion lines at the moment of impact.',
  'ph-spearing':
    'The attacker charges with her head down and drives the butt end of her stick forward like a lance ' +
    'into the target\'s midsection, and both players start to crumple.',
  'ph-chop-block':
    'The attacker dives low and hits the target at the knees from the side while the target is looking ' +
    'the other way, and the target topples over her.',
  'ph-stamp':
    'The target is sprawled on the grass. The attacker brings her shoe stamping down on the target\'s ' +
    'stick right beside her hand, and the target snatches her hand away in alarm.',
  'ph-pile-on':
    'The pile-up fills the foreground and is the whole subject, with no other foul in the picture: three ' +
    'players in charcoal-grey kits leap onto one player in white who is already on the grass, a comic ' +
    'heap of bodies with arms, legs, and sticks poking out, and the player in white peeking out from underneath.',
};

/** The full prompt for one physical card. */
export function physicalPromptFor(card: PhysicalCardDef, style: string): string {
  const scene = SCENES[card.id] ?? `The attacker commits a foul called "${card.name}" on the target.`;
  return [style, PHYSICAL_COMPOSITION, TIER_LOOK[card.tier], scene].join(' ');
}
