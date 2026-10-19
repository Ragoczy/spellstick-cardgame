// The tutorial coach's suggestions (docs/tutorial-design.md, "The coach"). Given the person's
// view and legal actions, it picks a move and says why in one line. Like the computer opponent,
// it only reads the person's view, never the real game state, so it can't know a face-down card
// of theirs (CLAUDE.md rule 4). It's a pure function of the view, so the seed-finding script and
// the game screen always get the same suggestion.
//
// A dozen plain rules come first, because each one can explain itself. When none applies, the
// suggestion is what the computer player would do (the normal Hint).

import { heuristicAgent } from '../ai/heuristic';
import {
  depth, isFieldPos, opposite, samePos,
  type Action, type Area, type CardView, type Contest, type ContestSide, type FieldCardDef, type FieldPos, type PlayerCardDef, type PlayerView, type Pos, type SlotView,
  type SpellCardDef, type StatName,
} from '../engine';
import { posName } from '../ui/labels';
import { casterAffinity, chanceWithDice, dicePreview, matchup, reactionPreview } from '../ui/preview';

export interface Suggestion {
  action: Action;
  /** One or two plain sentences: what to do and why. */
  says: string;
}

export interface CoachOptions {
  /** The scenario's goalie and lineup for the person, by card id (used when those cards are in hand). */
  goalie?: string;
  lineup?: Partial<Record<Area, string[]>>;
}

type Owner = 'mine' | 'opponent';

// ---- Reading the view ----

export function slotAt(view: PlayerView, owner: Owner, pos: Pos): SlotView | null {
  const team = view[owner];
  return pos.area === 'goal' ? team.goalie : (team.lineup[pos.area][pos.lane] ?? null);
}

/** The card in a spot, if this player can see it. */
export function cardAt(view: PlayerView, owner: Owner, pos: Pos): CardView | null {
  const s = slotAt(view, owner, pos);
  return s && (s.state === 'revealed' || s.state === 'faceDown') ? s.card : null;
}

/** A first name for one of your players ("Josephine"), or "their left defender" for theirs. */
export function nameAt(view: PlayerView, owner: Owner, pos: Pos): string {
  const card = cardAt(view, owner, pos);
  if (card) return firstName(card.def.name);
  return `${owner === 'mine' ? 'your' : 'their'} ${posName(pos, view.lanes)}`;
}

export function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}

const pct = (chance: number) => `about ${Math.round(chance * 100)}%`;

/** Guesses for a player you can't see: about average for the spot. */
const GUESS_DEFENSE: Record<Area, number> = { defense: 3.5, midfield: 3, forward: 2.5 };
const GUESS_SPEED = 3.5;
const GUESS_FACEOFF = 4;
const GUESS_SAVE = 5.5;
const GUESS_SHOT = 3.5;
/** The average physical card adds about this much to an attack (the top card is face down). */
const AVERAGE_ATTACK_BONUS = 0.5;

const die = (view: PlayerView) => view.config.contestDie;

/** Chance a pass to `to` is caught (ties go to the receiver), and the numbers behind it. */
export function passChance(view: PlayerView, to: FieldPos): { chance: number; mine: number; theirs: number | null } {
  const theirPos = opposite(to);
  const m = matchup(view, { pos: to, stat: 'speed', use: 'receive' }, { pos: theirPos, stat: 'defense', use: 'intercept' });
  const mine = (m?.mine ?? 0) + view.config.passBonus;
  const empty = slotAt(view, 'opponent', theirPos)?.state === 'empty';
  const theirs = m?.theirs ?? null;
  const chance = chanceWithDice(mine, theirs ?? GUESS_DEFENSE[theirPos.area], true, die(view), !empty);
  return { chance, mine, theirs };
}

/** Chance your player in the holder's spot wins a tackle (ties go to the holder). */
export function tackleChance(view: PlayerView, holder: FieldPos): { chance: number; mine: number; theirs: number | null } {
  const m = matchup(view, { pos: opposite(holder), stat: 'defense', use: 'tackle' }, { pos: holder, stat: 'speed', use: 'evade' });
  const mine = m?.mine ?? 0;
  const theirs = m?.theirs ?? null;
  return { chance: chanceWithDice(mine, theirs ?? GUESS_SPEED, false, die(view)), mine, theirs };
}

/** Chance a shot from `from` scores (the goalie wins ties). */
export function shotChance(view: PlayerView, from: Pos): { chance: number; mine: number; theirs: number | null } {
  const m = matchup(view, { pos: from, stat: 'shot', use: 'shoot' }, { pos: { area: 'goal' }, stat: 'save', use: 'save' });
  const mine = m?.mine ?? 0;
  const theirs = m?.theirs ?? null;
  const goalie = slotAt(view, 'opponent', { area: 'goal' });
  return { chance: chanceWithDice(mine, theirs ?? GUESS_SAVE, false, die(view), goalie?.state !== 'empty'), mine, theirs };
}

