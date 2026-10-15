# Spellstick — magic

How magic works on the cards: Resonants, Affinities, and the kinds of magic spells use. The
play rules for affinity are in RULES.md ("Affinity"); this file covers where the magic comes
from and how player cards get it.

## The Warlock magic data

`data/warlock-resonants.json` is the master copy (Paul's, work in progress). Magic is not
element-based. Fire and water exist, but they are two of 37 **magic families**, next to
divination, illusion, warding, curse, healing, body, binding, and others.

- **Resonants** are feelings (the emotional wheel: Joy, Anger, Fear, ...) and sensations (the
  physical wheel: Heat, Vigor, Fatigue, ...). Each wheel is a set of trees: 26 roots, each with
  deeper, more specific Resonants under it (Anger → Fury → Rage). 371 in all.
- Each Resonant grants three **specializations**, such as Anger: Fire, Strength, Lightning.
- Each specialization belongs to a **family** (Strength is in Body). A family's own
  specialization (Fire in Fire) stands for the whole family.
- Opposition is between roots (Joy–Sorrow, Heat–Cold), not between families.

## What a card shows

- A player has 1 to 3 Resonants. Each has one **Affinity**: either a whole family ("Fire") or
  one narrower specialization in a family ("Explosion (fire)").
- A spell has one kind of magic: a whole family, a specialization, or none (a neutral spell).
- Matching (RULES.md "Affinity"): an Affinity anywhere in the spell's family is a **match**
  (+1). An Affinity that is exactly the spell's specialization is a **specialist** match (+2).
  Opposition isn't used, since the data has no opposed families.
- Card frames and pips are colored by family. The colors are placeholders, in `src/ui/styles.css`.

## How players get their magic (decided 2026-10-14)

Paul: pros have Resonants that are useful in play, or they wouldn't have become pros. So:

1. **Find the useful magic.** A specialization is useful if it can power something that happens
   in a match: one of the effects in the effect vocabulary (boost, shield, hit, scry, and so on).
   The list, with the effects each one fits, is `data/useful-magic.json`: 71 of 187
   specializations, in 21 of 37 families. Claude's judgment; edit the file to change it.
2. **That gives the Resonants.** A Resonant is useful if it grants at least one useful
   specialization: 327 of 371. The 44 others (Satiety, Grief, Nausea, ...) never appear on
   player cards.
3. **Draw each Resonant.** Pick one of the roots at random. 50% of the time the player has the
   root itself. The other 50% is shared by the deeper levels of that root's tree, each level half
   as likely as the one above (most trees have two levels: 33% and 17%). Within a level, every
   useful Resonant is equally likely. A player never gets the same Resonant twice.
4. **Draw its Affinity.** Pick one of the Resonant's useful families at random. 50% of the time
   the Affinity is the whole family. The other 50% is shared by that Resonant's narrower useful
   specializations in the family. If it has none (Anger's fire is just Fire), the Affinity is the
   whole family.

Each player keeps their name, stats, and number of Resonants; only the Resonants and Affinities
were redrawn. The code is `scripts/resonant-draw.ts`, run with `npm run assign-resonants` (fixed
seed, so it's repeatable). Only rerun it before anyone owns the cards, since it changes them.

Claude's readings of the rule:
- "Top level" for a family is the whole family, and the family's own specialization (Fire in
  Fire) counts as the whole family, not as a lower layer.
- Roots are picked evenly, not weighted by tree size. Three roots (Disgust, Hunger, Satiety)
  aren't useful themselves, so in their trees the deeper levels share the full 100%.

## Results (2026-10-14)

Full analysis and the list of every player: `reports/resonants-2026-10-14.md`. Simulation:
`reports/sim-2026-10-14-v14-resonants.md`.

- **Resonants.** 183 on 100 players, 96 different ones. 43% are roots (50% in trees where the
  root is useful), 39% one level down, 17% two down. Emotional 53%, physical 47%. The most
  common are Joy, Vigor, Fatigue, Tiredness, Lucidity, and Anger.
- **Affinities.** 77% are whole families and 23% specializations. Where a narrower
  specialization was on offer, the split is exactly 50/50; the extra whole families come from
  Resonants whose only useful magic in that family is the family itself.
- **Families.** Body 11%, Healing 11%, Fire 9%, Ice 8%, Time 8%, Illusion 7%, Air 6%, then a
  long tail. 20 of the 21 useful families turned up.
- **Against today's spells.** The prototype spells were written for four elements. They cover
  only 48% of player Affinities (68% of players have at least one that some spell matches), and
  just 5 Affinities are exact specialist matches. The most common family, Body, has no spell.
- **In play** (1,000 computer games): no crashes, no impossible states, no runaway games.
  Matched casts fell from 56% to 17% of all casts (specialist: 0.3%). Injuries fell from 2.1 to
  1.7 a game, just under the 2–4 target, most likely because fewer hits get the +1. Win rates stay
  balanced (first player 48.9%).

## The spell library (2026-10-14)

Paul asked for a spell for each useful specialization. The library (`team: "library"` in
`data/cards.prototype.json`) has 72 spells: one for each of the 71 useful specializations, plus
a second Glamour spell (Glamour Ball and Glamour Self are both Paul's). Each spell is defined
once; a team's `spells` list picks its 16 by id. *(Changed 2026-10-14: Late Hit, a neutral
foul, was the 73rd. Paul pulled it from the spells; it becomes a physical attack card in the
v0.17 plan.)*

How they were made (Claude):
- **One effect each, from the vocabulary.** Each spell uses an effect its magic can power in
  `data/useful-magic.json`, picking the most natural one and spreading effects around so a
  family isn't all one kind of card.
- **Boosts can be narrow.** Body, Air, and Time have many boosts, so most of them only work for
  one use of a stat and give +3 instead of +2: Burst of Speed only when receiving a pass,
  Pinpoint only when shooting, Turn Aside only for a goalie's save, and so on. This is the one
  addition to the effect vocabulary (`boost` `when`, RULES.md v0.15).
- **Numbers stay at the old levels:** hits strength 3 (4 since rules v0.16, when every contest became rolled), steals +2, recalls draw 2, long shots −2,
  open boosts +2. Same-effect spells in different families are deliberate: they're the same card
  for different players' magic, like the old Earth and Water Shields.
- **Names** are plain and in-world. Placeholders that named an element (Neutral Boost, Fire
  Steal, Earth Shield, Air Long Pass, ...) are gone. Flambé, Thunderclap, Water Spear, Earth
  Crush, Mend, and the Glamour spells kept their names. Flavor text is left for Paul.

| Magic | Spell | Type | Effect | In team deck |
|---|---|---|---|---|
| Fire | Flambé | Action | Hit, strength 4 | A×2 |
| Explosion (fire) | Blast Shot | Action | Long shot, −2 | A |
| Water | Water Spear | Action | Hit, strength 4 | — |
| Mist (water) | Mist Veil | Reaction | Shield | — |
| Fog (water) | Fog Bank | Action | Decoy pass | — |
| Ice | Ice Wall | Reaction | Shield | A |
| Earth | Earth Crush | Action | Hit, strength 4 | B×2 |
| Stone (earth) | Stone Skin | Reaction | Ward | A |
| Gravity (earth) | Heavy Ground | Action | Steal +2 | A, B |
| Air | Light as Air | Reaction | Boost +3, only dodging a tackle | — |
| Wind (air) | Tailwind | Action | Long pass | A |
| Flight (air) | Leap | Reaction | Boost +3, only receiving | — |
| Storm (weather) | Squall | Action | Hit, strength 4 | — |
| Lightning | Bolt | Action | Hit, strength 4 | — |
| Shock (lightning) | Jolt | Reaction | Dirty play | — |
| Thunder (lightning) | Thunderclap | Action | Hit, strength 4 | — |
| Light | Dazzle | Reaction | Shield | — |
| Radiance (light) | Blinding Flash | Reaction | Shield | — |
| Shadow | Shadow Double | Action | Mirror images | — |
| Darkness (shadow) | Cloak of Night | Action | Decoy pass | — |
| Healing | Mend | Action | Mend | A |
| Regeneration (healing) | Knit | Action | Mend | B |
| Bone-setting (healing) | Set the Bone | Action | Mend | — |
| Pain-blocking (healing) | Shrug It Off | Reaction | Boost +3, only resisting a hit | — |
| Vitality (healing) | Fresh Legs | Reaction | Boost +2 | B |
| Strength (body) | Brute Strength | Reaction | Boost +3, only tackling | — |
| Endurance (body) | Second Wind | Reaction | Boost +2 | A |
| Speed (body) | Burst of Speed | Reaction | Boost +3, only receiving | — |
| Agility (body) | Sidestep | Reaction | Boost +3, only dodging a tackle | — |
| Balance (body) | Low Stance | Reaction | Boost +3, only faceoffs | — |
| Precision (body) | Pinpoint | Reaction | Boost +3, only shooting | — |
| Berserking (body) | Red Mist | Reaction | Dirty play | A |
| Empowerment (body) | Empower | Reaction | Boost +2 | — |
| Curse | Jinx | Reaction | Dirty play | B |
| Hexing (curse) | Hex | Reaction | Shield | B |
| Ill luck (curse) | Bad Luck | Reaction | Shield | — |
| Evil eye (curse) | Evil Eye | Reaction | Shield | — |
| Elf-shot (curse) | Elf-shot | Action | Hit, strength 4 | B |
| Weakening (curse) | Wither | Reaction | Shield | B |
| Pain (curse) | Sting | Reaction | Dirty play | — |
| Warding | Ward | Reaction | Ward | B |
| Alarms (warding) | Alarm Ward | Action | Scry | — |
| Binding | Snare | Action | Steal +2 | A, B |
| Paralysis (binding) | Freeze in Place | Reaction | Shield | — |
| Force | Force Shot | Action | Long shot, −2 | B |
| Shattering (force) | Shatter | Action | Hit, strength 4 | A |
| Repulsion (force) | Turn Aside | Reaction | Boost +3, only saving | — |
| Levitation (force) | Float Pass | Action | Long pass | B |
| Haste (time) | Quicken | Reaction | Boost +3, only intercepting | — |
| Slowing (time) | Slow | Reaction | Shield | A |
| Blink (translocation) | Blink | Action | Swap | — |
| Sending (translocation) | Sending | Action | Long pass | — |
| Summoning (translocation) | Summon | Action | Draw 2 | B |
| Divination | Divine | Action | Scry | — |
| Precognition (divination) | Precognition | Action | Draw 2 | A |
| Scrying (divination) | Scrying Bowl | Action | Scry | — |
| Far-sight (divination) | Far Sight | Action | Scry | — |
| Second sight (divination) | Second Sight | Action | Scry | — |
| True sight (divination) | True Sight | Action | Scry | — |
| Danger-sense (divination) | Danger Sense | Reaction | Boost +3, only dodging a tackle | — |
| Mind-reading (mind) | Read Their Mind | Action | Scry | — |
| Telepathy (mind) | Silent Call | Action | Swap | — |
| Mesmerism (enchantment) | Mesmerize | Reaction | Shield | — |
| Confusion (enchantment) | Befuddle | Action | Decoy pass | — |
| Illusion | Sleight | Action | Swap | — |
| Glamour (illusion) | Glamour Ball | Action | Decoy pass | A |
| Glamour (illusion) | Glamour Self | Action | Mirror images | A |
| Invisibility (illusion) | Unseen Pass | Action | Decoy pass | — |
| Concealment (illusion) | Hidden Hands | Action | Swap | — |
| Mirrors (illusion) | Hall of Mirrors | Action | Mirror images | B |
| Misdirection (illusion) | Misdirection | Action | Decoy pass | B |
| Trickery (illusion) | Trick Pass | Action | Decoy pass | — |

**Team decks.** Each team keeps the old decks' mix of effects (1 boost, 2 shields, 1 dirty play,
1 mirror images, 1 long pass, 1 decoy pass, 1 long shot, 2 steals, 1 recall, 1 mend, 3 hits), so
balance stays comparable, with magic picked to suit the families players have. Since v0.17 each
deck's scry is replaced by a ward (Team A: Stone Skin for Scrying Bowl; Team B: its Ward becomes a
ward, and Hex replaces True Sight to keep two shields).
Team A leans to Body, Fire, Ice, and Time; Team B to Curse, Warding, Force, and Earth. Both use
the only two steals (Heavy Ground and Snare). Online spell sets are these two lists.

