// Spellstick's two Azure identities:
// - id-spellstick: what the running app signs in to Postgres, Key Vault, and the registry as.
// - id-spellstick-deploy: what GitHub Actions signs in as (no stored password; GitHub proves
//   it's this repo's main branch).

param location string
param tags object
param githubRepo string

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-spellstick'
  location: location
  tags: tags
}

resource deployIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-spellstick-deploy'
  location: location
  tags: tags
}

resource githubMain 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: deployIdentity
  name: 'github-main'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepo}:ref:refs/heads/main'
    audiences: ['api://AzureADTokenExchange']
  }
}

output appIdentityId string = appIdentity.id
output appIdentityName string = appIdentity.name
output appClientId string = appIdentity.properties.clientId
output appPrincipalId string = appIdentity.properties.principalId
output deployClientId string = deployIdentity.properties.clientId
output deployPrincipalId string = deployIdentity.properties.principalId
