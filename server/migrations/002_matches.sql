-- Online matches and their moves. See docs/spellstick-multiplayer-design.md, "Data model".
--
-- A match's game state is never stored. It is rebuilt by replaying the moves in order from the
-- setup (rules engine replay()), so the move list is the only record of what happened.

create table matches (
  id bigint generated always as identity primary key,
  -- 'prototype' (the placeholder teams) until collections and drafts exist.
  format text not null default 'prototype',
  -- The challenger plays side A; the player they challenged plays side B.
  player_a bigint not null references users (id),
  player_b bigint not null references users (id),
  -- Everything replay() needs: seed, card set, teams, and the full rules settings. Plain json
  -- (not jsonb) on purpose: jsonb reorders object keys, and replays must see exactly what the
  -- game started with.
  setup json not null,
  -- challenged: waiting for player B to accept. declined: B said no, or A withdrew.
  status text not null default 'challenged' check (status in ('challenged', 'active', 'finished', 'declined')),
  -- Who the match is waiting on (accepting, or the next decision). Null when it's over.
  waiting_on bigint references users (id),
  waiting_since timestamptz not null default now(),
  move_count integer not null default 0,
  -- When finished: the winner (null for a draw) and why it ended.
  winner bigint references users (id),
  end_reason text check (end_reason in ('played', 'resigned')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  check (player_a <> player_b)
);

create index matches_player_a on matches (player_a);
create index matches_player_b on matches (player_b);

-- Every accepted move, in order. Append-only.
create table match_events (
  match_id bigint not null references matches (id) on delete cascade,
  seq integer not null,
  player_id bigint not null references users (id),
  move json not null,
  at timestamptz not null default now(),
  primary key (match_id, seq)
);
