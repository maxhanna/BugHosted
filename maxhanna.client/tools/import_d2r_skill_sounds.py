"""Copy every class's spell sounds out of the D2R extraction.

Diablo II keeps one recorded cast/impact per skill under
``data/global/sfx/skill/<class>``. The retail tables name them:
``global/excel/base/skills.txt`` gives every skill its cast sound id
(``stsound``/``stsoundclass``) and ``global/excel/base/sounds.txt`` resolves
that id to a ``.flac`` file. Skills the tables leave silent — the passives, and
a handful of skills the export lists under other ids — are mapped by hand to
files from the same class folder, so a cast never falls back to nothing.

The barbarian's warcries are not listed here: their recorded shouts already
ship through ``d2-warcry-voice.ts`` and the game plays one on every use.

Run with:
    python tools/import_d2r_skill_sounds.py
    python tools/import_d2r_skill_sounds.py --source "C:/path/to/d2r extract/data"
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
AUDIO_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "audio" / "skills"
GENERATED = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-skill-sounds.generated.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

# skill -> the flac stems that belong to it. A stem is looked up in the skill's
# own class folder unless it is written as "<class>/<stem>". D2 has one take per
# use, so the game picks one at random. Passives are absent on purpose: D2 gives
# them no sound, and this engine never casts them.
SKILL_SOUNDS: dict[str, dict[str, tuple[str, ...]]] = {
    "amazon": {
        "Magic Arrow": ("magicarrow1", "magicarrow2", "magicarrow3"),
        "Fire Arrow": ("firearrow1", "firearrow2", "firearrow3"),
        "Cold Arrow": ("coldarrow1", "coldarrow2", "coldarrow3"),
        "Multiple Shot": ("multi1", "multi2", "multi3", "multi4", "multi5"),
        "Exploding Arrow": ("firearrow1", "firearrow2", "firearrow3"),
        "Ice Arrow": ("coldarrow1", "coldarrow2", "coldarrow3"),
        "Guided Arrow": ("multi1", "multi2", "multi3"),
        "Strafe": ("multi1", "multi2", "multi3", "multi4", "multi5"),
        "Immolation Arrow": ("firearrow1", "firearrow2", "firearrow3"),
        "Freezing Arrow": ("coldarrow1", "coldarrow2", "coldarrow3"),
        "Inner Sight": ("eyeofzeus",),
        "Dodge": ("dodge1", "dodge2", "dodge3", "dodge4", "dodge5"),
        "Slow Missiles": ("handofathena",),
        "Avoid": ("dodge1", "dodge2", "dodge3", "dodge4", "dodge5"),
        "Decoy": ("valkyriecast",),
        "Evade": ("dodge1", "dodge2", "dodge3", "dodge4", "dodge5"),
        "Valkyrie": ("valkyriecast",),
        "Jab": ("jab1", "jab2", "jab3", "jab4"),
        "Power Strike": ("jab1", "jab2", "jab3", "jab4"),
        "Poison Javelin": ("poisoncast",),
        "Impale": ("impale1", "impale2", "impale3", "impale4"),
        "Lightning Bolt": ("zeus1", "zeus2", "zeus3"),
        "Charged Strike": ("zeus1", "zeus2", "zeus3"),
        "Plague Javelin": ("poisoncast",),
        "Fend": ("jab1", "jab2", "jab3", "jab4"),
        "Lightning Strike": ("zeus1", "zeus2", "zeus3"),
        "Lightning Fury": ("zeus1", "zeus2", "zeus3"),
    },
    "assassin": {
        "Tiger Strike": ("tigera", "tigerb", "tigerc"),
        "Dragon Talon": ("kick1", "kick2", "kick3", "kick4", "kick5"),
        "Fists of Fire": ("tigera", "tigerb", "tigerc"),
        "Dragon Claw": ("kick1", "kick2", "kick3", "kick4", "kick5"),
        "Cobra Strike": ("cobra1", "cobra2", "cobra3"),
        "Claws of Thunder": ("cobra1", "cobra2", "cobra3"),
        "Dragon Tail": ("kick1", "kick2", "kick3", "kick4", "kick5"),
        "Blades of Ice": ("cobra1", "cobra2", "cobra3"),
        "Dragon Flight": ("kick1", "kick2", "kick3"),
        "Phoenix Strike": ("cobra1", "cobra2", "cobra3"),
        "Psychic Hammer": ("hammer",),
        "Burst of Speed": ("quickness",),
        "Cloak of Shadows": ("cloak",),
        "Fade": ("fade",),
        "Shadow Warrior": ("summon",),
        "Mind Blast": ("hammer",),
        "Venom": ("cobra1", "cobra2", "cobra3"),
        "Shadow Master": ("summon",),
        # D2's fire and lightning traps borrow the sorceress cast and the
        # assassin's own static field; the assassin folder ships no trap cast.
        "Fire Blast": ("sorceress/firecast",),
        "Shock Web": ("staticfield",),
        "Blade Sentinel": ("summon",),
        "Charged Bolt Sentry": ("staticfield",),
        "Wake of Fire": ("sorceress/firecast",),
        "Blade Fury": ("bladefury1", "bladefury2", "bladefury3"),
        "Lightning Sentry": ("staticfield",),
        "Wake of Inferno": ("sorceress/firecast",),
        "Death Sentry": ("staticfield",),
        "Blade Shield": ("bladeshield",),
    },
    "barbarian": {
        "Bash": ("grunt101", "grunt102", "grunt103"),
        "Leap": ("leap1", "leap2", "leap3"),
        "Double Swing": ("grunt101", "grunt102", "grunt103"),
        "Stun": ("grunt201", "grunt202", "grunt203"),
        "Double Throw": ("grunt101", "grunt102", "grunt103"),
        "Leap Attack": ("leapattack1", "leapattack2", "leapattack3"),
        "Concentrate": ("grunt201", "grunt202", "grunt203"),
        "Frenzy": ("grunt101", "grunt102", "grunt103"),
        "Whirlwind": ("whirlwind1",),
        "Berserk": ("grunt201", "grunt202", "grunt203"),
        "Find Item": ("findheart1", "findheart2", "findheart3"),
    },
    "druid": {
        "Firestorm": ("firecastb",),
        "Molten Boulder": ("boulderloop", "boulderloop2"),
        "Arctic Blast": ("arcticblast",),
        "Cyclone Armor": ("cyclonearmor",),
        "Fissure": ("firecasta",),
        "Twister": ("windcast",),
        "Volcano": ("volcano",),
        "Tornado": ("tornado",),
        "Hurricane": ("hurricane",),
        "Armageddon": ("firecasta",),
        "Werewolf": ("morph",),
        "Werebear": ("morph",),
        "Maul": ("shockwave",),
        "Feral Rage": ("shockwave",),
        "Fire Claws": ("firecastb",),
        "Rabies": ("shockwave",),
        "Hunger": ("shockwave",),
        "Shock Wave": ("shockwave",),
        "Fury": ("shockwave",),
        "Raven": ("summon",),
        "Poison Creeper": ("summon",),
        "Oak Sage": ("summon",),
        "Summon Spirit Wolf": ("summon",),
        "Carrion Vine": ("summon",),
        "Heart of Wolverine": ("summon",),
        "Summon Dire Wolf": ("summon",),
        "Solar Creeper": ("summon",),
        "Spirit of Barbs": ("summon",),
        "Summon Grizzly": ("summon",),
    },
    "necromancer": {
        "Amplify Damage": ("amplifydamage",),
        "Dim Vision": ("dimvision",),
        "Weaken": ("weaken",),
        "Iron Maiden": ("ironmaiden",),
        "Terror": ("cursecast",),
        "Confuse": ("confuse",),
        "Life Tap": ("cursecast",),
        "Attract": ("attract",),
        "Decrepify": ("decrepify",),
        "Lower Resist": ("lowerresist",),
        "Teeth": ("teethlaunch1", "teethlaunch2", "teethlaunch3"),
        "Bone Armor": ("bonearmor2",),
        "Poison Dagger": ("poisoncast",),
        "Corpse Explosion": ("corpseexplodecast",),
        "Bone Wall": ("bonecast",),
        "Poison Explosion": ("corpseexplodecast",),
        "Bone Spear": ("bonespear1", "bonespear2", "bonespear3"),
        "Bone Prison": ("bonecast",),
        "Poison Nova": ("poisonnova",),
        "Bone Spirit": ("bonespirit1", "bonespirit2", "bonespirit3"),
        "Raise Skeleton": ("skeletonraise1", "skeletonraise2", "skeletonraise3"),
        "Clay Golem": ("golemcast3",),
        "Skeletal Mage": ("skeletonraise1", "skeletonraise2", "skeletonraise3"),
        "Blood Golem": ("golemcast3",),
        "Iron Golem": ("golemcast3",),
        "Fire Golem": ("golemcast3",),
        "Revive": ("revivecast",),
    },
    "paladin": {
        "Sacrifice": ("sacrifice",),
        "Smite": ("smite",),
        "Holy Bolt": ("holybolt1", "holybolt2", "holybolt3"),
        "Zeal": ("zeal",),
        "Charge": ("charge",),
        "Vengeance": ("vengeance",),
        "Blessed Hammer": ("bolthammercast",),
        "Conversion": ("conversion",),
        "Holy Shield": ("holyshield",),
        "Fist of the Heavens": ("handofgod",),
        "Prayer": ("prayer",),
        "Resist Fire": ("resistfire",),
        "Defiance": ("defiance",),
        "Resist Cold": ("resistcold",),
        "Cleansing": ("cleansing",),
        "Resist Lightning": ("resistlightning",),
        "Vigor": ("stamina",),
        "Meditation": ("meditation",),
        "Redemption": ("redemption",),
        "Salvation": ("salvation",),
        "Might": ("might",),
        "Holy Fire": ("holyfire",),
        "Thorns": ("thorns",),
        "Blessed Aim": ("blessedaim",),
        "Concentration": ("concentration",),
        "Holy Freeze": ("holywind",),
        "Holy Shock": ("holylight",),
        "Sanctuary": ("sanctuary",),
        "Fanaticism": ("fanaticism",),
        "Conviction": ("purification",),
    },
    "sorceress": {
        "Ice Bolt": ("icebolt1", "icebolt2", "icebolt3"),
        "Frozen Armor": ("frozenarmor",),
        "Frost Nova": ("novaice",),
        "Ice Blast": ("icespike1", "icespike2", "icespike3"),
        "Shiver Armor": ("shivers",),
        "Glacial Spike": ("icespike1", "icespike2", "icespike3"),
        "Blizzard": ("blizzboom1", "blizzboom2", "blizzboom3"),
        "Chilling Armor": ("shivers",),
        "Frozen Orb": ("coldcast",),
        "Fire Bolt": ("firebolt1", "firebolt2", "firebolt3"),
        "Inferno": ("infernoloop",),
        "Blaze": ("firecast",),
        "Fire Ball": ("fireball1", "fireball2", "fireball3"),
        "Fire Wall": ("firecast",),
        "Enchant": ("enchant",),
        "Meteor": ("meteorlaunch",),
        "Hydra": ("firecast",),
        "Charged Bolt": ("chargedbolt1", "chargedbolt2", "chargedbolt4"),
        "Static Field": ("eleccast",),
        "Telekinesis": ("telekinesis",),
        "Lightning": ("lightning1", "lightning2", "lightning3"),
        "Nova": ("novaelec",),
        "Chain Lightning": ("lightning1", "lightning2", "lightning3"),
        "Teleport": ("teleport",),
        "Thunder Storm": ("thundercast",),
        "Energy Shield": ("energyshield",),
    },
}

HEADER = """// Generated by tools/import_d2r_skill_sounds.py. Do not edit by hand.
// Diablo II's recorded spell sounds, one take per use, grouped by class and
// copied from the shipped files under data/global/sfx/skill.

