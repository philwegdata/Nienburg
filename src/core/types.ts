export type Terrain =
  | 'outside'
  | 'water'
  | 'rock'
  | 'wall'
  | 'tower'
  | 'gate'
  /** A fixed historic building that takes up room and cannot be changed. */
  | 'landmark'
  /** Water inside the walls; only bridges can be built on it. */
  | 'canal'
  | 'buildable';

export type Lang = 'de' | 'en';
export type Localized = Record<Lang, string>;

export interface CityDef {
  id: string;
  name: Localized;
  region: Localized;
  blurb: Localized;
  /** Where the real town lies, for the map on the selection screen. */
  location: { lat: number; lon: number };
  /** Regional colours and shapes; the rules stay the same. */
  look?: CityLook;
  /** What the fixed historic buildings on this map are. */
  landmarkName?: Localized;
  /** Regional names for buildings, by building id. */
  names?: Record<string, Localized>;
  /** What makes this town play a little differently. */
  modifiers?: CityModifiers;
  /** 1 (gentle) to 3 (tricky). */
  difficulty: 1 | 2 | 3;
  /** Allowed range for the number of buildable tiles; checked by validateCity. */
  buildableRange: [min: number, max: number];
  /** One string per row, see CITY_LEGEND in core/city.ts. */
  map: string[];
  /** Exactly three goals, one star each. */
  goals: [Goal, Goal, Goal];
}

export interface CityLook {
  /** Base colour of walls and towers. */
  stone?: string;
  /** Two shades for the ground inside the walls. */
  ground?: [string, string];
  /** Base colour of tiled roofs. */
  roof?: string;
  /** Base colour of plastered house walls. */
  plaster?: string;
  /** How much snow winter brings, and how green the land is. */
  climate?: 'temperate' | 'mild' | 'dry';
  /** What crowns places of faith. */
  faith?: 'spire' | 'dome' | 'pagoda' | 'plain';
  landmark?: 'castle' | 'abbey' | 'temple';
}

export interface CityModifiers {
  /** Factor on what each gate delivers. */
  gate?: number;
  /** Factor on the price merchants get. */
  tradePrice?: number;
  /** Factor on what a kind of building yields, by building id. */
  yields?: Record<string, number>;
  /** Fixed historic buildings make their surroundings nicer to live in. */
  landmarkAppeal?: { value: number; radius: number };
}

export type Goal =
  | { kind: 'population'; value: number }
  /** At least `count` houses of `level` or higher. */
  | { kind: 'houses'; level: number; count: number }
  /** Finished, undamaged buildings of this kind; one unless `count` says more. */
  | { kind: 'building'; def: string; count?: number };

export type Good = 'cloth' | 'tools' | 'beer';
export const GOODS: readonly Good[] = ['cloth', 'tools', 'beer'];

/** Raw materials from the countryside, which make workshops in town work better. */
export type RawGood = 'grain' | 'wool' | 'wood';
export const RAW_GOODS: readonly RawGood[] = ['grain', 'wool', 'wood'];

export type BuildingCategory =
  | 'path'
  | 'housing'
  | 'water'
  | 'food'
  | 'faith'
  | 'safety'
  | 'health'
  | 'culture'
  | 'craft'
  | 'admin'
  | 'green'
  /** Fields, pastures and woods on land outside the walls. */
  | 'farm';

/** How a tool behaves when the pointer is dragged across the map. */
export type DragMode = 'none' | 'line' | 'rect';

/** Things a service building hands out to houses within reach. */
export type ServiceKind =
  | 'water'
  | 'food'
  | 'faith'
  | 'fire'
  | 'order'
  | 'health'
  | 'fun'
  | 'education'
  /** Reach of a market hall, which hands out craft goods. */
  | 'goods';
export const SERVICES: readonly ServiceKind[] = [
  'water',
  'food',
  'faith',
  'fire',
  'order',
  'health',
  'fun',
  'education',
  'goods',
];

/**
 * What a house can require: a path next to it, a service, one or two kinds of craft goods,
 * or a pleasant (appeal1) or fine (appeal2) neighbourhood.
 */
