-- Owned cards and saved teams (online phase 2). See docs/spellstick-multiplayer-design.md,
-- "Cards, collection, and persistent teams".
--
-- Every card a player owns is an instance of a player card design (player_cards), with its own
-- serial number and history. Spells aren't owned yet: a saved team uses one team's spells from
-- the card data (its "spell set").

-- How many copies of each design have been given out. The next copy's serial number is this + 1.
alter table player_cards add column issued integer not null default 0;

create table card_instances (
  id bigint generated always as identity primary key,
  card_id text not null references player_cards (id),
  -- 1 for the first copy of this design ever given out, 2 for the next, and so on.
  serial integer not null,
  owner_id bigint not null references users (id),
  -- How the owner got it.
  source text not null check (source in ('starter', 'award', 'store', 'trade', 'admin')),
  -- Special editions, later: foil, signed, numbered.
  edition jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (card_id, serial)
);

create index card_instances_owner on card_instances (owner_id);

-- Every change of owner, starting with the first. from_user is null when the game gave it out.
create table card_history (
  id bigint generated always as identity primary key,
  instance_id bigint not null references card_instances (id) on delete cascade,
  from_user bigint references users (id),
  to_user bigint references users (id),
  reason text not null check (reason in ('starter', 'award', 'store', 'trade', 'admin')),
  at timestamptz not null default now()
);

create index card_history_instance on card_history (instance_id);

-- When the player got their starter set (null until then). It's given once, on their first visit
-- to their cards or the challenge form.
alter table users add column starter_granted_at timestamptz;

-- Saved teams: a name, a spell set, and 24 owned player cards (2 goalies, 22 field players).
create table teams (
  id bigint generated always as identity primary key,
  owner_id bigint not null references users (id),
  name text not null,
  -- A team id in the card data whose 16 spells this team uses (for example 'A').
  spell_set text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index teams_owner_name on teams (owner_id, lower(name));

create table team_cards (
  team_id bigint not null references teams (id) on delete cascade,
  instance_id bigint not null references card_instances (id) on delete cascade,
  primary key (team_id, instance_id)
);

create index team_cards_instance on team_cards (instance_id);

-- Constructed matches: which saved team each side brought, for the team's match record. The
-- cards themselves are copied into the match setup, so a team changed or deleted later never
-- changes a match.
alter table matches
  add column team_a bigint references teams (id) on delete set null,
  add column team_b bigint references teams (id) on delete set null;
