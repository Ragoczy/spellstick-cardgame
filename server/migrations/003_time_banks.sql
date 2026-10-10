-- Time banks. See docs/spellstick-multiplayer-design.md, "Time banks".
--
-- Each player has one bank of time per match. It runs only while the match is waiting on them.
-- The banks below are what was left when the match last changed (waiting_since); the player
-- being waited on has used up the time since then too. waiting_due is when their bank runs out.
-- Matches from before this change have no banks (untimed).

alter table matches
  -- 'live' or 'async' (see TIME_BANKS in server/matches.ts). Null: untimed.
  add column pace text check (pace in ('live', 'async')),
  add column bank_a_ms bigint,
  add column bank_b_ms bigint,
  add column waiting_due timestamptz,
  -- A player whose bank ran out: the computer makes their decisions from then on.
  add column autopilot_a boolean not null default false,
  add column autopilot_b boolean not null default false;

-- A player who never made a move before their bank ran out forfeits.
alter table matches drop constraint matches_end_reason_check;
alter table matches add constraint matches_end_reason_check check (end_reason in ('played', 'resigned', 'forfeit'));

-- Moves the computer made for a player who ran out of time.
alter table match_events add column by_computer boolean not null default false;

-- Finding banks that have run out.
create index matches_waiting_due on matches (waiting_due) where status = 'active';
