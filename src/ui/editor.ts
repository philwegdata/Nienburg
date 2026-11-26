import {
  checkPlan,
  paintPlan,
  PLAN_MAX,
  PLAN_MIN,
  resizePlan,
  type CustomPlan,
  type PlanProblem,
} from '../core/editor';
import { CITY_LEGEND } from '../core/city';
import type { Terrain } from '../core/types';
import { fill, type Strings } from '../data/i18n';
import { button, node } from './dom';

/** The colours the editor paints each kind of terrain in, seen from above. */
const COLOURS: Record<Terrain, string> = {
  outside: '#9fbf7a',
  water: '#6f9fc7',
  rock: '#8e8a80',
  wall: '#6d6458',
  tower: '#4f463c',
  gate: '#b07a43',
  landmark: '#c7a36a',
  canal: '#8fc3e0',
  buildable: '#e6d6ae',
};

const BRUSHES: Terrain[] = [
  'buildable',
  'wall',
  'tower',
  'gate',
  'outside',
  'water',
  'rock',
  'canal',
  'landmark',
];

export interface EditorActions {
  save(plan: CustomPlan): void;
  play(plan: CustomPlan): void;
}

/** A top-down grid to draw a town plan on, tile by tile. */
export function showEditor(
  dialog: HTMLDialogElement,
  t: Strings,
  start: CustomPlan,
  actions: EditorActions,
): void {
  let plan: CustomPlan = { ...start, map: [...start.map] };
  let brush: Terrain = 'buildable';
  let painting = false;

  const name = node('input');
  name.value = plan.name;
  name.maxLength = 40;
  name.className = 'plan-name';
  name.addEventListener('input', () => (plan = { ...plan, name: name.value }));

  const size = (value: number, label: string, apply: (n: number) => void) => {
    const box = node('label', undefined, 'plan-size');
    const input = node('input');
    input.type = 'number';
    input.min = String(PLAN_MIN);
    input.max = String(PLAN_MAX);
    input.value = String(value);
    input.addEventListener('change', () => {
      const n = Math.max(PLAN_MIN, Math.min(PLAN_MAX, Math.round(Number(input.value)) || value));
      input.value = String(n);
      apply(n);
    });
    box.append(node('span', label), input);
    return box;
  };
  const width = () => plan.map[0]?.length ?? 0;
  const height = () => plan.map.length;

  const palette = node('div', undefined, 'plan-brushes');
  const brushButtons = new Map<Terrain, HTMLButtonElement>();
  for (const b of BRUSHES) {
    const btn = button(t.terrain[b], () => {
      brush = b;
      for (const [k, el] of brushButtons) el.setAttribute('aria-pressed', String(k === brush));
    });
    const swatch = node('span', '', 'swatch');
    swatch.style.background = COLOURS[b];
    btn.prepend(swatch);
    btn.setAttribute('aria-pressed', String(b === brush));
    brushButtons.set(b, btn);
    palette.append(btn);
  }

  const grid = node('div', undefined, 'plan-grid');
  const problems = node('ul', undefined, 'plan-problems');
  const save = button(t.editor.save, () => actions.save(plan));
  const play = button(t.editor.play, () => actions.play(plan), 'primary');

  const describe = (list: PlanProblem[]) => {
    problems.replaceChildren(
      ...(list.length === 0
        ? [node('li', t.editor.fine, 'good')]
        : list.map((p) => node('li', t.editor.problem[p], 'warn'))),
    );
    play.disabled = list.length > 0;
  };

  const draw = () => {
    grid.style.gridTemplateColumns = `repeat(${width()}, 1fr)`;
    const cells: HTMLElement[] = [];
    plan.map.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const cell = node('div', undefined, 'plan-cell');
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        cell.style.background = COLOURS[CITY_LEGEND[ch] ?? 'outside'];
        cells.push(cell);
      });
    });
    grid.replaceChildren(...cells);
    describe(checkPlan(plan.map));
  };

  const paintAt = (clientX: number, clientY: number) => {
    const cell = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!cell?.classList.contains('plan-cell')) return;
    const x = Number(cell.dataset.x);
    const y = Number(cell.dataset.y);
    if (CITY_LEGEND[plan.map[y]![x]!] === brush) return;
    plan = { ...plan, map: paintPlan(plan.map, x, y, brush) };
    cell.style.background = COLOURS[brush];
    describe(checkPlan(plan.map));
  };
  grid.addEventListener('pointerdown', (e) => {
    painting = true;
    grid.setPointerCapture(e.pointerId);
    paintAt(e.clientX, e.clientY);
  });
  grid.addEventListener('pointermove', (e) => {
    if (painting) paintAt(e.clientX, e.clientY);
  });
  const stop = () => (painting = false);
  grid.addEventListener('pointerup', stop);
  grid.addEventListener('pointercancel', stop);

  const sizes = node('div', undefined, 'plan-sizes');
  sizes.append(
    size(width(), t.editor.width, (n) => {
      plan = { ...plan, map: resizePlan(plan.map, n, height()) };
      draw();
    }),
    size(height(), t.editor.height, (n) => {
      plan = { ...plan, map: resizePlan(plan.map, width(), n) };
      draw();
    }),
  );

  const bar = node('div', undefined, 'actions');
  bar.append(
    button(t.close, () => dialog.close()),
    save,
    play,
  );
  const nameRow = node('label', undefined, 'plan-size');
  nameRow.append(node('span', t.editor.name), name);
  dialog.replaceChildren(
    node('h2', t.editor.title),
    node('p', fill(t.editor.intro, { min: PLAN_MIN, max: PLAN_MAX }), 'sub'),
    nameRow,
    sizes,
    palette,
    grid,
    problems,
    bar,
  );
  draw();
  if (!dialog.open) dialog.showModal();
}
