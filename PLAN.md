# Plan: rules v0.17 (contact, injuries, fouls, pricing)

Status: **all 11 decisions approved by Paul on 2026-10-14, each as recommended.** No code has
been changed. The only thing run so far is the existing simulator, to get v0.16 numbers to
measure against.

**Amended at Paul's request:** too few injuries is a known problem with the game, and "more
injuries" means real ones (injury cards, knockouts), not just more Shaken. Phase c2 adds
**physical attack cards** (non-spell cheap shots with a penalty box) to deliver that.

## In short

- **Shield** stops zeroing the other player. Their skill counts **half, rounded up**. An
  unanswered Shield on a Shot 5 vs Save 6 shot goes from 97% to 72%.
- **Tackles knock players down.** A tackled player rolls against a new **Toughness** stat
  (Stoppers and Anchors are tough, Runners and Strikers fragile). If they fail, roll for
  severity: **Shaken** (half the time), **Injured** (the injury cards we have now), or
  **Knocked out**. Hits and dirty plays use the same severity roll.
- **Dirty plays risk a referee.** They're now played *before* the dice are rolled, and if the
  two dice match, the caster is **sent off** for the game.
- **Physical attacks (new card type, not spells).** Gouge, Kneecap, Atomic Wedgie, Slashing,
  Clothesline and more, drawn from a separate Physical pile. A won attack makes the target drop
  the ball and risks hurting them. Body Affinities (Strength, Speed, Agility, Berserking) give a
  bonus. If the attacker rolls a 1 and then another 1, the referee calls a **penalty**: the
  attacker sits out 1, 2, or 3 turns depending on how nasty the card is, leaving the spot empty,
  and comes back early if the other team scores.
- **Magic joins in.** Mend can also bring back a knocked-out player. A new **ward** reaction
  turns any hurt into Shaken. Three new player abilities, each tied to a Resonant: hits harder,
  hard to hurt, fragile but quick.
- **Players get a cost**, set from measured win rates. Constructed teams get a **cost cap**. The
  100 named players keep their names, ids, stats, and Resonants, and gain Toughness and a cost
  (some also gain an ability).

Every change sits behind a config switch, so online matches already in progress keep v0.16
rules, the same way v0.11 and v0.16 were handled.

## Decisions (approved 2026-10-14)

These change how the game feels, so I didn't assume them. Paul approved the recommendation
for every one: foul before the dice, Shaken through the owner's next turn, Mend heals injuries
or brings back knockouts, Ward means "only Shaken", Ward and Stone Skin become wards, online
cards change now, only players are priced, a separate Physical pile, penalty length from the
card's tier, both referee rules kept, and Speed attacks with Muscle cards using Defense.

1. **Dirty plays move before the dice.** In v0.16, reaction spells are played after both dice
   are rolled and rerolled. With the doubles rule as written, a player would just never foul on
   doubles, so the referee would never catch anyone. Fix: a dirty play is declared before anyone
   rolls. You don't know yet whether you'll win the contest or get caught. (The other option is
   a separate roll of two dice for the referee, which keeps today's timing but has nothing to do
   with the contest dice.)
2. **Shaken lasts through the owner's next turn.** "Can't act until the owner's next turn" would
   do nothing for a player hurt on the other team's turn, since they'd recover before they could
   have acted. So: a Shaken player stands up at the **end** of their team's next turn. Shaken
   cards turn **sideways**, not face down, because face down already means hidden here.
3. **Healing doesn't wake Shaken players.** With one action a turn, spending your action to wake
   a player who'd stand up at the end of that same turn gains nothing. Mend instead gets a new
   use: bring a knocked-out player back to your hand.
4. **Ward = "only Shaken"**, not "+Toughness for one check". Hits and dirty plays skip the
   Toughness check (see Phase b), so a Toughness bonus would only help against tackles. "If
   your player is hurt in this contest, they're only Shaken" works against tackles, hits, and
   fouls alike.
5. **No new spell cards.** Two shields become the ward: **Ward** (warding magic, a perfect fit for
   the name) and **Stone Skin**. That leaves 11 shields in the library. Each team deck swaps its
   scry spell (cast 0.01 times a game) for a ward, and Team B swaps True Sight for Hex so it keeps
   two shields.
6. **Online player cards change.** The 100 named players are owned online. They keep their ids,
   names, stats, and Resonants, but gain Toughness and a cost, and about 24 gain an ability.
   Saved teams over the new cap couldn't start new matches until edited. Recommendation: apply
   it now, while it's still a beta.
7. **Spells aren't priced.** The cap covers the 24 players only. Spell values are measured and
   reported, and they update the spell tiers. Pricing spells too is listed as an open problem.
