// An online match as the game screen sees it. The game server is the referee: this side only
// shows the player's view (sent by the server), sends their moves one at a time, and fetches
// the latest when the other player has moved. Nothing here decides what is legal.

import { heuristicAgent } from '../ai/heuristic';
import { otherSide, type Action, type GameEvent, type PlayerView, type Side } from '../engine';
import type { MatchDetail, MatchSummary } from '../shared/matchApi';
import type { Seat } from './seat';

/** The match moved on before a move arrived (a double click, or another tab). */
export class StaleMatchError extends Error {}

/** The server calls a match needs. src/ui/online.ts has the real ones; tests use fakes. */
export interface MatchApi {
  get(id: number, since?: number): Promise<MatchDetail>;
  move(id: number, action: Action, seen: number): Promise<MatchDetail>;
  resign(id: number): Promise<MatchSummary>;
  /** Tells the server about something that shouldn't happen (for the beta). Best effort. */
  report?(id: number, kind: 'refused-move' | 'missing-events', detail: string): Promise<void>;
}

/** The server said no, with this HTTP status. */
export class ServerError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** One player's seat in an online match, from the server's latest answer. */
export class OnlineSeat implements Seat {
  constructor(readonly detail: MatchDetail) {
    if (!detail.game) throw new Error("This match hasn't started yet.");
  }

  get human(): Side {
    return this.detail.match.side;
  }

  get opponent(): Side {
    return otherSide(this.human);
  }

  get teams(): Record<Side, string> {
    const m = this.detail.match;
    return m.side === 'A' ? { A: m.team, B: m.opponentTeam } : { A: m.opponentTeam, B: m.team };
  }

  get view(): PlayerView {
    return this.detail.game!.view;
  }

  get legal(): Action[] {
    return this.detail.game!.legal;
  }

  get waitingFor(): 'human' | 'opponent' | 'over' {
    const pending = this.view.pending;
    if (this.detail.match.status !== 'active' || pending.kind === 'gameOver') return 'over';
    return pending.side === this.human ? 'human' : 'opponent';
  }

  hint(): Action | null {
    const legal = this.legal;
    if (!legal.length) return null;
    return heuristicAgent(this.detail.match.moveCount + 7, this.view.config).chooseAction(this.view, legal);
  }
}

export interface MatchListener {
  /** The match changed. events: the new events, in order, as this player may see them. */
  onUpdate(detail: MatchDetail, events: GameEvent[]): void;
  /** True while a move is on its way. */
  onSending(sending: boolean): void;
  /** A problem to show the player, or null to clear it. */
  onProblem(message: string | null): void;
}

type Job = { kind: 'move'; action: Action } | { kind: 'autoPlace' } | { kind: 'refresh' } | { kind: 'resign' };

/**
 * Sends moves and fetches updates, strictly one request at a time, so each move goes out with
 * the right move count. If a move is refused, any moves queued behind it are dropped (they were
 * chosen from a view that's now out of date) and the latest is fetched.
 */
export class OnlineMatchClient {
  private current: MatchDetail;
  private currentSeat: OnlineSeat;
  private jobs: Job[] = [];
  /** The job being worked on, if any. */
  private working: Job | null = null;

  constructor(private readonly api: MatchApi, initial: MatchDetail, private readonly listener: MatchListener) {
    this.current = initial;
    this.currentSeat = new OnlineSeat(initial);
  }

  get detail(): MatchDetail {
    return this.current;
  }

  get seat(): OnlineSeat {
    return this.currentSeat;
  }

  private get id(): number {
    return this.current.match.id;
  }

  act(action: Action): void {
    this.enqueue({ kind: 'move', action });
  }

  /** Places the rest of the lineup the way the computer would, one spot at a time. */
  autoPlace(): void {
    this.enqueue({ kind: 'autoPlace' });
  }

  /** Fetches the latest (when the other player may have moved). Skipped if a check is already under way. */
  refresh(): void {
    if (this.working?.kind === 'refresh' || this.jobs.some((j) => j.kind === 'refresh')) return;
    this.enqueue({ kind: 'refresh' });
  }

  resign(): void {
    this.enqueue({ kind: 'resign' });
  }

  /** Resolves when everything queued so far is done (for tests). */
  async idle(): Promise<void> {
    while (this.working || this.jobs.length) await new Promise((r) => setTimeout(r, 1));
  }

  private enqueue(job: Job): void {
    this.jobs.push(job);
    void this.run();
  }

  private async run(): Promise<void> {
    if (this.working) return;
    try {
      while (this.jobs.length) {
        const job = this.jobs.shift()!;
        this.working = job;
        const sending = job.kind === 'move' || job.kind === 'autoPlace';
        if (sending) this.listener.onSending(true);
        try {
          await this.runJob(job);
        } catch (err) {
          // Moves queued behind a refused one were chosen from an out-of-date view.
          this.jobs = this.jobs.filter((j) => j.kind !== 'move' && j.kind !== 'autoPlace');
          // Every move sent was one the server offered, so a flat refusal means the two disagree.
          if (sending && err instanceof ServerError && err.status === 400) {
            const what = job.kind === 'move' ? job.action.type : 'automatic lineup placement';
            this.report('refused-move', `The server refused a ${what} it had offered, at move ${this.current.match.moveCount}: ${err.message}`);
          }
          if (!(err instanceof StaleMatchError)) this.listener.onProblem((err as Error).message);
          await this.fetchLatest().catch(() => {});
        } finally {
          if (sending) this.listener.onSending(false);
        }
      }
    } finally {
      this.working = null;
    }
  }

  private async runJob(job: Job): Promise<void> {
    switch (job.kind) {
      case 'move':
        this.accept(await this.api.move(this.id, job.action, this.current.match.moveCount));
        this.listener.onProblem(null);
        return;
      case 'autoPlace':
        while (this.currentSeat.waitingFor === 'human' && this.currentSeat.view.pending.kind === 'placeLineup') {
          this.accept(await this.api.move(this.id, this.currentSeat.hint()!, this.current.match.moveCount));
        }
        return;
      case 'refresh':
        await this.fetchLatest();
        return;
      case 'resign':
        await this.api.resign(this.id);
        await this.fetchLatest();
        return;
    }
  }

  private report(kind: 'refused-move' | 'missing-events', detail: string): void {
    this.api.report?.(this.id, kind, detail).catch(() => {});
  }

  private async fetchLatest(): Promise<void> {
    this.accept(await this.api.get(this.id, this.current.match.moveCount));
  }

  /** Takes a newer answer from the server and passes on just the events not seen before. */
  private accept(next: MatchDetail): void {
    if (!next.game) return;
    const before = this.current.match;
    if (next.match.moveCount === before.moveCount && next.match.status === before.status) return;
    const fresh = next.game.events.filter((m) => m.seq > before.moveCount);
    // Each move from the last one seen up to the newest should be there, once, in order.
    const expected = Array.from({ length: Math.max(0, next.match.moveCount - before.moveCount) }, (_, i) => before.moveCount + 1 + i);
    if (fresh.map((m) => m.seq).join(',') !== expected.join(',')) {
      this.report('missing-events', `Expected the events of moves ${expected[0] ?? '-'} to ${expected.at(-1) ?? '-'}, got ${fresh.map((m) => m.seq).join(', ') || 'none'}.`);
    }
    const events = fresh.flatMap((m) => m.events);
    this.current = next;
    this.currentSeat = new OnlineSeat(next);
    this.listener.onUpdate(next, events);
  }
}
