# Darkspace Games: shared Discord sign-in (handoff for another project)

Last updated: 2026-10-10. Written for a Claude Code session working on a different Darkspace
game that should use the same Discord login and stored settings as Spellstick.

The owner is Paul (Discord user ID `771010532458233888`). He is a novelist and .NET developer,
likes plain readable code, and wants short summaries. Ask him before changing anything shared.

> **Changed 2026-10-10:** the Discord *application* is no longer shared.
> - **Spellstick's app:** `1558444401032699954` (`Integrations--Discord--ClientId` /
>   `ClientSecret`) is now Spellstick's own app. It is also Spellstick's Discord Activity, and
>   Discord shows its name as "Playing …".
> - **A new game:** creates its own Discord application and keeps that app's client ID and
>   secret in its own settings. Don't reuse Spellstick's.
> - **Still shared:** the Discord server, the roles, and the admin settings (`GuildId`,
>   `*RoleIds`, `AdminUserIds`). Read the rest of this doc with that in mind.

## What this gives a game

- **Sign in with Discord** through one shared Discord application, "Darkspace Games".
- **Access by Discord role** in the Darkspace Discord server: Players may sign in; Mods become
  moderators; Admins become admins. Roles are re-read at every sign-in.
- **One copy of the settings** in Azure Key Vault, read by every game. Nothing is copied into a
  game's own config.
- Each game keeps **its own player accounts**, keyed by Discord user ID. There is no central
  accounts service (decided 2026-10-10; Discord ID keys keep that option open).

## Shared settings (source of truth: Key Vault)

Azure subscription **Darkspace.Press** (`502f5821-a8b0-49cd-bb1e-d53cade9c9af`), tenant
`509e3a3b-7968-4713-8f97-1e97b7d2a705`, region East US 2. Key Vault **`kv-ha7siia4h4zia`** in
resource group `rg-aiuthor` (RBAC mode; vault URL `https://kv-ha7siia4h4zia.vault.azure.net`).

| Key Vault secret | Env var used by Spellstick | Current value | Notes |
| --- | --- | --- | --- |
| `Integrations--Discord--ClientId` | `DISCORD_CLIENT_ID` | `1558444401032699954` | Darkspace Games application ID |
| `Integrations--Discord--ClientSecret` | `DISCORD_CLIENT_SECRET` | (secret) | **Never print, log, paste in chat, or commit** |
| `Integrations--Discord--GuildId` | `DISCORD_GUILD_ID` | `1308084311274160229` | The Darkspace Discord server |
| `Integrations--Discord--PlayerRoleIds` | `DISCORD_PLAYER_ROLE_IDS` | `1558451934862647316` | Players: may sign in |
| `Integrations--Discord--ModeratorRoleIds` | `DISCORD_MODERATOR_ROLE_IDS` | `1377774256170991667` | Mods: moderator in every game |
| `Integrations--Discord--AdminRoleIds` | `DISCORD_ADMIN_ROLE_IDS` | `1348680742204477511` | Admins: admin in every game |
| `Integrations--Discord--AdminUserIds` | `ADMIN_DISCORD_IDS` | `771010532458233888` | Emergency admins: always allowed in, even without a role or outside the server |

- Role and admin values are **comma-separated lists** of IDs.
- The IDs are not secret. Only the client secret is. The table's values are a snapshot: read
  Key Vault for the real ones.
- Names use the .NET convention (`--` becomes `:`), so a .NET app reading the vault with the
  Key Vault configuration provider sees `Integrations:Discord:ClientId` and so on.
