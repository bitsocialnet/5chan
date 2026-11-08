import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // The scripts fixtures use node:test and run in the dedicated Jev helper workflow. Task worktrees
    // under .claude/worktrees are other checkouts of this repository, with their own tests.
    exclude: [...configDefaults.exclude, 'scripts/jev/tests/**', 'scripts/visual-qa/tests/**', '.claude/worktrees/**'],
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
        'src/lib/dev-tools.ts',
        'electron/**/*.test.js',
        'electron/vite-config.js',
        'electron/vite.preload.config.js',
      ],
    },
  },
});
