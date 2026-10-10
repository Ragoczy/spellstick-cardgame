// A short, player-facing version of docs/RULES.md (v0.10). If the rules change, update this too.

export function HowToPlay({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen rules">
      <button type="button" className="quiet" onClick={onBack}>← Back</button>
      <h2>How to play</h2>

      <h3>The idea</h3>
      <p>
        Each team lines up its players <b>face down</b>: forwards, midfielders, defenders, and a goalie.
        Your forwards face their defenders, and your defenders face their forwards. Pass the ball up the
        field and shoot past their goalie. Every time the ball arrives somewhere, the two players there
        are turned face up and <b>contest</b> it. So where you hide your best players matters.
      </p>

      <h3>Cards</h3>
      <ul>
        <li><b>Field players</b> have Speed (catching passes, dodging tackles), Shot (scoring), Defense (intercepting, tackling), and Faceoff.</li>
        <li><b>Goalies</b> have Save.</li>
        <li>Players have 1–3 <b>Resonants</b>, emotions like Anger, each with an elemental <b>Affinity</b> (the colored dots).</li>
        <li><b>Spells</b> have an element. Cast by a player whose Affinity matches, number effects get +1. Cast by a player with the opposite element (fire–water, earth–air), they get −1, and other effects fail.</li>
        <li>Casting is tiring. A player on the field can cast <b>one spell per Resonant</b> (each cast empties a dot). Then they need a rest: substitute them out to your hand, and they come back fresh.</li>
      </ul>

      <h3>Your turn</h3>
      <ol>
        <li>Draw a card: choose a <b>player</b> or a <b>spell</b> (your deck is two piles). If your hand is already full (7 cards), you don't draw: the top card of the pile you choose goes to your discard pile instead.</li>
        <li>Take <b>one action</b>.</li>
        <li>If you have more than 7 cards, discard down to 7.</li>
      </ol>

      <h3>Actions</h3>
      <ul>
        <li><b>Pass:</b> to a teammate in the same row, one row forward, or any row back. Receiver's Speed <b>+2</b> against the opponent's Defense. Ties are caught; otherwise it's intercepted. Most passes get through.</li>
        <li><b>Shoot:</b> a forward with the ball. Shot against the goalie's Save, and <b>every shot is rolled</b>: you and the goalie each roll a die and add it. Ties go to the goalie. Goalies are tough: about 2 shots in 5 go in, more with a good shooter or a spell.</li>
        <li><b>Tackle:</b> your player facing their ball carrier. Your Defense against their Speed. Ties go to the ball carrier. Goalies can't be tackled.</li>
        <li><b>Cast</b> an action spell, choosing which of your players casts it (they're revealed).</li>
        <li><b>Substitute</b> a player from your hand, face down. The player you take off goes back to your hand to rest.</li>
        <li><b>Regroup:</b> discard 1 card and draw a new one of the same kind (or do nothing).</li>
      </ul>

      <h3>Contests</h3>
      <p>
        Both players are revealed. Either side may <b>call for dice</b> (see below). Then the attacker may play one
        <b> reaction spell</b>, and the defender may answer with one. Highest value wins.
      </p>

      <h3>Dice</h3>
      <p>
        You have <b>5 rolls</b> a game. Losing a contest that matters? Spend one to call for dice: you <i>both</i> roll a
        die and add it, but only you use up a roll. The attacker gets the first chance to call, then the defender.
        (Shots and penalties are always rolled, so you don't spend rolls on them.)
      </p>

      <h3>Hits and injuries</h3>
      <p>
        Spellstick is rough. A <b>hit</b> spell attacks the opposing player in your caster's spot: the spell's
        strength against their Defense. A <b>dirty play</b> is a reaction spell: if your side wins the contest, the
        player you beat is injured. Hitting the goalie isn't allowed: goalies can't be injured.
      </p>
      <ul>
        <li>An injured player gets a face-up <b>injury card</b> that lowers a stat (for example, Singed hair: −1 Speed).</li>
        <li>If you have a player in hand, you must bring them on straight away, face down. It's free. The injured player goes to your hand.</li>
        <li>No one to bring on? The injured player keeps playing, hurt.</li>
        <li>Injured again? They're <b>carried off</b>. If nobody replaces them, the spot is empty and counts as 0.</li>
        <li><b>Mend</b> heals one of your players, on the field or in your hand.</li>
      </ul>

      <h3>Faceoffs and goals</h3>
      <p>
        The game starts with a faceoff, and there's another after each goal: the team that was scored on picks a
        lane, and the two midfielders compare Faceoff (the chooser wins ties).
      </p>

      <h3>Winning</h3>
      <p>
        The decks are the game clock. When a player has no cards left in either pile, they finish that turn, the other player takes one
        last turn, and it's <b>full time</b>: more goals wins. A team that reaches 3 goals wins straight away.
        If it's tied at full time, there's a <b>penalty shootout</b>: teams take turns shooting with players who
        haven't shot yet (penalty shots get +3, and are rolled), three each, then one each until someone misses. If a team runs out of shooters, it's a draw.
      </p>
      <button type="button" className="primary" onClick={onBack}>Got it</button>
    </div>
  );
}
