# Spellstick — rules v0.4

These rules are a starting point. Every number here is a tuning value expected to change after
simulation and playtesting. Tuning values are marked with ⚙ and live in `src/engine/config.ts`.

## Canon notes (Paul fills this in)

How spellstick works in the books. The engine rules below must not contradict these.
Claude Code: do not edit this section.

- Positions (stated): 3 forwards, 3 midfielders, 3 defenders, 1 goalie per side.
  The base game uses 2/2/2/1; an add-on restores the third of each.
- Scoring: Goals are scored if the forward's shot beats both the defender and the goalie
- Restarts: player cards will have a faceoff stat to compare
- Affinities: We won't start with the full list, but each player will have 1-3 "Resonants" each with an "Affinity", this just means they will be better or worse at casting certain spells. Each spell card will have some sort of category of what type of magic it is to match with those affinities. 


## Overview

Each team sets out a lineup of player cards **face down** on its positions. The ball moves
from player to player by passing. Whenever the ball arrives somewhere, the two players who meet
there are revealed and contest it. Spells boost or bend those contests, and they work better or
worse depending on the caster's Resonants. The decks are the game clock: when the cards run out,
the team with more goals wins. Reaching 3 goals ⚙ wins straight away.

## Components

- Two team decks of 40 cards ⚙: 2 goalies, 22 field players, 16 spells.
- A field mat (see "The field").
- A ball token and a score tracker.

## The field

The field has 5 rows and 2 lanes ⚙ (left and right). The add-on adds a center lane, making 3.

| Row | Team A has | Team B has |
|---|---|---|
| 1 — A goal | Goalie | — |
| 2 | Defenders | Forwards |
| 3 — Midfield | Midfielders | Midfielders |
| 4 | Forwards | Defenders |
| 5 — B goal | — | Goalie |

Each **slot** (row 2–4, one lane) holds one player from each team, facing each other. Team A's
left forward always meets Team B's left defender, and so on. The goals hold one goalie each.

"Forward" always means toward the other team's goal.

The ball is always held by a specific player, or is loose at a faceoff. The ball belongs to the
slot, not the card: if the player in that slot changes (substitute, swap), the new player holds it.

## Cards

**Field player cards** have:
- **Speed**: receiving passes and evading tackles.
- **Shot**: shooting.
- **Defense**: intercepting passes and tackling.
- **Faceoff**: winning faceoffs.
- **Resonants**: 1 to 3 ⚙. A Resonant is an emotion or experience (for example, Anger, Love,
  or Pain). Each has one **Affinity**: the element ⚙ that goes with it (placeholders: fire, water,
  earth, air). Anger goes with fire, so an Anger Resonant has a Fire Affinity: better at fire
  magic, weaker at water magic.
- Optionally one ability (see "Effect vocabulary").

Any field player can play any field position. Where you put them is the strategy.

**Goalie cards** have **Save** and 1 to 3 Resonants. They can only play in goal.

**Spell cards** have an element (or none, for neutral spells) and are either:
- **Reaction spells**, played during a contest.
- **Action spells**, played as your action for the turn.

## Face down, revealed, and casters

- Players are placed **face down**. You may look at your own face-down cards at any time.
  Your opponent may not.
- A player is **revealed** (turned face up) when they take part in a contest or cast a spell.
  Revealed players stay face up until they leave the field.
- Discard piles are face up. Anyone may look at them.
- Every spell has a **caster**: one of your players on the field. Casting reveals the caster.
  - For a reaction spell, the caster is your player in the current contest.
  - For an action spell, you choose any of your field players or your goalie. The caster doesn't
    have to be the player who passes, shoots, or tackles.

## Affinity

When a spell is cast, compare its element to the Affinities of the caster's Resonants:

