import { buildingAt, countTiles, lockOf, repair, repairCost } from '../core/actions';
import { newGame, parseCity } from '../core/city';
import { goalProgress } from '../core/goals';
import { inBounds, indexOf } from '../core/grid';
import { commitDemolish, planBuild, planDemolish, type BuildPlan } from '../core/planning';
import { serialize, deserialize } from '../core/save';
import { analyze, houseCapacity, missingNeeds, type Analysis } from '../core/sim/analyze';
import { adjacentPaths, pathDistances } from '../core/sim/coverage';
import { endTurn, forecast, seasonOf, yearOf } from '../core/sim/turn';
import { TUTORIAL_STEPS, tutorialProgress, type TutorialStepId } from '../core/tutorial';
import {
  GOODS,
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
  type TurnReport,
} from '../core/types';
import { BUILD_MENU, BUILDINGS, type BuildingId } from '../data/buildings';
import { fill, plural, type Strings } from '../data/i18n';
import { RULES } from '../data/rules';
import { fitCamera, gridToWorld, pickTile, zoomAt, type Camera } from '../render/iso';
import { buildingIcon, Scene, type Overlay } from '../render/renderer';
import { button, node } from './dom';
import { icon, type IconName } from './icons';
import { showHelp, showSettings, stepLabel } from './panels';
import {
  motionOff,
  storeTutorialStep,
  tutorialKnown,
  tutorialStep as storedTutorialStep,
} from './prefs';
import { play } from './sound';
import { adoptLegacySave, bestStars, lastCity, loadGame, saveGame } from './storage';

type Tool =
  | { kind: 'select' }
  | { kind: 'demolish' }
  | { kind: 'repair' }
  | { kind: 'build'; def: BuildingId };

type View = 'normal' | 'appeal' | ServiceKind;
type Group = 'basics' | 'supply' | 'services' | 'craft' | 'green';

