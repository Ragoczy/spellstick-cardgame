# Comparison: Shield minus3, 2026-10-14

Made by `npm run sim-compare`: 5000 computer-vs-computer games per run (seed block 1), 2 lanes, card set 0.16-prototype. Took 80 s on 20 workers.

- Before: config changes `shieldEffect=zero`; cards data/cards.prototype.json.
- After (Shield minus3): config changes `shieldEffect=minus`, `shieldAmount=3`; cards data/cards.prototype.json.

Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. Both runs play the same seeds (the same deals and first player), and each change is measured seed by seed, so a small real change still shows. A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.

## Health

No crashes, no impossible states, and no game hit the turn cap.

## Targets

| Measure | Before | After | Change (95% interval) | Target | After meets it? |
| --- | --- | --- | --- | --- | --- |
| Turns per game | 50.4 (50.2–50.7) | 50.7 (50.4–50.9) | +0.2 (+0.0 to +0.4) | 30–50 | No |
| Goals per game | 2.39 (2.36–2.43) | 2.30 (2.26–2.33) | −0.10 (−0.12 to −0.07) | 1.84–3.06 (v0.16 ±25%) | Yes |
| Spells cast per game | 15.7 (15.6–15.8) | 15.7 (15.6–15.8) | −0.0 (−0.1 to +0.0) | at least 15.7 | Borderline |
| Players hurt per game (any result) | 2.82 (2.78–2.85) | 2.85 (2.81–2.89) | +0.03 (+0.01 to +0.06) | 4–8 | No |
| Shaken share of those | 0.0% (0.0–0.0) | 0.0% (0.0–0.0) | +0.0 (+0.0 to +0.0) points | at least 50% | No |
| Real injuries per game (Injured, knocked out, carried off) | 2.82 (2.78–2.85) | 2.85 (2.81–2.89) | +0.03 (+0.01 to +0.06) | at least 3.5 | No |
| Carried off + knocked out per game | 0.23 (0.22–0.24) | 0.23 (0.22–0.24) | +0.00 (−0.01 to +0.01) | at most 1.5 | Yes |
| Team that suffered the first carry-off or knockout lost | 52.2% (49.1–55.2) | 53.7% (50.7–56.7) | +1.6 (−1.1 to +4.3) points | at most 60% | Yes |
| Penalties per game | 0.00 (0.00–0.00) | 0.00 (0.00–0.00) | +0.00 (+0.00 to +0.00) | 0.1–0.5 | No |
| Unanswered Shield scores (before the dice, over every shot) | 91.9% (91.7–92.0) | 71.0% (70.7–71.2) | −20.9 (−21.1 to −20.7) points | under 75% | Yes |

Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: before 97.2%, shield minus3 72.2% (target: under 75%).

## Other measures

| Measure | Before | After | Change (95% interval) |
| --- | --- | --- | --- |
| First player wins (draws count half) | 49.4% (48.0–50.7) | 50.2% (48.8–51.6) | +0.9 (−0.3 to +2.0) points |
| Team A wins (draws count half) | 51.3% (49.9–52.7) | 49.8% (48.4–51.2) | −1.5 (−2.6 to −0.3) points |
| Draws | 1.4% (1.0–1.7) | 1.2% (0.9–1.5) | −0.2 (−0.4 to +0.1) points |
| Shots per game | 7.30 (7.26–7.35) | 7.27 (7.22–7.31) | −0.03 (−0.07 to +0.00) |
| Shots that score | 32.8% (32.3–33.3) | 31.6% (31.1–32.1) | −1.2 (−1.6 to −0.8) points |
| Tackles per game | 13.64 (13.51–13.77) | 13.79 (13.66–13.92) | +0.15 (+0.06 to +0.25) |
| Tackles won | 33.2% (32.8–33.6) | 33.0% (32.6–33.4) | −0.3 (−0.6 to +0.1) points |
| Hits per game | 2.84 (2.81–2.87) | 2.82 (2.79–2.85) | −0.02 (−0.04 to +0.00) |
| Hits that land | 65.2% (64.4–66.0) | 66.3% (65.5–67.1) | +1.1 (+0.5 to +1.7) points |
| Hurt by hits, per game | 1.85 (1.82–1.88) | 1.87 (1.84–1.90) | +0.02 (−0.01 to +0.04) |
| Hurt by dirty plays, per game | 0.96 (0.95–0.98) | 0.98 (0.96–1.00) | +0.02 (+0.00 to +0.03) |
| Shaken per game | 0.00 (0.00–0.00) | 0.00 (0.00–0.00) | +0.00 (+0.00 to +0.00) |
| Injured per game (not carried off) | 2.59 (2.55–2.62) | 2.62 (2.59–2.65) | +0.03 (+0.01 to +0.06) |
| Knocked out per game | 0.00 (0.00–0.00) | 0.00 (0.00–0.00) | +0.00 (+0.00 to +0.00) |
| Carried off per game | 0.23 (0.22–0.24) | 0.23 (0.22–0.24) | +0.00 (−0.01 to +0.01) |
| Fouls (dirty plays) per game | 0.99 (0.97–1.01) | 1.00 (0.98–1.02) | +0.01 (−0.00 to +0.02) |
| Fouls caught | 0.0% (0.0–0.0) | 0.0% (0.0–0.0) | +0.0 (+0.0 to +0.0) points |
| Sent off per game | 0.00 (0.00–0.00) | 0.00 (0.00–0.00) | +0.00 (+0.00 to +0.00) |

