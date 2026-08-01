import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // Die Tests teilen sich eine Datenbank und raeumen jeweils auf. Parallel
    // wuerden sie sich gegenseitig die Tabellen unter den Fuessen wegziehen.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
