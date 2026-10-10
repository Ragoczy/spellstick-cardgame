-- Discord notifications. See docs/spellstick-multiplayer-design.md, "Notifications (Discord bot)".
--
-- Every kind is opt-in: a missing row means "don't send". Players turn kinds on in
-- Settings -> Notifications.

create table notification_settings (
  user_id bigint not null references users (id) on delete cascade,
  kind text not null check (kind in ('challenge', 'your_turn', 'time_low')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

-- What was sent (or tried), so the same alert isn't sent twice and alerts can be spaced out.
-- Holds no message text.
create table notifications_sent (
  id bigint generated always as identity primary key,
  user_id bigint not null references users (id) on delete cascade,
  kind text not null,
  match_id bigint references matches (id) on delete cascade,
  sent_at timestamptz not null default now(),
  -- False when Discord refused (for example, the player only accepts DMs from friends).
  ok boolean not null
);

create index notifications_sent_lookup on notifications_sent (user_id, kind, match_id, sent_at desc);
