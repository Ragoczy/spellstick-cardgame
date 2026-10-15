# Escalating penalties (Paul, 2026-10-15)

Each team has a penalty risk, starting at 1. An attack is penalized when the attacker's die and the
penalty die both show the risk or lower. Each physical attack raises the risk by 1 (after its own
check); each of the team's turns without one lowers it by 1, never below 1. So a first attack is the
old 1-and-1 (1 in 36), a second in a row needs both dice at 2 or lower (1 in 9), a third at 3 or
lower (1 in 4). This is now the rule (`penaltyEscalation`), with cards in hand.

## Results, 5,000 games each

| Version | Attacks | Penalties | Box turns | Real injuries | Knocked out + carried off | Goals | Spells | Turns |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cards in hand, old penalty | 7.6 | 0.17 | 0.34 | 2.86 | 1.04 | 2.05 | 13.5 | 50.7 |
| **Cards in hand, escalating** (the rule now) | 7.6 | 0.27 | 0.52 | 2.87 | 1.06 | 2.04 | 13.5 | 50.8 |
| Blind, no limit, old penalty | 18.8 | 0.47 | 0.97 | 3.81 | 1.51 | 1.72 | 11.3 | 52.7 |
| Blind, no limit, escalating | 17.5 | 1.30 | 2.66 | 3.70 | 1.46 | 1.80 | 11.6 | 52.2 |
| Blind, 8 per team, escalating | 14.5 | 0.94 | 1.93 | 3.45 | 1.33 | 1.87 | 12.3 | 51.8 |
| Target | | 0.1–0.5 | | at least 3.5 | at most 1.5 | 1.84–3.06 | at least 15.7 | 30–50 |

Full tables: this file (cards in hand), `sim-2026-10-15-v17c2-escalation-blind.md`, and
`sim-2026-10-15-v17c2-blind-limit8-escalation.md`.

## What it shows

- **Escalation adds penalties more than it stops attacks.** The computer still finds a stolen ball
  worth a 1-in-4 risk, so with cards in hand penalties rise from 0.17 to 0.27 a game and nothing
  else moves. With blind draw, attacks fall only from 18.8 to 17.5, and penalties pass the 0.5 limit.
- **The attack limit is what holds blind draw back.** Blind with 8 per team and escalation comes
  close on both sides of the trade (real injuries 3.45 against 3.5, goals 1.87 against 1.84), but
  penalties run at about one a game.

## Also fixed

- **A goalie with nobody to clear to, at the start of a turn, froze the game.** The Draw step skipped
  the goalie-clears check, so with both defenders in the penalty box the team had no legal action.
  The simulator found it in 16 of 10,000 games; the Draw step now goes through the same check (a
  faceoff). Test added.
- **The computer's penalty cost now depends on the row:** a turn with an empty spot costs more on
  defense (nobody to stop the forward) than up front.

---

# Comparison: Escalating penalties, cards in hand, 2026-10-15

Made by `npm run sim-compare`: 5000 computer-vs-computer games per run (seed block 1), 2 lanes, card set 0.16-prototype. Took 124 s on 8 workers.

- Before: config changes `penaltyEscalation=false`; cards data/cards.prototype.json.
- After (Escalating penalties, cards in hand): config changes `penaltyEscalation=true`; cards data/cards.prototype.json.

Every result has a 95% interval: if the same run were repeated with new seeds, the result would land in that range 19 times out of 20. Both runs play the same seeds (the same deals and first player), and each change is measured seed by seed, so a small real change still shows. A target is "Yes" when the whole interval is inside it, "No" when the whole interval is outside it, and "Borderline" when luck could put it either side.

## Health

No crashes, no impossible states, and no game hit the turn cap.

## Targets

| Measure | Before | After | Change (95% interval) | Target | After meets it? |
| --- | --- | --- | --- | --- | --- |
| Turns per game | 50.7 (50.5–51.0) | 50.8 (50.6–51.1) | +0.1 (−0.1 to +0.3) | 30–50 | No |
| Goals per game | 2.05 (2.02–2.09) | 2.04 (2.00–2.08) | −0.01 (−0.04 to +0.01) | 1.84–3.06 (v0.16 ±25%) | Yes |
| Spells cast per game | 13.5 (13.4–13.6) | 13.5 (13.4–13.6) | +0.0 (−0.1 to +0.1) | at least 15.7 | No |
| Players hurt per game (any result) | 5.67 (5.60–5.73) | 5.69 (5.62–5.75) | +0.02 (−0.02 to +0.06) | 4–8 | Yes |
| Shaken share of those | 49.6% (49.0–50.1) | 49.5% (48.9–50.0) | −0.1 (−0.4 to +0.3) points | at least 50% | Borderline |
| Real injuries per game (Injured, knocked out, carried off) | 2.86 (2.81–2.90) | 2.87 (2.83–2.92) | +0.02 (−0.01 to +0.04) | at least 3.5 | No |
| Carried off + knocked out per game | 1.04 (1.01–1.07) | 1.06 (1.04–1.09) | +0.02 (+0.00 to +0.04) | at most 1.5 | Yes |
| Team that suffered the first carry-off or knockout lost | 51.0% (49.2–52.7) | 50.6% (48.9–52.3) | −0.4 (−1.6 to +0.9) points | at most 60% | Yes |
| Penalties per game | 0.17 (0.16–0.18) | 0.27 (0.25–0.28) | +0.10 (+0.09 to +0.11) | 0.1–0.5 | Yes |
| Unanswered Shield scores (before the dice, over every shot) | 59.7% (59.4–60.1) | 59.6% (59.3–60.0) | −0.1 (−0.2 to +0.1) points | under 75% | Yes |

