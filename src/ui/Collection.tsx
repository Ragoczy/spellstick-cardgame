// Your cards and saved teams (online build only). Everyone starts with the starter set and a
// ready-made team. A saved team is a name, a spell set, and 24 of your player cards; choose one
// when you challenge someone with "Your saved team". The server checks everything again.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { prototypeCards } from '../data/prototype';
import { spellSets, TEAM_NAME_MAX, teamProblems } from '../data/teams';
import { makeConfig, type CardDef, type PlayerCardDef } from '../engine';
import type { Collection, OwnedCard, SavedTeam } from '../shared/collectionApi';
import { CardFace } from './CardFace';
import { deleteTeam, fetchCollection, saveTeam } from './online';

const config = makeConfig();
const sets = spellSets(prototypeCards, config);
const defs = new Map<string, CardDef>(prototypeCards.cards.map((c) => [c.id, c]));
const defOf = (card: OwnedCard) => defs.get(card.cardId) as PlayerCardDef | undefined;
const spellSetName = (id: string) => sets.find((s) => s.id === id)?.name ?? 'Unknown spells';

/** Goalies first, then by type, then by name. */
const ROLE_ORDER = ['goalie', 'runner', 'striker', 'playmaker', 'allrounder', 'anchor', 'stopper'];
function byKind(a: OwnedCard, b: OwnedCard): number {
  const [x, y] = [defOf(a), defOf(b)];
  const rank = (d?: PlayerCardDef) => ROLE_ORDER.indexOf(d?.role ?? (d?.kind === 'goalie' ? 'goalie' : 'allrounder'));
  return rank(x) - rank(y) || (x?.name ?? '').localeCompare(y?.name ?? '') || a.serial - b.serial;
}

/** "3 wins, 1 loss, 1 draw", or "No matches yet". */
export function recordText(record: SavedTeam['record']): string {
  const { won, lost, drawn } = record;
  if (won + lost + drawn === 0) return 'No matches yet';
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [part(won, 'win', 'wins'), part(lost, 'loss', 'losses'), ...(drawn ? [part(drawn, 'draw', 'draws')] : [])].join(', ');
}