### Results

Reports: `reports/sim-2026-10-14-v15-spell-library.md` (1,000 games with the team decks) and
`reports/spells-2026-10-14.md` (1,150 games where each team got 16 random library spells, so
every spell was in about 20 decks).

- **Health:** no crashes, impossible states, or runaway games in either run.
- **Every spell works in play** except the four swap spells (Blink, Silent Call, Sleight, Hidden
  Hands), which the computer opponent never casts: it rarely sees a swap worth an action. People
  can still play them, and swap has its own tests. Teaching the computer to value swaps is a
  separate job.
- **No spell stands out.** With random decks, the team holding a spell won 41–59% of the time
  for every spell except Turn Aside (the goalie's +3 save, 62%), which is worth watching.
- **Matches.** With the team decks, 21% of casts match the caster's family (up from 17% with
  the old element spells) and 1% are specialist matches (up from 0.3%). Each spell matches only
  a small share of the pool, so most casts are still neutral.
- **Still open:** injuries stay at 1.7 a game, under the 2–4 target. Hits are as strong as
  before; fewer of them get an affinity bonus than in the four-element days. If that matters,
  raising hit strength to 4 is a one-number change per card.
- **Rarely cast,** as before: long shots (0.02–0.04 a game), Mend-type spells (0.04–0.06, only
  useful once someone is injured), and scrying (about 0.1).

