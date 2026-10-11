// Inside Discord the player is signed in at launch. When that doesn't work out, the start
// screen explains why in plain words, and says what to do next.

import { describe, expect, it } from 'vitest';
import { discordSignInProblem, SIGN_IN_PROBLEMS } from '../src/ui/online';

describe('Discord sign-in messages', () => {
  it('explains each reason the server gives', () => {
    expect(discordSignInProblem('not-member')).toMatch(/members of our Discord server.*open the game again/);
    expect(discordSignInProblem('no-role')).toBe(SIGN_IN_PROBLEMS['no-role']);
    expect(discordSignInProblem('failed')).toMatch(/didn't work.*close the game and open it again/);
  });

  it("explains when Discord itself didn't sign them in", () => {
    expect(discordSignInProblem('discord')).toMatch(/^Discord didn't sign you in/);
  });

  it('falls back to "try again" for anything unexpected, and always mentions playing the computer or what to do', () => {
    expect(discordSignInProblem('something-new')).toBe(discordSignInProblem('failed'));
    for (const reason of ['discord', 'failed']) expect(discordSignInProblem(reason)).toMatch(/play against the computer/);
  });
});