/**
 * Chance a physical attack from `attacker` on the player opposite wins (ties go to the target).
 * The card is flipped after choosing, so it's a guess: Speed plus an average card's bonus.
 */
export function attackChance(view: PlayerView, attacker: FieldPos): { chance: number; mine: number; theirs: number | null } {
  const target = opposite(attacker);
  const m = matchup(view, { pos: attacker, stat: 'speed', use: 'attack' }, { pos: target, stat: 'speed', use: 'evade' });
  const mine = m?.mine ?? 0;
  const theirs = m?.theirs ?? null;
  return { chance: chanceWithDice(mine + AVERAGE_ATTACK_BONUS, theirs ?? GUESS_SPEED, false, die(view)), mine, theirs };
}

/** A guess for one of their face-down players' stats, by where they are. */
function guessStat(stat: StatName, pos: Pos): number {
  if (stat === 'save') return GUESS_SAVE;
  if (stat === 'defense') return pos.area === 'goal' ? 0 : GUESS_DEFENSE[pos.area];
  if (stat === 'faceoff') return GUESS_FACEOFF;
  if (stat === 'shot') return GUESS_SHOT;
  return GUESS_SPEED;
}

/** Your chance of winning the current contest before the dice (for deciding on a foul). */
function contestChance(view: PlayerView, contest: Contest, role: 'attacker' | 'defender'): number {
  const me = contest[role];
  const them = contest[role === 'attacker' ? 'defender' : 'attacker'];
  const m = matchup(view, { pos: me.pos, stat: me.stat, use: me.use }, { pos: them.pos, stat: them.stat, use: them.use });
  const plus = (side: ContestSide) => side.modifiers.reduce((sum, x) => sum + x.amount, 0);
  const mine = (me.power?.value ?? m?.mine ?? 0) + plus(me);
  const theirEmpty = slotAt(view, 'opponent', them.pos)?.state === 'empty';
  const theirs = (them.power?.value ?? m?.theirs ?? guessStat(them.stat, them.pos)) + plus(them);
  return chanceWithDice(mine, theirs, contest.tiesGoTo === role, die(view), !theirEmpty);
}

/** The spell a side played in this contest (a foul is declared as a spell), if it's face up. */
function contestSpell(view: PlayerView, side: ContestSide): SpellCardDef | null {
  if (!side.spell) return null;
  const card = [...view.mine.discard, ...view.opponent.discard].find((c) => c.uid === side.spell!.uid);
  return card?.def.kind === 'spell' ? card.def : null;
}

const isFoul = (spell: SpellCardDef | null) => spell?.ability.effect === 'dirty_play';

/** How well a player suits a row: forwards catch and shoot, midfielders win faceoffs, defenders defend. */
export function fitFor(def: PlayerCardDef, area: Area | 'goal'): number {
  if (def.kind === 'goalie') return area === 'goal' ? def.save : -1;
  if (area === 'goal') return -1;
  const f = def as FieldCardDef;
  if (area === 'forward') return 1.5 * f.shot + f.speed;
  if (area === 'midfield') return 2 * f.faceoff + f.speed + 0.5 * f.defense;
  return 2 * f.defense + 0.5 * f.speed;
}

const isField = (c: CardView) => c.def.kind === 'field';

// ---- Suggestions, by decision ----

/** The coach's suggested move for the person's current decision (null when it isn't theirs). */
export function suggest(view: PlayerView, legal: Action[], options: CoachOptions = {}): Suggestion | null {
  if (!legal.length) return null;
  const rule = byRule(view, legal, options);
  if (rule) return rule;
  // Nothing the rules cover: what the computer player would do, seeing only this view. Except
  // regrouping: it sometimes throws away a good card, so the coach only swaps out a spare goalie.
  const action = heuristicAgent(1000 + 7 * view.turn + legal.length, view.config).chooseAction(view, legal);
  if (action.type === 'regroup') return quietRegroup(view, legal) ?? { action, says: fallbackSays(view, action) };
  return { action, says: fallbackSays(view, action) };
}