- Unrelated secrets in the same vault: `Integrations--Discord--BotToken` (aiuthor's bot) and
  `AiProviders--*` (API keys). A game must **not** be granted access to these.
- `SpellstickCardgame` is an old copy of the client secret, no longer used. Ignore it.
- **Changing a shared value affects every game.** Only with Paul's OK. After a change, restart
  each game's app so it reads the new value.

## How the sign-in works (the contract)

Reference implementation (TypeScript, Fastify): repo
[Ragoczy/spellstick-cardgame](https://github.com/Ragoczy/spellstick-cardgame), folder `server/`.

| File | What it holds |
| --- | --- |
| `server/auth/discord.ts` | Discord API calls, the authorize URL, the access rule (`checkAccess`) |
| `server/auth/routes.ts` | `/auth/discord/login`, `/auth/discord/callback`, `/auth/logout` |
| `server/users.ts` | Account upsert, hashed sessions, display-name rules |
| `server/api/me.ts` | `GET /api/me`, `POST /api/me/name` |
| `server/migrations/001_users_and_sessions.sql` | `users` and `sessions` tables |
| `server/config.ts` | Env var names and parsing |
| `tests/server/*.test.ts` | Tests, with a fake Discord, for every rule below |

Copy or port these. The rules any implementation must keep:

1. **Login** (`GET /auth/discord/login`): make a random `state` (24+ bytes) and put it in an
   HttpOnly, SameSite=Lax cookie (Secure on https) scoped to `/auth`, 10-minute lifetime.
   Redirect to `https://discord.com/oauth2/authorize` with `response_type=code`, `client_id`,
   `scope=identify guilds.members.read`, `redirect_uri=<public url>/auth/discord/callback`,
   `state`, and `prompt=none`. `prompt=none` skips Discord's approval screen for people who
   already approved the app; first-timers still see it.
2. **Callback** (`GET /auth/discord/callback`):
   - `error` in the query (the player pressed Cancel): go to `/?signin=cancelled`.
   - Compare `state` with the cookie using a timing-safe comparison, then clear the cookie. A
     mismatch or missing state goes to `/?signin=failed`.
   - `POST https://discord.com/api/v10/oauth2/token` (form-encoded, HTTP Basic auth with client
     ID and secret, `grant_type=authorization_code`, `code`, `redirect_uri`) returns an access token.
   - `GET /users/@me` gives `id`, `username`, `avatar`.
   - `GET /users/@me/guilds/{guildId}/member` gives `roles` and `joined_at`. A 404 means "not
     in the server".
   - **Discard the Discord access token.** Never store it.
3. **Access rule** (`checkAccess`), first match wins:
   1. Discord user ID is in the emergency admin list: allowed, **admin**.
   2. Not in the server: refused, `not-member`.
   3. Has an Admins role: allowed, **admin**.
   4. Has a Mods role: allowed, **moderator**.
   5. Has an allowed role: allowed, **player**. The allowed roles are the game's own list if it
      has one (for example a beta role), otherwise the shared Players roles. If both are
      empty, any server member is allowed.
   6. Otherwise: refused, `no-role`.

   A refusal redirects to `/?signin=<reason>`, and the page explains it in plain language.
4. **Account**: upsert by Discord ID. Store the username, avatar, account creation time (from
   the ID: `(id >> 22) + 1420070400000` ms), the server join time, and the role. **Overwrite
   the role at every sign-in**, so changes in Discord take effect.
5. **Session**: 32 random bytes, base64url, in an HttpOnly, Secure, SameSite=Lax cookie on `/`.
   Store only a **SHA-256 hash** in the database. Lifetime 7 days; that's also the longest a
   removed Discord role can keep working.
6. **Other players see a display name the player picks**, never the Discord handle. Spellstick's
   rules: 3–24 characters; letters, numbers, spaces and `' . & -`; starts with a letter or
   number; unique ignoring capitals.
7. **Safety**: refuse non-GET requests whose `Origin` header doesn't match the public URL. Keep
   query strings out of request logs (the callback carries one-time codes). Send
   `X-Content-Type-Options: nosniff`.
8. **Behind Azure's proxy**: trust forwarded headers (Fastify `trustProxy: true`; in ASP.NET
   Core, forwarded headers), so the app knows it's on https.

**For a .NET game:** the same flow can use ASP.NET Core cookie auth plus the
`AspNet.Security.OAuth.Discord` provider. You must still add the guild-member call and the
access rule above (the provider only does `identify`), request the `guilds.members.read`
scope, and not save tokens (`SaveTokens = false`).

## Hooking a new game up

### 1. Discord (Paul does this)

In the Discord Developer Portal, app **Darkspace Games** → OAuth2 → Redirects, add the game's
return address: `https://<game address>/auth/discord/callback`. Add a local one too if needed
(Spellstick uses `http://localhost:5180/auth/discord/callback`). An app allows up to 10
redirects. Nothing else in the portal changes.

### 2. Azure access to the shared settings

Give the game its own user-assigned managed identity. **Don't reuse `id-aiuthor` or
`id-spellstick`.** Grant it **Key Vault Secrets User on each of the seven secrets
individually**, never on the whole vault, which would expose the AI API keys. Bicep, from
Spellstick's `infra/modules/shared.bicep`:

```bicep
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = { name: 'kv-ha7siia4h4zia' }

resource sharedSecrets 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = [for name in sharedSecretNames: {
  parent: vault
  name: name
}]

resource appSecretRead 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (name, i) in sharedSecretNames: {
  scope: sharedSecrets[i]
  name: guid(sharedSecrets[i].id, appPrincipalId, '4633458b-17de-408a-b874-0445c86b69e6')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalId: appPrincipalId
    principalType: 'ServicePrincipal'
  }
}]
```

This module must be deployed scoped to `resourceGroup('rg-aiuthor')`.

### 3a. A game on Azure Container Apps (as Spellstick is)

Use Key Vault references, so the app only sees ordinary environment variables. From
Spellstick's `infra/main.bicep` and `infra/modules/app.bicep`:

```bicep
var sharedSettings = [
  { env: 'DISCORD_CLIENT_ID', secret: 'Integrations--Discord--ClientId' }
  { env: 'DISCORD_CLIENT_SECRET', secret: 'Integrations--Discord--ClientSecret' }
  { env: 'DISCORD_GUILD_ID', secret: 'Integrations--Discord--GuildId' }
  { env: 'DISCORD_PLAYER_ROLE_IDS', secret: 'Integrations--Discord--PlayerRoleIds' }
  { env: 'DISCORD_MODERATOR_ROLE_IDS', secret: 'Integrations--Discord--ModeratorRoleIds' }
  { env: 'DISCORD_ADMIN_ROLE_IDS', secret: 'Integrations--Discord--AdminRoleIds' }
  { env: 'ADMIN_DISCORD_IDS', secret: 'Integrations--Discord--AdminUserIds' }
]
// In the container app:
//   configuration.secrets: [for s in sharedSettings: { name: toLower(replace(s.env, '_', '-')),
//     keyVaultUrl: 'https://kv-ha7siia4h4zia.vault.azure.net/secrets/${s.secret}', identity: <identity resource id> }]
//   container env:         [for s in sharedSettings: { name: s.env, secretRef: toLower(replace(s.env, '_', '-')) }]
```

The role grants must exist before the app is created. If creation fails with a Key Vault
access error, wait a minute and redeploy: new grants take a moment to reach every Azure service.

The shared Container Apps environment is `cae-aiuthor` (rg-aiuthor), default domain
`proudbush-0a90b692.eastus2.azurecontainerapps.io`, so an app named `ca-<game>` gets
`https://ca-<game>.proudbush-0a90b692.eastus2.azurecontainerapps.io`.

### 3b. A .NET app (App Service, aiuthor-style, or anything else)

Add the vault as a configuration source with the app's identity
(`builder.Configuration.AddAzureKeyVault(new Uri("https://kv-ha7siia4h4zia.vault.azure.net"), new DefaultAzureCredential(...))`).
Then read `Integrations:Discord:ClientId` and the rest. If the vault holds secrets the app
mustn't load, use a `KeyVaultSecretManager` that only loads names starting with
`Integrations--Discord--`. Per-secret RBAC still blocks the rest.

### 4. Local development

Pull the values into a gitignored env file **without displaying them**. Spellstick's
`scripts/pull-server-env.sh` (run with `npm run env:pull`, needs `az login`) does this:

```bash
value=$(az keyvault secret show --vault-name kv-ha7siia4h4zia --name "$secret" --query value -o tsv | tr -d '\r\n')
sed -i "s|^$name=.*|$name=$value|" "$tmp"   # write straight to the file; never echo it
```

Make sure `.env` files are gitignored before writing one. To check a copied secret, compare
SHA-256 hashes; never print it.

### 5. Per-game settings

Things like an allowed-roles override (a beta role), session length, public URL and database
belong to the game, not to Key Vault. In Spellstick they live in `infra/main.bicepparam` and on
the container app.

## Gotchas we already hit

- **Server owners don't automatically hold roles.** That's why the emergency admin list exists:
  Paul always gets in.
- **Git Bash mangles Azure resource IDs** that start with `/subscriptions/...` (MSYS path
  conversion). Prefix `az` commands that take scopes or IDs with `MSYS_NO_PATHCONV=1`.
- **Switching an app to these settings: deploy the code first, then the settings.** Old code
  with a missing role list can fall back to "any member may sign in".
- **GitHub Actions OIDC to Azure:** GitHub now sends the subject as
  `repo:<owner>@<ownerId>/<repo>@<repoId>:ref:refs/heads/main`. Spellstick's is
  `repo:Ragoczy@2834782/spellstick-cardgame@1407928591:ref:refs/heads/main`; the plain
  `repo:owner/repo` form fails with AADSTS700213. The failed login prints the exact subject.
- **A deploy identity updating an app in `cae-aiuthor`** needs "Container Apps Operator" on the
  environment (for the `join` permission). It also needs Reader on the registry
  `acrha7siia4h4zia` for `az acr login`, besides AcrPush and Container Apps Contributor on its
  own app.
- **Postgres** (`psql-ha7siia4h4zia`, shared) has password sign-in turned off. A new app's
  managed identity needs `pgaadauth_create_principal('<identity name>', false, false)`, run by
  Paul's Entra admin login. The firewall only admits Azure services, so local setup needs a
  temporary firewall rule for your IP; remove it afterwards. Spellstick's `infra/README.md`,
  step 3, has the exact commands.
- **Claude Code's auto mode blocks Azure deployments** (IaC applies) unless Paul authorizes them
  in chat. Ask him before applying.
- **Don't modify aiuthor's resources** (its apps, its identity, shared vault access, log caps)
  without asking. A $75/month budget alert covers the whole subscription.

## Where to read more

- Spellstick's `infra/README.md`: Azure layout, deploys, changing shared settings.
- Spellstick's `docs/spellstick-multiplayer-design.md`, "Identity and accounts".
