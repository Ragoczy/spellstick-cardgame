// Settings -> Notifications: which Discord messages the player wants. Every kind starts off,
// and nothing is sent unless the player turns it on here.

import { useEffect, useState } from 'react';
import { fetchNotificationSettings, saveNotificationSetting, type NotificationSettings as Settings } from './online';

export function NotificationSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    fetchNotificationSettings().then(setSettings).catch((err: Error) => setProblem(err.message));
  }, []);

  const toggle = async (kind: string, enabled: boolean) => {
    setProblem(null);
    try {
      setSettings(await saveNotificationSetting(kind, enabled));
    } catch (err) {
      setProblem((err as Error).message);
    }
  };

  if (!settings) return problem ? <p className="account-problem">{problem}</p> : <p className="small">Loading…</p>;
  return (
    <div className="notification-settings">
      <p className="small">
        Discord messages from the game about your own matches. They're all off until you turn them on.
        {settings.available ? '' : ' (The game can’t send Discord messages yet, so these take effect once it can.)'}
      </p>
      {settings.kinds.map((k) => (
        <label key={k.kind} className="toggle">
          <input type="checkbox" checked={k.enabled} onChange={(e) => toggle(k.kind, e.target.checked)} />
          <span><strong>{k.label}.</strong> {k.description}</span>
        </label>
      ))}
      {problem ? <p className="account-problem">{problem}</p> : null}
    </div>
  );
}