export type Need =
  'road' | Exclude<ServiceKind, 'goods'> | 'goods1' | 'goods2' | 'appeal1' | 'appeal2';

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
  /** Services handed out along the path network, each with its reach in steps. */
  services?: { kind: ServiceKind; range: number }[];
  /** Only offered in these cities (by id). */
  cities?: string[];
  /** Built on canal water instead of land: on a canal of the map, or over a dug one. */
  onCanal?: boolean;
  /** A dug canal: carries water from the town wall to the houses along it. */
  canal?: boolean;
  /** Lies flat on the ground like a path, without being one. */
  flat?: boolean;
  /** Only operates next to a plaza tile. */
  needsPlaza?: boolean;
  /** Only operates within reach of a well or cistern. */
  needsWater?: boolean;
  /** Effect on the appeal of every tile within `radius` tiles of the footprint. */
  appeal?: { value: number; radius: number };
  /** Craft goods made per turn while operating. */
  produces?: { good: Good; amount: number };
  /**
   * Merchants: sells up to `capacity` craft goods per turn that the houses do not need, at
   * `price` gold each. Needs a path to a gate.
   */
  trade?: { capacity: number; price: number };
  /** Gold or food made per turn while operating. */
  yields?: { gold?: number; food?: number };
  /** Raises production and yields of workshops that touch it by this share. */
  guildBoost?: number;
  /** How likely the building is to catch fire when no fire watch covers it. */
  fireRisk?: number;
  /** Only one per town. */
  unique?: boolean;
  /** Available once the town has ever had this many inhabitants. */
  unlockPop?: number;
  /** Available once a building of this kind stands. */
  requires?: string;
  /** Built over several turns; each turn costs this much until it is done. */
  construction?: { turns: number; gold: number; materials: number };
  /** Extra build points per turn while operating. */
  buildPointsBonus?: number;
  /** Extra share of taxes while operating. */
  taxBonus?: number;
  /** Extra storage capacity. */
  storage?: { food?: number; materials?: number };
  /** Extra goods per turn while connected to a gate by paths. */
  delivery?: { food?: number; materials?: number };
  /** Only on land outside the walls (which the town has to buy first). */
  countryside?: boolean;
  /** Built on top of the town wall or into a tower instead of on the ground. */
  onWall?: boolean;
  /** Once finished, a new ring of walls encloses the land bought outside the old one. */
  outerWall?: boolean;
  /** Homes: share of the usual number of inhabitants per level. */
  capacityFactor?: number;
  /** Raw material gathered per turn while operating, scaled by the season. */
  harvest?: { good: RawGood; amount: number };
  /**
   * Uses `amount` of a raw material per turn if there is enough in store; while supplied, what
   * the building makes (goods, gold, food, build points) grows by `bonus` as a share.
   */
  consumes?: { good: RawGood; amount: number; bonus: number };
}

/** 0 = as defined, 1 = footprint turned by 90 degrees. */
export type Rotation = 0 | 1;

export interface HouseData {
  /** 1-based housing level. */
  level: number;
  pop: number;
  /** Consecutive turns the needs of the current level went unmet. */
  lacking: number;
  /** Floors added on top; absent for none. */
  storeys?: number;
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
  /** Turns of construction left; absent once finished. */
  construction?: number;
  /** Blackened by a fire; out of use until repaired. */
  damaged?: boolean;
  /** A bridge built over a dug canal, which reappears when the bridge is removed. */
  overCanal?: boolean;
  /** A home built into a tower rather than on the wall walk. */
  inTower?: boolean;
}

export interface HousingLevel {
  level: number;
  capacity: number;
  /** Everything a house of this level needs (cumulative). */
  needs: Need[];
  /** Gold per inhabitant and turn. */
  taxPerHead: number;
}

export interface TaxRateDef {
  tax: number;
  growth: number;
}

export interface LoanTerms {
  step: number;
  base: number;
  perHead: number;
  interest: number;
  installment: number;
}

