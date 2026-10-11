// The Discord side of the game, loaded only when Discord launched the page (see discord.ts).
// Kept in its own file so the Discord SDK is a separate download that normal players never get.
//
// Steps, as in Discord's own guide: wait for Discord, then ask the player's permission once
// (Discord shows its own prompt the first time) for everything the game needs: showing
// "Playing Spellstick" on their profile, who they are, and their membership and roles in our
// server. The one-time code goes to our server, which trades it for a token and signs the
// player in to online play if their roles allow it. The token then lets us set the profile
// details.

import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { warnOnce, type DiscordSignIn, type Presence } from './discord';

/**
 * Other websites the page talks to, each reached through a URL mapping set up in the Discord
 * Developer Portal (Discord's sandbox blocks everything else). The game talks only to its own
 * server today, so there is nothing to map. To add one, list the same prefix and target here and
 * in the portal, for example { prefix: '/store', target: 'darkspace.press' }.
 */
const URL_MAPPINGS: Parameters<typeof patchUrlMappings>[0] = [];

/** Discord limits how often an app may change its presence, so we send at most one change per 5 seconds. */
const PRESENCE_GAP_MS = 5000;

/** Discord serves the game from https://<client id>.discordsays.com. */
function clientIdFromAddress(): string {
  const match = /^(\d+)\.discordsays\.com$/.exec(window.location.hostname);
  if (!match) throw new Error(`Not served by Discord (${window.location.hostname}).`);
  return match[1]!;
}

/** What connecting to Discord gives the rest of the game. */
export interface DiscordConnection {
  /** Whether the player is signed in to online play, and if not, why. */
  signIn: DiscordSignIn;
  /** Shows a presence on the player's profile. */
  setPresence: (presence: Presence) => void;
}

/** Connects to Discord and signs in. Throws (with Discord's own error) if it can't. */
export async function connect(): Promise<DiscordConnection> {
  const clientId = clientIdFromAddress();
  if (URL_MAPPINGS.length) patchUrlMappings(URL_MAPPINGS);

  const sdk = new DiscordSDK(clientId);
  await sdk.ready();
  openOutsideLinksInBrowser(sdk);

  // Right after ready, once, as Discord asks.
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    // identify and guilds.members.read: who you are and your roles in our server, the same as
    // browser sign-in. rpc.activities.write: the "Playing Spellstick" details.
    scope: ['identify', 'guilds.members.read', 'rpc.activities.write'],
  });

  // A relative address: inside Discord it goes through Discord's proxy to our server.
  const res = await fetch('/api/discord/signin', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`Sign-in with Discord's code failed: ${res.status}`);
  const answer = (await res.json()) as { access_token: string; signedIn: boolean; reason?: string };
  const signIn: DiscordSignIn = answer.signedIn ? { signedIn: true } : { signedIn: false, reason: answer.reason ?? 'failed' };

  // Profile details are a nice extra: if Discord turns the token down, sign-in still counts.
  let setPresence: (presence: Presence) => void = () => {};
  try {
    const auth = await sdk.commands.authenticate({ access_token: answer.access_token });
    if (!auth) throw new Error('Discord turned down the token.');
    setPresence = presenceSender(sdk);
  } catch (err) {
    console.warn('Spellstick: Discord profile details are off.', err);
  }
  return { signIn, setPresence };
}

/** Sends presence changes to Discord, skipping repeats and spacing them out. */
function presenceSender(sdk: DiscordSDK): (presence: Presence) => void {
  let waiting: Presence | null = null;
  let lastSent = '';
  let lastSentAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    if (!waiting) return;
    const presence = waiting;
    waiting = null;
    const key = JSON.stringify(presence);
    if (key === lastSent) return;
    lastSent = key;
    lastSentAt = Date.now();
    sdk.commands
      .setActivity({
        activity: {
          type: 0, // "Playing"
          details: presence.details,
          state: presence.state,
          timestamps: presence.startedAt ? { start: presence.startedAt } : undefined,
        },
      })
      .catch(warnOnce);
  };

  return (presence) => {
    waiting = presence;
    if (timer) return;
    timer = setTimeout(flush, Math.max(0, lastSentAt + PRESENCE_GAP_MS - Date.now()));
  };
}

/**
 * Inside Discord, a normal link to another website goes nowhere. Send those clicks to Discord,
 * which asks the player and then opens the link in their browser. Links into the game itself
 * are left alone. composedPath() also finds links inside widgets that use a shadow root.
 */
function openOutsideLinksInBrowser(sdk: DiscordSDK): void {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const link = event.composedPath().find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement && node.href !== '');
    if (!link) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin === window.location.origin || (url.protocol !== 'https:' && url.protocol !== 'http:')) return;
    event.preventDefault();
    sdk.commands.openExternalLink({ url: url.href }).catch(warnOnce);
  });
}
