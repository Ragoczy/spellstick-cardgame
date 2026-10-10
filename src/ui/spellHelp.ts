// Plain-language help on when spell cards can be played. Explanations only: whether a spell can
// actually be cast always comes from the session's legal actions.

import type { CardDef, PlayerView, SlotView } from '../engine';

/** The short "when" line printed on every spell card. */
export function spellWhen(def: CardDef): string | null {
  if (def.kind !== 'spell') return null;
  return def.spellType === 'reaction' ? 'Play during a contest' : 'Play on your turn';
}

const REACTION_HELP =
  "Reaction spells are played during a contest (a pass, tackle, shot, faceoff, or hit). When one starts, you'll be asked whether to play one. Your player in that contest casts it.";

/** What each action spell needs before it can be cast. */
const NEEDS: Record<string, string> = {
  steal: 'It is a tackle, so the other team needs to have the ball, with one of your players facing their ball carrier.',
  long_shot: 'One of your midfielders needs to have the ball.',
  long_pass: 'Your team needs to have the ball.',
  decoy_pass: 'Your team needs to have the ball.',
  mend: 'One of your players needs to be injured (on the field or in your hand).',
  mirror_images: 'It needs a field player without images who can still cast.',
  hit: 'The caster hits the opposing player in their own spot, so it needs a field player with an opponent facing them.',
  scry: 'There needs to be a face-down opposing card to look at.',
  swap: 'It needs two of your players face down, plus someone else to cast it.',
};

function slots(view: PlayerView): SlotView[] {
  return [view.mine.goalie, ...Object.values(view.mine.lineup).flat()];
}

/** Why a spell can't be played right now (for when the player taps it anyway). */
export function whyNotNow(view: PlayerView, def: CardDef): string | null {
  if (def.kind !== 'spell') return null;
  const pending = view.pending;
  if (pending.kind === 'reaction') {
    return def.spellType === 'action' ? `${def.name} is an action spell: play it on your turn, as your action. Only reaction spells work in a contest.` : null;
  }
  if (def.spellType === 'reaction') return `${def.name} is a reaction spell. ${REACTION_HELP}`;
  if (pending.kind !== 'action') return `${def.name} is an action spell: play it on your turn, as your action.`;
  const canCast = slots(view).some((s) => (s.state === 'revealed' || s.state === 'faceDown') && (s.castsLeft === undefined || s.castsLeft > 0));
  if (!canCast) return 'None of your players has a spell left. Substitute a tired player to recharge them.';
  return `${def.name} can't do anything right now. ${NEEDS[def.ability.effect] ?? ''}`.trim();
}
