/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" in the online build (vite --mode online, see .env.online). */
  readonly VITE_ONLINE?: string;
}

/** The latest changes to the game, newest first, filled in at build time (see vite.config.ts). */
declare const __RECENT_CHANGES__: { date: string; summary: string }[];
