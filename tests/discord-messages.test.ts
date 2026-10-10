// A tripwire: the game sends no Discord messages today (no DMs, channel posts, webhooks, or
// pings), so it has no notification settings. If this test fails, someone has started sending
// them. Before shipping that, follow "Notifications (Discord bot)" in
// docs/spellstick-multiplayer-design.md: every DM category is opt-in and off by default, the
// server checks the setting before each send, content is about the game only, and each DM says
// how to turn it off. Then update this test.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Discord API paths and terms used only for sending messages. */
const MESSAGE_SENDING = [
  /\/channels\/[^'"`\s]*\/messages/, // posting to a channel or DM
  /\/users\/@me\/channels/, // opening a DM
  /\/webhooks\//, // webhooks
  /\binteractions\/[^'"`\s]*\/callback/, // replying to slash commands
  /['"`]Bot \$\{/, // authenticating as a bot
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('Discord messages', () => {
  it('are not sent anywhere yet, so there is nothing to opt in to', () => {
    const found: string[] = [];
    for (const file of [...sourceFiles('server'), ...sourceFiles('src')]) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of MESSAGE_SENDING) if (pattern.test(text)) found.push(`${file}: ${pattern}`);
    }
    expect(found).toEqual([]);
  });
});
