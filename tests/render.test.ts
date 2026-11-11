import { describe, expect, it } from 'vitest';
import { parseCity } from '../src/core/city';
import { CITIES } from '../src/data/cities';
import { buildPalette, mix, parseColor, shade } from '../src/render/palette';
import { countryside, gateRoads, MARGIN, terrainAround } from '../src/render/scenery';
import { cityFrom } from './helpers';

describe('colours', () => {
  it('parses hex and rgb notation', () => {
    expect(parseColor('#ff8000')).toEqual([255, 128, 0]);
    expect(parseColor('rgb(1, 20, 255)')).toEqual([1, 20, 255]);
  });

  it('blends between two colours', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('rgb(0, 0, 0)');
    expect(mix('#000000', '#ffffff', 1)).toBe('rgb(255, 255, 255)');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
    // The result can be blended again.
    expect(mix(mix('#000000', '#ffffff', 0.5), '#000000', 1)).toBe('rgb(0, 0, 0)');
  });

  it('lightens and darkens', () => {
    expect(shade('#808080', 0)).toBe('rgb(128, 128, 128)');
    expect(parseColor(shade('#808080', 0.5))[0]).toBeGreaterThan(128);
    expect(parseColor(shade('#808080', -0.5))[0]).toBeLessThan(128);
  });
});

describe('seasonal palettes', () => {
  const [spring, summer, autumn, winter] = [0, 1, 2, 3].map((season) => buildPalette(season)) as [
    ReturnType<typeof buildPalette>,
    ReturnType<typeof buildPalette>,
    ReturnType<typeof buildPalette>,
    ReturnType<typeof buildPalette>,
  ];
  const brightness = (c: string) => parseColor(c).reduce((a, b) => a + b, 0);

  it('give every season its own meadow and foliage', () => {
    const looks = [spring, summer, autumn, winter].map((p) => `${p.meadow[0]}${p.leaf[0]}`);
    expect(new Set(looks).size).toBe(4);
  });

  it('wrap around after four seasons', () => {
    expect(buildPalette(4).meadow).toEqual(spring.meadow);
    expect(buildPalette(7).roofs).toEqual(winter.roofs);
  });

  it('put snow on roofs and ground in winter only', () => {
    expect([spring.snow, summer.snow, autumn.snow]).toEqual([0, 0, 0]);
    expect(winter.snow).toBeGreaterThan(0);
    expect(brightness(winter.roofs.tile.left)).toBeGreaterThan(brightness(summer.roofs.tile.left));
    expect(brightness(winter.ground[0]!)).toBeGreaterThan(brightness(summer.ground[0]!));
    expect(winter.bare).toBe(true);
    expect(summer.bare).toBe(false);
  });

  it('light the windows in the dark seasons', () => {
    expect(autumn.window).toBe(winter.window);
    expect(spring.window).toBe(summer.window);
    expect(brightness(winter.window)).toBeGreaterThan(brightness(summer.window));
  });

  it('let gardens bloom in spring and summer', () => {
    expect([spring, summer, autumn, winter].map((p) => p.bloom)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });
});

describe('countryside', () => {
  // River down the left edge, a walled town with a gate to the east and one to the river.
  const town = parseCity(
    cityFrom(['~~    ', '~~####', '~~#..#', '~~G..G', '~~#..#', '~~####', '~~    ']),
  );

  it('continues beyond the map: meadow everywhere, and the river flows on', () => {
    expect(terrainAround(town, 3, 3)).toBe('buildable');
    expect(terrainAround(town, 40, 3)).toBe('outside');
    expect(terrainAround(town, 4, -5)).toBe('outside');
    expect(terrainAround(town, 0, -5)).toBe('water');
    expect(terrainAround(town, 1, 30)).toBe('water');
    // Walls do not continue beyond the map.
    expect(terrainAround(town, 5, -1)).toBe('outside');
  });

  it('lays a road from each gate straight out to the edge of the painted land', () => {
    const roads = gateRoads(town);
    expect(roads.has('6,3')).toBe(true);
    expect(roads.has(`${town.width + MARGIN - 1},3`)).toBe(true);
    expect(roads.has('6,2')).toBe(false);
    // The western gate opens onto the river: no road there.
    expect([...roads].every((k) => Number(k.split(',')[0]) >= 6)).toBe(true);
    const land = countryside(town);
    expect(land.at(8, 3)).toBe('road');
  });

  it('keeps woods and fields away from the walls', () => {
    for (const def of CITIES) {
      const map = parseCity(def);
      const land = countryside(map);
      for (let y = -MARGIN; y < map.height + MARGIN; y++) {
        for (let x = -MARGIN; x < map.width + MARGIN; x++) {
          if (terrainAround(map, x, y) !== 'outside') continue;
          const kind = land.at(x, y);
          if (kind === 'forest' || kind === 'field') {
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ] as const) {
              const next = terrainAround(map, x + dx, y + dy);
              expect(['outside', 'water']).toContain(next);
            }
          }
        }
      }
    }
  });

  it('is the same every time and has a bit of everything', () => {
    const map = parseCity(CITIES[0]!);
    const sample = (land: ReturnType<typeof countryside>) => {
      const kinds: string[] = [];
      for (let y = -MARGIN; y < map.height + MARGIN; y++) {
        for (let x = -MARGIN; x < map.width + MARGIN; x++) kinds.push(land.at(x, y));
      }
      return kinds;
    };
    const first = sample(countryside(map));
    expect(sample(countryside(map))).toEqual(first);
    expect(new Set(first)).toEqual(new Set(['meadow', 'field', 'forest', 'road']));
  });
});
