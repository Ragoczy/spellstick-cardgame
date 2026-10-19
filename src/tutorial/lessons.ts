// The tutorial's lessons (docs/tutorial-design.md, "Lessons"). Each is taught once, the first
// time its situation comes up, so they work in whatever order the game goes. Lessons are keyed
// to what's on the board, never to a turn number, and their numbers come from the view, so they
// read right whether or not the person has followed the coach.
//
// TutorialCoach puts it together: a suggestion for each decision (coach.ts), a lesson the first
// time a situation arises, a note the first time each kind of result happens, and one line when
// the person does something other than the suggestion.

import {
  depth, familyOf, isFieldPos,
  type Action, type Area, type FieldCardDef, type GameEvent, type PlayerCardDef, type PlayerView, type SpellCardDef,
} from '../engine';
import { magicLabel, posName } from '../ui/labels';
import { reactionPreview } from '../ui/preview';
import { cardAt, firstName, nameAt, sameAction, suggest, type CoachOptions, type Suggestion } from './coach';

export interface Lesson {
  id: string;
  title: string;
  text: string;
}

const STAT_NAME = { speed: 'Speed', shot: 'Shot', defense: 'Defense', faceoff: 'Faceoff' } as const;
/** The stat that matters most for a player in each row (as their side sees it). */
const KEY_STAT: Record<Area, keyof typeof STAT_NAME> = { forward: 'shot', midfield: 'faceoff', defense: 'defense' };

// ---- Lessons at a decision ----

interface DecisionLesson {
  id: string;
  title: string;
  applies: (view: PlayerView, legal: Action[], s: Suggestion | null) => boolean;
  text: (view: PlayerView, s: Suggestion | null) => string;
}

const myBall = (v: PlayerView) => (v.ball?.side === v.me ? v.ball.pos : null);
const theirBall = (v: PlayerView) => (v.ball && v.ball.side !== v.me ? v.ball.pos : null);
const has = (legal: Action[], type: Action['type']) => legal.some((a) => a.type === type);

/** How a spell's magic fits its caster: which Resonant, and whether it's a match or a specialist. */
function affinityNote(caster: PlayerCardDef, spell: SpellCardDef, view: PlayerView): string | null {
  if (!spell.magic) return null;
  const exact = caster.resonants.find((r) => r.affinity === spell.magic && spell.magic!.includes('.'));
  const family = caster.resonants.find((r) => familyOf(r.affinity) === familyOf(spell.magic!));
  const r = exact ?? family;
  if (!r) return null;
  const bonus = exact ? view.config.affinitySpecialistBonus : view.config.affinityMatchBonus;
  const kind = exact ? 'exactly its specialty, a specialist' : `in the same family (${magicLabel(familyOf(spell.magic))}), a match`;
  return `${firstName(caster.name)}'s ${r.name} has an Affinity for ${magicLabel(r.affinity)}. ${spell.name} is ${magicLabel(spell.magic)} magic: ${kind}, so its number gets +${bonus}.`;
}

/** The reaction option the coach suggests, if it has an affinity (match or specialist) for its caster. */
function suggestedAffinitySpell(v: PlayerView, s: Suggestion | null) {
  if (s?.action.type !== 'react' || !s.action.card) return null;
  const uid = s.action.card;
  const o = reactionPreview(v)?.options.find((x) => x.uid === uid);
  return o && (o.affinity === 'specialist' || o.affinity === 'match') ? o : null;
}