- **Match** (any Resonant has the spell's element): the spell is stronger. Numeric effects get
  +1 ⚙.
- **Opposed** (no match, and a Resonant has the opposite element: fire–water, earth–air ⚙): the
  spell is weaker. Numeric effects get −1 ⚙ (never below 0). Non-numeric effects fail entirely;
  the card is still discarded.
- **Neutral** (anything else, or a neutral spell): normal effect.

Player abilities are never changed by affinity.

| Spell | Match | Neutral | Opposed |
|---|---|---|---|
| boost (+2) | +3 | +2 | +1 |
| steal (+2) | tackle +3 | +2 | +1 |
| recall (2) | draw 3 | 2 | 1 |
| long_shot (−2 Shot) | −1 | −2 | −3 |
| shield, scry, swap, long_pass | works | works | fails |

Because your opponent can't see your face-down players, they don't know how strong your spell
will be until the caster is revealed.

## Setup

1. Each player chooses one of their 2 goalies, places it **face down** in goal, and shuffles the
   other into their deck.
2. Each player draws 10 cards ⚙ (the number of field slots plus 4). If you don't have enough field
   players to fill every slot, keep drawing one card at a time until you do. Place field players
   **face down**, one in each of your defense, midfield, and forward slots, and keep the rest as
   your hand.
3. Choose the first player at random.
4. Start with a **faceoff** (below). The second player chooses the lane.

## Faceoff

Used at the start and after every goal that doesn't end the game. The team that didn't take the
last turn (at the start: the second player; after a goal: the team that was scored on) chooses a
midfield lane. Both midfielders in that lane are revealed and contest using **Faceoff**.
The chooser may play a reaction spell first, then the other side. Ties go to the chooser.
The winner's midfielder takes the ball.

A faceoff is not a turn. At the start, the first player then takes turn 1. After a goal, the
faceoff happens straight away (before the scoring player's discard step), and the team that was
scored on takes the next turn, whoever won the faceoff.

## Turn sequence

1. **Draw** one card. If you can't because your deck is empty, see "End of the game".
2. **Act.** Take two actions ⚙, one after the other. They can be the same action twice (for
   example, pass and then shoot). Scoring a goal ends your turn: after the faceoff, go straight to
   your discard step.
3. **Discard** down to 7 cards ⚙ if you have more.

## Actions with possession

**Pass.** The ball holder passes to one of your field players:
- in the same row, another lane, or
- one row forward, any lane, or
- any row backward, any lane (never to the goalie).

The receiver and the opponent's player in the receiver's slot are both revealed, then contest:
receiver's **Speed** against the opponent's **Defense**. The passer isn't part of the contest
and isn't revealed. If the receiver wins, they hold the ball. If not, the opponent's player
intercepts and holds the ball.

A goalie holding the ball may pass to any of its defenders the same way.

**Shoot.** Only a forward holding the ball. The opposing goalie is revealed. Contest: forward's
**Shot** against goalie's **Save**. If the forward wins, you score. If not, the goalie holds
the ball.

A forward can only get the ball by beating the defender in its slot (winning a pass against
their Defense, or a tackle), so a goal always means the forward beat both the defender and the
goalie.

## Actions without possession

**Tackle.** Your player in the ball holder's slot challenges them. Both are revealed. Contest:
your player's **Defense** against the holder's **Speed**. If you win, your player holds the
ball. If you lose, nothing changes. Goalies can't be tackled.

## Actions any time

**Cast.** Play an action spell with a caster you choose, and resolve it. You can only cast a
spell when it could do something (see each effect).

**Substitute.** Replace one of your field players or your goalie with a matching card from your
hand (field player for field player, goalie for goalie), **face down**. The replaced card goes to
your discard pile, face up. If the replaced player held the ball, the substitute holds it.

**Regroup.** Discard up to 2 cards ⚙, then draw that many. Discarding none is allowed: the
action does nothing.

## Contests

Every contest has an attacker (the side taking the action) and a defender.

1. Reveal both players involved.
2. The attacker may play one reaction spell, cast by its player in the contest. Then the defender,
   having seen it, may do the same. Each side plays at most one.
3. Apply abilities and spells. A value can't go below 0.
4. **The attacker wins only if their value is higher.** Ties go to the defender, except at
   faceoffs (see "Faceoff").

Who is the attacker: the passing team in a pass, the shooting team in a shot or penalty, the
tackling team in a tackle. In a faceoff, the chooser acts first like an attacker and wins ties.

## Scoring

A successful shot scores 1 goal. All players stay where they are. The ball goes to a faceoff,
and the team that was scored on chooses the lane.

## End of the game

- The first team to 3 goals ⚙ wins straight away.
- Otherwise the decks are the game clock. Only the Draw step at the start of a turn can end the
  game; cards drawn by spells, abilities, or Regroup just come from whatever is left in the deck.
- If your deck is empty at your Draw step, skip the draw and take the rest of your turn as
  normal. Then your opponent takes one final turn, and it's **full time**: the team with more
  goals wins. (Both players get the same number of turns.)
- If the score is tied at full time, there is a **penalty shootout**:
  - The team that didn't take the last turn shoots first; then the teams take turns.
  - For each penalty, choose one of your field players who hasn't taken a penalty yet. They shoot
    at the opposing goalie: their **Shot** against the goalie's **Save**, as a normal contest
    (both revealed, reaction spells allowed, ties go to the goalie).
  - Each team takes 3 penalties ⚙. Stop early as soon as one team can't catch up.
  - If still tied after 3 each, keep going one penalty each until one team scores and the other
    doesn't.
  - If a team has no players left who haven't shot, the game is a draw.
- Safety cap for simulation only: 300 turns ⚙. Reaching it ends the game as a draw and is logged
  as a bug.

## Effect vocabulary

Every card ability uses one of these. New effects get added here, in the schema, and in the
engine together. "Numeric" effects are adjusted by affinity.

**Player abilities**

- `bonus` — `{ stat, amount, when?, row? }`. Add `amount` to `stat` when used for `when`
  (receive, intercept, tackle, evade, shoot, save, faceoff) and/or while in `row`
  (defense, midfield, forward). Every condition given must hold. Example: +2 Defense when
  intercepting.
- `draw_on_win` — `{ count }`. When this player wins a contest (faceoffs included), its owner
  draws `count`.

**Reaction spells**

- `boost` — `{ amount }`, numeric. Add `amount` to your side's value in this contest.
- `shield` — `{}`, non-numeric. The opposing player's stat counts as 0 in this contest, and
  their abilities are ignored. Their own spell still counts. If both sides shield, both stats
  are 0.

**Action spells**

- `scry` — `{}`, non-numeric. Look at one of your opponent's face-down players or goalie without
  revealing it. If that card is later swapped, you still know which one it is.
- `swap` — `{}`, non-numeric. Swap the positions of two of your face-down field players. They stay
  face down. The caster is revealed by casting, so it can't be one of the two. (If one held the
  ball, the ball stays in its slot with the new player.)
- `long_pass` — `{}`, non-numeric. Your ball holder makes a Pass that may skip one row forward.
  A goalie can reach midfield this way.
- `long_shot` — `{ penalty }`, numeric. A midfielder holding the ball may Shoot. Their Shot is
  reduced by `penalty`; the caster's affinity changes the penalty (match: −1 penalty,
  opposed: +1 penalty).