function byRule(view: PlayerView, legal: Action[], options: CoachOptions): Suggestion | null {
  switch (view.pending.kind) {
    case 'chooseGoalie': return chooseGoalie(view, legal, options);
    case 'placeLineup': return placeLineup(view, legal, options);
    case 'faceoffLane': return faceoffLane(view, legal);
    case 'callDice': return dice(view, legal);
    case 'reaction': return reaction(view, legal);
    case 'foul': return foul(view, legal);
    case 'draw': return draw(view, legal);
    case 'action': return action(view, legal);
    case 'discard': return discard(view, legal);
    case 'forcedSub': return forcedSub(view, legal);
    case 'shootoutPick': return shootoutPick(view, legal);
    default: return null;
  }
}

function chooseGoalie(view: PlayerView, legal: Action[], options: CoachOptions): Suggestion | null {
  const goalies = legal.flatMap((a) => {
    const card = a.type === 'chooseGoalie' ? view.mine.hand.find((c) => c.uid === a.card) : undefined;
    return card && card.def.kind === 'goalie' ? [{ a, card, save: card.def.save }] : [];
  });
  if (!goalies.length) return null;
  const best = goalies.find((g) => g.card.def.id === options.goalie) ?? [...goalies].sort((x, y) => y.save - x.save)[0]!;
  const other = goalies.find((g) => g !== best);
  const why = other && other.save < best.save
    ? `Their Save ${best.save} beats ${firstName(other.card.def.name)}'s ${other.save}.`
    : `Save ${best.save}.`;
  return { action: best.a, says: `Put ${firstName(best.card.def.name)} in goal. ${why}` };
}

/** Who should go in each empty spot, using the scenario's lineup where it can, then the best fit. */
export function suggestedLineup(view: PlayerView, options: CoachOptions): Map<string, CardView> {
  const placed = new Map<string, CardView>();
  const free = view.mine.hand.filter(isField);
  const take = (card: CardView) => free.splice(free.indexOf(card), 1);
  const key = (p: FieldPos) => `${p.area}:${p.lane}`;
  const empties: FieldPos[] = [];
  for (const area of ['defense', 'midfield', 'forward'] as Area[]) {
    for (let lane = 0; lane < view.lanes; lane++) {
      if (view.mine.lineup[area][lane]?.state === 'empty') empties.push({ area, lane });
    }
  }
  // The scenario's choices first, for cards still in hand.
  for (const pos of empties) {
    const card = free.find((c) => c.def.id === options.lineup?.[pos.area]?.[pos.lane]);
    if (card) { placed.set(key(pos), card); take(card); }
  }
  // Then the best fit for each row, defenders first (Defense is the clearest need).
  for (const pos of empties) {
    if (placed.has(key(pos)) || !free.length) continue;
    const best = [...free].sort((x, y) => fitFor(y.def as PlayerCardDef, pos.area) - fitFor(x.def as PlayerCardDef, pos.area))[0]!;
    placed.set(key(pos), best);
    take(best);
  }
  return placed;
}

const ROW_NEED: Record<Area, (d: FieldCardDef) => string> = {
  forward: (d) => `Speed ${d.speed} to catch passes and Shot ${d.shot} to score`,
  midfield: (d) => `Faceoff ${d.faceoff} to win the ball`,
  defense: (d) => `Defense ${d.defense} to stop their forwards`,
};

function placeLineup(view: PlayerView, legal: Action[], options: CoachOptions): Suggestion | null {
  const plan = suggestedLineup(view, options);
  for (const a of legal) {
    if (a.type !== 'place') continue;
    const card = plan.get(`${a.pos.area}:${a.pos.lane}`);
    if (card?.uid !== a.card) continue;
    const def = card.def as FieldCardDef;
    return { action: a, says: `${firstName(def.name)} at ${posName(a.pos, view.lanes)}: ${ROW_NEED[a.pos.area](def)}.` };
  }
  return null;
}

function faceoffLane(view: PlayerView, legal: Action[]): Suggestion | null {
  let best: { a: Action; chance: number; mine: number; lane: number } | null = null;
  for (const a of legal) {
    if (a.type !== 'faceoffLane') continue;
    const pos: FieldPos = { area: 'midfield', lane: a.lane };
    const m = matchup(view, { pos, stat: 'faceoff', use: 'faceoff' }, { pos, stat: 'faceoff', use: 'faceoff' });
    if (!m) continue;
    const chance = chanceWithDice(m.mine, m.theirs ?? GUESS_FACEOFF, true, die(view));
    if (!best || chance > best.chance) best = { a, chance, mine: m.mine, lane: a.lane };
  }
  if (!best) return null;
  const pos: FieldPos = { area: 'midfield', lane: best.lane };
  return { action: best.a, says: `Choose the ${posName(pos, view.lanes).split(' ')[0]} lane: ${nameAt(view, 'mine', pos)} has Faceoff ${best.mine}, and you win ties (${pct(best.chance)}).` };
}

