# Spellstick — tutorial design

Status: both tutorials are built (2026-10-19). Decisions are at the end. Where building changed
the plan, this document says what was built and why.

## Goal

A first-time player opens "Learn to play" and, in about ten minutes, plays one real game against
the computer while a coach explains each step and suggests a move. Every time:

- Both teams get the same cards in the same order, so the coach can be written for them.
- The computer's team is clearly weaker, and the player can see it as cards are revealed.
- The player can ignore any suggestion. The coach keeps up and suggests the next move from
  wherever the game is now.

It's a real game under the real rules engine, not a slideshow. The only differences are a smaller
deck and a few settings (below).

## How it works, in one paragraph

The tutorial is a normal game created from a fixed **scenario** (`data/tutorial.json`): both
decks by card id in draw order, who goes first, the computer's goalie and lineup, a few config
settings, and one seed. Since the engine is seeded and pure, the same scenario plus the same
actions always plays out the same way, dice included. We pick a seed, with a script, where
following the coach's every suggestion gives a good first game (win the faceoff, catch the first
pass, score early, win). If the player does something else, the dice go differently from then on,
and it's simply a real game against a weaker team. The coach never relies on the script for its
words: its lessons are triggered by what's on the board, and its suggestions are worked out from
the player's view each time. So it reads the same whether the player follows along or not.

## Tutorial settings

