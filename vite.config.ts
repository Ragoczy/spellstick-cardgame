import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** How many changes the start screen lists under "Recent changes". */
const RECENT_CHANGE_COUNT = 10;

/**
 * The latest changes, read from git when the game is built: one line per commit, as
 * "date<tab>summary". The Docker build has no .git folder, so the deploy workflow writes the
 * same lines to recent-changes.txt first. With neither, the list is empty and the section hides.
 */
function recentChanges(): { date: string; summary: string }[] {
  let text = '';
  try {
    text = execSync(`git log -${RECENT_CHANGE_COUNT} --no-merges --format=%cs%x09%s`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    if (existsSync('recent-changes.txt')) text = readFileSync('recent-changes.txt', 'utf8');
  }
  return text
    .split('\n')
    .filter((line) => line.includes('\t'))
    .slice(0, RECENT_CHANGE_COUNT)
    .map((line) => {
      const [date, ...rest] = line.split('\t');
      return { date: date!.trim(), summary: rest.join('\t').trim() };
    });
}

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works from a subfolder of an existing site.
  base: './',
  define: {
    __RECENT_CHANGES__: JSON.stringify(recentChanges()),
  },
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