export interface Balance {
  start: { gold: number; food: number; materials: number };
  /** Extra capacity of two merged house plots, as a share of one plot. */
  mergeBonus: number;
  /** Lowest level at which neighbouring houses grow together. */
  mergeLevel: number;
  goodsPerHead: number;
  /** Merchants leave this many turns' worth of the houses' demand in store. */
  goodsReserveTurns: number;
  goodsCap: number;
  /** Gold per unit of craft goods that no longer fits into storage. */
  goodsPrice: number;
  /** Appeal needed for appeal1 and appeal2, stacking limit per building kind, light malus. */
  appeal: { pleasant: number; fine: number; stack: number; boxedIn: number };
  fire: { perRisk: number; maxChance: number; summerFactor: number; quietTurns: number };
  /** Share of the building cost charged for repairs. */
  repairShare: number;
  /** How many tiles around a flowing canal get water from it. */
  canalReach: number;
  /** Price of a tile of land outside the walls: `base` plus `step` for each one already bought. */
  land: { base: number; step: number };
  /**
   * The bank lends gold in steps of `step`, up to `base` plus `perHead` per inhabitant.
   * Each turn `interest` of the debt is added to it, then `installment` of it is paid back
   * from whatever gold the treasury has left.
   */
  loan: LoanTerms;
  /**
   * Raw materials: how much the town can store of each, and the harvest factor per season
   * (0 = spring).
   */
  raw: {
    cap: number;
    /** Gold per unit that no longer fits into storage. */
    price: number;
    season: Record<RawGood, [number, number, number, number]>;
  };
  /**
   * Building upwards: at most `max` extra floors per house. The first needs housing level
   * `minLevel`, each further one a level more. Each floor costs gold, materials and build points
   * per tile, adds `capacity` as a share of the plot's inhabitants, raises the fire risk by
   * `fireRisk`, and casts `shade` (negative appeal) on the tiles right around the house.
   */
  storey: {
    max: number;
    minLevel: number;
    gold: number;
    materials: number;
    buildPoints: number;
    capacity: number;
    fireRisk: number;
    shade: number;
  };
  /**
   * Residents' wishes: chance per turn that someone wishes for something once the town is past
   * `quietTurns`, how close a wished-for building has to be, and the reward.
   */
  wishes: {
    chance: number;
    quietTurns: number;
    radius: number;
    reward: number;
    perLevel: number;
    /** How many first names there are to pick from. */
    names: number;
    /** Buildings wished for close to home, and buildings wished for once more in town. */
    near: readonly string[];
    more: readonly string[];
  };
  /**
   * Prices of craft goods: a factor per season (0 = spring) on the merchants' price, and how far
   * each year's market may stray from that, as a share.
   */
  market: { season: Record<Good, [number, number, number, number]>; drift: number };
  /**
   * Orders from other towns: chance per turn once a trading house stands, the first turn they can
   * come, which towns order, the amount (`base` plus `perYear` for each year, up to `max`), the
   * gold per unit as a factor on the usual price, and luxury goods per unit delivered.
   */
  orders: {
    chance: number;
    quietTurns: number;
    partners: readonly string[];
    base: number;
    perYear: number;
    max: number;
    premium: number;
    luxuryShare: number;
  };
  /**
   * Luxury goods: what each inhabitant of the upper houses within reach of a market hall uses per
   * turn, and the extra share of taxes those houses pay while they get it.
   */
  luxury: { perHead: number; taxBonus: number };
  /**
   * Tax rates the player can choose: a factor on taxes, and the share of the free room in a house
   * that fills with newcomers each turn.
   */
  taxRates: [TaxRateDef, TaxRateDef, TaxRateDef];
  /** Workshops of one kind in a touching group of at least `size` make `bonus` more. */
  guildQuarter: { size: number; bonus: number };
  /** Share of a building's cost charged for moving it. */
  moveShare: number;
  /** Taking down a tile of the old wall: gold it costs, and materials won from the stones. */
  razing: { gold: number; materials: number };
  /** Appeal radiated by every landmark tile, where a city has that. */
  landmarkAppeal?: { value: number; radius: number };
  events: {
    /** Chance per turn that something happens, once the town is past its first years. */
    chance: number;
    quietTurns: number;
    fairBase: number;
    fairPerHead: number;
    pilgrimGold: number;
    harvestFood: number;
    /** Factor on food demand in a harsh winter. */
    harshWinterDemand: number;
  };
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

/** Things that happen now and then. None of them destroys anything. */
export type EventKind =
  /** A fair on the plaza brings gold at once. */
  | 'fair'
  /** Pilgrims leave gold at the town's places of faith. */
  | 'pilgrims'
  /** A rich harvest fills the stores. */
  | 'goodHarvest'
  /** Travelling jugglers entertain the whole town for the coming season. */
  | 'jugglers'
  /** The coming winter is harsh: people eat more. */
  | 'harshWinter'
  /** One well runs dry for the coming season. */
  | 'dryWell';

/** An event whose effect lasts through the current turn. */
export interface ActiveEvent {
  kind: 'jugglers' | 'harshWinter' | 'dryWell';
  /** The well that ran dry. */
  building?: number;
}

/** What the turn report says about an event. */
export interface EventNews {
  kind: EventKind;
  gold?: number;
  food?: number;
  /** Where to look, if the event has a place. */
  at?: Point;
}

export type HintKind =
  | 'noRoad'
  | 'noWater'
  | 'noFood'
  | 'noFaith'
  | 'noFire'
  | 'noOrder'
  | 'noHealth'
  | 'noFun'
  | 'noEducation'
  | 'noGoods'
  | 'noAppeal'
  | 'unstaffed'
  | 'noAccess'
  | 'needsPlaza'
  | 'needsWater'
  | 'noGate'
  | 'dryCanal'
  | 'damaged'
  | 'stalled'
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
  /** Interest added to the debt this turn. */
  loanInterest: number;
  /** Gold paid back to the bank this turn. */
  loanPaid: number;
  /** Luxury goods used by the finest houses, and the extra taxes they paid for it. */
  luxuryUsed?: number;
  luxuryTaxes?: number;
  /** An order that came in this turn. */
  orderNew?: TradeOrder | null;
  /** A wish fulfilled this turn, with the gold it brought. */
  wishGranted?: Wish | null;
  /** A wish spoken this turn. */
  wishNew?: Wish | null;
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
  merged: number;
  /** Gold from tanneries and the like, plus surplus goods sold. */
  tradeIncome: number;
  /** Craft goods the merchants sold this turn (their gold is part of tradeIncome). */
  goodsSold: number;
  /** Gold spent on ongoing construction. */
  constructionCost: number;
  /** Kinds of craft goods houses could get this turn. */
  goodsTypes: number;
  /** Something that happened at the end of this turn, or begins with the next one. */
  event: EventNews | null;
  /** A building that caught fire this turn. */
  fire: { def: string; x: number; y: number } | null;
  /** Buildings finished this turn. */
  completed: string[];
  /** Buildings newly available. */
  unlocked: string[];
  /** Indices of goals reached this turn. */
  newStars: number[];
  hints: Hint[];
}