function dice(view: PlayerView, legal: Action[]): Suggestion | null {
  const p = dicePreview(view);
  if (!p || !legal.some((a) => a.type === 'callDice')) return null;
  const winning = p.mine > p.theirs || (p.mine === p.theirs && p.iWinTies);
  const keep: Action = { type: 'callDice', side: view.me, roll: false };
  const roll: Action = { type: 'callDice', side: view.me, roll: true };
  // The referee judges fouls on matching dice, and a physical attack's penalty check on a low die.
  const pending = view.pending;
  if (pending.kind === 'callDice' && p.rollsLeft > 0 && p.myRoll !== undefined) {
    const me = pending.contest[pending.role];
    const them = pending.contest[pending.role === 'attacker' ? 'defender' : 'attacker'];
    const doubles = p.myRoll === p.theirRoll;
    if (doubles && isFoul(contestSpell(view, me))) {
      return { action: roll, says: `Reroll! Both dice show ${p.myRoll}, and you fouled: matching dice mean the referee sends your player off. A new roll will probably break the double.` };
    }
    if (!doubles && !winning && isFoul(contestSpell(view, them))) {
      return { action: roll, says: `Reroll: you're behind ${p.mine} to ${p.theirs}, and they fouled. A new roll might win it (${pct(p.chanceIfRolled)}), and if it matches their ${p.theirRoll}, the referee sends their player off.` };
    }
    const level = view.mine.penaltyLevel;
    if (pending.contest.kind === 'attack' && pending.role === 'attacker' && p.myRoll <= level && winning && p.chanceIfRolled >= 0.7) {
      return { action: roll, says: `Reroll: your die shows ${p.myRoll}, at or under your penalty risk of ${level}, so the referee will check for a penalty. A new roll still wins ${pct(p.chanceIfRolled)} of the time.` };
    }
  }
  if (winning) {
    const why = p.mine === p.theirs ? `it's tied at ${p.mine}, and ties go to you` : `${p.mine} against ${p.theirs}, you're winning`;
    return { action: keep, says: `Keep your roll: ${why}.` };
  }
  if (p.rollsLeft > 0 && p.chanceIfRolled >= 0.4) {
    return { action: roll, says: `Reroll: you're behind ${p.mine} to ${p.theirs}, and a new roll wins ${pct(p.chanceIfRolled)} of the time.` };
  }
  const odds = p.chanceIfRolled < 0.05 ? 'even a 6 wouldn\'t be enough' : `a reroll only wins ${pct(p.chanceIfRolled)} of the time`;
  return { action: keep, says: `Keep it. You're behind ${p.mine} to ${p.theirs}, and ${odds}. A spell might still help.` };
}

function reaction(view: PlayerView, legal: Action[]): Suggestion | null {
  const p = reactionPreview(view);
  const none: Action = { type: 'react', side: view.me, card: null };
  if (!p) return legal.some((a) => a.type === 'react' && a.card === null) ? { action: none, says: 'No spell this time.' } : null;
  const wins = (mine: number, theirs: number) => mine > theirs || (mine === theirs && p.iWinTies);
  if (wins(p.mine, p.theirs)) {
    return { action: none, says: `No spell: you're already winning, ${p.mine} to ${p.theirs}. Save spells for contests you'd lose.` };
  }
  // A spell with an affinity for the caster first (it's stronger, and it's what the tutorial
  // teaches), then the one that wins by the least, so the bigger ones are kept for later.
  const affinityRank = (a: string) => (a === 'specialist' || a === 'match' ? 0 : 1);
  const winners = p.options
    .filter((o) => !o.fizzles && wins(o.mine, o.theirs))
    .sort((x, y) => affinityRank(x.affinity) - affinityRank(y.affinity) || (x.mine - x.theirs) - (y.mine - y.theirs));
  const pick = winners[0];
  const action = pick ? legal.find((a) => a.type === 'react' && a.card === pick.uid) : undefined;
  if (!pick || !action) {
    // Losing a contest that can hurt your player: a ward keeps it to Shaken.
    const ward = p.options.find((o) => !o.fizzles && o.def.ability.effect === 'ward');
    const wardAction = ward ? legal.find((a) => a.type === 'react' && a.card === ward.uid) : undefined;
    const pending = view.pending;
    if (ward && wardAction && pending.kind === 'reaction' && canHurtMe(view, pending.contest, pending.role)) {
      const pos = pending.contest[pending.role].pos;
      return { action: wardAction, says: `Play ${ward.def.name}: you'll probably lose this one, ${p.mine} to ${p.theirs}, and if ${nameAt(view, 'mine', pos)} is hurt, they're only Shaken.` };
    }
    return { action: none, says: `No spell: nothing in your hand turns ${p.mine} against ${p.theirs} around.` };
  }
  const aff = pick.affinity === 'specialist' ? ' (a specialist affinity, so it counts extra)' : pick.affinity === 'match' ? ' (an affinity match, so +1)' : '';
  return { action, says: `Play ${pick.def.name}${aff}: it turns ${p.mine} against ${p.theirs} into ${pick.mine} against ${pick.theirs}.` };
}

