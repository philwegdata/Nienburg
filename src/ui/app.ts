import { buildingAt, countTiles } from '../core/actions';
import { newGame } from '../core/city';
import { inBounds, indexOf } from '../core/grid';
import { commitDemolish, planBuild, planDemolish, type BuildPlan } from '../core/planning';
import { deserialize, serialize } from '../core/save';
import { analyze, missingNeeds, type Analysis } from '../core/sim/analyze';
import { endTurn, forecast, seasonOf, yearOf } from '../core/sim/turn';
import type { Building, CityDef, GameState, Point, Rotation, TurnReport } from '../core/types';
import { BUILD_MENU, BUILDINGS, type BuildingId } from '../data/buildings';
import { fill, plural, type Strings } from '../data/i18n';
import { RULES } from '../data/rules';
import { fitCamera, gridToWorld, pickTile, zoomAt, type Camera } from '../render/iso';
import { render, type Overlay } from '../render/renderer';

type Tool = { kind: 'select' } | { kind: 'demolish' } | { kind: 'build'; def: BuildingId };

/** Pointer movement below this many CSS pixels still counts as a click. */
const CLICK_SLOP = 6;
const SAVE_KEY = 'nienburg.save';

const SWATCH: Record<BuildingId, string> = {
  alley: '#b89f76',
  street: '#a7a096',
  plaza: '#cfc8b8',
  house: '#a4573b',
  well: '#6f9db8',
  stall: '#d2b955',
  granary: '#d6caac',
  chapel: '#5f6c76',
  firewatch: '#96392c',
  warehouse: '#8c7250',
};

export interface Elements {
  canvas: HTMLCanvasElement;
  tools: HTMLElement;
  hint: HTMLElement;
  info: HTMLElement;
  resources: HTMLElement;
  date: HTMLElement;
  undo: HTMLButtonElement;
  end: HTMLButtonElement;
  newGame: HTMLButtonElement;
  report: HTMLDialogElement;
}

type Gesture =
  | { kind: 'pan'; last: Point; moved: number; clickSelects: boolean; cancelsTool: boolean }
  | { kind: 'paint'; from: Point }
  | { kind: 'pinch'; dist: number; mid: Point };

function loadSave(cityIds: string[]): GameState | null {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    return text ? deserialize(text, cityIds) : null;
  } catch {
    return null;
  }
}

function writeSave(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, serialize(state));
  } catch {
    // Storage may be unavailable (private mode, quota); the game still works without it.
  }
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  cls?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

