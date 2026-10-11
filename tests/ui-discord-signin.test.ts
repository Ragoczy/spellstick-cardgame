// Signing in to online play from inside Discord: the page gets a code from Discord, sends it to
// the server, and turns each way it can go wrong into a plain message.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const discordSignInCode = vi.fn<() => Promise<string>>();
vi.mock('../src/ui/discord', () => ({ discordSignInCode: () => discordSignInCode() }));

const { signInInDiscord, SIGN_IN_PROBLEMS } = await import('../src/ui/online');

/** Pretends the server answers with this status and body, and records what was sent. */
function serverAnswers(status: number, body: object) {
  const sent: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  });
  return sent;
}

describe('sign-in inside Discord', () => {
  beforeEach(() => { discordSignInCode.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("sends Discord's code to the server", async () => {
    discordSignInCode.mockResolvedValue('the-code');
    const sent = serverAnswers(200, { ok: true });
    await signInInDiscord();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('/api/discord/signin');
    expect(sent[0]!.init.method).toBe('POST');
    expect(JSON.parse(sent[0]!.init.body as string)).toEqual({ code: 'the-code' });
  });

  it('says sign-in was cancelled when the player says no in Discord, without calling the server', async () => {
    discordSignInCode.mockImplementation(async () => { throw new Error('User cancelled'); });
    const sent = serverAnswers(200, { ok: true });
    await expect(signInInDiscord()).rejects.toThrow(SIGN_IN_PROBLEMS.cancelled!);
    expect(sent).toHaveLength(0);
  });

  it('explains why the server turned them away', async () => {
    discordSignInCode.mockResolvedValue('the-code');
    serverAnswers(403, { error: 'Not allowed to play online.', reason: 'no-role' });
    await expect(signInInDiscord()).rejects.toThrow(SIGN_IN_PROBLEMS['no-role']!);
    serverAnswers(403, { error: 'Not allowed to play online.', reason: 'not-member' });
    await expect(signInInDiscord()).rejects.toThrow(SIGN_IN_PROBLEMS['not-member']!);
  });

  it('asks them to try again when something else goes wrong', async () => {
    discordSignInCode.mockResolvedValue('the-code');
    serverAnswers(502, { error: 'Discord turned the code down.', reason: 'failed' });
    await expect(signInInDiscord()).rejects.toThrow(SIGN_IN_PROBLEMS.failed!);
    serverAnswers(500, {});
    await expect(signInInDiscord()).rejects.toThrow(SIGN_IN_PROBLEMS.failed!);
  });
});
