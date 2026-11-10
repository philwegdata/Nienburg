import { buildingAt, countTiles } from '../core/actions';
import { newGame } from '../core/city';
import { inBounds, indexOf } from '../core/grid';
import {
  commitBuild,
  commitDemolish,
  planBuild,
  planDemolish,
  type BuildPlan,
} from '../core/planning';
import type { CityDef, GameState, Point, Rotation } from '../core/types';
import { BUILD_MENU, BUILDINGS, type BuildingId } from '../data/buildings';
import type { Strings } from '../data/i18n';
import { fitCamera, pickTile, zoomAt, type Camera } from '../render/iso';
import { render, type Overlay } from '../render/renderer';

type Tool = { kind: 'select' } | { kind: 'demolish' } | { kind: 'build'; def: BuildingId };

/** Pointer movement below this many CSS pixels still counts as a click. */
const CLICK_SLOP = 6;

const SWATCH: Record<BuildingId, string> = {
  alley: '#b89f76',
  street: '#a7a096',
  plaza: '#cfc8b8',
  house: '#a4573b',
  well: '#6f9db8',
  chapel: '#5f6c76',
};

interface Elements {
  canvas: HTMLCanvasElement;
  tools: HTMLElement;
  hint: HTMLElement;
  info: HTMLElement;
  stats: HTMLElement;
}

type Gesture =
  | { kind: 'pan'; last: Point; moved: number; clickSelects: boolean; cancelsTool: boolean }
  | { kind: 'paint'; from: Point }
  | { kind: 'pinch'; dist: number; mid: Point };

export function startApp(el: Elements, city: CityDef, t: Strings): void {
  const ctx = el.canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported');

  let state: GameState = newGame(city, Date.now());
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
      const overlay: Overlay = { preview: [], highlight: null };
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

  // ---------- panels ----------

  function updateStats(): void {
    const c = countTiles(state);
    el.stats.textContent = `${t.freeTiles}: ${c.free} / ${c.buildable}`;
  }

  function updateInfo(): void {
    el.info.replaceChildren();
    const add = (tag: string, text: string, cls?: string) => {
      const node = document.createElement(tag);
      node.textContent = text;
      if (cls) node.className = cls;
      el.info.append(node);
    };
    if (tool.kind === 'build') {
      const def = BUILDINGS[tool.def]!;
      const big = def.size.w * def.size.h > 1;
      add('h2', t.building[tool.def]);
      add('p', t.buildingInfo[tool.def]);
      if (big) add('p', `${t.size}: ${def.size.w}×${def.size.h}`, 'meta');
      return;
    }
    if (!selected || !inBounds(state.width, state.height, selected.x, selected.y)) {
      add('p', t.infoEmpty);
      return;
    }
    const b = buildingAt(state, selected.x, selected.y);
    if (b) {
      const id = b.def as BuildingId;
      add('h2', t.building[id]);
      add('p', t.buildingInfo[id]);
      if (b.w * b.h > 1) add('p', `${t.size}: ${b.w}×${b.h}`, 'meta');
      return;
    }
    const terrain = state.terrain[indexOf(state.width, selected.x, selected.y)]!;
    add('h2', t.terrain[terrain]);
    if (terrain === 'buildable') add('p', t.infoFree);
  }

  function updateHint(): void {
    if (tool.kind === 'select') el.hint.textContent = t.hintSelect;
    else if (tool.kind === 'demolish') el.hint.textContent = t.hintDemolish;
    else {
      const drag = BUILDINGS[tool.def]!.drag;
      el.hint.textContent =
        drag === 'line' ? t.hintLine : drag === 'rect' ? t.hintRect : t.hintSingle;
    }
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
      const node = document.createElement('button');
      node.type = 'button';
      if (swatch) {
        const s = document.createElement('span');
        s.className = 'swatch';
        s.style.background = swatch;
        node.append(s);
      }
      node.append(label);
      node.addEventListener('click', () => setTool(target));
      el.tools.append(node);
      buttons.push({ tool: target, node });
    };
    const addSeparator = () => {
      const sep = document.createElement('span');
      sep.className = 'sep';
      el.tools.append(sep);
    };
    el.tools.setAttribute('aria-label', t.buildMenu);
    addButton(t.toolSelect, { kind: 'select' });
    addSeparator();
    for (const id of BUILD_MENU) addButton(t.building[id], { kind: 'build', def: id }, SWATCH[id]);
    addSeparator();
    addButton(t.toolDemolish, { kind: 'demolish' });
    rotateButton = document.createElement('button');
    rotateButton.type = 'button';
    rotateButton.textContent = t.rotate;
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
  }

  function commit(): void {
    if (tool.kind === 'build' && plan) {
      state = commitBuild(state, BUILDINGS, BUILDINGS[tool.def]!, plan, rot);
    } else if (tool.kind === 'demolish' && demolition) {
      state = commitDemolish(state, demolition);
    }
    plan = null;
    demolition = null;
    updateStats();
  }

  function startPinch(): void {
    const [a, b] = [...pointers.values()] as [Point, Point];
    plan = null;
    demolition = null;
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
        plan = null;
        demolition = null;
      } else {
        commit();
        if (e.pointerType === 'mouse') {
          hover = pickTile(cam, pos.x, pos.y);
          refreshPreview(hover, hover);
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
    plan = null;
    demolition = null;
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
    if (e.ctrlKey || e.metaKey || e.altKey) return;
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

  buildToolbar();
  setTool({ kind: 'select' });
  updateStats();
  resize(true);
}
