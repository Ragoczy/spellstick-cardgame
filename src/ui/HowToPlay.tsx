// A short, player-facing version of docs/RULES.md (v0.17). If the rules change, update this too.

import type { Reporter } from './report';
import { ReportProblem } from './ReportProblem';

/** reporter: the signed-in player, for "Report a problem" (null when signed out). */
export function HowToPlay({ onBack, reporter }: { onBack: () => void; reporter: Reporter | null }) {
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
        <li><b>Field players</b> have Speed (catching passes, dodging tackles), Shot (scoring), Defense (intercepting, tackling), Faceoff, and <b>Toughness</b> (how hard they are to hurt when knocked down).</li>
        <li><b>Goalies</b> have Save.</li>
        <li>Players have 1–3 <b>Resonants</b>, feelings or sensations like Anger or Vigor. Each has an <b>Affinity</b>, the kind of magic it's good at (the colored dots): a whole family like Fire, or one specialty in a family, like Glamour in Illusion.</li>
        <li><b>Spells</b> have a kind of magic too. Cast by a player with an Affinity in the spell's family, number effects get +1. If the Affinity is exactly the spell's specialty, they get +2.</li>
        <li>A named player's <b>cost</b> is the number in the top left corner. A team you build online can cost at most the team cap, so nobody can field all the stars.</li>
        <li>Casting is tiring. A player on the field can cast <b>one spell per Resonant</b> (each cast empties a dot). Then they need a rest: substitute them out to your hand, and they come back fresh.</li>
      </ul>

      <h3>Your turn</h3>
      <ol>
        <li>Draw a card: choose a <b>player</b> or a <b>spell</b> (your deck is two piles). If your hand is already full (7 cards), you don't draw: the top card of the pile you choose goes to your discard pile instead.
          <br />Or, instead of drawing, <b>substitute</b>: bring a player on from your hand, face down. The player you take off goes back to your hand to rest. The new player can't pass, shoot, tackle, or cast until your next turn.</li>
        <li>Take <b>one action</b>.</li>
        <li>If you have more than 7 cards, discard down to 7.</li>
      </ol>

      <h3>Actions</h3>
      <ul>
        <li><b>Pass:</b> to a teammate in the same row, one row forward, or any row back. Receiver's Speed <b>+2</b> against the opponent's Defense. Ties are caught; otherwise it's intercepted. Most passes get through.
          <br /><b>Catch and shoot:</b> a forward who catches a pass can't be tackled until your next turn, so they get their chance to shoot.
          <br /><b>Goalie clears:</b> when your goalie has the ball, your action must be a pass out to a defender. No sitting on the ball.</li>
        <li><b>Shoot:</b> a forward with the ball. Shot against the goalie's Save. Ties go to the goalie. Goalies are tough: about 1 shot in 3 goes in, more with a good shooter or a spell.</li>
        <li><b>Tackle:</b> your player facing their ball carrier. Your Defense against their Speed. Ties go to the ball carrier. Goalies can't be tackled.</li>
        <li><b>Physical attack:</b> one of your players without the ball takes a cheap shot at the opposing player in their spot. See below.</li>
        <li><b>Cast</b> an action spell, choosing which of your players casts it (they're revealed).</li>
        <li><b>Regroup:</b> discard 1 card and draw a new one of the same kind (or do nothing).</li>
      </ul>

      <h3>Contests</h3>
      <p>
        Both players are revealed. Before the dice, either side may declare a <b>foul</b> (a dirty play, see below).
        Then <b>both roll a die</b> and add it, and either side may spend a <b>reroll</b> (see below). Then the
        attacker may play one <b>reaction spell</b>, and the defender may answer with one. Highest value wins.
      </p>

      <h3>Playing spells</h3>
      <p>Every spell card says when it's played. Spells you can play right now glow; the others are faded.</p>
      <ul>
        <li><b>Action spells</b> (<i>Play on your turn</i>) are your action for the turn. Tap the spell, then the player who casts it (green = affinity match, stronger), then the target if it has one.</li>
        <li><b>Reaction spells</b> (<i>Play during a contest</i>) can't be played on your own. When a contest starts, you'll be asked whether to play one. Your player in that contest casts it.</li>
        <li>Casting turns the caster face up, and uses up one of their Resonants until they're substituted out to rest.</li>
        <li>Tap a faded spell to see why it can't be played yet.</li>
      </ul>

      <h3>Dice</h3>
      <p>
        <b>Every contest is rolled</b>: both players roll a die and add it, so a better player usually wins, but not
        always. You have <b>3 rerolls</b> a game. Rolled badly in a contest that matters? Spend one to reroll your own
        die. The attacker gets the first chance, then the defender, and both can see the dice before playing spells.
      </p>

      <h3>Getting hurt</h3>
      <p>Spellstick is rough. Field players get hurt four ways (goalies never do):</p>
      <ul>
        <li><b>Knocked down:</b> a player who loses the ball to a tackle rolls a die. At or under their Toughness, they're fine. Over it, they're hurt.</li>
        <li><b>Hit:</b> a hit spell attacks the opposing player in your caster's spot, the spell's strength against their Defense. If it lands, they're hurt.</li>
        <li><b>Dirty play:</b> a reaction spell you declare <b>before the dice</b>. If your side wins, the player you beat is hurt. But if the two dice match, the referee saw it, and your player is <b>sent off</b> for the game, with nobody to replace them until you substitute.</li>
        <li><b>A bad miss:</b> a tackler who loses by 3 or more is Shaken.</li>
      </ul>
      <p>A hurt player's owner rolls a die to see how bad it is:</p>
      <ul>
        <li><b>1–3, Shaken:</b> the card turns sideways. They can't pass, shoot, tackle, or cast, and get −2 in contests, until the end of their team's next turn.</li>
        <li><b>4–5, Injured:</b> they get a face-up <b>injury card</b> that lowers a stat (for example, Singed hair: −1 Speed).</li>
        <li><b>6, Knocked out:</b> they leave the field. At each faceoff, roll for them: on 4–6 they're back in your hand.</li>
      </ul>
      <ul>
        <li>When a player is injured or knocked out and you have a player in hand, you must bring one on straight away, face down. It's free, but the new player comes on <b>Shaken</b>. An injured player goes to your hand.</li>
        <li>No one to bring on? An injured player keeps playing, hurt.</li>
        <li>Injured again? They're <b>carried off</b>. If nobody replaces them, the spot is empty and counts as 0.</li>
        <li><b>Mend</b> heals one of your players, or brings a knocked-out player back to your hand. A <b>Ward</b> makes a hurt only Shaken.</li>
      </ul>

      <h3>Physical attacks and the penalty box</h3>
      <p>
        Each team has a face-down <b>Physical pile</b> of 16 cheap shots (Tripping, Slashing, Kneecap, and more) and can
        make <b>8 physical attacks</b> a game. Choose your attacker and the opposing player in their spot, then flip the
        top card: the player decides the move in the moment. It's your Speed (or Defense, for a Muscle card) against their
        Speed, with the card's bonus. If you win, they drop the ball (if they have it) and are knocked down, often with the card making
        it worse.
      </p>
      <p>
        The referee is watching. Your team's <b>penalty risk</b> starts at 1. If your die in the attack shows the risk
        or lower, roll the penalty die too: if that also shows the risk or lower, it's a <b>penalty</b>. Your player
        sits in the box for 1 to 3 turns, and nobody can take their spot. The risk goes up by 1 with each attack you
        make, and down by 1 each turn you don't. If the other team scores while you're in the box, your players come
        straight back.
      </p>

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
        haven't shot yet (penalty shots get +3), three each, then one each until someone misses. If a team runs out of shooters, it's a draw.
      </p>

      <h3>Something wrong?</h3>
      <p>Found a bug, or a problem with another player? Let us know.</p>
      <ReportProblem reporter={reporter} />
      <button type="button" className="primary" onClick={onBack}>Got it</button>
    </div>
  );
}
