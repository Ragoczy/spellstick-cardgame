// "Report a problem": a link that opens a small form, which then opens a filled-in email to
// the admin (see report.ts). Used in the footer, the help screen, and the account settings.

import { useRef, useState } from 'react';
import { REPORT_CATEGORIES, REPORT_EMAIL, reportMailto, type ReportCategory, type Reporter } from './report';

/** reporter: the signed-in player (null when signed out or in the offline game). */
export function ReportProblem({ reporter }: { reporter: Reporter | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<ReportCategory>(REPORT_CATEGORIES[0]);
  const [details, setDetails] = useState('');

  return (
    <>
      <button type="button" className="quiet" onClick={() => dialog.current?.showModal()}>Report a problem</button>
      <dialog ref={dialog} className="dialog" aria-labelledby="report-title">
        <h2 id="report-title">Report a problem</h2>
        <p className="small">This opens an email to {REPORT_EMAIL} in your email app, ready to send.</p>
        <label className="field">
          What kind of problem?
          <select value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)}>
            {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">
          What happened? (You can also write this in the email.)
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} maxLength={1500} />
        </label>
        {reporter ? (
          <p className="small">
            Your player name ({reporter.displayName ?? 'not picked yet'}) and Discord user ID ({reporter.discordId}) are
            included in the email, so we can find your account.
          </p>
        ) : null}
        <div className="buttons">
          <button type="button" onClick={() => dialog.current?.close()}>Cancel</button>
          <a className="button-link primary" href={reportMailto(category, details, reporter)} onClick={() => dialog.current?.close()}>
            Open email
          </a>
        </div>
        <p className="small">No email app? Write to {REPORT_EMAIL} and put "[Spellstick Report] {category}" in the subject.</p>
      </dialog>
    </>
  );
}
