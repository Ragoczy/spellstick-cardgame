# Comparison: Blind limit 6, 2026-10-15

Made by `npm run sim-compare`: 3000 computer-vs-computer games per run (seed block 1), 2 lanes, card set 0.16-prototype. Took 124 s on 8 workers.

- Before: config changes none; cards data/cards.prototype.json.
- After (Blind limit 6): config changes `physicalDraw=blind`, `physicalAttackLimit=6`; cards data/cards.prototype.json.

Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. Both runs play the same seeds (the same deals and first player), and each change is measured seed by seed, so a small real change still shows. A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.

## Health

No crashes, no impossible states, and no game hit the turn cap.

## Targets

| Measure | Before | After | Change (95% interval) | Target | After meets it? |
| --- | --- | --- | --- | --- | --- |
| Turns per game | 50.7 (50.5–51.0) | 51.1 (50.8–51.3) | +0.3 (−0.0 to +0.7) | 30–50 | No |
| Goals per game | 2.03 (1.99–2.08) | 1.92 (1.87–1.96) | −0.12 (−0.18 to −0.06) | 1.84–3.06 (v0.16 ±25%) | Yes |
| Spells cast per game | 13.6 (13.4–13.7) | 13.0 (12.9–13.1) | −0.6 (−0.7 to −0.4) | at least 15.7 | No |
| Players hurt per game (any result) | 5.71 (5.63–5.79) | 6.14 (6.06–6.23) | +0.43 (+0.32 to +0.54) | 4–8 | Yes |
| Shaken share of those | 49.5% (48.7–50.2) | 48.6% (47.9–49.3) | −0.9 (−1.9 to +0.1) points | at least 50% | No |
| Real injuries per game (Injured, knocked out, carried off) | 2.88 (2.83–2.94) | 3.16 (3.10–3.22) | +0.27 (+0.20 to +0.35) | at least 3.5 | No |
| Carried off + knocked out per game | 1.06 (1.03–1.10) | 1.21 (1.17–1.25) | +0.14 (+0.09 to +0.20) | at most 1.5 | Yes |
| Team that suffered the first carry-off or knockout lost | 50.1% (47.9–52.3) | 52.4% (50.3–54.6) | +2.3 (−0.8 to +5.4) points | at most 60% | Yes |
| Penalties per game | 0.17 (0.15–0.18) | 0.27 (0.25–0.29) | +0.10 (+0.08 to +0.13) | 0.1–0.5 | Yes |
| Unanswered Shield scores (before the dice, over every shot) | 59.6% (59.2–60.1) | 59.7% (59.2–60.2) | +0.1 (−0.4 to +0.5) points | under 75% | Yes |

Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: before 58.3%, blind limit 6 58.3% (target: under 75%).

## Other measures

| Measure | Before | After | Change (95% interval) |
| --- | --- | --- | --- |
| First player wins (draws count half) | 51.8% (50.1–53.6) | 50.8% (49.0–52.6) | −1.1 (−3.4 to +1.2) points |
| Team A wins (draws count half) | 49.2% (47.4–51.0) | 49.3% (47.5–51.1) | +0.1 (−2.2 to +2.4) points |
| Draws | 1.0% (0.7–1.4) | 1.4% (1.0–1.9) | +0.4 (−0.2 to +1.0) points |
| Shots per game | 5.87 (5.81–5.93) | 5.56 (5.50–5.62) | −0.31 (−0.39 to −0.23) |
| Shots that score | 34.7% (33.9–35.4) | 34.5% (33.7–35.3) | −0.2 (−1.2 to +0.8) points |
| Tackles per game | 11.51 (11.37–11.65) | 9.08 (8.96–9.20) | −2.43 (−2.60 to −2.26) |
| Tackles won | 35.3% (34.7–35.9) | 40.7% (40.0–41.3) | +5.4 (+4.5 to +6.2) points |
| Hits per game | 1.65 (1.61–1.69) | 1.25 (1.21–1.28) | −0.40 (−0.45 to −0.35) |
| Hits that land | 69.3% (68.0–70.6) | 72.2% (70.7–73.6) | +2.8 (+0.9 to +4.8) points |
| Hurt by hits, per game | 1.14 (1.11–1.18) | 0.90 (0.87–0.93) | −0.24 (−0.29 to −0.20) |
| Hurt by dirty plays, per game | 0.85 (0.83–0.88) | 0.86 (0.84–0.89) | +0.01 (−0.02 to +0.04) |
| Hurt by tackles, per game | 1.35 (1.31–1.39) | 1.23 (1.19–1.27) | −0.12 (−0.18 to −0.07) |
| Hurt by physical attacks, per game | 2.37 (2.32–2.42) | 3.15 (3.10–3.21) | +0.79 (+0.72 to +0.86) |
| Physical attacks per game | 7.68 (7.61–7.74) | 11.55 (11.51–11.59) | +3.87 (+3.80 to +3.95) |
| Physical attacks won | 51.7% (51.1–52.3) | 47.1% (46.6–47.7) | −4.6 (−5.3 to −3.8) points |
| Ball drops per game | 3.89 (3.83–3.95) | 5.45 (5.38–5.51) | +1.55 (+1.47 to +1.64) |
| Turns in the penalty box per game | 0.33 (0.30–0.37) | 0.56 (0.52–0.60) | +0.22 (+0.18 to +0.27) |
| Power plays per game | 0.04 (0.03–0.04) | 0.05 (0.04–0.06) | +0.02 (+0.01 to +0.03) |
| Knockdowns per game | 7.95 (7.84–8.07) | 9.10 (8.97–9.22) | +1.14 (+0.99 to +1.29) |
| Knockdowns that hurt | 42.3% (41.7–42.9) | 44.0% (43.4–44.6) | +1.7 (+0.9 to +2.5) points |
| Shaken per game | 2.82 (2.77–2.88) | 2.98 (2.92–3.05) | +0.16 (+0.08 to +0.24) |
| Injured per game (not carried off) | 1.82 (1.78–1.87) | 1.95 (1.90–2.00) | +0.13 (+0.07 to +0.19) |
| Knocked out per game | 1.03 (1.00–1.07) | 1.17 (1.13–1.21) | +0.14 (+0.09 to +0.19) |
| Carried off per game | 0.03 (0.02–0.03) | 0.04 (0.03–0.04) | +0.01 (−0.00 to +0.02) |
| Fouls (dirty plays) per game | 1.21 (1.18–1.23) | 1.19 (1.17–1.22) | −0.01 (−0.04 to +0.01) |
| Fouls caught | 16.6% (15.4–17.8) | 16.6% (15.4–17.8) | +0.0 (−1.6 to +1.7) points |
| Sent off per game | 0.20 (0.19–0.22) | 0.20 (0.18–0.21) | −0.00 (−0.02 to +0.02) |

