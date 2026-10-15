# Rules v0.17: simulation summary

What v0.17 changed, measured. "Before" is rules v0.16 (`sim-2026-10-14-v17-phase0-baseline.md`);
"after" is the finished v0.17 rules (`sim-2026-10-15-v17-final.md`). Both are 10,000
computer-vs-computer games on the same seeds, 2 lanes. Each result has a 95% interval. The per-phase
reports are listed at the end.

## Targets

| Target | v0.16 | v0.17 | Wanted | Met? |
| --- | --- | --- | --- | --- |
| Players hurt per game | 2.80 | 7.88 (7.83–7.93) | 4–8 | Yes |
| Shaken share of those | 0% | 56.4% (56.1–56.8) | at least 50% | Yes |
| Real injuries per game | 2.80 | 3.43 (3.40–3.47) | at least 3.5 | **No** (Paul accepted about 3.3) |
| Carried off + knocked out | 0.22 | 1.33 (1.31–1.35) | at most 1.5 | Yes |
| First carry-off or knockout predicts the loser | 51.8% | 49.8% (48.7–51.0) | at most 60% | Yes |
| Spells cast per game | 15.8 | 17.5 (17.4–17.6) | at least 15.7 | Yes |
| Penalties per game | 0 | 0.82 (0.80–0.84) | 0.1–1.2 (Paul) | Yes |
| Unanswered Shield scores | 91.9% | 60.4% (60.2–60.7) | under 75% | Yes |
| Goals per game | 2.40 | 1.82 (1.79–1.84) | 1.84–3.06 | **Borderline** |
| Turns per game | 50.3 | 51.4 (51.3–51.5) | 30–50 | **No** (already just over in v0.16) |
| Defense-heavy vs Striker-heavy at equal cost | — | 51.4% (50.4–52.3) | 45–55% | Yes |
| 10% cost gap: the dearer team | — | 61.4% (60.4–62.3) | 55–65% | Yes |

The first player wins 50.6% and Team A 50.4%, both even within luck. Draws are 1.4%.

**3 lanes** (`sim-2026-10-15-v17-final-3lanes.md`, 1,000 games): no crashes, impossible states,
or games at the turn cap. Turns 46.1, goals 1.80, hurts 7.22 (56% Shaken), real injuries 3.21,
spells cast 16.8, penalties 0.81.

## How a game looks now (per game)

| | v0.16 | v0.17 |
| --- | --- | --- |
| Tackles (won) | 13.6 (33%) | 4.9 (47%) |
| Physical attacks (won) | — | 14.0 (45%) |
| Knockdowns (that hurt) | — | 8.7 (48%) |
| Hits (that land) | 2.8 (65%) | 2.1 (70%) |
| Fouls (caught) | 1.0 (—) | 1.4 (16%) |
| Sent off | — | 0.23 |
| Turns in the penalty box | — | 1.7 |
| Shots (that score) | 7.3 (33%) | 5.1 (36%) |
| Shaken / Injured / Knocked out / Carried off | 0 / 2.6 / 0 / 0.22 | 4.4 / 2.1 / 1.3 / 0.03 |

The computer now takes the ball mostly with physical attacks rather than tackles: about 14 a
game, using most of each team's 8.

## What a card is worth (pricing)

Each value is from one team getting a change and playing an unchanged team, with each seed played
both ways round. They're measured under the final rules (`value-2026-10-15-v17g.md`,
`-v17g-by-type.md`). Values are points per 100 games that one point adds on one card.

| Part | Value | Note |
| --- | --- | --- |
| Speed / Shot / Defense / Faceoff (all players) | +0.62 / +0.52 / +0.48 / +0.10 | |
| The same on Runners and Strikers | +1.17 / +1.25 / +0.37 / +0.13 | |
| On Playmakers and All-rounders | +0.53 / +0.52 / +0.48 / +0.20 | |
| On Anchors and Stoppers | +0.37 / +0.16 / +0.60 / +0.03 | |
| Save (per goalie) | +6.79 | Save 6 goalies cost 22–23, Save 5 cost 5 |
| A Resonant | +0.07 | |
| Toughness | +0.04 | near 0 |
| Quick (+2 Speed when evading) | +0.54 | |
| Heavy hands / Sturdy | −0.07 / −0.07 | below 0, so they cost 0 |

Prices use 40% of the by-type value and 60% of the all-player value: the blend that meets both
roster targets. The cheapest field player costs 6, the average 10, and the dearest 15. The team
cap is 239, and the starter set costs 219.

**Spell tiers** (`spell-tiers-2026-10-15.md`): 15 Legendary (open boosts, shields, the save
boost), 5 Rare, 14 Uncommon, 38 Common. Hits, mends, swaps, scrying, recall, and dirty plays still
do little for the computer.

**Physical cards** (`value-2026-10-15.md`, informational): no card stands out. Every card is
within about ±2 points of the four it replaced.

## Open problems

1. **Goals are at the floor** (1.82, against 1.84). Physical attacks take the ball often, so
   there are fewer shots (7.3 → 5.1). Possible levers: a holder can't be attacked right after
   catching (like catch and shoot), or fewer attacks per team (8 → 6).
2. **Real injuries are 3.43, short of 3.5.** Paul accepted about 3.3. The severity table can't
   meet both this and "at least half Shaken" on a six-sided die.
3. **Turns are 51.4,** just over 50. They were 50.3 in v0.16.
4. **Heavy hands, Sturdy, and Toughness are worth about nothing.** How badly a player is hurt
   barely moves the result; how often they're hurt matters more. If they should matter, they need
   bigger effects (for example Sturdy: Shaken instead of Injured, not −1 severity).
5. **Hits, mends, swaps, scrying, and dirty plays** are still Common. That's as the computer plays
   them; people may do better with the hidden-information spells.

## Reports, by phase

- Phase 0, baseline: `sim-2026-10-14-v17-phase0-baseline.md`
- Phase a, Shield cap: `sim-2026-10-14-v17a.md`
- Phase b, contact: `sim-2026-10-14-v17b.md`
- Phase c, fouls and the referee: `sim-2026-10-15-v17c.md`
- Phase c2, physical attacks and the penalty box: `sim-2026-10-15-v17c2.md`,
  `-v17c2-blind-limit8-escalation.md`
- Phase d, healing, Ward, abilities: `sim-2026-10-15-v17d.md`
- Phase e, tackle risk: `sim-2026-10-15-v17e.md`
- Phase f, pricing: `sim-2026-10-15-v17f.md`, `roster-targets-2026-10-15.md`
- Shaken substitutes, and the final re-pricing: `sim-2026-10-15-v17g.md`
- Final: `sim-2026-10-15-v17-final.md`, `-v17-final-3lanes.md`
