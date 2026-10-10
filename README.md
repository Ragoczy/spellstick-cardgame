# Spellstick — project starter package

A two-player card game based on spellstick from the Warlock series: face-down lineups of
forwards, midfielders, defenders, and a goalie; passing that reveals matchups; and spells that
play off each player's elemental affinity.
One ruleset drives two products:

1. **Browser game** — playable prototype first, free fan game later.
2. **Physical card game** — small-box fan collectible, printed after the browser version plays well.

## What's in here

| File | Purpose |
|---|---|
| `CLAUDE.md` | Standing instructions for Claude Code. It reads this automatically. |
| `docs/GAME_DESIGN.md` | Goals, audience, scope, and constraints. |
| `docs/RULES.md` | The rules, written precisely enough to implement. |
| `docs/ROADMAP.md` | Milestones in build order, with "done" criteria. |
| `docs/OPEN_QUESTIONS.md` | Decisions only you can make. |
| `data/cards.schema.json` | Card data format. |
| `data/cards.prototype.json` | Placeholder 40-card decks for two teams. Names, elements, and flavor are placeholders. |
| `scripts/generate_prototype_cards.py` | Regenerates the placeholder decks. |
| `src/engine/` | The rules engine (pure TypeScript, no UI). |
| `src/ai/` | Computer players: a rule-of-thumb opponent, and a random player for stress tests. |
| `src/ui/` | The browser game (React). It only ever reads your own view of the game. |
| `src/sim/` | The simulator, balance statistics, what-if experiments, and report writer. |
| `reports/` | Simulation reports. |
| `tests/` | Engine tests: one file per rule section and per effect, all run with 2 and 3 lanes. |

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (once). |
| `npm test` | Run every engine test. |
| `npm run demo -- --seed 7 --lanes 2` | Play one game between random players and print it in plain language. |
| `npm run sim -- --games 1000 --seed 1` | Play 1,000 computer-vs-computer games and write a balance report to `reports/`. Add `--experiments` for what-if comparisons, `--lanes 3` for the add-on. |
| `npm run dev` | Start the browser game at http://localhost:5173. Add `?seed=123` to replay a particular game, or `?autoplay=1` to watch the computer play both sides. |
| `npm run build` | Build the static site into `dist/` (upload that folder to any web host or a WordPress subfolder). |

### Online game (local)

The online game adds a server (`server/`) with Discord sign-in and a Postgres database. The
plain build above doesn't use it. Design: `docs/spellstick-multiplayer-design.md`. Running it
inside Discord (a Discord Activity): `docs/discord-activity.md`.

| Command | What it does |
|---|---|
| `npm run db:up` | Start a local Postgres in Docker (port 5433). Also needed for the server tests. |
| `npm run env:pull` | Make `server/.env` from `server/.env.example`, filling in the shared Discord settings from Key Vault (needs `az login`). |
| `npm run server:dev` | Start the game server on port 8080, using `server/.env`. |
| `npm run dev:online` | Start the online build at http://localhost:5180, with sign-in. Needs the server running. |
| `npm run build:online` / `npm run build:server` | Build what the container runs. `docker build .` does both. |

## Before you start

Do these first. They are the parts Claude Code can't do for you.

1. Fill in the **Canon notes** section of `docs/RULES.md` with how spellstick works in the books. Even a few bullet points help. The engine rules should not contradict them.
2. Skim `docs/OPEN_QUESTIONS.md`. None of it blocks milestone 1, but team names and the canon player card are needed before art.

## Getting started with Claude Code

```bash
mkdir spellstick && cd spellstick
git init
# copy the contents of this package into the folder
claude
```

Then paste this as the first prompt:

> Read CLAUDE.md and everything in docs/. Then start milestone 1 from docs/ROADMAP.md. Before writing code, list any place where RULES.md is ambiguous or contradicts itself, and propose a resolution for each. Wait for my answers before implementing.

After milestone 1, each later milestone can usually be started with:

> Start milestone N from docs/ROADMAP.md.
