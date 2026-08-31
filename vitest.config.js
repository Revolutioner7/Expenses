import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.jsx"],
    testTimeout: 10000,
  },
  esbuild: {
    jsx: "automatic",
  },
});
