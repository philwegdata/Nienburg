import { defineConfig } from 'vitest/config';

// `base` must match the repository name so asset URLs resolve on GitHub Pages.
export default defineConfig({
  base: '/Nienburg/',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
