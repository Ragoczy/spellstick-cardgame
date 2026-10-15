# Comparison: Escalating penalties, blind draw, 2026-10-15

Made by `npm run sim-compare`: 5000 computer-vs-computer games per run (seed block 1), 2 lanes, card set 0.16-prototype. Took 215 s on 8 workers.

- Before: config changes `physicalDraw=blind`, `penaltyEscalation=false`; cards data/cards.prototype.json.
- After (Escalating penalties, blind draw): config changes `physicalDraw=blind`, `penaltyEscalation=true`; cards data/cards.prototype.json.

Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. Both runs play the same seeds (the same deals and first player), and each change is measured seed by seed, so a small real change still shows. A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.

## Health

No crashes, no impossible states, and no game hit the turn cap.

## Targets

| Measure | Before | After | Change (95% interval) | Target | After meets it? |
| --- | --- | --- | --- | --- | --- |
| Turns per game | 52.7 (52.5–52.9) | 52.2 (52.0–52.4) | −0.4 (−0.6 to −0.3) | 30–50 | No |
| Goals per game | 1.72 (1.68–1.75) | 1.80 (1.76–1.83) | +0.08 (+0.05 to +0.11) | 1.84–3.06 (v0.16 ±25%) | No |
| Spells cast per game | 11.3 (11.2–11.4) | 11.6 (11.5–11.7) | +0.3 (+0.2 to +0.3) | at least 15.7 | No |
| Players hurt per game (any result) | 7.35 (7.28–7.42) | 7.19 (7.11–7.26) | −0.16 (−0.23 to −0.10) | 4–8 | Yes |
| Shaken share of those | 48.2% (47.7–48.7) | 48.5% (48.0–49.0) | +0.3 (−0.2 to +0.7) points | at least 50% | No |
| Real injuries per game (Injured, knocked out, carried off) | 3.81 (3.76–3.86) | 3.70 (3.65–3.76) | −0.10 (−0.15 to −0.06) | at least 3.5 | Yes |
| Carried off + knocked out per game | 1.51 (1.48–1.55) | 1.46 (1.42–1.49) | −0.05 (−0.09 to −0.02) | at most 1.5 | Yes |
| Team that suffered the first carry-off or knockout lost | 51.8% (50.2–53.4) | 51.5% (49.9–53.1) | −0.3 (−2.1 to +1.5) points | at most 60% | Yes |
| Penalties per game | 0.47 (0.45–0.49) | 1.30 (1.26–1.33) | +0.83 (+0.80 to +0.86) | 0.1–0.5 | No |
| Unanswered Shield scores (before the dice, over every shot) | 59.1% (58.7–59.5) | 59.3% (58.9–59.7) | +0.2 (−0.0 to +0.4) points | under 75% | Yes |

Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: before 58.3%, escalating penalties, blind draw 58.3% (target: under 75%).

## Other measures

| Measure | Before | After | Change (95% interval) |
| --- | --- | --- | --- |
| First player wins (draws count half) | 51.4% (50.0–52.8) | 51.5% (50.1–52.9) | +0.1 (−1.3 to +1.5) points |
| Team A wins (draws count half) | 49.2% (47.9–50.6) | 50.0% (48.7–51.4) | +0.8 (−0.6 to +2.2) points |
| Draws | 1.2% (0.9–1.5) | 1.7% (1.3–2.0) | +0.4 (+0.0 to +0.9) points |
| Shots per game | 4.97 (4.92–5.02) | 5.07 (5.02–5.12) | +0.10 (+0.06 to +0.15) |
| Shots that score | 34.6% (33.9–35.2) | 35.4% (34.8–36.1) | +0.8 (+0.2 to +1.4) points |
| Tackles per game | 6.27 (6.19–6.36) | 6.79 (6.71–6.87) | +0.51 (+0.45 to +0.58) |
| Tackles won | 49.3% (48.7–49.9) | 47.1% (46.5–47.7) | −2.2 (−2.7 to −1.7) points |
| Hits per game | 0.43 (0.41–0.45) | 0.51 (0.49–0.53) | +0.08 (+0.06 to +0.10) |
| Hits that land | 72.3% (70.3–74.2) | 74.5% (72.8–76.2) | +2.2 (+0.3 to +4.1) points |
| Hurt by hits, per game | 0.31 (0.29–0.32) | 0.38 (0.36–0.40) | +0.07 (+0.05 to +0.09) |
| Hurt by dirty plays, per game | 0.83 (0.81–0.85) | 0.84 (0.82–0.86) | +0.01 (−0.01 to +0.02) |
| Hurt by tackles, per game | 1.05 (1.02–1.08) | 1.10 (1.07–1.13) | +0.05 (+0.02 to +0.07) |
| Hurt by physical attacks, per game | 5.17 (5.11–5.23) | 4.87 (4.81–4.93) | −0.29 (−0.35 to −0.24) |
| Physical attacks per game | 18.78 (18.67–18.90) | 17.50 (17.39–17.60) | −1.29 (−1.38 to −1.19) |
| Physical attacks won | 47.8% (47.4–48.1) | 48.4% (48.0–48.7) | +0.6 (+0.3 to +0.9) points |
| Ball drops per game | 8.97 (8.88–9.05) | 8.46 (8.38–8.54) | −0.51 (−0.58 to −0.43) |
| Turns in the penalty box per game | 0.97 (0.93–1.01) | 2.66 (2.59–2.73) | +1.69 (+1.62 to +1.76) |
| Power plays per game | 0.08 (0.07–0.08) | 0.22 (0.21–0.23) | +0.14 (+0.13 to +0.16) |
| Knockdowns per game | 12.09 (11.98–12.20) | 11.67 (11.57–11.78) | −0.42 (−0.51 to −0.32) |
| Knockdowns that hurt | 46.2% (45.8–46.6) | 46.1% (45.7–46.5) | −0.1 (−0.5 to +0.3) points |
| Shaken per game | 3.54 (3.49–3.59) | 3.48 (3.43–3.53) | −0.06 (−0.11 to −0.01) |
| Injured per game (not carried off) | 2.30 (2.26–2.34) | 2.25 (2.21–2.29) | −0.05 (−0.09 to −0.01) |
| Knocked out per game | 1.46 (1.42–1.49) | 1.41 (1.38–1.44) | −0.05 (−0.08 to −0.02) |
| Carried off per game | 0.06 (0.05–0.06) | 0.05 (0.04–0.05) | −0.01 (−0.01 to +0.00) |
| Fouls (dirty plays) per game | 1.12 (1.10–1.14) | 1.14 (1.12–1.16) | +0.01 (+0.00 to +0.03) |
| Fouls caught | 16.0% (15.0–17.0) | 16.0% (15.0–16.9) | +0.0 (−0.7 to +0.7) points |
| Sent off per game | 0.18 (0.17–0.19) | 0.18 (0.17–0.19) | +0.00 (−0.01 to +0.01) |