8. **Physical cards get their own pile.** Game length follows the Spells pile (one card there is
   about 2 turns), and v0.16 is already at the length limit. Mixing 16 physical cards into the
   Spells pile would add roughly 30 turns. A separate Physical pile, drawn at setup and at each
   faceoff, adds attacks without moving the game clock.
9. **Penalty length comes from the card, not the result.** The penalty only happens when the
   attacker rolled a 1, so the attack almost always failed and caused no injury. Basing the
   length on the injury actually caused would make nearly every penalty 1 turn. Instead each card
   has a tier (Minor 1 turn, Major 2, Brutal 3): nastier cards hit harder and cost more when
   caught. The literal version is kept as a config option (`penaltyLength: 'result'`).
10. **Two kinds of foul, on purpose.** Dirty-play *spells* keep Phase c (declared before the dice,
   doubles = sent off for the game). Physical cards use the penalty box (1 then 1 = out for 1–3
   turns). Magical cheating is punished harder than a cheap shot. If playtesters find two
   referee rules confusing, the fallback is to turn the dirty-play spell into a physical card.
11. **Attacks use Speed, with some exceptions.** The attacker's Speed against the target's Speed,
   as asked. Cards marked *Muscle* use the attacker's Defense instead, so Stoppers and enforcers
   can be good at violence too, not only Runners.

## What v0.16 does today (measured, 5,000 games)

Five runs of 1,000 games each (seeds 11–15) with `npm run sim`, unchanged rules and cards:

| Measure | v0.16 | v0.17 target |
|---|---|---|
| Turns per game | 50.2 (median 54) | 30–50 |
| Goals per game | 2.45 | 1.84–3.06 (±25%) |
| Spells cast per game | 15.7 | at least 15.7 |
| Injuries per game | 2.77 (hits 1.83, dirty plays 0.94) | 4–8, at least half Shaken |
| Carried off per game | 0.22 | carried off + knocked out ≤ 1.5 |
| Tackles per game | 13.6, 33% win | (no target) |
| Hits per game | 2.81, 65% land | (no target) |
| Shots per game | 7.24, 33.8% score | (no target) |
| First player wins | 48.4% | (no target) |

**v0.16 already sits right at the top of the length target** (50.2 against a limit of 50), and
the new rules will probably add substitutions, which make games longer. The fix I'd use first:
**setup draws 3 spells instead of 2**. That's one card fewer in each Spells pile, about 2 fewer
turns a game, and more spells in hand early (which also helps the spells-cast target). I'll apply
it in the first phase whose report shows more than 50 turns, as its own row in the report.

## The proposed rules, with exact numbers

Every number marked ⚙ is a config value in `src/engine/config.ts`.

### Phase a: Shield cap

**Shield (new):** the opposing player's skill, or a hit's strength, **counts half, rounded up** ⚙.
Work out their skill as usual first (abilities, injuries, Shaken). Dice and spells are added
after. If both sides shield, both are halved. It stays a non-numeric spell: affinity doesn't
change it, and it fails when opposed.

Why halving: it's a real cap (a great player still counts for something), and it gives Shield
its own job, shutting down a star, instead of being a copy of Boost from the other side.

Chance that a shot scores (both roll a d6, ties go to the goalie):

| Shot vs Save | No spell | v0.16 shield (0) | **Half, round up** | −3 | −2 |
|---|---|---|---|---|---|
| 5 vs 6 (the example) | 27.8% | 97.2% | **72.2%** | 72.2% | 58.3% |
| 5 vs 5 | 41.7% | 97.2% | **72.2%** | 83.3% | 72.2% |
| 6 vs 5 | 58.3% | 97.2% | **83.3%** | 91.7% | 83.3% |
| 4 vs 6 | 16.7% | 97.2% | **58.3%** | 58.3% | 41.7% |

The goalie shielding the shooter: Shot 5 becomes 3 against Save 6, which scores 8.3% (v0.16: 0%).

**How I'll choose, with numbers:** run all three caps (half rounded up, −3, −2) against v0.16 on
the same seeds. Keep the first one that passes all of these:
1. An unanswered capped Shield scores under 75%, both on the 5-vs-6 example and averaged over
   every shot actually taken in the simulation. This is the chance *before* the dice. After the
   dice, the computer only plays a Shield when it already knows it wins, so that rate would mean
   nothing.
2. Shield's power edge (the `npm run spell-tiers` method) is no higher than an open +2 Boost's.
   Today it's +24 against the Boost's +18.
3. Goals stay within ±25% of v0.16.

"Half, rounded up" should average about 70% over real shots. Shot 6 shooters are the risk (83%).
If the average comes out at 75% or more, I'll fall back to −2.

**Result (done 2026-10-14):** −2. All three caps passed checks 1 and 3, but only −2 passed check 2
(Shield +19.0 against Boost +20.4; half was +21.4 against +20.5, within luck). Setup now draws 3
spells, since games ran at 50.4 turns. Details: `reports/sim-2026-10-14-v17a.md`.

