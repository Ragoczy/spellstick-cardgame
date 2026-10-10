// A tripwire: Discord messages may only be sent from server/notify.ts, which follows
// "Notifications (Discord bot)" in docs/spellstick-multiplayer-design.md: every DM kind is opt-in
// and off by default, the server checks the setting before each send, content is about the game
// only, and each DM says how to turn it off. If this test fails, someone has started sending
// messages somewhere else: route them through server/notify.ts instead.
// (tests/server/notifications.test.ts checks the behavior itself.)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Discord API paths and terms used only for sending messages. */
const MESSAGE_SENDING = [
  /\/channels\/[^'"`\s]*\/messages/, // posting to a channel or DM
  /\/users\/@me\/channels/, // opening a DM
  /\/webhooks\//, // webhooks
  /\binteractions\/[^'"`\s]*\/callback/, // replying to slash commands
  /['"`]Bot \$\{/, // authenticating as a bot
];

const NOTIFIER = normalize('server/notify.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('Discord messages', () => {
  it('are only sent from server/notify.ts', () => {
    const found: string[] = [];
    for (const file of [...sourceFiles('server'), ...sourceFiles('src')]) {
      if (normalize(file) === NOTIFIER) continue;
      const text = readFileSync(file, 'utf8');
      for (const pattern of MESSAGE_SENDING) if (pattern.test(text)) found.push(`${file}: ${pattern}`);
    }
    expect(found).toEqual([]);
  });

  it('server/notify.ts checks the opt-in setting and adds the turn-off line to every message', () => {
    const text = readFileSync(NOTIFIER, 'utf8');
    expect(text).toContain("'Turn off these alerts in Spellstick → Settings → Notifications.'");
    expect(text).toContain('user.enabled !== true');
    expect(text).toContain('`${text}\\n\\n${DM_FOOTER}`');
  });
});
