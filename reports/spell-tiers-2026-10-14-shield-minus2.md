# Spell power tiers, 2026-10-14 (shield-minus2)

Only some spells (effects: shield, boost), with config changes: shieldEffect=minus, shieldAmount=2. The tiers in the card data are unchanged.

Made by `npm run spell-tiers`: 2000 computer games per spell. The test team swaps four rarely-cast spells (Scrying Bowl, Precognition, Mend, Blast Shot) for 4 copies of the spell; the other team keeps Team A's 16. "Edge" is how many more points in 100 games the test team scores than with no swap (a win is 1, a draw ½). The control team scored 49.4. Luck moves one spell's edge by about 1.3 points either way (one standard error); an effect's average over several spells is steadier, and an edge under about 2 is no clear edge at all.

## Legendary (tier 1)

Dominant: wins contests outright or nearly so, in almost any contest.

| Effect | Average edge | Spells (edge, casts per game with 4 copies) |
| --- | --- | --- |
| boost +3, only shoot | +22.2 | Pinpoint (+22.2, 1.88) |
| boost +2 | +20.4 | Second Wind (+20.9, 3.60), Fresh Legs (+20.5, 2.91), Empower (+19.9, 2.94) |
| shield | +19.0 | Mist Veil (+20.6, 2.87), Ward (+19.9, 2.87), Slow (+19.8, 3.58), Mesmerize (+19.7, 2.87), Bad Luck (+19.7, 2.91), Freeze in Place (+19.5, 2.91), Evil Eye (+19.3, 2.89), Wither (+18.8, 2.86), Ice Wall (+18.4, 3.61), Stone Skin (+18.3, 2.88), Dazzle (+18.1, 2.89), Blinding Flash (+17.8, 2.92), Hex (+17.5, 2.89) |
| boost +3, only save | +16.4 | Turn Aside (+16.4, 0.75) |

## Rare (tier 2)

Strong: a big swing in a contest that comes up often, or a steal that wins the ball.

| Effect | Average edge | Spells (edge, casts per game with 4 copies) |
| --- | --- | --- |
| boost +3, only intercept | +9.5 | Quicken (+9.5, 1.82) |
| boost +3, only tackle | +7.6 | Brute Strength (+7.6, 2.08) |

## Uncommon (tier 3)

Useful: helps, but less often or by less.

| Effect | Average edge | Spells (edge, casts per game with 4 copies) |
| --- | --- | --- |
| boost +3, only receive | +5.9 | Burst of Speed (+6.7, 1.61), Leap (+5.2, 1.57) |
| boost +3, only evade | +4.7 | Danger Sense (+5.4, 0.96), Light as Air (+4.5, 0.96), Sidestep (+4.3, 0.97) |

## Common (tier 4)

No clear edge: no better than the rarely-cast spells they replaced, as the computer plays them.

| Effect | Average edge | Spells (edge, casts per game with 4 copies) |
| --- | --- | --- |
| boost +3, only faceoff | +2.0 | Low Stance (+2.0, 0.86) |
| boost +3, only resist | +0.1 | Shrug It Off (+0.1, 0.43) |
