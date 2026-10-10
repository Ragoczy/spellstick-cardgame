# Spellstick — game design brief

## The pitch

A quick two-player game of spellstick, the lacrosse-with-spells sport from the Warlock series.
Each team sets out its lineup face down: two forwards, two midfielders, two defenders, and a
goalie. The ball moves by passing, and every pass reveals the two players who meet over it, so
where you hide your best players is the strategy. Spells swing contests, and they hit harder
when the caster's elemental affinity matches. When the cards run out, the team with more goals
wins, and a tie goes to a penalty shootout. Reaching three goals wins straight away.

## Who it's for

Warlock readers. Most are not hobby gamers. Many will play it a handful of times, mostly
because it's a piece of the world they like. A smaller group will play the browser version more.

*Changed 2026-10-10: the scope now also includes an online game for that smaller group, with
collections, tournaments, and trading. See "Online game" under Products.*

## What success looks like

- Someone who has never played a card game can learn it in about five minutes.
- A game takes 20–30 minutes on the table (shorter in the browser).
- The full rules fit on one sheet, front and back.
- Nothing is obviously broken: no card that always wins, no strategy that always wins,
  no game that drags on.
- Each game has at least one "did that just happen?" moment, usually from a reveal or a spell.

## What it is not

- Not a competitive, deeply balanced game. "Fun a few times" is the bar.
  *(Changed 2026-10-10: still the bar for the table game. The online game adds tournaments, so
  balance matters more there.)*
- Not a collectible card game with booster packs or deck building.
  *(Changed 2026-10-10: the online game adds owned cards, packs, saved teams, and trading. The
  physical game is still two fixed decks.)*
- No online multiplayer in the first version.
  *(Changed 2026-10-10: online play is now planned. See `docs/spellstick-multiplayer-design.md`.)*

## Products

**Browser game.** Same rules engine. Play against a computer opponent, or two people at one
screen. Used first as the design prototype and balance tool, then released free on the
Darkspace Press site as a fan game that promotes the physical set.

**Physical game (small box).**
- Two team decks (prototype: 40 cards each; final size decided after playtesting).
- A folding field mat: five rows by two lanes, with a slot for each pair of opposing players.
- A ball token and a score tracker.
- One rules sheet.
- Collectible extras: a signed or numbered card, one or two Kickstarter-exclusive cards,
  and the canon player as a special promo card.

**Center-lane add-on.** Extra players and a mat with a third lane, bringing each team to the
full 3/3/3/1 lineup. A natural Kickstarter add-on or stretch goal.

Likely sold as an add-on or stretch goal to a Warlock Kickstarter, or to the same backers later.

**Online game (added 2026-10-10).** Readers sign in with Discord and play each other, live or
async over days, with the server as referee using the same rules engine. Players own cards
(starter deck, store purchases with Discord coins, award cards), save teams, trade, and play in
Swiss tournaments with draft and constructed formats. Full design and phases:
`docs/spellstick-multiplayer-design.md`.

## Canon and content constraints

- **The sport's rules follow the books.** How scoring, possession, and spells work must not
  contradict the spellstick scenes. See "Canon notes" in RULES.md.
- **Players are invented.** Only one book character really plays spellstick, so team rosters
  are original. That one character appears as a special promo card.
- **The world supplies the flavor.** Team identities, team names, mascots, flavor text, and spell
  card commentary can reference things readers know. This is where the "I get the joke" value
  comes from.

## Known risks

- **AI art.** The tabletop audience is more hostile to AI art than ebook readers. Kickstarter
  requires disclosing AI use. Acceptable for an audience of existing readers; limits crossover.
- **Complexity creep.** Positions, hidden lineups, and affinities are three ideas on top of a
  simple contest. Each one is light, but together they need to stay on one rules sheet. If
  playtesters struggle, cut affinity to a simple match bonus before cutting anything else.
- **Playtesting can't be fully automated.** Simulations catch broken numbers. Only people can
  tell whether it's fun. Plan for a few real sessions with Discord volunteers.
- **Online scope (added 2026-10-10).** Collections, a store, and trading make this a small
  collectible card game platform with hosting costs and moderation load. The online phases are
  built so the project can stop after tournaments (phase 3) with a complete game.
