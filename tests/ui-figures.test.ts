// Player figures (src/ui/PlayerFigure.tsx) and the element palette in styles.css.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prototypeCards } from '../src/data/prototype';
import { FIGURE_VIEWBOX, figureParts, type FigurePosition } from '../src/ui/PlayerFigure';

const POSITIONS: FigurePosition[] = ['forward', 'midfield', 'defense', 'goal'];
const css = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

describe('element palette', () => {
  it('has a color and a class for every element in the card data', () => {
    for (const element of prototypeCards.elements) {
      expect(css, `--el-${element}`).toMatch(new RegExp(`--el-${element}:\\s*#`));
      expect(css, `.el-${element}`).toMatch(new RegExp(`\\.el-${element} \\{ color: var\\(--el-${element}\\); \\}`));
    }
    expect(css).toMatch(/\.el-none \{ color: var\(--el-none\); \}/);
  });

  it('greys out injured figures', () => {
    expect(css).toMatch(/\.figure\.injured \{[^}]*color: var\(--el-none\)/);
  });
});

describe('player figures', () => {
  it.each(POSITIONS)('%s fits inside the shared viewBox', (position) => {
    // Every part is two round ends joined by straight sides, so the round ends bound it.
    for (const { a, ra, b, rb } of figureParts(position)) {
      for (const [[x, y], r] of [[a, ra], [b, rb]] as const) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(x - r).toBeGreaterThanOrEqual(0);
        expect(y - r).toBeGreaterThanOrEqual(0);
        expect(x + r).toBeLessThanOrEqual(FIGURE_VIEWBOX);
        expect(y + r).toBeLessThanOrEqual(FIGURE_VIEWBOX);
      }
    }
  });

  it('gives every position its own pose', () => {
    const shapes = POSITIONS.map((p) => JSON.stringify(figureParts(p)));
    expect(new Set(shapes).size).toBe(POSITIONS.length);
  });
});
