import type { Floor, MapObject, MapV1, ObjectType } from "@pantry/shared";

// Map helpers for the CA-bomb POC: a built-in arena and spawn-point picker.
// "Solid" here just means "don't spawn on it" (house / block / box / tree).
const SOLID = new Set<ObjectType>(["house", "block", "box", "tree"]);

export function isWalkable(map: MapV1, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const o = map.objects[y]?.[x] ?? null;
  return !(o && SOLID.has(o.type));
}

export function findSpawn(map: MapV1): { x: number; y: number } {
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const o = map.objects[y]?.[x] ?? null;
      if (o?.type === "player") return { x, y };
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
