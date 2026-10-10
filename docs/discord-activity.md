# Spellstick as a Discord Activity

Players can launch Spellstick inside Discord (in a voice or text channel, from the App
Launcher). While they play, their Discord profile shows "Playing <app name>" with what they are
doing: "In the menu", or "Playing the computer · Turn 4 · 1–0".

Normal browser play is unchanged. Everything Discord-related starts only when Discord launches
the page.

## How it works

1. Discord loads the game in a frame from `https://<client id>.discordsays.com/?frame_id=...`.
   Discord's proxy fetches the page from our container app using the **root URL mapping** (`/`).
2. `src/main.tsx` calls `startDiscord()` (`src/ui/discord.ts`). With no `frame_id` in the
   address it does nothing. With one, it loads `src/ui/discordActivity.ts` as a separate file.
   That file holds the Discord SDK (`@discord/embedded-app-sdk`, about 46 kB gzipped), so normal
   players never download it.
3. `discordActivity.ts`:
   - reads the client ID from the address (`<client id>.discordsays.com`), so there is no
     client-side setting
   - `new DiscordSDK(clientId)`, then `await sdk.ready()`
   - `sdk.commands.authorize(...)` with scopes `identify` and `rpc.activities.write`. The first
     time, Discord asks the player to allow it.
   - POSTs the one-time code to `/api/discord/token`. The address is relative, so inside
     Discord it goes to `https://<client id>.discordsays.com/api/discord/token`, and the root
     mapping sends it to our server.
   - `sdk.commands.authenticate({ access_token })`
   - `sdk.commands.setActivity(...)` whenever the screen, turn, or score changes. Repeats are
     skipped, and changes are sent at most once every 5 seconds (Discord rate-limits presence).
   - Sends clicks on links to other websites to `sdk.commands.openExternalLink`, which asks
     the player and then opens the link in their browser. This also covers links inside
     shadow-root widgets.
4. The server's `POST /api/discord/token` (`server/api/discord-activity.ts`) trades the code at
   `https://discord.com/api/v10/oauth2/token` using the Activity app's client ID and secret. It
   returns only `{ access_token }`, stores nothing, and sets no cookies.

If any step fails, the console shows one warning ("Spellstick: Discord features are off.") and
the game carries on. No errors escape.

### Server changes for the frame

- `Content-Security-Policy: frame-ancestors` used to be `'self'`, which blocked Discord's frame.
  It now lists `'self'`, `https://discord.com`, `https://ptb.discord.com`,
  `https://canary.discord.com`, and the Activity's own `https://<client id>.discordsays.com`.
  That last one is a single address, not a wildcard. No other site may frame the game.
- The server refuses posts from other websites. It now also accepts posts from
  `https://<client id>.discordsays.com`, but **only** to `/api/discord/token`.
- No `X-Frame-Options` header is sent, so there is nothing to change there.

### What doesn't work inside Discord (yet)

- **Online matches.** Sign-in uses a cookie and a full-page redirect to Discord, and neither
  works inside Discord's frame. Inside Discord, the start screen says online matches need the
  browser, and play against the computer works normally. Making online play work in Discord
  would mean signing in from the Activity's token instead. That is a separate piece of work.
- **The Privacy link** opens inside the frame. "Back to the game" then reloads without
  `frame_id`, so the presence details stop updating until the player relaunches the Activity.
  The game itself still works.

## Which Discord app, and its secret

Discord shows "Playing **<application name>**", so the presence text comes from the app's name.

**Spellstick has one Discord app (`1558444401032699954`), used for both sign-in and the
Activity.** It used to be shared by all Darkspace games. From 2026-10-10 it is Spellstick's,
and other games get their own apps. The Activity uses its existing Key Vault keys, so no new
secret or Azure setting is needed. The server reads:

| Env var | Container App secret | Key Vault key |
|---|---|---|
| `DISCORD_CLIENT_ID` | `discord-client-id` | `Integrations--Discord--ClientId` |
| `DISCORD_CLIENT_SECRET` | `discord-client-secret` | `Integrations--Discord--ClientSecret` |

These are the same settings "Sign in with Discord" uses (`infra/main.bicep`,
`sharedSettings`), so the Activity is enabled on that same Discord app. The game inside Discord
is served from `https://1558444401032699954.discordsays.com`.

### Optional: a separate Activity app

The server also accepts `DISCORD_ACTIVITY_CLIENT_ID` and `DISCORD_ACTIVITY_CLIENT_SECRET`. When
both are set, the Activity uses that app instead, and sign-in stays on the main app. Nothing
uses this today. Wiring them in Azure would need:

- a Key Vault key for the secret
- two entries in `infra/main.bicep`

Add them to Bicep rather than with `az containerapp secret set`, because Bicep replaces the
app's secret list each time it's applied.

**If only the ID is set:** the server logs a warning and turns the Activity off. That means no
token endpoint and no Discord frame permission. It doesn't stop the server, so browser play and
sign-in keep working.

Never commit a secret. `server/.env` is git-ignored.

## URL mappings (Developer Portal → Activities → URL Mappings)

| Prefix | Target | Needed | What for |
|---|---|---|---|
| `/` | `ca-spellstick.proudbush-0a90b692.eastus2.azurecontainerapps.io` | **Yes** | The game, its files, and `/api/discord/token` |

That's the only one. The game makes no requests to other origins at runtime: no external
scripts, fonts, images, WebSockets, or APIs. Its live updates (`/api/live`) and API calls are
all on its own server. `URL_MAPPINGS` in `src/ui/discordActivity.ts` is therefore empty, and
`patchUrlMappings` isn't called.

When `cardgame.games.darkspace.press` is bound, change the `/` target to that host.

