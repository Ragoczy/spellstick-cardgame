# Comparison: What-if severity 1-2 Shaken, 2026-10-15

Made by `npm run sim-compare`: 5000 computer-vs-computer games per run (seed block 1), 2 lanes, card set 0.16-prototype. Took 112 s on 8 workers.

- Before: config changes none; cards data/cards.prototype.json.
- After (What-if severity 1-2 Shaken): config changes `severity=[object Object]`; cards data/cards.prototype.json.

Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. Both runs play the same seeds (the same deals and first player), and each change is measured seed by seed, so a small real change still shows. A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.

## Health

No crashes, no impossible states, and no game hit the turn cap.

## Targets

| Measure | Before | After | Change (95% interval) | Target | After meets it? |
| --- | --- | --- | --- | --- | --- |
| Turns per game | 51.4 (51.2–51.6) | 52.0 (51.8–52.2) | +0.5 (+0.4 to +0.7) | 30–50 | No |
| Goals per game | 1.91 (1.88–1.95) | 1.91 (1.88–1.95) | +0.00 (−0.03 to +0.03) | 1.84–3.06 (v0.16 ±25%) | Yes |
| Spells cast per game | 15.2 (15.1–15.3) | 14.7 (14.6–14.8) | −0.4 (−0.5 to −0.4) | at least 15.7 | No |
| Players hurt per game (any result) | 7.84 (7.76–7.91) | 8.13 (8.05–8.21) | +0.29 (+0.22 to +0.37) | 4–8 | No |
| Shaken share of those | 58.1% (57.6–58.6) | 46.7% (46.2–47.1) | −11.4 (−11.9 to −11.0) points | at least 50% | No |
| Real injuries per game (Injured, knocked out, carried off) | 3.28 (3.23–3.33) | 4.33 (4.28–4.39) | +1.05 (+1.00 to +1.11) | at least 3.5 | Yes |
| Carried off + knocked out per game | 1.27 (1.24–1.31) | 1.34 (1.31–1.37) | +0.07 (+0.04 to +0.10) | at most 1.5 | Yes |
| Team that suffered the first carry-off or knockout lost | 51.6% (50.0–53.3) | 51.4% (49.7–53.0) | −0.3 (−2.1 to +1.6) points | at most 60% | Yes |
| Penalties per game | 0.94 (0.92–0.97) | 0.98 (0.95–1.00) | +0.03 (+0.01 to +0.06) | 0.1–1.2 | Yes |
| Unanswered Shield scores (before the dice, over every shot) | 60.6% (60.2–60.9) | 59.6% (59.3–60.0) | −0.9 (−1.2 to −0.7) points | under 75% | Yes |

Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: before 58.3%, what-if severity 1-2 shaken 58.3% (target: under 75%).

## Other measures

| Measure | Before | After | Change (95% interval) |
| --- | --- | --- | --- |
| First player wins (draws count half) | 50.1% (48.7–51.4) | 50.3% (48.9–51.7) | +0.3 (−1.1 to +1.7) points |
| Team A wins (draws count half) | 49.8% (48.5–51.2) | 49.5% (48.2–50.9) | −0.3 (−1.7 to +1.1) points |
| Draws | 1.3% (1.0–1.6) | 1.5% (1.2–1.9) | +0.2 (−0.2 to +0.6) points |
| Shots per game | 5.30 (5.25–5.35) | 5.42 (5.37–5.47) | +0.12 (+0.07 to +0.16) |
| Shots that score | 36.1% (35.4–36.7) | 35.3% (34.7–35.9) | −0.8 (−1.4 to −0.2) points |
| Tackles per game | 6.49 (6.42–6.57) | 7.10 (7.01–7.18) | +0.60 (+0.53 to +0.68) |
| Tackles won | 45.5% (44.9–46.0) | 44.6% (44.0–45.1) | −0.9 (−1.4 to −0.4) points |
| Hits per game | 1.09 (1.06–1.11) | 1.30 (1.27–1.33) | +0.21 (+0.18 to +0.24) |
| Hits that land | 72.5% (71.3–73.7) | 72.4% (71.3–73.5) | −0.1 (−1.5 to +1.3) points |
| Hurt by hits, per game | 0.79 (0.76–0.81) | 0.94 (0.91–0.96) | +0.15 (+0.12 to +0.18) |
| Hurt by dirty plays, per game | 0.92 (0.90–0.94) | 0.86 (0.84–0.88) | −0.06 (−0.07 to −0.04) |
| Hurt by tackles, per game | 2.21 (2.17–2.26) | 2.41 (2.36–2.45) | +0.19 (+0.15 to +0.24) |
| Hurt by physical attacks, per game | 3.92 (3.87–3.97) | 3.92 (3.87–3.98) | +0.01 (−0.04 to +0.05) |
| Physical attacks per game | 14.52 (14.46–14.58) | 14.64 (14.58–14.70) | +0.12 (+0.06 to +0.17) |
| Physical attacks won | 45.6% (45.2–45.9) | 45.8% (45.5–46.2) | +0.3 (−0.0 to +0.6) points |
| Ball drops per game | 6.62 (6.55–6.68) | 6.71 (6.65–6.77) | +0.09 (+0.04 to +0.15) |
| Turns in the penalty box per game | 1.94 (1.88–2.00) | 2.01 (1.95–2.07) | +0.07 (+0.02 to +0.13) |
| Power plays per game | 0.18 (0.17–0.19) | 0.18 (0.17–0.20) | +0.00 (−0.01 to +0.01) |
| Knockdowns per game | 9.59 (9.49–9.68) | 9.87 (9.77–9.97) | +0.28 (+0.20 to +0.37) |
| Knockdowns that hurt | 46.8% (46.3–47.2) | 46.1% (45.7–46.6) | −0.7 (−1.1 to −0.2) points |
| Shaken per game | 4.55 (4.50–4.61) | 3.79 (3.74–3.84) | −0.76 (−0.81 to −0.70) |
| Injured per game (not carried off) | 2.01 (1.97–2.05) | 2.99 (2.95–3.04) | +0.99 (+0.94 to +1.03) |
| Knocked out per game | 1.24 (1.21–1.27) | 1.24 (1.21–1.27) | +0.00 (−0.03 to +0.03) |
| Carried off per game | 0.04 (0.03–0.04) | 0.10 (0.09–0.11) | +0.07 (+0.06 to +0.07) |
| Fouls (dirty plays) per game | 1.27 (1.25–1.28) | 1.22 (1.20–1.24) | −0.05 (−0.06 to −0.04) |
| Fouls caught | 15.9% (15.0–16.9) | 16.8% (15.9–17.8) | +0.9 (+0.1 to +1.7) points |
| Sent off per game | 0.20 (0.19–0.21) | 0.20 (0.19–0.22) | +0.00 (−0.01 to +0.01) |

