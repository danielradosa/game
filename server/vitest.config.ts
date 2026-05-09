import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@shared": new URL("../src/shared", import.meta.url).pathname,
    },
  },
})
