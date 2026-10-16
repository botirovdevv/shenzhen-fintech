import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests for the app's pure logic (formatting, mock API, policy rules). UI is checked on device.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
