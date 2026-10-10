using 'main.bicep'

// The image is passed on the command line: -p image=<registry>/spellstick:<tag>
param image = ''

// Discord settings shared by all Darkspace games (app, server, roles, admins) live in Key Vault
// as Integrations--Discord--*; see infra/README.md. Only Spellstick's own choices are here.

// Who may sign in to Spellstick. Empty = the shared Players role. Set a role ID here to limit
// Spellstick to, for example, a beta role.
param discordAllowedRoleIds = ''
