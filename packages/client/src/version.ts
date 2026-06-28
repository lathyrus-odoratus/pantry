// Bump in lockstep with packages/client/package.json `version`.
// Phase 6 (Task 10) of Plan C flips tsconfig rootDir; at that point this can
// be swapped for `import pkg from "../package.json" with { type: "json" }`.
export const CLIENT_VERSION = "0.1.35";

export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}