### Phase b: Toughness, knockdowns, and severity

**Toughness** (new stat on field-player cards, set by type ⚙). When a player is knocked down,
their owner rolls a die. **Equal to or below their Toughness: they're fine. Above: they're
hurt.** Higher Toughness means tougher. Defense has nothing to do with it.

| Type | Toughness | Hurt when knocked down |
|---|---|---|
| Stopper, Anchor | 5 | 1 in 6 (only a 6) |
| Playmaker, All-rounder | 4 | 1 in 3 (5–6) |
| Runner, Striker | 3 | 1 in 2 (4–6) |

That's the suggested 6+/5+/4+, written so a bigger number means tougher. Goalies have no
Toughness: they still can't be tackled, hit, or injured.

**What hurts players:**
- **A successful tackle** (Steal included) knocks the tackled player down: they make a Toughness
  check. The tackler still takes the ball. A tackle that misses because of mirror images doesn't.
- **A hit that lands** hurts its target straight away. There's no Toughness check, because the
  hit already had to beat their Defense. This keeps hits the reliable, magical way to hurt
  someone, and Toughness the protection against physical contact.
- **A dirty play by the winning side** hurts the losing player, also with no Toughness check.

**Severity:** roll one die ⚙.

| Roll | Result | What happens |
|---|---|---|
| 1–3 | **Shaken** | Turn the card sideways. They can't pass, shoot, tackle, or cast (actions, reactions, or fouls), and they get −2 ⚙ to every skill in a contest. They stand up at the end of their team's next turn, or when substituted out, or at full time. If they hold the ball, they keep it. Shaken again while Shaken: the count starts over. |
| 4–5 | **Injured** | Same as v0.16: draw an injury card, then a forced substitution if you have someone in hand. Injured a second time: carried off. |
| 6 | **Knocked out** | Off the field, into your knocked-out area beside the mat (face up). Forced substitution as for an injury. If nobody can come on, the spot is empty and the ball goes to the opposing player in that spot, as with a carry-off. **At each faceoff**, before the lane is chosen, roll a die for each of your knocked-out players: on 4–6 ⚙ they go back to your hand. |

That's 50% Shaken, 33% Injured, and 17% Knocked out. If Shaken comes out under half (a tackle
risk would add more, see Phase e), the fallback is 1–4 Shaken, 5 Injured, 6 Knocked out. The
cost is far fewer injury cards.

