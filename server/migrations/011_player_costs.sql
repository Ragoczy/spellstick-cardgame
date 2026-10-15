-- Rules v0.17: player cards gain Toughness, a cost, and sometimes an ability; bonus points go.
--
-- data/cards.prototype.json stays the master copy. server/cardData.ts fills these columns again
-- every time the server starts, so the rows only need a placeholder until then.

alter table player_cards drop column bonus_points;

-- Field players (v0.17): knocked down, the player is fine on a roll at or below this. Goalies have none.
alter table player_cards add column toughness smallint;
-- What the player counts against a team's cap (RULES.md, "Building a team").
alter table player_cards add column cost smallint not null default 0;
alter table player_cards alter column cost drop default;
-- { "effect": "hits_harder", "params": { "amount": 1 } }, or null for no ability.
alter table player_cards add column ability jsonb;

alter table player_cards add check (kind = 'field' or toughness is null);
