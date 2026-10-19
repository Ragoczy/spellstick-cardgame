// The second tutorial's lessons: contact and fouls (docs/tutorial-design.md, "Second tutorial").
// The player already knows the basics, so these only cover physical attacks, the penalty box,
// dirty plays and the referee, wards, and the abilities that matter when players get hurt.

import type { FieldCardDef, GameEvent, PlayerView } from '../engine';
import { posName } from '../ui/labels';
import { dicePreview } from '../ui/preview';
import { firstName, nameAt } from './coach';
import type { DecisionLesson } from './lessons';

const has = (legal: { type: string }[], type: string) => legal.some((a) => a.type === type);

export const CONTACT_LESSONS: DecisionLesson[] = [
  {
    id: 'contact-welcome',
    title: 'Contact and fouls',
    applies: (v) => v.pending.kind === 'faceoffLane' || v.turn > 0,
    text: () => "Real spellstick is rough. This game adds physical attacks and fouls. Your team is set up like last time, and theirs is still weaker on purpose, but it plays dirty. Watch for their attacks and fouls, and I'll show you how to make your own.",
  },
  {
    id: 'attack',
    title: 'Physical attacks',
    applies: (v, l, s) => v.pending.kind === 'action' && (s?.action.type === 'attack' || (has(l, 'attack') && !!v.ball && v.ball.side !== v.me)),
    text: (v) => `Instead of tackling, one of your players can attack the player in their spot. You choose who; the top card of your Physical pile decides the move. It's usually your Speed plus the card's bonus against their Speed, both rolled, and they win ties. Win and they drop the ball and are knocked down. Your team gets ${v.config.physicalAttackLimit} attacks a game, and they don't come back.`,
  },
  {
    id: 'penalty-risk',
    title: 'The penalty risk',
    applies: (v, l) => v.pending.kind === 'action' && has(l, 'attack') && v.mine.penaltyLevel >= 2,
    text: (v) => `Your penalty risk is ${v.mine.penaltyLevel} now. When you attack, if your die shows ${v.mine.penaltyLevel} or lower, the referee rolls the penalty die; ${v.mine.penaltyLevel} or lower again and your attacker goes to the penalty box. Every attack raises the risk by 1, and every turn without one lowers it.`,
  },
  {
    id: 'attack-reroll',
    title: 'Dodging the referee',
    applies: (v) => {
      const p = v.pending;
      const d = dicePreview(v);
      return p.kind === 'callDice' && p.contest.kind === 'attack' && p.role === 'attacker' && !!d?.myRoll && d.myRoll <= v.mine.penaltyLevel;
    },
    text: (v) => `Your die is at or under your penalty risk (${v.mine.penaltyLevel}), so the referee will check for a penalty after this attack. Rerolling your die above ${v.mine.penaltyLevel} avoids the check, if you can afford the reroll.`,
  },
  {
    id: 'foul',
    title: 'Fouls',
    applies: (v) => v.pending.kind === 'foul',
    text: () => "A dirty play is a foul. You declare it before the dice, not knowing how they'll fall. If your side wins the contest, their player is hurt. But if the two dice show the same number, the referee saw it, and your player is sent off for the game. That's 1 in 6. Save fouls for contests you're very likely to win.",
  },
  {
    id: 'they-fouled',
    title: 'They fouled',
    applies: (v) => {
      const p = v.pending;
      if (p.kind !== 'callDice') return false;
      const them = p.contest[p.role === 'attacker' ? 'defender' : 'attacker'];
      const card = them.spell ? [...v.opponent.discard].find((c) => c.uid === them.spell!.uid) : undefined;
      return card?.def.kind === 'spell' && card.def.ability.effect === 'dirty_play';
    },
    text: () => "They declared a foul. If they win, your player is hurt. But if the dice match, the referee sends their player off. A reroll of your die can break a double you don't want, or chase one you do.",
  },
  {
    id: 'ward',
    title: 'Wards',
    applies: (v, l, s) => {
      if (s?.action.type !== 'react' || !s.action.card) return false;
      const uid = s.action.card;
      const def = v.mine.hand.find((c) => c.uid === uid)?.def;
      return def?.kind === 'spell' && def.ability.effect === 'ward';
    },
    text: () => "A ward doesn't change who wins. It protects your player: if they're hurt in this contest, they're only Shaken, never injured or knocked out.",
  },
];

