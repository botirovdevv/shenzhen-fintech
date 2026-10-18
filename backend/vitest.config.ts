import { defineConfig } from 'vitest/config';

// Each test boots its own in-process Postgres (PGlite). Running files one at a time keeps slow laptops
// from starving them and timing out.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 90_000,
  },
});
