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

export type BuildingCategory = 'path' | 'housing' | 'water' | 'food' | 'faith' | 'safety' | 'admin';

/** How a tool behaves when the pointer is dragged across the map. */
export type DragMode = 'none' | 'line' | 'rect';

/** Things a service building hands out to houses within reach. */
export type ServiceKind = 'water' | 'food' | 'faith' | 'fire';

/** What a house can require: a path next to it, or a service. */
export type Need = 'road' | ServiceKind;

export interface BuildingDef {
  id: string;
  category: BuildingCategory;
  /** Footprint at rotation 0. */
  size: { w: number; h: number };
  drag: DragMode;
  /** Gold to build. */
  cost: number;
  /** Building material to build. */
  materials: number;
  /** Share of the turn's building capacity this uses up. */
  buildPoints: number;
  /** Gold per turn. */
  upkeep: number;
  /** Workers needed to operate; without them the building is idle. */
  workers: number;
  /** Service handed out along the path network, with its reach in steps. */
  service?: { kind: ServiceKind; range: number };
  /** Only operates next to a plaza tile. */
  needsPlaza?: boolean;
  /** Extra storage capacity. */
  storage?: { food?: number; materials?: number };
  /** Extra goods per turn while connected to a gate by paths. */
  delivery?: { food?: number; materials?: number };
}

/** 0 = as defined, 1 = footprint turned by 90 degrees. */
export type Rotation = 0 | 1;

export interface HouseData {
  /** 1-based housing level. */
  level: number;
  pop: number;
  /** Consecutive turns the needs of the current level went unmet. */
  lacking: number;
}

export interface Building {
  id: number;
  def: string;
  x: number;
  y: number;
  /** Footprint after rotation. */
  w: number;
  h: number;
  rot: Rotation;
  /** Present on house plots only. */
  house?: HouseData;
}

export interface HousingLevel {
  level: number;
  capacity: number;
  /** Everything a house of this level needs (cumulative). */
  needs: Need[];
  /** Gold per inhabitant and turn. */
  taxPerHead: number;
}

export interface Balance {
  start: { gold: number; food: number; materials: number };
  buildPointsPerTurn: number;
  /** Share of the building cost returned on demolition. */
  demolishRefund: number;
  /** Share of inhabitants available as workers. */
  workerShare: number;
  foodPerHead: number;
  /** Per gate and turn. */
  gateDelivery: { food: number; materials: number };
  baseStorage: { food: number; materials: number };
  /** Turns a house tolerates unmet needs before it declines. */
  graceTurns: number;
  /** Indexed by season, 0 = spring. */
  seasonFoodDelivery: [number, number, number, number];
  seasonFoodDemand: [number, number, number, number];
  /** Path tiles of these kinds count double for service reach. */
  slowPaths: string[];
  plazaPath: string;
}

export interface Rules {
  buildings: Readonly<Record<string, BuildingDef>>;
  housing: readonly HousingLevel[];
  balance: Balance;
}

export type HintKind =
  | 'noRoad'
  | 'noWater'
  | 'noFood'
  | 'noFaith'
  | 'noFire'
  | 'unstaffed'
  | 'noAccess'
  | 'needsPlaza'
  | 'hungry';

/** Something the player may want to look at; (x, y) points to one example on the map. */
export interface Hint {
  kind: HintKind;
  count: number;
  x: number;
  y: number;
}

export interface TurnReport {
  /** The turn that just ended (0-based). */
  turn: number;
  taxes: number;
  upkeep: number;
  /** The treasury ran dry and the sovereign covered the gap. */
  subsidy: boolean;
  foodDelivered: number;
  foodWasted: number;
  foodEaten: number;
  hungry: boolean;
  materialsDelivered: number;
  materialsWasted: number;
  popBefore: number;
  popAfter: number;
  upgraded: number;
  downgraded: number;
  hints: Hint[];
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
  /** 0-based; four turns make a year, turn 0 is the first spring. */
  turn: number;
  gold: number;
  food: number;
  materials: number;
  /** Building capacity left this turn. */
  buildPoints: number;
  /** How often the sovereign had to cover an empty treasury. */
  subsidies: number;
  lastReport: TurnReport | null;
}

export interface Point {
  x: number;
  y: number;
}
