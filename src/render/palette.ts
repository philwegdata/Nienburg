/** Colours for one season. Everything the renderer paints goes through a palette. */

export type RGB = [r: number, g: number, b: number];

export function parseColor(color: string): RGB {
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const parts = color.match(/\d+(\.\d+)?/g) ?? [];
  return [Number(parts[0] ?? 0), Number(parts[1] ?? 0), Number(parts[2] ?? 0)];
}

/** Blends `a` towards `b` by `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const p = parseColor(a);
  const q = parseColor(b);
  const c = p.map((v, i) => Math.round(v + (q[i]! - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Lightens (amount > 0) or darkens (amount < 0) a colour; amount is in -1..1. */
export function shade(color: string, amount: number): string {
  return amount >= 0 ? mix(color, '#ffffff', amount) : mix(color, '#000000', -amount);
}

export interface BoxColors {
  top: string;
  left: string;
  right: string;
}

export interface RoofColors {
  back: string;
  left: string;
  right: string;
}

const WALLS = {
  stone: { top: '#b9b1a0', left: '#8d8676', right: '#a39c8b' },
  paleStone: { top: '#e4e0d4', left: '#b7b2a4', right: '#d3cfc1' },
  darkStone: { top: '#a39b8c', left: '#746d60', right: '#8b8476' },
  plaster: { top: '#e8dcc0', left: '#c9b993', right: '#e0d2b0' },
  clay: { top: '#dcc7a0', left: '#b9a37c', right: '#d0ba92' },
  wattle: { top: '#bfa27a', left: '#9c8160', right: '#b3966f' },
  wood: { top: '#b89a70', left: '#8c7250', right: '#a78860' },
  darkWood: { top: '#8a6f52', left: '#63503b', right: '#7a6248' },
  brick: { top: '#c9b1a4', left: '#93786c', right: '#b0958a' },
  ochre: { top: '#e3cf9a', left: '#bda46c', right: '#d6bf84' },
} satisfies Record<string, BoxColors>;

const ROOFS = {
  tile: { back: '#8a4630', left: '#a4573b', right: '#b96a4a' },
  darkTile: { back: '#6d3526', left: '#84412f', right: '#99523c' },
  slate: { back: '#4f5a63', left: '#5f6c76', right: '#73818c' },
  thatch: { back: '#8f7a45', left: '#a8904f', right: '#bda55f' },
  shingle: { back: '#5d4a38', left: '#6f5944', right: '#836b53' },
  awning: { back: '#b8a24a', left: '#d2b955', right: '#e3cc6a' },
  red: { back: '#7c2f24', left: '#96392c', right: '#b04a3a' },
  green: { back: '#49653a', left: '#587a45', right: '#6a8f54' },
  blue: { back: '#3f5f7a', left: '#4c7191', right: '#5d86a8' },
} satisfies Record<string, RoofColors>;

export type WallKey = keyof typeof WALLS;
export type RoofKey = keyof typeof ROOFS;

export interface Palette {
  season: number;
  meadow: string[];
  /** Field colours; each field patch picks one. */
  fields: string[];
  furrow: string;
  water: string[];
  glint: string;
  ground: string[];
  road: string;
  alley: string;
  street: string;
  cobble: string;
  plaza: string;
  plazaLine: string;
  leaf: string[];
  /** Trees have dropped their leaves. */
  bare: boolean;
  /** Gardens are in bloom. */
  bloom: boolean;
  trunk: string;
  bed: string;
  flowers: string[];
  basin: string;
  /** Windows glow in the dark seasons. */
  window: string;
  door: string;
  timber: string;
  ink: string;
  shadow: string;
  smoke: string;
  flag: string;
  /** 0 = none, up to 1 = everything white. */
  snow: number;
  walls: Record<WallKey, BoxColors>;
  roofs: Record<RoofKey, RoofColors>;
}

const SNOW = '#f3f5f7';

interface SeasonLook {
  meadow: string[];
  fields: string[];
  furrow: string;
  water: string[];
  leaf: string[];
  bare: boolean;
  bloom: boolean;
  bed: string;
  lit: boolean;
  snow: number;
  /** A faint colour wash over stone, plaster and paths. */
  wash: [color: string, amount: number];
}

