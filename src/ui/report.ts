// "Report a problem": builds an email to the admin. There is no mail service, so the report
// opens in the player's own email app (a mailto link), already filled in.

export const REPORT_EMAIL = 'admin@darkspace.press';

export const REPORT_CATEGORIES = [
  'Bug',
  'Player behavior / harassment',
  'Cheating or exploit',
  'Privacy / data request',
  'Other',
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

/** Who is reporting, when they're signed in, so the admin can find their account. */
export interface Reporter {
  displayName: string | null;
  discordId: string;
}

export function reportSubject(category: ReportCategory): string {
  return `[Spellstick Report] ${category}`;
}

export function reportBody(category: ReportCategory, details: string, reporter: Reporter | null): string {
  const lines = [`Category: ${category}`, ''];
  lines.push(details.trim() || '(Describe what happened here.)');
  if (reporter) {
    lines.push('', '---', `Player name: ${reporter.displayName ?? '(not picked yet)'}`, `Discord user ID: ${reporter.discordId}`);
  }
  return lines.join('\n');
}

/** The mailto: address that opens the filled-in email. */
export function reportMailto(category: ReportCategory, details: string, reporter: Reporter | null): string {
  // URLSearchParams would turn spaces into "+", which email apps show as is. mailto wants %20.
  const subject = encodeURIComponent(reportSubject(category));
  const body = encodeURIComponent(reportBody(category, details, reporter));
  return `mailto:${REPORT_EMAIL}?subject=${subject}&body=${body}`;
}
