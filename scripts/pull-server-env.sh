#!/usr/bin/env bash
# Makes server/.env for local development: copies server/.env.example and fills in the shared
# Discord settings from Key Vault. Values are written straight to the file, never printed.
# Needs "az login". Run with: npm run env:pull
set -euo pipefail

VAULT=kv-ha7siia4h4zia
OUT=server/.env

# Environment variable = Key Vault secret (the same pairs as sharedSettings in infra/main.bicep).
SETTINGS=(
  "DISCORD_CLIENT_ID=Integrations--Discord--ClientId"
  "DISCORD_CLIENT_SECRET=Integrations--Discord--ClientSecret"
  "DISCORD_GUILD_ID=Integrations--Discord--GuildId"
  "DISCORD_PLAYER_ROLE_IDS=Integrations--Discord--PlayerRoleIds"
  "DISCORD_MODERATOR_ROLE_IDS=Integrations--Discord--ModeratorRoleIds"
  "DISCORD_ADMIN_ROLE_IDS=Integrations--Discord--AdminRoleIds"
  "ADMIN_DISCORD_IDS=Integrations--Discord--AdminUserIds"
)

tmp=$(mktemp)
cp server/.env.example "$tmp"
for pair in "${SETTINGS[@]}"; do
  name=${pair%%=*}
  secret=${pair#*=}
  value=$(az keyvault secret show --vault-name "$VAULT" --name "$secret" --query value -o tsv | tr -d '\r\n')
  # Rewrite the "NAME=" line with the value (values are IDs and a URL-safe secret, no "|" in them).
  sed -i "s|^$name=.*|$name=$value|" "$tmp"
done
mv "$tmp" "$OUT"
echo "Wrote $OUT with the shared Discord settings from $VAULT."
