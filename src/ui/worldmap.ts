import type { CityDef, Lang } from '../core/types';

type Coast = [lon: number, lat: number][];

/**
 * Very rough coastlines, hand-drawn from a handful of points each. Good enough to show where
 * a town lies; not a map to navigate by.
 */
const LAND: Coast[] = [
  // Europe and Asia, with the Baltic, the Black Sea and Arabia traced along the way
  [
    [-5.6, 36],
    [-9, 37],
    [-9.5, 38.7],
    [-8.8, 41.9],
    [-9.3, 43],
    [-8, 43.7],
    [-3.8, 43.4],
    [-1.8, 43.4],
    [-1.2, 45.5],
    [-2.2, 47.2],
    [-4.7, 48.4],
    [-3, 48.8],
    [-1.6, 48.6],
    [-1.9, 49.7],
    [0.1, 49.5],
    [1.6, 50.9],
    [3.2, 51.3],
    [4.3, 52],
    [4.8, 53],
    [7, 53.6],
    [8.6, 53.9],
    [8.3, 55],
    [8.1, 57.1],
    [10.5, 57.7],
    [10.3, 56],
    [9.9, 54.8],
    [11, 54],
    [14.2, 53.9],
    [18.6, 54.6],
    [21, 55.2],
    [21, 57],
    [24, 57.3],
    [24.5, 59.4],
    [30, 59.9],
    [25, 60],
    [22, 60],
    [21.5, 63],
    [25, 65.5],
    [22, 65.8],
    [17.5, 62],
    [18, 59.5],
    [16.5, 57],
    [14.3, 55.5],
    [12.8, 56],
    [11.5, 58.5],
    [10.5, 59.5],
    [5.5, 58.8],
    [5, 61.5],
    [10, 64.5],
    [14, 67.5],
    [20, 70],
    [28, 71],
    [41, 67],
    [45, 68],
    [60, 69],
    [68, 72],
    [80, 73],
    [100, 76],
    [130, 73],
    [130, 42],
    [122, 37],
    [121, 31],
    [119, 25.5],
    [114, 22.3],
    [108.5, 21.5],
    [106.5, 19],
    [109, 13],
    [105, 9],
    [100.5, 13.5],
    [99, 9],
    [103.5, 1.5],
    [100.5, 3.5],
    [98.5, 8],
    [97.5, 16],
    [94, 19],
    [91.5, 22.5],
    [88.5, 21.7],
    [86.5, 20.5],
    [80.2, 15.5],
    [80, 10.5],
    [77.5, 8],
    [75, 12],
    [73, 18],
    [72.5, 21],
    [70, 21],
    [68.5, 23.5],
    [66.7, 25],
    [61.5, 25.1],
    [57, 25.5],
    [56.3, 27],
    [51, 27.8],
    [50, 30],
    [48, 30],
    [50, 26.5],
    [51.5, 24.5],
    [54, 24],
    [56.3, 26.2],
    [56.5, 24.3],
    [59.8, 22.5],
    [58, 19],
    [55, 17],
    [52, 16.2],
    [45, 12.7],
    [43.2, 12.7],
    [42.5, 16.3],
    [39, 21.5],
    [35, 28],
    [34.2, 27.8],
    [32.6, 30],
    [32.3, 31.2],
    [34.3, 31.4],
    [35.6, 34],
    [36, 36.6],
    [33, 36.2],
    [30.5, 36.5],
    [28, 36.7],
    [27.2, 37.5],
    [26.3, 39.3],
    [26.2, 40.2],
    [29, 41.1],
    [31.5, 41.2],
    [35, 42],
    [38, 41],
    [41.5, 41.5],
    [39.7, 43.5],
    [37.5, 44.7],
    [37.8, 47],
    [35, 46.2],
    [33.5, 44.5],
    [33, 46],
    [30.7, 46.5],
    [29.7, 45.2],
    [28.6, 43.5],
    [27.9, 42.5],
    [28.5, 41],
    [26.5, 40.8],
    [24, 40.8],
    [23, 40.5],
    [23.3, 39.2],
    [24, 38],
    [23, 36.4],
    [21.5, 37],
    [21, 38.5],
    [19.4, 40.5],
    [19.4, 41.8],
    [18.1, 42.6],
    [15.2, 44.2],
    [13.6, 45.1],
    [13.7, 45.7],
    [12.3, 45.4],
    [12.4, 44.2],
    [13.6, 43.6],
    [16, 41.9],
    [18.5, 40.1],
    [17, 40.5],
    [16.6, 39],
    [16.1, 38],
    [15.7, 38.2],
    [16, 39.7],
    [14.3, 40.8],
    [12.3, 41.8],
    [10.5, 42.9],
    [10.2, 43.9],
    [8.9, 44.4],
    [7.4, 43.7],
    [5.4, 43.3],
    [3.1, 43.1],
    [3.2, 42.3],
    [2.2, 41.4],
    [0.5, 40.5],
    [-0.3, 39.5],
    [-0.6, 38],
    [-2, 36.8],
    [-4.4, 36.7],
  ],
  // Africa
  [
    [-5.9, 35.8],
    [-2, 35.1],
    [3, 36.8],
    [10, 37.2],
    [11, 33.7],
    [15, 32.4],
    [20, 30.8],
    [25, 31.6],
    [31, 31.5],
    [32.3, 31.2],
    [32.6, 30],
    [34, 27],
    [35.5, 24],
    [37.2, 21],
    [38.5, 18],
    [43, 11.6],
    [51, 11.8],
    [47.5, 4],
    [41, -2],
    [39.5, -6.5],
    [40.5, -14],
    [35, -20],
    [32.5, -26],
    [27, -34],
    [18.5, -34.5],
    [15, -27],
    [12, -17],
    [13.5, -10],
    [9, -1],
    [9.5, 4],
    [4, 6.3],
    [-4, 5.2],
    [-8, 4.5],
    [-13, 8.5],
    [-17, 14.7],
    [-16.5, 21],
    [-13, 27.7],
    [-9.8, 31.5],
    [-6.8, 34],
  ],
  // South America
  [
    [-77.5, 8.5],
    [-72, 12],
    [-62, 10.7],
    [-51, 4],
    [-50, 0],
    [-35, -5.5],
    [-39, -15],
    [-41, -22.5],
    [-48.5, -27],
    [-57, -36],
    [-65, -41],
    [-67, -55],
    [-73, -50],
    [-73, -37],
    [-71.5, -30],
    [-70.3, -18.5],
    [-76.2, -13.8],
    [-81, -5],
    [-80, 0],
    [-77.5, 4],
  ],
  // North and Central America, as far as the map reaches
  [
    [-77.5, 8.5],
    [-83, 9],
    [-83.5, 11],
    [-87, 13],
    [-92, 15],
    [-97, 19],
    [-97, 26],
    [-90, 29],
    [-84, 30],
    [-82.5, 27.5],
    [-81, 25],
    [-80, 27],
    [-81.5, 31],
    [-76, 35],
    [-74, 40],
    [-70, 42],
    [-66, 45],
    [-60, 46],
    [-64, 50],
    [-56, 52],
    [-61, 56],
    [-65, 60],
    [-78, 62],
    [-100, 62],
    [-100, 16],
    [-90, 13],
    [-84, 9],
  ],
  // Great Britain, Ireland
  [
    [-5.5, 50.1],
    [1.4, 51.2],
    [1.7, 52.7],
    [0, 53.6],
    [-1.5, 55],
    [-2, 57.6],
    [-3.5, 58.6],
    [-5, 58.6],
    [-6, 56.5],
    [-4.8, 54.8],
    [-3, 53.8],
    [-4.5, 53.2],
    [-5, 51.7],
    [-3.2, 51.3],
  ],
  [
    [-10, 51.6],
    [-6.2, 52.2],
    [-6, 54.3],
    [-7.5, 55.3],
    [-10, 54.2],
  ],
  // Sicily, Sardinia with Corsica
  [
    [12.5, 38],
    [15.6, 38.2],
    [15.1, 36.7],
  ],
  [
    [8.2, 39],
    [9.7, 39.2],
    [9.6, 41.2],
    [9.4, 43],
    [8.6, 42.4],
    [8.3, 40.8],
  ],
  // Madagascar, Sumatra, Borneo
  [
    [49.3, -12],
    [50.3, -15.5],
    [47, -25],
    [43.5, -22],
    [44.5, -16],
  ],
  [
    [95.5, 5.5],
    [104, -1],
    [105.8, -5.8],
    [102, -4],
    [97, 1.5],
  ],
  [
    [109, 1],
    [117, 7],
    [118.5, 1],
    [116, -4],
    [110, -3],
  ],
];

