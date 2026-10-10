// The signed-in player's Discord notification settings. Every kind starts off.
//
//   GET  /api/me/notifications   { available, kinds: [{ kind, label, description, enabled }] }
//   POST /api/me/notifications   turn one kind on or off: { kind, enabled }

import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import { currentUser } from '../auth/current-user';
import { isNotificationKind, NOTIFICATION_KINDS, type NotificationKind, type Notifier } from '../notify';

export interface NotificationSettingsResponse {
  /** False when the game can't send Discord messages yet (no bot set up). */
  available: boolean;
  kinds: { kind: NotificationKind; label: string; description: string; enabled: boolean }[];
}

export function notificationRoutes(app: FastifyInstance, deps: AppDeps, notifier: Notifier): void {
  const { db } = deps;

  const response = async (userId: number): Promise<NotificationSettingsResponse> => {
    const settings = await notifier.settingsFor(userId);
    return {
      available: notifier.available,
      kinds: NOTIFICATION_KINDS.map((k) => ({ kind: k.kind, label: k.label, description: k.description, enabled: settings[k.kind] })),
    };
  };

  app.get('/api/me/notifications', async (req, reply) => {
    const user = await currentUser(db, req);
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });
    return response(user.id);
  });

  app.post<{ Body: { kind?: unknown; enabled?: unknown } | undefined }>('/api/me/notifications', async (req, reply) => {
    const user = await currentUser(db, req);
    if (!user) return reply.code(401).send({ error: 'Not signed in.' });
    const { kind, enabled } = req.body ?? {};
    if (!isNotificationKind(kind) || typeof enabled !== 'boolean') return reply.code(400).send({ error: 'Choose an alert and on or off.' });
    await notifier.setSetting(user.id, kind, enabled);
    return response(user.id);
  });
}
