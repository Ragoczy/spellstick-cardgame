import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works from a subfolder of an existing site.
  base: './',
  server: {
    // During local development (npm run dev:online), pass sign-in and API calls to the game
    // server (npm run server:dev).
    proxy: {
      '/api': 'http://localhost:8080',
      '/auth': 'http://localhost:8080',
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
