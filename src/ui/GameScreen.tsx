// The game screen. It shows the person's view and turns taps into legal actions. It never
// decides what is legal itself: everything clickable comes from the seat's legal actions.

import { useEffect, useMemo, useState } from 'react';
import { isFieldPos, opposite, samePos, type Action, type CardDef, type FieldPos, type InjuryDef, type PlayerView, type Pos, type Side, type SpellTarget } from '../engine';
import { Board } from './Board';
import { Card, CardBack, type CardProps } from './Card';
import { Clocks } from './Clocks';
import { gamePresence, setDiscordPresence } from './discord';
import { capitalize, injuryEffect, laneName, posName } from './labels';
import { LineupScreen } from './LineupScreen';
import { casterAffinity, dicePreview, matchup, reactionPreview, shotPreview } from './preview';
import { TurnSteps } from './TurnSteps';
import { whyNotNow } from './spellHelp';
import { posKey, useGame, type Announcement, type GameController } from './useGame';
import type { SessionOptions } from './session';
import type { OpponentWords } from './text';

type Selection =
  | { kind: 'none' }
  | { kind: 'holder' }
  | { kind: 'cast'; card: string; caster?: Pos; first?: FieldPos }
  | { kind: 'substitute'; card: string }
  | { kind: 'regroup'; picked: string[] };

const NONE: Selection = { kind: 'none' };

/** A game against the computer. */
export function LocalGameScreen({ options, onQuit, autoplay = false }: { options: SessionOptions; onQuit: () => void; autoplay?: boolean }) {
  const game = useGame(options, autoplay);
  return <GameScreen game={game} onQuit={onQuit} />;
}