/** Whether losing this contest can hurt your player: a tackle on your holder, an attack or hit on them, or their foul. */
function canHurtMe(view: PlayerView, contest: Contest, role: 'attacker' | 'defender'): boolean {
  if (contest[role].pos.area === 'goal') return false; // goalies are never hurt
  if (isFoul(contestSpell(view, contest[role === 'attacker' ? 'defender' : 'attacker']))) return true;
  return role === 'defender' && (contest.kind === 'tackle' || contest.kind === 'attack' || contest.kind === 'hit');
}

/**
 * Before the dice: foul only when the contest is very likely won (if you win, their player is
 * hurt; matching dice, 1 in 6, send yours off). Never against a goalie, who can't be hurt.
 */
function foul(view: PlayerView, legal: Action[]): Suggestion | null {
  const clean = legal.find((a) => a.type === 'foul' && a.card === null);
  const pending = view.pending;
  if (!clean || pending.kind !== 'foul') return clean ? { action: clean, says: 'Play it clean.' } : null;
  const { contest, role } = pending;
  const target = contest[role === 'attacker' ? 'defender' : 'attacker'].pos;
  const chance = contestChance(view, contest, role);
  const dirty = legal.find((a) => a.type === 'foul' && a.card !== null);
  // A foul is cast like a spell, so it uses one of the player's casts. Not their last one.
  const fouler = slotAt(view, 'mine', contest[role].pos);
  const castsLeft = fouler && (fouler.state === 'revealed' || fouler.state === 'faceDown') ? fouler.castsLeft : undefined;
  const lastCast = castsLeft !== undefined && castsLeft < 2;
  if (dirty && dirty.type === 'foul' && dirty.card && target.area !== 'goal' && chance >= 0.75 && !lastCast) {
    const uid = dirty.card;
    const spell = view.mine.hand.find((c) => c.uid === uid)?.def.name ?? 'a dirty play';
    return {
      action: dirty,
      says: `Foul with ${spell}: you're ${pct(chance)} to win this one, and if you win, their player is hurt. The risk: if the two dice match (1 in 6), the referee sends ${nameAt(view, 'mine', contest[role].pos)} off for the game.`,
    };
  }
  const why = target.area === 'goal' ? 'a foul does nothing to a goalie'
    : lastCast && chance >= 0.75 ? `a foul is cast like a spell, and it would use ${nameAt(view, 'mine', contest[role].pos)}'s last one`
    : `you're only ${pct(chance)} to win this contest, and a foul only hurts them if you win`;
  return { action: clean, says: `Play it clean: ${why}.` };
}

function draw(view: PlayerView, legal: Action[]): Suggestion | null {
  const subs = legal.filter((a): a is Extract<Action, { type: 'substitute' }> => a.type === 'substitute');
  const bench = view.mine.hand.filter(isField);
  // Fill an empty spot, or rest a player who has no spells left (not the ball holder: a player
  // who just came on can't pass).
  const pos = emptySpot(view) ?? tiredPlayer(view);
  if (pos && isFieldPos(pos)) {
    const options = subs.filter((a) => samePos(a.pos, pos));
    const best = options
      .map((a) => ({ a, card: view.mine.hand.find((c) => c.uid === a.card)! }))
      .filter((o) => o.card && isField(o.card))
      .sort((x, y) => fitFor(y.card.def as PlayerCardDef, pos.area) - fitFor(x.card.def as PlayerCardDef, pos.area))[0];
    const empty = slotAt(view, 'mine', pos)?.state === 'empty';
    const current = cardAt(view, 'mine', pos);
    // Rest a tired player only if the substitute is nearly as good in that spot.
    const goodEnough = !current || (best && fitFor(best.card.def as PlayerCardDef, pos.area) >= 0.9 * fitFor(current.def as PlayerCardDef, pos.area));
    if (best && goodEnough) {
      const why = empty
        ? `Your ${posName(pos, view.lanes)} spot is empty, and an empty spot counts as 0.`
        : `${nameAt(view, 'mine', pos)} has no spells left. Taking them off lets them rest and come back fresh.`;
      return { action: best.a, says: `Substitute ${firstName(best.card.def.name)} in at ${posName(pos, view.lanes)} instead of drawing. ${why}` };
    }
  }
  const full = view.mine.hand.length >= view.config.handLimit;
  const pick = (pile: 'players' | 'spells') => legal.find((a) => a.type === 'draw' && a.pile === pile);
  if (full) {
    // Nothing is drawn: the top card of the chosen pile is discarded. Lose a player if you have spares.
    const pile = bench.length >= 2 ? 'players' : 'spells';
    const a = pick(pile) ?? pick(pile === 'players' ? 'spells' : 'players');
    return a && a.type === 'draw' ? { action: a, says: `Your hand is full, so nothing is drawn. Choose the ${a.pile} pile: ${a.pile === 'players' ? 'you have spare players' : 'you have few spare players'}.` } : null;
  }
  const pile = bench.length >= 2 ? 'spells' : 'players';
  const a = pick(pile) ?? pick(pile === 'players' ? 'spells' : 'players');
  if (!a || a.type !== 'draw') return null;
  return { action: a, says: a.pile === 'spells' ? `Draw a spell. You have ${bench.length} spare players in hand already.` : `Draw a player, so you have someone to bring on if a player is hurt.` };
}