export const SKILL_SOUNDS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
"""

FOOTER = """};

/**
 * One recorded take of the class's spell sound, or undefined for a skill that
 * has none (D2 leaves passives silent, and the barbarian's warcries play their
 * own shouts through d2-warcry-voice.ts instead).
 */
export function randomSkillSound(classId: string, skill: string, random: () => number = Math.random): string | undefined {
  const takes = SKILL_SOUNDS[classId]?.[skill];
  if (!takes?.length) return undefined;
  const index = Math.min(takes.length - 1, Math.floor(Math.max(0, Math.min(0.999999, random())) * takes.length));
  return takes[index];
}
"""


def write_generated(copied: dict[str, dict[str, list[str]]]) -> None:
    lines = [HEADER]
    for class_id, skills in copied.items():
        lines.append(f"  {json.dumps(class_id)}: {{\n")
        for skill, paths in skills.items():
            entries = ", ".join(json.dumps(path) for path in paths)
            lines.append(f"    {json.dumps(skill)}: [{entries}],\n")
        lines.append("  },\n")
    lines.append(FOOTER)
    GENERATED.write_text("".join(lines), encoding="utf-8")


def build(source: Path) -> None:
    skill_root = source / "global" / "sfx" / "skill"
    if not skill_root.is_dir():
        raise FileNotFoundError(f"missing skill sounds: {skill_root}")

    copied: dict[str, dict[str, list[str]]] = {}
    for class_id, skills in SKILL_SOUNDS.items():
        class_dir = AUDIO_ROOT / class_id
        class_dir.mkdir(parents=True, exist_ok=True)
        copied[class_id] = {}
        for skill, stems in skills.items():
            paths: list[str] = []
            for stem in stems:
                owner, _, name = stem.partition("/")
                if not name:
                    owner, name = class_id, stem
                origin = skill_root / owner / f"{name}.flac"
                if not origin.exists():
                    raise FileNotFoundError(f"missing {class_id} sound for {skill}: {origin}")
                # Keep class folders intact: a cross-class file keeps its owner
                # prefix so two skills never collide on one file name.
                file_name = f"{name}.flac" if owner == class_id else f"{owner}-{name}.flac"
                target = class_dir / file_name
                if not target.exists() or target.stat().st_size != origin.stat().st_size:
                    shutil.copyfile(origin, target)
                paths.append(f"assets/d2survivors/audio/skills/{class_id}/{file_name}")
            copied[class_id][skill] = paths
        print(f"{class_id:12} {len(copied[class_id]):2} skills, "
              f"{sum(len(p) for p in copied[class_id].values()):3} takes")

    write_generated(copied)
    print(f"wrote {GENERATED.relative_to(PROJECT_ROOT)}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args(argv)
    build(args.source)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