Unanswered Shield on a Shot 5 shooter against a Save 6 goalie, exactly, before the dice: before 58.3%, escalating penalties, cards in hand 58.3% (target: under 75%).

## Other measures

| Measure | Before | After | Change (95% interval) |
| --- | --- | --- | --- |
| First player wins (draws count half) | 51.1% (49.7–52.5) | 51.4% (50.0–52.8) | +0.3 (−0.6 to +1.2) points |
| Team A wins (draws count half) | 49.0% (47.7–50.4) | 49.9% (48.6–51.3) | +0.9 (−0.0 to +1.8) points |
| Draws | 1.3% (1.0–1.7) | 1.3% (1.0–1.6) | −0.1 (−0.3 to +0.1) points |
| Shots per game | 5.87 (5.82–5.92) | 5.88 (5.84–5.93) | +0.01 (−0.02 to +0.04) |
| Shots that score | 35.0% (34.4–35.6) | 34.7% (34.1–35.3) | −0.3 (−0.7 to +0.1) points |
| Tackles per game | 11.60 (11.49–11.71) | 11.63 (11.52–11.74) | +0.03 (−0.04 to +0.10) |
| Tackles won | 35.6% (35.2–36.1) | 35.8% (35.4–36.2) | +0.2 (−0.1 to +0.5) points |
| Hits per game | 1.63 (1.59–1.66) | 1.64 (1.61–1.68) | +0.02 (−0.00 to +0.04) |
| Hits that land | 69.2% (68.2–70.2) | 69.8% (68.8–70.8) | +0.5 (−0.2 to +1.3) points |
| Hurt by hits, per game | 1.13 (1.10–1.15) | 1.15 (1.12–1.18) | +0.02 (+0.00 to +0.04) |
| Hurt by dirty plays, per game | 0.84 (0.82–0.86) | 0.84 (0.82–0.86) | −0.01 (−0.02 to +0.01) |
| Hurt by tackles, per game | 1.35 (1.32–1.38) | 1.36 (1.33–1.39) | +0.01 (−0.01 to +0.03) |
| Hurt by physical attacks, per game | 2.35 (2.31–2.39) | 2.34 (2.30–2.38) | −0.01 (−0.03 to +0.01) |
| Physical attacks per game | 7.63 (7.58–7.68) | 7.59 (7.54–7.65) | −0.04 (−0.07 to −0.00) |
| Physical attacks won | 51.4% (50.9–51.9) | 51.5% (51.0–52.0) | +0.1 (−0.2 to +0.4) points |
| Ball drops per game | 3.86 (3.82–3.91) | 3.86 (3.81–3.90) | −0.01 (−0.03 to +0.02) |
| Turns in the penalty box per game | 0.34 (0.31–0.36) | 0.52 (0.49–0.55) | +0.19 (+0.16 to +0.21) |
| Power plays per game | 0.03 (0.03–0.04) | 0.06 (0.05–0.06) | +0.02 (+0.02 to +0.03) |
| Knockdowns per game | 7.98 (7.89–8.07) | 8.00 (7.91–8.09) | +0.02 (−0.04 to +0.07) |
| Knockdowns that hurt | 41.9% (41.4–42.4) | 41.9% (41.4–42.3) | −0.1 (−0.4 to +0.2) points |
| Shaken per game | 2.81 (2.77–2.85) | 2.81 (2.77–2.86) | +0.00 (−0.02 to +0.03) |
| Injured per game (not carried off) | 1.81 (1.78–1.85) | 1.81 (1.77–1.84) | −0.01 (−0.03 to +0.02) |
| Knocked out per game | 1.02 (0.99–1.04) | 1.03 (1.01–1.06) | +0.02 (+0.00 to +0.04) |
| Carried off per game | 0.03 (0.02–0.03) | 0.03 (0.02–0.03) | +0.00 (−0.00 to +0.01) |
| Fouls (dirty plays) per game | 1.19 (1.17–1.21) | 1.19 (1.17–1.21) | −0.00 (−0.01 to +0.01) |
| Fouls caught | 16.3% (15.3–17.2) | 16.3% (15.4–17.3) | +0.1 (−0.5 to +0.7) points |
| Sent off per game | 0.19 (0.18–0.20) | 0.19 (0.18–0.21) | +0.00 (−0.01 to +0.01) |

