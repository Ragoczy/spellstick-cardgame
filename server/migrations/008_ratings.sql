-- Ranked matches and player ratings. See docs/spellstick-multiplayer-design.md, "Ranked play".
--
-- Ratings use the Elo system (server/ratings.ts). They can always be worked out again from the
-- ranked matches since the last reset, so the ratings table is a running total, not the record.

-- A challenge marked Ranked (draft matches only) changes both players' ratings when it ends.
alter table matches add column ranked boolean not null default false;
-- How much each side's rating went up or down when the match ended. Null for unranked matches.
alter table matches add column rating_change_a integer;
alter table matches add column rating_change_b integer;

create index matches_ranked_finished on matches (finished_at) where ranked and status = 'finished';

-- One row per player who has finished a ranked match since the last reset.
create table ratings (
  user_id bigint primary key references users (id) on delete cascade,
  rating integer not null,
  games integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  updated_at timestamptz not null default now()
);

create index ratings_by_rating on ratings (rating desc);

-- Each time an admin starts ratings over (for example after the beta). Only ranked matches
-- that finished after the latest reset count.
create table rating_resets (
  id bigint generated always as identity primary key,
  at timestamptz not null default now()
);
