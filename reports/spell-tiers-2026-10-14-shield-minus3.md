# Spell power tiers, 2026-10-14 (shield-minus3)

Only some spells (effects: shield, boost), with config changes: shieldEffect=minus, shieldAmount=3. The tiers in the card data are unchanged.

Made by `npm run spell-tiers`: 2000 computer games per spell. The test team swaps four rarely-cast spells (Scrying Bowl, Precognition, Mend, Blast Shot) for 4 copies of the spell; the other team keeps Team A's 16. "Edge" is how many more points in 100 games the test team scores than with no swap (a win is 1, a draw ½). The control team scored 50.1. Luck moves one spell's edge by about 1.3 points either way (one standard error); an effect's average over several spells is steadier, and an edge under about 2 is no clear edge at all.

## Legendary (tier 1)

Dominant: wins contests outright or nearly so, in almost any contest.

| Effect | Average edge | Spells (edge, casts per game with 4 copies) |
| --- | --- | --- |
| shield | +22.0 | Bad Luck (+24.4, 3.02), Slow (+23.9, 3.77), Ward (+23.2, 2.99), Mist Veil (+23.1, 2.98), Freeze in Place (+22.7, 2.98), Evil Eye (+22.2, 3.00), Ice Wall (+22.1, 3.72), Stone Skin (+21.9, 2.95), Hex (+21.6, 2.98), Mesmerize (+20.8, 2.96), Blinding Flash (+20.6, 3.01), Wither (+20.4, 2.96), Dazzle (+18.9, 2.96) |
| boost +2 | +20.3 | Fresh Legs (+21.6, 2.89), Second Wind (+20.0, 3.60), Empower (+19.4, 2.91) |
| boost +3, only shoot | +20.1 | Pinpoint (+20.1, 1.85) |
| boost +3, only save | +15.7 | Turn Aside (+15.7, 0.77) |

## Rare (tier 2)

Strong: a big swing in a contest that comes up often, or a steal that wins the ball.

| Effect | Average edge | Spells (edge, casts per game with 4 copies) |
| --- | --- | --- |
| boost +3, only intercept | +10.4 | Quicken (+10.4, 1.79) |

## Uncommon (tier 3)

Useful: helps, but less often or by less.

| Effect | Average edge | Spells (edge, casts per game with 4 copies) |
| --- | --- | --- |
| boost +3, only tackle | +6.3 | Brute Strength (+6.3, 2.06) |
| boost +3, only receive | +3.9 | Burst of Speed (+5.0, 1.55), Leap (+2.8, 1.54) |
| boost +3, only evade | +3.7 | Danger Sense (+4.1, 0.96), Light as Air (+3.9, 0.97), Sidestep (+3.1, 0.93) |
| boost +3, only faceoff | +2.5 | Low Stance (+2.5, 0.84) |

## Common (tier 4)

No clear edge: no better than the rarely-cast spells they replaced, as the computer plays them.

| Effect | Average edge | Spells (edge, casts per game with 4 copies) |
| --- | --- | --- |
| boost +3, only resist | +0.0 | Shrug It Off (+0.0, 0.43) |
