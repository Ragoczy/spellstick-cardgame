/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" in the online build (vite --mode online, see .env.online). */
  readonly VITE_ONLINE?: string;
}