/**
 * A resident's wish. There is never a deadline; a wish whose house is gone is simply dropped.
 * `name` indexes the list of first names; `house` is the building id of the resident's home.
 */
export type Wish =
  /** A building of kind `def` close to the house. */
  | { kind: 'near'; house: number; name: number; def: string; reward: number }
  /** The house reaches `level`. */
  | { kind: 'level'; house: number; name: number; level: number; reward: number }
  /** The town has `count` buildings of kind `def`. */
  | { kind: 'count'; house: number; name: number; def: string; count: number; reward: number };

/** A small fixed plan with a fixed set of pieces; solved when everything fits and every house has what it needs. */
export interface PuzzleDef {
  id: string;
  name: Record<Lang, string>;
  blurb: Record<Lang, string>;
  /** Same legend as a city map. */
  map: string[];
  pieces: Record<string, number>;
  needs: Need[];
}

/** An order from another town: `amount` of a craft good, paid for in gold and luxury goods. */
export interface TradeOrder {
  /** Id of the ordering city. */
  from: string;
  good: Good;
  amount: number;
  delivered: number;
  gold: number;
  luxury: number;
}

export type TaxRate = 0 | 1 | 2;

/** The complete, serialisable game. No class instances, no functions. */
export interface GameState {
  version: 11;
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
  goods: Record<Good, number>;
  /** Raw materials in store. */
  raw: Record<RawGood, number>;
  /** Most inhabitants the town ever had; unlocks buildings. */
  peakPop: number;
  /** Which of the city's three goals have been reached. */
  stars: [boolean, boolean, boolean];
  /** Building capacity left this turn. */
  buildPoints: number;
  /**
   * Sandbox: everything is free and available from the start, and there are no goals.
   * Absent in a normal game.
   */
  sandbox?: boolean;
  /**
   * Puzzle: a fixed set of pieces to fit into the plan, after which every house must have
   * `needs`. Puzzles are also sandboxes: nothing costs anything. Absent in other games.
   */
  puzzle?: { id: string; pieces: Record<string, number>; needs: Need[] };
  /** Tiles of land bought outside the walls so far. */
  landBought: number;
  /** An event in effect during the current turn. */
  event: ActiveEvent | null;
  /** How often the sovereign had to cover an empty treasury. */
  subsidies: number;
  /** Gold owed to the bank. */
  debt: number;
  /** What one of the residents wishes for right now. */
  wish: Wish | null;
  /** Wishes fulfilled so far. */
  wishesGranted: number;
  /** Craft goods the merchants keep in store instead of selling, waiting for a better price. */
  hold: Good[];
  /** What another town has ordered from this one; there is never a deadline. */
  order: TradeOrder | null;
  /** Orders delivered so far. */
  ordersDone: number;
  /** Wine, spices and silk from far away, which only come in return for orders. */
  luxury: number;
  /** 0 = mild, 1 = usual, 2 = high; see Balance.taxRates. */
  taxRate: TaxRate;
  /** Tiles (by index) where the old town wall has been taken down. */
  razed: number[];
  lastReport: TurnReport | null;
}

export interface Point {
  x: number;
  y: number;
}