const DECISION_LESSONS: DecisionLesson[] = [
  {
    id: 'welcome',
    title: 'Welcome to spellstick',
    applies: (v) => v.pending.kind === 'chooseGoalie',
    text: (v) => `Spellstick is lacrosse with spells. This is a short practice game against the computer: first to ${v.config.goalsToWin} goals wins. Its team is weaker on purpose, so you can learn without worrying. I'll suggest a move at every step, but you don't have to take it. First, choose your goalie. Goalies only have Save: how good they are at stopping shots. The other one goes into your deck as a spare.`,
  },
  {
    id: 'field',
    title: 'The field',
    applies: (v) => v.pending.kind === 'placeLineup',
    text: (v) => `The field has five rows and ${v.lanes === 2 ? 'two' : v.lanes === 3 ? 'three' : v.lanes} lanes. Your forwards face their defenders, your midfielders face theirs, and your defenders face their forwards. Everyone goes face down, so the computer doesn't know who is where until they meet in a contest. Forwards need Speed and Shot, midfielders need Faceoff, and defenders need Defense. You have more players than spots: keep the spares in your hand as substitutes. "Place them for me" puts everyone where I'd put them.`,
  },
  {
    id: 'faceoff',
    title: 'The faceoff',
    applies: (v) => v.pending.kind === 'faceoffLane',
    text: () => 'The game starts with a faceoff. The two midfielders in one lane compare Faceoff, and the winner takes the ball. You choose the lane this time, so pick the one where your best Faceoff player is.',
  },
  {
    id: 'dice',
    title: 'Dice and rerolls',
    applies: (v) => v.pending.kind === 'callDice',
    text: (v) => `Every contest is rolled: both players add a six-sided die to their stat, and the higher total wins. You have ${v.diceLeft[v.me]} rerolls for the whole game. You can spend one to roll your own die again. A better player usually wins, but not always.`,
  },
  {
    id: 'affinity',
    title: 'Affinity: the right caster',
    // When the suggestion is a reaction spell with an affinity for its caster.
    applies: (v, l, s) => suggestedAffinitySpell(v, s) !== null,
    text: (v, s) => {
      const o = suggestedAffinitySpell(v, s)!;
      const pending = v.pending;
      const casterPos = pending.kind === 'reaction' ? pending.contest[pending.role].pos : null;
      const caster = casterPos ? cardAt(v, 'mine', casterPos)?.def as PlayerCardDef | undefined : undefined;
      const note = caster ? affinityNote(caster, o.def, v) : null;
      return `Spells are stronger in the right hands. Each player has Resonants, feelings with an Affinity for a kind of magic (the colored dots). ${note ?? ''} A match adds +${v.config.affinityMatchBonus}; a specialist adds +${v.config.affinitySpecialistBonus}.`.replace('  ', ' ');
    },
  },
  {
    id: 'reaction',
    title: 'Reaction spells',
    applies: (v) => v.pending.kind === 'reaction',
    text: () => 'After the dice, each side may play one reaction spell, cast by their player in the contest. Casting turns that player face up, and each player can only cast a few spells. Save them for contests you would otherwise lose.',
  },
  {
    id: 'draw',
    title: 'Your turn',
    applies: (v) => v.pending.kind === 'draw',
    text: (v) => `Each turn has three steps: draw a card, take one action, then discard down to ${v.config.handLimit} if you have more. Your deck is two piles, players and spells, and you choose which to draw from. When the piles run out, the game ends, so the decks are the clock.`,
  },
  {
    id: 'hand-full',
    title: 'A full hand',
    applies: (v) => v.pending.kind === 'draw' && v.mine.hand.length >= v.config.handLimit,
    text: (v) => `You hold ${v.config.handLimit} cards, so you don't draw this turn. The top card of the pile you choose goes to your discard pile instead, so the clock keeps running.`,
  },
  {
    id: 'tired',
    title: 'Casting tires players out',
    applies: (v, l, s) => v.pending.kind === 'draw' && s?.action.type === 'substitute' && cardAt(v, 'mine', s.action.pos) !== null,
    text: (v, s) => {
      const pos = s!.action.type === 'substitute' ? s!.action.pos : null;
      return `Each player can cast one spell per Resonant (the dots on their card). ${pos ? nameAt(v, 'mine', pos) : 'This player'} has none left. Instead of drawing, you can substitute: the player goes back to your hand to rest and comes back later with all their spells. The player who comes on can't act this turn.`;
    },
  },
  {
    id: 'goalie-clear',
    title: 'Your goalie has the ball',
    applies: (v, l) => v.pending.kind === 'action' && myBall(v)?.area === 'goal' && has(l, 'pass'),
    text: () => "Goalies can't hold on to the ball: your goalie has to pass it out to a defender this turn.",
  },
  {
    id: 'pass',
    title: 'Passing',
    applies: (v, l) => v.pending.kind === 'action' && !!myBall(v) && has(l, 'pass') && !has(l, 'shoot'),
    text: (v) => `You have the ball. Pass it toward their goal: one row forward, along your row, or any distance back. The receiver and the player defending their spot are both turned face up. It's the receiver's Speed + ${v.config.passBonus} against the defender's Defense, both roll, and the receiver wins ties. The passer stays face down. Tap your ball carrier (glowing), then a teammate.`,
  },
  {
    id: 'shoot',
    title: 'Shooting',
    applies: (v, l) => v.pending.kind === 'action' && has(l, 'shoot'),
    text: () => "Your forward has the ball, so you can shoot: their Shot against the goalie's Save, both roll, and you need a higher total. Goalies are good, so most shots are saved. A reaction spell that helps shooting can make the difference.",
  },
  {
    id: 'tackle',
    title: 'Defending: tackles',
    applies: (v, l) => v.pending.kind === 'action' && has(l, 'tackle'),
    text: (v) => `They have the ball. Your player in the same spot can tackle: your Defense against their Speed, both roll. Win and you take the ball, and their player is knocked down. Lose by ${v.config.tackleRiskMargin} or more and your tackler is Shaken.`,
  },
  {
    id: 'protected',
    title: 'Catch and shoot',
    applies: (v) => v.pending.kind === 'action' && !!theirBall(v) && v.ballProtected,
    text: () => "Their forward just caught a pass, so they can't be tackled until their next turn: that gives them a chance to shoot. Your goalie will face the shot. You can still play a card.",
  },
  {
    id: 'their-goalie',
    title: 'Their goalie has the ball',
    applies: (v) => v.pending.kind === 'action' && theirBall(v)?.area === 'goal',
    text: () => "Goalies can't be tackled. On their turn they must pass it out, and your forwards, facing their defenders, will try to intercept.",
  },
  {
    id: 'scry',
    title: 'Looking at hidden cards',
    applies: (v, l, s) => s?.action.type === 'cast' && s.action.target.kind === 'opponent',
    text: () => "Some spells let you look at one of their face-down cards without turning it over. Only you see it, and you'll remember it even if they move that player.",
  },
  {
    id: 'long-pass',
    title: 'A long pass',
    applies: (v, l, s) => s?.action.type === 'cast' && s.action.target.kind === 'pass',
    text: () => 'Some spells make a pass that can skip a row forward, from defense straight to a forward.',
  },
  {
    id: 'discard',
    title: 'Too many cards',
    applies: (v) => v.pending.kind === 'discard',
    text: (v) => `You can hold ${v.config.handLimit} cards at the end of your turn. Discard the extras: discard piles are face up, so the computer sees them.`,
  },
  {
    id: 'forced-sub',
    title: 'Injury: a substitute',
    applies: (v) => v.pending.kind === 'forcedSub',
    text: () => 'An injured player has to come off. Bring on a player from your hand, face down. This is free, but the substitute comes on Shaken.',
  },
  {
    id: 'clock',
    title: 'The clock',
    applies: (v) => v.turn > 0 && v.mine.deckCount <= 4 && !v.shootout,
    text: () => "Your piles are nearly empty. When a team can't draw, the other team takes one last turn and the game ends: more goals wins, and a tie goes to a penalty shootout.",
  },
  {
    id: 'shootout',
    title: 'Penalty shootout',
    applies: (v) => v.pending.kind === 'shootoutPick',
    text: (v) => `It's a tie at full time, so it goes to penalties. Each team picks players to shoot at the goalie with Shot + ${v.config.penaltyBonus}. Each player can shoot only once.`,
  },
];

