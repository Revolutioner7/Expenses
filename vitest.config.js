import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.jsx"],
    testTimeout: 10000,
    // secuencial a propósito: algunas pruebas mueven el reloj del sistema (vi.setSystemTime),
    // que es un mock global — en paralelo, dos pruebas podrían pisarse ese reloj entre sí.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
  esbuild: {
    jsx: "automatic",
  },
});