**Estimate before simulating** (from v0.16's event counts):

| Source | Per game | Hurt | Hurt per game |
|---|---|---|---|
| Successful tackles | ~4.5 | ~40% (mostly Runners and Strikers holding the ball) | ~1.8 |
| Hits that land | ~1.8 | all | ~1.8 |
| Dirty plays won | ~0.9 | all | ~0.9 |
| **Total** | | | **~4.5**: about 2.3 Shaken, 1.5 Injured, 0.75 Knocked out (+~0.15 carried off) |

That's in range but near the bottom (4–8). The computer will value tackles and hits more now,
which should push it up. Phase e has levers if it doesn't.

Rerolls already only work on contest dice. Phase c writes that down as a rule and adds a test.

### Phase c: fouls and the referee

**Contest order (new):**
1. Reveal both players.
2. **Fouls:** the attacker may declare a dirty play, then the defender may. A side that fouls has
   used its one reaction spell for this contest.
3. Both roll. Rerolls (attacker first, then defender), 3 tokens a game as now.
4. Reaction spells, from any side that didn't foul.
5. Work out the winner (ties as now).
6. **Referee:** if the two dice show the same number, every side that fouled has its caster
   **sent off**. Doubles are judged on the final dice, after rerolls. So you can spend a reroll to
   break a double you're on, and the other side can reroll hoping to make one.
7. Knockdowns and hurts. The dirty play still takes effect if your side won, even if you were
   caught.

**Sent off:** the caster goes to your discard pile, out for the game. There's no free
replacement: the spot stays empty until you Substitute at a Draw step (an empty spot counts as 0
and can't intercept). If they held the ball, the opposing player in that spot picks it up. A
goalie can be sent off too, which leaves an empty goal until you substitute your spare.

Getting caught is 1 in 6 before any rerolls.

**Rerolls never apply to** Toughness checks, severity rolls, or knocked-out return rolls. They
were only ever for contest dice. Now the rule says so, and a test proves it.

### Phase c2: physical attack cards and the penalty box

Physical attacks are cards, not spells. They aren't cast, so spell affinity rules, Recall, and
anything that counters spells don't affect them, and they don't count toward spells cast.

**The Physical pile.** Each team has its own Physical pile of the 16 ⚙ physical cards below,
separate from the Spells pile (decision 8). Draw 2 ⚙ at setup and 1 ⚙ at each faceoff.
Physical cards go into your hand with your spells (and count toward any hand limit). If the pile
runs out, shuffle its discards to make a new one.

**Making an attack (an action).** On your turn, instead of passing, shooting, or tackling, one
standing field player may play a physical card against the opposing player in their spot. A
player holding the ball can't attack ⚙. Goalies can't attack or be attacked ⚙. It's a contest:

- **Attacker:** Speed + d6 + the card's bonus + 1 ⚙ for a matching body Affinity. *Muscle* cards
  use Defense instead of Speed.
- **Target:** Speed + d6. Ties go to the target. Quick but fragile's +2 dodge applies here too.
- Rerolls and reaction spells work as in any contest (Shield, Boost, Ward). Dirty-play spells
  can't be declared in a physical attack ⚙, so there is only one foul per contest.
- **Attacker wins:** the target drops the ball (the attacker takes it, as with a tackle) and is
  knocked down: a Toughness check with the card's modifier. If hurt, roll severity with the
  card's modifier (Phase b table). Heavy hands, Sturdy, and Ward apply as usual.
- **Attacker loses:** nothing happens, apart from the penalty check.

Cards marked *Reaction* are played at the moment they name instead. They use your reaction for
that contest and are resolved the same way.

**Body Affinities.** Attack bonus (+1 ⚙) for the Affinity printed on the card: Strength,
Berserking, Speed, or Agility. Defensive bonuses for the target against any physical attack:
Danger-sense gives +1 ⚙ Speed to dodge, and Endurance gives +1 ⚙ Toughness. (These names come
from the Phase d ability table. Map them to the actual Resonant ids.)

**Tiers:**

| Tier | Target's Toughness check | Severity roll | Penalty if caught |
|---|---|---|---|
| Minor | as normal | as normal | 1 turn |
| Major | −1 | as normal | 2 turns |
| Brutal | −1 | +1 | 3 turns |

A card's own text can change these (Kneecap's −2, for example).

**The cards** (from lacrosse, hockey, football, rugby, soccer, basketball, wrestling, plus some
made up):

| Card | From | Tier | Uses | Affinity | Effect |
|---|---|---|---|---|---|
| Shirt Pull | soccer | Minor | Speed | Agility | +1. No knockdown: the target only drops the ball. |
| Tripping | lacrosse, hockey | Minor | Speed | Speed | +2 if the target holds the ball. |
| Hooking | hockey | Minor | Speed | Speed | May target the opposing player in an adjacent lane of the same row. |
| Atomic Wedgie | made up | Minor | Muscle | Strength | No Toughness check: on a win the target is automatically Shaken, never worse. |
| Slashing | lacrosse, hockey | Major | Speed | Berserking | +1. |
| Cross-check | lacrosse, hockey | Major | Muscle | Strength | No change from the tier. |
| Clothesline | football, wrestling | Major | Muscle | Strength | Only against the ball carrier. +1 severity. |
| Gouge | rugby, made up | Major | Speed | Agility | If the target passes its Toughness check, it's Shaken anyway. |
| Slew-foot | hockey | Major | Speed | Agility | Toughness check at −2 instead of −1. |
| Late Hit | football, rugby | Major | Speed | Berserking | *Reaction:* after the opposing player in this spot passes or shoots (once that resolves). No ball to drop; it can only hurt. |
| Elbow | soccer, basketball | Major | Speed | Berserking | *Reaction:* when your player loses a contest to the opposing player in this spot. That result stands, then you attack with +1. |
| Kneecap | made up | Brutal | Muscle | Strength | Toughness check at −2. If hurt, Shaken counts as Injured. |
| Spearing | lacrosse, hockey, football | Brutal | Speed | Berserking | +2, but the attacker makes a Toughness check too, win or lose. |
| Chop Block | football | Brutal | Speed | Speed | Toughness check at −2. |
| Stamp | rugby | Brutal | Muscle | Strength | Only against a Shaken target. +3. |
| Pile-on | rugby, made up | Brutal | Muscle | Berserking | +1 for each of your standing players in an adjacent lane of the same row. |

**The penalty check.** After rerolls, if the attacker's final die is a 1, they roll a penalty die
(no rerolls allowed). On another 1, the referee calls a penalty: 1 in 36 per attack. Rerolling
a 1 away avoids the check. The attack still resolves normally, then:

- The attacker goes to the **penalty box** beside the mat, face up, for the card's tier in turns.
  The count goes down at the end of each of their own team's turns. When it reaches 0, they
  return to their spot.
- While they're out, **the spot is empty**: it counts as 0 and can't intercept, and nobody can
  tackle, hit, or attack the opposing player in that spot from there. **No substitution** into
  the spot during a penalty ⚙ (that's what separates a penalty from a send-off).
- **Power play:** if the other team scores while they're in the box, all of that team's
  penalized players come back at once, before the faceoff ⚙.
- Config: `penaltyLength: 'card' | 'result'` (decision 9). With `'result'`: no injury or Shaken
  = 1 turn, Injured = 2, Knocked out or carried off = 3.

**Estimate before simulating:** about 5.5 physical cards drawn per team per game. If the
computer plays about 4, that's 8 attacks a game, about 55% won, and about 2.4 hurt (roughly 1.0
Shaken, 0.85 Injured, 0.5 Knocked out). Penalties come out at about 8 ÷ 36 ≈ **0.2 a game, one
every 4 or 5 games**: rare, as intended. Added to the Phase b estimate, real injuries (Injured +
Knocked out + carried off) rise from v0.16's 2.77 to about 3.7, but carried off + knocked out
lands at about 1.45, right at the 1.5 limit. **That limit will probably be the binding
constraint.** The levers, in order: the knocked-out return roll (4–6 → 3–6), then dropping
Brutal's +1 severity.

### Phase d: healing, ward, and abilities

- **Mend** (`mend`, existing spells Mend, Knit, and Set the Bone): remove an injury from one of
  your players (as now), **or** bring one of your knocked-out players back to your hand.
- **Ward** (new reaction effect `ward`, non-numeric): "If your player is hurt in this contest,
  they're only Shaken." It works against tackles, hits, and dirty plays. It goes on **Ward**
  (warding) and **Stone Skin** (earth.stone), both shields today. Team A swaps Scrying Bowl for
  Stone Skin. Team B swaps True Sight for Hex and its Ward becomes a ward. Both decks end up with
  1 boost, 2 shields, 1 ward, 1 dirty play, 3 hits, 2 steals, 1 long shot, 1 long pass, 1 decoy
  pass, 1 mirror images, 1 recall, and 1 mend (16).
- **Player abilities (new effects)**, given by Resonant:

| Ability | Effect | Given to players with an Affinity in |
|---|---|---|
| Heavy hands (`hits_harder`, +1) | +1 to severity rolls for anyone this player hurts (tackle, hit, or foul): 33% Shaken, 33% Injured, 33% Knocked out | Strength, Berserking, Force, Shattering, Earth, Explosion |
| Sturdy (`hard_to_hurt`, −1) | −1 to severity rolls against this player: 67% Shaken, 33% Injured, never Knocked out | Healing (any), Endurance, Stone, Ice |
| Quick but fragile | Toughness 1 below their type, plus the existing `bonus` ability: +2 Speed when dodging a tackle or physical attack | Air (any), Speed, Agility, Danger-sense |

About 8 players get each one (fixed seed), only those whose Resonants qualify. All three are
measured and priced in Phase f. The names are plain English, not borrowed from any other game.

### Phase e: optional rules (kept only if they help the targets)

- **Assist:** +1 ⚙ to a tackle for each of your standing players (on the field, not Shaken) in an
  adjacent lane of the same row. With 2 lanes that's at most +1. In the center lane of the
  add-on, it's up to +2.
- **Tackle risk:** a tackler who loses by 3 or more ⚙ is Shaken (no Toughness check).

Each is simulated on and off against Phase d on the same seeds. I'll keep one only if it moves a
missed or borderline target toward range (most likely injury count, Shaken share, or game
length) without pushing another out.

### Phase f: player costs and the cap

**Measuring value first.** For each item below, one team gets the change and plays an unchanged
team. Each seed is played twice, with the changed team as A and then as B, so dealing and
first-player luck cancel out. That's 5,000 seeds, or 10,000 games, per item. The result is the
change in win rate, with a 95% confidence interval.

- +1 Speed, +1 Shot, +1 Defense, +1 Faceoff (all of the team's field players; 7 is allowed here)
- +1 Save (both goalies)
- −1 Toughness (all field players)
- One extra Resonant for every player (drawn the way the generator draws them)
- Each new ability (given to all of the team's field players)
- Each spell effect, using the spell-tiers method: swap 4 rarely-cast spells for 4 copies of it,
  then divide by 4. That covers open boost, each of the 8 narrow boosts, shield, ward, dirty
  play, hit, steal, long shot, long pass, decoy pass, mirror images, scry, swap, recall, and mend.
- Each physical card, the same way inside the Physical pile: 4 copies of it replace 4 others,
  then divide by 4. Speed will be worth more than in v0.16 because it now drives both attacking
  and dodging, so physical attacks have to be in before pricing.

**Cost formula:** a card's cost is the sum of (measured value per point × that card's points)
over Speed, Shot, Defense, Faceoff, Toughness, Resonants, and its ability. Goalies use Save and
Resonants. Value per point per card = the team-wide change ÷ the number of cards that got it
(22 field players, or 2 goalies). The scale is set so an average field player costs **10**, then
rounded to whole numbers for the printed card (about 6 to 16). Costs come only from these
measurements, never from how often a skill is used.

**Roster cap** ⚙ = the cost of an average 24-player deck from the pool, so the starter set
(below average) fits and nobody can field all the stars. It applies to Constructed decks and
online saved teams. Dealt and drafted games have no cap.

**Regenerating the 100 named players** (`scripts/generate-players.ts`): keep each player's id,
name, type, stats, and Resonants. Add Toughness (by type, adjusted for "quick but fragile"),
abilities (Phase d), and `cost`. `bonusPoints` is removed, since cost replaces it. The script stays
fixed-seed and repeatable.

**Roster targets, measured with Constructed decks** (both teams use the same 16 spells, and sides
swap on each seed):
- *Defense-heavy vs Striker-heavy at equal cost:* both decks share the same 2 goalies and 8
  middle players (Playmakers and All-rounders). The other 14 are Stoppers and Anchors on one
  side, and Strikers and Runners on the other, picked so the totals match within 1%. 20 roster
  pairs × 250 seeds × 2 sides = 10,000 games.
- *10% cost gap:* random legal decks paired so one costs 10% (±1%) more. 20 pairs × 250 seeds ×
  2 sides = 10,000 games.

## Targets and how each is measured

| Target | Measured as |
|---|---|
| Injuries 4–8 a game, at least half Shaken | Every Shaken, Injured, Knocked out, and carried-off result (tackle-risk Shaken included), both teams. Shaken share with a 95% interval. |
| Carried off + knocked out ≤ 1.5 | Per game, both teams, with a 95% interval. |
| First carry-off predicts the winner ≤ 60% | Decided games with at least one carry-off or knockout: how often the team that *suffered* the first one lost. |
| Defense-heavy vs Striker-heavy 45–55% | As above. |
| 10% cost gap 55–65% | As above. |
| Spells cast ≥ v0.16 | Casts per game, compared with 15.7. |
| Real injuries ≥ 3.5 a game (v0.16: 2.77) | Injured + Knocked out + carried off, both teams, with a 95% interval. This is the target that answers "too few injuries"; Shaken doesn't count toward it. |
| Penalties: 0.1–1.2 a game (Paul 2026-10-15; was 0.1–0.5) | Penalties per game, with turns spent in the box and power-play returns. Also reported: physical attacks per game, win rate, and ball drops. |
| Unanswered capped Shield under 75% | Exact chance before the dice: for the 5-vs-6 example, and averaged over every shot in the simulation. |
| 30–50 turns; goals within ±25% | Per game, with a 95% interval. |

If a target can't be met, I'll say which one and why, and propose the trade-off. I won't quietly
loosen it.

**Simulation standard.** At least 5,000 games for every comparison. Usually it's 5,000 seeds
played twice with sides swapped. Before/after comparisons of a rule change run on identical
seeds, so the decks dealt and the first player are the same. Every win rate gets a 95%
confidence interval (from the spread of results per seed, with draws counting as half). Every
per-game average gets one too.

## Files that change, in order

Work happens on a new branch, `rules-v0.17`. Each phase is one commit with its simulation report
in `reports/`. `npm test` and `npm run typecheck` must pass before every commit. The computer
opponent is updated in the same phase as each rule, or that phase's numbers would mean nothing.

**Phase 0: simulator tooling (no rule changes)**
- `scripts/sim-compare.ts` (new): runs two configs or card sets on the same seeds across all CPU
  cores, with child processes like `spell-tiers` already uses. Prints win rates and every target
  with 95% intervals. Writes a Markdown report.
- `src/sim/stats.ts`: new counters (knockdowns, hurts by severity, Shaken share, knocked out,
  carried off, sent off, fouls and catches, first-carry-off winner, spells per game, the exact
  unanswered-Shield chance per shot).
- `src/sim/confidence.ts` (new): the interval math.
- `src/sim/rosters.ts` (new): builds the Constructed roster pairs for Phase f.
- `src/ai/runGame.ts`: an optional `prepare` hook, so a measurement can change one side's cards
  after dealing without touching the engine.
- Report: v0.16 baseline at 10,000 games.

**Phase a: Shield cap.** `config.ts` (`shieldEffect: 'zero' | 'half' | 'minus'`, `shieldAmount`),
`score.ts`, RULES.md, `tests/effects/shield.test.ts`, and the legacy patch in
`server/matches.ts` `savedSetup()` (old matches keep `'zero'`). The computer reads the same
`scoreSide` math, so it follows automatically.

**Phase b: Toughness and severity.** *(Done 2026-10-14: 3.55 hurts a game, 51% Shaken, real
injuries 1.75. Under the 4–8 and 3.5 targets; see `reports/sim-2026-10-14-v17b.md`.)*
- Engine: `config.ts` (`knockdowns`, `severity`, `shakenPenalty`, `knockedOutReturn`,
  `toughnessByRole`), `cards.ts` (`toughness` on field cards; the loader checks it), `state.ts`
  (`Slot.shakenUntil`, `TeamState.knockedOut`), `injuries.ts` (knockdown, Toughness check,
  severity, Shaken, knocked out, return rolls), `contest.ts` (a tackle win knocks down; hits and
  fouls hurt), `score.ts` (Shaken −2), `flow.ts` (stand up at end of turn and at full time;
  return rolls at faceoffs), `validate.ts` (Shaken players can't act or cast), `view.ts`
  (Shaken and knocked-out are public), `events.ts` (knockedDown, toughnessCheck, hurt, shaken,
  stoodUp, knockedOut, returned).
- Computer (`src/ai/heuristic.ts`): what a hurt is worth, by severity chance; tackles value the
  knockdown using known Toughness, or a guess by row for face-down players; Shaken players count
  as weaker; substitutions consider Shaken players.
- UI: Shaken tiles shown sideways, a knocked-out area, and plain-language event text in
  `src/text/describe.ts` ("Your Defense 5 beat their Speed 3. You take the ball and knock them
  down. Toughness roll 5 against 3: hurt. Severity 2: Shaken."). Toughness on `CardFace.tsx`.
- Data: `cards.schema.json` (`toughness`), Toughness added to the 100 players by type (stats
  unchanged).
- Tests: `tests/rules/knockdowns.test.ts` (new), `injuries.test.ts`, `hit.test.ts`,
  `dirty_play.test.ts`, `hidden-info.test.ts` (Toughness is on the card, so the computer still
  can't see a face-down player's).

**Phase c: fouls and the referee.** *(Done 2026-10-15: 1.39 fouls a game, 15.9% caught, 0.22
sent off; spells cast back to 16.3. See `reports/sim-2026-10-15-v17c.md`.)* `state.ts` (a new `foul` decision before the roll),
`contest.ts` (the foul step, the referee, sent off), `injuries.ts` (sent off), `legal.ts` and
`validate.ts`. Computer: whether to foul (win chance before the dice, minus 1 in 6 × the cost of
losing the caster), and rerolls that break or chase doubles. Tests: `tests/rules/referee.test.ts`
(doubles send off; no doubles does nothing; both foulers caught; a reroll breaks doubles; the
spot stays empty; the ball is picked up; the foul still takes effect) and
`tests/rules/dice.test.ts` (no reroll offered for Toughness, severity, or return rolls).

**Phase c2: physical attacks and the penalty box.** *(Done 2026-10-15: 5.70 hurts a game,
real injuries 2.87, 0.17 penalties; turns 50.7 and spells cast 13.5 now miss. See
`reports/sim-2026-10-15-v17c2.md`.)*
*Trial (Paul, 2026-10-15): blind physical draw, physical cards flipped from the pile instead of
held in hand (`physicalDraw: 'blind'`, off by default). Results and the attack-limit what-if:
`reports/sim-2026-10-15-v17c2-blind.md`. Waiting for Paul's call.*
*Escalating penalties (Paul, 2026-10-15) adopted: see `reports/sim-2026-10-15-v17c2-escalation-hand.md`.*
*Paul's call (2026-10-15): blind draw with 8 attacks per team is the rule, with escalating penalties;
about one penalty a game is acceptable for now (target 0.1–1.2). Hooking, Clothesline, Stamp, Late
Hit, and Elbow are plain attacks under blind draw. Report:
`reports/sim-2026-10-15-v17c2-blind-limit8-escalation.md`.*
- Engine: `config.ts` (`physicalAttacks`, `physicalPileSize`, `physicalSetupDraw`,
  `physicalFaceoffDraw`, `affinityAttackBonus`, `tierModifiers`, `penaltyLength`,
  `powerPlayReturn`, `penaltyNoSubstitution`), `cards.ts` (a `physical` card kind with tier,
  stat used, Affinity, and effect; the loader checks it), `state.ts` (`TeamState.physicalPile`,
  `physicalDiscard`, `penaltyBox`), `contest.ts` (the attack contest, the penalty check, the
  card effects), `injuries.ts` (tier modifiers, Endurance), `flow.ts` (draws at setup and
  faceoff, penalty countdown at end of turn, power-play return on a goal), `legal.ts` and
  `validate.ts` (who can attack whom, Reaction timings, no attacks from Shaken players or ball
  carriers), `view.ts` (the penalty box is public; physical cards in hand are hidden like
  spells), `events.ts` (attackDeclared, ballDropped, penaltyCheck, penalized, penaltyServed,
  powerPlayReturn).
- Computer (`src/ai/heuristic.ts`): when an attack beats passing, shooting, or tackling (ball
  value plus expected hurt, minus about 1 in 36 × the cost of losing the spot for the card's
  tier); Reaction timings for Late Hit and Elbow; Penalty-box spots treated as empty.
- Data: the 16 physical cards in `cards.prototype.json` and `cards.schema.json`, each team's
  Physical pile.
- UI: a physical card face (different from spells), the Physical pile, a penalty box area with
  a turn counter, and event text in `src/text/describe.ts` ("Kneecap: your Defense 5 + 3 beat
  their Speed 4 + 2. They drop the ball. Toughness roll 3 against 2 (−2 for Kneecap): hurt.").
- Tests: `tests/rules/physical.test.ts` (each card's effect, Muscle uses Defense, Affinity
  bonus, ball drop, Endurance and Danger-sense), `tests/rules/penalty.test.ts` (1 then 1 calls
  it; 1 then anything else doesn't; no reroll on the penalty die; tier sets the length; the spot
  is empty and can't be substituted; a goal brings everyone back), and the `dice.test.ts`
  addition for the penalty die.

**Phase d: healing, ward, and abilities.** `cards.ts` (the `ward` reaction; the `hits_harder`
and `hard_to_hurt` abilities), `contest.ts` and `injuries.ts`, `reducer.ts` and `legal.ts` (Mend
targets knocked-out players), the computer (values Ward, Mend on knocked-out players, and
abilities), the library and team decks in `cards.prototype.json`, MAGIC.md, `spellHelp.ts`.
Tests: `tests/effects/ward.test.ts`, `mend.test.ts`, `hits_harder.test.ts`,
`hard_to_hurt.test.ts`.

**Phase e: optional rules.** `config.ts` (`tackleAssist`, `tackleRiskMargin`, both off unless
kept), `contest.ts`, the computer's tackle estimate, and tests for whichever are kept.

**Measurement (before pricing).** `scripts/measure-value.ts` (new) writes
`reports/value-<date>.md` and `.json`.

**Phase f: pricing.** `cards.ts` (`cost`; a cap check in `deckProblems`), `config.ts`
(`rosterCap`), `scripts/generate-players.ts` (rewritten as above), `cards.prototype.json`,
`cards.schema.json`, `starter.json` (checked under the cap), `server/migrations/011_*.sql` (adds
`toughness` and `cost` to the `player_cards` mirror; play itself reads the JSON),
`server/cardData.ts`, cost on `CardFace.tsx`, the cap shown in the saved-team editor (it already
lists `deckProblems`). Tests: `tests/players-data.test.ts` (every cost matches the formula; the
starter set fits the cap) and `tests/rules/constructed.test.ts` (an over-cap deck is refused).

**Wrap-up.** `docs/RULES.md` becomes v0.17 in the same format, with a change log entry from v0.16
and the Canon notes untouched. Also GAME_DESIGN.md (card layout shows Toughness and cost),
`HowToPlay.tsx`, `RecentChanges.tsx`, `SIM_REPORT.md` (before and after for every target, every
value measurement, and open problems), a 1,000-game smoke run with 3 lanes, and the 1,000-game
no-crash simulation test.

## Online play

- Matches already in progress keep v0.16. `savedSetup()` fills each new setting with its old
  value when it's missing (`shieldEffect: 'zero'`, `knockdowns: false`, `physicalAttacks: false`, `foulTiming:
  'reaction'`, `rosterCap: 0`, and so on). A replay test proves an old match plays out the same.
- New matches use v0.17 cards and rules.
- The questions about owned cards and saved teams are decision 6 above.

## Risks I already see

- **The computer opponent is the measuring stick.** If it fouls badly or never wards, the numbers
  show that, not the rules. Each phase report will show how often it uses each new option, and
  `tests/ai.test.ts` will check it uses fouls, ward, and mend at all.
- **Knockouts are the tight budget now.** With physical attacks, carried off + knocked out is
  estimated at about 1.45 against a 1.5 limit. Expect to use the return-roll lever.
- **Attacks compete with scoring.** Every attack is an action not spent passing or shooting, so
  goals may drop further. Ball drops partly offset this. Watch the goals target in the c2 report.
- **More art for the physical edition.** Physical cards need their own card face and 16 pieces
  of art (or shared art per tier). Settle the card layout before the artist starts.
- **Injuries could land at the low end (about 4.5 before Phase c2).** The levers are in Phase e. Raising Hit
  strength is a last resort.
- **Goals may drop** once shields are capped and forwards get hurt. The levers, in order: the
  pass bonus, then catch and shoot, then goalie Save.
- **The 10%-cost-gap target depends on how much card quality matters at all.** With every contest
  rolled, it might not reach 55% even with perfect prices. If so, I'll report it rather than
  inflate the prices.
