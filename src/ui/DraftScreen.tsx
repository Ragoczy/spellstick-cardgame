// The draft (RULES.md "Draft"): both teams take turns picking players from a face-up pool.
// What can be picked comes from the legal actions; this screen decides nothing itself.

import type { Action, CardView, PlayerView } from '../engine';
import { Card } from './Card';
import type { OpponentWords } from './text';

type Pick = Extract<Action, { type: 'draftPick' }>;

export function DraftScreen({ view, legal, myDecision, opp, sending, onPick, onPickForMe }: {
  view: PlayerView;
  legal: Action[];
  myDecision: boolean;
  opp: OpponentWords;
  sending: boolean;
  onPick: (action: Action) => void;
  /** Practice games only: let the computer pick for you. */
  onPickForMe?: () => void;
}) {
  const draft = view.draft!;
  const them = view.me === 'A' ? 'B' : 'A';
  const picks = legal.filter((a): a is Pick => a.type === 'draftPick');
  const pickFor = (uid: string) => picks.find((a) => a.card === uid);
  const mine = draft.picks[view.me];
  const theirs = draft.picks[them];
  const goalies = draft.pool.filter((c) => c.def.kind === 'goalie');
  const field = draft.pool.filter((c) => c.def.kind === 'field');
  // Goalies are only in the draft if the rules settings put them in the pool (off by default).
  const goaliesInDraft = [...draft.pool, ...mine, ...theirs].some((c) => c.def.kind === 'goalie');

  const status = sending
    ? 'Sending your pick…'
    : myDecision
      ? `Your pick: ${mine.length + 1} of ${draft.picksEach}. Tap a player to add them to your team.`
      : `Waiting for ${opp.name} to pick (${theirs.length} of ${draft.picksEach} so far).`;

  const poolCard = (c: CardView) => {
    const pick = myDecision ? pickFor(c.uid) : undefined;
    return (
      <Card
        key={c.uid}
        def={c.def}
        showText
        highlight={pick ? 'target' : null}
        dim={myDecision && !pick}
        onClick={() => (pick ? onPick(pick) : undefined)}
      />
    );
  };

  return (
    <div className="screen setup draft">
      <h2>Draft your players</h2>
      <p>
        Take turns picking players from the pool, {draft.picksEach} each. Picks are face up, so both teams know them.
        After the draft, each team gets the rest of its players at random from everyone nobody picked, and
        keeps its own spells. {goaliesInDraft
          ? `A team can have at most ${view.config.deckGoalies} goalies.`
          : `Goalies aren't drafted: each team gets its ${view.config.deckGoalies} at random.`}
      </p>
      <p className={myDecision ? 'draft-status mine' : 'draft-status'}>
        <strong>{status}</strong>
        {myDecision && onPickForMe ? <button type="button" className="quiet" onClick={onPickForMe}>Pick for me</button> : null}
      </p>

      {goaliesInDraft ? (
        <>
          <h3>Goalies in the pool</h3>
          <div className="choice-row draft-pool">{goalies.length ? goalies.map(poolCard) : <span className="small">None left.</span>}</div>
        </>
      ) : null}
      <h3>Players in the pool</h3>
      <div className="choice-row draft-pool">{field.map(poolCard)}</div>

      <div className="draft-teams">
        <section>
          <h3>Your picks ({mine.length} of {draft.picksEach})</h3>
          <div className="choice-row">{mine.length ? mine.map((c) => <Card key={c.uid} def={c.def} />) : <span className="small">None yet.</span>}</div>
        </section>
        <section>
          <h3>{opp.Owner} picks ({theirs.length} of {draft.picksEach})</h3>
          <div className="choice-row">{theirs.length ? theirs.map((c) => <Card key={c.uid} def={c.def} />) : <span className="small">None yet.</span>}</div>
        </section>
      </div>
    </div>
  );
}
