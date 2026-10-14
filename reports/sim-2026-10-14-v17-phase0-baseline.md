# Simulation baseline, 2026-10-14

Made by `npm run sim-compare`: 10000 computer-vs-computer games per run (seed block 1), 2 lanes, card set 0.16-prototype. Took 155 s on 20 workers.

- Before: config changes none; cards data/cards.prototype.json.

Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.

## Health

No crashes, no impossible states, and no game hit the turn cap.

## Targets

| Measure | Result (95% interval) | Target | Met? |
| --- | --- | --- | --- |
| Turns per game | 50.3 (50.2–50.5) | 30–50 | No |
| Goals per game | 2.40 (2.37–2.42) | 1.84–3.06 (v0.16 ±25%) | Yes |
| Spells cast per game | 15.8 (15.7–15.8) | at least 15.7 | Borderline |
| Players hurt per game (any result) | 2.80 (2.77–2.82) | 4–8 | No |
| Shaken share of those | 0.0% (0.0–0.0) | at least 50% | No |
| Real injuries per game (Injured, knocked out, carried off) | 2.80 (2.77–2.82) | at least 3.5 | No |
| Carried off + knocked out per game | 0.22 (0.21–0.23) | at most 1.5 | Yes |
| Team that suffered the first carry-off or knockout lost | 51.8% (49.6–54.0) | at most 60% | Yes |
| Penalties per game | 0.00 (0.00–0.00) | 0.1–0.5 | No |
| Unanswered Shield scores (before the dice, over every shot) | 91.9% (91.8–92.0) | under 75% | No |

Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: before 97.2% (target: under 75%).

## Other measures

| Measure | Result (95% interval) |
| --- | --- |
| First player wins (draws count half) | 49.4% (48.4–50.4) |
| Team A wins (draws count half) | 51.2% (50.3–52.2) |
| Draws | 1.2% (1.0–1.4) |
| Shots per game | 7.29 (7.26–7.32) |
| Shots that score | 32.9% (32.5–33.3) |
| Tackles per game | 13.59 (13.50–13.68) |
| Tackles won | 33.2% (32.9–33.5) |
| Hits per game | 2.82 (2.80–2.85) |
| Hits that land | 65.1% (64.6–65.7) |
| Hurt by hits, per game | 1.84 (1.82–1.86) |
| Hurt by dirty plays, per game | 0.96 (0.95–0.97) |
| Shaken per game | 0.00 (0.00–0.00) |
| Injured per game (not carried off) | 2.58 (2.55–2.60) |
| Knocked out per game | 0.00 (0.00–0.00) |
| Carried off per game | 0.22 (0.21–0.23) |
| Fouls (dirty plays) per game | 0.98 (0.97–1.00) |
| Fouls caught | 0.0% (0.0–0.0) |
| Sent off per game | 0.00 (0.00–0.00) |