/** The table, for a game against the computer or an online match. onQuit: leave the screen. */
export function GameScreen({ game, onQuit }: { game: GameController; onQuit: () => void }) {
  const { seat, opp, online } = game;
  const view = seat.view;
  const legal = seat.legal;
  const me = seat.human;
  const them = seat.opponent;
  const teams = seat.teams;
  // Hints come from the computer player, so they're for practice games only.
  const hintsAllowed = !online;
  const [selection, setSelection] = useState<Selection>(NONE);
  const [inspected, setInspected] = useState<{ def: CardDef; injury?: InjuryDef } | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [hintText, setHintText] = useState<string | null>(null);
  /** Why the card just tapped can't be played right now. */
  const [notice, setNotice] = useState<string | null>(null);
  const pending = view.pending;

  // Inside Discord: show the turn and score on the player's profile.
  const [startedAt] = useState(Date.now);
  const presence = gamePresence(view, them, online !== null, startedAt);
  useEffect(() => setDiscordPresence(presence), [presence.details, presence.state]);

  // While a move is on its way to the server, nothing else can be chosen.
  const myDecision = seat.waitingFor === 'human' && !online?.sending;

  const act = (action: Action) => {
    setSelection(NONE);
    setHintText(null);
    setNotice(null);
    game.act(action);
  };

  // ---- What can be done with the current selection (all from the legal actions) ----

  const passes = legal.filter((a): a is Extract<Action, { type: 'pass' }> => a.type === 'pass');
  const casts = legal.filter((a): a is Extract<Action, { type: 'cast' }> => a.type === 'cast');
  const subs = legal.filter((a): a is Extract<Action, { type: 'substitute' }> => a.type === 'substitute');
  const shoot = legal.find((a) => a.type === 'shoot');
  const tackle = legal.find((a) => a.type === 'tackle');
  const myBall = view.ball?.side === me ? view.ball.pos : null;

  const castsFor = (card: string, caster?: Pos) =>
    casts.filter((a) => a.card === card && (!caster || samePos(a.caster, caster)));

  /** Glamour Ball: the opposing spot the computer will think the ball went to. */
  const decoySpot = (t: Extract<SpellTarget, { kind: 'decoyPass' }>): FieldPos => opposite({ area: t.to.area, lane: t.decoyLane });

  /** The spots on the board a spell target points at (hand targets are handled separately). */
  const targetPos = (t: SpellTarget, caster: Pos): { side: Side; pos: Pos }[] => {
    if (t.kind === 'opponent') return [{ side: them, pos: t.pos }];
    if (t.kind === 'pass' || t.kind === 'decoyPass') return [{ side: me, pos: t.to }];
    if (t.kind === 'swap') return [{ side: me, pos: t.a }, { side: me, pos: t.b }];
    if (t.kind === 'hit') return isFieldPos(caster) ? [{ side: them, pos: opposite(caster) }] : [];
    if (t.kind === 'mendField') return [{ side: me, pos: t.pos }];
    return [];
  };

  /** Hand cards that are targets of the spell being cast (Mend on an injured player in hand). */
  const handTargets = new Set(
    selection.kind === 'cast' && selection.caster
      ? castsFor(selection.card, selection.caster).flatMap((a) => (a.target.kind === 'mendHand' ? [a.target.card] : []))
      : [],
  );

  const highlights = useMemo(() => {
    const map = new Map<string, CardProps['highlight']>();
    if (!myDecision) return map;
    if (pending.kind === 'shootoutPick') {
      for (const a of legal) if (a.type === 'shootoutPick') map.set(posKey(me, a.pos), 'target');
      return map;
    }
    if (pending.kind !== 'action') return map;
    switch (selection.kind) {
      case 'none':
        if (myBall && passes.length) map.set(posKey(me, myBall), 'target');
        break;
      case 'holder':
        for (const p of passes) map.set(posKey(me, p.to), 'target');
        break;
      case 'cast':
        if (!selection.caster) {
          const def = view.mine.hand.find((c) => c.uid === selection.card)?.def;
          for (const a of castsFor(selection.card)) {
            const aff = def ? casterAffinity(view, a.caster, def) : null;
            map.set(posKey(me, a.caster), aff === 'match' ? 'match' : aff === 'opposed' ? 'opposed' : 'target');
          }
        } else {
          for (const a of castsFor(selection.card, selection.caster)) {
            // Glamour Ball, second step: where the computer will think the ball went.
            if (a.target.kind === 'decoyPass' && selection.first) {
              if (samePos(a.target.to, selection.first)) map.set(posKey(them, decoySpot(a.target)), 'target');
              continue;
            }
            for (const t of targetPos(a.target, a.caster)) {
              if (selection.first && a.target.kind === 'swap' && !(samePos(a.target.a, selection.first) || samePos(a.target.b, selection.first))) continue;
              map.set(posKey(t.side, t.pos), 'target');
            }
          }
        }
        break;
      case 'substitute':
        for (const a of subs) if (a.card === selection.card) map.set(posKey(me, a.pos), 'target');
        break;
      default:
        break;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.version, selection]);

  // ---- Taps ----

  const inspect = (side: Side, pos: Pos) => {
    const team = side === me ? view.mine : view.opponent;
    const slot = pos.area === 'goal' ? team.goalie : team.lineup[pos.area][pos.lane];
    if (slot && (slot.state === 'revealed' || slot.state === 'faceDown')) setInspected(slot.card);
  };

  const onSpot = (side: Side, pos: Pos) => {
    inspect(side, pos);
    if (!myDecision) return;
    if (pending.kind === 'shootoutPick') {
      const a = legal.find((x) => x.type === 'shootoutPick' && side === me && samePos(x.pos, pos));
      if (a) act(a);
      return;
    }
    if (pending.kind !== 'action') return;

    if (selection.kind === 'holder') {
      const pass = passes.find((p) => side === me && samePos(p.to, pos));
      if (pass) return act(pass);
      return setSelection(NONE);
    }
    if (selection.kind === 'cast') {
      if (!selection.caster) {
        if (side !== me) return;
        const options = castsFor(selection.card, pos);
        if (!options.length) return;
        if (options.length === 1 && options[0]!.target.kind === 'none') return act(options[0]!);
        return setSelection({ ...selection, caster: pos });
      }
      const options = castsFor(selection.card, selection.caster);
      if (selection.first && options[0]?.target.kind === 'decoyPass') {
        const decoy = options.find((a) => a.target.kind === 'decoyPass' && samePos(a.target.to, selection.first!) && side === them && samePos(decoySpot(a.target), pos));
        if (decoy) act(decoy);
        return;
      }
      const hit = options.filter((a) => targetPos(a.target, a.caster).some((t) => t.side === side && samePos(t.pos, pos)));
      if (!hit.length) return;
      // Glamour Ball with 3 or more lanes: then choose which lane the computer will think it went to.
      if (hit[0]!.target.kind === 'decoyPass' && hit.length > 1) return setSelection({ ...selection, first: pos as FieldPos });
      if (hit[0]!.target.kind === 'swap') {
        if (!selection.first) return setSelection({ ...selection, first: pos as FieldPos });
        const pair = hit.find((a) => a.target.kind === 'swap' && (samePos(a.target.a, selection.first!) || samePos(a.target.b, selection.first!)));
        if (pair) act(pair);
        return;
      }
      return act(hit[0]!);
    }
    if (selection.kind === 'substitute') {
      const sub = subs.find((a) => a.card === selection.card && side === me && samePos(a.pos, pos));
      if (sub) act(sub);
      return;
    }
    // Nothing selected: tapping your ball holder starts a pass.
    if (side === me && myBall && samePos(myBall, pos) && passes.length) setSelection({ kind: 'holder' });
  };

  const onHandCard = (uid: string, def: CardDef, injury?: InjuryDef) => {
    setInspected({ def, injury });
    setNotice(null);
    if (!myDecision) return;
    if (def.kind === 'spell' && spellDecision && !canPlayNow(uid) && !handTargets.has(uid)) setNotice(whyNotNow(view, def));
    if (pending.kind === 'forcedSub') {
      const sub = legal.find((a) => a.type === 'forcedSub' && a.card === uid);
      if (sub) act(sub);
      return;
    }
    if (pending.kind === 'reaction') {
      const react = legal.find((a) => a.type === 'react' && a.card === uid);
      if (react) act(react);
      return;
    }
    if (pending.kind === 'discard') {
      const discard = legal.find((a) => a.type === 'discard' && a.card === uid);
      if (discard) act(discard);
      return;
    }
    if (pending.kind !== 'action') return;
    if (selection.kind === 'cast' && handTargets.has(uid)) {
      const mendHand = castsFor(selection.card, selection.caster).find((a) => a.target.kind === 'mendHand' && a.target.card === uid);
      if (mendHand) return act(mendHand);
    }
    if (selection.kind === 'regroup') {
      const picked = selection.picked.includes(uid) ? selection.picked.filter((x) => x !== uid) : [...selection.picked, uid].slice(-view.config.regroupMax);
      return setSelection({ kind: 'regroup', picked });
    }
    if (castsFor(uid).length) return setSelection({ kind: 'cast', card: uid });
    if (subs.some((a) => a.card === uid)) return setSelection({ kind: 'substitute', card: uid });
    setSelection(NONE);
  };

  /** A spell that can be played in the current decision (cast as your action, or as a reaction). */
  function canPlayNow(uid: string): boolean {
    if (pending.kind === 'action') return castsFor(uid).length > 0;
    if (pending.kind === 'reaction') return legal.some((a) => a.type === 'react' && a.card === uid);
    return false;
  }
  const spellDecision = myDecision && (pending.kind === 'action' || pending.kind === 'reaction');
  const castable = view.mine.hand.filter((c) => c.def.kind === 'spell' && pending.kind === 'action' && canPlayNow(c.uid));

  // ---- Setup screens ----

  if (pending.kind === 'chooseGoalie' && myDecision) {
    return (
      <div className="screen setup">
        <h2>Choose your goalie</h2>
        <p>Your goalie starts face down in goal. The other one is shuffled into your deck.</p>
        <div className="choice-row">
          {legal.map((a) => a.type === 'chooseGoalie' ? (
            <Card key={a.card} def={view.mine.hand.find((c) => c.uid === a.card)!.def} showText onClick={() => act(a)} />
          ) : null)}
        </div>
      </div>
    );
  }
  if (pending.kind === 'placeLineup' && myDecision) {
    return <LineupScreen view={view} legal={legal} onPlace={(actions) => actions.forEach((a) => game.act(a))} onAuto={game.autoPlace} />;
  }

  // ---- Prompts ----

  const leaveLabel = online ? 'Back to your matches' : 'New game';

  const prompt = (): React.ReactNode => {
    if (online?.match.result && online.match.result.reason !== 'played') {
      const { outcome, reason } = online.match.result;
      const headline = reason === 'resigned'
        ? (outcome === 'won' ? `${opp.Name} resigned. You win!` : 'You resigned.')
        : (outcome === 'won' ? `${opp.Name} ran out of time without making a move. You win by forfeit.` : 'Your time ran out before you made a move, so the match was forfeited.');
      return (
        <div className="prompt">
          <strong>{headline}</strong>
          <div className="buttons"><button type="button" className="primary" onClick={onQuit}>{leaveLabel}</button></div>
        </div>
      );
    }
    if (pending.kind === 'gameOver') {
      const r = view.result!;
      const headline = r.winner === null ? "It's a draw." : r.winner === me ? 'You win!' : `${opp.Name} wins.`;
      return (
        <div className="prompt">
          <strong>{headline}</strong> Final score: you {view.score[me]}, {opp.name} {view.score[them]}
          {view.shootout ? ` (shootout ${view.shootout.goals[me]}–${view.shootout.goals[them]})` : ''}.
          <div className="buttons"><button type="button" className="primary" onClick={onQuit}>{leaveLabel}</button></div>
        </div>
      );
    }
    if (online?.sending) return <div className="prompt waiting">Sending your move…</div>;
    if (online && !myDecision) {
      return <div className="prompt waiting">Waiting for {opp.name}. You can leave this page: the match is saved, and their move will be here when you come back.</div>;
    }
    if (!myDecision) return <div className="prompt waiting">The computer is thinking…</div>;

    switch (pending.kind) {
      case 'faceoffLane':
        return (
          <div className="prompt">
            <strong>Faceoff.</strong> Choose a lane. Both midfielders in that lane compare Faceoff, and you win ties.
            <div className="buttons">
              {legal.map((a) => a.type === 'faceoffLane' ? (
                <button type="button" key={a.lane} onClick={() => act(a)}>{capitalize(laneName(a.lane, view.lanes))} lane</button>
              ) : null)}
            </div>
          </div>
        );
      case 'reaction':
        return <ReactionPrompt view={view} opp={opp} onPlay={(uid) => act(legal.find((a) => a.type === 'react' && a.card === uid)!)} />;
      case 'callDice':
        return <DicePrompt view={view} onChoose={(roll) => act({ type: 'callDice', side: me, roll })} />;
      case 'draw':
        return (
          <div className="prompt">
            {view.mine.hand.length >= view.config.handLimit ? (
              <><strong>Your turn. Your hand is full</strong> ({view.config.handLimit} cards), so you don't draw. Choose a pile: its top card goes to your discard pile, so the game clock keeps running.</>
            ) : (
              <><strong>Your turn: draw a card.</strong> Choose a pile.</>
            )}
            <div className="buttons">
              <button type="button" onClick={() => act({ type: 'draw', side: me, pile: 'players' })}>{view.mine.hand.length >= view.config.handLimit ? 'Players pile' : 'Draw a player'} ({view.mine.playersLeft} left)</button>
              <button type="button" onClick={() => act({ type: 'draw', side: me, pile: 'spells' })}>{view.mine.hand.length >= view.config.handLimit ? 'Spells pile' : 'Draw a spell'} ({view.mine.spellsLeft} left)</button>
              {hintsAllowed ? <button type="button" className="quiet" onClick={hint}>Hint</button> : null}
            </div>
            {hintText ? <div className="hint">{hintText}</div> : null}
          </div>
        );
      case 'discard':
        return <div className="prompt"><strong>Too many cards.</strong> Tap {pending.count} card{pending.count === 1 ? '' : 's'} in your hand to discard (you can hold 7).</div>;
      case 'shootoutPick':
        return <div className="prompt"><strong>Penalty!</strong> Tap one of your players who hasn't shot yet. Their Shot goes against the goalie's Save.</div>;
      case 'forcedSub':
        return (
          <div className="prompt urgent">
            <strong>Injury!</strong> Your {posName(pending.pos, view.lanes)} has to come off. Tap a{pending.pos.area === 'goal' ? ' goalie' : ' field player'} in
            your hand to bring on, face down. This doesn't use an action. The injured player goes to your hand, still injured.
          </div>
        );
      case 'action':
        return actionPrompt();
      default:
        return null;
    }
  };

  const hint = () => {
    const h = seat.hint();
    if (!h) return;
    const text = h.type === 'pass' ? `pass to your ${posName(h.to, view.lanes)}`
      : h.type === 'cast' ? `cast ${view.mine.hand.find((c) => c.uid === h.card)?.def.name}`
      : h.type === 'substitute' ? `substitute your ${posName(h.pos, view.lanes)}`
      : h.type === 'regroup' ? (h.discard.length ? 'regroup (swap out weak cards)' : 'pass this action')
      : h.type === 'callDice' ? (h.roll ? 'call for dice' : 'not roll')
      : h.type === 'draw' ? `draw a ${h.pile === 'players' ? 'player' : 'spell'}`
      : h.type;
    setHintText(`The computer would ${text}.`);
  };

  /** "your Shot 5 vs their Save 3" (or "?" for a face-down player you haven't seen). */
  const versus = (m: ReturnType<typeof matchup>, mineLabel: string, theirsLabel: string) =>
    m ? ` (your ${mineLabel} ${m.mine} vs their ${theirsLabel} ${m.theirs ?? '?'})` : '';
  // Shots are rolled, so show the chance of scoring rather than win or lose.
  const shot = myBall ? shotPreview(view, myBall) : null;
  const shootLabel = !myBall ? ''
    : shot ? ` (your Shot ${shot.mine} vs their Save ${shot.theirs}, both roll: about ${Math.round(shot.chance * 100)}% to score)`
    : versus(matchup(view, { pos: myBall, stat: 'shot', use: 'shoot' }, { pos: { area: 'goal' }, stat: 'save', use: 'save' }), 'Shot', 'Save');
  const theirHolder = view.ball && view.ball.side === them && view.ball.pos.area !== 'goal' ? view.ball.pos : null;
  const holderSlot = theirHolder ? view.opponent.lineup[theirHolder.area][theirHolder.lane] : null;
  const imagesNote = holderSlot?.state === 'revealed' && holderSlot.images
    ? ` (mirror images: ${view.config.mirrorImages} in ${view.config.mirrorImages + 1} tackles miss)`
    : '';
  const tackleLabel = theirHolder
    ? versus(matchup(view, { pos: opposite(theirHolder), stat: 'defense', use: 'tackle' }, { pos: theirHolder, stat: 'speed', use: 'evade' }), 'Defense', 'Speed') + imagesNote
    : '';

  function actionPrompt() {
    const left = view.actionsLeft;
    const spellHelp = castable.length
      ? ` To cast a spell, tap a glowing spell in your hand (${castable.length === 1 ? castable[0]!.def.name : `${castable.length} can be cast now`}).`
      : '';
    let help = `Tap your ball carrier (glowing) to pass, or tap a card in your hand to play it.${spellHelp}`;
    if (!myBall) help = (view.ball?.pos.area === 'goal' ? "Their goalie has the ball (goalies can't be tackled)." : `${opp.Name} has the ball. You can tackle, or play a card.`) + spellHelp;
    if (selection.kind === 'holder') help = 'Tap a glowing teammate to pass to them. Tap anywhere else to cancel.';
    if (selection.kind === 'cast') {
      const def = view.mine.hand.find((c) => c.uid === selection.card)?.def;
      const effect = def?.kind === 'spell' ? def.ability.effect : '';
      const targetHelp = effect === 'hit' ? 'Now tap the opposing player in that spot to hit them.'
        : effect === 'mend' ? 'Now tap the injured player to mend, on the field or in your hand.'
        : effect === 'decoy_pass' ? `Now tap the teammate to pass to. ${opp.Name} will think it went to another lane, so it can't be intercepted.`
        : 'Now choose the target.';
      help = !selection.caster
        ? `Choose who casts ${def?.name}. Green = affinity match (stronger), red = opposed (weaker).`
        : selection.first ? (effect === 'decoy_pass' ? `Now tap the spot where ${opp.name} will think the ball went.` : 'Now tap the second player to swap.') : targetHelp;
    }
    if (selection.kind === 'substitute') help = 'Tap the player (or empty spot) to fill. The new player comes in face down.';
    if (selection.kind === 'regroup') {
      help = view.config.regroupMax === 1
        ? 'Tap a card to discard, then confirm. You draw a new one.'
        : `Tap up to ${view.config.regroupMax} cards to discard, then confirm. You draw the same number.`;
    }
    return (
      <div className="prompt">
        <strong>Your turn.</strong>{view.config.actionsPerTurn > 1 ? ` ${left} action${left === 1 ? '' : 's'} left.` : ''} {help}
        <div className="buttons">
          {shoot ? <button type="button" className="primary" onClick={() => act(shoot)}>Shoot!{shootLabel}</button> : null}
          {tackle ? <button type="button" onClick={() => act(tackle)}>Tackle{tackleLabel}</button> : null}
          {selection.kind === 'regroup' ? (
            <button type="button" onClick={() => act({ type: 'regroup', side: me, discard: selection.picked })}>
              {selection.picked.length ? `Discard ${selection.picked.length} and draw` : 'Do nothing'}
            </button>
          ) : (
            <button type="button" onClick={() => setSelection({ kind: 'regroup', picked: [] })}>Regroup / skip</button>
          )}
          {selection.kind !== 'none' ? <button type="button" onClick={() => setSelection(NONE)}>Cancel</button> : null}
          {hintsAllowed ? <button type="button" className="quiet" onClick={hint}>Hint</button> : null}
        </div>
        {hintText ? <div className="hint">{hintText}</div> : null}
      </div>
    );
  }

  const selectedKey = selection.kind === 'holder' && myBall ? posKey(me, myBall)
    : selection.kind === 'cast' && selection.caster ? posKey(me, selection.caster) : null;

  return (
    <div className="game-layout">
      <TurnSteps view={view} opp={opp} />
      <div className="screen game">
        <header className="scorebar">
          <span className="score">You <b>{view.score[me]}</b> – <b>{view.score[them]}</b> {opp.Name}</span>
          {online ? <Clocks match={online.match} receivedAt={online.receivedAt} opp={opp} /> : null}
          <span className="meta">
            Turn {view.turn} · Cards left {view.mine.playersLeft}+{view.mine.spellsLeft} / {view.opponent.playersLeft}+{view.opponent.spellsLeft} (players+spells) · 🎲 Rolls {view.diceLeft[me]} / {view.diceLeft[them]}
            {view.endgame.finalTurnFor ? ' · Last turn!' : ''}
          </span>
          {online?.match.status === 'active' ? <button type="button" className="quiet" onClick={online.resign}>Resign</button> : null}
          <button type="button" className="quiet" onClick={onQuit}>{online ? 'Matches' : 'Quit'}</button>
        </header>

        <div className="opponent-hand">
          <span>{opp.Owner} hand</span>
          {Array.from({ length: view.opponent.handCount }, (_, i) => <CardBack key={i} team={teams[them]} />)}
        </div>

        <Board view={view} teams={teams} highlights={highlights} selectedKey={selectedKey} justRevealed={game.justRevealed} onSpot={onSpot} />

        {online?.problem ? <div className="prompt notice">{online.problem}</div> : null}
        {online?.match.status === 'active' && online.match.autopilot.you ? (
          <div className="prompt notice">Your time ran out, so the computer is making your decisions for the rest of the match.</div>
        ) : null}
        {online?.match.status === 'active' && online.match.autopilot.them ? (
          <div className="prompt notice">{opp.Name} ran out of time, so the computer is making their decisions for the rest of the match.</div>
        ) : null}
        {prompt()}
        {notice ? <div className="prompt notice" onClick={() => setNotice(null)}>{notice}</div> : null}

        <div className="hand-label">
          <strong>Your hand</strong>
          <span><span className="action">Action spells</span>: on your turn, as your action</span>
          <span><span className="reaction">Reaction spells</span>: when a contest starts</span>
        </div>
        <div className="hand">
          {view.mine.hand.map((c) => (
            <Card
              key={c.uid}
              def={c.def}
              injury={c.injury}
              showText
              selected={(selection.kind === 'cast' || selection.kind === 'substitute') && selection.card === c.uid || (selection.kind === 'regroup' && selection.picked.includes(c.uid))}
              highlight={myDecision && (handTargets.has(c.uid) || (selection.kind === 'none' && castable.some((x) => x.uid === c.uid)) || legal.some((a) => (a.type === 'react' || a.type === 'discard' || a.type === 'forcedSub') && a.card === c.uid)) ? 'target' : null}
              dim={spellDecision && c.def.kind === 'spell' && selection.kind === 'none' && !canPlayNow(c.uid)}
              onClick={() => onHandCard(c.uid, c.def, c.injury)}
            />
          ))}
          {view.mine.hand.length === 0 ? <span className="empty-hand">Your hand is empty.</span> : null}
        </div>

        {inspected ? (
          <div className="inspector" onClick={() => setInspected(null)}>
            <Card def={inspected.def} injury={inspected.injury} showText />
            <div className="inspector-text">
              {inspected.def.kind !== 'spell' ? inspected.def.resonants.map((r) => <div key={r.name}>{r.name} Resonant · {capitalize(r.affinity)} Affinity</div>) : null}
              {inspected.injury ? <div className="injury-text">Injured: {inspected.injury.name} ({injuryEffect(inspected.injury, inspected.def)}) until mended.</div> : null}
              {inspected.def.flavor ? <div className="flavor">{inspected.def.flavor}</div> : null}
            </div>
          </div>
        ) : null}

        <div className="log">
          <button type="button" className="quiet" onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide' : 'Show'} play-by-play</button>
          <ul>
            {(showLog ? game.log : game.log.slice(0, 4)).map((line, i) => <li key={i} className={`tone-${line.tone}`}>{line.text}</li>)}
          </ul>
          <div className="piles">
            Your discard pile: {view.mine.discard.length} · Their discard pile: {view.opponent.discard.length}
          </div>
        </div>

        {game.announcement ? <AnnouncementView a={game.announcement} opp={opp} onClose={game.dismissAnnouncement} /> : null}
      </div>
    </div>
  );
}

function DicePrompt({ view, onChoose }: { view: PlayerView; onChoose: (roll: boolean) => void }) {
  const preview = dicePreview(view);
  if (!preview) return null;
  const winning = preview.mine > preview.theirs || (preview.mine === preview.theirs && preview.iWinTies);
  const chance = Math.round(preview.chanceIfRolled * 100);
  return (
    <div className="prompt">
      <strong>Call for dice?</strong> Right now it's {preview.mine}–{preview.theirs}: you'd {winning ? 'win' : 'lose'}
      {preview.mine === preview.theirs ? ' (tie)' : ''}. If you call, you both roll a die and add it: you'd win about {chance}% of the
      time. It costs one of your rolls ({preview.rollsLeft} left this game); their roll is free.
      <div className="buttons">
        <button type="button" className={!winning && chance >= 40 ? 'primary' : ''} onClick={() => onChoose(true)}>🎲 Call for dice ({chance}%)</button>
        <button type="button" onClick={() => onChoose(false)}>No dice</button>
      </div>
    </div>
  );
}

function ReactionPrompt({ view, opp, onPlay }: { view: PlayerView; opp: OpponentWords; onPlay: (uid: string | null) => void }) {
  const preview = reactionPreview(view);
  if (!preview) return null;
  const winning = preview.mine > preview.theirs || (preview.mine === preview.theirs && preview.iWinTies);
  const status = `Right now it's ${preview.mine}–${preview.theirs}: you'd ${winning ? 'win' : 'lose'}${preview.mine === preview.theirs ? ' (tie)' : ''}.`;
  // The reaction is cast by your player in this contest (and uses up one of their spells).
  const pending = view.pending;
  const casterPos = pending.kind === 'reaction' ? pending.contest[pending.role].pos : null;
  const casterSlot = casterPos ? (casterPos.area === 'goal' ? view.mine.goalie : view.mine.lineup[casterPos.area][casterPos.lane]) : null;
  const castsLeft = casterSlot && casterSlot.state !== 'empty' && casterSlot.state !== 'unknown' ? casterSlot.castsLeft : undefined;
  const casterNote = casterPos
    ? ` Your ${posName(casterPos, view.lanes)} casts it${castsLeft !== undefined ? ` (${castsLeft} ${castsLeft === 1 ? 'spell' : 'spells'} left)` : ''}.`
    : '';
  return (
    <div className="prompt">
      <strong>Contest! Play a reaction spell?</strong> {status}{casterNote}{preview.theyCanAnswer ? ` ${opp.Name} can answer with their own spell.` : ''} Tap a button below or a glowing spell in your hand.
      <div className="buttons">
        {preview.options.map((o) => {
          const wins = o.mine > o.theirs || (o.mine === o.theirs && preview.iWinTies);
          const note = o.fizzles ? 'fails: opposed affinity' : `${o.mine}–${o.theirs}, you'd ${wins ? 'win' : 'lose'}${o.affinity === 'match' ? ' (affinity match)' : o.affinity === 'opposed' ? ' (opposed: weaker)' : ''}`;
          return <button type="button" key={o.uid} className={wins && !o.fizzles ? 'primary' : ''} onClick={() => onPlay(o.uid)}>{o.def.name}: {note}</button>;
        })}
        <button type="button" onClick={() => onPlay(null)}>No spell</button>
      </div>
    </div>
  );
}

function duelCard(card: import('../engine').CardView | null) {
  return card ? <Card def={card.def} injury={card.injury} /> : <div className="card empty">Empty spot</div>;
}

function AnnouncementView({ a, opp, onClose }: { a: Announcement; opp: OpponentWords; onClose: () => void }) {
  return (
    <div className={`announcement tone-${a.tone}`} role="dialog">
      <div className="announcement-card" onClick={onClose}>
        <h3>{a.title}</h3>
        {a.contest ? (
          <div className="duel">
            <div>{duelCard(a.contest.theirs.card)}<span className="value">{a.contest.theirs.total}</span><span className="who">{opp.Name}</span></div>
            <div className="vs">vs</div>
            <div>{duelCard(a.contest.mine.card)}<span className="value">{a.contest.mine.total}</span><span className="who">You</span></div>
          </div>
        ) : null}
        <p>{a.text}</p>
        <span className="tap">Tap to continue</span>
      </div>
    </div>
  );
}
