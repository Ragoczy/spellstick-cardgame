# The rule: blind physical draw, 8 attacks per team, escalating penalties

Paul's call (2026-10-15). Against phase c2 as first built (cards in hand), same 5,000 seeds. Real injuries 2.87 -> 3.45 (target 3.5, just short), goals 2.04 -> 1.87 (floor 1.84, just above), penalties 0.94 a game (accepted; target now 0.1-1.2), spells cast 12.3 and turns 51.8 still miss. Since this run, Hooking, Clothesline, Stamp, Late Hit, and Elbow are printed as plain attacks; under blind draw they already played that way, so the numbers don't change.

---

# Comparison: Blind draw, 8 per team, escalating penalties, 2026-10-15

Made by `npm run sim-compare`: 5000 computer-vs-computer games per run (seed block 1), 2 lanes, card set 0.16-prototype. Took 209 s on 8 workers.

- Before: config changes none; cards data/cards.prototype.json.
- After (Blind draw, 8 per team, escalating penalties): config changes `physicalDraw=blind`, `physicalAttackLimit=8`; cards data/cards.prototype.json.

Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. Both runs play the same seeds (the same deals and first player), and each change is measured seed by seed, so a small real change still shows. A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.

## Health

No crashes, no impossible states, and no game hit the turn cap.

## Targets

| Measure | Before | After | Change (95% interval) | Target | After meets it? |
| --- | --- | --- | --- | --- | --- |
| Turns per game | 50.8 (50.6–51.1) | 51.8 (51.6–52.0) | +0.9 (+0.6 to +1.2) | 30–50 | No |
| Goals per game | 2.04 (2.00–2.08) | 1.87 (1.84–1.91) | −0.17 (−0.21 to −0.12) | 1.84–3.06 (v0.16 ±25%) | Yes |
| Spells cast per game | 13.5 (13.4–13.6) | 12.3 (12.2–12.4) | −1.2 (−1.3 to −1.1) | at least 15.7 | No |
| Players hurt per game (any result) | 5.69 (5.62–5.75) | 6.69 (6.62–6.76) | +1.01 (+0.92 to +1.10) | 4–8 | Yes |
| Shaken share of those | 49.5% (48.9–50.0) | 48.5% (48.0–49.1) | −0.9 (−1.7 to −0.2) points | at least 50% | No |
| Real injuries per game (Injured, knocked out, carried off) | 2.87 (2.83–2.92) | 3.45 (3.40–3.50) | +0.57 (+0.51 to +0.63) | at least 3.5 | No |
| Carried off + knocked out per game | 1.06 (1.04–1.09) | 1.33 (1.30–1.36) | +0.26 (+0.22 to +0.31) | at most 1.5 | Yes |
| Team that suffered the first carry-off or knockout lost | 50.6% (48.9–52.3) | 50.8% (49.2–52.4) | +0.2 (−2.2 to +2.6) points | at most 60% | Yes |
| Penalties per game | 0.27 (0.25–0.28) | 0.94 (0.91–0.97) | +0.67 (+0.64 to +0.70) | 0.1–0.5 | No |
| Unanswered Shield scores (before the dice, over every shot) | 59.6% (59.3–60.0) | 59.4% (59.1–59.8) | −0.2 (−0.5 to +0.1) points | under 75% | Yes |

Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: before 58.3%, blind draw, 8 per team, escalating penalties 58.3% (target: under 75%).

## Other measures

| Measure | Before | After | Change (95% interval) |
| --- | --- | --- | --- |
| First player wins (draws count half) | 51.4% (50.0–52.8) | 50.6% (49.2–52.0) | −0.8 (−2.6 to +1.0) points |
| Team A wins (draws count half) | 49.9% (48.6–51.3) | 50.1% (48.8–51.5) | +0.2 (−1.6 to +2.0) points |
| Draws | 1.3% (1.0–1.6) | 1.4% (1.1–1.7) | +0.1 (−0.3 to +0.6) points |
| Shots per game | 5.88 (5.84–5.93) | 5.32 (5.27–5.37) | −0.56 (−0.62 to −0.50) |
| Shots that score | 34.7% (34.1–35.3) | 35.2% (34.6–35.8) | +0.5 (−0.3 to +1.3) points |
| Tackles per game | 11.63 (11.52–11.74) | 7.99 (7.90–8.08) | −3.64 (−3.77 to −3.51) |
| Tackles won | 35.8% (35.4–36.2) | 43.3% (42.7–43.8) | +7.5 (+6.8 to +8.1) points |
| Hits per game | 1.64 (1.61–1.68) | 0.90 (0.88–0.93) | −0.74 (−0.78 to −0.71) |
| Hits that land | 69.8% (68.8–70.8) | 73.8% (72.5–75.1) | +4.0 (+2.4 to +5.6) points |
| Hurt by hits, per game | 1.15 (1.12–1.18) | 0.67 (0.64–0.69) | −0.48 (−0.52 to −0.45) |
| Hurt by dirty plays, per game | 0.84 (0.82–0.86) | 0.85 (0.83–0.87) | +0.01 (−0.01 to +0.03) |
| Hurt by tackles, per game | 1.36 (1.33–1.39) | 1.17 (1.14–1.21) | −0.19 (−0.23 to −0.14) |
| Hurt by physical attacks, per game | 2.34 (2.30–2.38) | 4.01 (3.96–4.06) | +1.67 (+1.61 to +1.73) |
| Physical attacks per game | 7.59 (7.54–7.65) | 14.52 (14.46–14.58) | +6.92 (+6.85 to +7.00) |
| Physical attacks won | 51.5% (51.0–52.0) | 47.9% (47.5–48.2) | −3.7 (−4.3 to −3.1) points |
| Ball drops per game | 3.86 (3.81–3.90) | 6.95 (6.89–7.01) | +3.09 (+3.02 to +3.17) |
| Turns in the penalty box per game | 0.52 (0.49–0.55) | 1.93 (1.87–1.99) | +1.41 (+1.34 to +1.47) |
| Power plays per game | 0.06 (0.05–0.06) | 0.18 (0.17–0.19) | +0.12 (+0.11 to +0.14) |
| Knockdowns per game | 8.00 (7.91–8.09) | 10.38 (10.28–10.48) | +2.38 (+2.26 to +2.51) |
| Knockdowns that hurt | 41.9% (41.4–42.3) | 45.3% (44.8–45.7) | +3.4 (+2.8 to +4.0) points |
| Shaken per game | 2.81 (2.77–2.86) | 3.25 (3.20–3.30) | +0.43 (+0.37 to +0.50) |
| Injured per game (not carried off) | 1.81 (1.77–1.84) | 2.12 (2.08–2.15) | +0.31 (+0.26 to +0.36) |
| Knocked out per game | 1.03 (1.01–1.06) | 1.29 (1.26–1.32) | +0.25 (+0.21 to +0.29) |
| Carried off per game | 0.03 (0.02–0.03) | 0.04 (0.04–0.05) | +0.01 (+0.01 to +0.02) |
| Fouls (dirty plays) per game | 1.19 (1.17–1.21) | 1.16 (1.14–1.18) | −0.03 (−0.05 to −0.01) |
| Fouls caught | 16.3% (15.4–17.3) | 16.1% (15.2–17.1) | −0.2 (−1.5 to +1.0) points |
| Sent off per game | 0.19 (0.18–0.21) | 0.19 (0.18–0.20) | −0.01 (−0.02 to +0.01) |

