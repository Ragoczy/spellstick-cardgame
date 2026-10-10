using 'main.bicep'

// The image is passed on the command line: -p image=<registry>/spellstick:<tag>
param image = ''

// Discord application "SpellstickCardgame" and our Discord server.
param discordClientId = '1558444401032699954'
param discordGuildId = '1308084311274160229'
// Beta role. Change here (or on the container app) to open sign-in to more people.
param discordAllowedRoleIds = '1348680742204477511'
// Paul.
param adminDiscordIds = '771010532458233888'