const LOOKS: [SeasonLook, SeasonLook, SeasonLook, SeasonLook] = [
  {
    // spring
    meadow: ['#b3c98b', '#aec684', '#b9cd92'],
    fields: ['#c3d489', '#a6c672', '#b7a57c'],
    furrow: 'rgba(70, 90, 40, 0.22)',
    water: ['#7fa9c4', '#86afc9'],
    leaf: ['#74a654', '#82b25e', '#6b9c4e', '#8ab866', '#eab9c9'],
    bare: false,
    bloom: true,
    bed: '#86a862',
    lit: false,
    snow: 0,
    wash: ['#ffffff', 0],
  },
  {
    // summer
    meadow: ['#a8bf7c', '#a2ba75', '#afc484'],
    fields: ['#e3cf78', '#d8c268', '#b3c36c'],
    furrow: 'rgba(110, 90, 30, 0.22)',
    water: ['#73a3c2', '#7babc8'],
    leaf: ['#4f8040', '#5a8c48', '#467538'],
    bare: false,
    bloom: true,
    bed: '#7da05a',
    lit: false,
    snow: 0,
    wash: ['#fff2c8', 0.06],
  },
  {
    // autumn
    meadow: ['#bdb97f', '#b6b077', '#c4bd88'],
    fields: ['#b0915c', '#a08352', '#c0a56c'],
    furrow: 'rgba(70, 50, 25, 0.28)',
    water: ['#7c9fb4', '#84a6ba'],
    leaf: ['#c9822f', '#b5642a', '#d6a43a'],
    bare: false,
    bloom: false,
    bed: '#9a9a5c',
    lit: true,
    snow: 0,
    wash: ['#e8b070', 0.07],
  },
  {
    // winter
    meadow: ['#e9edf0', '#e2e7eb', '#eef1f3'],
    fields: ['#dfe4e8', '#d7dde2', '#e6eaed'],
    furrow: 'rgba(120, 130, 140, 0.25)',
    water: ['#a9c3d2', '#b3cad8'],
    leaf: ['#7b6a58', '#7b6a58', '#7b6a58'],
    bare: true,
    bloom: false,
    bed: '#d9dfd8',
    lit: true,
    snow: 0.62,
    wash: ['#dfe8f0', 0.12],
  },
];

function mapValues<K extends string, V>(obj: Record<K, V>, fn: (v: V) => V): Record<K, V> {
  return Object.fromEntries(
    (Object.entries(obj) as [K, V][]).map(([k, v]) => [k, fn(v)]),
  ) as Record<K, V>;
}

/** The palette for a season (0 = spring … 3 = winter). */
export function buildPalette(season: number): Palette {
  const look = LOOKS[((season % 4) + 4) % 4]!;
  const [washColor, washAmount] = look.wash;
  const wash = (c: string) => mix(c, washColor, washAmount);
  // Snow settles on what faces the sky, far less on walls.
  const snowTop = (c: string, share = 1) => mix(wash(c), SNOW, look.snow * share);
  return {
    season,
    meadow: look.meadow,
    fields: look.fields,
    furrow: look.furrow,
    water: look.water,
    glint: 'rgba(255, 255, 255, 0.7)',
    ground: ['#d9c9a3', '#d5c49c'].map((c) => snowTop(c, 0.75)),
    road: snowTop('#c2ab7e', 0.6),
    alley: snowTop('#b89f76', 0.55),
    street: snowTop('#a7a096', 0.45),
    cobble: 'rgba(60, 50, 40, 0.16)',
    plaza: snowTop('#cfc8b8', 0.45),
    plazaLine: 'rgba(59, 42, 32, 0.14)',
    leaf: look.leaf,
    bare: look.bare,
    bloom: look.bloom,
    trunk: '#6b5038',
    bed: look.bed,
    flowers: ['#d9b44a', '#c46a5a', '#f1ead2', '#9a79b8'],
    basin: look.snow > 0 ? '#b7cfdc' : '#6f9db8',
    window: look.lit ? '#f6d57c' : '#4b4640',
    door: '#4a3526',
    timber: 'rgba(59, 42, 32, 0.6)',
    ink: '#3b2a20',
    shadow: 'rgba(40, 30, 20, 0.16)',
    smoke: look.snow > 0 ? '225, 228, 232' : '240, 238, 232',
    flag: '#b4382c',
    snow: look.snow,
    walls: mapValues(WALLS, (w) => ({
      top: snowTop(w.top, 0.8),
      left: wash(w.left),
      right: wash(w.right),
    })),
    roofs: mapValues(ROOFS, (r) => ({
      back: snowTop(r.back),
      left: snowTop(r.left),
      right: snowTop(r.right),
    })),
  };
}
