// Running inside Discord, as a Discord Activity (see docs/discord-activity.md).
//
// Discord opens the game with ?frame_id=... in the address. Only then do we load Discord's SDK
// (from discordActivity.ts, as a separate download), sign the player in to online play through
// Discord, and show what they are doing on their Discord profile. Everywhere else this file
// does nothing, and the SDK is never downloaded.
//
// Nothing here may break the game: if Discord doesn't answer or turns us down, we write one
// warning to the console and carry on.

import type { PlayerView, Side } from '../engine';

/** Inside Discord: whether the player was signed in to online play at launch, and if not, why. */
export type DiscordSignIn = { signedIn: true } | { signedIn: false; reason: string };

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

/** Inside Discord, the sign-in result once Discord has answered. Null outside Discord. */
let signIn: Promise<DiscordSignIn> | null = null;

/** Connects to Discord when Discord launched the page. Call once at startup. */
export function startDiscord(): void {
  if (!IN_DISCORD) return;
  const connection = import('./discordActivity').then((activity) => activity.connect());
  connection
    .then(({ setPresence }) => {
      sendPresence = setPresence;
      if (latest) setPresence(latest);
    })
    .catch(warnOnce);
  // Discord's own error is in the console warning above; the page explains it in plain words.
  signIn = connection.then((c) => c.signIn, (): DiscordSignIn => ({ signedIn: false, reason: 'discord' }));
}

/** Inside Discord: waits for sign-in at launch to finish. Outside Discord: null. */
export function discordSignIn(): Promise<DiscordSignIn> | null {
  return signIn;
}
