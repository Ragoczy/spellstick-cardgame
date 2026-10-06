import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works from a subfolder of an existing site.
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
