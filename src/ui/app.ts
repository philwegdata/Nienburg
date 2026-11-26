import {
  buildingAt,
  buyLand,
  countTiles,
  landError,
  landPrice,
  setHold,
  festivalError,
  festivalNow,
  holdFestival,
  moveBuilding,
  moveCost,
  razeWall,
  hasOuterWall,
  setTaxRate,
  outsideWalls,
  borrow,
  loanLimit,
  loanRoom,
  repayLoan,
  lockOf,
  repair,
  repairCost,
} from '../core/actions';
import { newGame, parseCity } from '../core/city';
import { goalProgress } from '../core/goals';
import { levelForStorey, raiseCost, raiseError, raiseHouse } from '../core/storeys';
import { goodPrice } from '../core/market';
import { deliverOrder } from '../core/orders';
import { newPuzzle, puzzleCity, puzzleStatus, type PuzzleStatus } from '../core/puzzle';
import { PUZZLES } from '../data/puzzles';
import { packTown, unpackTown, type SharedTown } from '../core/share';
import { decodeShare, encodeShare } from './share';
import { ACHIEVEMENTS, newAchievements, townValue } from '../core/achievements';
import { SCENARIOS } from '../data/scenarios';
import { newScenario, scenarioCity } from '../core/scenario';
import {
  challengeCity,
  challengeOver,
  challengeScore,
  dailyCity,
  newChallenge,
} from '../core/daily';
import { wishProgress } from '../core/wishes';
import { WISH_NAMES } from '../data/wishes';
import { inBounds, indexOf } from '../core/grid';
import { commitDemolish, planBuild, planDemolish, type BuildPlan } from '../core/planning';
import { serialize, deserialize } from '../core/save';
import { analyze, houseCapacity, missingNeeds, type Analysis } from '../core/sim/analyze';
import { adjacentPaths, pathDistances } from '../core/sim/coverage';
import { endTurn, forecast, seasonOf, yearOf } from '../core/sim/turn';
import { TUTORIAL_STEPS, tutorialProgress, type TutorialStepId } from '../core/tutorial';
import {
  GOODS,
  RAW_GOODS,
  SERVICES,
  type Building,
  type BuildingDef,
  type CityDef,
  type GameState,
  type Goal,
  type Lang,
  type Need,
  type Point,
  type Rotation,
  type ServiceKind,
  type ChronicleEntry,
  type PuzzleDef,
  type TurnReport,
  type Wish,
} from '../core/types';
import { BUILD_MENU, BUILDINGS, type BuildingId } from '../data/buildings';
import { fill, plural, type Strings } from '../data/i18n';
import { rulesFor } from '../data/rules';
import { fitCamera, gridToWorld, pickTile, zoomAt, type Camera } from '../render/iso';
import { buildingIcon, nightAt, Scene, type Overlay } from '../render/renderer';
import { button, node } from './dom';
import { icon, type IconName } from './icons';
import { showHelp, showSettings, stepLabel } from './panels';
import {
  dayNightOn,
  motionOff,
  musicOn,
  storeTutorialStep,
  tutorialKnown,
  tutorialStep as storedTutorialStep,
} from './prefs';
import { play } from './sound';
import { playMusic, stopMusic, styleFor } from './music';
import { worldMap } from './worldmap';
import {
  adoptLegacySave,
  bestStars,
  lastCity,
  lastWasSandbox,
  achieved,
  addAchieved,
  addDailyScore,
  dailyScores,
  loadGame,
  markPuzzleSolved,
  saveGame,
  solvedPuzzles,
} from './storage';

type Tool =
  | { kind: 'select' }
  | { kind: 'demolish' }
  | { kind: 'repair' }
  | { kind: 'raise' }
  | { kind: 'move' }
  | { kind: 'raze' }
  | { kind: 'land' }
  | { kind: 'build'; def: BuildingId };

type View = 'normal' | 'appeal' | ServiceKind;
type Group = 'basics' | 'supply' | 'services' | 'craft' | 'farm' | 'green';

const GROUPS: readonly Group[] = ['basics', 'supply', 'services', 'craft', 'farm', 'green'];
const GROUP_OF: Record<BuildingDef['category'], Group> = {
  path: 'basics',
  housing: 'basics',
  water: 'supply',
  food: 'supply',
  faith: 'services',
  safety: 'services',
  health: 'services',
  culture: 'services',
  craft: 'craft',
  admin: 'craft',
  green: 'green',
  farm: 'farm',
};

const SHORTAGES = new Set<string>(['noGold', 'noMaterials', 'noBuildPoints']);

/** Pointer movement below this many CSS pixels still counts as a click. */
const CLICK_SLOP = 6;

const SHADE = {
  reach: 'rgba(70, 120, 190, 0.38)',
  good: 'rgba(96, 160, 72, 0.6)',
  bad: 'rgba(196, 72, 56, 0.6)',
};

export interface Elements {
  canvas: HTMLCanvasElement;
  tabs: HTMLElement;
  tools: HTMLElement;
  hint: HTMLElement;
  info: HTMLElement;
  resources: HTMLElement;
  date: HTMLElement;
  menu: HTMLButtonElement;
  undo: HTMLButtonElement;
  end: HTMLButtonElement;
  view: HTMLSelectElement;
  viewLabel: HTMLElement;
  report: HTMLDialogElement;
  goals: HTMLDialogElement;
  cities: HTMLDialogElement;
  settings: HTMLDialogElement;
  help: HTMLDialogElement;
  bank: HTMLDialogElement;
  market: HTMLDialogElement;
  festival: HTMLDialogElement;
  chronicle: HTMLDialogElement;
  achievements: HTMLDialogElement;
  tutorial: HTMLElement;
}

/** Which buttons a tutorial step points at. */
const NUDGES: Partial<
  Record<TutorialStepId, { tools?: BuildingId[]; end?: boolean; menu?: boolean }>
> = {
  street: { tools: ['street'] },
  houses: { tools: ['house'] },
  endTurn: { end: true },
  water: { tools: ['well'] },
  market: { tools: ['plaza', 'stall'] },
  grow: { end: true },
  faith: { tools: ['chapel', 'firewatch', 'tree'] },
  goal: { menu: true },
};

type Gesture =
  | { kind: 'pan'; last: Point; moved: number; clickSelects: boolean; cancelsTool: boolean }
  | { kind: 'paint'; from: Point }
  | { kind: 'pinch'; dist: number; mid: Point };

const starText = (stars: readonly boolean[]) => stars.map((s) => (s ? '★' : '☆')).join('');

