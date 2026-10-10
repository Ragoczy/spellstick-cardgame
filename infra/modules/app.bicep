// The Spellstick container app, running in aiuthor's Container Apps environment.

param location string
param tags object
param appName string
param image string
param environmentId string
param registryServer string
param appIdentityId string
param appClientId string
param appIdentityName string
param deployPrincipalId string
param discordSecretUrl string
param postgresHost string
param databaseName string
param discordClientId string
param discordGuildId string
param discordAllowedRoleIds string
param adminDiscordIds string
param minReplicas int

var containerAppsContributor = '358470bc-b998-42bd-ab17-a7e34c199c0f'

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: last(split(environmentId, '/'))
  scope: resourceGroup(split(environmentId, '/')[4])
}

var publicUrl = 'https://${appName}.${environment.properties.defaultDomain}'

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${appIdentityId}': {} }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
      }
      registries: [{ server: registryServer, identity: appIdentityId }]
      secrets: [{ name: 'discord-client-secret', keyVaultUrl: discordSecretUrl, identity: appIdentityId }]
    }
    template: {
      containers: [
        {
          name: 'spellstick'
          image: image
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'PUBLIC_URL', value: publicUrl }
            { name: 'DB_HOST', value: postgresHost }
            { name: 'DB_NAME', value: databaseName }
            { name: 'DB_USER', value: appIdentityName }
            { name: 'AZURE_CLIENT_ID', value: appClientId }
            { name: 'DISCORD_CLIENT_ID', value: discordClientId }
            { name: 'DISCORD_CLIENT_SECRET', secretRef: 'discord-client-secret' }
            { name: 'DISCORD_GUILD_ID', value: discordGuildId }
            { name: 'DISCORD_ALLOWED_ROLE_IDS', value: discordAllowedRoleIds }
            { name: 'ADMIN_DISCORD_IDS', value: adminDiscordIds }
            { name: 'SESSION_DAYS', value: '7' }
          ]
          probes: [
            { type: 'Liveness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 10 }
          ]
        }
      ]
      scale: { minReplicas: minReplicas, maxReplicas: 1 }
    }
  }
}

// GitHub Actions may update this app (new image) and nothing else.
resource deployCanUpdate 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: app
  name: guid(app.id, deployPrincipalId, containerAppsContributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', containerAppsContributor)
    principalId: deployPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output url string = publicUrl
