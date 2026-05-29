import type { MapV1, ObjectType } from "@pantry/shared";
import { sampleCaMap, findSpawn } from "./caMock.js";

// Offline CA-bomb POC engine (client-only; no protocol/server). Tick-based so
// multiple bombs, chain detonation, timed blasts and enemy steps all advance
// from a single loop in the screen. Mirrors #1's bomb feel, CA collision.
export type ItemType = "heart" | "bomb" | "range";
export type Bomb = { x: number; y: number; fuseMs: number };
export type Blast = { x: number; y: number; ttlMs: number };
export type Enemy = { x: number; y: number };
export type Status = "playing" | "win" | "loss";

const FUSE_MS = 3000;
const BLAST_MS = 500;
const ENEMY_MS = 800;
const IFRAME_MS = 800;
export const DROP_CHANCE = 1;
const MAX_STAT = 3;
const ENEMY_COUNT = 4;

const IMMOVABLE = new Set<ObjectType>(["house", "block", "tree"]);
const DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

function key(x: number, y: number): string {
  return `${x},${y}`;
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
  // Empty walkable floor: no object, no bomb, no enemy.
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
      // Sokoban-style single push: box slides one cell if the cell behind it
      // is open floor; player follows into the box's old cell.
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

  // Cross blast extending `range` per direction; stops at immovable tiles,
  // destroys the first box it hits (which may drop an item) and stops there.
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
    // Detonate every due bomb; a blast cell landing on another bomb chains it.
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

    // Anything standing in fire: enemies die, player takes one hit (i-frames).
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
}