export function startApp(el: Elements, cities: readonly CityDef[], t: Strings, lang: Lang): void {
  const ctx = el.canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported');
  adoptLegacySave();

  /** Scenarios as cities of their own, next to the plain cities. */
  const scenarios = SCENARIOS.flatMap((sc) => {
    const base = cities.find((c) => c.id === sc.city);
    return base ? [{ def: sc, base, city: scenarioCity(sc, base) }] : [];
  });
  /** Today's date as YYYY-MM-DD, in the player's own time zone. */
  const today = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const dailyBase = () => dailyCity(cities, today());
  const fresh = (def: CityDef, sandbox = false) => {
    if (def.id === 'daily') return newChallenge(dailyBase(), today(), rulesFor(def).balance);
    const sc = sandbox ? undefined : scenarios.find((s) => s.city.id === def.id);
    if (sc) return newScenario(sc.def, sc.base, Date.now(), rulesFor(def).balance);
    return newGame(def, Date.now(), rulesFor(def).balance, sandbox);
  };
  const remembered =
    cities.find((c) => c.id === lastCity()) ??
    scenarios.find((s) => s.city.id === lastCity())?.city ??
    (lastCity() === 'daily' ? challengeCity(dailyBase()) : undefined);

  let city: CityDef = remembered ?? cities[0]!;
  /** The general rules, bent by what makes the current town special. */
  let rules = rulesFor(city);
  // Pick up where the player left off, in the normal game or in the sandbox.
  const resumeSandbox = remembered !== undefined && lastWasSandbox();
  let state: GameState = loadGame(city.id, resumeSandbox) ?? fresh(city, resumeSandbox);
  // Yesterday's challenge is not continued.
  if (state.challenge && state.challenge.date !== today()) state = fresh(city);
  /** States from earlier in this turn, for undo. */
  let history: GameState[] = [];
  let analysis: Analysis = analyze(state, rules);
  let outlook: TurnReport = forecast(state, rules, city.goals);
  let comingGoods = state.goods;
  /** How the puzzle stands, when a puzzle is being played. */
  let puzzle: PuzzleStatus | null = null;
  /** What is drawn: the state, with served houses of a puzzle shown lived in. */
  let shown: GameState = state;
  /** Tools that make no sense in a puzzle. */
  const townOnly: HTMLElement[] = [];
  /** Only offered once the new ring of walls stands. */
  let razeButton: HTMLElement | null = null;
  let warnings = new Set<number>();
  let viewShade = new Map<number, string>();
  let rangeShade = new Map<number, string>();

  let cam: Camera = { x: 0, y: 0, zoom: 1 };
  let tool: Tool = { kind: 'select' };
  let group: Group = 'basics';
  let view: View = 'normal';
  let rot: Rotation = 0;
  let selected: Point | null = null;
  let hover: Point | null = null;
  let gesture: Gesture | null = null;
  let plan: BuildPlan | null = null;
  let demolition: Point[] | null = null;
  let screen = { w: 0, h: 0, dpr: 1 };
  let dirty = false;
  const pointers = new Map<number, Point>();
  /** Buildings that barely rise above the ground, so nobody walking behind them is hidden. */
  const LOW: Record<string, number> = {
    well: 0,
    stall: 0,
    fountain: 0,
    tree: 0,
    garden: 0,
    cistern: 0,
    tannery: 12,
    buildersyard: 10,
    field: 0,
    pasture: 0,
    woodlot: 18,
  };
  const scene = new Scene((id) => {
    const def = rules.buildings[id];
    return {
      flat: def?.category === 'path' ? 'path' : def?.canal ? 'canal' : null,
      work: (def?.workers ?? 0) > 0,
      trade: Boolean(def?.trade || def?.delivery || def?.needsPlaza),
      tall: LOW[id] ?? 26,
    };
  });
  /** A message to show in the hint line once the pending gesture has been dealt with. */
  let note: string | null = null;
  const showNote = (): void => {
    if (!note) return;
    el.hint.classList.add('warn');
    el.hint.textContent = note;
    note = null;
  };
  /** The tile the land tool points at, and whether it can be bought. */
  let landTile: { x: number; y: number; ok: boolean } | null = null;
  /** The building picked up with the move tool, and where it would go. */
  let moving: number | null = null;
  let movePreview: { x: number; y: number; ok: boolean }[] = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => motionOff() || reducedMotion.matches;
  /** Tile marker moved with the arrow keys, and where a keyboard-drawn row starts. */
  let cursor: Point | null = null;
  let anchor: Point | null = null;
  /** Step of the tutorial, or null when it is not running. */
  let tutorial: number | null = null;

  const needCtx = () => ({
    hungry: outlook.hungry,
    goodsTypes: outlook.goodsTypes,
    festive: state.event?.kind === 'jugglers' || !!state.festival,
  });
  /** A building's name here: some towns have their own words for things. */
  const nameOf = (defId: string) =>
    city.names?.[defId]?.[lang] ?? t.building[defId as BuildingId] ?? defId;

  // ---------- drawing ----------

  function requestDraw(): void {
    if (dirty) return;
    dirty = true;
    requestAnimationFrame(() => {
      dirty = false;
      const shade = rangeShade.size > 0 ? new Map([...viewShade, ...rangeShade]) : viewShade;
      // A photo shows the town, not what it lacks.
      const photo = document.body.classList.contains('photo');
      const overlay: Overlay = {
        warnings: photo ? new Set() : warnings,
        preview: landTile ? [landTile] : [],
        highlight: null,
        shade,
        dryCanals: analysis.dryCanals,
      };
      if (plan) overlay.preview = plan.tiles;
      else if (movePreview.length > 0) overlay.preview = movePreview;
      else if (demolition) overlay.preview = demolition.map((p) => ({ ...p, ok: false }));
      if (cursor) overlay.highlight = cursor;
      else if (tool.kind === 'select') overlay.highlight = selected;
      else if (!plan && !demolition) overlay.highlight = hover;
      // With reduced motion the picture stands still: smoke and flags are drawn, but frozen.
      // For automated tests that need to click on a particular tile.
      el.canvas.dataset.camera = `${cam.x},${cam.y},${cam.zoom}`;
      const time = calm() ? 0 : performance.now() / 1000;
      // Day and night pass only while the picture moves, and not in photos of a puzzle.
      if (time > 0 && dayNightOn() && !state.puzzle) overlay.night = nightAt(time);
      scene.render(ctx!, shown, cam, screen, overlay, time, city.look);
    });
  }

  /** Music plays while the player wants it and the page is in view; its style follows the town. */
  function updateMusic(): void {
    if (musicOn() && !document.hidden) playMusic(styleFor(city.look));
    else stopMusic();
  }
  // Browsers only let sound start after the player has done something.
  const unlock = () => {
    updateMusic();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', updateMusic);

  // Smoke, flags and water move gently; a dozen frames a second is plenty for that.
  window.setInterval(() => {
    if (!calm() && !document.hidden) requestDraw();
  }, 80);

  function resize(first = false): void {
    const rect = el.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const centreBefore = { x: screen.w / 2, y: screen.h / 2 };
    screen = { w: rect.width, h: rect.height, dpr };
    el.canvas.width = Math.round(rect.width * dpr);
    el.canvas.height = Math.round(rect.height * dpr);
    if (first) cam = fitCamera(state.width, state.height, screen.w, screen.h);
    else {
      // Keep whatever was in the middle of the screen in the middle.
      cam = {
        ...cam,
        x: cam.x + screen.w / 2 - centreBefore.x,
        y: cam.y + screen.h / 2 - centreBefore.y,
      };
    }
    requestDraw();
  }

  function centreOn(p: Point): void {
    const w = gridToWorld(p.x + 0.5, p.y + 0.5);
    cam = { ...cam, x: screen.w / 2 - w.x * cam.zoom, y: screen.h / 2 - w.y * cam.zoom };
  }

  // ---------- state ----------

  /** Colours for the chosen view: who is served, and where the neighbourhood is nice. */
  function computeViewShade(): Map<number, string> {
    const shade = new Map<number, string>();
    // Fields and the like: show the land outside the walls that is free for them.
    if (tool.kind === 'build' && rules.buildings[tool.def]?.countryside) {
      const outside = outsideWalls(state);
      state.terrain.forEach((terrain, i) => {
        if (terrain === 'buildable' && outside[i] && !state.occupancy[i]) shade.set(i, SHADE.reach);
      });
    }
    // Adding floors: mark the houses that could get one, money aside.
    if (tool.kind === 'raise') {
      for (const b of Object.values(state.buildings)) {
        if (!b.house) continue;
        const error = raiseError(state, rules, b.x, b.y, (h) => analysis.covered.fire.has(h.id));
        if (error !== null && !SHORTAGES.has(error)) continue;
        for (let dy = 0; dy < b.h; dy++) {
          for (let dx = 0; dx < b.w; dx++) {
            shade.set(indexOf(state.width, b.x + dx, b.y + dy), SHADE.good);
          }
        }
      }
    }
    if (view === 'normal') return shade;
    if (view === 'appeal') {
      state.terrain.forEach((terrain, i) => {
        if (terrain !== 'buildable') return;
        const value = analysis.appeal[i]!;
        if (value === 0) return;
        const alpha = Math.min(0.65, 0.18 * Math.abs(value)).toFixed(2);
        shade.set(i, value > 0 ? `rgba(70, 150, 60, ${alpha})` : `rgba(190, 70, 50, ${alpha})`);
      });
      return shade;
    }
    for (const i of analysis.reach[view]) shade.set(i, SHADE.reach);
    for (const b of Object.values(state.buildings)) {
      const def = rules.buildings[b.def];
      const cares =
        b.house !== undefined ||
        (view === 'fire' && (def?.fireRisk ?? 0) > 0) ||
        (view === 'water' && def?.needsWater);
      if (!cares) continue;
      const color = analysis.covered[view].has(b.id) ? SHADE.good : SHADE.bad;
      for (let dy = 0; dy < b.h; dy++) {
        for (let dx = 0; dx < b.w; dx++) shade.set(indexOf(state.width, b.x + dx, b.y + dy), color);
      }
    }
    return shade;
  }

  /** Recomputes everything derived from the state and refreshes all panels. */
  function refresh(): void {
    analysis = analyze(state, rules);
    // Playing the turn ahead once gives both the report and the stores as they will be.
    const ahead = endTurn(state, rules, city.goals);
    outlook = ahead.lastReport!;
    comingGoods = ahead.goods;
    warnings = new Set<number>();
    for (const [id, reason] of analysis.idle) if (reason !== 'construction') warnings.add(id);
    for (const id of analysis.dryCanals) warnings.add(id);
    for (const b of Object.values(state.buildings)) {
      if (!b.house) continue;
      const missing = missingNeeds(rules, analysis, b.id, b.house.level, needCtx());
      if (b.damaged || missing.length > 0) warnings.add(b.id);
    }
    const wasSolved = puzzle?.solved ?? true;
    puzzle = state.puzzle ? puzzleStatus(state, rules) : null;
    if (puzzle) {
      warnings = new Set(puzzle.lacking.keys());
      for (const [id, reason] of analysis.idle) if (reason !== 'construction') warnings.add(id);
    }
    el.end.hidden = puzzle !== null;
    el.end.disabled = challengeOver(state);
    shown = state;
    if (puzzle) {
      const lacking = puzzle.lacking;
      const buildings = { ...state.buildings };
      for (const b of Object.values(buildings)) {
        if (b.house && !lacking.has(b.id)) {
          buildings[b.id] = { ...b, house: { ...b.house, level: 2, pop: 1 } };
        }
      }
      shown = { ...state, buildings };
    }
    for (const n of townOnly) n.hidden = puzzle !== null;
    if (razeButton && !puzzle) razeButton.hidden = !hasOuterWall(state, rules.buildings);
    viewShade = computeViewShade();
    updateResources();
    updateInfo();
    updateLocks();
    updateTutorial();
    el.undo.disabled = history.length === 0;
    el.menu.textContent = puzzle
      ? `${puzzle.solved ? '★' : '☆'} ${t.puzzle.title} · ${city.name[lang]}`
      : state.challenge
        ? `${t.daily.menu} · ${city.name[lang]}`
        : state.sandbox
          ? `${t.sandbox} · ${city.name[lang]}`
          : `${starText(state.stars)} ${city.name[lang]}`;
    requestDraw();
    if (musicOn()) updateMusic();
    // Achievements: told once, kept across all games.
    const earned = newAchievements(
      state,
      analysis,
      { puzzlesSolved: solvedPuzzles().length, puzzles: PUZZLES.length },
      achieved(),
    );
    if (earned.length > 0) {
      addAchieved(earned);
      el.hint.classList.remove('warn');
      el.hint.textContent = earned
        .map((id) => fill(t.achievements.new, { name: t.achievements.list[id][0] ?? id }))
        .join(' · ');
      play('star');
    }
    if (puzzle?.solved && !wasSolved && state.puzzle) {
      markPuzzleSolved(state.puzzle.id);
      play('star');
      showPuzzleSolved();
    }
  }

  /** Applies a planning-phase change that can be undone until the turn ends. */
  function change(next: GameState): void {
    if (next === state) return;
    play(
      Object.keys(next.buildings).length < Object.keys(state.buildings).length ? 'remove' : 'build',
    );
    history.push(state);
    state = next;
    saveGame(state);
    refresh();
  }

  function undo(): void {
    const previous = history.pop();
    if (!previous) return;
    state = previous;
    clearPreview();
    saveGame(state);
    refresh();
  }

  function finishTurn(): void {
    if (challengeOver(state)) return;
    state = endTurn(state, rules, city.goals);
    history = [];
    clearPreview();
    saveGame(state);
    refresh();
    if (challengeOver(state) && state.challenge) {
      addDailyScore(state.challenge.date, challengeScore(state));
      play('star');
      showChallengeDone();
      return;
    }
    if (state.lastReport) {
      play(state.lastReport.newStars.length > 0 ? 'star' : 'turn');
      showReport(state.lastReport);
    }
  }

  function openChallenge(restart = false): void {
    const def = challengeCity(dailyBase());
    const saved = restart ? null : loadGame(def.id);
    city = def;
    rules = rulesFor(def);
    state = saved && saved.challenge?.date === today() ? saved : fresh(def);
    tutorial = null;
    history = [];
    selected = null;
    puzzle = null;
    saveGame(state);
    setTool({ kind: 'select' });
    cam = fitCamera(state.width, state.height, screen.w, screen.h);
    showGroup(group);
    refresh();
  }

  function showChallengeDone(): void {
    const date = state.challenge!.date;
    const score = challengeScore(state);
    const best = dailyScores(date);
    const actions = node('div', undefined, 'actions');
    actions.append(
      button(t.cities, () => {
        el.report.close();
        showCities();
      }),
      button(
        t.daily.again,
        () => {
          el.report.close();
          openChallenge(true);
        },
        'primary',
      ),
    );
    el.report.replaceChildren(
      node('h2', `★ ${t.daily.done}`),
      node('p', fill(t.daily.score, { n: score })),
    );
    if (best[0] === score) el.report.append(node('p', t.daily.record, 'good'));
    el.report.append(node('p', fill(t.daily.best, { list: best.join(' · ') }), 'meta'), actions);
    el.report.showModal();
  }

  function openCity(def: CityDef, restart: boolean, sandbox = false): void {
    city = def;
    rules = rulesFor(def);
    state = (restart ? null : loadGame(def.id, sandbox)) ?? fresh(def, sandbox);
    startTutorialIfDue();
    history = [];
    selected = null;
    saveGame(state);
    setTool({ kind: 'select' });
    cam = fitCamera(state.width, state.height, screen.w, screen.h);
    showGroup(group);
    refresh();
  }

  // ---------- panels ----------

  function updateResources(): void {
    if (puzzle && state.puzzle) {
      const needs = state.puzzle.needs.map((n) => t.need[n]).join(', ');
      const left = Object.entries(puzzle.left)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => `${n}× ${nameOf(id)}`)
        .join(', ');
      const served = fill(t.puzzle.served, { a: puzzle.served, b: puzzle.houses });
      el.date.textContent = fill(t.puzzle.needs, { list: needs });
      el.resources.replaceChildren(
        node('span', served, puzzle.solved ? 'chip event' : 'chip'),
        node('span', left ? fill(t.puzzle.left, { list: left }) : '✓', 'chip'),
      );
      return;
    }
    const tiles = countTiles(state);
    const chip = (name: IconName, label: string, value: string, delta?: number) => {
      const c = node('span', undefined, 'chip');
      c.title = label;
      c.append(icon(name), node('span', `${label} `, 'label'), node('b', value));
      if (delta) {
        const sign = delta > 0 ? '+' : '−';
        c.append(node('span', `${sign}${Math.abs(delta)}`, `delta ${delta > 0 ? 'up' : 'down'}`));
      }
      return c;
    };
    const goldDelta =
      outlook.taxes +
      outlook.tradeIncome -
      outlook.upkeep -
      outlook.constructionCost -
      outlook.loanPaid;
    // The gold opens the bank.
    const bankChip = (c: HTMLElement) => {
      c.classList.add('clickable');
      c.tabIndex = 0;
      c.setAttribute('role', 'button');
      c.title = t.bank.title;
      c.addEventListener('click', showBank);
      c.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showBank();
        }
      });
      return c;
    };
    const chips = [
      // In a sandbox nothing runs out.
      state.sandbox
        ? chip('gold', t.res.gold, '∞')
        : bankChip(chip('gold', t.res.gold, String(state.gold), goldDelta)),
      chip(
        'food',
        t.res.food,
        `${state.food}/${analysis.foodCap}`,
        outlook.foodDelivered - outlook.foodEaten,
      ),
      state.sandbox
        ? chip('materials', t.res.materials, '∞')
        : chip(
            'materials',
            t.res.materials,
            `${state.materials}/${analysis.materialsCap}`,
            outlook.materialsDelivered,
          ),
      chip(
        'population',
        t.res.population,
        String(analysis.population),
        outlook.popAfter - outlook.popBefore,
      ),
      chip('buildPoints', t.res.buildPoints, state.sandbox ? '∞' : String(state.buildPoints)),
      chip('free', t.res.free, `${tiles.free}/${tiles.buildable}`),
    ];
    if (state.debt > 0) {
      chips.splice(1, 0, bankChip(node('span', `${t.bank.chip} ${state.debt}`, 'chip debt')));
    }
    // Craft goods only matter once the first workshops can be built.
    if (GOODS.some((g) => state.goods[g] > 0 || comingGoods[g] > 0)) {
      for (const g of GOODS) {
        const c = chip(g, t.good[g], String(state.goods[g]), comingGoods[g] - state.goods[g]);
        c.classList.add('clickable');
        c.tabIndex = 0;
        c.setAttribute('role', 'button');
        c.title = `${t.good[g]} · ${t.market.open}`;
        c.addEventListener('click', showMarket);
        c.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showMarket();
          }
        });
        if (state.hold.includes(g)) c.classList.add('held');
        chips.push(c);
      }
    }
    // Raw materials appear once the countryside yields something.
    const raw = state.raw;
    if (RAW_GOODS.some((g) => raw[g] > 0 || analysis.harvest[g] > 0)) {
      for (const g of RAW_GOODS) {
        chips.push(chip(g, t.raw[g], String(raw[g]), analysis.harvest[g] - analysis.rawUsed[g]));
      }
    }
    const date = `${t.season[seasonOf(state.turn)]}, ${t.year} ${yearOf(state.turn)}`;
    el.date.textContent = date;
    if (state.wish) {
      const c = node(
        'span',
        `♥ ${fill(t.wish.chip, { name: wishName(state.wish) })}`,
        'chip event',
      );
      c.classList.add('clickable', 'wish');
      c.tabIndex = 0;
      c.setAttribute('role', 'button');
      c.title = wishText(state.wish);
      c.addEventListener('click', showWish);
      c.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showWish();
        }
      });
      chips.push(c);
    }
    if ((state.luxury ?? 0) > 0) {
      const c = node('span', `${t.luxury.name} ${state.luxury}`, 'chip');
      c.title = fill(t.luxury.info, { p: Math.round(rules.balance.luxury.taxBonus * 100) });
      chips.push(c);
    }
    if (state.order) {
      const label = `⚖ ${fill(t.order.chip, { city: cityName(state.order.from) })}`;
      const c = node('span', label, 'chip event clickable wish');
      c.tabIndex = 0;
      c.setAttribute('role', 'button');
      c.title = orderText();
      c.addEventListener('click', showMarket);
      c.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showMarket();
        }
      });
      chips.push(c);
    }
    if (state.challenge) {
      const n = Math.min(state.turn + 1, state.challenge.turns);
      chips.unshift(
        node('span', fill(t.daily.turn, { n, m: state.challenge.turns }), 'chip event'),
      );
    }
    if (state.festival) {
      const name = t.festival.name[state.festival];
      chips.push(node('span', fill(t.festival.now, { name }), 'chip event'));
    }
    // On narrow screens the title bar has no room for the date, so it leads the chips instead.
    if (state.event) chips.push(node('span', t.eventNow[state.event.kind], 'chip event'));
    el.resources.replaceChildren(node('span', date, 'chip narrow-only'), ...chips);
  }

  type Add = (tag: 'h2' | 'p', text: string, cls?: string) => void;

  const wishName = (w: Wish) => WISH_NAMES[w.name] ?? '';
  const cityName = (id: string) => cities.find((c) => c.id === id)?.name[lang] ?? id;

  /** The open order, in words. */
  function orderText(): string {
    const o = state.order;
    if (!o) return '';
    return fill(t.order.text, {
      city: cityName(o.from),
      n: o.amount,
      good: t.good[o.good],
      done: o.delivered,
    });
  }

  /** What a resident wishes for, in words. */
  function wishText(w: Wish): string {
    const name = wishName(w);
    if (w.kind === 'near') {
      return fill(t.wish.near, { name, thing: nameOf(w.def), r: rules.balance.wishes.radius });
    }
    if (w.kind === 'level') {
      return fill(t.wish.level, { name, level: t.houseLevel[w.level - 1] ?? '' });
    }
    const have = wishProgress(state, rules, w).current;
    return fill(t.wish.count, { name, thing: nameOf(w.def), have, n: w.count });
  }

  /** Shows the wishing resident's home. */
  function showWish(): void {
    const home = state.wish && state.buildings[state.wish.house];
    if (!home) return;
    setTool({ kind: 'select' });
    selected = { x: home.x, y: home.y };
    centreOn(selected);
    updateInfo();
    requestDraw();
  }

  function describeDef(id: BuildingId, add: Add): void {
    const def = rules.buildings[id]!;
    const parts: string[] = [];
    if (def.upkeep > 0) parts.push(`${t.upkeep}: ${def.upkeep} ${t.res.gold} ${t.perTurn}`);
    if (def.workers > 0) parts.push(`${t.workers}: ${def.workers}`);
    const range = def.services?.[0]?.range;
    if (range && range < 100) parts.push(`${t.range}: ${range}`);
    if (def.produces) {
      parts.push(`${t.makes}: ${def.produces.amount} ${t.good[def.produces.good]} ${t.perTurn}`);
    }
    if (def.harvest) {
      parts.push(fill(t.rawHarvest, { n: def.harvest.amount, good: t.raw[def.harvest.good] }));
    }
    if (def.consumes) {
      const c = def.consumes;
      parts.push(
        fill(t.rawConsumes, { n: c.amount, good: t.raw[c.good], p: Math.round(c.bonus * 100) }),
      );
    }
    if (def.trade) {
      parts.push(fill(t.tradeInfo, { n: def.trade.capacity, gold: def.trade.price }));
    }
    if (def.yields?.gold) parts.push(`${t.makes}: ${def.yields.gold} ${t.res.gold} ${t.perTurn}`);
    if (def.yields?.food) parts.push(`${t.makes}: ${def.yields.food} ${t.res.food} ${t.perTurn}`);
    if (def.appeal) {
      const sign = def.appeal.value > 0 ? '+' : '−';
      parts.push(`${t.appealEffect}: ${sign}${Math.abs(def.appeal.value)}`);
    }
    if (def.size.w * def.size.h > 1) parts.push(`${t.size}: ${def.size.w}×${def.size.h}`);
    if (parts.length > 0) add('p', parts.join(' · '), 'meta');
  }

  function describeHouse(b: Building, add: Add): void {
    const house = b.house!;
    if (puzzle) {
      const lacks = puzzle.lacking.get(b.id);
      if (lacks) {
        add('p', fill(t.puzzle.lacks, { list: lacks.map((n) => t.need[n]).join(', ') }), 'warn');
      } else add('p', t.puzzle.fine, 'good');
      return;
    }
    if (state.wish?.house === b.id) {
      add('p', `♥ ${wishText(state.wish)}`, 'good');
      add('p', fill(t.wish.reward, { gold: state.wish.reward }), 'meta');
    }
    add('p', `${t.inhabitants}: ${house.pop} / ${houseCapacity(rules, b, house.level)}`);
    const storey = rules.balance.storey;
    if (house.storeys || tool.kind === 'raise') {
      add('p', fill(t.storeys, { n: house.storeys ?? 0, max: storey.max }), 'meta');
    }
    if (tool.kind === 'raise' && (house.storeys ?? 0) < storey.max) {
      const cost = raiseCost(rules, b);
      add(
        'p',
        fill(t.raiseNext, { gold: cost.gold, materials: cost.materials, points: cost.buildPoints }),
        'meta',
      );
      add('p', t.raiseShade, 'meta');
    }
    add('p', `${t.appeal}: ${analysis.houseAppeal.get(b.id) ?? 0}`, 'meta');
    if (analysis.boxedIn.has(b.id)) add('p', t.boxedIn, 'meta');
    if (b.damaged) {
      add(
        'p',
        fill(t.idle.damaged, { n: repairCost(BUILDINGS.house!, rules.balance.repairShare) }),
        'warn',
      );
    }
    const names = (needs: Need[]) => needs.map((n) => t.need[n]).join(', ');
    const now = missingNeeds(rules, analysis, b.id, house.level, needCtx());
    if (now.length > 0) {
      add('p', `${t.needsNow}: ${names(now)}`, 'warn');
      if (house.level > 1) add('p', t.declineSoon, 'meta');
      else if (house.pop === 0) add('p', t.vacant, 'meta');
      return;
    }
    if (house.level >= rules.housing.length) {
      add('p', t.topLevel, 'good');
      return;
    }
    const next = missingNeeds(rules, analysis, b.id, house.level + 1, needCtx());
    if (next.length === 0) add('p', t.readyToRise, 'good');
    else add('p', `${t.needsForNext}: ${names(next)}`);
  }

  function lockText(def: BuildingDef): string | null {
    const lock = lockOf(state, def);
    if (!lock) return null;
    if (lock.kind === 'pop') return fill(t.lock.pop, { n: lock.value });
    if (lock.kind === 'requires') return fill(t.lock.requires, { name: nameOf(lock.def) });
    if (lock.kind === 'elsewhere') return null;
    if (lock.kind === 'banned') return t.lock.banned;
    return t.lock.unique;
  }

  function updateInfo(): void {
    el.info.replaceChildren();
    const add: Add = (tag, text, cls) => el.info.append(node(tag, text, cls));
    if (tool.kind === 'land') {
      add('h2', t.toolLand);
      add('p', fill(t.hintLand, { n: state.sandbox ? 0 : landPrice(state, rules.balance.land) }));
      if (state.landBought > 0) add('p', fill(t.landBought, { n: state.landBought }), 'meta');
      return;
    }
    if (tool.kind === 'raise') {
      const s = rules.balance.storey;
      add('h2', t.toolRaise);
      add('p', t.hintRaise);
      add('p', fill(t.raiseNext, { gold: s.gold, materials: s.materials, points: s.buildPoints }));
      add('p', t.raiseShade, 'meta');
      return;
    }
    if (tool.kind === 'build') {
      const def = rules.buildings[tool.def]!;
      add('h2', nameOf(tool.def));
      add('p', t.buildingInfo[tool.def]);
      const locked = lockText(def);
      if (locked) add('p', locked, 'warn');
      const cost = [`${def.cost} ${t.res.gold}`];
      if (def.materials > 0) cost.push(`${def.materials} ${t.res.materials}`);
      cost.push(`${def.buildPoints} ${t.res.buildPoints}`);
      if (!state.puzzle) add('p', `${t.costs}: ${cost.join(' · ')}`);
      if (def.construction) {
        const c = def.construction;
        add(
          'p',
          `${c.turns} × ${c.gold} ${t.res.gold} · ${c.materials} ${t.res.materials} ${t.perTurn}`,
          'meta',
        );
      }
      describeDef(tool.def, add);
      return;
    }
    if (!selected || !inBounds(state.width, state.height, selected.x, selected.y)) {
      add('p', t.infoEmpty);
      return;
    }
    const b = buildingAt(state, selected.x, selected.y);
    if (b?.house) {
      const level = t.houseLevel[b.house.level - 1] ?? t.building.house;
      add('h2', b.def === 'house' ? level : `${nameOf(b.def)} · ${level}`);
      describeHouse(b, add);
      return;
    }
    if (b) {
      const id = b.def as BuildingId;
      const def = rules.buildings[id]!;
      add('h2', nameOf(id));
      add('p', t.buildingInfo[id]);
      if (def.canal) {
        const dry = analysis.dryCanals.has(b.id);
        add('p', dry ? t.canalDry : t.canalFlows, dry ? 'warn' : 'good');
      }
      const idle = analysis.idle.get(b.id);
      if (idle === 'construction') add('p', fill(t.idle.construction, { n: b.construction ?? 0 }));
      else if (idle === 'damaged') {
        add('p', fill(t.idle.damaged, { n: repairCost(def, rules.balance.repairShare) }), 'warn');
      } else if (idle) add('p', t.idle[idle], 'warn');
      else if (def.workers > 0 || def.services) add('p', t.working, 'good');
      if (def.trade) el.info.append(button(t.market.open, showMarket));
      if (b.def === rules.balance.plazaPath) el.info.append(button(t.festival.open, showFestival));
      if (analysis.quarter.has(b.id)) {
        add(
          'p',
          fill(t.quarter, { p: Math.round(rules.balance.guildQuarter.bonus * 100) }),
          'good',
        );
      }
      const supplied = analysis.supplied.get(b.id);
      if (supplied !== undefined && def.consumes) {
        const good = t.raw[def.consumes.good];
        add(
          'p',
          fill(supplied ? t.rawSupplied : t.rawMissing, { good }),
          supplied ? 'good' : 'meta',
        );
      }
      describeDef(id, add);
      return;
    }
    const i = indexOf(state.width, selected.x, selected.y);
    const terrain = state.terrain[i]!;
    add(
      'h2',
      terrain === 'landmark'
        ? (city.landmarkName?.[lang] ?? t.terrain.landmark)
        : t.terrain[terrain],
    );
    if (terrain === 'canal') add('p', t.canalInfo);
    if (terrain === 'buildable') {
      add('p', t.infoFree);
      add('p', `${t.appeal}: ${analysis.appeal[i] ?? 0}`, 'meta');
    }
  }

  function showShortage(reason: string | null | undefined): boolean {
    const known = reason === 'noGold' || reason === 'noMaterials' || reason === 'noBuildPoints';
    el.hint.classList.toggle('warn', known || reason === 'noPieces');
    if (reason === 'noPieces') {
      el.hint.textContent = t.puzzle.noPieces;
      play('no');
      return true;
    }
    if (known) {
      el.hint.textContent = t.shortOf[reason];
      if (reason === 'noGold' && loanRoom(state, rules.balance.loan) > 0) {
        el.hint.textContent += ` ${t.bank.tip}`;
      }
      play('no');
    }
    return known;
  }

  function updateHint(): void {
    if (showShortage(plan?.shortOf)) return;
    if (tool.kind === 'select') el.hint.textContent = t.hintSelect;
    else if (tool.kind === 'demolish') el.hint.textContent = t.hintDemolish;
    else if (tool.kind === 'repair') el.hint.textContent = t.hintRepair;
    else if (tool.kind === 'raise') el.hint.textContent = t.hintRaise;
    else if (tool.kind === 'move') {
      const b = moving !== null ? state.buildings[moving] : undefined;
      const def = b && rules.buildings[b.def];
      el.hint.textContent =
        b && def
          ? fill(t.moveWhere, {
              name: nameOf(b.def),
              gold: state.sandbox ? 0 : moveCost(def, rules.balance.moveShare),
            })
          : t.hintMove;
    } else if (tool.kind === 'raze') {
      el.hint.textContent = fill(t.hintRaze, rules.balance.razing);
    } else if (tool.kind === 'land') {
      el.hint.textContent = fill(t.hintLand, {
        n: state.sandbox ? 0 : landPrice(state, rules.balance.land),
      });
    } else {
      const def = rules.buildings[tool.def]!;
      const drag = def.drag;
      el.hint.textContent = def.countryside
        ? t.hintCountryside
        : drag === 'line'
          ? t.hintLine
          : drag === 'rect'
            ? t.hintRect
            : t.hintSingle;
    }
  }

  function goalText(goal: Goal): string {
    if (goal.kind === 'population') return fill(t.goal.population, { n: goal.value });
    if (goal.kind === 'houses') {
      const level = t.houseLevel[goal.level - 1] ?? String(goal.level);
      return fill(t.goal.houses, { n: goal.count, level });
    }
    if ((goal.count ?? 1) > 1)
      return fill(t.goal.buildings, { n: goal.count!, name: nameOf(goal.def) });
    return fill(t.goal.building, { name: nameOf(goal.def) });
  }

  function showReport(r: TurnReport): void {
    const list = node('ul');
    const line = (text: string, cls?: string) => list.append(node('li', text, cls));
    for (const i of r.newStars) {
      line(`★ ${fill(t.report.star, { goal: goalText(city.goals[i]!) })}`, 'news');
    }
    for (const def of r.completed) line(fill(t.report.completed, { name: nameOf(def) }), 'news');
    if ((r.luxuryUsed ?? 0) > 0) {
      line(fill(t.luxury.report, { n: r.luxuryUsed ?? 0, gold: r.luxuryTaxes ?? 0 }));
    }
    if (r.festival) line(fill(t.festival.report, { name: t.festival.name[r.festival] }), 'news');
    if (r.wishGranted) {
      const w = r.wishGranted;
      line(`♥ ${fill(t.wish.granted, { name: wishName(w), gold: w.reward })}`, 'news');
    }
    if (r.event && !r.event.at) {
      line(
        fill(t.event[r.event.kind], { gold: r.event.gold ?? 0, food: r.event.food ?? 0 }),
        'news',
      );
    }
    if (r.unlocked.length > 0) {
      line(fill(t.report.unlocked, { names: r.unlocked.map(nameOf).join(', ') }), 'news');
    }
    line(fill(t.report.population, { a: r.popBefore, b: r.popAfter }));
    line(fill(t.report.gold, { a: r.taxes, b: r.upkeep }));
    if (r.tradeIncome > 0) line(fill(t.report.trade, { n: r.tradeIncome }));
    // Reports saved before merchants existed have no such entry.
    if ((r.goodsSold ?? 0) > 0) line(plural(t.report.sold, r.goodsSold));
    if (r.constructionCost > 0) line(fill(t.report.construction, { n: r.constructionCost }));
    line(fill(t.report.food, { a: r.foodDelivered, b: r.foodEaten }));
    line(fill(t.report.materials, { a: r.materialsDelivered }));
    if (r.upgraded > 0) line(plural(t.report.upgraded, r.upgraded));
    if (r.downgraded > 0) line(plural(t.report.downgraded, r.downgraded));
    if (r.merged > 0) line(plural(t.report.merged, r.merged));
    if (r.subsidy) line(t.report.subsidy);
    // Reports saved before the bank existed have no such entry.
    if ((r.loanPaid ?? 0) > 0 || (r.loanInterest ?? 0) > 0) {
      line(fill(t.report.loan, { a: r.loanInterest, b: r.loanPaid, n: state.debt }));
    }

    const title = fill(t.report.title, {
      season: t.season[seasonOf(r.turn)],
      year: yearOf(r.turn),
    });
    el.report.replaceChildren(node('h2', title), list);

    const jump = (p: Point) => {
      el.report.close();
      setTool({ kind: 'select' });
      selected = { x: p.x, y: p.y };
      centreOn(selected);
      updateInfo();
      requestDraw();
    };
    const placed = r.event?.at ? r.event : null;
    const fresh = r.wishNew && state.wish === r.wishNew ? r.wishNew : null;
    const ordered = r.orderNew && state.order === r.orderNew ? r.orderNew : null;
    if (r.hints.length > 0 || r.fire || placed || fresh || ordered) {
      const hints = node('div', undefined, 'hints');
      if (ordered) {
        const text = fill(t.order.fresh, {
          city: cityName(ordered.from),
          n: ordered.amount,
          good: t.good[ordered.good],
        });
        hints.append(
          button(`⚖ ${text}`, () => {
            el.report.close();
            showMarket();
          }),
        );
      }
      if (fresh) {
        const home = state.buildings[fresh.house];
        if (home) hints.append(button(`♥ ${wishText(fresh)}`, () => jump(home)));
      }
      if (placed) {
        const text = fill(t.event[placed.kind], { gold: placed.gold ?? 0, food: placed.food ?? 0 });
        hints.append(button(text, () => jump(placed.at!)));
      }
      if (r.fire) {
        const fire = r.fire;
        hints.append(button(fill(t.report.fire, { name: nameOf(fire.def) }), () => jump(fire)));
      }
      for (const h of r.hints) {
        hints.append(button(plural(t.hint[h.kind], h.count), () => jump(h)));
      }
      el.report.append(node('h3', t.report.hintsTitle), hints);
    } else {
      el.report.append(node('p', t.report.allGood));
    }

    const actions = node('div', undefined, 'actions');
    const ok = button(t.continue, () => el.report.close(), 'primary');
    actions.append(ok);
    el.report.append(actions);
    el.report.showModal();
    ok.focus();
  }

  function showBank(): void {
    const terms = rules.balance.loan;
    const room = loanRoom(state, terms);
    const take = (next: { ok: true; state: GameState } | { ok: false }) => {
      if (!next.ok) return;
      change(next.state);
      showBank();
    };
    const percent = (share: number) => String(Math.round(share * 100));
    el.bank.replaceChildren(
      node('h2', t.bank.title),
      node('p', t.bank.intro, 'sub'),
      node('p', fill(t.bank.gold, { n: state.gold })),
      node('p', fill(t.bank.debt, { n: state.debt })),
      node('p', fill(t.bank.limit, { n: loanLimit(state, terms) }), 'meta'),
      node(
        'p',
        fill(t.bank.terms, { p: percent(terms.interest), q: percent(terms.installment) }),
        'meta',
      ),
    );
    if (state.debt > 0) {
      el.bank.append(
        node('p', fill(t.bank.next, { a: outlook.loanInterest, b: outlook.loanPaid })),
      );
    }
    const lend = node('div', undefined, 'hints');
    const sums = [terms.step, terms.step * 3, room].filter(
      (n, i, all) => n > 0 && n <= room && all.indexOf(n) === i,
    );
    for (const n of sums) {
      lend.append(button(fill(t.bank.borrow, { n }), () => take(borrow(state, terms, n))));
    }
    if (room <= 0) lend.append(node('p', t.bank.full, 'meta'));
    // How hard the town is taxed.
    const rates = node('div', undefined, 'rates');
    ([0, 1, 2] as const).forEach((r) => {
      const b = button(t.tax.rates[r]!, () => {
        change(setTaxRate(state, r));
        showBank();
      });
      b.setAttribute('aria-pressed', String((state.taxRate ?? 1) === r));
      rates.append(b);
    });
    const taxBox = [
      node('h3', t.tax.title),
      rates,
      node('p', t.tax.info[state.taxRate ?? 1]!, 'meta'),
    ];
    if (state.debt > 0 && state.gold > 0) {
      const part = Math.min(terms.step, state.debt, state.gold);
      lend.append(button(fill(t.bank.repay, { n: part }), () => take(repayLoan(state, part))));
      if (state.gold >= state.debt && state.debt > part) {
        lend.append(button(t.bank.repayAll, () => take(repayLoan(state, state.debt))));
      }
    }
    const actions = node('div', undefined, 'actions');
    const ok = button(t.close, () => el.bank.close(), 'primary');
    actions.append(ok);
    el.bank.append(lend, ...taxBox, actions);
    if (!el.bank.open) el.bank.showModal();
  }

  function showMarket(): void {
    const kontor = Object.values(rules.buildings).find((d) => d.trade);
    const base = analysis.tradePrice || kontor?.trade?.price || 0;
    el.market.replaceChildren(node('h2', t.market.title), node('p', t.market.intro, 'sub'));
    if (analysis.tradePrice === 0) el.market.append(node('p', t.market.noKontor, 'meta'));
    const table = node('table', undefined, 'market');
    const head = node('tr');
    head.append(node('th', ''), node('th', t.market.stock), node('th', t.market.now));
    for (let k = 1; k <= 3; k++) head.append(node('th', t.season[seasonOf(state.turn + k)]));
    head.append(node('th', ''));
    table.append(head);
    for (const g of GOODS) {
      const row = node('tr');
      const name = node('td');
      name.title = t.good[g];
      name.append(icon(g), node('span', ` ${t.good[g]}`, 'label'));
      row.append(name, node('td', String(state.goods[g])));
      const prices = [0, 1, 2, 3].map((k) => goodPrice(state, rules, base, g, state.turn + k));
      const best = Math.max(...prices);
      for (const p of prices) row.append(node('td', String(p), p === best ? 'best' : undefined));
      const held = state.hold.includes(g);
      // One switch per kind of goods: pressed means the merchants keep it in store.
      const toggle = button(t.market.hold, () => {
        change(setHold(state, g, !held));
        showMarket();
      });
      toggle.setAttribute('aria-pressed', String(held));
      toggle.title = held ? t.market.held : t.market.sell;
      const cell = node('td');
      cell.append(toggle);
      row.append(cell);
      table.append(row);
    }
    el.market.append(table);
    const o = state.order;
    if (o) {
      el.market.append(
        node('h3', fill(t.order.title, { city: cityName(o.from) })),
        node('p', orderText()),
        node('p', fill(t.order.reward, { gold: o.gold, lux: o.luxury }), 'meta'),
      );
      const note = node('p', '', 'meta');
      const send = button(t.order.deliver, () => {
        const r = deliverOrder(state, rules);
        if (!r.ok) {
          note.textContent =
            r.reason === 'noGoods'
              ? fill(t.order.noGoods, { good: t.good[o.good] })
              : t.order.noTradingHouse;
          play('no');
          return;
        }
        change(r.state);
        if (r.done) {
          play('star');
          el.hint.classList.remove('warn');
          el.hint.textContent = fill(t.order.done, {
            gold: o.gold,
            lux: o.luxury,
            city: cityName(o.from),
          });
        }
        showMarket();
      });
      el.market.append(send, note);
    }
    if ((state.luxury ?? 0) > 0) {
      el.market.append(
        node('p', `${t.luxury.name}: ${state.luxury}`),
        node(
          'p',
          fill(t.luxury.info, { p: Math.round(rules.balance.luxury.taxBonus * 100) }),
          'meta',
        ),
      );
    }
    const actions = node('div', undefined, 'actions');
    actions.append(button(t.close, () => el.market.close(), 'primary'));
    el.market.append(actions);
    if (!el.market.open) el.market.showModal();
  }

  function openPuzzle(def: PuzzleDef, restart = false): void {
    city = puzzleCity(def);
    rules = rulesFor(city);
    const id = city.id;
    state = (restart ? null : loadGame(id, true)) ?? newPuzzle(def, rules.balance);
    tutorial = null;
    history = [];
    selected = null;
    puzzle = null;
    saveGame(state);
    setTool({ kind: 'select' });
    cam = fitCamera(state.width, state.height, screen.w, screen.h);
    showGroup(group);
    refresh();
    // A puzzle opened already solved should not cheer again.
  }

  function showPuzzleSolved(): void {
    const index = PUZZLES.findIndex((p) => p.id === state.puzzle?.id);
    const next = PUZZLES[index + 1];
    const actions = node('div', undefined, 'actions');
    actions.append(
      button(t.cities, () => {
        el.report.close();
        showCities();
      }),
    );
    if (next) {
      actions.append(
        button(
          t.puzzle.next,
          () => {
            el.report.close();
            openPuzzle(next);
          },
          'primary',
        ),
      );
    } else actions.append(button(t.continue, () => el.report.close(), 'primary'));
    el.report.replaceChildren(
      node('h2', `★ ${t.puzzle.solved}`),
      node('p', t.puzzle.solvedText),
      actions,
    );
    el.report.showModal();
  }

  function showFestival(): void {
    const kind = festivalNow(state);
    const fest = rules.balance.festivals;
    const cost = state.sandbox ? { gold: 0, food: 0, materials: 0 } : fest.cost[kind];
    const error = festivalError(state, rules.buildings, fest.cost, rules.balance.plazaPath);
    const actions = node('div', undefined, 'actions');
    const hold = button(
      t.festival.hold,
      () => {
        const r = holdFestival(state, rules.buildings, fest.cost, rules.balance.plazaPath);
        if (!r.ok) return;
        change(r.state);
        play('star');
        el.festival.close();
      },
      'primary',
    );
    hold.disabled = error !== null;
    actions.append(
      button(t.close, () => el.festival.close()),
      hold,
    );
    el.festival.replaceChildren(
      node('h2', `${t.festival.name[kind]}`),
      node('p', t.festival.intro, 'sub'),
      node('p', t.festival.effect[kind]),
      node('p', fill(t.festival.cost, { ...cost }), 'meta'),
    );
    if (error) el.festival.append(node('p', t.festival.no[error], 'warn'));
    el.festival.append(actions);
    el.festival.showModal();
  }

  /** One line of the chronicle, in words. */
  function chronicleLine(e: ChronicleEntry): string {
    const c = t.chronicle;
    switch (e.kind) {
      case 'founded':
        return fill(c.founded, { city: city.name[lang] });
      case 'star': {
        const goal = city.goals[e.n];
        return fill(c.star, { goal: goal ? goalText(goal) : '' });
      }
      case 'completed':
        return fill(c.completed, { name: nameOf(e.def) });
      case 'level':
        return fill(c.level, { level: t.houseLevel[e.n - 1] ?? '' });
      case 'population':
        return fill(c.population, { n: e.n });
      case 'festival':
        return fill(c.festival, { festival: t.festival.name[e.festival] });
      case 'wish':
        return fill(c.wish, { who: WISH_NAMES[e.name] ?? '' });
      case 'order':
        return fill(c.order, { from: cityName(e.from) });
      case 'fire':
        return fill(c.fire, { name: nameOf(e.def) });
      case 'event':
        return c.event[e.event];
      case 'wall':
        return c.wall;
    }
  }

  function showChronicle(): void {
    const entries = state.chronicle ?? [];
    const title = fill(t.chronicle.title, { city: city.name[lang] });
    const book = node('div', undefined, 'chronicle');
    let year = -1;
    let list: HTMLElement | null = null;
    const lines: string[] = [title, ''];
    for (const e of entries) {
      const y = yearOf(e.turn);
      if (y !== year || !list) {
        year = y;
        book.append(node('h3', `${t.year} ${y}`));
        list = node('ul');
        book.append(list);
      }
      const season = t.season[seasonOf(e.turn)];
      const text = chronicleLine(e);
      const item = node('li');
      item.append(node('span', `${season}: `, 'meta'), node('span', text));
      list.append(item);
      lines.push(`${t.year} ${y}, ${season}: ${text}`);
    }
    const note = node('span', '', 'meta');
    const actions = node('div', undefined, 'actions');
    actions.append(
      note,
      button(t.chronicle.copy, () => {
        void navigator.clipboard?.writeText(lines.join('\n')).then(
          () => (note.textContent = t.chronicle.copied),
          () => undefined,
        );
      }),
      button(t.close, () => el.chronicle.close(), 'primary'),
    );
    el.chronicle.replaceChildren(node('h2', title), book, actions);
    el.chronicle.showModal();
    // The newest entries are at the bottom.
    book.scrollTop = book.scrollHeight;
  }

  function showAchievements(): void {
    const have = achieved();
    const grid = node('div', undefined, 'achievements');
    for (const a of ACHIEVEMENTS) {
      const [name, text] = t.achievements.list[a.id];
      const done = have.includes(a.id);
      const card = node('div', undefined, done ? 'achievement done' : 'achievement');
      card.append(node('strong', `${done ? '★' : '☆'} ${name}`), node('span', text, 'meta'));
      grid.append(card);
    }
    const count = have.filter((id) => ACHIEVEMENTS.some((a) => a.id === id)).length;
    const actions = node('div', undefined, 'actions');
    actions.append(button(t.close, () => el.achievements.close(), 'primary'));
    el.achievements.replaceChildren(
      node('h2', t.achievements.title),
      node('p', fill(t.achievements.count, { n: count, m: ACHIEVEMENTS.length }), 'sub'),
      grid,
      actions,
    );
    el.achievements.showModal();
  }

  /** The plan of a city as the game first lays it out. */
  const planOf = (def: CityDef) => parseCity(def).terrain;

  function showShare(): void {
    const box = node('input');
    box.readOnly = true;
    box.className = 'share-link';
    const note = node('span', '', 'meta');
    const actions = node('div', undefined, 'actions');
    const copy = button(t.share.copy, () => {
      void navigator.clipboard?.writeText(box.value).then(
        () => (note.textContent = t.share.copied),
        () => box.select(),
      );
    });
    actions.append(note);
    if (typeof navigator.share === 'function') {
      actions.append(
        button(t.share.send, () => {
          void navigator.share({ title: city.name[lang], url: box.value }).catch(() => undefined);
        }),
      );
    }
    actions.append(
      copy,
      button(t.close, () => el.festival.close(), 'primary'),
    );
    el.festival.replaceChildren(
      node('h2', t.share.title),
      node('p', t.share.intro, 'sub'),
      box,
      actions,
    );
    el.festival.showModal();
    const base = `${location.origin}${location.pathname}`;
    void encodeShare(packTown(state, planOf(city))).then((code) => {
      box.value = `${base}#town=${code}`;
      box.select();
    });
  }

  /** A link with a town in it: offer to open that town as a sandbox. */
  async function receiveShared(code: string): Promise<void> {
    window.history.replaceState(null, '', location.pathname + location.search);
    const shared = (await decodeShare(code)) as SharedTown | null;
    const id = shared?.s?.cityId;
    const def = cities.find((c) => c.id === id) ?? scenarios.find((s) => s.city.id === id)?.city;
    const town = shared && def ? unpackTown(shared, planOf(def), [def.id]) : null;
    const actions = node('div', undefined, 'actions');
    if (!town || !def) {
      actions.append(button(t.close, () => el.report.close(), 'primary'));
      el.report.replaceChildren(node('h2', t.share.received), node('p', t.share.broken), actions);
      el.report.showModal();
      return;
    }
    const people = Object.values(town.buildings).reduce((n, b) => n + (b.house?.pop ?? 0), 0);
    actions.append(
      button(t.close, () => el.report.close()),
      button(
        t.share.view,
        () => {
          el.report.close();
          const visit: GameState = { ...town, sandbox: true };
          delete visit.challenge;
          saveGame(visit);
          openCity(def, false, true);
        },
        'primary',
      ),
    );
    el.report.replaceChildren(
      node('h2', t.share.received),
      node(
        'p',
        fill(t.share.receivedText, { city: def.name[lang], year: yearOf(town.turn), n: people }),
      ),
      actions,
    );
    el.report.showModal();
  }

  /** Everything but the town is hidden; the picture can be saved. Escape or Back ends it. */
  function photoMode(): void {
    document.body.classList.add('photo');
    setTool({ kind: 'select' });
    selected = null;
    const bar = node('div', undefined, 'photo-bar');
    const leave = () => {
      document.body.classList.remove('photo');
      bar.remove();
      window.removeEventListener('keydown', onKey);
      resize();
      refresh();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') leave();
    };
    bar.append(
      button(t.photo.save, () => {
        requestDraw();
        requestAnimationFrame(() => {
          el.canvas.toBlob((blob) => {
            if (!blob) return;
            const link = node('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${city.name[lang]}-${t.year}-${yearOf(state.turn)}.png`;
            link.click();
            URL.revokeObjectURL(link.href);
          }, 'image/png');
        });
      }),
      button(t.photo.back, leave, 'primary'),
    );
    document.body.append(bar);
    window.addEventListener('keydown', onKey);
    resize();
    requestDraw();
  }

  function showGoals(): void {
    if (state.puzzle) {
      const def = PUZZLES.find((p) => p.id === state.puzzle!.id);
      const actions = node('div', undefined, 'actions');
      actions.append(
        button(t.puzzle.restart, () => {
          el.goals.close();
          if (def) openPuzzle(def, true);
        }),
        button(t.cities, () => {
          el.goals.close();
          showCities();
        }),
        button(t.close, () => el.goals.close(), 'primary'),
      );
      el.goals.replaceChildren(
        node('h2', `${t.puzzle.title} · ${city.name[lang]}`),
        node('p', city.blurb[lang], 'sub'),
        node('p', el.date.textContent ?? ''),
        actions,
      );
      el.goals.showModal();
      return;
    }
    el.goals.replaceChildren(
      node('h2', city.name[lang]),
      node('p', city.region[lang], 'sub'),
      node(state.sandbox ? 'p' : 'h3', state.sandbox ? t.sandboxInfo : t.goals),
    );
    (state.sandbox ? [] : city.goals).forEach((goal, i) => {
      const row = node('div', undefined, 'goal');
      const progress = goalProgress(state, goal);
      row.append(
        node('span', state.stars[i] ? '★' : '☆', 'star'),
        node('span', goalText(goal)),
        node('span', `${progress.current} / ${progress.target}`, 'progress'),
      );
      el.goals.append(row);
    });
    if (!state.sandbox) {
      const worth = node('p', fill(t.achievements.value, { n: townValue(state, rules) }), 'meta');
      worth.title = t.achievements.valueInfo;
      el.goals.append(worth);
    }
    const actions = node('div', undefined, 'actions');
    if (!state.sandbox) {
      actions.append(
        button(t.bank.title, () => {
          el.goals.close();
          showBank();
        }),
      );
    }
    actions.append(
      button(t.festival.open, () => {
        el.goals.close();
        showFestival();
      }),
      button(t.chronicle.open, () => {
        el.goals.close();
        showChronicle();
      }),
      button(t.achievements.open, () => {
        el.goals.close();
        showAchievements();
      }),
      button(t.share.open, () => {
        el.goals.close();
        showShare();
      }),
      button(t.photo.open, () => {
        el.goals.close();
        photoMode();
      }),
    );
    actions.append(
      button(t.cities, () => {
        el.goals.close();
        showCities();
      }),
      button(t.help, () => {
        el.goals.close();
        showHelp(el.help, t, rules);
      }),
      button(t.settings, () => {
        el.goals.close();
        openSettings();
      }),
      button(t.close, () => el.goals.close(), 'primary'),
    );
    el.goals.append(actions);
    el.goals.showModal();
  }

  function showCities(): void {
    const pick = (def: CityDef, sandbox = false) => {
      el.cities.close();
      openCity(def, false, sandbox);
    };
    const grid = node('div', undefined, 'cities');
    const pins = cities.map((def, i) => ({
      city: def,
      number: i + 1,
      stars: bestStars(def.id).filter(Boolean).length,
      current: def.id === city.id,
    }));
    cities.forEach((def, i) => {
      const card = node('div', undefined, 'city');
      const saved = loadGame(def.id);
      const tiles = parseCity(def).terrain.filter((x) => x === 'buildable').length;
      const title = node('h3');
      title.append(node('span', String(i + 1), 'number'), def.name[lang]);
      card.append(
        title,
        node('p', def.region[lang], 'meta'),
        node('p', def.blurb[lang]),
        node(
          'p',
          `${t.difficulty}: ${'●'.repeat(def.difficulty)}${'○'.repeat(3 - def.difficulty)} · ${fill(t.tilesInside, { n: tiles })}`,
          'meta',
        ),
        node('p', starText(bestStars(def.id)), 'stars'),
        button(
          saved ? t.resume : t.play,
          () => pick(def),
          def.id === city.id && !state.sandbox ? 'primary' : undefined,
        ),
        button(
          loadGame(def.id, true) ? t.sandboxResume : t.sandbox,
          () => pick(def, true),
          def.id === city.id && state.sandbox ? 'primary' : 'quiet',
        ),
      );
      grid.append(card);
    });
    // Today's challenge.
    const daily = node('div', undefined, 'cities');
    {
      const base = dailyBase();
      const best = dailyScores(today());
      const saved = loadGame('daily');
      const going = saved?.challenge?.date === today() && !challengeOver(saved);
      const card = node('div', undefined, 'city');
      card.append(
        node('h3', fill(t.daily.today, { city: base.name[lang] })),
        node('p', t.daily.intro),
        node(
          'p',
          best.length ? fill(t.daily.best, { list: best.join(' · ') }) : t.daily.none,
          'meta',
        ),
        button(
          going ? t.resume : t.play,
          () => {
            el.cities.close();
            openChallenge(!going);
          },
          state.challenge ? 'primary' : undefined,
        ),
      );
      daily.append(card);
    }

    // Scenarios: known cities with rules of their own.
    const special = node('div', undefined, 'cities');
    for (const sc of scenarios) {
      const card = node('div', undefined, 'city');
      const rulesText: string[] = [fill(t.scenario.on, { city: sc.base.name[lang] })];
      if (sc.def.noLand) rulesText.push(t.scenario.noLand);
      if (sc.def.banned?.length) {
        rulesText.push(fill(t.scenario.banned, { list: sc.def.banned.map(nameOf).join(', ') }));
      }
      card.append(
        node('h3', sc.def.name[lang]),
        node('p', sc.def.blurb[lang]),
        node('p', rulesText.join(' · '), 'meta'),
        node('p', starText(bestStars(sc.city.id)), 'stars'),
        button(
          loadGame(sc.city.id) ? t.resume : t.play,
          () => pick(sc.city),
          sc.city.id === city.id ? 'primary' : undefined,
        ),
      );
      special.append(card);
    }

    // Puzzles: small plans to fill exactly.
    const solved = solvedPuzzles();
    const puzzles = node('div', undefined, 'cities');
    PUZZLES.forEach((def, i) => {
      const card = node('div', undefined, 'city');
      const title = node('h3');
      title.append(node('span', String(i + 1), 'number'), def.name[lang]);
      const needs = def.needs.map((n) => t.need[n]).join(', ');
      const current = state.puzzle?.id === def.id;
      card.append(
        title,
        node('p', def.blurb[lang]),
        node('p', fill(t.puzzle.needs, { list: needs }), 'meta'),
        node('p', solved.includes(def.id) ? '★' : '☆', 'stars'),
        button(
          loadGame(puzzleCity(def).id, true) ? t.resume : t.play,
          () => {
            el.cities.close();
            openPuzzle(def);
          },
          current ? 'primary' : undefined,
        ),
      );
      puzzles.append(card);
    });
    el.cities.replaceChildren(
      node('h2', t.chooseCity),
      worldMap(pins, lang, { world: t.worldMap, europe: t.europe }, pick),
      grid,
      node('h2', t.daily.title),
      daily,
      node('h2', t.scenario.title),
      node('p', t.scenario.intro, 'sub'),
      special,
      node('h2', t.puzzle.title),
      node('p', t.puzzle.intro, 'sub'),
      puzzles,
    );
    el.cities.showModal();
    el.cities.scrollTop = 0;
  }

  function openSettings(): void {
    showSettings(el.settings, t, lang, {
      exportSave() {
        const blob = new Blob([serialize(state)], { type: 'application/json' });
        const link = node('a');
        link.href = URL.createObjectURL(blob);
        link.download = `nienburg-${city.id}-${yearOf(state.turn)}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
      },
      importSave(text) {
        const loaded = deserialize(
          text,
          cities.map((c) => c.id),
        );
        const def = loaded && cities.find((c) => c.id === loaded.cityId);
        if (!loaded || !def) return false;
        saveGame(loaded);
        openCity(def, false, loaded.sandbox === true);
        return true;
      },
      restart: () => openCity(city, true, state.sandbox === true),
      restartTutorial() {
        storeTutorialStep(0);
        const home = cities.find((c) => c.id === 'nienburg') ?? city;
        if (home.id === city.id) {
          startTutorialIfDue();
          refresh();
        } else openCity(home, false);
      },
      changed() {
        updateMusic();
        requestDraw();
      },
    });
  }

  // ---------- tutorial ----------

  /** The tutorial runs on Nienburg only, until it is finished or skipped. */
  function startTutorialIfDue(): void {
    // Someone who already has a town going does not need the first steps explained.
    if (!tutorialKnown() && state.turn > 0) storeTutorialStep(null);
    tutorial = city.id === 'nienburg' && !state.sandbox ? storedTutorialStep() : null;
  }

  function setTutorial(step: number | null): void {
    tutorial = step !== null && step >= TUTORIAL_STEPS.length ? null : step;
    storeTutorialStep(tutorial);
    updateTutorial();
  }

  function updateTutorial(): void {
    for (const marked of document.querySelectorAll('.nudge')) marked.classList.remove('nudge');
    if (tutorial !== null) {
      const reached = tutorialProgress(tutorial, state, analysis, rules);
      if (reached !== tutorial) {
        tutorial = reached >= TUTORIAL_STEPS.length ? null : reached;
        storeTutorialStep(tutorial);
      }
    }
    const step = tutorial === null ? undefined : TUTORIAL_STEPS[tutorial];
    el.tutorial.hidden = !step;
    if (!step || tutorial === null) return;

    const [title, body] = t.tutorial[step.id];
    const last = tutorial === TUTORIAL_STEPS.length - 1;
    const actions = node('div', undefined, 'actions');
    if (!last) actions.append(button(t.skipTutorial, () => setTutorial(null), 'quiet'));
    if (!step.done) actions.append(button(t.next, () => setTutorial(tutorial! + 1), 'primary'));
    if (last) actions.append(button(t.finish, () => setTutorial(null), 'primary'));
    el.tutorial.replaceChildren(
      node('p', stepLabel(t, tutorial, TUTORIAL_STEPS.length), 'meta'),
      node('h2', title),
      node('p', body),
      actions,
    );

    // Point at the buttons this step is about.
    const nudge = NUDGES[step.id];
    if (nudge?.end) el.end.classList.add('nudge');
    if (nudge?.menu) el.menu.classList.add('nudge');
    for (const b of toolButtons) {
      if (b.tool.kind !== 'build' || !nudge?.tools?.includes(b.tool.def)) continue;
      b.node.classList.add('nudge');
      const tab = tabButtons.get(GROUP_OF[rules.buildings[b.tool.def]!.category]);
      if (b.node.hidden) tab?.classList.add('nudge');
    }
  }

  // ---------- toolbar ----------

  const toolButtons: { tool: Tool; node: HTMLButtonElement }[] = [];
  const tabButtons = new Map<Group, HTMLButtonElement>();
  let rotateButton: HTMLButtonElement;

  function sameTool(a: Tool, b: Tool): boolean {
    return a.kind === b.kind && (a.kind !== 'build' || a.def === (b as typeof a).def);
  }

  function updateLocks(): void {
    for (const b of toolButtons) {
      if (b.tool.kind !== 'build') continue;
      b.node.classList.toggle('locked', lockOf(state, rules.buildings[b.tool.def]!) !== null);
      const count = b.node.querySelector('.count');
      if (count && puzzle) {
        const left = puzzle.left[b.tool.def] ?? 0;
        count.textContent = ` ×${left}`;
        b.node.classList.toggle('used', left <= 0);
      }
    }
  }

  function showGroup(next: Group): void {
    group = next;
    for (const [g, tab] of tabButtons) tab.setAttribute('aria-pressed', String(g === group));
    for (const b of toolButtons) {
      if (b.tool.kind !== 'build') continue;
      const def = rules.buildings[b.tool.def]!;
      // In a sandbox even other towns' specialities are on offer.
      const foreign = !state.sandbox && def.cities !== undefined && !def.cities.includes(city.id);
      // A puzzle shows all of its pieces at once, and nothing else.
      const pieces = state.puzzle?.pieces;
      b.node.hidden = pieces ? !pieces[def.id] : foreign || GROUP_OF[def.category] !== group;
      const count = b.node.querySelector('.count');
      if (count) count.textContent = pieces ? ` ×${puzzle?.left[def.id] ?? pieces[def.id]}` : '';
      // Some towns have their own names for buildings.
      const label = b.node.querySelector('.name');
      if (label) label.textContent = nameOf(b.tool.def);
    }
    updateTutorial();
  }

  function setTool(next: Tool): void {
    tool = next;
    rot = 0;
    hover = null;
    anchor = null;
    landTile = null;
    moving = null;
    movePreview = [];
    plan = null;
    demolition = null;
    rangeShade = new Map();
    viewShade = computeViewShade();
    for (const b of toolButtons) {
      b.node.setAttribute('aria-pressed', String(sameTool(b.tool, tool)));
    }
    const rotatable =
      tool.kind === 'build' &&
      rules.buildings[tool.def]!.size.w !== rules.buildings[tool.def]!.size.h;
    rotateButton.hidden = !rotatable;
    el.canvas.classList.toggle('building', tool.kind !== 'select');
    updateHint();
    updateInfo();
    requestDraw();
  }

  function rotate(): void {
    if (rotateButton.hidden) return;
    rot = rot === 0 ? 1 : 0;
    if (hover) refreshPreview(hover, hover);
    requestDraw();
  }

  function buildToolbar(): void {
    const toolButton = (label: string, target: Tool, parent: HTMLElement) => {
      const b = button(label, () => setTool(target));
      parent.append(b);
      toolButtons.push({ tool: target, node: b });
    };
    el.tabs.setAttribute('aria-label', t.buildMenu);
    toolButton(t.toolSelect, { kind: 'select' }, el.tabs);
    el.tabs.append(node('span', undefined, 'sep'));
    for (const g of GROUPS) {
      const tab = button(t.category[g], () => showGroup(g));
      tabButtons.set(g, tab);
      el.tabs.append(tab);
      townOnly.push(tab);
    }
    el.tabs.append(node('span', undefined, 'sep'));
    toolButton(t.toolLand, { kind: 'land' }, el.tabs);
    toolButton(t.toolMove, { kind: 'move' }, el.tabs);
    toolButton(t.toolRaise, { kind: 'raise' }, el.tabs);
    toolButton(t.toolRepair, { kind: 'repair' }, el.tabs);
    toolButton(t.toolRaze, { kind: 'raze' }, el.tabs);
    razeButton = toolButtons[toolButtons.length - 1]!.node;
    // Moving pieces about is handy in a puzzle too; the rest is for towns only.
    const forTowns = ['land', 'raise', 'repair', 'raze'];
    townOnly.push(...toolButtons.filter((b) => forTowns.includes(b.tool.kind)).map((b) => b.node));
    toolButton(t.toolDemolish, { kind: 'demolish' }, el.tabs);

    for (const id of BUILD_MENU) {
      toolButton('', { kind: 'build', def: id }, el.tools);
      toolButtons[toolButtons.length - 1]!.node.append(
        buildingIcon(rules.buildings[id]!),
        node('span', t.building[id], 'name'),
        node('span', '', 'count'),
      );
    }
    rotateButton = button(t.rotate, rotate);
    el.tools.append(rotateButton);

    el.viewLabel.textContent = t.view;
    const option = (value: View, label: string) => {
      const o = node('option', label);
      o.value = value;
      el.view.append(o);
    };
    option('normal', t.viewNormal);
    option('appeal', t.viewAppeal);
    for (const kind of SERVICES) option(kind, t.viewService[kind]);
    el.view.addEventListener('change', () => setView(el.view.value as View));
  }

  function setView(next: View): void {
    view = next;
    el.view.value = next;
    viewShade = computeViewShade();
    requestDraw();
  }

  // ---------- map interaction ----------

  function localPos(e: PointerEvent | WheelEvent): Point {
    const rect = el.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** Where the services of a building about to be placed would reach. */
  function computeRange(built: BuildPlan, def: BuildingDef): Map<number, string> {
    const shade = new Map<number, string>();
    const anchor = built.anchors[0];
    if (!def.services || built.anchors.length !== 1 || !anchor) return shade;
    const placed = buildingAt(built.result, anchor.x, anchor.y);
    if (!placed) return shade;
    const range = Math.max(...def.services.map((s) => s.range));
    const sources = adjacentPaths(built.result, rules, placed);
    for (const i of pathDistances(built.result, rules, sources, range).keys()) {
      shade.set(i, SHADE.reach);
    }
    return shade;
  }

  function refreshPreview(from: Point, to: Point): void {
    plan = null;
    demolition = null;
    rangeShade = new Map();
    if (tool.kind === 'build') {
      const def = rules.buildings[tool.def]!;
      plan = planBuild(state, rules.buildings, def, from, to, rot);
      rangeShade = computeRange(plan, def);
    } else if (tool.kind === 'demolish') {
      demolition = planDemolish(state, from, to);
    } else if (tool.kind === 'land') {
      landTile = { x: to.x, y: to.y, ok: landError(state, to.x, to.y) === null };
    } else if (tool.kind === 'move' && moving !== null) {
      const b = state.buildings[moving];
      const def = b && rules.buildings[b.def];
      movePreview = [];
      if (def) {
        const share = rules.balance.moveShare;
        const ok = moveBuilding(state, rules.buildings, share, moving, to.x, to.y, rot).ok;
        const { w, h } = rot === 1 ? { w: def.size.h, h: def.size.w } : def.size;
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) movePreview.push({ x: to.x + dx, y: to.y + dy, ok });
        }
      }
    }
    updateHint();
  }

  function clearPreview(): void {
    plan = null;
    demolition = null;
    landTile = null;
    movePreview = [];
    rangeShade = new Map();
    updateHint();
  }

  /** Carries out the pending gesture; returns what the town was short of, if anything. */
  function commit(at: Point): string | null {
    const built = tool.kind === 'build' ? plan : null;
    const razed = tool.kind === 'demolish' ? demolition : null;
    let shortOf: string | null = built?.shortOf ?? null;
    plan = null;
    demolition = null;
    rangeShade = new Map();
    if (built) change(built.result);
    else if (razed) {
      change(commitDemolish(state, rules.buildings, rules.balance.demolishRefund, razed));
    } else if (tool.kind === 'repair') {
      const result = repair(state, rules.buildings, rules.balance.repairShare, at.x, at.y);
      if (result.ok) change(result.state);
      else shortOf = result.reason;
    } else if (tool.kind === 'move') {
      movePreview = [];
      if (moving === null) {
        const b = buildingAt(state, at.x, at.y);
        const def = b && rules.buildings[b.def];
        if (!b || !def) return null;
        if (def.category === 'path' || def.canal) {
          note = t.moveNo.notMovable;
          play('no');
          return null;
        }
        moving = b.id;
        rot = b.rot;
        rotateButton.hidden = def.size.w === def.size.h;
        play('build');
        return null;
      }
      const share = rules.balance.moveShare;
      const result = moveBuilding(state, rules.buildings, share, moving, at.x, at.y, rot);
      if (result.ok) {
        moving = null;
        rotateButton.hidden = true;
        change(result.state);
      } else if (result.reason === 'noGold') shortOf = 'noGold';
      else {
        note = t.moveNo.blocked;
        play('no');
        return null;
      }
    } else if (tool.kind === 'raze') {
      const result = razeWall(state, rules.buildings, rules.balance.razing, at.x, at.y);
      if (result.ok) change(result.state);
      else {
        note = t.razeNo[result.reason];
        play('no');
        return null;
      }
    } else if (tool.kind === 'raise') {
      const result = raiseHouse(state, rules, at.x, at.y);
      if (result.ok) change(result.state);
      else if (SHORTAGES.has(result.reason)) shortOf = result.reason;
      else {
        const b = buildingAt(state, at.x, at.y);
        const level = t.houseLevel[(b ? levelForStorey(rules, b) : 2) - 1] ?? '';
        note = fill(t.raiseNo[result.reason as keyof typeof t.raiseNo], { level });
        play('no');
        return null;
      }
    } else if (tool.kind === 'land') {
      const result = buyLand(state, rules.balance.land, at.x, at.y);
      landTile = null;
      if (result.ok) change(result.state);
      else {
        // Say why not; the hint line is the only place for it.
        note = t.landNo[result.reason];
        play('no');
        return null;
      }
    }
    return shortOf;
  }

  function startPinch(): void {
    const [a, b] = [...pointers.values()] as [Point, Point];
    clearPreview();
    gesture = {
      kind: 'pinch',
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  el.canvas.addEventListener('pointerdown', (e) => {
    cursor = null;
    anchor = null;
    el.canvas.setPointerCapture(e.pointerId);
    const pos = localPos(e);
    pointers.set(e.pointerId, pos);
    if (pointers.size === 2) {
      startPinch();
    } else if (pointers.size === 1) {
      const secondary = e.button === 1 || e.button === 2;
      if (secondary || tool.kind === 'select') {
        gesture = {
          kind: 'pan',
          last: pos,
          moved: 0,
          clickSelects: !secondary,
          cancelsTool: e.button === 2,
        };
      } else {
        const from = pickTile(cam, pos.x, pos.y);
        gesture = { kind: 'paint', from };
        refreshPreview(from, from);
      }
    }
    requestDraw();
  });

  el.canvas.addEventListener('pointermove', (e) => {
    const pos = localPos(e);
    if (!pointers.has(e.pointerId)) {
      // Plain mouse hover: show what a click would do.
      if (e.pointerType === 'mouse' && tool.kind !== 'select') {
        hover = pickTile(cam, pos.x, pos.y);
        refreshPreview(hover, hover);
        requestDraw();
      }
      return;
    }
    pointers.set(e.pointerId, pos);
    if (!gesture) return;
    if (gesture.kind === 'pan') {
      const dx = pos.x - gesture.last.x;
      const dy = pos.y - gesture.last.y;
      gesture.moved += Math.abs(dx) + Math.abs(dy);
      gesture.last = pos;
      if (gesture.moved > CLICK_SLOP) cam = { ...cam, x: cam.x + dx, y: cam.y + dy };
    } else if (gesture.kind === 'paint') {
      refreshPreview(gesture.from, pickTile(cam, pos.x, pos.y));
    } else if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()] as [Point, Point];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      cam = { ...cam, x: cam.x + mid.x - gesture.mid.x, y: cam.y + mid.y - gesture.mid.y };
      if (gesture.dist > 0) cam = zoomAt(cam, mid.x, mid.y, dist / gesture.dist);
      gesture.dist = dist;
      gesture.mid = mid;
    }
    requestDraw();
  });

  function endPointer(e: PointerEvent, cancelled: boolean): void {
    if (!pointers.has(e.pointerId)) return;
    const pos = localPos(e);
    pointers.delete(e.pointerId);
    const g = gesture;
    if (g?.kind === 'pinch') {
      // Lifting one finger of a pinch must not paint or select anything.
      if (pointers.size === 0) gesture = null;
      requestDraw();
      return;
    }
    gesture = null;
    if (g?.kind === 'paint') {
      if (cancelled) {
        clearPreview();
      } else {
        const at = pickTile(cam, pos.x, pos.y);
        const shortOf = commit(at);
        if (e.pointerType === 'mouse' && !['repair', 'raise', 'raze', 'move'].includes(tool.kind)) {
          hover = at;
          refreshPreview(hover, hover);
        } else {
          updateHint();
        }
        // Keep a "cannot afford" message visible after the attempt.
        if (shortOf) showShortage(shortOf);
        showNote();
        showNote();
      }
    } else if (g?.kind === 'pan' && !cancelled && g.moved <= CLICK_SLOP) {
      if (g.cancelsTool) setTool({ kind: 'select' });
      else if (g.clickSelects) {
        selected = pickTile(cam, pos.x, pos.y);
        updateInfo();
      }
    }
    requestDraw();
  }

  el.canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  el.canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  el.canvas.addEventListener('pointerleave', () => {
    if (pointers.size > 0) return;
    hover = null;
    clearPreview();
    requestDraw();
  });
  el.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  el.canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const pos = localPos(e);
      cam = zoomAt(cam, pos.x, pos.y, Math.exp(-e.deltaY * 0.0015));
      requestDraw();
    },
    { passive: false },
  );

  const dialogOpen = () =>
    el.report.open ||
    el.goals.open ||
    el.cities.open ||
    el.settings.open ||
    el.help.open ||
    el.bank.open ||
    el.market.open ||
    el.festival.open ||
    el.chronicle.open ||
    el.achievements.open;

  // ---------- keyboard on the map ----------

  /** Moves the tile marker and keeps it on screen. */
  function moveCursor(dx: number, dy: number): void {
    const from = cursor ??
      selected ?? { x: Math.floor(state.width / 2), y: Math.floor(state.height / 2) };
    cursor = {
      x: Math.min(state.width - 1, Math.max(0, from.x + dx)),
      y: Math.min(state.height - 1, Math.max(0, from.y + dy)),
    };
    const w = gridToWorld(cursor.x + 0.5, cursor.y + 0.5);
    const sx = w.x * cam.zoom + cam.x;
    const sy = w.y * cam.zoom + cam.y;
    if (sx < 40 || sy < 40 || sx > screen.w - 40 || sy > screen.h - 40) centreOn(cursor);
    if (tool.kind === 'select') {
      selected = cursor;
      updateInfo();
    } else {
      refreshPreview(anchor ?? cursor, cursor);
    }
    requestDraw();
  }

  /** Enter on the map: what a click on the marked tile would do. */
  function actAtCursor(setAnchor: boolean): void {
    if (!cursor) return moveCursor(0, 0);
    if (tool.kind === 'select') {
      selected = cursor;
      updateInfo();
    } else if (setAnchor) {
      anchor = cursor;
      refreshPreview(anchor, cursor);
    } else {
      refreshPreview(anchor ?? cursor, cursor);
      anchor = null;
      const shortOf = commit(cursor);
      refreshPreview(cursor, cursor);
      if (shortOf) showShortage(shortOf);
      showNote();
    }
    requestDraw();
  }

  el.canvas.addEventListener('blur', () => {
    cursor = null;
    anchor = null;
    clearPreview();
    requestDraw();
  });

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z' && !dialogOpen()) {
        e.preventDefault();
        undo();
      }
      return;
    }
    if (e.altKey || dialogOpen() || e.target === el.view) return;
    const step = 48;
    const key = e.key.toLowerCase();
    if (key >= '0' && key <= '9') {
      // 1–9 pick a view, 0 returns to the normal one.
      const options = [...el.view.options].map((o) => o.value as View);
      setView(options[Number(key)] ?? 'normal');
      return;
    }
    if (document.activeElement === el.canvas) {
      // With the map focused, the arrow keys walk a marker from tile to tile.
      const moves: Record<string, [number, number]> = {
        arrowleft: [-1, 0],
        arrowright: [1, 0],
        arrowup: [0, -1],
        arrowdown: [0, 1],
      };
      const move = moves[key];
      if (move) {
        e.preventDefault();
        moveCursor(move[0], move[1]);
        return;
      }
      if (key === 'enter' || key === ' ') {
        e.preventDefault();
        actAtCursor(e.shiftKey);
        return;
      }
    }
    if (key === 'r') rotate();
    else if (key === 'escape') setTool({ kind: 'select' });
    else if (key === 'arrowleft' || key === 'a') cam = { ...cam, x: cam.x + step };
    else if (key === 'arrowright' || key === 'd') cam = { ...cam, x: cam.x - step };
    else if (key === 'arrowup' || key === 'w') cam = { ...cam, y: cam.y + step };
    else if (key === 'arrowdown' || key === 's') cam = { ...cam, y: cam.y - step };
    else if (key === '+' || key === '=') cam = zoomAt(cam, screen.w / 2, screen.h / 2, 1.2);
    else if (key === '-') cam = zoomAt(cam, screen.w / 2, screen.h / 2, 1 / 1.2);
    else return;
    requestDraw();
  });

  window.addEventListener('resize', () => resize());

  el.undo.textContent = t.undo;
  el.undo.addEventListener('click', undo);
  el.end.textContent = t.endTurn;
  el.end.addEventListener('click', finishTurn);
  el.menu.addEventListener('click', showGoals);

  buildToolbar();
  startTutorialIfDue();
  showGroup('basics');
  setTool({ kind: 'select' });
  resize(true);
  refresh();
  // A link with a town in it comes first; otherwise, on a first visit, let the player pick a town.
  const shared = /^#town=(.+)$/.exec(location.hash);
  if (shared) void receiveShared(shared[1]!);
  else if (!remembered) showCities();
}
