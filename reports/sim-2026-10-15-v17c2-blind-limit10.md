# Comparison: Blind limit 10, 2026-10-15

Made by `npm run sim-compare`: 3000 computer-vs-computer games per run (seed block 1), 2 lanes, card set 0.16-prototype. Took 122 s on 8 workers.

- Before: config changes none; cards data/cards.prototype.json.
- After (Blind limit 10): config changes `physicalDraw=blind`, `physicalAttackLimit=10`; cards data/cards.prototype.json.

Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. Both runs play the same seeds (the same deals and first player), and each change is measured seed by seed, so a small real change still shows. A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.

## Health

No crashes, no impossible states, and no game hit the turn cap.

## Targets

| Measure | Before | After | Change (95% interval) | Target | After meets it? |
| --- | --- | --- | --- | --- | --- |
| Turns per game | 50.7 (50.5–51.0) | 52.4 (52.1–52.6) | +1.6 (+1.3 to +2.0) | 30–50 | No |
| Goals per game | 2.03 (1.99–2.08) | 1.77 (1.72–1.81) | −0.27 (−0.33 to −0.21) | 1.84–3.06 (v0.16 ±25%) | No |
| Spells cast per game | 13.6 (13.4–13.7) | 11.7 (11.6–11.9) | −1.8 (−2.0 to −1.7) | at least 15.7 | No |
| Players hurt per game (any result) | 5.71 (5.63–5.79) | 7.06 (6.97–7.16) | +1.35 (+1.24 to +1.47) | 4–8 | Yes |
| Shaken share of those | 49.5% (48.7–50.2) | 48.2% (47.6–48.9) | −1.3 (−2.2 to −0.3) points | at least 50% | No |
| Real injuries per game (Injured, knocked out, carried off) | 2.88 (2.83–2.94) | 3.66 (3.59–3.73) | +0.77 (+0.69 to +0.85) | at least 3.5 | Yes |
| Carried off + knocked out per game | 1.06 (1.03–1.10) | 1.45 (1.41–1.49) | +0.38 (+0.33 to +0.44) | at most 1.5 | Yes |
| Team that suffered the first carry-off or knockout lost | 50.1% (47.9–52.3) | 53.4% (51.3–55.4) | +3.3 (+0.3 to +6.3) points | at most 60% | Yes |
| Penalties per game | 0.17 (0.15–0.18) | 0.42 (0.39–0.44) | +0.25 (+0.22 to +0.27) | 0.1–0.5 | Yes |
| Unanswered Shield scores (before the dice, over every shot) | 59.6% (59.2–60.1) | 59.4% (59.0–59.9) | −0.2 (−0.6 to +0.3) points | under 75% | Yes |

Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: before 58.3%, blind limit 10 58.3% (target: under 75%).

## Other measures

| Measure | Before | After | Change (95% interval) |
| --- | --- | --- | --- |
| First player wins (draws count half) | 51.8% (50.1–53.6) | 50.9% (49.2–52.7) | −0.9 (−3.2 to +1.4) points |
| Team A wins (draws count half) | 49.2% (47.4–51.0) | 50.2% (48.5–52.0) | +1.0 (−1.3 to +3.4) points |
| Draws | 1.0% (0.7–1.4) | 1.2% (0.8–1.6) | +0.1 (−0.4 to +0.6) points |
| Shots per game | 5.87 (5.81–5.93) | 5.13 (5.07–5.20) | −0.74 (−0.82 to −0.65) |
| Shots that score | 34.7% (33.9–35.4) | 34.4% (33.6–35.3) | −0.2 (−1.3 to +0.8) points |
| Tackles per game | 11.51 (11.37–11.65) | 6.84 (6.73–6.95) | −4.67 (−4.83 to −4.51) |
| Tackles won | 35.3% (34.7–35.9) | 46.5% (45.7–47.3) | +11.2 (+10.3 to +12.1) points |
| Hits per game | 1.65 (1.61–1.69) | 0.66 (0.63–0.69) | −0.99 (−1.03 to −0.94) |
| Hits that land | 69.3% (68.0–70.6) | 73.0% (71.1–75.0) | +3.7 (+1.4 to +6.0) points |
| Hurt by hits, per game | 1.14 (1.11–1.18) | 0.48 (0.46–0.51) | −0.66 (−0.70 to −0.62) |
| Hurt by dirty plays, per game | 0.85 (0.83–0.88) | 0.84 (0.82–0.87) | −0.01 (−0.04 to +0.02) |
| Hurt by tackles, per game | 1.35 (1.31–1.39) | 1.08 (1.04–1.12) | −0.27 (−0.32 to −0.22) |
| Hurt by physical attacks, per game | 2.37 (2.32–2.42) | 4.66 (4.59–4.73) | +2.29 (+2.21 to +2.38) |
| Physical attacks per game | 7.68 (7.61–7.74) | 17.09 (16.99–17.19) | +9.41 (+9.29 to +9.53) |
| Physical attacks won | 51.7% (51.1–52.3) | 47.4% (46.9–47.8) | −4.3 (−5.1 to −3.6) points |
| Ball drops per game | 3.89 (3.83–3.95) | 8.09 (8.00–8.19) | +4.20 (+4.10 to +4.31) |
| Turns in the penalty box per game | 0.33 (0.30–0.37) | 0.85 (0.80–0.90) | +0.52 (+0.46 to +0.57) |
| Power plays per game | 0.04 (0.03–0.04) | 0.07 (0.06–0.08) | +0.03 (+0.02 to +0.04) |
| Knockdowns per game | 7.95 (7.84–8.07) | 11.27 (11.14–11.40) | +3.32 (+3.16 to +3.48) |
| Knockdowns that hurt | 42.3% (41.7–42.9) | 45.9% (45.4–46.4) | +3.6 (+2.8 to +4.4) points |
| Shaken per game | 2.82 (2.77–2.88) | 3.41 (3.34–3.47) | +0.58 (+0.50 to +0.66) |
| Injured per game (not carried off) | 1.82 (1.78–1.87) | 2.21 (2.16–2.26) | +0.39 (+0.32 to +0.45) |
| Knocked out per game | 1.03 (1.00–1.07) | 1.40 (1.35–1.44) | +0.36 (+0.31 to +0.41) |
| Carried off per game | 0.03 (0.02–0.03) | 0.05 (0.04–0.06) | +0.02 (+0.01 to +0.03) |
| Fouls (dirty plays) per game | 1.21 (1.18–1.23) | 1.14 (1.12–1.17) | −0.07 (−0.10 to −0.04) |
| Fouls caught | 16.6% (15.4–17.8) | 16.4% (15.2–17.7) | −0.1 (−1.8 to +1.5) points |
| Sent off per game | 0.20 (0.19–0.22) | 0.19 (0.17–0.20) | −0.01 (−0.03 to +0.01) |

