"""Generate placeholder prototype decks for Spellstick.

Everything here is a placeholder: names, elements, and numbers exist only so the engine and
simulator have something to run. Real rosters come in milestone M5.

Usage: python3 scripts/generate_prototype_cards.py > data/cards.prototype.json
"""
import json
import random

ELEMENTS = ["fire", "water", "earth", "air"]  # placeholders until canon is set
OPPOSED = [["fire", "water"], ["earth", "air"]]

# Resonants are emotions or experiences. Anger, Love, and Pain are Paul's canon examples
# (Anger goes with fire). Which element Love and Pain go with, and "Joy" for air, are
# placeholders until the canon list exists.
RESONANT_NAMES = {"fire": "Anger", "water": "Love", "earth": "Pain", "air": "Joy"}

# Field player archetypes: (label, speed, shot, defense, faceoff).
# Speed + shot + defense totals 10; faceoff is separate.
ARCHETYPES = {
    "runner":    (5, 3, 2, 4),
    "striker":   (3, 5, 2, 2),
    "stopper":   (2, 2, 6, 2),
    "anchor":    (3, 2, 5, 3),
    "playmaker": (4, 3, 3, 5),
    "allround":  (3, 4, 3, 3),
}

# Per-team archetype mix (22 field players) and element weighting.
TEAMS = {
    "A": {
        "name": "Placeholder Team A", "color": "#B5462E",
        "mix": {"runner": 5, "striker": 5, "playmaker": 4, "allround": 3, "anchor": 3, "stopper": 2},
        "elements": ["fire", "fire", "air", "air", "earth", "water"],
    },
    "B": {
        "name": "Placeholder Team B", "color": "#2E6FB5",
        "mix": {"stopper": 5, "anchor": 5, "allround": 4, "playmaker": 3, "runner": 3, "striker": 2},
        "elements": ["water", "water", "earth", "earth", "fire", "air"],
    },
}

# Share of field players who get a second Resonant.
SECOND_RESONANT_CHANCE = 0.3

# Abilities given to some players. Players with an ability lose 1 point from their highest stat.
ABILITIES = [
    ({"effect": "bonus", "params": {"stat": "defense", "amount": 2, "when": "intercept"}},
     "+2 Defense when intercepting."),
    ({"effect": "bonus", "params": {"stat": "shot", "amount": 1, "row": "forward"}},
     "+1 Shot while playing forward."),
    ({"effect": "bonus", "params": {"stat": "faceoff", "amount": 2, "when": "faceoff"}},
     "+2 Faceoff."),
    ({"effect": "draw_on_win", "params": {"count": 1}},
     "When this player wins a contest, draw 1 card."),
]

# Spells shared by both teams: (effect, spellType, params, copies-by-element, rules text)
SPELLS = [
    ("boost",     "reaction", {"amount": 2},  [None], "+2 to your side in this contest."),
    ("shield",    "reaction", {},             ["earth", "water"], "The opposing player's stat counts as 0 in this contest."),
    ("scry",      "action",   {},             ["water", "air"], "Look at one of your opponent's face-down cards."),
    ("long_pass", "action",   {},             ["air", "air"], "Pass, skipping one row forward."),
    ("long_shot", "action",   {"penalty": 2}, ["fire"], "A midfielder holding the ball may shoot, with -2 Shot."),
    ("steal",     "action",   {"amount": 2},  ["fire", "earth"], "Tackle with +2."),
    ("recall",    "action",   {"count": 2},   [None], "Draw 2 cards."),
    ("dirty_play", "reaction", {},            [None], "If your side wins this contest, the opposing player is injured."),
    ("mend",      "action",   {},             ["water"], "Remove the injury from one of your players, on the field or in your hand."),
]

# Hits, chosen to fit each team's main elements: (element, name)
HIT_TEXT = "Attack the opposing player in the caster's spot (a forward may attack the goalie instead): strength 3 against their Defense (or Save). If it lands, they're injured."
HITS = {
    "A": [("fire", "Flambé"), ("fire", "Flambé"), ("air", "Thunderclap")],
    "B": [("water", "Water Spear"), ("water", "Water Spear"), ("earth", "Earth Crush")],
}

