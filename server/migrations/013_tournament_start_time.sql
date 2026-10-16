-- Tournaments can be set up ahead of time with a start time. Players enter until then, and the
-- server starts the tournament by itself once the time has come and at least 4 players are in.
-- Null: an admin starts it by hand, as before.

alter table tournaments add column starts_at timestamptz;

create index tournaments_starting on tournaments (starts_at) where status = 'registration';