const GROUPS: readonly Group[] = ['basics', 'supply', 'services', 'craft', 'green'];
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
};

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

  const fresh = (def: CityDef) => newGame(def, Date.now(), RULES.balance);
  const remembered = cities.find((c) => c.id === lastCity());

  let city: CityDef = remembered ?? cities[0]!;
  let state: GameState = loadGame(city.id) ?? fresh(city);
  /** States from earlier in this turn, for undo. */
  let history: GameState[] = [];
  let analysis: Analysis = analyze(state, RULES);
  let outlook: TurnReport = forecast(state, RULES, city.goals);
  let comingGoods = state.goods;
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
  const scene = new Scene((id) => BUILDINGS[id]?.category === 'path');
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
    festive: state.event?.kind === 'jugglers',
  });
  const nameOf = (defId: string) => t.building[defId as BuildingId] ?? defId;

  // ---------- drawing ----------

  function requestDraw(): void {
    if (dirty) return;
    dirty = true;
    requestAnimationFrame(() => {
      dirty = false;
      const shade = rangeShade.size > 0 ? new Map([...viewShade, ...rangeShade]) : viewShade;
      const overlay: Overlay = { warnings, preview: [], highlight: null, shade };
      if (plan) overlay.preview = plan.tiles;
      else if (demolition) overlay.preview = demolition.map((p) => ({ ...p, ok: false }));
      if (cursor) overlay.highlight = cursor;
      else if (tool.kind === 'select') overlay.highlight = selected;
      else if (!plan && !demolition) overlay.highlight = hover;
      // With reduced motion the picture stands still: smoke and flags are drawn, but frozen.
      const time = calm() ? 0 : performance.now() / 1000;
      scene.render(ctx!, state, cam, screen, overlay, time);
    });
  }

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
      const def = BUILDINGS[b.def];
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
    analysis = analyze(state, RULES);
    // Playing the turn ahead once gives both the report and the stores as they will be.
    const ahead = endTurn(state, RULES, city.goals);
    outlook = ahead.lastReport!;
    comingGoods = ahead.goods;
    warnings = new Set<number>();
    for (const [id, reason] of analysis.idle) if (reason !== 'construction') warnings.add(id);
    for (const b of Object.values(state.buildings)) {
      if (!b.house) continue;
      const missing = missingNeeds(RULES, analysis, b.id, b.house.level, needCtx());
      if (b.damaged || missing.length > 0) warnings.add(b.id);
    }
    viewShade = computeViewShade();
    updateResources();
    updateInfo();
    updateLocks();
    updateTutorial();
    el.undo.disabled = history.length === 0;
    el.menu.textContent = `${starText(state.stars)} ${city.name[lang]}`;
    requestDraw();
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
    state = endTurn(state, RULES, city.goals);
    history = [];
    clearPreview();
    saveGame(state);
    refresh();
    if (state.lastReport) {
      play(state.lastReport.newStars.length > 0 ? 'star' : 'turn');
      showReport(state.lastReport);
    }
  }

  function openCity(def: CityDef, restart: boolean): void {
    city = def;
    state = (restart ? null : loadGame(def.id)) ?? fresh(def);
    startTutorialIfDue();
    history = [];
    selected = null;
    saveGame(state);
    setTool({ kind: 'select' });
    cam = fitCamera(state.width, state.height, screen.w, screen.h);
    refresh();
  }

  // ---------- panels ----------

  function updateResources(): void {
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
      outlook.taxes + outlook.tradeIncome - outlook.upkeep - outlook.constructionCost;
    const chips = [
      chip('gold', t.res.gold, String(state.gold), goldDelta),
      chip(
        'food',
        t.res.food,
        `${state.food}/${analysis.foodCap}`,
        outlook.foodDelivered - outlook.foodEaten,
      ),
      chip(
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
      chip('buildPoints', t.res.buildPoints, String(state.buildPoints)),
      chip('free', t.res.free, `${tiles.free}/${tiles.buildable}`),
    ];
    // Craft goods only matter once the first workshops can be built.
    if (GOODS.some((g) => state.goods[g] > 0 || comingGoods[g] > 0)) {
      for (const g of GOODS) {
        chips.push(chip(g, t.good[g], String(state.goods[g]), comingGoods[g] - state.goods[g]));
      }
    }
    const date = `${t.season[seasonOf(state.turn)]}, ${t.year} ${yearOf(state.turn)}`;
    el.date.textContent = date;
    // On narrow screens the title bar has no room for the date, so it leads the chips instead.
    if (state.event) chips.push(node('span', t.eventNow[state.event.kind], 'chip event'));
    el.resources.replaceChildren(node('span', date, 'chip narrow-only'), ...chips);
  }

  type Add = (tag: 'h2' | 'p', text: string, cls?: string) => void;

  function describeDef(id: BuildingId, add: Add): void {
    const def = BUILDINGS[id]!;
    const parts: string[] = [];
    if (def.upkeep > 0) parts.push(`${t.upkeep}: ${def.upkeep} ${t.res.gold} ${t.perTurn}`);
    if (def.workers > 0) parts.push(`${t.workers}: ${def.workers}`);
    const range = def.services?.[0]?.range;
    if (range && range < 100) parts.push(`${t.range}: ${range}`);
    if (def.produces) {
      parts.push(`${t.makes}: ${def.produces.amount} ${t.good[def.produces.good]} ${t.perTurn}`);
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
    add('p', `${t.inhabitants}: ${house.pop} / ${houseCapacity(RULES, b, house.level)}`);
    add('p', `${t.appeal}: ${analysis.houseAppeal.get(b.id) ?? 0}`, 'meta');
    if (analysis.boxedIn.has(b.id)) add('p', t.boxedIn, 'meta');
    if (b.damaged) {
      add(
        'p',
        fill(t.idle.damaged, { n: repairCost(BUILDINGS.house!, RULES.balance.repairShare) }),
        'warn',
      );
    }
    const names = (needs: Need[]) => needs.map((n) => t.need[n]).join(', ');
    const now = missingNeeds(RULES, analysis, b.id, house.level, needCtx());
    if (now.length > 0) {
      add('p', `${t.needsNow}: ${names(now)}`, 'warn');
      if (house.level > 1) add('p', t.declineSoon, 'meta');
      else if (house.pop === 0) add('p', t.vacant, 'meta');
      return;
    }
    if (house.level >= RULES.housing.length) {
      add('p', t.topLevel, 'good');
      return;
    }
    const next = missingNeeds(RULES, analysis, b.id, house.level + 1, needCtx());
    if (next.length === 0) add('p', t.readyToRise, 'good');
    else add('p', `${t.needsForNext}: ${names(next)}`);
  }

  function lockText(def: BuildingDef): string | null {
    const lock = lockOf(state, def);
    if (!lock) return null;
    if (lock.kind === 'pop') return fill(t.lock.pop, { n: lock.value });
    if (lock.kind === 'requires') return fill(t.lock.requires, { name: nameOf(lock.def) });
    return t.lock.unique;
  }

  function updateInfo(): void {
    el.info.replaceChildren();
    const add: Add = (tag, text, cls) => el.info.append(node(tag, text, cls));
    if (tool.kind === 'build') {
      const def = BUILDINGS[tool.def]!;
      add('h2', t.building[tool.def]);
      add('p', t.buildingInfo[tool.def]);
      const locked = lockText(def);
      if (locked) add('p', locked, 'warn');
      const cost = [`${def.cost} ${t.res.gold}`];
      if (def.materials > 0) cost.push(`${def.materials} ${t.res.materials}`);
      cost.push(`${def.buildPoints} ${t.res.buildPoints}`);
      add('p', `${t.costs}: ${cost.join(' · ')}`);
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
      add('h2', t.houseLevel[b.house.level - 1] ?? t.building.house);
      describeHouse(b, add);
      return;
    }
    if (b) {
      const id = b.def as BuildingId;
      const def = BUILDINGS[id]!;
      add('h2', t.building[id]);
      add('p', t.buildingInfo[id]);
      const idle = analysis.idle.get(b.id);
      if (idle === 'construction') add('p', fill(t.idle.construction, { n: b.construction ?? 0 }));
      else if (idle === 'damaged') {
        add('p', fill(t.idle.damaged, { n: repairCost(def, RULES.balance.repairShare) }), 'warn');
      } else if (idle) add('p', t.idle[idle], 'warn');
      else if (def.workers > 0 || def.services) add('p', t.working, 'good');
      describeDef(id, add);
      return;
    }
    const i = indexOf(state.width, selected.x, selected.y);
    const terrain = state.terrain[i]!;
    add('h2', t.terrain[terrain]);
    if (terrain === 'buildable') {
      add('p', t.infoFree);
      add('p', `${t.appeal}: ${analysis.appeal[i] ?? 0}`, 'meta');
    }
  }

  function showShortage(reason: string | null | undefined): boolean {
    const known = reason === 'noGold' || reason === 'noMaterials' || reason === 'noBuildPoints';
    el.hint.classList.toggle('warn', known);
    if (known) {
      el.hint.textContent = t.shortOf[reason];
      play('no');
    }
    return known;
  }

  function updateHint(): void {
    if (showShortage(plan?.shortOf)) return;
    if (tool.kind === 'select') el.hint.textContent = t.hintSelect;
    else if (tool.kind === 'demolish') el.hint.textContent = t.hintDemolish;
    else if (tool.kind === 'repair') el.hint.textContent = t.hintRepair;
    else {
      const drag = BUILDINGS[tool.def]!.drag;
      el.hint.textContent =
        drag === 'line' ? t.hintLine : drag === 'rect' ? t.hintRect : t.hintSingle;
    }
  }

  function goalText(goal: Goal): string {
    if (goal.kind === 'population') return fill(t.goal.population, { n: goal.value });
    if (goal.kind === 'houses') {
      const level = t.houseLevel[goal.level - 1] ?? String(goal.level);
      return fill(t.goal.houses, { n: goal.count, level });
    }
    return fill(t.goal.building, { name: nameOf(goal.def) });
  }

  function showReport(r: TurnReport): void {
    const list = node('ul');
    const line = (text: string, cls?: string) => list.append(node('li', text, cls));
    for (const i of r.newStars) {
      line(`★ ${fill(t.report.star, { goal: goalText(city.goals[i]!) })}`, 'news');
    }
    for (const def of r.completed) line(fill(t.report.completed, { name: nameOf(def) }), 'news');
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
    if (r.hints.length > 0 || r.fire || placed) {
      const hints = node('div', undefined, 'hints');
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

  function showGoals(): void {
    el.goals.replaceChildren(
      node('h2', city.name[lang]),
      node('p', city.region[lang], 'sub'),
      node('h3', t.goals),
    );
    city.goals.forEach((goal, i) => {
      const row = node('div', undefined, 'goal');
      const progress = goalProgress(state, goal);
      row.append(
        node('span', state.stars[i] ? '★' : '☆', 'star'),
        node('span', goalText(goal)),
        node('span', `${progress.current} / ${progress.target}`, 'progress'),
      );
      el.goals.append(row);
    });
    const actions = node('div', undefined, 'actions');
    actions.append(
      button(t.cities, () => {
        el.goals.close();
        showCities();
      }),
      button(t.help, () => {
        el.goals.close();
        showHelp(el.help, t, RULES);
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
    const grid = node('div', undefined, 'cities');
    for (const def of cities) {
      const card = node('div', undefined, 'city');
      const saved = loadGame(def.id);
      const tiles = parseCity(def).terrain.filter((x) => x === 'buildable').length;
      card.append(
        node('h3', def.name[lang]),
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
          () => {
            el.cities.close();
            openCity(def, false);
          },
          def.id === city.id ? 'primary' : undefined,
        ),
      );
      grid.append(card);
    }
    el.cities.replaceChildren(node('h2', t.chooseCity), grid);
    el.cities.showModal();
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
        openCity(def, false);
        return true;
      },
      restart: () => openCity(city, true),
      restartTutorial() {
        storeTutorialStep(0);
        const home = cities.find((c) => c.id === 'nienburg') ?? city;
        if (home.id === city.id) {
          startTutorialIfDue();
          refresh();
        } else openCity(home, false);
      },
      changed: requestDraw,
    });
  }

  // ---------- tutorial ----------

  /** The tutorial runs on Nienburg only, until it is finished or skipped. */
  function startTutorialIfDue(): void {
    // Someone who already has a town going does not need the first steps explained.
    if (!tutorialKnown() && state.turn > 0) storeTutorialStep(null);
    tutorial = city.id === 'nienburg' ? storedTutorialStep() : null;
  }

  function setTutorial(step: number | null): void {
    tutorial = step !== null && step >= TUTORIAL_STEPS.length ? null : step;
    storeTutorialStep(tutorial);
    updateTutorial();
  }

  function updateTutorial(): void {
    for (const marked of document.querySelectorAll('.nudge')) marked.classList.remove('nudge');
    if (tutorial !== null) {
      const reached = tutorialProgress(tutorial, state, analysis, RULES);
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
      const tab = tabButtons.get(GROUP_OF[BUILDINGS[b.tool.def]!.category]);
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
      b.node.classList.toggle('locked', lockOf(state, BUILDINGS[b.tool.def]!) !== null);
    }
  }

  function showGroup(next: Group): void {
    group = next;
    for (const [g, tab] of tabButtons) tab.setAttribute('aria-pressed', String(g === group));
    for (const b of toolButtons) {
      if (b.tool.kind !== 'build') continue;
      b.node.hidden = GROUP_OF[BUILDINGS[b.tool.def]!.category] !== group;
    }
    updateTutorial();
  }

  function setTool(next: Tool): void {
    tool = next;
    rot = 0;
    hover = null;
    anchor = null;
    plan = null;
    demolition = null;
    rangeShade = new Map();
    for (const b of toolButtons) {
      b.node.setAttribute('aria-pressed', String(sameTool(b.tool, tool)));
    }
    const rotatable =
      tool.kind === 'build' && BUILDINGS[tool.def]!.size.w !== BUILDINGS[tool.def]!.size.h;
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
    }
    el.tabs.append(node('span', undefined, 'sep'));
    toolButton(t.toolRepair, { kind: 'repair' }, el.tabs);
    toolButton(t.toolDemolish, { kind: 'demolish' }, el.tabs);

    for (const id of BUILD_MENU) {
      toolButton(t.building[id], { kind: 'build', def: id }, el.tools);
      toolButtons[toolButtons.length - 1]!.node.prepend(buildingIcon(BUILDINGS[id]!));
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
    const sources = adjacentPaths(built.result, RULES, placed);
    for (const i of pathDistances(built.result, RULES, sources, range).keys()) {
      shade.set(i, SHADE.reach);
    }
    return shade;
  }

  function refreshPreview(from: Point, to: Point): void {
    plan = null;
    demolition = null;
    rangeShade = new Map();
    if (tool.kind === 'build') {
      const def = BUILDINGS[tool.def]!;
      plan = planBuild(state, BUILDINGS, def, from, to, rot);
      rangeShade = computeRange(plan, def);
    } else if (tool.kind === 'demolish') {
      demolition = planDemolish(state, from, to);
    }
    updateHint();
  }

  function clearPreview(): void {
    plan = null;
    demolition = null;
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
      change(commitDemolish(state, BUILDINGS, RULES.balance.demolishRefund, razed));
    } else if (tool.kind === 'repair') {
      const result = repair(state, BUILDINGS, RULES.balance.repairShare, at.x, at.y);
      if (result.ok) change(result.state);
      else shortOf = result.reason;
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
        if (e.pointerType === 'mouse' && tool.kind !== 'repair') {
          hover = at;
          refreshPreview(hover, hover);
        } else {
          updateHint();
        }
        // Keep a "cannot afford" message visible after the attempt.
        if (shortOf) showShortage(shortOf);
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
    el.report.open || el.goals.open || el.cities.open || el.settings.open || el.help.open;

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
  // First visit: let the player pick a town.
  if (!remembered) showCities();
}
