// The start screen's "Recent changes" list: the last few changes pushed to the game, read from
// git when the game is built (see vite.config.ts). Hidden if the build had no history to read.

/** "2026-10-10" -> "Oct 10, 2026". */
function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function RecentChanges() {
  const changes = __RECENT_CHANGES__;
  if (changes.length === 0) return null;
  return (
    <section className="recent-changes">
      <h3>Recent changes</h3>
      <ul>
        {changes.map((change, i) => (
          <li key={i}>
            <span className="recent-date">{formatDate(change.date)}</span> {change.summary}
          </li>
        ))}
      </ul>
    </section>
  );
}
