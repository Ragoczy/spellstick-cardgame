# Spellstick — component spec for printer quotes

The first part of this file is the request to send to printers, for print-on-demand and for
offset runs. The second part, "Notes for Paul", covers decisions and checks to make before
sending it.

Card counts follow rules v0.17 and `data/cards.prototype.json` (2026-10-15). Any rules change
that adds or removes cards or tokens changes this spec.

---

## Request for quote

**Product:** Spellstick, a two-player card game with a folding play mat. A small-box retail
game, fulfilled through a crowdfunding campaign and direct sales in the US.

**Quantities to quote:** 1 and 10 (prototypes), 250, 500, 1,000, 1,500, and 2,500. Quote
whichever of these you can produce, and tell us your minimum order.

### 1. Cards

| Item | Spec |
|---|---|
| Size | Poker, 2.5" × 3.5" (63.5 × 88.9 mm), rounded corners |
| Stock | 300–330 gsm black-core or blue-core card stock. Please quote your standard game-card stock and name it. |
| Finish | Linen texture, with matte or gloss varnish (please quote both) |
| Printing | Full color both sides (4/4 CMYK) |
| Total cards per game | 124 |
| Unique fronts | 97 |
| Unique backs | 7 (see below) |
| Packing | Shrink-wrapped in 5 packs: Team A deck (40), Team B deck (40), Physical pile A (16), Physical pile B (16), Injury deck (12) |

What makes up the 124 cards:

| Pack | Cards | Unique fronts | Back |
|---|---|---|---|
| Team A deck | 40: 24 player cards, 16 spell cards | 24 player fronts, 15 spell fronts (one spell appears twice) | Team A players back (24 cards), Team A spells back (16 cards) |
| Team B deck | 40: 24 player cards, 16 spell cards | 24 player fronts, 15 spell fronts (one spell appears twice) | Team B players back, Team B spells back |
| Physical pile A | 16 | 16 | Physical back, Team A color |
| Physical pile B | 16 | the same 16 fronts as pile A | Physical back, Team B color |
| Injury deck | 12 | 5 | Injury back |

Two spell fronts appear in both team decks, so the two decks share 2 of their 30 spell fronts:
97 unique fronts in all (48 players, 28 spells, 16 physical, 5 injury).

Please tell us how 124 cards falls on your print sheets, and what 110 or 132 cards would cost
instead if that saves a sheet.

**Optional card extras (please quote separately):**

- Promo cards: 3 single cards, same size and stock, one design each, with a foil or spot-UV
  option. Packed separately from the game.
- Numbered cards: 1 card per game with a unique serial number (variable-data printing).
- 2 quick-reference cards per game, same size and stock.

### 2. Play mat

The field is 5 rows by 2 lanes. Each row has four card spaces across (two per lane), plus
printed tracks along the edges (score, penalty risk, penalty box, knocked-out area).

| Item | Spec |
|---|---|
| Size | About 14" × 24" (356 × 610 mm) flat. We can adjust the artwork to your nearest standard size from 13" × 22" up to 16" × 26". |
| Printing | Full color, one side |
| Option A (base) | Folded paper or cardstock mat, about 200–300 gsm, matte, scored to fold down to the box footprint |
| Option B | Folding chipboard board (about 2 mm), wrapped, folding to the box footprint |
| Option C (premium add-on) | Neoprene playmat, 2–3 mm, stitched or plain edge, rolled, shipped outside the game box |

Please quote all three options. Later we may also need a wider mat (about 18" × 24") for a
three-lane expansion. A price for that size would help but isn't needed now.

### 3. Box

| Item | Spec |
|---|---|
| Type | Two-piece box (lid and base), 1,200–1,500 gsm greyboard wrapped with printed paper, matte laminate |
| Size | About 7.5" × 5.5" × 1.75" (190 × 140 × 45 mm) outside. Please suggest your nearest standard size that holds two card stacks side by side, the dice and tokens, and the folded mat and rules sheet on top. |
| Printing | Full color outside on the lid and base. Inside printing is not needed. |
| Insert | A simple cardboard divider or well for the cards. A vacuum-formed tray is not needed. |
| Wrap | Shrink-wrap each finished box |