All existing config values, set for the tutorial only (the real rules don't change):

| Setting | Tutorial | Normal | Why |
|---|---|---|---|
| Deck | 2 goalies, 13 field players, 9 spells (24) | 2, 22, 16 (40) | A game of about 20 turns, 10 minutes (22 cards gave only about 14 turns) |
| Goals to win | 2 | 3 | Ends sooner, still room to come back |
| Physical attacks | off | on | One less system while learning |
| Dirty plays | none in either deck | in decks | Fouls and the referee are left for later |
| Team cap | off | 239 | The strong team is over the cap on purpose |
| First player | computer | random | So the player chooses the opening faceoff lane |

Everything else (dice, rerolls, catch and shoot, Toughness, Shaken, injuries, casting limit,
substitutes, hand limit, the game clock, a shootout if tied) works as normal. Physical attacks and
fouls get their own short tutorial, offered at the end of this one.

## The cards

Real named players from the pool, so the player meets cards they'll see again. Lanes are left and
right; "their" defender in a lane is the one your forward meets.

### Your team (side A)

| Spot | Player | Type | Key stats | Resonants |
|---|---|---|---|---|
| Goal | Antoinette Whitcombe | Goalie | Save 6 | Shame (Invisibility), Vigor (Vitality) |
| Spare goalie | Adeline Marlowe | Goalie | Save 5 | Fatigue, Tiredness (Slowing) |
| Left forward | Josephine Carrington | Runner | Speed 5, Shot 5 | Panic (Speed, a Body specialty) |
| Right forward | Beatrice Merriweather | Striker | Speed 4, Shot 6 | Climax (Fire), Lucidity (Divination) |
| Left midfield | Anastasia Stanhope-Ainsworth | Runner | Speed 6, Faceoff 6 | Revulsion (Force) |
| Right midfield | Viola Radcliffe | Playmaker | Speed 5, Defense 4, Faceoff 5 | Weakness (Curse), Vigor (Healing) |
| Left defense | Estelle Talbot | Anchor | Defense 6 | Tiredness (Time), Blood-hunger (Enchantment) |
| Right defense | Ophelia Merriweather | Stopper | Defense 6, Sturdy | Sorrow (Water), Apathy (Ice) |
| Bench (in hand) | Harriet Wentworth-Hadley | Striker | Shot 6 | |
| Bench (in hand) | Camille Whitcombe | Anchor | Defense 6, Quick but fragile | |
| Players pile, in order | Theodora Radcliffe (Speed 6), Valentina Hadley (Defense 5), Celeste Sterling (Faceoff 5), Hilda Hollis (Shot 6), Irene Thayer (Shot 6), then the spare goalie | | | |

The "Spot" column is the coach's suggested lineup. The player places the cards themselves.

Spells, opening hand: **Burst of Speed** (+3 when receiving; Josephine is a specialist, so +5),
**Pinpoint** (+3 when shooting; Josephine is a Body match, so +4), **Fresh Legs** (+2; the goalie
Antoinette is a Vitality specialist, so +4 on a save). Spells pile, in order: **Ice Wall**
(shield), **Divine** (scry), **Heavy Ground** (steal), **Float Pass** (long pass; Anastasia's
Force is a match), **Second Wind** (+2), **Mend**.

Each opening spell has a caster on the field who makes it stronger, so the player learns
affinity by using it, not by reading about it.

### The computer's team (side B)

| Spot | Player | Type | Key stats |
|---|---|---|---|
| Goal | Annabel Pemberton | Goalie | Save 5 |
| Spare goalie | Philippa Hadley | Goalie | Save 5 |
| Left defense (meets Josephine) | Seraphina Ashford | Anchor | Speed 3, Defense 3 |
| Right defense (meets Beatrice) | Frances Holloway | Anchor | Speed 3, Defense 3 |
| Left midfield | Isabella Carrington | All-rounder | Faceoff 4, Defense 3 |
| Right midfield | Eleanor Sinclair | All-rounder | Faceoff 3, Defense 4 |
| Left forward (meets Estelle) | Gertrude Galloway | Striker | Speed 3, Shot 4 |
| Right forward (meets Ophelia) | Rosalind Hadley | Striker | Speed 3, Shot 4 |
| Bench | Elsa Prescott-Langley, Madeleine Sinclair | Anchors | Defense 3 |
| Players pile | Lucinda Stanhope, Helena Bancroft, Marjorie Bancroft-Talbot, Imogen Prescott, Genevieve Fenwick | | All Defense or Shot 4 or less |

Spells: opening **Alarm Ward** and **Far Sight** (scry), **Sleight** (swap); then **Second Wind**
(+2), **Mend**, **Water Spear** (hit), **Knit**, **Dazzle** (shield), **Set the Bone**. Few
reactions, no specialists, and the one hit spell is deep in the pile so an injury comes late, if
at all. (Built: the first draft gave the computer Summon and Precognition, which draw 2 cards and
ran its deck out in about 14 turns, and Second Wind in its opening hand, which lost the player the
opening faceoff almost half the time.)

### How much weaker (both sides roll a die in every contest)

| Contest | Chance |
|---|---|
| Your opening faceoff (Faceoff 6 vs 4, you win ties) | 83% |
| Your pass to Josephine (Speed 5 + 2 vs Defense 3) | 97% |
| Josephine's shot (Shot 5 vs Save 5) | 42%, or 92% with Pinpoint |
| Their pass to a forward (Speed 3 + 2 vs your Defense 6) | 42% |
| Their shot (Shot 4 vs your Save 6) | 17% |
| Your tackle on their forward (Defense 6 vs Speed 3) | 83% |

The player sees this as it happens: every reveal shows a 3 where theirs show 5s and 6s. The
welcome screen says it plainly: "In this practice game, the computer's team is weaker on purpose."

## The computer opponent

`tutorialAgent`: for setup it plays the scenario's goalie and lineup (legal `chooseGoalie` and
`place` actions, through the same API as any player). After that it is the normal heuristic
agent, seeing only its own view. No special softening: the weaker cards are the handicap. If
simulation shows players who ignore the coach lose too often, the first lever is weaker computer
cards, then a gentler AI setting.

## The coach

The coach lives in `src/tutorial/` and has no React in it. Like the AI, it reads only the
player's view (`viewFor`), their legal actions, and the events they've seen. It never looks at the
computer's face-down cards, even though we know them from the scenario. It returns a **tip**:

```ts
interface CoachTip {
  lesson?: { id: string; title: string; text: string }; // shown once, the first time it applies
  suggestion: Action | null;  // what the coach would do
  why: string;                // one line: "Josephine's Speed 5 + 2 should beat a defender."
  highlight: Highlight[];     // cards, spots, or buttons to glow
}
```

### Three layers

1. **Lessons.** A list of situations, each taught once, the first time it comes up. Each has a
   condition on the view ("the player has the ball at forward", "a reaction prompt is open"), a
   short text that uses the real names and numbers, and optionally its own suggestion. Lessons are
   keyed to situations, not to turn numbers, so they work in any order.
