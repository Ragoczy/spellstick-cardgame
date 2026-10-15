# Spellstick — open questions for Paul

None of these block M1 or M2.

## Canon (needed before tuning goes far)

- How does spellstick work in the books? Fill in "Canon notes" in RULES.md.
- Are goals worth one point each in canon, or is scoring different?
- Restarts: is there a faceoff after goals, as in lacrosse? The rules assume so.
- Resonants and Affinities now come from `data/warlock-resonants.json` (decided 2026-10-14; see
  `docs/MAGIC.md`). Still open:
  - Opposition: the data opposes Resonants (Joy–Sorrow), not magic families, so spells are never
    weakened now. Should opposite Resonants matter in play, for example in a contest between an
    Anger player and a Fear player, or should Paul name some opposed families?
  - The data has no "Love". Is that deliberate? The nearest are Care, Tenderness, Devotion, and
    Romance.
  - Specialist bonus: an Affinity that is exactly a spell's specialization gives +2, and one
    elsewhere in the family +1 (Claude). Confirm or change.
- The spell library (73 spells, `docs/MAGIC.md`) uses Claude's names and choices of effect.
  Rename or swap any that don't fit the books, and add flavor text if you like. Also open:
  - Narrow boosts (+3, but only for one use of a stat, such as receiving a pass) are Claude's
    addition, to keep the many Body, Air, and Time spells from being the same card.
  - Injuries are at 1.7 a game, under the 2–4 target. Raise hit strength from 3 to 4?
  - Power tiers (`docs/MAGIC.md`): shields were far stronger than anything else (v0.17 softens
    them: the stat is 2 less instead of 0), and hits, mends, long shots, scrying, and swaps
    barely help the computer. Strengthen the weak effects? Claude can test any change in the
    simulator first.
- Do the positions have canon names (attack, middie, defense, goalie, or something else)?

## Rules details to confirm

- Glamour spells (rules v0.9) use Claude's simplest reading. Confirm or change:
  - Glamour Ball: no contest at all. The fooled player is revealed but can't react, and the
    receiver stays face down.
  - Glamour Self: the images last until a tackle or hit finds the real player (not just one turn).
    They only affect tackles and hits, not interceptions or anything else.
  - Both are Glamour spells, in the Illusion family (changed from air, 2026-10-14).

## Content (needed by M5)

- Which in-world teams are the two decks? An academy team and a rival, two pro clubs, or
  something else?
- Team names, colors, and mascots.
- Which book character is the canon player, and how special should their card be?
  (A promo with stronger stats, a unique ability, a signed or foil version?)
- Any in-world cameos for spell or event cards, such as crowd, commentators, or halftime?

## Product (needed by M6)

- Center-lane add-on: include it in a Kickstarter as an add-on, a stretch goal, or sell later?

- Final deck size: keep 40 per team, or go to 50–60?
- Art: AI-generated through your existing pipeline, commissioned, or a mix? If AI, plan the
  Kickstarter disclosure.
- Print route: print-on-demand for small runs, or an offset run tied to a Kickstarter?
  Get quotes for both before deciding.
- Mat: folded paper or cardstock, or a cloth/neoprene upgrade as a premium add-on?
- Where the browser game lives: a subfolder on darkspace.press, its own domain, or an embed?

## Online game (added 2026-10-10)

Decided and open items are tracked in `docs/spellstick-multiplayer-design.md` under
"Open questions". Still open:

- Time bank sizes: tune after the beta.
- HexBot connection details: needed at the start of phase 4 (Store).

Tournament scoring, tiebreakers, deadlines, first-tournament prizes, and the rarity direction
were decided on 2026-10-12 (see the design doc).