Please also quote a sturdy tuck box (the cards only, about 124 cards) as an alternative.

### 4. Dice

| Item | Spec |
|---|---|
| Quantity | 3 per game |
| Type | Standard 16 mm six-sided dice with rounded corners and pips |
| Colors | 1 in Team A color, 1 in Team B color, 1 white (the penalty die) |

### 5. Tokens

Please quote both wood and printed chipboard where we list both.

| Token | Per game | Spec |
|---|---|---|
| Ball | 1 | Chipboard, about 25 mm round, printed both sides. A custom wooden piece is an option. |
| Roll tokens | 6 (3 per team) | Chipboard, about 20 mm round, printed both sides, in team colors |
| Score markers | 2 (1 per team) | Wooden cubes, 8–10 mm, in team colors |
| Penalty risk markers | 2 (1 per team) | Wooden cubes, 8–10 mm, in team colors |
| Spell markers | 30 (15 per team) | Wooden discs, about 10 mm, in team colors |

If chipboard, all printed tokens should fit on one small punchboard (about 2 mm thick).
Bag the tokens and dice together in one small poly bag.

### 6. Rules

| Item | Spec |
|---|---|
| Option A | One sheet, 11" × 17" (or A3), 4/4 color, 100–150 gsm, folded to fit the box |
| Option B | Booklet, 5.5" × 8.5" (or A5), 12 pages plus cover, 4/4 color, saddle-stitched |

The rules may grow, so please quote both.

### 7. Files we will supply

- Cards: PNG or PDF at 300 DPI, 825 × 1125 px per card, with 1/8" (3 mm) bleed on every side and
  the safe area 1/8" inside the trim. We will match your own templates and color profile before
  sending final files.
- Mat, box, punchboard, and rules: PDF to your templates.

### 8. What we would like in your quote

- Unit price at each quantity, and the terms (EXW, FOB, or delivered to a US address).
- One-time costs: setup, plates, tooling, dies, and proofs.
- Cost of a digital proof and of a physical pre-production sample.
- Lead time from file approval, plus shipping time.
- Country of manufacture, and the US tariff (HTS) code you would declare for this product.
- Finished-box weight, games per carton, carton size, and carton weight.
- Payment terms and deposit.
- Anything in this spec that is unusual or costly for you, and a cheaper alternative.

---

## Notes for Paul

**Before sending:**

- **Deck size.** Final deck size is still open (`docs/OPEN_QUESTIONS.md`). If decks change from 40
  to 50 or 60 cards, update the counts above.
- **Backs.** The spec asks for 7 backs so that every pile can be sorted after a game. If printers
  charge more for each back, ask what 3 would cost (Team A, Team B, injury).
- **The rules sheet.** The rules are about 6,500 words now. A single sheet holds about 2,000. If
  the goal moves away from one sheet, quote the booklet.
- **The mat layout.** About 14" × 24" fits four upright poker cards across each row, with space to
  turn a Shaken card sideways. The quote needs only the size. The print file is milestone M6.
- **The center-lane add-on** isn't part of this request. It needs its own card counts and the
  wider mat once its deck size is decided.

**Printers to ask (examples, not recommendations):**

- Print-on-demand, for prototypes and very small runs: The Game Crafter (US), MakePlayingCards or
  PrinterStudio.
- Short runs in the US, with no China tariff: Delano Games, AdMagic.
- Offset runs, which usually start at 1,000–1,500 copies: Panda Game Manufacturing, LongPack, and
  WinGo (China), Ludo Fact (Germany).

**Tariffs.** Ask each printer for the HTS code it would declare. As of October 2026 the US duty on
games made in China is unclear, so check it at the time of ordering. Card games are often
classified differently from board games.
