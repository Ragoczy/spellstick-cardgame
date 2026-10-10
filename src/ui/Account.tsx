// The sign-in panel on the start screen (online build only): a "Sign in with Discord" button,
// or who you're signed in as. New players pick a manager name here.

import { useEffect, useState, type FormEvent } from 'react';
import { fetchMe, saveDisplayName, signOut, SIGN_IN_PROBLEMS, SIGN_IN_URL, type Me } from './online';

type State = { kind: 'loading' } | { kind: 'signedOut' } | { kind: 'signedIn'; me: Me } | { kind: 'offline' };

/** Reads ?signin=<reason> once, then removes it from the address bar. */
function takeSignInProblem(): string | null {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get('signin');
  if (!reason) return null;
  params.delete('signin');
  const query = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  return SIGN_IN_PROBLEMS[reason] ?? SIGN_IN_PROBLEMS.failed!;
}

export function Account() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [problem] = useState(takeSignInProblem);

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
      {problem ? <p className="account-problem">{problem}</p> : null}
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