/** Regroup: swap the spare goalie for a new card if it's in hand, otherwise do nothing. */
function quietRegroup(view: PlayerView, legal: Action[]): Suggestion | null {
  const regroups = legal.filter((a): a is Extract<Action, { type: 'regroup' }> => a.type === 'regroup');
  const spare = view.mine.hand.find((c) => c.def.kind === 'goalie');
  const swap = spare ? regroups.find((a) => a.discard.length === 1 && a.discard[0] === spare.uid) : undefined;
  if (swap) return { action: swap, says: `Nothing useful to do with the ball this turn. Regroup: swap your spare goalie, ${firstName(spare!.def.name)}, for a new card.` };
  const pass = regroups.find((a) => a.discard.length === 0);
  return pass ? { action: pass, says: 'Nothing useful to do this turn, so let it pass. Your cards will be useful later.' } : null;
}

function emptySpot(view: PlayerView): Pos | null {
  for (const area of ['forward', 'midfield', 'defense'] as Area[]) {
    for (let lane = 0; lane < view.lanes; lane++) {
      const pos = { area, lane };
      // A penalized player's spot is empty but can't be filled; legal actions decide.
      if (view.mine.lineup[area][lane]?.state === 'empty' && !view.mine.penaltyBox.some((e) => samePos(e.pos, pos))) return pos;
    }
  }
  return null;
}

function tiredPlayer(view: PlayerView): Pos | null {
  for (const area of ['forward', 'midfield', 'defense'] as Area[]) {
    for (let lane = 0; lane < view.lanes; lane++) {
      const pos: FieldPos = { area, lane };
      const s = slotAt(view, 'mine', pos);
      const holding = view.ball?.side === view.me && samePos(view.ball.pos, pos);
      if (s && s.state !== 'empty' && s.state !== 'unknown' && s.castsLeft === 0 && !holding) return pos;
    }
  }
  return null;
}

