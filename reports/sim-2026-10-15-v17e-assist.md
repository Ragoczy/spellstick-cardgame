# Comparison: Phase e assist, 2026-10-15

Made by `npm run sim-compare`: 5000 computer-vs-computer games per run (seed block 1), 2 lanes, card set 0.16-prototype. Took 115 s on 8 workers.

- Before: config changes none; cards data/cards.prototype.json.
- After (Phase e assist): config changes `tackleAssist=1`; cards data/cards.prototype.json.

Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. Both runs play the same seeds (the same deals and first player), and each change is measured seed by seed, so a small real change still shows. A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.

## Health

No crashes, no impossible states, and no game hit the turn cap.

## Targets

| Measure | Before | After | Change (95% interval) | Target | After meets it? |
| --- | --- | --- | --- | --- | --- |
| Turns per game | 51.6 (51.4–51.9) | 52.4 (52.1–52.6) | +0.7 (+0.5 to +1.0) | 30–50 | No |
| Goals per game | 1.90 (1.86–1.93) | 1.81 (1.77–1.84) | −0.09 (−0.13 to −0.05) | 1.84–3.06 (v0.16 ±25%) | Borderline |
| Spells cast per game | 14.7 (14.6–14.8) | 14.0 (13.9–14.1) | −0.7 (−0.8 to −0.5) | at least 15.7 | No |
| Players hurt per game (any result) | 6.58 (6.51–6.65) | 6.79 (6.72–6.86) | +0.21 (+0.12 to +0.29) | 4–8 | Yes |
| Shaken share of those | 50.8% (50.3–51.4) | 50.6% (50.0–51.1) | −0.3 (−0.9 to +0.4) points | at least 50% | Yes |
| Real injuries per game (Injured, knocked out, carried off) | 3.24 (3.19–3.29) | 3.36 (3.30–3.41) | +0.12 (+0.06 to +0.18) | at least 3.5 | No |
| Carried off + knocked out per game | 1.26 (1.23–1.29) | 1.31 (1.27–1.34) | +0.05 (+0.01 to +0.09) | at most 1.5 | Yes |
| Team that suffered the first carry-off or knockout lost | 51.6% (50.0–53.3) | 50.3% (48.6–51.9) | −1.3 (−3.6 to +0.9) points | at most 60% | Yes |
| Penalties per game | 0.90 (0.87–0.93) | 0.63 (0.61–0.66) | −0.27 (−0.30 to −0.23) | 0.1–1.2 | Yes |
| Unanswered Shield scores (before the dice, over every shot) | 60.5% (60.2–60.9) | 60.0% (59.6–60.4) | −0.5 (−0.8 to −0.2) points | under 75% | Yes |

Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: before 58.3%, phase e assist 58.3% (target: under 75%).

## Other measures

| Measure | Before | After | Change (95% interval) |
| --- | --- | --- | --- |
| First player wins (draws count half) | 51.1% (49.7–52.5) | 51.0% (49.7–52.4) | −0.1 (−1.8 to +1.6) points |
| Team A wins (draws count half) | 49.6% (48.3–51.0) | 51.2% (49.8–52.5) | +1.5 (−0.2 to +3.2) points |
| Draws | 1.4% (1.1–1.7) | 1.4% (1.1–1.7) | +0.0 (−0.5 to +0.5) points |
| Shots per game | 5.30 (5.25–5.35) | 5.02 (4.97–5.07) | −0.28 (−0.34 to −0.22) |
| Shots that score | 35.8% (35.1–36.4) | 36.0% (35.4–36.7) | +0.2 (−0.5 to +1.0) points |
| Tackles per game | 7.52 (7.44–7.61) | 11.67 (11.55–11.78) | +4.14 (+4.02 to +4.26) |
| Tackles won | 41.0% (40.5–41.6) | 48.8% (48.3–49.3) | +7.8 (+7.1 to +8.4) points |
| Hits per game | 0.89 (0.86–0.92) | 0.57 (0.54–0.59) | −0.33 (−0.36 to −0.30) |
| Hits that land | 72.5% (71.2–73.8) | 72.4% (70.7–74.0) | −0.1 (−2.1 to +1.9) points |
| Hurt by hits, per game | 0.65 (0.62–0.67) | 0.41 (0.39–0.43) | −0.24 (−0.26 to −0.21) |
| Hurt by dirty plays, per game | 0.91 (0.89–0.93) | 0.89 (0.87–0.91) | −0.02 (−0.04 to +0.00) |
| Hurt by tackles, per game | 1.08 (1.06–1.11) | 1.93 (1.89–1.97) | +0.84 (+0.80 to +0.89) |
| Hurt by physical attacks, per game | 3.94 (3.89–3.99) | 3.56 (3.51–3.61) | −0.38 (−0.44 to −0.32) |
| Physical attacks per game | 14.33 (14.27–14.40) | 12.46 (12.39–12.54) | −1.87 (−1.95 to −1.79) |
| Physical attacks won | 46.3% (46.0–46.7) | 47.5% (47.1–47.9) | +1.2 (+0.7 to +1.6) points |
| Ball drops per game | 6.64 (6.58–6.70) | 5.92 (5.86–5.98) | −0.72 (−0.80 to −0.64) |
| Turns in the penalty box per game | 1.85 (1.79–1.91) | 1.31 (1.26–1.36) | −0.54 (−0.61 to −0.47) |
| Power plays per game | 0.18 (0.17–0.20) | 0.13 (0.12–0.14) | −0.05 (−0.07 to −0.04) |
| Knockdowns per game | 9.74 (9.64–9.84) | 11.49 (11.37–11.61) | +1.75 (+1.62 to +1.87) |
| Knockdowns that hurt | 46.7% (46.2–47.1) | 44.1% (43.7–44.5) | −2.6 (−3.1 to −2.0) points |
| Shaken per game | 3.34 (3.29–3.39) | 3.43 (3.38–3.48) | +0.09 (+0.03 to +0.15) |
| Injured per game (not carried off) | 1.98 (1.94–2.02) | 2.05 (2.01–2.09) | +0.07 (+0.03 to +0.12) |
| Knocked out per game | 1.22 (1.19–1.25) | 1.26 (1.23–1.29) | +0.04 (+0.00 to +0.08) |
| Carried off per game | 0.04 (0.03–0.04) | 0.04 (0.04–0.05) | +0.01 (−0.00 to +0.01) |
| Fouls (dirty plays) per game | 1.24 (1.22–1.26) | 1.24 (1.22–1.25) | −0.01 (−0.03 to +0.01) |
| Fouls caught | 16.1% (15.2–17.0) | 16.1% (15.2–17.0) | −0.0 (−1.1 to +1.1) points |
| Sent off per game | 0.20 (0.19–0.21) | 0.20 (0.19–0.21) | −0.00 (−0.01 to +0.01) |

