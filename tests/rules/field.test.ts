// RULES.md "The field" and the pass directions in "Pass".
import { describe, expect, it } from 'vitest';
import { absoluteRow, opposite, passTargets, type FieldPos } from '../../src/engine/field';
import { LANE_COUNTS } from '../helpers';

const count = (targets: FieldPos[], area: string) => targets.filter((t) => t.area === area).length;

describe('the field', () => {
  it('has Team A defending row 1 and Team B defending row 5', () => {
    expect(absoluteRow('A', { area: 'goal' })).toBe(1);
    expect(absoluteRow('A', { area: 'defense', lane: 0 })).toBe(2);
    expect(absoluteRow('A', { area: 'forward', lane: 0 })).toBe(4);
    expect(absoluteRow('B', { area: 'goal' })).toBe(5);
    expect(absoluteRow('B', { area: 'forward', lane: 0 })).toBe(2);
  });

  it("puts each team's forward in the same spot as the other team's defender, lane for lane", () => {
    expect(opposite({ area: 'forward', lane: 1 })).toEqual({ area: 'defense', lane: 1 });
    expect(opposite({ area: 'defense', lane: 0 })).toEqual({ area: 'forward', lane: 0 });
    expect(opposite({ area: 'midfield', lane: 2 })).toEqual({ area: 'midfield', lane: 2 });
    expect(absoluteRow('A', { area: 'forward', lane: 0 })).toBe(absoluteRow('B', { area: 'defense', lane: 0 }));
  });
});

describe.each(LANE_COUNTS)('pass directions (%i lanes)', (lanes) => {
  it('from midfield: same row other lanes, one row forward any lane, any row back', () => {
    const targets = passTargets({ area: 'midfield', lane: 0 }, lanes);
    expect(count(targets, 'midfield')).toBe(lanes - 1);
    expect(count(targets, 'forward')).toBe(lanes);
    expect(count(targets, 'defense')).toBe(lanes);
    expect(targets).not.toContainEqual({ area: 'midfield', lane: 0 });
  });

  it('from a forward: nothing further forward, but sideways and any row back', () => {
    const targets = passTargets({ area: 'forward', lane: lanes - 1 }, lanes);
    expect(count(targets, 'forward')).toBe(lanes - 1);
    expect(count(targets, 'midfield')).toBe(lanes);
    expect(count(targets, 'defense')).toBe(lanes);
  });

  it('from defense: never back to the goalie', () => {
    const targets = passTargets({ area: 'defense', lane: 0 }, lanes);
    expect(count(targets, 'defense')).toBe(lanes - 1);
    expect(count(targets, 'midfield')).toBe(lanes);
    expect(count(targets, 'forward')).toBe(0);
    expect(targets.every((t) => (t.area as string) !== 'goal')).toBe(true);
  });

  it('from the goalie: any defender', () => {
    const targets = passTargets({ area: 'goal' }, lanes);
    expect(targets).toHaveLength(lanes);
    expect(targets.every((t) => t.area === 'defense')).toBe(true);
  });

  it('a long pass can also skip one row forward', () => {
    expect(count(passTargets({ area: 'defense', lane: 0 }, lanes, true), 'forward')).toBe(lanes);
    expect(count(passTargets({ area: 'goal' }, lanes, true), 'midfield')).toBe(lanes);
  });
});
