-- Players and sign-in sessions. See docs/spellstick-multiplayer-design.md, "Data model".

create table users (
  id bigint generated always as identity primary key,
  discord_id text not null unique,
  -- The player's Discord handle and avatar. Shown only to the player and to moderators.
  discord_username text not null,
  discord_avatar text,
  -- When the Discord account was made (worked out from its ID), and when they joined our server.
  -- Used later to stop brand-new alt accounts from trading.
  discord_created_at timestamptz not null,
  joined_server_at timestamptz,
  -- The team or manager name other players see. Null until the player picks one.
  display_name text,
  role text not null default 'player' check (role in ('player', 'moderator', 'admin')),
  trade_frozen boolean not null default false,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Display names are unique, ignoring capitals.
create unique index users_display_name_unique on users (lower(display_name));

create table sessions (
  -- A hash of the cookie value, so a copy of the database can't be used to sign in.
  id_hash text primary key,
  user_id bigint not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index sessions_user_id on sessions (user_id);
