import { describe, expect, it } from 'vitest';
import { PATH_STYLE, tileOutline, type Joins } from '../src/render/shape';

const none: Joins = { n: false, e: false, s: false, w: false };
const style = { margin: 0.1, chamfer: 0.2, fillet: 0.05 };
const round = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`);

describe('tile outlines', () => {
  it('make a lone tile an octagon inside its margin', () => {
    const pts = tileOutline(none, style);
    expect(pts).toHaveLength(8);
    for (const [x, y] of pts) {
      expect(Math.min(x, y)).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(Math.max(x, y)).toBeLessThanOrEqual(0.9 + 1e-9);
    }
    // Symmetric under a quarter turn.
    const turned = pts.map(([x, y]): [number, number] => [1 - y, x]);
    expect(round(turned).sort()).toEqual(round(pts).sort());
  });

  it('run a straight stretch from edge to edge as a band', () => {
    const pts = tileOutline({ ...none, e: true, w: true }, style);
    expect(round(pts)).toEqual(['0.00,0.10', '1.00,0.10', '1.00,0.90', '0.00,0.90']);
  });

  it('cap a dead end with two cut corners', () => {
    const pts = tileOutline({ ...none, w: true }, style);
    expect(round(pts)).toEqual([
      '0.00,0.10',
      '0.70,0.10',
      '0.90,0.30',
      '0.90,0.70',
      '0.70,0.90',
      '0.00,0.90',
    ]);
  });

  it('cut the outer corner of a bend and soften the inner one', () => {
    // West and south join: the north-east corner is outside, the south-west inside.
    const pts = round(tileOutline({ ...none, w: true, s: true }, style));
    expect(pts).toContain('0.70,0.10');
    expect(pts).toContain('0.90,0.30');
    expect(pts).toContain('0.05,0.90');
    expect(pts).toContain('0.10,0.95');
    expect(pts).not.toContain('0.10,0.90');
  });

  it('open a crossing into an eight-cornered shape touching all four edges', () => {
    const pts = tileOutline({ n: true, e: true, s: true, w: true }, style);
    expect(pts).toHaveLength(16);
    for (const edge of [0, 1]) {
      expect(pts.filter(([x]) => x === edge)).toHaveLength(2);
      expect(pts.filter(([, y]) => y === edge)).toHaveLength(2);
    }
  });

  it('fill the whole tile where a plaza is surrounded', () => {
    const pts = tileOutline({ n: true, e: true, s: true, w: true }, PATH_STYLE.plaza!);
    expect(round(pts)).toEqual(['0.00,0.00', '1.00,0.00', '1.00,1.00', '0.00,1.00']);
  });

  it('never fills in more than the margin allows', () => {
    const pts = tileOutline(
      { ...none, n: true, w: true },
      { margin: 0.05, chamfer: 0.2, fillet: 0.5 },
    );
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('has a style for every kind of path and for canals', () => {
    for (const kind of ['alley', 'street', 'plaza', 'bridge', 'canal']) {
      const s = PATH_STYLE[kind]!;
      expect(s.margin).toBeGreaterThanOrEqual(0);
      expect(s.margin + s.chamfer).toBeLessThanOrEqual(0.5);
    }
  });
});
