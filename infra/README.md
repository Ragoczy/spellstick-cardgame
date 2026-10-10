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
| `SpellstickCardgame` secret | `kv-ha7siia4h4zia` (rg-aiuthor) | Discord client secret. The app can read only this secret. |
| Logs | `log-aiuthor` via `cae-aiuthor` | Server logs. |

Live address (for now): https://ca-spellstick.proudbush-0a90b692.eastus2.azurecontainerapps.io

## Changing settings

Who may sign in, admins, and the minimum number of running copies are in `main.bicepparam`
and `main.bicep`. Change them there and re-run step 2, or change the environment variable on
the container app in the Azure portal (Containers → Environment variables) for a quick edit.

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
will be switched to whatever image you name.

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
