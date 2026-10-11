// The words shown for an online match that ended by resignation or forfeit. The game screen
// shows them even when the match ended during setup (draft, goalie, or lineup), since resigning
// leaves the game itself on that setup step.

import { describe, expect, it } from 'vitest';
import { endedEarlyText } from '../src/ui/labels';

describe('match ended early', () => {
  it('says who resigned, with the rating change for ranked matches', () => {
    expect(endedEarlyText({ outcome: 'won', reason: 'resigned', ratingChange: 12 }, 'Bob Wands'))
      .toEqual({ headline: 'Bob Wands resigned. You win!', rating: 'Rating +12.' });
    expect(endedEarlyText({ outcome: 'lost', reason: 'resigned', ratingChange: -9 }, 'Bob Wands'))
      .toEqual({ headline: 'You resigned.', rating: 'Rating −9.' });
  });

  it('explains a forfeit, with no rating text for unranked matches', () => {
    expect(endedEarlyText({ outcome: 'won', reason: 'forfeit', ratingChange: null }, 'Bob Wands'))
      .toEqual({ headline: 'Bob Wands ran out of time without making a move. You win by forfeit.', rating: '' });
    expect(endedEarlyText({ outcome: 'lost', reason: 'forfeit', ratingChange: null }, 'Bob Wands')?.headline)
      .toBe('Your time ran out before you made a move, so the match was forfeited.');
  });

  it('is null for matches that are still going or were played to the end', () => {
    expect(endedEarlyText(null, 'Bob Wands')).toBeNull();
    expect(endedEarlyText({ outcome: 'won', reason: 'played', ratingChange: 5 }, 'Bob Wands')).toBeNull();
  });
});
