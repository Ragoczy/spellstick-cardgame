# What a card is worth, 2026-10-15

Made by `npm run measure-value` (PLAN.md, Phase f). For each change, one team gets it and plays an unchanged team; each of 10000 seeds is played twice, with the changed team as A and then as B, so an unchanged team would score exactly 50%. **Edge** is how many more points in 100 games the changed team scores (a win is 1, a draw ½), with a 95% interval. **Per point, per card** spreads the edge over the cards that got the change: it's what one point of that stat on one card adds, and what a card's cost adds up.

| Change | Edge (95% interval) | Cards that got it | Per point, per card (95% interval) |
| --- | --- | --- | --- |

## By type group

+1 to one stat on just one type group's field players. The edge is divided by that group's expected count among the 22 field players dealt (about 7.7).

| Stat | Runners and Strikers | Playmakers and All-rounders | Anchors and Stoppers |
| --- | --- | --- | --- |
| Speed | +1.097 (+1.016 to +1.178) | +0.492 (+0.405 to +0.579) | +0.405 (+0.319 to +0.491) |
| Shot | +1.184 (+1.104 to +1.265) | +0.577 (+0.496 to +0.658) | +0.127 (+0.067 to +0.187) |
| Defense | +0.407 (+0.329 to +0.485) | +0.582 (+0.495 to +0.670) | +0.705 (+0.618 to +0.793) |
| Faceoff | +0.179 (+0.104 to +0.255) | +0.208 (+0.125 to +0.291) | +0.041 (−0.027 to +0.110) |

Per point, per card, with a 95% interval.
