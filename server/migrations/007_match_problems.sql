-- Things that shouldn't happen in a match, for the beta. The roadmap's gate for phase 1 is
-- 100 finished matches with no disagreements between the browser and the server; this is where
-- any disagreement gets recorded, by the browser (it was refused a move it was offered, or
-- missed some events) or by the server (a match no longer replays the same way).

create table match_problems (
  id bigint generated always as identity primary key,
  match_id bigint not null references matches (id) on delete cascade,
  -- The player whose browser reported it. Null: the server found it.
  reported_by bigint references users (id) on delete set null,
  kind text not null check (kind in ('refused-move', 'missing-events', 'replay-failed', 'result-mismatch', 'waiting-mismatch', 'count-mismatch')),
  -- Plain-language details for the moderator. Never more than 500 characters.
  detail text not null check (length(detail) <= 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index match_problems_recent on match_problems (created_at desc);
create index match_problems_match on match_problems (match_id, kind) where resolved_at is null;
