import postgres from "postgres";
import type { Config } from "../config.js";

// timestamptz / timestamp come back as ISO strings ("...Z") instead of Date,
// matching the string-typed *_at fields on the row types.
const toIso = (x: string) => new Date(x).toISOString();

export function createDb(config: Config) {
  return postgres(config.databaseUrl, {
    max: 5,
    onnotice: () => {},
    types: {
      timestamptz: { to: 1184, from: [1184], serialize: (x: string) => x, parse: toIso },
      timestamp: { to: 1114, from: [1114], serialize: (x: string) => x, parse: toIso },
    },
  });
}

export type DB = ReturnType<typeof createDb>;
