-- Named player cards and the name lists they're built from.
--
-- data/cards.prototype.json and data/names.json stay the master copy (CLAUDE.md, "Cards are data").
-- The server copies them into these tables every time it starts (server/cardData.ts), so edit the
-- JSON, not these rows.

create table given_names (
  id integer generated always as identity primary key,
  name text not null unique
);

create table surnames (
  id integer generated always as identity primary key,
  name text not null unique,
  -- A compound surname (Carrington-Blair) points at the two surnames it joins. Both null otherwise.
  first_part_id integer references surnames (id),
  second_part_id integer references surnames (id),
  check ((first_part_id is null) = (second_part_id is null))
);

-- One row per player card design. Owned copies (card instances) will point at these later.
create table player_cards (
  -- The card id in the card data, for example 'pl-001'. Also the art filename stem.
  id text primary key,
  given_name_id integer not null references given_names (id),
  surname_id integer not null references surnames (id),
  kind text not null check (kind in ('field', 'goalie')),
  role text not null check (role in ('runner', 'striker', 'playmaker', 'allrounder', 'anchor', 'stopper', 'goalie')),
  -- Field players have the four field stats; goalies have Save.
  speed smallint,
  shot smallint,
  defense smallint,
  faceoff smallint,
  save smallint,
  -- Extra skill points the card was made with (1 to 4), on top of its type's base stats.
  bonus_points smallint not null check (bonus_points between 0 and 4),
  -- [{ "name": "Anger", "affinity": "fire" }, ...]: 1 to 3 Resonants.
  resonants jsonb not null,
  -- The card data version these values came from.
  card_set_version text not null,
  updated_at timestamptz not null default now(),
  check (
    (kind = 'field' and speed is not null and shot is not null and defense is not null and faceoff is not null and save is null)
    or (kind = 'goalie' and save is not null and speed is null and shot is null and defense is null and faceoff is null)
  ),
  check ((kind = 'goalie') = (role = 'goalie'))
);
