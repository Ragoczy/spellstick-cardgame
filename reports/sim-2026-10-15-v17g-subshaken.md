# Comparison: Forced sub comes on Shaken, 2026-10-15

Made by `npm run sim-compare`: 5000 computer-vs-computer games per run (seed block 1), 2 lanes, card set 0.16-prototype. Took 133 s on 8 workers.

- Before: config changes none; cards data/cards.prototype.json.
- After (Forced sub comes on Shaken): config changes `forcedSubShaken=true`; cards data/cards.prototype.json.

Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. Both runs play the same seeds (the same deals and first player), and each change is measured seed by seed, so a small real change still shows. A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.

## Health

No crashes, no impossible states, and no game hit the turn cap.

## Targets

| Measure | Before | After | Change (95% interval) | Target | After meets it? |
| --- | --- | --- | --- | --- | --- |
| Turns per game | 51.4 (51.2–51.6) | 51.4 (51.2–51.6) | −0.0 (−0.3 to +0.2) | 30–50 | No |
| Goals per game | 1.91 (1.88–1.95) | 1.82 (1.79–1.86) | −0.09 (−0.13 to −0.05) | 1.84–3.06 (v0.16 ±25%) | Borderline |
| Spells cast per game | 15.2 (15.1–15.3) | 17.5 (17.4–17.6) | +2.3 (+2.2 to +2.4) | at least 15.7 | Yes |
| Players hurt per game (any result) | 7.84 (7.76–7.91) | 7.86 (7.79–7.93) | +0.03 (−0.07 to +0.12) | 4–8 | Yes |
| Shaken share of those | 58.1% (57.6–58.6) | 56.5% (56.0–57.0) | −1.6 (−2.2 to −1.0) points | at least 50% | Yes |
| Real injuries per game (Injured, knocked out, carried off) | 3.28 (3.23–3.33) | 3.42 (3.37–3.47) | +0.14 (+0.07 to +0.20) | at least 3.5 | No |
| Carried off + knocked out per game | 1.27 (1.24–1.31) | 1.32 (1.29–1.36) | +0.05 (+0.01 to +0.09) | at most 1.5 | Yes |
| Team that suffered the first carry-off or knockout lost | 51.6% (50.0–53.3) | 49.9% (48.2–51.5) | −1.8 (−4.0 to +0.5) points | at most 60% | Yes |
| Penalties per game | 0.94 (0.92–0.97) | 0.81 (0.79–0.84) | −0.13 (−0.16 to −0.10) | 0.1–1.2 | Yes |
| Unanswered Shield scores (before the dice, over every shot) | 60.6% (60.2–60.9) | 60.6% (60.2–60.9) | +0.0 (−0.3 to +0.3) points | under 75% | Yes |

Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: before 58.3%, forced sub comes on shaken 58.3% (target: under 75%).

## Other measures

| Measure | Before | After | Change (95% interval) |
| --- | --- | --- | --- |
| First player wins (draws count half) | 50.1% (48.7–51.4) | 50.8% (49.4–52.2) | +0.7 (−1.0 to +2.5) points |
| Team A wins (draws count half) | 49.8% (48.5–51.2) | 50.0% (48.6–51.4) | +0.2 (−1.6 to +1.9) points |
| Draws | 1.3% (1.0–1.6) | 1.2% (0.9–1.5) | −0.1 (−0.5 to +0.4) points |
| Shots per game | 5.30 (5.25–5.35) | 5.13 (5.08–5.18) | −0.18 (−0.24 to −0.12) |
| Shots that score | 36.1% (35.4–36.7) | 35.6% (34.9–36.2) | −0.5 (−1.3 to +0.3) points |
| Tackles per game | 6.49 (6.42–6.57) | 4.91 (4.85–4.97) | −1.58 (−1.67 to −1.50) |
| Tackles won | 45.5% (44.9–46.0) | 47.2% (46.6–47.9) | +1.8 (+1.0 to +2.6) points |
| Hits per game | 1.09 (1.06–1.11) | 2.12 (2.09–2.16) | +1.04 (+1.00 to +1.08) |
| Hits that land | 72.5% (71.3–73.7) | 70.1% (69.2–71.0) | −2.4 (−3.8 to −1.0) points |
| Hurt by hits, per game | 0.79 (0.76–0.81) | 1.49 (1.46–1.52) | +0.70 (+0.67 to +0.74) |
| Hurt by dirty plays, per game | 0.92 (0.90–0.94) | 0.94 (0.92–0.96) | +0.02 (+0.00 to +0.04) |
| Hurt by tackles, per game | 2.21 (2.17–2.26) | 1.64 (1.61–1.67) | −0.57 (−0.62 to −0.53) |
| Hurt by physical attacks, per game | 3.92 (3.87–3.97) | 3.79 (3.74–3.84) | −0.12 (−0.18 to −0.07) |
| Physical attacks per game | 14.52 (14.46–14.58) | 14.05 (13.99–14.11) | −0.47 (−0.54 to −0.40) |
| Physical attacks won | 45.6% (45.2–45.9) | 45.1% (44.7–45.5) | −0.5 (−0.9 to −0.0) points |
| Ball drops per game | 6.62 (6.55–6.68) | 6.33 (6.27–6.39) | −0.28 (−0.36 to −0.21) |
| Turns in the penalty box per game | 1.94 (1.88–2.00) | 1.68 (1.63–1.74) | −0.25 (−0.32 to −0.18) |
| Power plays per game | 0.18 (0.17–0.19) | 0.16 (0.15–0.17) | −0.02 (−0.04 to −0.01) |
| Knockdowns per game | 9.59 (9.49–9.68) | 8.72 (8.64–8.81) | −0.86 (−0.97 to −0.76) |
| Knockdowns that hurt | 46.8% (46.3–47.2) | 48.0% (47.5–48.5) | +1.3 (+0.7 to +1.8) points |
| Shaken per game | 4.55 (4.50–4.61) | 4.44 (4.39–4.50) | −0.11 (−0.18 to −0.04) |
| Injured per game (not carried off) | 2.01 (1.97–2.05) | 2.09 (2.05–2.13) | +0.09 (+0.04 to +0.13) |
| Knocked out per game | 1.24 (1.21–1.27) | 1.30 (1.26–1.33) | +0.06 (+0.02 to +0.10) |
| Carried off per game | 0.04 (0.03–0.04) | 0.03 (0.02–0.03) | −0.01 (−0.01 to −0.00) |
| Fouls (dirty plays) per game | 1.27 (1.25–1.28) | 1.38 (1.37–1.40) | +0.12 (+0.10 to +0.14) |
| Fouls caught | 15.9% (15.0–16.9) | 16.4% (15.6–17.3) | +0.5 (−0.6 to +1.5) points |
| Sent off per game | 0.20 (0.19–0.21) | 0.23 (0.21–0.24) | +0.03 (+0.01 to +0.04) |

