// "Report a problem": the filled-in email to the admin.

import { describe, expect, it } from 'vitest';
import { REPORT_CATEGORIES, REPORT_EMAIL, reportBody, reportMailto, reportSubject } from '../src/ui/report';

describe('report a problem', () => {
  it('offers the five categories', () => {
    expect(REPORT_CATEGORIES).toEqual(['Bug', 'Player behavior / harassment', 'Cheating or exploit', 'Privacy / data request', 'Other']);
  });

  it('goes to the admin with a tagged subject', () => {
    const link = new URL(reportMailto('Cheating or exploit', '', null));
    expect(link.protocol).toBe('mailto:');
    expect(link.pathname).toBe(REPORT_EMAIL);
    expect(REPORT_EMAIL).toBe('admin@darkspace.press');
    expect(decodeURIComponent(link.searchParams.get('subject') ?? '')).toBe('[Spellstick Report] Cheating or exploit');
    expect(reportSubject('Bug')).toBe('[Spellstick Report] Bug');
  });

  it("includes a signed-in player's name and Discord ID", () => {
    const body = reportBody('Player behavior / harassment', 'They were rude in chat.', { displayName: 'Riverside Ravens', discordId: '1234567890' });
    expect(body).toContain('They were rude in chat.');
    expect(body).toContain('Player name: Riverside Ravens');
    expect(body).toContain('Discord user ID: 1234567890');
  });

  it('leaves the account out when nobody is signed in', () => {
    const body = reportBody('Bug', '', null);
    expect(body).not.toContain('Discord user ID');
    expect(body).toContain('Category: Bug');
  });

  it('encodes spaces and line breaks the way email apps expect', () => {
    const link = reportMailto('Other', 'Line one\nLine two & more', null);
    expect(link).not.toContain('+');
    expect(link).toContain('%0A');
    expect(link).toContain('%26');
  });
});
