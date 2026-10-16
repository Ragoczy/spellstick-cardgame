// Redeem codes: single-use codes that give one award copy of a player card. For book launches,
// conventions, staff picks, and later a code printed in the physical game. See
// docs/spellstick-multiplayer-design.md, "Special award cards".
//
// Admins make codes in batches and hand them out. A player types one in on their cards screen.

import { randomInt } from 'node:crypto';
import type pg from 'pg';
import type { OwnedCard } from '../src/shared/collectionApi';
import type { RedeemCodeRow } from '../src/shared/tournamentApi';
import { giveAwardCard } from './collection';
import { isAwardableCard } from './tournaments';
import type { User } from './users';

export class CodeError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Letters and digits that can't be mistaken for each other (no 0/O, 1/I/L). */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** Two groups of five: about 50 bits, far too many to guess. */
const GROUP = 5;
export const MAX_CODES_PER_BATCH = 200;
export const LABEL_MIN = 3;
export const LABEL_MAX = 60;
export const MAX_EXPIRY_DAYS = 365;

export function newCode(): string {
  const pick = () => Array.from({ length: GROUP }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${pick()}-${pick()}`;
}

/** "abcde fghjk", "ABCDE-FGHJK", and "abcdefghjk" are all the same code. */
export function normalizeCode(text: string): string {
  const plain = text.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return plain.length === GROUP * 2 ? `${plain.slice(0, GROUP)}-${plain.slice(GROUP)}` : plain;
}

interface CodeRow {
  code: string;
  card_id: string;
  label: string;
  tradeable: boolean;
  expires_at: Date | null;
  created_at: Date;
  redeemed_name: string | null;
  redeemed_at: Date | null;
}

function toRow(r: CodeRow): RedeemCodeRow {
  return {
    code: r.code, cardId: r.card_id, label: r.label, tradeable: r.tradeable,
    expiresAt: r.expires_at?.toISOString() ?? null, createdAt: r.created_at.toISOString(),
    redeemedBy: r.redeemed_at ? r.redeemed_name ?? 'Deleted player' : null, redeemedAt: r.redeemed_at?.toISOString() ?? null,
  };
}

const CODE_SELECT = `select c.code, c.card_id, c.label, c.tradeable, c.expires_at, c.created_at, u.display_name as redeemed_name, c.redeemed_at
  from redeem_codes c left join users u on u.id = c.redeemed_by`;

/** Makes a batch of codes, all for the same card and label. */
export async function createCodes(
  client: pg.PoolClient, admin: User,
  input: { cardId?: unknown; label?: unknown; count?: unknown; tradeable?: unknown; expiresInDays?: unknown },
): Promise<RedeemCodeRow[]> {
  if (typeof input.cardId !== 'string' || !isAwardableCard(input.cardId)) throw new CodeError(400, 'Choose one of the named players.');
  const label = typeof input.label === 'string' ? input.label.trim().replace(/\s+/g, ' ') : '';
  if (label.length < LABEL_MIN || label.length > LABEL_MAX) throw new CodeError(400, `Labels are ${LABEL_MIN} to ${LABEL_MAX} characters long.`);
  const count = input.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_CODES_PER_BATCH) {
    throw new CodeError(400, `Make 1 to ${MAX_CODES_PER_BATCH} codes at a time.`);
  }
  if (typeof input.tradeable !== 'boolean') throw new CodeError(400, 'Choose whether the cards can be traded.');
  const days = input.expiresInDays;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 0 || days > MAX_EXPIRY_DAYS) {
    throw new CodeError(400, `Codes last up to ${MAX_EXPIRY_DAYS} days (0 for no end date).`);
  }
  const codes = new Set<string>();
  while (codes.size < count) codes.add(newCode());
  await client.query(
    `insert into redeem_codes (code, card_id, label, tradeable, expires_at, created_by)
     select unnest($1::text[]), $2, $3, $4, case when $5::int = 0 then null else now() + make_interval(days => $5::int) end, $6`,
    [[...codes], input.cardId, label, input.tradeable, days, admin.id],
  );
  const { rows } = await client.query<CodeRow>(`${CODE_SELECT} where c.code = any($1::text[]) order by c.code`, [[...codes]]);
  return rows.map(toRow);
}

/** The most recent codes, newest first. */
export async function listCodes(db: pg.Pool): Promise<RedeemCodeRow[]> {
  const { rows } = await db.query<CodeRow>(`${CODE_SELECT} order by c.created_at desc, c.code limit 500`);
  return rows.map(toRow);
}

/** Uses up a code and gives the player its card. */
export async function redeemCode(client: pg.PoolClient, user: User, text: unknown): Promise<OwnedCard> {
  const code = typeof text === 'string' ? normalizeCode(text) : '';
  const { rows } = await client.query<{ card_id: string; label: string; tradeable: boolean; redeemed_at: Date | null; expired: boolean }>(
    `select card_id, label, tradeable, redeemed_at, coalesce(expires_at <= now(), false) as expired
     from redeem_codes where code = $1 for update`,
    [code],
  );
  const found = rows[0];
  if (!found) throw new CodeError(404, "That code doesn't exist. Check it and try again.");
  if (found.redeemed_at) throw new CodeError(409, 'That code has already been used.');
  if (found.expired) throw new CodeError(409, 'That code has expired.');
  const edition = { kind: 'code' as const, label: found.label, tradeable: found.tradeable };
  const instanceId = await giveAwardCard(client, user.id, found.card_id, edition);
  await client.query('update redeem_codes set redeemed_by = $2, redeemed_at = now(), instance_id = $3 where code = $1', [code, user.id, instanceId]);
  const { rows: cards } = await client.query<{ serial: number }>('select serial from card_instances where id = $1', [instanceId]);
  return { instanceId, cardId: found.card_id, serial: cards[0]!.serial, source: 'award', edition };
}
