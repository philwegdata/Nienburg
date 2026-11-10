export type Terrain = 'outside' | 'water' | 'rock' | 'wall' | 'tower' | 'gate' | 'buildable';

export type Lang = 'de' | 'en';
export type Localized = Record<Lang, string>;

export interface CityDef {
  id: string;
  name: Localized;
  region: Localized;
  blurb: Localized;
  /** 1 (gentle) to 3 (tricky). */
  difficulty: 1 | 2 | 3;
  /** Allowed range for the number of buildable tiles; checked by validateCity. */
  buildableRange: [min: number, max: number];
  /** One string per row, see CITY_LEGEND in core/city.ts. */
  map: string[];
}

export type BuildingCategory = 'path' | 'housing' | 'water' | 'faith';

/** How a tool behaves when the pointer is dragged across the map. */
export type DragMode = 'none' | 'line' | 'rect';

export interface BuildingDef {
  id: string;
  category: BuildingCategory;
  /** Footprint at rotation 0. */
  size: { w: number; h: number };
  drag: DragMode;
  cost: number;
}

/** 0 = as defined, 1 = footprint turned by 90 degrees. */
export type Rotation = 0 | 1;

export interface Building {
  id: number;
  def: string;
  x: number;
  y: number;
  /** Footprint after rotation. */
  w: number;
  h: number;
  rot: Rotation;
}

/** The complete, serialisable game. No class instances, no functions. */
export interface GameState {
  version: 1;
  cityId: string;
  width: number;
  height: number;
  /** Row-major, length width * height. */
  terrain: Terrain[];
  /** Row-major building id per tile, 0 = empty. */
  occupancy: number[];
  buildings: Record<number, Building>;
  nextBuildingId: number;
  rng: number;
}

export interface Point {
  x: number;
  y: number;
}
