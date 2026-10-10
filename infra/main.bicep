// Spellstick online game: Azure setup.
//
// Spellstick reuses the aiuthor app's shared resources in rg-aiuthor (Container Apps
// environment, Postgres server, container registry, Key Vault, logs) and adds only its own
// pieces in rg-spellstick. Nothing belonging to aiuthor is changed: Spellstick gets its own
// database, its own registry images, and read access to the shared Darkspace Games Discord
// settings in Key Vault (and no other secrets).
//
// Deploy (see infra/README.md):
//   az deployment sub create -l eastus2 -f infra/main.bicep -p infra/main.bicepparam -p image=<image>

targetScope = 'subscription'

param location string = 'eastus2'

@description('Container image to run, for example acrha7siia4h4zia.azurecr.io/spellstick:<git sha>.')
param image string

// ---- Existing shared resources (aiuthor) ----
param sharedResourceGroup string = 'rg-aiuthor'
param containerAppsEnvironmentName string = 'cae-aiuthor'
param postgresServerName string = 'psql-ha7siia4h4zia'
param registryName string = 'acrha7siia4h4zia'
param keyVaultName string = 'kv-ha7siia4h4zia'

// ---- Spellstick settings ----
param resourceGroupName string = 'rg-spellstick'
param appName string = 'ca-spellstick'
param databaseName string = 'spellstick'
@description('GitHub repo as GitHub names it in sign-in tokens: owner@ownerId/repo@repoId. The IDs stop a renamed or re-created repo from inheriting access.')
param githubRepo string = 'Ragoczy@2834782/spellstick-cardgame@1407928591'

@description('This game only: comma-separated Discord role IDs allowed to sign in instead of the shared Players role (for example a beta role). Empty = the shared Players role.')
param discordAllowedRoleIds string = ''

@description('0 = stop when idle (cheap, slow first visit). Set to 1 once live matches need an always-on server.')
param minReplicas int = 0

// Settings shared by every Darkspace game, kept in Key Vault (see infra/README.md, "Shared
// settings"). Each becomes an environment variable on the app.
var sharedSettings = [
  { env: 'DISCORD_CLIENT_ID', secret: 'Integrations--Discord--ClientId' }
  { env: 'DISCORD_CLIENT_SECRET', secret: 'Integrations--Discord--ClientSecret' }
  { env: 'DISCORD_GUILD_ID', secret: 'Integrations--Discord--GuildId' }
  { env: 'DISCORD_PLAYER_ROLE_IDS', secret: 'Integrations--Discord--PlayerRoleIds' }
  { env: 'DISCORD_MODERATOR_ROLE_IDS', secret: 'Integrations--Discord--ModeratorRoleIds' }
  { env: 'DISCORD_ADMIN_ROLE_IDS', secret: 'Integrations--Discord--AdminRoleIds' }
  { env: 'ADMIN_DISCORD_IDS', secret: 'Integrations--Discord--AdminUserIds' }
]

var tags = { app: 'spellstick' }

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module identities 'modules/identities.bicep' = {
  scope: rg
  name: 'spellstick-identities'
  params: { location: location, tags: tags, githubRepo: githubRepo }
}

module shared 'modules/shared.bicep' = {
  scope: resourceGroup(sharedResourceGroup)
  name: 'spellstick-shared'
  params: {
    postgresServerName: postgresServerName
    databaseName: databaseName
    registryName: registryName
    keyVaultName: keyVaultName
    sharedSecretNames: map(sharedSettings, s => s.secret)
    containerAppsEnvironmentName: containerAppsEnvironmentName
    appPrincipalId: identities.outputs.appPrincipalId
    deployPrincipalId: identities.outputs.deployPrincipalId
  }
}

module app 'modules/app.bicep' = {
  scope: rg
  name: 'spellstick-app'
  dependsOn: [shared]
  params: {
    location: location
    tags: tags
    appName: appName
    image: image
    environmentId: resourceId(subscription().subscriptionId, sharedResourceGroup, 'Microsoft.App/managedEnvironments', containerAppsEnvironmentName)
    registryServer: '${registryName}.azurecr.io'
    appIdentityId: identities.outputs.appIdentityId
    appClientId: identities.outputs.appClientId
    appIdentityName: identities.outputs.appIdentityName
    deployPrincipalId: identities.outputs.deployPrincipalId
    keyVaultUrl: 'https://${keyVaultName}${environment().suffixes.keyvaultDns}'
    sharedSettings: sharedSettings
    postgresHost: '${postgresServerName}.postgres.database.azure.com'
    databaseName: databaseName
    discordAllowedRoleIds: discordAllowedRoleIds
    minReplicas: minReplicas
  }
}

output appUrl string = app.outputs.url
output appIdentityName string = identities.outputs.appIdentityName
output deployClientId string = identities.outputs.deployClientId