function action(view: PlayerView, legal: Action[]): Suggestion | null {
  const me = view.me;
  const myBall = view.ball?.side === me ? view.ball.pos : null;

  // 1. A forward with the ball shoots.
  const shoot = legal.find((a) => a.type === 'shoot');
  if (shoot && myBall) {
    const s = shotChance(view, myBall);
    const against = s.theirs === null ? 'their goalie (face down, so a guess)' : `their goalie's Save ${s.theirs}`;
    return { action: shoot, says: `Shoot! ${nameAt(view, 'mine', myBall)}'s Shot ${s.mine} against ${against}: ${pct(s.chance)}, and a reaction spell can add more.` };
  }

  // 2. With the ball: pass, forward if it's likely to be caught.
  const passes = legal.filter((a): a is Extract<Action, { type: 'pass' }> => a.type === 'pass');
  if (myBall && passes.length) {
    const rated = passes.map((a) => ({ a, ...passChance(view, a.to), forward: depth(a.to) > depth(myBall) }));
    const longPass = longPassOption(view, legal, myBall);
    if (longPass) return longPass;
    const forward = rated.filter((r) => r.forward).sort((x, y) => y.chance - x.chance)[0];
    const safest = [...rated].sort((x, y) => y.chance - x.chance)[0]!;
    const pick = forward && (forward.chance >= 0.45 || forward.chance >= safest.chance - 0.1) ? forward : safest;
    const against = pick.theirs === null ? 'whoever is defending there (face down)' : `${nameAt(view, 'opponent', opposite(pick.a.to))}'s Defense ${pick.theirs}`;
    const where = pick.forward ? '' : ' It doesn\'t get you closer to goal, but it keeps the ball safe.';
    return {
      action: pick.a,
      says: `Pass to ${nameAt(view, 'mine', pick.a.to)} at ${posName(pick.a.to, view.lanes)}: Speed ${pick.mine - view.config.passBonus} + ${view.config.passBonus} for the pass against ${against}, ${pct(pick.chance)} to catch it.${where}`,
    };
  }

  // 3. They have the ball in a spot you can tackle or attack: whichever is likelier to win it.
  // A physical attack risks a penalty, so only while the penalty risk is low.
  const tackle = legal.find((a) => a.type === 'tackle');
  const theirBall = view.ball?.side !== me && view.ball && isFieldPos(view.ball.pos) ? view.ball.pos : null;
  const attack = theirBall ? legal.find((a) => a.type === 'attack' && samePos(a.target, theirBall)) : undefined;
  if (attack && attack.type === 'attack' && theirBall && view.mine.penaltyLevel <= 2) {
    const at = attackChance(view, attack.attacker);
    const t = tackle ? tackleChance(view, theirBall).chance : 0;
    if (at.chance >= 0.55 && at.chance >= t) {
      const against = at.theirs === null ? 'their Speed (face down, so a guess)' : `${nameAt(view, 'opponent', theirBall)}'s Speed ${at.theirs}`;
      return {
        action: attack,
        says: `Physical attack with ${nameAt(view, 'mine', attack.attacker)}: Speed ${at.mine} plus whatever card you flip, against ${against}, ${pct(at.chance)}. Win and they drop the ball and are knocked down. Your penalty risk is ${view.mine.penaltyLevel}.`,
      };
    }
  }
  if (tackle && theirBall) {
    const t = tackleChance(view, theirBall);
    if (t.chance >= 0.45) {
      const against = t.theirs === null ? 'their Speed (face down, so a guess)' : `${nameAt(view, 'opponent', theirBall)}'s Speed ${t.theirs}`;
      return { action: tackle, says: `Tackle with ${nameAt(view, 'mine', opposite(theirBall))}: Defense ${t.mine} against ${against}, ${pct(t.chance)} to win the ball.` };
    }
  }

  // 4. Nothing to do with the ball: look at their goalie or a defender with a scry, if you can.
  const scry = scryOption(view, legal);
  if (scry) return scry;
  return null;
}

/** A long pass (Float Pass) from defense or goal straight to a forward, when it's likely caught. */
function longPassOption(view: PlayerView, legal: Action[], from: Pos): Suggestion | null {
  if (from.area !== 'defense' && from.area !== 'goal') return null;
  const casts = legal.filter((a): a is Extract<Action, { type: 'cast' }> => a.type === 'cast' && a.target.kind === 'pass');
  let best: { a: Extract<Action, { type: 'cast' }>; chance: number } | null = null;
  for (const a of casts) {
    if (a.target.kind !== 'pass' || depth(a.target.to) - depth(from) < 2) continue;
    const chance = passChance(view, a.target.to).chance;
    if (!best || chance > best.chance || (chance === best.chance && betterCaster(view, a, best.a))) best = { a, chance };
  }
  if (!best || best.chance < 0.6 || best.a.target.kind !== 'pass') return null;
  const spell = view.mine.hand.find((c) => c.uid === best!.a.card)!.def;
  return { action: best.a, says: `Cast ${spell.name} with ${nameAt(view, 'mine', best.a.caster)}: a pass that skips a row, straight to ${nameAt(view, 'mine', best.a.target.to)} (${pct(best.chance)} to catch it).` };
}

function scryOption(view: PlayerView, legal: Action[]): Suggestion | null {
  const casts = legal.filter((a): a is Extract<Action, { type: 'cast' }> => a.type === 'cast' && a.target.kind === 'opponent');
  if (!casts.length) return null;
  // Their goalie first (every shot meets it), then the defenders your forwards face.
  const wanted: Pos[] = [{ area: 'goal' }, ...Array.from({ length: view.lanes }, (_, lane) => ({ area: 'defense' as const, lane }))];
  for (const pos of wanted) {
    const options = casts.filter((a) => a.target.kind === 'opponent' && samePos(a.target.pos, pos));
    if (!options.length) continue;
    const a = options.reduce((x, y) => (betterCaster(view, y, x) ? y : x));
    const spell = view.mine.hand.find((c) => c.uid === a.card)!.def;
    return { action: a, says: `Cast ${spell.name} with ${nameAt(view, 'mine', a.caster)} to look at ${posName(pos, view.lanes) === 'goalie' ? 'their goalie' : `their ${posName(pos, view.lanes)}`} without turning them over.` };
  }
  return null;
}