export function lessonFor(view: PlayerView, legal: Action[], s: Suggestion | null, taught: ReadonlySet<string>): Lesson | null {
  if (view.pending.kind === 'gameOver' || view.pending.side !== view.me) return null;
  for (const l of DECISION_LESSONS) {
    if (!taught.has(l.id) && l.applies(view, legal, s)) return { id: l.id, title: l.title, text: l.text(view, s) };
  }
  return null;
}

// ---- Notes after something happens ----

/** Notes the first time each kind of result happens. `view` is the view after the events. */
export function notesFor(events: GameEvent[], view: PlayerView, taught: ReadonlySet<string>): Lesson[] {
  const me = view.me;
  const notes: Lesson[] = [];
  const add = (id: string, title: string, text: string) => {
    if (!taught.has(id) && !notes.some((n) => n.id === id)) notes.push({ id, title, text });
  };
  for (const e of events) {
    if (e.type === 'revealed' && e.side !== me && isFieldPos(e.pos) && e.card.def.kind === 'field') {
      const stat = KEY_STAT[e.pos.area];
      const value = (e.card.def as FieldCardDef)[stat];
      if (value <= 4) {
        add('their-weak', 'A look at their team', `Their ${posName(e.pos, view.lanes)} is ${e.card.def.name}: ${STAT_NAME[stat]} ${value}. In this practice game their team is weaker on purpose. Most of your players have 5s and 6s.`);
      }
    }
    if (e.type === 'contestResolved' && e.kind === 'pass') {
      const mine = e.attacker.side === me;
      if (mine && e.winner === me && isFieldPos(e.attacker.pos) && e.attacker.pos.area === 'forward') {
        add('caught-forward', 'Catch and shoot', "Caught! A forward who catches a pass can't be tackled until your next turn. So next turn, shoot.");
      } else if (mine && e.winner !== me) {
        add('intercepted', 'Intercepted', 'Their defender cut out the pass. Dice happen: even a likely pass fails sometimes. Now you defend.');
      } else if (!mine && e.winner === me) {
        add('you-intercepted', 'You cut it out', 'Your player won the ball from their pass. Now move it up the field.');
      }
    }
    if (e.type === 'contestResolved' && e.kind === 'shot' && e.attacker.side === me && e.winner !== me) {
      add('saved', 'Saved', "Their goalie stopped it. Most shots are saved, so don't be discouraged. Their goalie has to pass the ball out on their turn.");
    }
    if (e.type === 'goal') {
      if (e.side === me) add('goal-mine', 'Goal!', 'After a goal there\'s a faceoff. The team that was scored on chooses the lane and takes the next turn.');
      else add('goal-theirs', 'They scored', 'You choose the next faceoff lane, and you take the next turn.');
    }
    if (e.type === 'knockedDown') {
      add('knocked-down', 'Knocked down', `${e.card.def.name} was knocked down and rolled ${e.roll} against their Toughness ${e.toughness}. At or under Toughness they're fine; above it, they're hurt.`);
    }
    if (e.type === 'hurt' && e.result === 'shaken') {
      add('shaken', 'Shaken', `${e.card.def.name} is Shaken: the card is turned sideways. They can't pass, shoot, tackle, or cast, and get −${view.config.shakenPenalty} in contests, until the end of their team's next turn. They can still catch passes and defend.`);
    }
    if (e.type === 'injured') {
      add('injured', 'Injured', `${e.card.def.name} is injured: their stats are lower until the injury is mended. An injured player on the field has to come off for a substitute.`);
    }
    if (e.type === 'spellCast' && e.side !== me) {
      add('their-spell', 'Their spell', `They cast ${e.card.def.name}. The computer has spells too, and casting turned their caster face up.`);
    }
    if (e.type === 'spellCast' && e.side === me) {
      const caster = view.mine.lineup[e.caster.area as Area]?.[(e.caster as { lane?: number }).lane ?? 0];
      if (isFieldPos(e.caster) && caster && caster.state !== 'empty' && caster.state !== 'unknown' && caster.castsLeft === 0) {
        add('out-of-spells', 'Out of spells', `${firstName(caster.card.def.name)} has cast all they can: one spell per Resonant. To rest them, substitute them out at a draw step. They come back later with all their spells.`);
      }
    }
    if (e.type === 'gameOver') {
      const won = e.result.winner === me;
      add('game-over', won ? 'You won!' : e.result.winner === null ? 'A draw' : 'They won this time',
        `${won ? 'Well played.' : 'The cards were on your side, so it\'s worth another go.'} That's the whole game: passing, contests, spells, tackles, and the clock. Real games are rougher, with physical attacks and fouls, and real teams are evenly matched.`);
    }
  }
  return notes;
}