/** A window onto the globe: west, east, south, north in degrees. */
interface Frame {
  west: number;
  east: number;
  south: number;
  north: number;
}

const WORLD: Frame = { west: -92, east: 128, south: -24, north: 64 };
const EUROPE: Frame = { west: -12, east: 23, south: 32, north: 56.5 };

const SVG = 'http://www.w3.org/2000/svg';

function el(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface MapPin {
  city: CityDef;
  /** Number shown on the pin and on the town's card. */
  number: number;
  stars: number;
  current: boolean;
}

function chart(
  frame: Frame,
  width: number,
  pins: MapPin[],
  lang: Lang,
  onPick: (city: CityDef) => void,
  label: string,
  pinSize: number,
): SVGElement {
  const scale = width / (frame.east - frame.west);
  const height = (frame.north - frame.south) * scale;
  const px = (lon: number) => ((lon - frame.west) * scale).toFixed(1);
  const py = (lat: number) => ((frame.north - lat) * scale).toFixed(1);
  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height.toFixed(1)}`,
    role: 'group',
    'aria-label': label,
    class: 'chart',
  });
  svg.append(el('rect', { width, height: height.toFixed(1), class: 'sea' }));
  for (const coast of LAND) {
    const points = coast.map(([lon, lat]) => `${px(lon)},${py(lat)}`).join(' ');
    svg.append(el('polygon', { points, class: 'land' }));
  }
  for (const pin of pins) {
    const { lat, lon } = pin.city.location;
    if (lon < frame.west || lon > frame.east || lat < frame.south || lat > frame.north) continue;
    const g = el('g', {
      class: `pin${pin.current ? ' current' : ''}${pin.stars === 3 ? ' done' : ''}`,
      transform: `translate(${px(lon)} ${py(lat)})`,
      tabindex: 0,
      role: 'button',
      'aria-label': `${pin.city.name[lang]}, ${'★'.repeat(pin.stars)}${'☆'.repeat(3 - pin.stars)}`,
    });
    g.append(
      el(
        'title',
        {},
        `${pin.city.name[lang]} ${'★'.repeat(pin.stars)}${'☆'.repeat(3 - pin.stars)}`,
      ),
      el('circle', { r: pinSize }),
      el(
        'text',
        { y: pinSize * 0.38, 'font-size': pinSize * 1.15, 'text-anchor': 'middle' },
        String(pin.number),
      ),
    );
    g.addEventListener('click', () => onPick(pin.city));
    g.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        onPick(pin.city);
      }
    });
    svg.append(g);
  }
  return svg;
}

/** A world map with a pin per town, plus an enlarged view of crowded Europe. */
export function worldMap(
  pins: MapPin[],
  lang: Lang,
  labels: { world: string; europe: string },
  onPick: (city: CityDef) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'worldmap';
  const world = chart(
    WORLD,
    440,
    pins.filter((p) => !inFrame(p.city, EUROPE)),
    lang,
    onPick,
    labels.world,
    7,
  );
  // Show where the enlarged part lies.
  const scale = 440 / (WORLD.east - WORLD.west);
  world.append(
    el('rect', {
      x: (EUROPE.west - WORLD.west) * scale,
      y: (WORLD.north - EUROPE.north) * scale,
      width: (EUROPE.east - EUROPE.west) * scale,
      height: (EUROPE.north - EUROPE.south) * scale,
      class: 'inset-frame',
    }),
  );
  const europe = chart(EUROPE, 250, pins, lang, onPick, labels.europe, 9);
  wrap.append(world, europe);
  return wrap;
}

function inFrame(city: CityDef, frame: Frame): boolean {
  const { lat, lon } = city.location;
  return lon >= frame.west && lon <= frame.east && lat >= frame.south && lat <= frame.north;
}
