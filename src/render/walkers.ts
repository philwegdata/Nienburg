import { indexOf, NEIGHBOURS_4 } from '../core/grid';
import type { Building, GameState, Point } from '../core/types';
import { v, type G } from './draw';

/** What the walkers need to know about a kind of building. */
export interface DefLook {
  /** Lies flat: a path people walk on, a canal, or nothing of the sort. */
  flat: 'path' | 'canal' | null;
  /** People work or trade here. */
  work: boolean;
  /** Merchants from outside come here. */
  trade: boolean;
  /** Rough height in world pixels, for hiding walkers behind it. */
  tall: number;
}

interface Walker {
  route: Point[];
  /** When the walk began, in seconds, and how many tiles per second it covers. */
  start: number;
  speed: number;
  merchant: boolean;
  coat: string;
  /** Sideways offset on the street, so people do not walk in single file. */
  side: number;
  seed: number;
}

const COATS = ['#8a4f43', '#5f7386', '#6f8660', '#b08a4a', '#7a5a78', '#9a6a4a', '#4f6b6b'];
const HOUSE_HEIGHT = [10, 14, 24, 34, 40];
const MAX_WALKERS = 70;

/**
 * Little people on the streets: residents on their way to work and back, and merchants coming
 * in through the gates. They are decoration only and know nothing the game rules care about.
 */
export class Walkers {
  private walkers: Walker[] = [];
  private builtFor: GameState['buildings'] | null = null;
  private terrainFor: GameState['terrain'] | null = null;
  private walkable = new Set<number>();
  private homes: Point[] = [];
  private jobs: Point[] = [];
  private markets: Point[] = [];
  private gates: Point[] = [];
  private height = new Map<number, number>();
  private wanted = 0;
  private merchants = 0;

  constructor(private readonly look: (defId: string) => DefLook) {}

  /** Reads the street network and who lives and works where. */
  private survey(state: GameState): void {
    const { width, height } = state;
    this.builtFor = state.buildings;
    this.terrainFor = state.terrain;
    this.walkable = new Set();
    this.height = new Map();
    this.homes = [];
    this.jobs = [];
    this.markets = [];
    this.gates = [];
    const all = Object.values(state.buildings);
    for (const b of all) {
      if (this.look(b.def).flat === 'path') this.walkable.add(indexOf(width, b.x, b.y));
    }
    state.terrain.forEach((t, i) => {
      if (t === 'gate') this.walkable.add(i);
      if (t === 'wall' || t === 'tower' || t === 'gate' || t === 'landmark') this.height.set(i, 20);
    });
    const doorsteps = (b: Building): Point[] => {
      const out: Point[] = [];
      for (let dx = -1; dx <= b.w; dx++) {
        for (let dy = -1; dy <= b.h; dy++) {
          const edge = (dx === -1 || dx === b.w) !== (dy === -1 || dy === b.h);
          const x = b.x + dx;
          const y = b.y + dy;
          if (!edge || x < 0 || y < 0 || x >= width || y >= height) continue;
          if (this.walkable.has(indexOf(width, x, y))) out.push({ x, y });
        }
      }
      return out;
    };
    let pop = 0;
    for (const b of all) {
      const look = this.look(b.def);
      if (look.flat) continue;
      const tall = b.house ? (HOUSE_HEIGHT[b.house.level - 1] ?? 30) : look.tall;
      for (let dx = 0; dx < b.w; dx++) {
        for (let dy = 0; dy < b.h; dy++) this.height.set(indexOf(width, b.x + dx, b.y + dy), tall);
      }
      const steps = doorsteps(b);
      if (steps.length === 0 || b.construction) continue;
      if (b.house) {
        pop += b.house.pop;
        if (b.house.pop > 0) this.homes.push(steps[0]!);
      } else if (look.trade) this.markets.push(steps[0]!);
      else if (look.work) this.jobs.push(steps[0]!);
    }
    state.terrain.forEach((t, i) => {
      if (t !== 'gate') return;
      const x = i % width;
      const y = Math.floor(i / width);
      const linked = NEIGHBOURS_4.some((n) => this.walkable.has(indexOf(width, x + n.x, y + n.y)));
      if (linked) this.gates.push({ x, y });
    });
    this.wanted = Math.min(MAX_WALKERS, Math.floor(pop / 9));
    this.merchants =
      this.gates.length > 0 && pop >= 20 ? Math.min(8, 1 + this.markets.length * 2) : 0;
    // Routes may lead over streets that are gone now: everybody starts afresh.
    this.walkers = [];
  }

  /** The shortest way along the streets, or null if there is none. */
  private route(state: GameState, from: Point, to: Point): Point[] | null {
    const { width, height } = state;
    const start = indexOf(width, from.x, from.y);
    const goal = indexOf(width, to.x, to.y);
    const prev = new Map<number, number>([[start, -1]]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      if (i === goal) break;
      const x = i % width;
      const y = Math.floor(i / width);
      for (const n of NEIGHBOURS_4) {
        const nx = x + n.x;
        const ny = y + n.y;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = indexOf(width, nx, ny);
        if (prev.has(j) || !this.walkable.has(j)) continue;
        prev.set(j, i);
        queue.push(j);
      }
    }
    if (!prev.has(goal)) return null;
    const path: Point[] = [];
    for (let at = goal; at !== -1; at = prev.get(at)!) {
      path.push({ x: at % width, y: Math.floor(at / width) });
    }
    return path.reverse();
  }

