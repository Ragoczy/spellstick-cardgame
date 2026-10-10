# CLAUDE.md — Spellstick

## What this project is

A two-player card game with face-down lineups on a five-row, two-lane field, based on the sport spellstick from the
Warlock urban fantasy series (pen name Daniel Kensington, Darkspace Press). The owner, Paul,
is a novelist and .NET developer who does not play tabletop or card games himself. He wants
to stay as hands-off as possible: make sensible decisions, explain them briefly, and only ask
when a decision affects game feel, canon, or cost.

The same rules engine powers:
- a browser game (prototype now, free fan game later), and
- a printed physical card game (fan collectible, fun a few times — not a deep competitive game), and
- an online game (added 2026-10-10): Discord sign-in, server-refereed matches, owned cards,
  tournaments, a coin store, and trading. Design and phases: `docs/spellstick-multiplayer-design.md`.

Read `docs/GAME_DESIGN.md` and `docs/RULES.md` before changing gameplay code. Read
`docs/spellstick-multiplayer-design.md` before working on the server or online features.

## Tech stack

- TypeScript (strict mode), Vite, React for the UI.
- Vitest for tests.
- `tsx` for running headless simulation scripts in Node.
- No backend, no accounts, no database. The build output is a static site that can be uploaded
  to a subfolder of an existing WordPress site or embedded with an iframe.
  *(Changed 2026-10-10: still true for the browser game build. The online game adds a Node.js
  and TypeScript game server in this repo (for example `server/`), Postgres, Discord OAuth, and
  hosting on Azure Container Apps. The server imports `src/engine/` directly and is deployed
  separately from the static site.)*

Do not add dependencies beyond these without saying why.

## Architecture rules

1. **The rules engine is pure and UI-free.** It lives in `src/engine/`. It must not import React,
   touch the DOM, or use timers. It takes a game state and an action and returns a new state plus
   a list of events. Randomness comes only from a seeded RNG passed in, so any game can be replayed
   from its seed and action list.
2. **Cards are data.** Card definitions live in `data/*.json` and follow `data/cards.schema.json`.
   This stays the master copy for the online game too: the server's database is loaded from it.
   Card abilities use the small effect vocabulary defined in `docs/RULES.md`. Do not hard-code
   individual cards in engine logic. If a new card needs a new effect, add the effect to the
   vocabulary, the schema, and RULES.md together.
3. **Tuning numbers are constants.** Hand size, deck size, goals to win, lane count, affinity modifiers, and similar
   values live in one config file (`src/engine/config.ts`) so balance changes are one-line edits.
4. **Hidden information is enforced by the engine.** Face-down cards are real hidden state. The
   engine exposes a per-player view (`viewFor(player)`) that shows the opponent's face-down cards
   only as "unknown". The AI opponent and the UI both read from that view, never from raw state.
   Write a test proving the AI can't see face-down cards.
5. **The AI opponent uses the same engine API as a human player.** It only sees what a player
   would see: its own hand and lineup, revealed cards, and discard piles. It may remember cards
   that were revealed and later swapped, like a human would.
6. **Lanes are a config value.** The base game uses 2 lanes; the add-on uses 3. Nothing should
   assume 2.
7. **The UI is a thin layer.** It renders state, sends actions, and animates events. No rule logic
   in components.

## Rules changes

`docs/RULES.md` is the source of truth. If implementation reveals a gap or contradiction:
- pick the simplest reasonable resolution,
- implement it,
- update RULES.md with the change and a one-line note under "Change log",
- mention it in your summary.

Never change anything in the "Canon notes" section. That is Paul's.

## Testing

- Every rule in RULES.md should have at least one engine test.
- Every effect in the effect vocabulary should have a test.
- Run `npm test` before reporting a milestone as done.
- The simulation script (milestone 2) is also a test: it should run 1,000 AI-vs-AI games with
  no crashes, no illegal states, and no infinite games.

## Art and print

- Use placeholder card frames (name, stats, ability text, team color) until final art exists.
- Card art files go in `assets/cards/` named by card `id` (for example `a-p-01.png`).
- Physical cards are standard poker size, 2.5" x 3.5". Print renders are 300 DPI with 1/8" bleed
  on each side: 825 x 1125 px, with the safe area 0.125" inside the trim line. Confirm against the
  chosen printer's template before exporting final files, since vendors differ.

## Style

- Plain, readable code over clever code. Paul should be able to follow it.
- UI copy in plain language and sentence case. Explain what happened in a contest
  ("Your Speed 5 beat their Defense 3. Ball moves to midfield.").
- When reporting back, keep summaries short: what was done, what was decided, what needs Paul.
