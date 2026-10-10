// Running inside Discord, as a Discord Activity (see docs/discord-activity.md).
//
// Discord opens the game with ?frame_id=... in the address. Only then do we load Discord's SDK
// (from discordActivity.ts, as a separate download) and show what the player is doing on their
// Discord profile. Everywhere else this file does nothing, and the SDK is never downloaded.
//
// Nothing here may break the game: if Discord doesn't answer or turns us down, we write one
// warning to the console and carry on.

import type { PlayerView, Side } from '../engine';

/** What Discord shows under "Playing Spellstick". startedAt (milliseconds) adds an "elapsed" timer. */
export interface Presence {
  details: string;
  state?: string;
  startedAt?: number;
}

export function isDiscordLaunch(search: string): boolean {
  return new URLSearchParams(search).has('frame_id');
}

/** True when Discord launched this page. */
export const IN_DISCORD = typeof window !== 'undefined' && isDiscordLaunch(window.location.search);

export const MENU_PRESENCE: Presence = { details: 'In the menu' };

/** What to show for a game in progress, from the player's own view. */
export function gamePresence(view: PlayerView, them: Side, online: boolean, startedAt: number): Presence {
  const details = online ? 'In an online match' : 'Playing the computer';
  const score = `${view.score[view.me]}–${view.score[them]}`;
  if (view.result) {
    const outcome = view.result.winner === null ? 'Draw' : view.result.winner === view.me ? 'Won' : 'Lost';
    return { details, state: `${outcome} ${score}` };
  }
  if (view.turn === 0) return { details, state: 'Setting the lineup', startedAt };
  return { details, state: `Turn ${view.turn} · ${score}`, startedAt };
}

let warned = false;

/** Writes the first Discord problem to the console, and ignores the rest. */
export function warnOnce(err: unknown): void {
  if (warned) return;
  warned = true;
  console.warn('Spellstick: Discord features are off.', err);
}

let latest: Presence | null = null;
let sendPresence: ((presence: Presence) => void) | null = null;

/** Shows this on the player's Discord profile. Does nothing outside Discord. */
export function setDiscordPresence(presence: Presence): void {
  if (!IN_DISCORD) return;
  latest = presence;
  sendPresence?.(presence);
}

/** Connects to Discord when Discord launched the page. Call once at startup. */
export function startDiscord(): void {
  if (!IN_DISCORD) return;
  import('./discordActivity')
    .then((activity) => activity.connect())
    .then((send) => {
      sendPresence = send;
      if (latest) send(latest);
    })
    .catch(warnOnce);
}