### Power tiers (2026-10-14)

How much each spell helps a team win, as the computer plays it: for each spell, 1,000 games
where one team swapped four rarely-cast spells for four copies of it (`npm run spell-tiers`,
full table in `reports/spell-tiers-2026-10-14.md`). The edge is how many more games in 100 that
team wins. Same-effect spells came out the same within luck (about ±2), so the tiers are by
effect; a spell's magic barely changes its power.

Each tier is named like a card rarity (the names the online design plans for rarity). Every
spell's tier is its `tier` field in `data/cards.prototype.json` (`legendary`, `rare`, `uncommon`,
or `common`), which `npm run spell-tiers` writes; each spell's measured numbers are in the
report. They are power tiers, not rarity yet, and change nothing in play.

| Tier | Effects (average edge) | Why |
|---|---|---|
| Legendary (dominant, 17 spells) | Shield (+24); open boost +2 (+18); goalie's save boost, Turn Aside (+18) | A shield makes the other player's stat 0, so it nearly always wins the contest, and it works in any contest. Open boosts also work anywhere. Saves decide goals. |
| Rare (strong, 7) | Shooting boost, Pinpoint (+13); steals (+10); tackling boost (+9); dodging boosts (+9) | Big swings in contests that decide possession and goals. |
| Uncommon (useful, 15) | Intercepting boost (+5); mirror images (+4); dirty plays (+3); faceoff boost (+3); long passes (+2); draw 2 (+2) | They help, but less often or by less. |
| Common (no clear edge, 34) | Decoy passes, resisting boost, swaps, scrying, receiving boosts, hits, long shots, mends (−1.5 to +1.4) | No better than the rarely-cast spells they replaced. |

