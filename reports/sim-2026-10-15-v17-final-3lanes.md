# Simulation baseline, 2026-10-15

Made by `npm run sim-compare`: 1000 computer-vs-computer games per run (seed block 1), 3 lanes, card set 0.17-prototype. Took 82 s on 8 workers.

- Before: config changes none; cards data/cards.prototype.json.

Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.

## Health

No crashes, no impossible states, and no game hit the turn cap.

## Targets

| Measure | Result (95% interval) | Target | Met? |
| --- | --- | --- | --- |
| Turns per game | 46.1 (45.6–46.5) | 30–50 | Yes |
| Goals per game | 1.80 (1.72–1.88) | 1.84–3.06 (v0.16 ±25%) | Borderline |
| Spells cast per game | 16.8 (16.5–17.0) | at least 15.7 | Yes |
| Players hurt per game (any result) | 7.22 (7.06–7.38) | 4–8 | Yes |
| Shaken share of those | 55.5% (54.4–56.6) | at least 50% | Yes |
| Real injuries per game (Injured, knocked out, carried off) | 3.21 (3.11–3.32) | at least 3.5 | No |
| Carried off + knocked out per game | 1.23 (1.16–1.29) | at most 1.5 | Yes |
| Team that suffered the first carry-off or knockout lost | 51.2% (47.5–54.9) | at most 60% | Yes |
| Penalties per game | 0.81 (0.75–0.87) | 0.1–1.2 | Yes |
| Unanswered Shield scores (before the dice, over every shot) | 65.0% (64.2–65.7) | under 75% | Yes |

Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: before 58.3% (target: under 75%).

## Other measures

| Measure | Result (95% interval) |
| --- | --- |
| First player wins (draws count half) | 46.9% (43.8–50.0) |
| Team A wins (draws count half) | 48.4% (45.3–51.5) |
| Draws | 0.2% (-0.1–0.5) |
| Shots per game | 4.55 (4.45–4.65) |
| Shots that score | 39.5% (37.9–41.1) |
| Tackles per game | 4.08 (3.97–4.19) |
| Tackles won | 48.1% (46.5–49.7) |
| Hits per game | 2.04 (1.96–2.12) |
| Hits that land | 71.1% (69.1–73.1) |
| Hurt by hits, per game | 1.45 (1.38–1.52) |
| Hurt by dirty plays, per game | 0.88 (0.83–0.92) |
| Hurt by tackles, per game | 1.32 (1.25–1.38) |
| Hurt by physical attacks, per game | 3.58 (3.46–3.69) |
| Physical attacks per game | 13.32 (13.17–13.47) |
| Physical attacks won | 45.1% (44.2–46.0) |
| Ball drops per game | 6.01 (5.87–6.15) |
| Turns in the penalty box per game | 1.64 (1.51–1.76) |
| Power plays per game | 0.18 (0.15–0.20) |
| Knockdowns per game | 8.04 (7.86–8.22) |
| Knockdowns that hurt | 48.3% (47.1–49.4) |
| Shaken per game | 4.01 (3.89–4.13) |
| Injured per game (not carried off) | 1.99 (1.90–2.07) |
| Knocked out per game | 1.20 (1.14–1.27) |
| Carried off per game | 0.02 (0.01–0.03) |
| Fouls (dirty plays) per game | 1.34 (1.30–1.39) |
| Fouls caught | 14.4% (12.5–16.3) |
| Sent off per game | 0.19 (0.17–0.22) |

