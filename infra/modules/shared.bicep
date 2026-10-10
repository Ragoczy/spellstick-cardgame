// Spellstick's share of the aiuthor resources in rg-aiuthor. Adds only:
// - a "spellstick" database on the Postgres server,
// - registry access (the app pulls images; GitHub Actions pushes them),
// - read access to one Key Vault secret (the Discord client secret), and nothing else in the vault.
//
// The app's Postgres login is created separately with SQL (see infra/README.md), because Azure
// can only add Entra logins from inside the database.

param postgresServerName string
param databaseName string
param registryName string
param keyVaultName string
param discordSecretName string
param appPrincipalId string
param deployPrincipalId string

var roles = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  acrPush: '8311e382-0749-4cb8-b61a-304f252e45ec'
  keyVaultSecretsUser: '4633458b-17de-408a-b874-0445c86b69e6'
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' existing = {
  name: postgresServerName
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: databaseName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource appPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, appPrincipalId, roles.acrPull)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPull)
    principalId: appPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource deployPush 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, deployPrincipalId, roles.acrPush)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPush)
    principalId: deployPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource discordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' existing = {
  parent: vault
  name: discordSecretName
}

// Scoped to the one secret, so Spellstick can't read aiuthor's API keys.
resource appSecretRead 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: discordSecret
  name: guid(discordSecret.id, appPrincipalId, roles.keyVaultSecretsUser)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.keyVaultSecretsUser)
    principalId: appPrincipalId
    principalType: 'ServicePrincipal'
  }
}