Targets have no `https://`. Put longer prefixes above shorter ones, so `/` is always last.

**About `/.proxy`:** older Discord guides route mapped calls through `/.proxy/<prefix>/...`. The
current docs and SDK 2.5.0's `patchUrlMappings` use `/<prefix>/...` directly
(`https://<client id>.discordsays.com/<prefix>/...`), and that's what this code does.

### The featured-products widget (not embedded yet)

The game doesn't embed the widget today. If it does later, inside Discord:

- **Works with no widget change:**
  - the script, via a mapping like `/dsp-games` → `games.darkspace.press`, loaded from
    `/dsp-games/widgets/featured-products.js` when in Discord
  - its product-list `fetch`, via a mapping like `/dsp-store` → `darkspace.press` plus
    `patchUrlMappings`, or by setting the widget's `endpoint` attribute to
    `/dsp-store/wp-json/wc/store/v1/products?...`
  - its product links, which open in the browser through the link handler above
- **Needs a widget change: product images.** The images are on `www.darkspace.press`, and the
  widget creates its `<img>` elements (including `srcset`, and a preload via `new Image()`)
  inside its shadow root. Discord's sandbox blocks them. `patchUrlMappings({ patchSrcAttributes })`
  watches only the main document, not shadow roots, and doesn't rewrite `srcset`.
  - **What the widget would need:** an optional way to rewrite image URLs, for example an
    `image-base` attribute (replace `https://www.darkspace.press` with `/dsp-images`), or a
    `rewriteUrl` hook. Plus a `/dsp-images` → `www.darkspace.press` mapping.
  - Without that change, the widget shows names, prices, and links with broken images.

## Testing locally through a tunnel

You need: Postgres (`npm run db:up`), `server/.env` (`npm run env:pull`; nothing to add), and
`cloudflared`.

1. Build the online game and start the server, which serves the built game on port 8080:
   ```bash
   npm run build:online
   npm run server:dev
   ```
2. In another terminal, start a tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:8080
   ```
   It prints an address like `https://funky-jogging-bunny.trycloudflare.com`.
3. In the Developer Portal, set the `/` mapping's target to `funky-jogging-bunny.trycloudflare.com`
   (no `https://`), and save.
4. In Discord (with Developer Mode on), join a voice channel in a server where the app is
   installed. Open the App Launcher (the rocket button), and choose the Activity.
5. Check: your profile shows "Playing …" with "In the menu", and then turn and score once a
   game starts. The browser console (Ctrl+Shift+I in the desktop app) has no Spellstick warning.
6. **Afterwards, set the `/` target back to the container app host.** Quick tunnels get a new
   address every time.

To test the page without Discord, open it with
`?frame_id=x&instance_id=x&platform=desktop`. The SDK file loads, one "Discord features are
off" warning appears (the page isn't on `discordsays.com`), and the game plays normally.

## Cold start

The container app scales to zero when idle, and the first request can take about 30 seconds.
Inside Discord, that means a long loading screen the first time someone launches it after a
quiet spell.

To keep one copy always running (**not applied**):

```bash
az containerapp update -g rg-spellstick -n ca-spellstick --min-replicas 1
```

Also set `param minReplicas = 1` in `infra/main.bicepparam`, so the next Bicep apply doesn't
put it back to 0.

Cost at the app's size (0.25 vCPU, 0.5 GiB), using consumption-plan list prices. Check the
Azure pricing page before deciding.

| | Estimate |
|---|---|
| Mostly idle | about **$6 a month** (idle rate: 0.25 × $0.000003/s CPU + 0.5 × $0.000003/s memory) |
| Busy all the time | about **$20 a month** (worst case) |

The subscription's monthly free grant (180,000 vCPU-seconds and 360,000 GiB-seconds) may cover
part of it, but it's shared with aiuthor's apps. The $75/month budget alert still applies.

## Developer Portal checklist (by hand, in order)

1. **Open the app** `1558444401032699954`. Its ID is in Key Vault as
   `Integrations--Discord--ClientId`.
2. **Rename it** (General Information → Name). Discord shows "Playing <name>". Use exactly what
   players should see. You asked for both "Spellstick Cardgame" and "Spellstick: The Card
   Game", so pick one. Spellstick's Discord sign-in screen shows this name too.
3. **Art.** Upload the app icon (General Information → App Icon). Then add the Activity's art
   (Activities → Settings / Art Assets, where Discord asks for the cover image and its sizes).
4. **OAuth2 → Redirects:** add the placeholder `https://127.0.0.1` and save. Discord's Activity
   guide requires a redirect to be present. The existing sign-in callback
   stays as it is.
5. **OAuth2: leave the client secret alone.** The server already has it as
   `Integrations--Discord--ClientSecret`. Resetting it would break sign-in until Key Vault is
   updated.
6. **Installation → Installation Contexts:** turn on User Install and Guild Install.
7. **Activities → URL Mappings:** `/` → `ca-spellstick.proudbush-0a90b692.eastus2.azurecontainerapps.io`
   (no other mappings needed today).
8. **Activities → Settings:** turn on **Enable Activities**. This also creates the "Launch"
   entry point command. Under **Supported Platforms**, tick Web, Desktop (Windows, macOS,
   Linux), iOS, and Android. The game works on phones, but it's untested inside Discord on
   mobile.
9. **App Testers:** add the Discord accounts that should try it before it's public. Each tester
   accepts the invite.
10. **Deploy** (push to `main`). The server change has to be live before Discord can load the
    game from the container app. Until then, Discord's frame is blocked by the old
    `frame-ancestors 'self'` header. (The tunnel test above works before deploying.)
11. **Install it to the Darkspace Discord server**, launch it from a voice channel, and check
    the presence.