  private pick<T>(list: T[]): T | undefined {
    return list[Math.floor(Math.random() * list.length)];
  }

  /** Sends someone on a new errand, from where they are or from a fresh starting point. */
  private send(state: GameState, time: number, merchant: boolean, from?: Point): Walker | null {
    for (let attempt = 0; attempt < 4; attempt++) {
      let a: Point | undefined;
      let b: Point | undefined;
      if (merchant) {
        a = from ?? this.pick(this.gates);
        b =
          from && Math.random() < 0.6
            ? this.pick(this.gates)
            : this.pick([...this.markets, ...this.jobs]);
      } else {
        a = from ?? this.pick(this.homes);
        const targets = Math.random() < 0.6 ? this.jobs : [...this.markets, ...this.homes];
        b = this.pick(targets.length > 0 ? targets : this.homes);
      }
      if (!a || !b || (a.x === b.x && a.y === b.y)) continue;
      const route = this.route(state, a, b);
      if (!route || route.length < 2) continue;
      return {
        route,
        start: time,
        speed: merchant ? 0.75 : 0.95 + Math.random() * 0.4,
        merchant,
        coat: this.pick(COATS)!,
        side: (Math.random() - 0.5) * 0.36,
        seed: Math.random() * 100,
      };
    }
    return null;
  }

  /** Where a walker is right now; null once the errand is done. */
  private position(w: Walker, time: number): Point | null {
    const along = (time - w.start) * w.speed;
    const i = Math.floor(along);
    if (along < 0 || i >= w.route.length - 1) return null;
    const a = w.route[i]!;
    const b = w.route[i + 1]!;
    const t = along - i;
    // Keep to one side of the street, across the direction of travel.
    const sx = b.y - a.y;
    const sy = a.x - b.x;
    return {
      x: a.x + 0.5 + (b.x - a.x) * t + sx * w.side,
      y: a.y + 0.5 + (b.y - a.y) * t + sy * w.side,
    };
  }

  /** Whether a building or wall in front would hide someone standing on this tile. */
  private hidden(state: GameState, p: Point): boolean {
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    const at = (dx: number, dy: number) =>
      this.height.get(indexOf(state.width, x + dx, y + dy)) ?? 0;
    return at(0, 1) >= 16 || at(1, 0) >= 16 || at(1, 1) >= 34;
  }

  /** Moves everyone along and paints them. `time` is in seconds. */
  draw(g: G, state: GameState, time: number): void {
    if (this.builtFor !== state.buildings || this.terrainFor !== state.terrain) this.survey(state);
    // Fill the streets gradually rather than all at once.
    const residents = this.walkers.filter((w) => !w.merchant).length;
    const merchants = this.walkers.length - residents;
    if (residents < this.wanted && Math.random() < 0.3) {
      const w = this.send(state, time, false);
      if (w) this.walkers.push(w);
    }
    if (merchants < this.merchants && Math.random() < 0.1) {
      const w = this.send(state, time, true);
      if (w) this.walkers.push(w);
    }

    const visible: { p: Point; w: Walker }[] = [];
    this.walkers = this.walkers.flatMap((w) => {
      const p = this.position(w, time);
      if (p) {
        if (!this.hidden(state, p)) visible.push({ p, w });
        return [w];
      }
      // Arrived: off on the next errand, or home for the day.
      const next =
        Math.random() < 0.75
          ? this.send(state, time, w.merchant, w.route[w.route.length - 1])
          : null;
      return next ? [{ ...next, coat: w.coat }] : [];
    });
    visible.sort((a, b) => a.p.x + a.p.y - (b.p.x + b.p.y));
    for (const { p, w } of visible) this.figure(g, p, w, time);
  }

  private figure(g: G, p: Point, w: Walker, time: number): void {
    const { ctx } = g;
    const at = v(p.x, p.y);
    const bob = Math.abs(Math.sin(time * 9 + w.seed)) * 0.7;
    ctx.fillStyle = 'rgba(30, 20, 12, 0.22)';
    ctx.beginPath();
    ctx.ellipse(at.x, at.y, 2.4, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    if (w.merchant) {
      // A handcart with a load.
      ctx.fillStyle = '#7a5a3c';
      ctx.fillRect(at.x - 6.4, at.y - 3.6, 4.6, 2.6);
      ctx.fillStyle = '#c9b07a';
      ctx.fillRect(at.x - 6, at.y - 5.6, 3.8, 2.2);
      ctx.fillStyle = '#3b2a20';
      ctx.beginPath();
      ctx.arc(at.x - 4.2, at.y - 0.9, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#3b2a20';
    ctx.fillRect(at.x - 1, at.y - 2.2 - bob, 0.9, 2.2 + bob);
    ctx.fillRect(at.x + 0.1, at.y - 2.2, 0.9, 2.2);
    ctx.fillStyle = w.coat;
    ctx.fillRect(at.x - 1.4, at.y - 5.6 - bob, 2.8, 3.6);
    ctx.fillStyle = '#e8c9a8';
    ctx.beginPath();
    ctx.arc(at.x, at.y - 6.7 - bob, 1.25, 0, Math.PI * 2);
    ctx.fill();
    if (w.merchant) {
      ctx.fillStyle = '#5a3e2a';
      ctx.fillRect(at.x - 1.5, at.y - 8.3 - bob, 3, 0.9);
    }
  }
}
