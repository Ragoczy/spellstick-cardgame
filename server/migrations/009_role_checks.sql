-- Re-checking Discord roles while a player stays signed in. See server/auth/role-check.ts.
--
-- When the player's roles in our Discord server were last checked: at sign-in, then again every
-- so often while they use the game. Existing players count as checked at their last sign-in.

alter table users add column roles_checked_at timestamptz;
update users set roles_checked_at = last_sign_in_at;
alter table users alter column roles_checked_at set not null;
alter table users alter column roles_checked_at set default now();
