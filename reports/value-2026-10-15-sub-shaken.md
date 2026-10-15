# What a card is worth, 2026-10-15

Rule what-if: forcedSubShaken=true.

Made by `npm run measure-value` (PLAN.md, Phase f). For each change, one team gets it and plays an unchanged team; each of 5000 seeds is played twice, with the changed team as A and then as B, so an unchanged team would score exactly 50%. **Edge** is how many more points in 100 games the changed team scores (a win is 1, a draw ½), with a 95% interval. **Per point, per card** spreads the edge over the cards that got the change: it's what one point of that stat on one card adds, and what a card's cost adds up.

| Change | Edge (95% interval) | Cards that got it | Per point, per card (95% interval) |
| --- | --- | --- | --- |
| −1 Toughness | −0.9 (−1.6 to −0.2) | 22 | +0.040 (+0.007 to +0.072) |
| Heavy hands (every field player) | −1.4 (−2.2 to −0.7) | 22 | −0.065 (−0.100 to −0.030) |
| Sturdy (every field player) | −1.5 (−2.3 to −0.7) | 22 | −0.068 (−0.104 to −0.032) |