# Placeholder names for spells that don't follow the "<Element> <Effect>" pattern.
SPELL_NAMES = {"dirty_play": "Late Hit", "mend": "Mend"}


def resonant(element):
    return {"name": RESONANT_NAMES[element], "affinity": element}


def build():
    rng = random.Random(42)
    # Separate generator for second Resonants, so adding them doesn't reshuffle everything else.
    extra_rng = random.Random(7)
    cards = []
    for team_id, t in TEAMS.items():
        n = 0
        ability_slots = set(rng.sample(range(22), 6))
        idx = 0
        for arch, count in t["mix"].items():
            for _ in range(count):
                n += 1
                sp, sh, de, fo = ARCHETYPES[arch]
                first = rng.choice(t["elements"])
                resonants = [resonant(first)]
                if extra_rng.random() < SECOND_RESONANT_CHANCE:
                    second = extra_rng.choice([e for e in ELEMENTS if e != first])
                    resonants.append(resonant(second))
                card = {
                    "id": f"{team_id.lower()}-p-{n:02d}",
                    "team": team_id,
                    "kind": "field",
                    "name": f"{team_id} {arch.title()} {n:02d}",
                    "resonants": resonants,
                    "speed": sp, "shot": sh, "defense": de, "faceoff": fo,
                    "placeholder": True,
                }
                if idx in ability_slots:
                    ability, text = ABILITIES[rng.randrange(len(ABILITIES))]
                    stats = {"speed": sp, "shot": sh, "defense": de}
                    top = max(stats, key=stats.get)
                    card[top] -= 1
                    card["ability"] = ability
                    card["text"] = text
                idx += 1
                cards.append(card)
        for g, save in ((1, 3), (2, 2)):  # lowered from 5/4 after the M2 simulations
            cards.append({
                "id": f"{team_id.lower()}-g-{g:02d}",
                "team": team_id, "kind": "goalie",
                "name": f"{team_id} Goalie {g:02d}",
                "resonants": [resonant(rng.choice(t["elements"]))],
                "save": save,
                "placeholder": True,
            })
        s = 0
        for effect, stype, params, elements, text in SPELLS:
            for el in elements:
                s += 1
                label = (el or "neutral").title()
                cards.append({
                    "id": f"{team_id.lower()}-s-{s:02d}",
                    "team": team_id, "kind": "spell",
                    "name": SPELL_NAMES.get(effect, f"{label} {effect.replace('_', ' ').title()}"),
                    "spellType": stype, "element": el,
                    "ability": {"effect": effect, "params": params},
                    "text": text,
                    "placeholder": True,
                })
        for el, name in HITS[team_id]:
            s += 1
            cards.append({
                "id": f"{team_id.lower()}-s-{s:02d}",
                "team": team_id, "kind": "spell",
                "name": name,
                "spellType": "action", "element": el,
                "ability": {"effect": "hit", "params": {"strength": 3}},
                "text": HIT_TEXT,
                "placeholder": True,
            })
        assert s == 16, s
    # The canon player promo: stats and identity to be set by Paul.
    cards.append({
        "id": "promo-canon-01", "team": "A", "kind": "field",
        "name": "Canon player (TBD)", "resonants": [resonant("fire")],
        "speed": 4, "shot": 4, "defense": 3, "faceoff": 4,
        "promo": True, "placeholder": True,
        "flavor": "Paul to choose the character, stats, and ability. Not part of the 40-card decks.",
    })
    return {
        "version": "0.5-prototype",
        "elements": ELEMENTS,
        "opposedPairs": OPPOSED,
        "teams": [{"id": k, "name": v["name"], "color": v["color"], "placeholder": True}
                  for k, v in TEAMS.items()],
        "cards": cards,
    }


if __name__ == "__main__":
    print(json.dumps(build(), indent=2))