- `steal` — `{ amount }`, numeric. Make a Tackle now and add `amount` to your value. Needs a
  legal Tackle.
- `recall` — `{ count }`, numeric. Draw `count` cards.

## Add-on: center lane

Set lanes ⚙ to 3. Each team fields 3 defenders, 3 midfielders, 3 forwards, and a goalie.
Setup draws 13 instead of 10 ⚙ and places 9. The add-on box needs more player cards per team
and a mat with a center lane. All other rules are unchanged.

## Optional rule to test later: fatigue

A player who loses a contest is tired (turned sideways) and gets −1 to all stats until
substituted or until their owner spends a turn resting them. Off by default ⚙. Not built yet.

## Change log

- v0.4 — Two actions per turn (was one), after simulation showed games were too slow to score. A goal ends your turn.
- v0.4 — The decks are the game clock: at full time, more goals wins. First to 3 goals still wins straight away.
- v0.4 — A tie at full time goes to a penalty shootout (3 each, then one each) instead of sudden death.
- v0.4 — Prototype goalies lowered from Save 5/4 to 4/3 (card data, not a rule).

- v0.3 — Scoring: kept Shot vs Save; noted that a forward must beat its defender to get the ball, which meets the canon note.
- v0.3 — Faceoffs use a new Faceoff stat instead of Speed (canon note). "+2 Speed in faceoffs" is now "+2 Faceoff".
- v0.3 — Players and goalies have 1–3 Resonants (emotions or experiences), each with an Affinity, instead of one element (canon note).
- v0.3 — Affinity: a match on any Resonant wins; opposed only if nothing matches. Added a per-spell table.
- v0.3 — Setup: choose your goalie; keep drawing one card at a time instead of showing your hand and redrawing.
- v0.3 — Faceoff: the chooser reacts first and wins ties; a faceoff is not a turn; the scored-on team plays next.
- v0.3 — Pass: backward passes may change lane; a goalie may pass to any defender; the passer isn't revealed.
- v0.3 — Contests: values can't go below 0; a failed tackle changes nothing; shield doesn't cancel spells.
- v0.3 — Spells can only be cast when they could do something; the swap caster can't be swapped; scry can target the goalie.
- v0.3 — Discard piles are public; Regroup with no cards is allowed.
- v0.3 — End of game: only the turn's Draw step ends the game; the player who runs out still takes their turn.
- v0.3 — Sudden death keeps leftover deck cards; a second deck-out is a draw; the turn cap is a draw.
- v0.2 — Positions with face-down lineups, passing, faceoffs, affinities, center-lane add-on.
- v0.1 — Initial draft (zones only).