/** A caster with an affinity for the spell, then one already face up (so casting gives nothing away). */
function betterCaster(view: PlayerView, a: Extract<Action, { type: 'cast' }>, b: Extract<Action, { type: 'cast' }>): boolean {
  const spell = view.mine.hand.find((c) => c.uid === a.card)?.def;
  if (!spell) return false;
  const rank = (x: typeof a) => {
    const aff = casterAffinity(view, x.caster, spell);
    const up = slotAt(view, 'mine', x.caster)?.state === 'revealed';
    return (aff === 'specialist' ? 4 : aff === 'match' ? 2 : 0) + (up ? 1 : 0);
  };
  return rank(a) > rank(b);
}

function discard(view: PlayerView, legal: Action[]): Suggestion | null {
  const options = legal.flatMap((a) => {
    const card = a.type === 'discard' ? view.mine.hand.find((c) => c.uid === a.card) : undefined;
    return card ? [{ a, card }] : [];
  });
  if (!options.length) return null;
  const fieldCount = view.mine.hand.filter(isField).length;
  // Roughly: a spare goalie is worth least, then weak or injured players, then spells, then
  // strong players. Keep at least two field players to bring on.
  const value = (c: CardView): number => {
    if (c.def.kind === 'goalie') return 0;
    if (c.def.kind === 'field') {
      const d = c.def as FieldCardDef;
      const best = Math.max(fitFor(d, 'forward'), fitFor(d, 'midfield'), fitFor(d, 'defense')) - (c.injury ? 5 : 0);
      return fieldCount > 2 ? best : 30 + best;
    }
    return 14;
  };
  const pick = options.sort((x, y) => value(x.card) - value(y.card))[0]!;
  return { action: pick.a, says: `Discard ${pick.card.def.name}: it's the card you'll miss least.` };
}

function forcedSub(view: PlayerView, legal: Action[]): Suggestion | null {
  const p = view.pending;
  if (p.kind !== 'forcedSub') return null;
  const options = legal.flatMap((a) => {
    const card = a.type === 'forcedSub' ? view.mine.hand.find((c) => c.uid === a.card) : undefined;
    return card ? [{ a, card }] : [];
  });
  const pick = options.sort((x, y) => fitFor(y.card.def as PlayerCardDef, p.pos.area) - fitFor(x.card.def as PlayerCardDef, p.pos.area))[0];
  return pick ? { action: pick.a, says: `Bring on ${firstName(pick.card.def.name)}: the best fit for ${posName(p.pos, view.lanes)} in your hand.` } : null;
}

function shootoutPick(view: PlayerView, legal: Action[]): Suggestion | null {
  const options = legal.flatMap((a) => {
    const card = a.type === 'shootoutPick' ? cardAt(view, 'mine', a.pos) : null;
    return card && card.def.kind === 'field' ? [{ a, card, shot: (card.def as FieldCardDef).shot }] : [];
  });
  const pick = options.sort((x, y) => y.shot - x.shot)[0];
  return pick ? { action: pick.a, says: `${firstName(pick.card.def.name)} takes it: Shot ${pick.shot} is your best left.` } : null;
}

function fallbackSays(view: PlayerView, a: Action): string {
  switch (a.type) {
    case 'pass': return `Pass to ${nameAt(view, 'mine', a.to)}.`;
    case 'tackle': return 'Try a tackle.';
    case 'shoot': return 'Shoot!';
    case 'cast': {
      const spell = view.mine.hand.find((c) => c.uid === a.card)?.def as SpellCardDef | undefined;
      return `Cast ${spell?.name ?? 'a spell'} with ${nameAt(view, 'mine', a.caster)}.`;
    }
    case 'substitute': return `Substitute at ${posName(a.pos, view.lanes)} instead of drawing.`;
    case 'regroup': return a.discard.length
      ? `Regroup: swap ${view.mine.hand.find((c) => c.uid === a.discard[0])?.def.name ?? 'a card'} for a new one. There's nothing better to do this turn.`
      : 'Nothing useful to do this turn, so let it pass.';
    case 'draw': return `Draw a ${a.pile === 'players' ? 'player' : 'spell'}.`;
    case 'react': return a.card ? 'Play a reaction spell.' : 'No spell this time.';
    case 'callDice': return a.roll ? 'Reroll.' : 'Keep your roll.';
    case 'discard': return 'Discard the card you need least.';
    default: return 'A reasonable move.';
  }
}

/** Two actions are the same move (key order doesn't matter). */
export function sameAction(a: Action, b: Action): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${k}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
