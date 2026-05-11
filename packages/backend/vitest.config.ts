import { defineConfig } from "vitest/config";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(__dirname, ".env") });

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
