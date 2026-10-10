-- Unlinking a Discord account ("Unlink my Discord account" in the player's settings).
--
-- Unlinking deletes the player. When other players' matches still point at them, their users row
-- stays as an empty placeholder instead: every Discord detail and their name are wiped, and other
-- players see "Former player". unlinked_at marks those rows.

alter table users
  alter column discord_id drop not null,
  alter column discord_username drop not null,
  alter column discord_created_at drop not null,
  add column unlinked_at timestamptz,
  -- A placeholder has no Discord ID; everyone else has one.
  add constraint users_unlinked_has_no_discord check ((discord_id is null) = (unlinked_at is not null));

-- A minimal record that an unlink happened: when, and nothing about who.
create table account_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  event text not null check (event in ('account unlinked'))
);
