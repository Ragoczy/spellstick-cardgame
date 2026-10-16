-- Tournaments, award cards, and redeem codes (online phase 3). See
-- docs/spellstick-multiplayer-design.md, "Tournaments" and "Special award cards".
--
-- Results are never typed in: each pairing's result comes from its match. Standings are worked
-- out from the pairings (server/swiss.ts), so nothing here is a running total.

create table tournaments (
  id bigint generated always as identity primary key,
  name text not null,
  -- How players get their cards: a head-to-head draft each match, or each player's saved team.
  format text not null check (format in ('draft', 'constructed')),
  lanes smallint not null default 2 check (lanes in (2, 3)),
  -- Each player's time bank per match (TIME_BANKS in server/matches.ts).
  pace text not null check (pace in ('live', 'async')),
  -- How long each round lasts. Unfinished matches are settled at the deadline.
  round_hours integer not null check (round_hours between 1 and 336),
  -- Free-form, typed by the admin ("A signed paperback of the next book"). Delivered by hand;
  -- prize_sent_at is when the admin marked it sent.
  top_prize text,
  prize_sent_at timestamptz,
  -- The player card that award editions are made from (champion, top cut, taking part). Null:
  -- no award cards for this event.
  award_card text references player_cards (id),
  status text not null default 'registration'
    check (status in ('registration', 'swiss', 'knockout', 'finished', 'cancelled')),
  -- Fixes the random parts: first-round pairings, sides, and the last tiebreaker.
  seed integer not null,
  -- Set when the tournament starts, from the number of players.
  swiss_rounds smallint,
  top_cut smallint,
  -- The round being played (0 before the start). Knockout rounds follow the Swiss rounds.
  round smallint not null default 0,
  round_ends_at timestamptz,
  champion_id bigint references users (id) on delete set null,
  created_by bigint references users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table tournament_entries (
  tournament_id bigint not null references tournaments (id) on delete cascade,
  user_id bigint not null references users (id) on delete cascade,
  -- Saved-team events: the team, and a copy of its deck and name taken when the player entered,
  -- so changing the team later doesn't change the event.
  team_id bigint references teams (id) on delete set null,
  team_name text,
  deck json,
  -- Rounds where the player never made a move. Two drops them.
  missed_rounds smallint not null default 0,
  dropped_at timestamptz,
  drop_reason text check (drop_reason in ('withdrew', 'no_shows', 'left')),
  -- Knockout seed (1 = best), set when the knockout starts.
  knockout_seed smallint,
  -- Set when the tournament finishes: 'champion', 'finalist', 'knockout', or 'played'.
  final_place text,
  entered_at timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

create index tournament_entries_user on tournament_entries (user_id);

create table tournament_pairings (
  id bigint generated always as identity primary key,
  tournament_id bigint not null references tournaments (id) on delete cascade,
  round smallint not null,
  stage text not null check (stage in ('swiss', 'knockout')),
  -- Table number in Swiss; bracket position in the knockout (winners of 0 and 1 meet next).
  slot smallint not null,
  player_a bigint not null references users (id) on delete cascade,
  -- Null for a bye.
  player_b bigint references users (id) on delete cascade,
  match_id bigint references matches (id),
  -- A, B, draw, double_loss (neither player moved before the deadline), or bye. Null while playing.
  outcome text check (outcome in ('A', 'B', 'draw', 'double_loss', 'bye')),
  goals_a smallint not null default 0,
  goals_b smallint not null default 0,
  unique (tournament_id, round, slot)
);

create index tournament_pairings_match on tournament_pairings (match_id);

-- A tournament's matches start straight away (no challenge to accept).
alter table matches add column tournament_id bigint references tournaments (id);

-- A match still going at its round deadline is settled by the score at that moment.
alter table matches drop constraint matches_end_reason_check;
alter table matches add constraint matches_end_reason_check
  check (end_reason in ('played', 'resigned', 'forfeit', 'deadline'));

-- Single-use codes for award cards: book launches, conventions, staff picks. Each code gives
-- one copy of a player card with an edition label.
create table redeem_codes (
  code text primary key,
  card_id text not null references player_cards (id),
  label text not null,
  tradeable boolean not null default true,
  expires_at timestamptz,
  created_by bigint references users (id) on delete set null,
  created_at timestamptz not null default now(),
  redeemed_by bigint references users (id) on delete set null,
  redeemed_at timestamptz,
  instance_id bigint references card_instances (id) on delete set null
);
