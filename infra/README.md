# Spellstick on Azure

The online game runs as one container app, `ca-spellstick`, in the Darkspace.Press subscription
(East US 2). It shares the aiuthor app's resources in `rg-aiuthor` and adds its own pieces in
`rg-spellstick`:

| Resource | Where | What it's for |
| --- | --- | --- |
| `ca-spellstick` | rg-spellstick | The game server and online browser game. |
| `id-spellstick` | rg-spellstick | The app's identity: signs in to Postgres, reads its Key Vault secret, pulls images. |
| `id-spellstick-deploy` | rg-spellstick | GitHub Actions' identity (main branch only): pushes images, updates `ca-spellstick`. |
| `spellstick` database | `psql-ha7siia4h4zia` (rg-aiuthor) | Players and sessions. |
| `spellstick` images | `acrha7siia4h4zia` (rg-aiuthor) | Container images, tagged by git commit. |
| `Integrations--Discord--*` secrets | `kv-ha7siia4h4zia` (rg-aiuthor) | Discord settings shared by all Darkspace games (see below). The app can read only these. |
| Logs | `log-aiuthor` via `cae-aiuthor` | Server logs. |

Live address (for now): https://ca-spellstick.proudbush-0a90b692.eastus2.azurecontainerapps.io

## Deploys

Every push to `main` deploys automatically (`.github/workflows/deploy.yml`): tests run, then
Azure deploys. GitHub Pages now gets only a "moved" page (`pages-redirect/index.html`) that
forwards the old ragoczy.github.io address to the live one; update its link if the address
changes. The Azure job builds the image, tags it with the commit, switches `ca-spellstick` to it, and waits until the new version is healthy. It signs in
as `id-spellstick-deploy` using the repository variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
and `AZURE_SUBSCRIPTION_ID` (IDs, not secrets).

To roll back, point the app at an earlier image:

```bash
az containerapp update -g rg-spellstick -n ca-spellstick --image acrha7siia4h4zia.azurecr.io/spellstick:<earlier commit sha>
```

## Cost alert

`budget.bicep` emails Paul when the whole subscription (Spellstick and aiuthor) passes 80% of
$75 in a month, or is forecast to go over. It never stops anything. To change the amount:

```bash
az deployment sub create -l eastus2 -n budget -f infra/budget.bicep -p contactEmail=pjackson@darkspace.press amount=100
```

## Shared settings (all Darkspace games)

Every Darkspace game signs in through one Discord application, "Darkspace Games", and checks
the same Discord server and roles. *(Changed 2026-10-10: that application is now Spellstick's
own, and it is also Spellstick's Discord Activity (`docs/discord-activity.md`). Other games will
get their own Discord applications. The server, roles, and admin settings stay shared.)* Those settings live once, in Key Vault `kv-ha7siia4h4zia`.
The names follow the .NET convention (`--` means `:`), so aiuthor could read them as
`Integrations:Discord:*` too.

| Key Vault secret | Environment variable | Value |
| --- | --- | --- |
| `Integrations--Discord--ClientId` | `DISCORD_CLIENT_ID` | Darkspace Games application ID |
| `Integrations--Discord--ClientSecret` | `DISCORD_CLIENT_SECRET` | Its client secret |
| `Integrations--Discord--GuildId` | `DISCORD_GUILD_ID` | Our Discord server |
| `Integrations--Discord--PlayerRoleIds` | `DISCORD_PLAYER_ROLE_IDS` | Players role: may sign in |
| `Integrations--Discord--ModeratorRoleIds` | `DISCORD_MODERATOR_ROLE_IDS` | Mods role: moderator in every game |
| `Integrations--Discord--AdminRoleIds` | `DISCORD_ADMIN_ROLE_IDS` | Admins role: admin in every game |
| `Integrations--Discord--AdminUserIds` | `ADMIN_DISCORD_IDS` | Emergency admins who always get in (Paul) |

Role lists can hold several IDs, separated by commas. A player's role is set from their Discord
roles each time they sign in, so a change in Discord takes effect at their next sign-in
(sessions last 7 days).

**To change one:** update the secret, then restart each game so it reads the new value.