// ---- When the person does something else ----

/** One line, once per kind, when the person's move isn't the suggestion. Never "wrong". */
export function commentOn(view: PlayerView, s: Suggestion | null, chosen: Action): { id: string; text: string } | null {
  if (!s || sameAction(s.action, chosen)) return null;
  const sug = s.action;
  const handName = (uid: string) => firstName(view.mine.hand.find((c) => c.uid === uid)?.def.name ?? '');
  switch (chosen.type) {
    case 'chooseGoalie':
      return sug.type === 'chooseGoalie' ? { id: 'goalie', text: `That works. ${handName(sug.card)} saves a little better; you can swap goalies later with a substitute.` } : null;
    case 'place': {
      const card = view.mine.hand.find((c) => c.uid === chosen.card);
      if (!card || card.def.kind !== 'field') return null;
      const stat = KEY_STAT[chosen.pos.area];
      const value = (card.def as FieldCardDef)[stat];
      if (value >= 5) return null;
      return { id: 'lineup', text: `Your own lineup works too. ${firstName(card.def.name)}'s ${STAT_NAME[stat]} is only ${value}, so being a ${posName(chosen.pos, view.lanes).split(' ')[1]} may be harder for them. You can move players later with substitutes.` };
    }
    case 'faceoffLane': {
      const m = cardAt(view, 'mine', { area: 'midfield', lane: chosen.lane })?.def as FieldCardDef | undefined;
      return m ? { id: 'lane', text: `${firstName(m.name)}'s Faceoff ${m.faceoff} can still do it, and ties go to you.` } : null;
    }
    case 'callDice':
      return chosen.roll && sug.type === 'callDice' && !sug.roll && s.says.includes('winning')
        ? { id: 'reroll', text: 'That roll was already winning. Rerolls are best saved for a die that loses you the contest.' }
        : null;
    case 'react':
      if (chosen.card && sug.type === 'react' && !sug.card && s.says.includes('already winning')) {
        return { id: 'spell-spent', text: "You'd have won anyway, so that spell is used up. Save spells for contests you'd lose." };
      }
      if (!chosen.card && sug.type === 'react' && sug.card) return { id: 'spell-kept', text: 'Fair enough. Without a spell this one will probably go their way.' };
      return null;
    case 'pass': {
      if (sug.type === 'shoot') {
        const holder = view.ball?.pos;
        return { id: 'no-shot', text: `${holder ? nameAt(view, 'mine', holder) : 'Your forward'} was only safe from tackles until your next turn. With the ball at forward, shooting is usually best.` };
      }
      const from = view.ball?.pos;
      if (sug.type === 'pass' && from && depth(chosen.to) <= depth(from) && depth(sug.to) > depth(from)) {
        return { id: 'safe-pass', text: "A safe pass. It doesn't get you closer to goal, but it keeps the ball." };
      }
      return null;
    }
    case 'regroup':
      return { id: 'idle', text: 'Fine, though doing nothing gives them time.' };
    case 'tackle':
      return { id: 'long-tackle', text: `A brave tackle. If you lose by ${view.config.tackleRiskMargin} or more, your tackler is Shaken.` };
    default:
      return null;
  }
}

