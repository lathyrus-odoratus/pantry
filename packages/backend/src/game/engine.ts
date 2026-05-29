export const MAP_WIDTH = 15;
export const MAP_HEIGHT = 9;

export type GameMap = string[][];
export type PlayerState = { x: number; y: number; hp: number };
export type BombState = { x: number; y: number; exploded: boolean } | null;

function generateMap(width: number, height: number): GameMap {
  const map: GameMap = [];
  for (let y = 0; y < height; y++) {
    const row: string[] = [];
    for (let x = 0; x < width; x++) {
      if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
        row.push("#");
      } else if (y % 2 === 0 && x % 2 === 0) {
        row.push("#");
      } else {
        const r = Math.random();
        if (r < 0.2) row.push("X");
        else if (r < 0.25) row.push("E");
        else row.push(".");
      }
    }
    map.push(row);
  }

  const r1 = map[1];
  const r2 = map[2];
  if (r1) { r1[1] = "."; r1[2] = "."; }
  if (r2) { r2[1] = "."; }

  const hasEnemy = map.some((row) => row.includes("E"));
  if (!hasEnemy) {
    const last = map[height - 2];
    if (last) last[width - 2] = "E";
  }

  return map;
}

export function explosionCells(
  map: GameMap,
  bomb: { x: number; y: number },
): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [{ x: bomb.x, y: bomb.y }];
  const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  for (const dir of dirs) {
    const nx = bomb.x + dir.x;
    const ny = bomb.y + dir.y;
    const row = map[ny];
    if (row && nx >= 0 && nx < row.length && row[nx] !== "#") {
      cells.push({ x: nx, y: ny });
    }
  }
  return cells;
}

export class GameEngine {
  map: GameMap;
  player: PlayerState;
  bomb: BombState;
  tick: number;

  constructor() {
    this.map = generateMap(MAP_WIDTH, MAP_HEIGHT);
    this.player = { x: 1, y: 1, hp: 3 };
    this.bomb = null;
    this.tick = 0;
  }

  movePlayer(dx: number, dy: number): void {
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    const row = this.map[ny];
    if (row && nx >= 0 && nx < row.length && row[nx] === ".") {
      this.player.x = nx;
      this.player.y = ny;
    }
    this.tick++;
  }

  placeBomb(): boolean {
    if (this.bomb) return false;
    this.bomb = { x: this.player.x, y: this.player.y, exploded: false };
    this.tick++;
    return true;
  }

  explodeBomb(): void {
    if (!this.bomb) return;
    this.bomb = { ...this.bomb, exploded: true };
    const cells = explosionCells(this.map, this.bomb);
    for (const cell of cells) {
      const row = this.map[cell.y];
      if (row) {
        const v = row[cell.x];
        if (v === "X" || v === "E") row[cell.x] = ".";
      }
    }
    const hit = cells.some((c) => c.x === this.player.x && c.y === this.player.y);
    if (hit) this.player.hp -= 1;
    this.tick++;
  }

  clearExplosion(): void {
    this.bomb = null;
    this.tick++;
  }

  stepEnemies(): void {
    const positions: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < this.map.length; y++) {
      const row = this.map[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        if (row[x] === "E") positions.push({ x, y });
      }
    }

    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    for (const pos of positions) {
      const shuffled = [...dirs].sort(() => Math.random() - 0.5);
      for (const dir of shuffled) {
        const nx = pos.x + dir.x;
        const ny = pos.y + dir.y;
        if (!this.canEnemyMoveTo(nx, ny)) continue;
        if (nx === this.player.x && ny === this.player.y) this.player.hp -= 1;
        const srcRow = this.map[pos.y];
        const dstRow = this.map[ny];
        if (srcRow) srcRow[pos.x] = ".";
        if (dstRow) dstRow[nx] = "E";
        break;
      }
    }
    this.tick++;
  }

  private canEnemyMoveTo(x: number, y: number): boolean {
    const row = this.map[y];
    if (!row || x < 0 || x >= row.length) return false;
    if (row[x] !== ".") return false;
    if (this.bomb && !this.bomb.exploded && this.bomb.x === x && this.bomb.y === y) return false;
    return true;
  }

  hasEnemies(): boolean {
    return this.map.some((row) => row.includes("E"));
  }

  isPlayerDead(): boolean {
    return this.player.hp <= 0;
  }

  snapshot(): { map: GameMap; player: PlayerState; bomb: BombState; tick: number } {
    return {
      map: this.map.map((row) => [...row]),
      player: { ...this.player },
      bomb: this.bomb ? { ...this.bomb } : null,
      tick: this.tick,
    };
  }
}