/** "Neutral Boost, Earth Shield, Flambé ×2, …" */
function spellList(setId: string): string {
  const counts = new Map<string, number>();
  for (const id of sets.find((s) => s.id === setId)?.spellIds ?? []) {
    const name = defs.get(id)?.name ?? id;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(', ');
}

/** A card you own, with its serial number in the footer. */
function OwnedCardView({ card, dim, highlight, onClick }: { card: OwnedCard; dim?: boolean; highlight?: boolean; onClick?: () => void }) {
  const def = defOf(card);
  if (!def) return null;
  return (
    <div className="owned-card" title="Copies are numbered in the order they were given out">
      <CardFace def={def} serial={card.serial} dim={dim} highlight={highlight ? 'target' : null} onClick={onClick} />
    </div>
  );
}

export function CollectionScreen({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<Collection | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<SavedTeam | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const reload = () => fetchCollection().then(setData).catch((err: Error) => setProblem(err.message));
  useEffect(() => {
    void reload();
  }, []);
  // Opening or closing the team editor starts at the top of the page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [editing]);

  const remove = async (id: number) => {
    setProblem(null);
    try {
      await deleteTeam(id);
    } catch (err) {
      setProblem((err as Error).message);
    }
    setConfirmDelete(null);
    await reload();
  };

  if (data && editing) {
    return (
      <TeamEditor
        team={editing === 'new' ? null : editing}
        cards={data.cards}
        onDone={async () => {
          setEditing(null);
          await reload();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  const cards = data ? [...data.cards].sort(byKind) : [];
  return (
    <div className="screen collection">
      <h2>Your cards and teams</h2>
      <p className="small">
        A saved team is 2 goalies and 22 field players from your cards, plus one set of 16 spells. To play with one,
        choose "Your saved team" when you challenge someone. Ranked matches are always drafts, so your cards never
        change your rating.
      </p>
      {problem ? <p className="account-problem">{problem}</p> : null}
      {!data ? <p className="small">Loading your cards…</p> : (
        <>
          <h3>Teams ({data.teams.length} of {data.maxTeams})</h3>
          <ul className="match-list">
            {data.teams.map((t) => (
              <li key={t.id} className="match-row">
                <span>
                  <strong>{t.name}</strong>. {spellSetName(t.spellSet)}. {recordText(t.record)}.
                  {t.problems.length ? <span className="team-problem"> Not ready: {t.problems[0]}</span> : null}
                </span>
                <span className="buttons">
                  {confirmDelete === t.id ? (
                    <>
                      <button type="button" className="danger" onClick={() => remove(t.id)}>Delete {t.name}</button>
                      <button type="button" onClick={() => setConfirmDelete(null)}>Keep it</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => setEditing(t)}>Edit</button>
                      <button type="button" className="quiet" onClick={() => setConfirmDelete(t.id)}>Delete</button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {data.teams.length === 0 ? <p className="small">No saved teams.</p> : null}
          <div className="buttons">
            <button type="button" className="primary" disabled={data.teams.length >= data.maxTeams} onClick={() => setEditing('new')}>New team</button>
          </div>

          <h3>Your cards ({data.cards.length})</h3>
          <p className="small">
            Everyone starts with the same {data.cards.length === 24 ? '24 ' : ''}cards. More ways to get cards come with
            tournaments and the store. The number under each card is that copy's number: copies are numbered in the order
            they were given out.
          </p>
          <div className="choice-row owned-cards">
            {cards.map((c) => <OwnedCardView key={c.instanceId} card={c} />)}
          </div>
        </>
      )}
      <div className="buttons">
        <button type="button" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}

/** Make a new team or change one: its name, its spells, and which of your cards play. */
function TeamEditor({ team, cards, onDone, onCancel }: {
  team: SavedTeam | null; cards: OwnedCard[]; onDone: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(team?.name ?? '');
  const [spellSet, setSpellSet] = useState(team?.spellSet ?? sets[0]?.id ?? '');
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(team?.cards ?? []));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const owned = useMemo(() => [...cards].sort(byKind), [cards]);
  const onTeam = owned.filter((c) => chosen.has(c.instanceId));
  const offTeam = owned.filter((c) => !chosen.has(c.instanceId));
  const cardIds = onTeam.map((c) => c.cardId);
  const goalies = onTeam.filter((c) => defOf(c)?.kind === 'goalie').length;
  const field = onTeam.length - goalies;
  const problems = teamProblems(prototypeCards, config, cardIds, spellSet);

  /** Why a card can't join the team right now (null if it can). */
  const cantAdd = (card: OwnedCard): string | null => {
    const def = defOf(card);
    if (!def) return 'Unknown card.';
    if (cardIds.includes(card.cardId)) return `${def.name} is already on the team.`;
    if (def.kind === 'goalie' && goalies >= config.deckGoalies) return `The team has its ${config.deckGoalies} goalies.`;
    if (def.kind === 'field' && field >= config.deckFieldPlayers) return `The team has its ${config.deckFieldPlayers} field players.`;
    return null;
  };

  const toggle = (card: OwnedCard) => {
    const next = new Set(chosen);
    if (next.has(card.instanceId)) next.delete(card.instanceId);
    else if (!cantAdd(card)) next.add(card.instanceId);
    setChosen(next);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setProblem(null);
    try {
      await saveTeam({ name, spellSet, cards: [...chosen] }, team?.id);
      onDone();
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="screen collection team-editor" onSubmit={submit}>
      <h2>{team ? `Edit ${team.name}` : 'New team'}</h2>
      {problem ? <p className="account-problem">{problem}</p> : null}
      <div className="options">
        <label>
          Team name
          <input className="text-input" value={name} maxLength={TEAM_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="Team name" />
        </label>
        <label>
          Spells
          <select value={spellSet} onChange={(e) => setSpellSet(e.target.value)}>
            {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <p className="small">{spellList(spellSet)}.</p>

      <p className={problems.length ? 'team-problem' : 'account-notice'}>
        {problems.length ? `You can save the team now, but it can't play until this is fixed: ${problems[0]}` : 'Ready to play.'}
      </p>

      <h3>On the team: {goalies} of {config.deckGoalies} goalies, {field} of {config.deckFieldPlayers} field players</h3>
      <p className="small">Tap a card to take it off the team.</p>
      <div className="choice-row owned-cards">
        {onTeam.length ? onTeam.map((c) => <OwnedCardView key={c.instanceId} card={c} onClick={() => toggle(c)} />) : <span className="small">Nobody yet.</span>}
      </div>

      <h3>Not on the team</h3>
      <p className="small">Tap a card to add it.</p>
      <div className="choice-row owned-cards">
        {offTeam.length ? offTeam.map((c) => {
          const reason = cantAdd(c);
          return <OwnedCardView key={c.instanceId} card={c} dim={Boolean(reason)} highlight={!reason} onClick={() => toggle(c)} />;
        }) : <span className="small">Every card you own is on this team.</span>}
      </div>

      <div className="buttons">
        <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save team'}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
