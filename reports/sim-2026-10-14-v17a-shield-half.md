# Comparison: Shield half, 2026-10-14

Made by `npm run sim-compare`: 5000 computer-vs-computer games per run (seed block 1), 2 lanes, card set 0.16-prototype. Took 57 s on 20 workers.

- Before: config changes `shieldEffect=zero`; cards data/cards.prototype.json.
- After (Shield half): config changes `shieldEffect=half`; cards data/cards.prototype.json.

Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. Both runs play the same seeds (the same deals and first player), and each change is measured seed by seed, so a small real change still shows. A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.

## Health

No crashes, no impossible states, and no game hit the turn cap.

## Targets

| Measure | Before | After | Change (95% interval) | Target | After meets it? |
| --- | --- | --- | --- | --- | --- |
| Turns per game | 50.4 (50.2–50.7) | 50.6 (50.3–50.8) | +0.2 (−0.1 to +0.4) | 30–50 | No |
| Goals per game | 2.39 (2.36–2.43) | 2.31 (2.27–2.34) | −0.08 (−0.12 to −0.05) | 1.84–3.06 (v0.16 ±25%) | Yes |
| Spells cast per game | 15.7 (15.6–15.8) | 15.6 (15.5–15.7) | −0.2 (−0.2 to −0.1) | at least 15.7 | No |
| Players hurt per game (any result) | 2.82 (2.78–2.85) | 2.88 (2.84–2.92) | +0.06 (+0.03 to +0.10) | 4–8 | No |
| Shaken share of those | 0.0% (0.0–0.0) | 0.0% (0.0–0.0) | +0.0 (+0.0 to +0.0) points | at least 50% | No |
| Real injuries per game (Injured, knocked out, carried off) | 2.82 (2.78–2.85) | 2.88 (2.84–2.92) | +0.06 (+0.03 to +0.10) | at least 3.5 | No |
| Carried off + knocked out per game | 0.23 (0.22–0.24) | 0.23 (0.22–0.24) | +0.00 (−0.01 to +0.01) | at most 1.5 | Yes |
| Team that suffered the first carry-off or knockout lost | 52.2% (49.1–55.2) | 52.3% (49.3–55.3) | +0.2 (−3.3 to +3.6) points | at most 60% | Yes |
| Penalties per game | 0.00 (0.00–0.00) | 0.00 (0.00–0.00) | +0.00 (+0.00 to +0.00) | 0.1–0.5 | No |
| Unanswered Shield scores (before the dice, over every shot) | 91.9% (91.7–92.0) | 64.7% (64.4–64.9) | −27.2 (−27.4 to −27.0) points | under 75% | Yes |

Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: before 97.2%, shield half 72.2% (target: under 75%).

## Other measures

| Measure | Before | After | Change (95% interval) |
| --- | --- | --- | --- |
| First player wins (draws count half) | 49.4% (48.0–50.7) | 51.0% (49.6–52.4) | +1.6 (+0.2 to +3.1) points |
| Team A wins (draws count half) | 51.3% (49.9–52.7) | 50.6% (49.2–52.0) | −0.7 (−2.1 to +0.8) points |
| Draws | 1.4% (1.0–1.7) | 1.0% (0.7–1.3) | −0.4 (−0.8 to +0.0) points |
| Shots per game | 7.30 (7.26–7.35) | 7.27 (7.22–7.31) | −0.03 (−0.08 to +0.01) |
| Shots that score | 32.8% (32.3–33.3) | 31.8% (31.3–32.3) | −1.0 (−1.5 to −0.5) points |
| Tackles per game | 13.64 (13.51–13.77) | 13.78 (13.65–13.91) | +0.14 (+0.02 to +0.26) |
| Tackles won | 33.2% (32.8–33.6) | 33.2% (32.8–33.6) | −0.0 (−0.4 to +0.4) points |
| Hits per game | 2.84 (2.81–2.87) | 2.83 (2.79–2.86) | −0.01 (−0.04 to +0.02) |
| Hits that land | 65.2% (64.4–66.0) | 66.8% (66.1–67.6) | +1.6 (+0.9 to +2.4) points |
| Hurt by hits, per game | 1.85 (1.82–1.88) | 1.89 (1.86–1.92) | +0.04 (+0.01 to +0.07) |
| Hurt by dirty plays, per game | 0.96 (0.95–0.98) | 0.99 (0.97–1.01) | +0.03 (+0.01 to +0.04) |
| Shaken per game | 0.00 (0.00–0.00) | 0.00 (0.00–0.00) | +0.00 (+0.00 to +0.00) |
| Injured per game (not carried off) | 2.59 (2.55–2.62) | 2.65 (2.62–2.68) | +0.06 (+0.03 to +0.09) |
| Knocked out per game | 0.00 (0.00–0.00) | 0.00 (0.00–0.00) | +0.00 (+0.00 to +0.00) |
| Carried off per game | 0.23 (0.22–0.24) | 0.23 (0.22–0.24) | +0.00 (−0.01 to +0.01) |
| Fouls (dirty plays) per game | 0.99 (0.97–1.01) | 1.00 (0.98–1.02) | +0.01 (−0.00 to +0.03) |
| Fouls caught | 0.0% (0.0–0.0) | 0.0% (0.0–0.0) | +0.0 (+0.0 to +0.0) points |
| Sent off per game | 0.00 (0.00–0.00) | 0.00 (0.00–0.00) | +0.00 (+0.00 to +0.00) |

