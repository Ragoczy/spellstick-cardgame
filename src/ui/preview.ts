// Previews for prompts ("You'd win 7–5"). These only call the engine's own scoring functions,
// so the screen never re-implements a rule.

import {
  affinityFor, scoreSide, spellFizzles,
  type Affinity, type CardDef, type ContestRole, type PlayerCardDef, type PlayerView, type Pos, type SpellCardDef, type StatName, type StatUse,
} from '../engine';

function playerAt(view: PlayerView, owner: 'mine' | 'opponent', pos: Pos): PlayerCardDef | null {
  const team = view[owner];
  const slot = pos.area === 'goal' ? team.goalie : team.lineup[pos.area][pos.lane];
  return slot && (slot.state === 'revealed' || slot.state === 'faceDown') ? (slot.card.def as PlayerCardDef) : null;
}

export function casterAffinity(view: PlayerView, caster: Pos, spell: CardDef): Affinity | null {
  const player = playerAt(view, 'mine', caster);
  if (!player || spell.kind !== 'spell') return null;
  return affinityFor(player, spell.element, view.opposedPairs);
}

export interface ReactionPreview {
  /** Your value and theirs right now (before your spell). */
  mine: number;
  theirs: number;
  iWinTies: boolean;
  /** You react first, so they may still answer with a spell. */
  theyCanAnswer: boolean;
  /** Each reaction spell you could play, and what it would do. */
  options: { uid: string; def: SpellCardDef; affinity: Affinity; fizzles: boolean; mine: number; theirs: number }[];
}

/** Works out the current contest from your side, and what each of your reaction spells would do. */
export function reactionPreview(view: PlayerView): ReactionPreview | null {
  const pending = view.pending;
  if (pending.kind !== 'reaction' || pending.side !== view.me) return null;
  const { contest, role } = pending;
  const otherRoleName: ContestRole = role === 'attacker' ? 'defender' : 'attacker';
  const me = contest[role];
  const them = contest[otherRoleName];
  const myPlayer = playerAt(view, 'mine', me.pos);
  const theirPlayer = playerAt(view, 'opponent', them.pos);
  if (!myPlayer || !theirPlayer) return null;

  const theirSpellCard = them.spell && !them.spell.fizzled
    ? [...view.opponent.discard, ...view.mine.discard].find((c) => c.uid === them.spell!.uid)
    : undefined;
  const theirSpell = theirSpellCard && them.spell ? { def: theirSpellCard.def as SpellCardDef, affinity: them.spell.affinity } : null;
  const theyShield = theirSpell?.def.ability.effect === 'shield';

  const score = (mySpell: { def: SpellCardDef; affinity: Affinity } | null) => {
    const iShield = mySpell?.def.ability.effect === 'shield';
    return {
      mine: scoreSide({ player: myPlayer, side: me, spell: mySpell, shielded: theyShield }, view.config).total,
      theirs: scoreSide({ player: theirPlayer, side: them, spell: theirSpell, shielded: !!iShield }, view.config).total,
    };
  };

  const now = score(null);
  const options = view.mine.hand
    .filter((c) => c.def.kind === 'spell' && c.def.spellType === 'reaction')
    .map((c) => {
      const def = c.def as SpellCardDef;
      const affinity = affinityFor(myPlayer, def.element, view.opposedPairs);
      const fizzles = spellFizzles(def, affinity);
      const result = score(fizzles ? null : { def, affinity });
      return { uid: c.uid, def, affinity, fizzles, ...result };
    });

  return { ...now, iWinTies: contest.tiesGoTo === role, theyCanAnswer: role === 'attacker', options };
}

/**
 * A quick matchup for an action button: your value against theirs, or null for theirs if
 * their player is face down and unknown to you.
 */
export function matchup(
  view: PlayerView,
  mine: { pos: Pos; stat: StatName; use: StatUse },
  theirs: { pos: Pos; stat: StatName; use: StatUse },
): { mine: number; theirs: number | null } | null {
  const myPlayer = playerAt(view, 'mine', mine.pos);
  if (!myPlayer) return null;
  const theirPlayer = playerAt(view, 'opponent', theirs.pos);
  const value = (player: PlayerCardDef, side: typeof mine) =>
    scoreSide({ player, side: { ...side, modifiers: [] }, spell: null, shielded: false }, view.config).total;
  return { mine: value(myPlayer, mine), theirs: theirPlayer ? value(theirPlayer, theirs) : null };
}

export interface DicePreview {
  mine: number;
  theirs: number;
  iWinTies: boolean;
  /** Chance of winning if you call for dice (both players roll), before any reaction spells. */
  chanceIfRolled: number;
  rollsLeft: number;
}

/** The current contest from your side, and your chance of winning if you call for dice. */
export function dicePreview(view: PlayerView): DicePreview | null {
  const pending = view.pending;
  if (pending.kind !== 'callDice' || pending.side !== view.me) return null;
  const { contest, role } = pending;
  const me = contest[role];
  const them = contest[role === 'attacker' ? 'defender' : 'attacker'];
  const myCard = cardAt(view, 'mine', me.pos);
  const theirCard = cardAt(view, 'opponent', them.pos);
  if (!myCard) return null;
  const total = (card: ReturnType<typeof cardAt>, side: typeof me) =>
    scoreSide({ player: (card?.def as PlayerCardDef | undefined) ?? null, injury: card?.injury, side, spell: null, shielded: false }, view.config).total;
  const mine = total(myCard, me);
  const theirs = total(theirCard, them);
  const iWinTies = contest.tiesGoTo === role;
  const die = view.config.budgetDie;
  let wins = 0;
  for (let a = 1; a <= die; a++) {
    for (let b = 1; b <= die; b++) {
      const m = mine + a;
      const t = theirCard ? theirs + b : theirs; // an empty spot doesn't roll
      if (m > t || (m === t && iWinTies)) wins++;
    }
  }
  return { mine, theirs, iWinTies, chanceIfRolled: wins / (die * die), rollsLeft: view.diceLeft[view.me] };
}

function cardAt(view: PlayerView, owner: 'mine' | 'opponent', pos: Pos) {
  const team = view[owner];
  const slot = pos.area === 'goal' ? team.goalie : team.lineup[pos.area][pos.lane];
  return slot && (slot.state === 'revealed' || slot.state === 'faceDown') ? slot.card : null;
}