2. **Coach rules.** About a dozen readable rules that pick a move and say why: shoot when a
   forward has the ball; pass to the receiver with the best chance of catching it, preferring
   forward; tackle when your Defense likely beats their Speed; play a reaction spell only when it
   turns a loss into a win, and the contest matters; reroll only a low die that decides the
   contest; draw spells while you have spare players; substitute a tired or Shaken player.
3. **Fallback.** If no rule applies, the suggestion is what the heuristic agent would do (today's
   Hint button), with a generic reason: "A reasonable move here is to draw a player."

Rules use the same win-chance helpers the game screen already shows, so the reason can say
"about 80% to catch it."

### On screen

- A coach panel beside the board: the lesson (if any), the suggestion as a sentence, and a
  **Do it** button. The suggested card or spot glows.
- Nothing is locked. Every button the player normally has still works.
- "Hide tips" turns the coach into today's Hint button. "Skip tutorial" goes back to the menu.
- After each contest the normal announcement explains the result ("Your Speed 5 beat their
  Defense 3. Ball moves to midfield."). The coach adds one line the first time each kind of
  result happens: first interception, first save, first goal, first Shaken player, and so on.
- The hint button is replaced by the coach in the tutorial.

## Lessons, in the order they usually come

The text is a first draft. Names and numbers come from the view, so if the player put someone
else in a spot, the text names that player.

**Setup**

1. **Welcome.** "Spellstick is lacrosse with spells. You'll play one short game against the
   computer, first to 2 goals. Its team is weaker on purpose. I'll suggest moves; you don't have
   to take them."
2. **Choose your goalie.** Suggest Antoinette. "Goalies only have Save. Antoinette's Save 6 beats
   Adeline's 5. The other one goes into your deck as a spare."
3. **The field.** Shown with the empty lineup. "Five rows, two lanes. Your forwards face their
   defenders, your midfielders face theirs, your defenders face their forwards. Everyone is face
   down until they're in a contest, so the other team doesn't know who's where."
4. **Place your lineup.** Suggest one card at a time, with a **Place all for me** button.
   "Forwards need Speed to catch passes and Shot to score: Josephine (5 and 5). Midfielders need
   Faceoff: Anastasia has 6. Defenders need Defense: Estelle and Ophelia have 6. Keep two in your
   hand as substitutes."
5. **Opening faceoff lane.** Suggest left. "The game starts with a faceoff in midfield, and you
   choose the lane. Pick the one where your best Faceoff player is."
6. **Dice.** On the first contest. "Both players roll a die and add it to their stat. Higher
   wins; you win ties in this faceoff. You have 3 rerolls for the whole game. Your 6 + 4 = 10
   beats their 4 + 2 = 6, so keep it."
7. **Reaction spells.** On the first reaction prompt. "After the dice, each side may play one
   reaction spell. You don't need one here. Save them for contests you'd lose."

**Your turn**

8. **Draw step.** "Each turn: draw, act, then discard down to 7. Draw a player or a spell. You
   have spare players, so take a spell."
9. **Passing.** Suggest the pass to Josephine. "Pass one row forward, sideways, or any distance
   back. The receiver gets +2. Josephine's Speed 5 + 2 against whoever is defending there. The
   receiver and that defender are turned face up; the passer stays hidden."
10. **What a reveal tells you.** After the catch. "Their left defender is Seraphina, Defense 3.
    Now you know that lane is weak."
11. **Catch and shoot.** "A forward who catches a pass can't be tackled until your next turn. Next
    turn, shoot."
12. **Shooting.** Suggest shoot. "Shot against the goalie's Save, both roll, and you need to be
    higher. Josephine's 5 against their 5 is about 42%. Most shots are saved."
13. **Affinity.** When a reaction spell would turn the shot. "Play Pinpoint. It's +3 when shooting,
    and Josephine's Panic has an affinity for Speed, part of Body magic, the same family as
    Pinpoint. A match adds +1, so +4. If her Affinity were exactly Pinpoint's specialty (Precision),
    it would add +2, for +5."
14. **Goal, or a save.** Goal: "1–0. After a goal there's a faceoff, and the team that was scored on
    chooses the lane and takes the next turn." Save: "Their goalie has the ball now and has to
    pass it out on their turn. Get ready to defend."

**Their turn and defending**

15. **Their turn.** "The computer draws, then takes one action, like you. Its choices show up
    here."
16. **Tackling.** When they hold the ball in a spot you can tackle. "Your player in the same spot
    can tackle: your Defense against their Speed. Estelle's 6 against their 3. Win and you take
    the ball, and they're knocked down. Lose by 3 or more and your tackler is Shaken."
17. **Defending a pass or shot.** On the first one. "When they pass into your defender's spot,
    your Defense tries to intercept. When they shoot, your goalie saves. Fresh Legs on Antoinette
    is a specialist match: +4."

**Things that come up sooner or later**

18. **Shaken.** "Turned sideways: can't pass, shoot, tackle, or cast, and −2 in contests, until
    the end of their team's next turn."
19. **Knocked down and Toughness.** "A tackled player rolls a die: at or under their Toughness
    they're fine, above it they're hurt."
20. **Injury and forced substitute.** "An injured player has to come off. The substitute comes on
    Shaken."
21. **Casting limit.** When a player has used all their spells. "A player can cast one spell per
    Resonant. Josephine is out. Substitute her to rest her; she comes back fresh."
22. **Substitute.** "Instead of drawing, swap a player from your hand onto the field, face down.
    They can't act this turn."
23. **Scry.** When Divine is in hand. "Divine lets you look at one of their face-down players."
24. **Long pass.** When Float Pass could reach a forward from defense or the goalie.
25. **Hand limit.** "With 7 cards you don't draw; the top card of the pile you choose is
    discarded. The game clock keeps running."
26. **The clock.** When the piles get low. "The decks are the clock. When they run out, more goals
    wins, and a tie goes to a penalty shootout."
27. **Shootout.** Only if it's tied at full time.

**The end**

28. **Wrap-up.** Win: "You won 2–0." Loss: "They got lucky this time. The cards were on your
    side, so it's worth another go." Then: "Real games are rougher: players make physical
    attacks and cheat with magic." Buttons: **Next: contact and fouls** (the second tutorial),
    **Play a real game**, and **Play this again**, plus a link to How to play. The tutorial is
    remembered as done in this browser, and the start screen then suggests the second one.

## When the player does something else

The coach never says "wrong." It says what the choice means, once, and then suggests from the new
position. One line, then on with the game. Examples:

| The player... | The coach says |
|---|---|
| Picks the Save 5 goalie | "That works. Antoinette saves a little better; you can substitute goalies later." |
| Puts a Defense 6 player at forward | "Estelle's Shot is only 2, so goals will be harder from there. You can move players later with a substitute." |
| Chooses the other faceoff lane | "Viola's Faceoff 5 is still good. Ties go to you." |
| Passes sideways or back | "A safe pass. It doesn't get you closer to goal, but they can't steal it easily." |
| Doesn't shoot with a protected forward | "Josephine is only safe from tackles until your next turn. Shooting now is usually best." |
| Rerolls a winning die | "That roll was already winning. Rerolls are best saved for a die that loses you the contest." |
| Plays a reaction spell it didn't need | "You'd have won anyway. That spell is used up now." |
| Casts with a non-matching player | "Viola has no Body affinity, so Pinpoint is +3, not +4. Still helps." |
| Regroups or passes the turn | "Fine, though doing nothing gives them time." |
| Loses the ball | Switches to the defending lessons. |
| Falls behind | "Plenty of game left. The decks are the clock: X turns to go." |

Each comment is tied to the action type and only shown the first time per kind, so it never nags.

Lessons whose example used specific cards (13, 17, 21) check that the cards are where the text
needs them. If not, they use whichever player is in the spot, or wait for a better moment.

## Second tutorial: contact and fouls

Offered when the first one ends, and on the start screen any time after. Same machinery (a
scenario, the tutorial agent, the coach), its own scenario file `data/tutorial-contact.json` and
its own lessons. About 7 minutes.

### Settings

| Setting | Contact tutorial | Why |
|---|---|---|
| Deck | 2 goalies, 10 field players, 6 spells (18) | About 12–16 turns |
| Goals to win | 2 | Same as the first |
| Physical attacks | on, in a fixed order | The point of this one |
| Dirty plays | one in your hand, two in theirs | So both sides foul |
| Setup | already done | Both lineups are placed from the scenario as the game opens, so the player starts at the faceoff ("Your team is set up like last time.") |

The setup is played as ordinary `chooseGoalie` and `place` actions at the start, so no engine
change is needed for it.

### The cards

**Your team** is the same lineup as the first tutorial, so the player knows them: Antoinette in
goal; Josephine and Beatrice at forward; Anastasia and Viola in midfield; Estelle and Ophelia
(Sturdy) on defense. On the bench: **Charlotte Stanhope-Ainsworth** (Speed 6, Heavy hands) and
Camille Whitcombe. Players pile: Theodora Radcliffe (Sturdy), Harriet Wentworth-Hadley, then the
spare goalie.

Spells, opening hand: **Red Mist** (dirty play), **Stone Skin** (ward), **Burst of Speed**. Spells
pile: **Mend**, **Pinpoint**, **Fresh Legs**.

Physical pile, top first: **Tripping** (minor, +2 against the ball holder; Josephine's Speed
affinity adds +1), **Shirt Pull** (minor, only makes them drop the ball), **Cross-check** (major,
uses Defense), **Hooking**, then the rest in card order. The first flip is the gentlest and most
likely to work.

**Their team** is the same weak team, made rougher: **Sabine Ellery** (Speed 4, Defense 3, Heavy
hands) at left defense, facing Josephine; Frances Holloway at right defense; Isabella and Eleanor
in midfield; Gertrude and Rosalind at forward. Bench: Seraphina Ashford, Madeleine Sinclair.
Spells: **Jinx** and **Sting** (dirty plays), **Second Wind**; then Alarm Ward, Mend, Water Spear.
Physical pile: Hooking, Slashing, Tripping, then the rest. Players pile: Lucinda Stanhope, Helena
Bancroft. (Built: Alarm Ward instead of Summon, which draws 2 cards and runs the computer's deck
out early, as it did in the first tutorial.)

### Lessons

1. **Welcome.** "Real spellstick is rough. This game adds physical attacks and fouls. Their team
   is still weaker on purpose, but it plays dirty."
2. **Physical attack.** When one of your standing players faces their ball holder. Suggest it.
   "Instead of tackling, your player can attack the player in their spot. You choose who; the top
   card of your Physical pile decides the move. Your Speed plus the card's bonus against their
   Speed, both roll. Win and they drop the ball and are knocked down. Your 8 attacks a game don't
   come back."
3. **The card.** After the first flip. "Tripping is a minor attack: +2 against the ball holder.
   Josephine's Panic is a Speed affinity, the card's body affinity, so +1 more. Major and brutal
   cards hurt more and cost more if the referee sees them."
4. **Who can't attack.** The first time a player can't: "A player holding the ball, a Shaken
   player, or one who just came on can't attack. Goalies never attack or get attacked."
5. **Penalty risk.** After your first attack. "Your penalty risk went up to 2. When you attack,
   if your die is at or under the risk, the referee rolls the penalty die; at or under again and
   you get a penalty. A turn without an attack brings it back down. Rerolling your die above the
   risk avoids the check."
6. **Penalty box.** When either side gets a penalty. "Their player sits out 2 turns. The spot is
   empty: it can't intercept, and nobody can be substituted in. If you score now, they all come
   back at once."
7. **Fouls.** On the first foul prompt. "Red Mist is a dirty play. You declare it before the dice,
   not knowing how they'll fall. If your side wins, their player is hurt. If both dice show the
   same number, the referee saw it and your player is sent off for the game." Suggest it only when
   the contest is very likely won.
8. **They fouled.** When they declare one. "They cast Jinx. If the dice match, their player is
   sent off. You can reroll your die hoping to match theirs." Suggest the reroll when it's worth it.
9. **Sent off.** "Out for the game. The spot stays empty until a substitute at a draw step."
10. **Ward.** When your player could be hurt in a contest. "Stone Skin means that if Ophelia is
    hurt, she's only Shaken."
11. **Heavy hands and Sturdy.** When a card with one is revealed. "Sabine has Heavy hands: anyone
    she hurts is hurt worse. Ophelia is Sturdy: hurt less badly."
12. **Knocked out.** If it happens. "Knocked out: beside the field. At each faceoff, roll a 4 or
    better and they come back to your hand. Mend can bring them back too."
13. **Wrap-up.** "That's everything in a real game. Real teams are evenly matched and dealt at
    random." Buttons: **Play a real game**, **Play this again**.

Built (`src/tutorial/contactLessons.ts`): lessons at a decision are the welcome, physical
attacks, the penalty risk, rerolling to dodge the referee's check, fouls, "they fouled", and
wards. Notes after events are the first flip, their first attack, the penalty box, sent off, Heavy
hands, Sturdy, knocked out, power play, and the wrap-up, plus a few kept from the first tutorial
(goals, knocked down, Shaken, injured). Lesson 4 ("who can't attack") was left out: tapping the
Physical pile already says who can attack. None of the first tutorial's lessons come back.

### Coach rules added

- Attack the ball holder when the chance of winning is about 55% or better, at least as good as
  a tackle, and your penalty risk is 1 or 2. (The card is face down, so the chance counts an
  average card's bonus.)
- Declare a dirty play only when the contest is about 75% or better to win, never against a
  goalie, and never with the player's last spell (a foul is cast like a spell). Built: the last
  rule was added after the coach fouled in the opening faceoff with Anastasia, who then had no
  spells for the rest of the game.
- Reroll to break a double when you fouled; when they fouled and you're losing anyway; or, in
  your own attack, to get your die above your penalty risk when the reroll still likely wins.
- Play a ward when your player is losing a contest that can hurt them and no spell turns it
  around.

### When the player does something else

| The player... | The coach says |
|---|---|
| Attacks a player without the ball | "That can still hurt them, but they keep the ball. Attacks are worth most against the ball holder." |
| Attacks three turns in a row | "Your penalty risk is 3 now: about 1 in 4 to be caught. A turn off brings it down." |
| Fouls in a close contest | "If you lose the contest it does nothing, and matching dice still send your player off." |
| Never attacks | Nothing. Attacking is a choice; the lessons still come up when the computer attacks. |

Built as above (attacking at risk 3 or more counts the odds instead: "about 9 in 36 to be
caught"). The first tutorial's comments apply here too.

### Choosing the seed

As for the first tutorial (`npx tsx scripts/tutorial-seed.ts 400 contact`), keeping seeds where,
on the coached line: the player wins, wins a physical attack, and fouls; the computer attacks and
fouls; the referee sends off one of theirs and none of the player's; and the game takes 10–26
turns. A penalty is rare (1 in 36 at risk 1), so it's preferred but not required; lesson 6 waits
until one happens.

Built: of 400 seeds, 16 qualified. **Seed 297** was chosen. Following the coach, the computer
attacks twice, Stone Skin keeps Josephine safe, her own Tripping wins the ball but draws a
penalty (so the penalty box is taught on the player's own team), both sides foul, the referee
sends off their goalie, and the player wins 1–0 at full time. Across all 400 seeds, a player
following the coach won 94.5%, one playing like the computer 92.8%, and random moves 47.8%.

## Engine changes (small)

1. **Fixed draw order.** A new optional `GameSetup.scenario` with `stackedPiles: true`,
   `firstSide`, and `physicalOrder` (physical card ids to put on top of each side's Physical
   pile). With it, `chooseGoalie` doesn't shuffle the Players, Spells, or Physical piles (the
   spare goalie goes to the bottom of Players), and the coin toss is skipped. The injury deck still shuffles from
   the seed. Constructed decks already give each side its exact cards; this keeps their order.
2. **Config.** No new settings: the tutorial uses `deckFieldPlayers`, `deckSize`, `goalsToWin`,
   `physicalAttacks`, and `rosterCap`, which all exist.

Nothing else in the rules changes. A tutorial game replays from its seed and actions like any
other, so "Report a problem" works.

## New code

| Where | What |
|---|---|
| `data/tutorial.json` | The scenario: decks in draw order, both goalies and lineups, config, seed |
| `data/tutorial-contact.json` | The contact tutorial's scenario, with Physical pile orders and `setupDone` |
| `src/tutorial/scenario.ts` | Loads and checks the scenario (`deckProblems` with the tutorial config) |
| `src/tutorial/agent.ts` | `tutorialAgent`: the scenario's setup, then the heuristic agent |
| `src/tutorial/coach.ts` | The coach rules and the fallback: `suggest(view, legal)` |
| `src/tutorial/lessons.ts` | Lessons, notes, comments on other choices, and `TutorialCoach` |
| `src/tutorial/contactLessons.ts` | The contact tutorial's lessons and notes |
| `src/tutorial/play.ts` | Plays whole tutorial games headless (for the seed script and tests) |
| `src/ui/tutorialSession.ts` | `TutorialSession`: a `GameSession` built from the scenario, with the coach |
| `src/ui/CoachPanel.tsx` | The coach panel; the glow on the suggested spot or card is in `GameScreen` |
| `scripts/tutorial-seed.ts` | Finds the seed (below) |

The start screen has a **Learn to play** button, highlighted until the first tutorial has been
played to the end in this browser. After that, a **Contact and fouls** button appears, highlighted
until that one is done too. The first tutorial's wrap-up has a **Next: contact and fouls**
button. Both work in the static build and the online build, with no server.

## Choosing the seed

`npx tsx scripts/tutorial-seed.ts [seeds]` plays the scenario for each seed with the player's side
always taking the coach's suggestion. It keeps seeds where: the player wins, the opening faceoff
is won, the first pass is caught, the player scores by turn 10, the player stops at least one of
the computer's passes or shots, the player plays a reaction spell with an affinity, and the game
takes 16–30 turns. It ranks those by lessons taught, a won tackle, an early goal, and length.

Built: of 400 seeds, 64 qualified. **Seed 73** was chosen. Following the coach, the player wins
the opening faceoff, the computer's tackle fails against Fresh Legs, Josephine catches a pass with
Burst of Speed (a specialist), scores on turn 4, Viola is injured and replaced, and the player
wins 2–0 in 20 turns. Across all 400 seeds, a player following the coach won 99.5%.

Because any change to the engine or the heuristic agent can change what a seed does, a test checks
the chosen seed still qualifies. If a tuning change breaks it, rerun the script and update the
seed in `data/tutorial.json`.

## Tests

`tests/tutorial.test.ts`:

- The scenario's decks and lineups are legal under the tutorial settings, and the player's team is
  the stronger one.
- With stacked piles, cards are drawn in the listed order whatever the seed, with the spare goalie
  at the bottom. (Without it nothing changes: the existing replay tests cover that.)
- The computer puts out the scenario's goalie and lineup.
- The chosen seed still qualifies, and the key lessons are taught.
- For each tutorial, in 30 games each with the player's side following the coach, playing like
  the computer, and making random moves: every coach suggestion is a legal action, and no
  suggestion or lesson names one of the computer's cards the player hasn't seen.
- Following the coach wins at least 95 of 100 first-tutorial games, and 90 of 100 contact games.
- Picking the other goalie gets a kind comment, and each kind of comment is made only once.
- Contact tutorial: the scenario is legal with physical attacks on; the listed physical cards are
  on top of each Physical pile; the game opens at the faceoff with both teams set up; the game on
  screen plays out exactly like the seed search; and the chosen seed teaches the contact lessons
  and none of the first tutorial's.

Win rates over 400 seeds, first tutorial: following the coach 99.5%, playing like the computer
99.3%, random legal moves 27%. Contact tutorial: 94.5%, 92.8%, and 47.8%. Random moves fall short
of the 50% hoped for in the first tutorial, but they're far worse than a real new player (they
regroup, pass backward, and waste spells at random).

## Decisions (Paul, 2026-10-19)

1. **Contact gets its own tutorial.** The first tutorial leaves out physical attacks and dirty
   plays; a short second one teaches them (see "Second tutorial: contact and fouls").
2. **First to 2 goals with a small deck**, about 10 minutes. (Built with 24 cards, not 22: see
   "Tutorial settings".)
3. **Say up front that the computer is weaker on purpose.**
4. **Pool players as drafted** above.