// ---- The coach, put together ----

export interface CoachTip {
  /** A lesson shown the first time this situation comes up. */
  lesson: Lesson | null;
  suggestion: Suggestion | null;
}

/**
 * The coach for one tutorial game. Suggestions depend only on the view; the coach remembers
 * which lessons it has taught and which comments it has made, so nothing is said twice.
 */
export class TutorialCoach {
  private readonly taught = new Set<string>();
  private readonly commented = new Set<string>();

  constructor(readonly options: CoachOptions = {}) {}

  /** The tip for the person's current decision. Asking again before they act gives the same tip. */
  tip(view: PlayerView, legal: Action[]): CoachTip {
    const suggestion = suggest(view, legal, this.options);
    return { lesson: lessonFor(view, legal, suggestion, this.taught), suggestion };
  }

  /** The person made their move: the lesson for it is taught, and a comment if it wasn't the suggestion. */
  chose(view: PlayerView, legal: Action[], action: Action): string | null {
    const { lesson, suggestion } = this.tip(view, legal);
    if (lesson) this.taught.add(lesson.id);
    const comment = commentOn(view, suggestion, action);
    if (!comment || this.commented.has(comment.id)) return null;
    this.commented.add(comment.id);
    return comment.text;
  }

  /** Notes about what just happened, each taught once. */
  observe(events: GameEvent[], view: PlayerView): Lesson[] {
    const notes = notesFor(events, view, this.taught);
    for (const n of notes) this.taught.add(n.id);
    return notes;
  }

  hasTaught(id: string): boolean {
    return this.taught.has(id);
  }
}

/** Every decision lesson, in the order they're checked (for tests). */
export const LESSON_IDS = DECISION_LESSONS.map((l) => l.id);
