import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { DB } from "./client.js";
import { logger } from "../logger.js";

// packages/backend/migrations — same relative path from src/db and dist/db.
const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

// Arbitrary constant; serializes concurrent runs (e.g. old and new container
// both starting during a deploy).
const LOCK_KEY = 7_143_029_001;

/**
 * Apply migrations/*.sql in filename order, once each. Each file runs in its
 * own transaction together with its row in schema_migrations, so a failed
 * migration leaves nothing half-applied and is retried on the next start.
 */
export async function migrate(db: DB, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const sql = await readFile(`${dir}/${file}`, "utf8");
    const ran = await db.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
      const [done] = await tx`SELECT 1 FROM schema_migrations WHERE version = ${version}`;
      if (done) return false;
      await tx.unsafe(sql);
      await tx`INSERT INTO schema_migrations (version) VALUES (${version})`;
      return true;
    });
    if (ran) {
      logger.info({ version }, "migration applied");
      applied.push(version);
    }
  }
  return applied;
}
