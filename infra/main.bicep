// Spellstick online game: Azure setup.
//
// Spellstick reuses the aiuthor app's shared resources in rg-aiuthor (Container Apps
// environment, Postgres server, container registry, Key Vault, logs) and adds only its own
// pieces in rg-spellstick. Nothing belonging to aiuthor is changed: Spellstick gets its own
// database, and access to its own registry images and its one Key Vault secret.
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
@description('Key Vault secret holding the Discord client secret.')
param discordSecretName string = 'SpellstickCardgame'

// ---- Spellstick settings ----
param resourceGroupName string = 'rg-spellstick'
param appName string = 'ca-spellstick'
param databaseName string = 'spellstick'
param githubRepo string = 'Ragoczy/spellstick-cardgame'

param discordClientId string
param discordGuildId string
@description('Comma-separated Discord role IDs allowed to sign in. Empty = any server member.')
param discordAllowedRoleIds string
@description('Comma-separated Discord user IDs that always get in, as admins.')
param adminDiscordIds string

@description('0 = stop when idle (cheap, slow first visit). Set to 1 once live matches need an always-on server.')
param minReplicas int = 0

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
    discordSecretName: discordSecretName
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
    discordSecretUrl: 'https://${keyVaultName}${environment().suffixes.keyvaultDns}/secrets/${discordSecretName}'
    postgresHost: '${postgresServerName}.postgres.database.azure.com'
    databaseName: databaseName
    discordClientId: discordClientId
    discordGuildId: discordGuildId
    discordAllowedRoleIds: discordAllowedRoleIds
    adminDiscordIds: adminDiscordIds
    minReplicas: minReplicas
  }
}

output appUrl string = app.outputs.url
output appIdentityName string = identities.outputs.appIdentityName
output deployClientId string = identities.outputs.deployClientId
