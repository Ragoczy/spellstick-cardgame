# Comparison: Setup draws 3 spells, 2026-10-14

Made by `npm run sim-compare`: 5000 computer-vs-computer games per run (seed block 1), 2 lanes, card set 0.16-prototype. Took 190 s on 20 workers.

- Before: config changes `shieldEffect=half`; cards data/cards.prototype.json.
- After (Setup draws 3 spells): config changes `shieldEffect=half`, `setupSpells=3`; cards data/cards.prototype.json.

Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. Both runs play the same seeds (the same deals and first player), and each change is measured seed by seed, so a small real change still shows. A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.

## Health

No crashes, no impossible states, and no game hit the turn cap.

## Targets

| Measure | Before | After | Change (95% interval) | Target | After meets it? |
| --- | --- | --- | --- | --- | --- |
| Turns per game | 50.6 (50.3–50.8) | 49.5 (49.2–49.7) | −1.1 (−1.4 to −0.8) | 30–50 | Yes |
| Goals per game | 2.31 (2.27–2.34) | 2.22 (2.18–2.26) | −0.09 (−0.13 to −0.04) | 1.84–3.06 (v0.16 ±25%) | Yes |
| Spells cast per game | 15.6 (15.5–15.7) | 15.6 (15.5–15.7) | +0.0 (−0.1 to +0.1) | at least 15.7 | No |
| Players hurt per game (any result) | 2.88 (2.84–2.92) | 2.85 (2.82–2.89) | −0.02 (−0.07 to +0.02) | 4–8 | No |
| Shaken share of those | 0.0% (0.0–0.0) | 0.0% (0.0–0.0) | +0.0 (+0.0 to +0.0) points | at least 50% | No |
| Real injuries per game (Injured, knocked out, carried off) | 2.88 (2.84–2.92) | 2.85 (2.82–2.89) | −0.02 (−0.07 to +0.02) | at least 3.5 | No |
| Carried off + knocked out per game | 0.23 (0.22–0.24) | 0.24 (0.22–0.25) | +0.01 (−0.01 to +0.02) | at most 1.5 | Yes |
| Team that suffered the first carry-off or knockout lost | 52.3% (49.3–55.3) | 53.3% (50.4–56.3) | +1.0 (−3.1 to +5.2) points | at most 60% | Yes |
| Penalties per game | 0.00 (0.00–0.00) | 0.00 (0.00–0.00) | +0.00 (+0.00 to +0.00) | 0.1–0.5 | No |
| Unanswered Shield scores (before the dice, over every shot) | 64.7% (64.4–64.9) | 64.7% (64.4–65.0) | +0.0 (−0.2 to +0.3) points | under 75% | Yes |

Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: before 72.2%, setup draws 3 spells 72.2% (target: under 75%).

## Other measures

| Measure | Before | After | Change (95% interval) |
| --- | --- | --- | --- |
| First player wins (draws count half) | 51.0% (49.6–52.4) | 50.7% (49.4–52.1) | −0.3 (−2.0 to +1.5) points |
| Team A wins (draws count half) | 50.6% (49.2–52.0) | 50.3% (49.0–51.7) | −0.3 (−2.0 to +1.5) points |
| Draws | 1.0% (0.7–1.3) | 1.5% (1.2–1.8) | +0.5 (+0.1 to +0.9) points |
| Shots per game | 7.27 (7.22–7.31) | 7.11 (7.06–7.15) | −0.16 (−0.22 to −0.11) |
| Shots that score | 31.8% (31.3–32.3) | 31.3% (30.7–31.8) | −0.5 (−1.1 to +0.1) points |
| Tackles per game | 13.78 (13.65–13.91) | 13.51 (13.39–13.64) | −0.26 (−0.42 to −0.11) |
| Tackles won | 33.2% (32.8–33.6) | 33.5% (33.1–33.9) | +0.2 (−0.3 to +0.8) points |
| Hits per game | 2.83 (2.79–2.86) | 2.80 (2.77–2.84) | −0.02 (−0.06 to +0.01) |
| Hits that land | 66.8% (66.1–67.6) | 67.0% (66.2–67.7) | +0.1 (−0.9 to +1.1) points |
| Hurt by hits, per game | 1.89 (1.86–1.92) | 1.88 (1.84–1.91) | −0.01 (−0.05 to +0.02) |
| Hurt by dirty plays, per game | 0.99 (0.97–1.01) | 0.98 (0.96–1.00) | −0.01 (−0.03 to +0.01) |
| Shaken per game | 0.00 (0.00–0.00) | 0.00 (0.00–0.00) | +0.00 (+0.00 to +0.00) |
| Injured per game (not carried off) | 2.65 (2.62–2.68) | 2.62 (2.58–2.65) | −0.03 (−0.07 to +0.01) |
| Knocked out per game | 0.00 (0.00–0.00) | 0.00 (0.00–0.00) | +0.00 (+0.00 to +0.00) |
| Carried off per game | 0.23 (0.22–0.24) | 0.24 (0.22–0.25) | +0.01 (−0.01 to +0.02) |
| Fouls (dirty plays) per game | 1.00 (0.98–1.02) | 0.99 (0.97–1.01) | −0.01 (−0.03 to +0.01) |
| Fouls caught | 0.0% (0.0–0.0) | 0.0% (0.0–0.0) | +0.0 (+0.0 to +0.0) points |
| Sent off per game | 0.00 (0.00–0.00) | 0.00 (0.00–0.00) | +0.00 (+0.00 to +0.00) |