export function startApp(el: Elements, city: CityDef, t: Strings): void {
  const ctx = el.canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported');

  const fresh = () => newGame(city, Date.now(), RULES.balance);

  let state: GameState = loadSave([city.id]) ?? fresh();
  /** States from earlier in this turn, for undo. */
  let history: GameState[] = [];
  let analysis: Analysis = analyze(state, RULES);
  let outlook: TurnReport = forecast(state, RULES);
  let warnings = new Set<number>();

  let cam: Camera = { x: 0, y: 0, zoom: 1 };
  let tool: Tool = { kind: 'select' };
  let rot: Rotation = 0;
  let selected: Point | null = null;
  let hover: Point | null = null;
  let gesture: Gesture | null = null;
  let plan: BuildPlan | null = null;
  let demolition: Point[] | null = null;
  let view = { w: 0, h: 0, dpr: 1 };
  let dirty = false;
  const pointers = new Map<number, Point>();

  // ---------- drawing ----------

  function requestDraw(): void {
    if (dirty) return;
    dirty = true;
    requestAnimationFrame(() => {
      dirty = false;
      const overlay: Overlay = { warnings, preview: [], highlight: null };
      if (plan) overlay.preview = plan.tiles;
      else if (demolition) overlay.preview = demolition.map((p) => ({ ...p, ok: false }));
      if (tool.kind === 'select') overlay.highlight = selected;
      else if (!plan && !demolition) overlay.highlight = hover;
      render(ctx!, state, cam, view.w, view.h, view.dpr, overlay, (id) => {
        return BUILDINGS[id]?.category === 'path';
      });
    });
  }

  function resize(first = false): void {
    const rect = el.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const centreBefore = { x: view.w / 2, y: view.h / 2 };
    view = { w: rect.width, h: rect.height, dpr };
    el.canvas.width = Math.round(rect.width * dpr);
    el.canvas.height = Math.round(rect.height * dpr);
    if (first) cam = fitCamera(state.width, state.height, view.w, view.h);
    else {
      // Keep whatever was in the middle of the screen in the middle.
      cam = {
        ...cam,
        x: cam.x + view.w / 2 - centreBefore.x,
        y: cam.y + view.h / 2 - centreBefore.y,
      };
    }
    requestDraw();
  }

  function centreOn(p: Point): void {
    const w = gridToWorld(p.x + 0.5, p.y + 0.5);
    cam = { ...cam, x: view.w / 2 - w.x * cam.zoom, y: view.h / 2 - w.y * cam.zoom };
  }

  // ---------- state ----------

  /** Recomputes everything derived from the state and refreshes all panels. */
  function refresh(): void {
    analysis = analyze(state, RULES);
    outlook = forecast(state, RULES);
    warnings = new Set(analysis.idle.keys());
    for (const b of Object.values(state.buildings)) {
      if (!b.house) continue;
      if (missingNeeds(RULES, analysis, b.id, b.house.level, outlook.hungry).length > 0) {
        warnings.add(b.id);
      }
    }
    updateResources();
    updateInfo();
    el.undo.disabled = history.length === 0;
    requestDraw();
  }

  /** Applies a planning-phase change that can be undone until the turn ends. */
  function change(next: GameState): void {
    if (next === state) return;
    history.push(state);
    state = next;
    writeSave(state);
    refresh();
  }

  function undo(): void {
    const previous = history.pop();
    if (!previous) return;
    state = previous;
    plan = null;
    demolition = null;
    writeSave(state);
    refresh();
  }

  function finishTurn(): void {
    state = endTurn(state, RULES);
    history = [];
    plan = null;
    demolition = null;
    writeSave(state);
    refresh();
    if (state.lastReport) showReport(state.lastReport);
  }

  // ---------- panels ----------

  function updateResources(): void {
    const tiles = countTiles(state);
    const chip = (label: string, value: string, delta?: number) => {
      const c = node('span', undefined, 'chip');
      c.append(`${label} `, node('b', value));
      if (delta) {
        const sign = delta > 0 ? '+' : '−';
        c.append(node('span', `${sign}${Math.abs(delta)}`, `delta ${delta > 0 ? 'up' : 'down'}`));
      }
      return c;
    };
    el.resources.replaceChildren(
      chip(t.res.gold, String(state.gold), outlook.taxes - outlook.upkeep),
      chip(
        t.res.food,
        `${state.food}/${analysis.foodCap}`,
        outlook.foodDelivered - outlook.foodEaten,
      ),
      chip(
        t.res.materials,
        `${state.materials}/${analysis.materialsCap}`,
        outlook.materialsDelivered,
      ),
      chip(t.res.population, String(analysis.population), outlook.popAfter - outlook.popBefore),
      chip(t.res.buildPoints, String(state.buildPoints)),
      chip(t.res.free, `${tiles.free}/${tiles.buildable}`),
    );
    el.date.textContent = `${t.season[seasonOf(state.turn)]}, ${t.year} ${yearOf(state.turn)}`;
  }

  function describeDef(id: BuildingId, add: (tag: 'p', text: string, cls?: string) => void): void {
    const def = BUILDINGS[id]!;
    const parts: string[] = [];
    if (def.upkeep > 0) parts.push(`${t.upkeep}: ${def.upkeep} ${t.res.gold} ${t.perTurn}`);
    if (def.workers > 0) parts.push(`${t.workers}: ${def.workers}`);
    if (def.service) parts.push(`${t.range}: ${def.service.range}`);
    if (def.size.w * def.size.h > 1) parts.push(`${t.size}: ${def.size.w}×${def.size.h}`);
    if (parts.length > 0) add('p', parts.join(' · '), 'meta');
  }

  function describeHouse(b: Building, add: (tag: 'p', text: string, cls?: string) => void): void {
    const house = b.house!;
    const level = RULES.housing[house.level - 1]!;
    add('p', `${t.inhabitants}: ${house.pop} / ${level.capacity}`);
    const names = (needs: string[]) =>
      needs.map((n) => t.need[n as keyof typeof t.need]).join(', ');
    const now = missingNeeds(RULES, analysis, b.id, house.level, outlook.hungry);
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
    const next = missingNeeds(RULES, analysis, b.id, house.level + 1, outlook.hungry);
    if (next.length === 0) add('p', t.readyToRise, 'good');
    else add('p', `${t.needsForNext}: ${names(next)}`);
  }

  function updateInfo(): void {
    el.info.replaceChildren();
    const add = (tag: 'h2' | 'p', text: string, cls?: string) => {
      el.info.append(node(tag, text, cls));
    };
    if (tool.kind === 'build') {
      const def = BUILDINGS[tool.def]!;
      add('h2', t.building[tool.def]);
      add('p', t.buildingInfo[tool.def]);
      const cost = [`${def.cost} ${t.res.gold}`];
      if (def.materials > 0) cost.push(`${def.materials} ${t.res.materials}`);
      cost.push(`${def.buildPoints} ${t.res.buildPoints}`);
      add('p', `${t.costs}: ${cost.join(' · ')}`);
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
      add('h2', t.building[id]);
      add('p', t.buildingInfo[id]);
      if (BUILDINGS[id]!.category !== 'path') {
        const idle = analysis.idle.get(b.id);
        if (idle) add('p', t.idle[idle], 'warn');
        else add('p', t.working, 'good');
      }
      describeDef(id, add);
      return;
    }
    const terrain = state.terrain[indexOf(state.width, selected.x, selected.y)]!;
    add('h2', t.terrain[terrain]);
    if (terrain === 'buildable') add('p', t.infoFree);
  }

  function updateHint(): void {
    const shortOf = plan?.shortOf;
    el.hint.classList.toggle('warn', Boolean(shortOf));
    if (shortOf === 'noGold' || shortOf === 'noMaterials' || shortOf === 'noBuildPoints') {
      el.hint.textContent = t.shortOf[shortOf];
    } else if (tool.kind === 'select') el.hint.textContent = t.hintSelect;
    else if (tool.kind === 'demolish') el.hint.textContent = t.hintDemolish;
    else {
      const drag = BUILDINGS[tool.def]!.drag;
      el.hint.textContent =
        drag === 'line' ? t.hintLine : drag === 'rect' ? t.hintRect : t.hintSingle;
    }
  }

  function showReport(r: TurnReport): void {
    const list = node('ul');
    const line = (text: string) => list.append(node('li', text));
    line(fill(t.report.population, { a: r.popBefore, b: r.popAfter }));
    line(fill(t.report.gold, { a: r.taxes, b: r.upkeep }));
    line(fill(t.report.food, { a: r.foodDelivered, b: r.foodEaten }));
    line(fill(t.report.materials, { a: r.materialsDelivered }));
    if (r.upgraded > 0) line(plural(t.report.upgraded, r.upgraded));
    if (r.downgraded > 0) line(plural(t.report.downgraded, r.downgraded));
    if (r.subsidy) line(t.report.subsidy);

    const title = fill(t.report.title, {
      season: t.season[seasonOf(r.turn)],
      year: yearOf(r.turn),
    });
    el.report.replaceChildren(node('h2', title), list);

    if (r.hints.length > 0) {
      const hints = node('div', undefined, 'hints');
      for (const h of r.hints) {
        const button = node('button', plural(t.hint[h.kind], h.count));
        button.type = 'button';
        button.addEventListener('click', () => {
          el.report.close();
          setTool({ kind: 'select' });
          selected = { x: h.x, y: h.y };
          centreOn(selected);
          updateInfo();
          requestDraw();
        });
        hints.append(button);
      }
      el.report.append(node('h3', t.report.hintsTitle), hints);
    } else {
      el.report.append(node('p', t.report.allGood));
    }

    const actions = node('div', undefined, 'actions');
    const ok = node('button', t.continue, 'primary');
    ok.type = 'button';
    ok.addEventListener('click', () => el.report.close());
    actions.append(ok);
    el.report.append(actions);
    el.report.showModal();
    ok.focus();
  }

  const buttons: { tool: Tool; node: HTMLButtonElement }[] = [];
  let rotateButton: HTMLButtonElement;

  function sameTool(a: Tool, b: Tool): boolean {
    return a.kind === b.kind && (a.kind !== 'build' || a.def === (b as typeof a).def);
  }

  function setTool(next: Tool): void {
    tool = next;
    rot = 0;
    plan = null;
    demolition = null;
    hover = null;
    for (const b of buttons) b.node.setAttribute('aria-pressed', String(sameTool(b.tool, tool)));
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
    const addButton = (label: string, target: Tool, swatch?: string) => {
      const button = node('button');
      button.type = 'button';
      if (swatch) {
        const s = node('span', undefined, 'swatch');
        s.style.background = swatch;
        button.append(s);
      }
      button.append(label);
      button.addEventListener('click', () => setTool(target));
      el.tools.append(button);
      buttons.push({ tool: target, node: button });
    };
    el.tools.setAttribute('aria-label', t.buildMenu);
    addButton(t.toolSelect, { kind: 'select' });
    el.tools.append(node('span', undefined, 'sep'));
    for (const id of BUILD_MENU) addButton(t.building[id], { kind: 'build', def: id }, SWATCH[id]);
    el.tools.append(node('span', undefined, 'sep'));
    addButton(t.toolDemolish, { kind: 'demolish' });
    rotateButton = node('button', t.rotate);
    rotateButton.type = 'button';
    rotateButton.addEventListener('click', rotate);
    el.tools.append(rotateButton);
  }

  // ---------- map interaction ----------

  function localPos(e: PointerEvent | WheelEvent): Point {
    const rect = el.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function refreshPreview(from: Point, to: Point): void {
    plan = null;
    demolition = null;
    if (tool.kind === 'build') {
      plan = planBuild(state, BUILDINGS, BUILDINGS[tool.def]!, from, to, rot);
    } else if (tool.kind === 'demolish') {
      demolition = planDemolish(state, from, to);
    }
    updateHint();
  }

  function clearPreview(): void {
    plan = null;
    demolition = null;
    updateHint();
  }

  function commit(): void {
    const built = tool.kind === 'build' ? plan : null;
    const razed = tool.kind === 'demolish' ? demolition : null;
    plan = null;
    demolition = null;
    if (built) change(built.result);
    else if (razed) {
      change(commitDemolish(state, BUILDINGS, RULES.balance.demolishRefund, razed));
    }
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
        // Keep a "cannot afford" message visible after the attempt.
        const shortOf = plan?.shortOf ?? null;
        commit();
        if (e.pointerType === 'mouse') {
          hover = pickTile(cam, pos.x, pos.y);
          refreshPreview(hover, hover);
        } else if (shortOf && shortOf !== 'notBuildable' && shortOf !== 'occupied') {
          el.hint.classList.add('warn');
          el.hint.textContent = t.shortOf[shortOf as keyof typeof t.shortOf];
        } else {
          updateHint();
        }
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

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z' && !el.report.open) {
        e.preventDefault();
        undo();
      }
      return;
    }
    if (e.altKey || el.report.open) return;
    const step = 48;
    const key = e.key.toLowerCase();
    if (key === 'r') rotate();
    else if (key === 'escape') setTool({ kind: 'select' });
    else if (key === 'arrowleft' || key === 'a') cam = { ...cam, x: cam.x + step };
    else if (key === 'arrowright' || key === 'd') cam = { ...cam, x: cam.x - step };
    else if (key === 'arrowup' || key === 'w') cam = { ...cam, y: cam.y + step };
    else if (key === 'arrowdown' || key === 's') cam = { ...cam, y: cam.y - step };
    else if (key === '+' || key === '=') cam = zoomAt(cam, view.w / 2, view.h / 2, 1.2);
    else if (key === '-') cam = zoomAt(cam, view.w / 2, view.h / 2, 1 / 1.2);
    else return;
    requestDraw();
  });

  window.addEventListener('resize', () => resize());

  el.undo.textContent = t.undo;
  el.undo.addEventListener('click', undo);
  el.end.textContent = t.endTurn;
  el.end.addEventListener('click', finishTurn);
  el.newGame.textContent = t.newGame;
  el.newGame.addEventListener('click', () => {
    if (!window.confirm(t.newGameConfirm)) return;
    state = fresh();
    history = [];
    selected = null;
    writeSave(state);
    setTool({ kind: 'select' });
    cam = fitCamera(state.width, state.height, view.w, view.h);
    refresh();
  });

  buildToolbar();
  setTool({ kind: 'select' });
  resize(true);
  refresh();
}
