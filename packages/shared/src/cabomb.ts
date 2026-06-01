import type { Floor, MapObject, MapV1, ObjectType } from "./map.js";

// Crazy Arcade bomb game — pure engine + map helpers, shared by the backend
// (authoritative, room-wide play) and the offline `--ca-bomb` client sandbox.
// No IO / no React; advances entirely through tick(dt) plus move/placeBomb.

export type ItemType = "heart" | "bomb" | "range";
export type Bomb = { x: number; y: number; fuseMs: number };
export type Blast = { x: number; y: number; ttlMs: number };
export type Enemy = { x: number; y: number };
export type Status = "playing" | "win" | "loss";

// Serializable snapshot broadcast over WS (cabomb.state) and rendered by clients.
export type CabombState = {
  map: MapV1;
  player: { x: number; y: number; hp: number; bombCap: number; range: number };
  bombs: Array<{ x: number; y: number }>;
  blasts: Array<{ x: number; y: number }>;
  enemies: Array<{ x: number; y: number }>;
  items: Array<{ x: number; y: number; type: ItemType }>;
  status: Status;
};

const FUSE_MS = 3000;
const BLAST_MS = 500;
const ENEMY_MS = 800;
const IFRAME_MS = 800;
export const DROP_CHANCE = 1;
const MAX_STAT = 3;
const ENEMY_COUNT = 4;

// Objects that block movement entirely (can't walk on, can't push).
const IMMOVABLE = new Set<ObjectType>(["house", "block", "tree"]);
// Objects you can't spawn on (immovable + the pushable box).
const SOLID = new Set<ObjectType>(["house", "block", "box", "tree"]);
const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

function key(x: number, y: number): string {
  return `${x},${y}`;
}

export function isWalkable(map: MapV1, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const o = map.objects[y]?.[x] ?? null;
  return !(o && SOLID.has(o.type));
}

export function findSpawn(map: MapV1): { x: number; y: number } {
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.objects[y]?.[x]?.type === "player") return { x, y };
    }
  }
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (isWalkable(map, x, y)) return { x, y };
    }
  }
  return { x: 1, y: 1 };
}

// A classic-feel CA arena: blue block border + even/even pillar grid, a few
// destructible boxes and some greenery, spawn corner kept clear.
export function sampleCaMap(): MapV1 {
  const w = 15;
  const h = 11;
  const floor: Floor[][] = [];
  const objects: (MapObject | null)[][] = [];
  for (let y = 0; y < h; y++) {
    const frow: Floor[] = [];
    const orow: (MapObject | null)[] = [];
    for (let x = 0; x < w; x++) {
      frow.push("grass");
      if (y === 0 || y === h - 1 || x === 0 || x === w - 1) {
        orow.push({ type: "block", color: "blue" });
      } else if (x % 2 === 0 && y % 2 === 0) {
        orow.push({ type: "block", color: "blue" });
      } else {
        orow.push(null);
      }
    }
    floor.push(frow);
    objects.push(orow);
  }

  const boxes: Array<[number, number]> = [
    [3, 1], [5, 1], [9, 1], [13, 3], [7, 3], [9, 5], [1, 5], [11, 7], [5, 7], [3, 9],
  ];
  for (const [x, y] of boxes) {
    const row = objects[y];
    if (row && row[x] === null) row[x] = { type: "box" };
  }
  const bushRow = objects[3];
  if (bushRow) bushRow[5] = { type: "bush" };
  const treeRow = objects[7];
  if (treeRow) treeRow[13] = { type: "tree" };

  for (const [x, y] of [[1, 1], [2, 1], [1, 2]] as Array<[number, number]>) {
    const row = objects[y];
    if (row) row[x] = null;
  }

  return { version: 1, name: "CA Arena", w, h, floor, objects };
}

export class CaBombGame {
  map: MapV1;
  player: { x: number; y: number; hp: number; bombCap: number; range: number; iframeMs: number };
  bombs: Bomb[] = [];
  blasts: Blast[] = [];
  enemies: Enemy[] = [];
  items = new Map<string, ItemType>();
  status: Status = "playing";
  private enemyAccMs = 0;

  constructor(map: MapV1 = sampleCaMap()) {
    this.map = { ...map, objects: map.objects.map((row) => [...row]) };
    const spawn = findSpawn(this.map);
    this.player = { x: spawn.x, y: spawn.y, hp: 1, bombCap: 1, range: 1, iframeMs: 0 };
    this.scatterEnemies(spawn);
  }

