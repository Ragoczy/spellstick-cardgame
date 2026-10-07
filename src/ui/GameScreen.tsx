// The game screen. It shows the person's view and turns taps into legal actions. It never
// decides what is legal itself: everything clickable comes from the session's legal actions.

import { useMemo, useState } from 'react';
import { isFieldPos, opposite, samePos, type Action, type CardDef, type FieldPos, type InjuryDef, type PlayerView, type Pos, type Side, type SpellTarget } from '../engine';
import { Board } from './Board';
import { Card, CardBack, type CardProps } from './Card';
import { capitalize, injuryEffect, laneName, posName } from './labels';
import { LineupScreen } from './LineupScreen';
import { casterAffinity, dicePreview, matchup, reactionPreview } from './preview';
import { posKey, useGame, type Announcement } from './useGame';
import type { SessionOptions } from './session';

type Selection =
  | { kind: 'none' }
  | { kind: 'holder' }
  | { kind: 'cast'; card: string; caster?: Pos; first?: FieldPos }
  | { kind: 'substitute'; card: string }
  | { kind: 'regroup'; picked: string[] };

const NONE: Selection = { kind: 'none' };

export function GameScreen({ options, onQuit, autoplay = false }: { options: SessionOptions; onQuit: () => void; autoplay?: boolean }) {
  const game = useGame(options, autoplay);
  const { session } = game;
  const view = session.view;
  const legal = session.legal;
  const me = session.human;
  const them = session.computer;
  const teams = session.setup.teams!;
  const [selection, setSelection] = useState<Selection>(NONE);
  const [inspected, setInspected] = useState<{ def: CardDef; injury?: InjuryDef } | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [hintText, setHintText] = useState<string | null>(null);
  const pending = view.pending;
  const myDecision = session.waitingFor === 'human';

  const act = (action: Action) => {
    setSelection(NONE);
    setHintText(null);
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

  /** The spots on the board a spell target points at (hand targets are handled separately). */
  const targetPos = (t: SpellTarget, caster: Pos): { side: Side; pos: Pos }[] => {
    if (t.kind === 'opponent') return [{ side: them, pos: t.pos }];
    if (t.kind === 'pass') return [{ side: me, pos: t.to }];
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
      const hit = options.filter((a) => targetPos(a.target, a.caster).some((t) => t.side === side && samePos(t.pos, pos)));
      if (!hit.length) return;
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
    if (!myDecision) return;
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
    return <LineupScreen view={view} legal={legal} onPlace={(actions) => actions.forEach((a) => game.act(a))} onAuto={() => {
      while (session.view.pending.kind === 'placeLineup' && session.waitingFor === 'human') game.act(session.hint()!);
    }} />;
  }

  // ---- Prompts ----

  const prompt = (): React.ReactNode => {
    if (pending.kind === 'gameOver') {
      const r = view.result!;
      const headline = r.winner === null ? "It's a draw." : r.winner === me ? 'You win!' : 'The computer wins.';
      return (
        <div className="prompt">
          <strong>{headline}</strong> Final score: you {view.score[me]}, the computer {view.score[them]}
          {view.shootout ? ` (shootout ${view.shootout.goals[me]}–${view.shootout.goals[them]})` : ''}.
          <div className="buttons"><button type="button" className="primary" onClick={onQuit}>New game</button></div>
        </div>
      );
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
        return <ReactionPrompt view={view} onPlay={(uid) => act(legal.find((a) => a.type === 'react' && a.card === uid)!)} />;
      case 'callDice':
        return <DicePrompt view={view} onChoose={(roll) => act({ type: 'callDice', side: me, roll })} />;
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
    const h = session.hint();
    if (!h) return;
    const text = h.type === 'pass' ? `pass to your ${posName(h.to, view.lanes)}`
      : h.type === 'cast' ? `cast ${view.mine.hand.find((c) => c.uid === h.card)?.def.name}`
      : h.type === 'substitute' ? `substitute your ${posName(h.pos, view.lanes)}`
      : h.type === 'regroup' ? (h.discard.length ? 'regroup (swap out weak cards)' : 'pass this action')
      : h.type === 'callDice' ? (h.roll ? 'call for dice' : 'not roll')
      : h.type;
    setHintText(`The computer would ${text}.`);
  };

  /** "your Shot 5 vs their Save 3" (or "?" for a face-down player you haven't seen). */
  const versus = (m: ReturnType<typeof matchup>, mineLabel: string, theirsLabel: string) =>
    m ? ` (your ${mineLabel} ${m.mine} vs their ${theirsLabel} ${m.theirs ?? '?'})` : '';
  const shootLabel = myBall ? versus(matchup(view, { pos: myBall, stat: 'shot', use: 'shoot' }, { pos: { area: 'goal' }, stat: 'save', use: 'save' }), 'Shot', 'Save') : '';
  const tackleLabel = view.ball && view.ball.side === them && view.ball.pos.area !== 'goal'
    ? versus(matchup(view, { pos: opposite(view.ball.pos), stat: 'defense', use: 'tackle' }, { pos: view.ball.pos, stat: 'speed', use: 'evade' }), 'Defense', 'Speed')
    : '';

  function actionPrompt() {
    const left = view.actionsLeft;
    let help = 'Tap your ball carrier (glowing) to pass, or tap a card in your hand to play it.';
    if (!myBall) help = view.ball?.pos.area === 'goal' ? "Their goalie has the ball (goalies can't be tackled)." : 'The computer has the ball. You can tackle, or play a card.';
    if (selection.kind === 'holder') help = 'Tap a glowing teammate to pass to them. Tap anywhere else to cancel.';
    if (selection.kind === 'cast') {
      const def = view.mine.hand.find((c) => c.uid === selection.card)?.def;
      const effect = def?.kind === 'spell' ? def.ability.effect : '';
      const targetHelp = effect === 'hit' ? 'Now tap the opposing player in that spot to hit them.'
        : effect === 'mend' ? 'Now tap the injured player to mend, on the field or in your hand.'
        : 'Now choose the target.';
      help = !selection.caster
        ? `Choose who casts ${def?.name}. Green = affinity match (stronger), red = opposed (weaker).`
        : selection.first ? 'Now tap the second player to swap.' : targetHelp;
    }
    if (selection.kind === 'substitute') help = 'Tap the player (or empty spot) to fill. The new player comes in face down.';
    if (selection.kind === 'regroup') help = `Tap up to ${view.config.regroupMax} cards to discard, then confirm. You draw the same number.`;
    return (
      <div className="prompt">
        <strong>Your turn</strong> · {left} action{left === 1 ? '' : 's'} left. {help}
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
          <button type="button" className="quiet" onClick={hint}>Hint</button>
        </div>
        {hintText ? <div className="hint">{hintText}</div> : null}
      </div>
    );
  }

  const selectedKey = selection.kind === 'holder' && myBall ? posKey(me, myBall)
    : selection.kind === 'cast' && selection.caster ? posKey(me, selection.caster) : null;

  return (
    <div className="screen game">
      <header className="scorebar">
        <span className="score">You <b>{view.score[me]}</b> – <b>{view.score[them]}</b> Computer</span>
        <span className="meta">
          Turn {view.turn} · Decks {view.mine.deckCount} / {view.opponent.deckCount} · 🎲 Rolls {view.diceLeft[me]} / {view.diceLeft[them]}
          {view.endgame.finalTurnFor ? ' · Last turn!' : ''}
        </span>
        <button type="button" className="quiet" onClick={onQuit}>Quit</button>
      </header>

      <div className="opponent-hand">
        <span>Computer's hand</span>
        {Array.from({ length: view.opponent.handCount }, (_, i) => <CardBack key={i} team={teams[them]} />)}
      </div>

      <Board view={view} teams={teams} highlights={highlights} selectedKey={selectedKey} justRevealed={game.justRevealed} onSpot={onSpot} />

      {prompt()}

      <div className="hand">
        {view.mine.hand.map((c) => (
          <Card
            key={c.uid}
            def={c.def}
            injury={c.injury}
            showText
            selected={(selection.kind === 'cast' || selection.kind === 'substitute') && selection.card === c.uid || (selection.kind === 'regroup' && selection.picked.includes(c.uid))}
            highlight={myDecision && (handTargets.has(c.uid) || legal.some((a) => (a.type === 'react' || a.type === 'discard' || a.type === 'forcedSub') && a.card === c.uid)) ? 'target' : null}
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

      {game.announcement ? <AnnouncementView a={game.announcement} onClose={game.dismissAnnouncement} /> : null}
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
      time. It costs one of your rolls ({preview.rollsLeft} left this game); the computer's roll is free.
      <div className="buttons">
        <button type="button" className={!winning && chance >= 40 ? 'primary' : ''} onClick={() => onChoose(true)}>🎲 Call for dice ({chance}%)</button>
        <button type="button" onClick={() => onChoose(false)}>No dice</button>
      </div>
    </div>
  );
}

function ReactionPrompt({ view, onPlay }: { view: PlayerView; onPlay: (uid: string | null) => void }) {
  const preview = reactionPreview(view);
  if (!preview) return null;
  const winning = preview.mine > preview.theirs || (preview.mine === preview.theirs && preview.iWinTies);
  const status = `Right now it's ${preview.mine}–${preview.theirs}: you'd ${winning ? 'win' : 'lose'}${preview.mine === preview.theirs ? ' (tie)' : ''}.`;
  return (
    <div className="prompt">
      <strong>Contest!</strong> {status} Play a reaction spell?{preview.theyCanAnswer ? ' (The computer can answer with its own spell.)' : ''}
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

function AnnouncementView({ a, onClose }: { a: Announcement; onClose: () => void }) {
  return (
    <div className={`announcement tone-${a.tone}`} onClick={onClose} role="dialog">
      <div className="announcement-card">
        <h3>{a.title}</h3>
        {a.contest ? (
          <div className="duel">
            <div>{duelCard(a.contest.theirs.card)}<span className="value">{a.contest.theirs.total}</span><span className="who">Computer</span></div>
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