What this says about the game:
- **Shields are too strong.** Four shields in place of four weak spells turn a 49% team into a
  73% team. Today both team decks hold two, so it evens out. But a deck built from the library
  could be all shields. Softening them (for example −3 to the other side instead of making it 0)
  is the obvious fix.
- **Narrow boosts are only as good as their contest.** Shooting, saving, tackling, and dodging
  matter. Receiving a pass doesn't, because the receiver already wins most passes (ties go to the
  receiver), so +3 rarely changes anything.
- **Hits, mends, long shots, scrying, and swaps do almost nothing for the computer.** Probably
  because a strength-3 hit often fails against a defender's Defense and one injury rarely decides
  a game, which also leaves mends little to undo.
  Long shots seldom come up. The computer gets little from information (scrying) and never
  swaps. A person may get more from these, especially swaps and scrying, which are about hidden
  lineups. They're also where most of the flavor is, so making them stronger (hits at strength 4,
  which would also lift injuries toward their target) is better than cutting them.
- These tiers could guide rarity later (Capped Constructed points could follow them). If they
  did, Legendary would need to be scarce, and 13 shields is a lot of Legendaries: another reason
  to soften shields.

### Not covered yet

Families with no current effect (nullification, sound, decay, siphoning, holy, dream, spirit,
...) would become useful with a new effect, such as cancelling a spell. Add the specialization
to `data/useful-magic.json` with that effect, add a library spell, and rerun the draw.
