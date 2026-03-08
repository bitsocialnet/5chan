import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      include: ['src/**/*.{ts,tsx}', 'electron/**/*.{js,mjs}'],
      exclude: [
        '**/*.d.ts',
        '**/*.test.*',
        '**/__tests__/**',
        'src/**/index.ts',
        'src/**/index.tsx',
        'src/generated/**',
        'src/env.d.ts',
        'src/globals.d.ts',
        'src/modules.d.ts',
        'src/sw.ts',
        'src/lib/react-scan.ts',
        'electron/**/*.test.js',
        'electron/vite-config.js',
        'electron/vite.preload.config.js',
      ],
    },
  },
});