export const CONTACT_LESSON_IDS = CONTACT_LESSONS.map((l) => l.id);

/** Notes from basics that still help here (contact happens much more in this game). */
export const CONTACT_KEEPS_BASIC_NOTES = new Set(['goal-mine', 'goal-theirs', 'knocked-down', 'shaken', 'injured']);

/** Notes about contact the first time each happens. `add` skips anything already taught. */
export function contactNotes(e: GameEvent, view: PlayerView, add: (id: string, title: string, text: string) => void): void {
  const me = view.me;
  if (e.type === 'attackDeclared') {
    const card = e.card.def;
    if (card.kind !== 'physical') return;
    const bonus = card.bonus ? ` +${card.bonus}` : '';
    const stat = card.uses === 'muscle' ? 'Defense' : 'Speed';
    const tier = `a ${card.tier} attack`;
    if (e.side === me) {
      add('first-flip', `You flipped ${card.name}`, `${card.name} is ${tier}: ${stat}${bonus}. Minor attacks hurt the least and cost the least if the referee sees them; major and brutal ones hurt more and sit your player out longer.`);
    } else {
      add('their-attack', 'They attacked', `${firstName(nameAt(view, 'mine', e.target))} was attacked with ${card.name}, ${tier}. Their attacks use the same rules as yours.`);
    }
  }
  if (e.type === 'penalized') {
    const yours = e.side === me;
    add('penalty-box', 'Penalty!', `${yours ? 'Your' : 'Their'} ${posName(e.pos, view.lanes)}, ${e.card.def.name}, goes to the penalty box for ${e.turns} ${e.turns === 1 ? 'turn' : 'turns'}. The spot is empty: it counts as 0, and nobody can be substituted in. If the other team scores meanwhile, everyone in the box comes back at once.`);
  }
  if (e.type === 'sentOff') {
    const yours = e.side === me;
    add('sent-off', 'Sent off!', `The dice matched, so the referee saw the foul. ${yours ? 'Your' : 'Their'} ${e.card.def.name} is out for the game. The spot stays empty until ${yours ? 'you substitute' : 'they substitute'} at a draw step.`);
  }
  if (e.type === 'revealed' && e.card.def.kind === 'field') {
    const d = e.card.def as FieldCardDef;
    const whose = e.side === me ? 'Your' : 'Their';
    if (d.ability?.effect === 'hits_harder') {
      add('heavy-hands', 'Heavy hands', `${whose} ${d.name} has Heavy hands: anyone they hurt rolls 1 higher for how badly.`);
    }
    if (d.ability?.effect === 'hard_to_hurt') {
      add('sturdy', 'Sturdy', `${whose} ${d.name} is Sturdy: when they're hurt, they roll 1 lower for how badly.`);
    }
  }
  if (e.type === 'hurt' && e.result === 'knockedOut') {
    add('knocked-out', 'Knocked out', `${e.card.def.name} is knocked out and goes beside the field. At each faceoff, a roll of 4 or more brings them back to the hand. Mend can bring them back too.`);
  }
  if (e.type === 'powerPlayReturn') {
    add('power-play', 'Power play', 'A goal while players are in the penalty box brings them all back at once.');
  }
  if (e.type === 'gameOver') {
    const won = e.result.winner === me;
    add('game-over', won ? 'You won!' : e.result.winner === null ? 'A draw' : 'They won this time',
      `${won ? 'Well played.' : "It's worth another go."} That's everything in a real game. Real teams are evenly matched and dealt at random, so attacks and fouls are a real gamble.`);
  }
}
