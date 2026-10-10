// The sign-in panel on the start screen (online build only): a "Sign in with Discord" button,
// or who you're signed in as. New players pick a manager name here. Settings opens below it.

import { useEffect, useState, type FormEvent } from 'react';
import { AccountSettings } from './AccountSettings';
import {
  fetchMe, saveDisplayName, signOut, SIGN_IN_PROBLEMS, SIGN_IN_URL, UNLINK_PROBLEMS, UNLINKED_MESSAGE, type Me,
} from './online';

type State = { kind: 'loading' } | { kind: 'signedOut' } | { kind: 'signedIn'; me: Me } | { kind: 'offline' };

type Notice = { text: string; problem: boolean };

/**
 * Reads what the server sent the player back with, once, then removes it from the address bar:
 * ?signin=<reason> (sign-in didn't work), ?unlink=<reason> (unlinking didn't), or ?unlinked=1.
 */
function takeNotice(): Notice | null {
  const params = new URLSearchParams(window.location.search);
  const signin = params.get('signin');
  const unlink = params.get('unlink');
  const unlinked = params.get('unlinked');
  if (!signin && !unlink && !unlinked) return null;
  for (const name of ['signin', 'unlink', 'unlinked']) params.delete(name);
  const query = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  if (unlinked) return { text: UNLINKED_MESSAGE, problem: false };
  if (unlink) return { text: UNLINK_PROBLEMS[unlink] ?? UNLINK_PROBLEMS.failed!, problem: true };
  return { text: SIGN_IN_PROBLEMS[signin!] ?? SIGN_IN_PROBLEMS.failed!, problem: true };
}

/** onChange: told who is signed in (null when nobody), so the start screen can offer online play. */
export function Account({ onChange }: { onChange?: (me: Me | null) => void }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [notice] = useState(takeNotice);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    onChange?.(state.kind === 'signedIn' ? state.me : null);
  }, [state, onChange]);

  useEffect(() => {
    fetchMe()
      .then((me) => setState(me ? { kind: 'signedIn', me } : { kind: 'signedOut' }))
      .catch(() => setState({ kind: 'offline' }));
  }, []);

  const doSignOut = async () => {
    await signOut();
    setState({ kind: 'signedOut' });
  };

  return (
    <section className="account" aria-live="polite">
      {notice ? <p className={notice.problem ? 'account-problem' : 'account-notice'}>{notice.text}</p> : null}
      {state.kind === 'loading' ? <p className="small">Checking sign-in…</p> : null}
      {state.kind === 'offline' ? <p className="small">Online play isn't available right now. You can still play against the computer.</p> : null}
      {state.kind === 'signedOut' ? (
        <div className="account-row">
          <a className="discord-button" href={SIGN_IN_URL}>Sign in with Discord</a>
          <span className="small">Sign in to play other readers online.</span>
        </div>
      ) : null}
      {state.kind === 'signedIn' && state.me.displayName === null ? (
        <PickName me={state.me} onSaved={(me) => setState({ kind: 'signedIn', me })} />
      ) : null}
      {state.kind === 'signedIn' && state.me.displayName !== null ? (
        <div className="account-row">
          {state.me.avatarUrl ? <img className="avatar" src={state.me.avatarUrl} alt="" width={28} height={28} /> : null}
          <span>Signed in as <strong>{state.me.displayName}</strong></span>
          <button type="button" className="quiet" onClick={doSignOut}>Sign out</button>
        </div>
      ) : null}
      {state.kind === 'signedIn' ? (
        <button type="button" className="quiet" aria-expanded={showSettings} onClick={() => setShowSettings(!showSettings)}>
          {showSettings ? 'Hide settings' : 'Settings'}
        </button>
      ) : null}
      {state.kind === 'signedIn' && showSettings ? <AccountSettings me={state.me} /> : null}
    </section>
  );
}

function PickName({ me, onSaved }: { me: Me; onSaved: (me: Me) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveDisplayName(name));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="pick-name" onSubmit={submit}>
      <label htmlFor="display-name">
        Welcome, {me.discordUsername}. Pick a team or manager name. Other players see this name, not your Discord name.
      </label>
      <div className="account-row">
        <input id="display-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoComplete="off" placeholder="For example, Riverside Ravens" />
        <button type="submit" className="primary" disabled={saving || name.trim().length < 3}>Save name</button>
      </div>
      {error ? <p className="account-problem">{error}</p> : null}
    </form>
  );
}
