// The Discord side of the game, loaded only when Discord launched the page (see discord.ts).
// Kept in its own file so the Discord SDK is a separate download that normal players never get.
//
// Steps: wait for Discord, ask the player's permission (Discord shows its own prompt the first
// time), trade the one-time code for a token on our server, then use the token to set the
// "Playing Spellstick" details on the player's profile.
//
// Signing in to online play is separate, and only when the player asks: Discord asks again,
// for permission to see who they are and their roles in our server, and the server checks
// those just as browser sign-in does (see signInCode below).

import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { warnOnce, type Presence } from './discord';

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

/** The game's connection to the Discord app it's running in. */
export interface DiscordActivity {
  /** Asks for permission to show presence, and returns a function that shows one on the player's profile. */
  startPresence(): Promise<(presence: Presence) => void>;
  /**
   * Asks Discord for a one-time sign-in code: Discord asks the player the first time. The page
   * sends the code to /api/discord/signin. Throws if the player says no.
   */
  signInCode(): Promise<string>;
}

/** Connects to Discord. */
export async function connect(): Promise<DiscordActivity> {
  const clientId = clientIdFromAddress();
  if (URL_MAPPINGS.length) patchUrlMappings(URL_MAPPINGS);

  const sdk = new DiscordSDK(clientId);
  await sdk.ready();
  openOutsideLinksInBrowser(sdk);

  return {
    startPresence: () => startPresence(sdk, clientId),
    async signInCode() {
      const { code } = await sdk.commands.authorize({
        client_id: clientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        // Who you are and your membership and roles in our server, the same as browser sign-in.
        // rpc.activities.write is already allowed; asking again keeps it on the list.
        scope: ['identify', 'guilds.members.read', 'rpc.activities.write'],
      });
      return code;
    },
  };
}

async function startPresence(sdk: DiscordSDK, clientId: string): Promise<(presence: Presence) => void> {
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    // Only what setActivity needs. authorize and authenticate need no scopes of their own.
    scope: ['rpc.activities.write'],
  });

  // A relative address: inside Discord it goes through Discord's proxy to our server.
  const res = await fetch('/api/discord/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const { access_token } = (await res.json()) as { access_token: string };

  const auth = await sdk.commands.authenticate({ access_token });
  if (!auth) throw new Error('Discord turned down the token.');

  return presenceSender(sdk);
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
