# Spell power tiers, 2026-10-14 (shield-half)

Only some spells (effects: shield, boost), with config changes: shieldEffect=half. The tiers in the card data are unchanged.

Made by `npm run spell-tiers`: 2000 computer games per spell. The test team swaps four rarely-cast spells (Scrying Bowl, Precognition, Mend, Blast Shot) for 4 copies of the spell; the other team keeps Team A's 16. "Edge" is how many more points in 100 games the test team scores than with no swap (a win is 1, a draw ½). The control team scored 49.6. Luck moves one spell's edge by about 1.3 points either way (one standard error); an effect's average over several spells is steadier, and an edge under about 2 is no clear edge at all.

## Legendary (tier 1)

Dominant: wins contests outright or nearly so, in almost any contest.

| Effect | Average edge | Spells (edge, casts per game with 4 copies) |
| --- | --- | --- |
| boost +3, only shoot | +22.3 | Pinpoint (+22.3, 1.85) |
| shield | +21.4 | Bad Luck (+22.7, 2.87), Freeze in Place (+22.6, 2.85), Ward (+22.4, 2.82), Mesmerize (+21.6, 2.85), Slow (+21.6, 3.54), Mist Veil (+21.5, 2.82), Ice Wall (+21.5, 3.58), Hex (+21.5, 2.85), Stone Skin (+21.3, 2.86), Evil Eye (+21.0, 2.84), Wither (+20.6, 2.83), Dazzle (+20.6, 2.81), Blinding Flash (+19.7, 2.88) |
| boost +2 | +20.5 | Empower (+21.4, 2.93), Fresh Legs (+20.6, 2.90), Second Wind (+19.4, 3.60) |
| boost +3, only save | +15.8 | Turn Aside (+15.8, 0.76) |

## Rare (tier 2)

Strong: a big swing in a contest that comes up often, or a steal that wins the ball.

| Effect | Average edge | Spells (edge, casts per game with 4 copies) |
| --- | --- | --- |
| boost +3, only intercept | +11.1 | Quicken (+11.1, 1.79) |

## Uncommon (tier 3)

Useful: helps, but less often or by less.

| Effect | Average edge | Spells (edge, casts per game with 4 copies) |
| --- | --- | --- |
| boost +3, only tackle | +6.6 | Brute Strength (+6.6, 2.09) |
| boost +3, only receive | +6.2 | Burst of Speed (+6.5, 1.58), Leap (+6.0, 1.56) |
| boost +3, only evade | +5.1 | Danger Sense (+5.8, 0.95), Sidestep (+5.2, 0.98), Light as Air (+4.5, 0.97) |
| boost +3, only faceoff | +3.2 | Low Stance (+3.2, 0.87) |

## Common (tier 4)

No clear edge: no better than the rarely-cast spells they replaced, as the computer plays them.

| Effect | Average edge | Spells (edge, casts per game with 4 copies) |
| --- | --- | --- |
| boost +3, only resist | −0.2 | Shrug It Off (−0.2, 0.43) |