  private scatterEnemies(spawn: { x: number; y: number }): void {
    const candidates: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < this.map.h; y++) {
      for (let x = 0; x < this.map.w; x++) {
        const far = Math.abs(x - spawn.x) + Math.abs(y - spawn.y) > 4;
        if (far && this.isOpenFloor(x, y)) candidates.push({ x, y });
      }
    }
    for (let i = 0; i < ENEMY_COUNT && candidates.length > 0; i++) {
      const idx = Math.floor(Math.random() * candidates.length);
      const cell = candidates.splice(idx, 1)[0];
      if (cell) this.enemies.push({ x: cell.x, y: cell.y });
    }
  }

  private objAt(x: number, y: number): ObjectType | null {
    return this.map.objects[y]?.[x]?.type ?? null;
  }
  private isImmovable(x: number, y: number): boolean {
    const t = this.objAt(x, y);
    return t !== null && IMMOVABLE.has(t);
  }
  private isBox(x: number, y: number): boolean {
    return this.objAt(x, y) === "box";
  }
  private bombAt(x: number, y: number): boolean {
    return this.bombs.some((b) => b.x === x && b.y === y);
  }
  private enemyAt(x: number, y: number): boolean {
    return this.enemies.some((e) => e.x === x && e.y === y);
  }
  private isOpenFloor(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) return false;
    return this.objAt(x, y) === null && !this.bombAt(x, y) && !this.enemyAt(x, y);
  }

  move(dx: number, dy: number): void {
    if (this.status !== "playing") return;
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    if (nx < 0 || ny < 0 || nx >= this.map.w || ny >= this.map.h) return;
    if (this.isImmovable(nx, ny) || this.bombAt(nx, ny) || this.enemyAt(nx, ny)) return;

    if (this.isBox(nx, ny)) {
      // Sokoban-style single push: box slides one cell if the cell behind it is
      // open floor; player follows into the box's old cell.
      const bx = nx + dx;
      const by = ny + dy;
      if (!this.isOpenFloor(bx, by)) return;
      const src = this.map.objects[ny];
      const dst = this.map.objects[by];
      if (src && dst) {
        dst[bx] = src[nx] ?? null;
        src[nx] = null;
      }
      this.player.x = nx;
      this.player.y = ny;
      return;
    }

    this.player.x = nx;
    this.player.y = ny;
    const item = this.items.get(key(nx, ny));
    if (item) {
      this.applyItem(item);
      this.items.delete(key(nx, ny));
    }
  }

  private applyItem(type: ItemType): void {
    if (type === "heart") this.player.hp = Math.min(MAX_STAT, this.player.hp + 1);
    else if (type === "bomb") this.player.bombCap = Math.min(MAX_STAT, this.player.bombCap + 1);
    else this.player.range = Math.min(MAX_STAT, this.player.range + 1);
  }

  placeBomb(): void {
    if (this.status !== "playing") return;
    if (this.bombs.length >= this.player.bombCap) return;
    if (this.bombAt(this.player.x, this.player.y)) return;
    this.bombs.push({ x: this.player.x, y: this.player.y, fuseMs: FUSE_MS });
  }

  private blastCells(ox: number, oy: number): Array<{ x: number; y: number }> {
    const cells = [{ x: ox, y: oy }];
    for (const dir of DIRS) {
      for (let step = 1; step <= this.player.range; step++) {
        const cx = ox + dir.x * step;
        const cy = oy + dir.y * step;
        if (cx < 0 || cy < 0 || cx >= this.map.w || cy >= this.map.h) break;
        if (this.isImmovable(cx, cy)) break;
        cells.push({ x: cx, y: cy });
        if (this.isBox(cx, cy)) {
          this.destroyBox(cx, cy);
          break;
        }
      }
    }
    return cells;
  }

  private destroyBox(x: number, y: number): void {
    const row = this.map.objects[y];
    if (row) row[x] = null;
    if (Math.random() < DROP_CHANCE) {
      const roll = Math.floor(Math.random() * 3);
      const type: ItemType = roll === 0 ? "heart" : roll === 1 ? "bomb" : "range";
      this.items.set(key(x, y), type);
    }
  }

  tick(dt: number): void {
    if (this.status !== "playing") return;
    this.player.iframeMs = Math.max(0, this.player.iframeMs - dt);

    for (const b of this.bombs) b.fuseMs -= dt;
    while (true) {
      const idx = this.bombs.findIndex((b) => b.fuseMs <= 0);
      if (idx === -1) break;
      const b = this.bombs.splice(idx, 1)[0]!;
      for (const c of this.blastCells(b.x, b.y)) {
        this.blasts.push({ x: c.x, y: c.y, ttlMs: BLAST_MS });
        const chain = this.bombs.find((o) => o.x === c.x && o.y === c.y);
        if (chain) chain.fuseMs = 0;
      }
    }

    this.blasts = this.blasts
      .map((bl) => ({ ...bl, ttlMs: bl.ttlMs - dt }))
      .filter((bl) => bl.ttlMs > 0);

    this.enemyAccMs += dt;
    if (this.enemyAccMs >= ENEMY_MS) {
      this.enemyAccMs -= ENEMY_MS;
      this.stepEnemies();
    }

    const fire = new Set(this.blasts.map((bl) => key(bl.x, bl.y)));
    this.enemies = this.enemies.filter((e) => !fire.has(key(e.x, e.y)));
    if (fire.has(key(this.player.x, this.player.y)) && this.player.iframeMs <= 0) {
      this.player.hp -= 1;
      this.player.iframeMs = IFRAME_MS;
    }

    if (this.player.hp <= 0) this.status = "loss";
    else if (this.enemies.length === 0) this.status = "win";
  }

  private stepEnemies(): void {
    for (const e of this.enemies) {
      const shuffled = [...DIRS].sort(() => Math.random() - 0.5);
      for (const dir of shuffled) {
        const nx = e.x + dir.x;
        const ny = e.y + dir.y;
        if (nx === this.player.x && ny === this.player.y) {
          if (this.player.iframeMs <= 0) {
            this.player.hp -= 1;
            this.player.iframeMs = IFRAME_MS;
          }
          break;
        }
        if (this.isOpenFloor(nx, ny)) {
          e.x = nx;
          e.y = ny;
          break;
        }
      }
    }
  }

  snapshot(): CabombState {
    const items = [...this.items].map(([k, type]) => {
      const [x, y] = k.split(",").map(Number);
      return { x: x ?? 0, y: y ?? 0, type };
    });
    return {
      map: this.map,
      player: {
        x: this.player.x,
        y: this.player.y,
        hp: this.player.hp,
        bombCap: this.player.bombCap,
        range: this.player.range,
      },
      bombs: this.bombs.map((b) => ({ x: b.x, y: b.y })),
      blasts: this.blasts.map((b) => ({ x: b.x, y: b.y })),
      enemies: this.enemies.map((e) => ({ x: e.x, y: e.y })),
      items,
      status: this.status,
    };
  }
}
