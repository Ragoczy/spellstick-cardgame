// A player-facing list of planned features that aren't built yet. Sources: docs/ROADMAP.md and
// docs/spellstick-multiplayer-design.md. When a feature ships, remove it from this list.

export function FutureFeatures({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen rules">
      <button type="button" className="quiet" onClick={onBack}>← Back</button>
      <h2>Future features</h2>
      <p>
        This is a prototype. Here's what's planned but not built yet. Plans can change as we learn from playtests.
      </p>

      <h3>Coming to this game</h3>
      <ul>
        <li><b>Two players at one screen:</b> pass the device between turns, with hands and lineups hidden.</li>
        <li><b>Real teams and art:</b> in-world team names, colors, card names, flavor text, and final card art in place of the placeholders.</li>
        <li><b>A canon player:</b> the one book character who plays spellstick, as a special card.</li>
      </ul>

      <h3>The printed card game</h3>
      <ul>
        <li><b>A small boxed set:</b> two team decks, a folding field mat, a ball token, a score tracker, and a one-sheet rulebook.</li>
        <li><b>Collectible extras:</b> signed or numbered cards and exclusive promo cards.</li>
        <li><b>Center-lane add-on:</b> extra players and a three-lane mat (you can already try three lanes here).</li>
      </ul>

      <h3>Online play</h3>
      <ul>
        <li><b>Play other readers:</b> sign in with Discord and play live, or one move at a time over a few days.</li>
        <li><b>Time banks:</b> each player gets a set amount of thinking time per match, like a chess clock, so games keep moving.</li>
        <li><b>Draft matches:</b> both players pick 10 cards from the same face-up pool, and the rest of each deck is dealt at random.</li>
        <li><b>Your own collection:</b> a free starter deck for everyone, then build and save your own teams, with records and season stats.</li>
        <li><b>Tournaments:</b> automatic pairings, standings, and a final bracket, with alerts from a Discord bot.</li>
        <li><b>Award cards:</b> numbered cards for tournament champions and finalists, achievements, and book launches. Earned, never bought.</li>
        <li><b>Card store:</b> spend your Discord coins on packs, single cards, and cosmetics like crests and card backs. Earn coins by playing.</li>
        <li><b>Trading:</b> safe card-for-card trades where both sides swap at the same moment.</li>
      </ul>

      <h3>Maybe later</h3>
      <ul>
        <li>Card rarity, and tournaments with a cap on how many rare cards a team can use.</li>
        <li>Group drafts for 4 to 8 players, passing packs around the table.</li>
        <li>A ranked ladder outside tournaments.</li>
        <li>Patron perks.</li>
      </ul>
      <button type="button" className="primary" onClick={onBack}>Back to start</button>
    </div>
  );
}
