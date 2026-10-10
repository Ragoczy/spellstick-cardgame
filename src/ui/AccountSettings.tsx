// The signed-in player's settings (online build only): help, and at the bottom, unlinking their
// Discord account. Unlinking asks twice: a dialog that lists what is deleted, and then the
// player types UNLINK before the button works.

import { useRef, useState, type FormEvent } from 'react';
import { startUnlink, UNLINK_WORD, type Me } from './online';
import { ReportProblem } from './ReportProblem';

export function AccountSettings({ me }: { me: Me }) {
  return (
    <section className="settings" aria-labelledby="settings-title">
      <h3 id="settings-title">Settings</h3>
      <h4>Help</h4>
      <ReportProblem reporter={me} />
      <h4>Your account</h4>
      <UnlinkAccount me={me} />
    </section>
  );
}

function UnlinkAccount({ me }: { me: Me }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const confirmed = typed.trim().toUpperCase() === UNLINK_WORD;

  const close = () => {
    dialog.current?.close();
    setTyped('');
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirmed) return;
    setWorking(true);
    setError(null);
    try {
      // Leaves the page: Discord checks it's them, then the server deletes their data.
      await startUnlink();
    } catch (err) {
      setError((err as Error).message);
      setWorking(false);
    }
  };

  return (
    <>
      <button type="button" className="danger" onClick={() => dialog.current?.showModal()}>Unlink my Discord account</button>
      <dialog ref={dialog} className="dialog" aria-labelledby="unlink-title" onClose={close}>
        <form onSubmit={submit}>
          <h2 id="unlink-title">Unlink your Discord account from Spellstick?</h2>
          <p>
            This removes your Spellstick game data and disconnects the game from your Discord account. It only affects
            this game. Your Discord account, your messages, your server membership, and your roles are not changed in any way.
          </p>
          <p>You will lose:</p>
          <ul>
            <li>your manager name{me.displayName ? ` (${me.displayName})` : ''}</li>
            <li>your matches in progress (they count as resigned, so your opponent wins)</li>
            <li>your open challenges</li>
            <li>your sign-in on every device</li>
            <li>the Discord user ID, username, and avatar the game keeps</li>
          </ul>
          <p className="small">
            Matches you finished stay in your opponents' history, with your name replaced by "Former player".
          </p>
          <p>This can't be undone. You can play again later by reconnecting, but you'll start fresh.</p>
          <label className="field">
            Type {UNLINK_WORD} to confirm
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <p className="small">Next, Discord checks that it's you, then brings you back here.</p>
          {error ? <p className="account-problem">{error}</p> : null}
          <div className="buttons">
            <button type="button" onClick={close}>Cancel</button>
            <button type="submit" className="danger" disabled={!confirmed || working}>
              {working ? 'Unlinking…' : 'Unlink and delete my game data'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
