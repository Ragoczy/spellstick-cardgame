# What a card is worth, 2026-10-15

Made by `npm run measure-value` (PLAN.md, Phase f). For each change, one team gets it and plays an unchanged team; each of 10000 seeds is played twice, with the changed team as A and then as B, so an unchanged team would score exactly 50%. **Edge** is how many more points in 100 games the changed team scores (a win is 1, a draw ½), with a 95% interval. **Per point, per card** spreads the edge over the cards that got the change: it's what one point of that stat on one card adds, and what a card's cost adds up.

| Change | Edge (95% interval) | Cards that got it | Per point, per card (95% interval) |
| --- | --- | --- | --- |

## By type group

+1 to one stat on just one type group's field players. The edge is divided by that group's expected count among the 22 field players dealt (about 7.7).

| Stat | Runners and Strikers | Playmakers and All-rounders | Anchors and Stoppers |
| --- | --- | --- | --- |
| Speed | +1.170 (+1.089 to +1.251) | +0.530 (+0.443 to +0.617) | +0.373 (+0.288 to +0.459) |
| Shot | +1.253 (+1.172 to +1.333) | +0.520 (+0.440 to +0.600) | +0.161 (+0.100 to +0.222) |
| Defense | +0.370 (+0.292 to +0.449) | +0.483 (+0.396 to +0.569) | +0.599 (+0.512 to +0.687) |
| Faceoff | +0.129 (+0.055 to +0.203) | +0.198 (+0.115 to +0.281) | +0.029 (−0.041 to +0.099) |

Per point, per card, with a 95% interval.
