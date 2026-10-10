// Live updates from the game server (online build only). One connection per page, shared by
// whatever is listening (the match list, a match screen). The browser's EventSource reconnects
// by itself after a drop; every (re)connect tells listeners to catch up, in case they missed
// something while disconnected. If the server refuses the connection (signed out, or the
// server is down), we try again after a while; screens fall back to checking regularly.

import type { MatchChange } from '../shared/matchApi';

export interface LiveListener {
  /** One of your matches changed. */
  onMatchChange(change: MatchChange): void;
  /** Connected (or reconnected): fetch the latest, in case something was missed. */
  onConnect?(): void;
}

/** How long to wait before trying again after the server refused the connection. */
const RETRY_MS = 30_000;

const listeners = new Set<LiveListener>();
let source: EventSource | null = null;
let connected = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** True while the live connection is up, so screens can check less often. */
export function liveConnected(): boolean {
  return connected;
}

/** Starts listening. Returns a function that stops. */
export function listenLive(listener: LiveListener): () => void {
  listeners.add(listener);
  if (!source && !retryTimer) connect();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) disconnect();
  };
}

function connect(): void {
  retryTimer = null;
  source = new EventSource('/api/live', { withCredentials: true });
  source.addEventListener('open', () => {
    connected = true;
    for (const l of listeners) l.onConnect?.();
  });
  source.addEventListener('match', (e) => {
    const change = JSON.parse((e as MessageEvent<string>).data) as MatchChange;
    for (const l of listeners) l.onMatchChange(change);
  });
  source.addEventListener('error', () => {
    connected = false;
    // CONNECTING means the browser is already reconnecting by itself. CLOSED means it gave up.
    if (source?.readyState === EventSource.CLOSED) {
      source = null;
      if (listeners.size) retryTimer = setTimeout(connect, RETRY_MS);
    }
  });
}

function disconnect(): void {
  source?.close();
  source = null;
  connected = false;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}
