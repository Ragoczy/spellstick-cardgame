# Spellstick — roadmap

Build in this order. Each milestone ends with something Paul can look at.

## M1 — Rules engine and tests

- Scaffold the project (Vite, React, TypeScript strict, Vitest, tsx).
- Implement `src/engine/`: state, lineups, face-down and revealed cards, passing, faceoffs,
  contests, affinity, effects, scoring, end of game, seeded RNG.
- A per-player view of the state that hides the opponent's face-down cards.
- Load cards from `data/cards.prototype.json` and validate against the schema.
- Tests for every rule and every effect in RULES.md.
- A replay helper: same seed + same actions = same game.

**Done when:** `npm test` passes, a scripted game can be run and replayed from a seed, and the
same tests pass with lanes set to 3.

## M2 — Computer opponent and simulation report

- A simple heuristic AI. Suggested behavior:
  - lineup: strong Defense on defense, strong Speed and Shot on forward, with some randomness
    so it isn't predictable;
  - passing: prefer lanes where the opposing player is revealed and weak; treat unknown
    players as average;
  - spells: save boosts for shots and for interceptions near its own goal; cast with a caster
    whose affinity matches when possible;
  - substitute a revealed weak player when it has a clearly better one in hand.
- `npm run sim -- --games 1000 --seed 1` runs AI vs AI and writes `reports/sim-<date>.md` with:
  - win rate by seat (first vs second player) and by team,
  - average turns per game and average goals,
  - share of games ending by 3 goals vs deck-out vs sudden death,
  - contest win rates for pass, shot, tackle, and faceoff,
  - spell outcomes by affinity (match, neutral, opposed) and how often each happens,
  - shots per game and shot success rate,
  - per card: times played, side's contest win rate when played,
  - cards never or rarely played.
- Starting targets (adjust as we learn):
  - first-player win rate 45–55%,
  - team A vs team B win rate 45–55%,
  - about 1–2 goals per game, and under 10% of games drawn (changed from "80% of games end at
    3 goals" after the first simulation: the decks are now the game clock),
  - 30–50 total turns per game. This is assumed to be about 20–30 minutes on the table, to be
    checked in the first real playtest (each turn now has two actions).

**Done when:** the sim runs 1,000 games with no crashes or illegal states, and the report shows
which numbers miss their targets, with suggested tuning changes. Do not apply tuning changes
without Paul's OK.

## M3 — Playable browser game against the computer

- Field with five rows and two lanes, each slot showing both teams' players (face down or
  revealed), the ball on its holder, score, both hands (opponent's face down), decks, discards.
- A lineup screen at setup for placing players face down.
- Click your ball holder, then a teammate, to pass; reveals animate before each contest.
- Clear prompts for responding with a reaction spell, showing whether the caster's affinity
  matches.
- Every contest explained in plain language.
- A rules screen and a "new game" button.
- Works at phone width.

**Done when:** Paul can play a full game start to finish against the computer.

## M4 — Two players at one screen and a playtest build

- Hotseat mode with a "pass the device" screen between turns, so hands and face-down lineups
  stay hidden.
- A setting for the center-lane add-on (3 lanes).
- A static build Paul can upload for Discord volunteers, with a link to a short feedback form.

**Done when:** there's a URL to hand to playtesters.

## Real playtest (Paul)

Not a coding milestone. Play the browser version with a few Discord volunteers, and if possible
print a rough paper copy and play it at a table. Note what was confusing, what dragged, and what
was fun. Feed the notes back as changes to RULES.md.

## M5 — Content pass

- Final team identities, rosters, card names, and flavor text (Claude drafts, Paul approves).
- The canon player promo card.
- Final deck sizes.
- Swap placeholder card frames for final art from `assets/cards/`.

## M6 — Print files

- Render every card to PNG at print spec (see CLAUDE.md), front and back.
- Rules sheet as a PDF.
- Field mat print files (base two-lane and add-on three-lane) at sizes the printer offers.
- Check everything against the printer's own templates before ordering a proof.

## Out of scope for now

- Online multiplayer between two computers.
- Accounts, saved games, leaderboards.