```bash
az keyvault secret set --vault-name kv-ha7siia4h4zia --name Integrations--Discord--PlayerRoleIds --value "<role id>,<another role id>"
az containerapp revision restart -g rg-spellstick -n ca-spellstick --revision $(az containerapp show -g rg-spellstick -n ca-spellstick --query properties.latestRevisionName -o tsv)
```

**A new game** reads the same secrets: list them in its own Bicep like `sharedSettings` in
`main.bicep`, grant its identity Key Vault Secrets User on each one, and add its return address
(`https://<game>/auth/discord/callback`) to the Darkspace Games app in the Discord Developer
Portal (up to 10 per app). Players' accounts stay separate per game, keyed by Discord ID.

**Locally,** `npm run env:pull` writes `server/.env` with these values.

## Spellstick-only settings

`main.bicepparam` holds what is Spellstick's own: `discordAllowedRoleIds` (empty = the shared
Players role; set a role ID to limit Spellstick to, say, a beta role). Change it there and
re-run step 2, or edit `DISCORD_ALLOWED_ROLE_IDS` on the container app in the Azure portal
(Containers → Environment variables) for a quick change. `main.bicep` holds the minimum number
of running copies.

## First-time setup

Run these in Git Bash from the repo root, signed in with `az login` as the subscription owner.

### 1. Push an image

```bash
tag=$(git rev-parse --short HEAD)
az acr login -n acrha7siia4h4zia
docker build -t acrha7siia4h4zia.azurecr.io/spellstick:$tag .
docker push acrha7siia4h4zia.azurecr.io/spellstick:$tag
```

### 2. Create or update the Azure resources

Preview first (`what-if`), then apply. Pass the image that's currently deployed, or the app
will be switched to whatever image you name. After the first setup, get it with:
`tag=$(az containerapp show -g rg-spellstick -n ca-spellstick --query "properties.template.containers[0].image" -o tsv | cut -d: -f2)`

```bash
az deployment sub what-if -l eastus2 -n spellstick -f infra/main.bicep -p infra/main.bicepparam -p image=acrha7siia4h4zia.azurecr.io/spellstick:$tag
az deployment sub create -l eastus2 -n spellstick -f infra/main.bicep -p infra/main.bicepparam -p image=acrha7siia4h4zia.azurecr.io/spellstick:$tag
```

If the create step fails with a Key Vault or registry access error, wait a minute and run it
again: new access grants can take a moment to reach every Azure service.

### 3. Give the app a database login (once)

The Postgres server only accepts Microsoft sign-ins, and Entra logins can only be added with
SQL by the server's Entra admin (Paul). The server's firewall only admits Azure services, so
this opens it to your own IP address for a minute and closes it again.

```bash
ip=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create -g rg-aiuthor -n psql-ha7siia4h4zia -r spellstick-setup --start-ip-address $ip --end-ip-address $ip
export PGPASSWORD=$(az account get-access-token --resource-type oss-rdbms --query accessToken -o tsv)
admin='pjackson_darkspace.press#EXT#@pjacksondarkspace.onmicrosoft.com'
host=psql-ha7siia4h4zia.postgres.database.azure.com
docker run --rm -e PGPASSWORD postgres:16-alpine psql "host=$host dbname=postgres user=$admin sslmode=require" -v ON_ERROR_STOP=1 \
  -c "select * from pgaadauth_create_principal('id-spellstick', false, false);" \
  -c 'grant all privileges on database spellstick to "id-spellstick";'
docker run --rm -e PGPASSWORD postgres:16-alpine psql "host=$host dbname=spellstick user=$admin sslmode=require" -v ON_ERROR_STOP=1 \
  -c 'grant all on schema public to "id-spellstick";'
az postgres flexible-server firewall-rule delete -g rg-aiuthor -n psql-ha7siia4h4zia -r spellstick-setup --yes
unset PGPASSWORD
```

### 4. Check it

Open the live address. The first visit after a quiet spell takes a few seconds while the app
starts. To read the server's logs:

```bash
az containerapp logs show -g rg-spellstick -n ca-spellstick --tail 50
```

## Later: your own domain

To move to play.darkspace.press: add a CNAME record pointing at the app's address and a TXT
record for verification, then add the domain and a free managed certificate on the container
app. Update `PUBLIC_URL`, and add the new return address in the Discord Developer Portal.
