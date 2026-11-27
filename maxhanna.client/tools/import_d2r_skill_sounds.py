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

The extraction's takes are lossless 44.1 kHz mono FLAC — about 12 MB across the
seven classes — which is far too much to stream behind the loading cel. Every
take is decoded and re-encoded to 48 kHz mono Ogg/Opus at 40 kbit/s instead,
which keeps a class's whole set around 1 MB, so the loading cel stays short and
the first cast afterwards is still a cache hit.

The landing sounds come from the same tables: ``skills.txt`` gives every skill a
``dosound`` (the sound of the spell doing its work) and a ``tgtsound`` (its
sound on the monster it lands on), and ``missiles.txt`` gives the missile a
skill launches a ``HitSound``. Those are collected per skill, resolved through
``sounds.txt`` to their recorded files, and encoded the same way into
``audio/impacts``, so a Fire Ball or Blessed Hammer blast is heard where it
lands rather than only when it is cast. The encode uses PyAV, which
bundles the ffmpeg libraries (``pip install av``): no ffmpeg binary is needed,
and nothing but the encoder feeds these folders.

Run with:
    python tools/import_d2r_skill_sounds.py
    python tools/import_d2r_skill_sounds.py --source "C:/path/to/d2r extract/data"
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import av
from av.audio.resampler import AudioResampler

PROJECT_ROOT = Path(__file__).resolve().parents[1]
AUDIO_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "audio" / "skills"
GENERATED = PROJECT_ROOT / "src" / "app" / "d2survivors" / "d2-skill-sounds.generated.ts"
DEFAULT_SOURCE = Path.home() / "Desktop" / "d2" / "d2r extract" / "data"

# Opus at this rate is transparent enough for a 2-second spell one-shot and
# keeps a class's every take near 1 MB; MP3 would need twice the space for the
# same clarity on impacts.
IMPACT_ROOT = PROJECT_ROOT / "src" / "assets" / "d2survivors" / "audio" / "impacts"

# Skills whose landing sound the shipped tables leave unset. Frozen Orb's own SD
# explosion group is missing from this export (only its HD rows survive), so it
# takes the shatter takes those HD entries point at.
IMPACT_OVERRIDES: dict[str, tuple[str, ...]] = {
    "Frozen Orb": ("impact_shatter_1", "impact_shatter_2", "impact_shatter_3"),
}

ENCODED_SUFFIX = ".ogg"
ENCODED_CODEC = "libopus"
ENCODED_SAMPLE_RATE = 48_000
ENCODED_BIT_RATE = 40_000

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
// re-encoded from the shipped files under data/global/sfx/skill.

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

IMPACT_HEADER = """/**
 * The recorded sound a spell makes where it lands: skills.txt's dosound (the
 * spell doing its work) and tgtsound (its sound on the target), plus the
 * HitSound of the missile the skill launches. Grouped by class and skill the
 * same way as the cast sounds, and re-encoded from the shipped files.
 */
export const SKILL_IMPACT_SOUNDS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
"""

IMPACT_FOOTER = """};

/**
 * One landed take for the skill, or undefined when D2 gives it no do/target/hit
 * sound and the cast sound is the whole event.
 */
export function randomSkillImpactSound(classId: string, skill: string, random: () => number = Math.random): string | undefined {
  const takes = SKILL_IMPACT_SOUNDS[classId]?.[skill];
  if (!takes?.length) return undefined;
  const index = Math.min(takes.length - 1, Math.floor(Math.max(0, Math.min(0.999999, random())) * takes.length));
  return takes[index];
}
"""


def read_table(path: Path) -> list[dict[str, str]]:
    """One of Diablo II's tab-separated tables, as rows keyed by column name."""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    header = lines[0].split("\t")
    rows: list[dict[str, str]] = []
    for line in lines[1:]:
        cells = line.split("\t")
        if len(cells) < len(header):
            continue
        rows.append(dict(zip(header, cells)))
    return rows


def sound_takes(name: str, sounds: dict[str, str]) -> list[tuple[str, str]]:
    """Every take in a sounds.txt number family, e.g. the _1.._3 of a group."""
    base = re.sub(r"_\d+$", "", name)
    family = [key for key in sounds
              if key == base or (key.startswith(base + "_") and key[len(base) + 1:].isdigit())]
    family.sort(key=lambda key: int(key.rsplit("_", 1)[1]) if key != base else 0)
    return [(key, sounds[key]) for key in family]


def write_generated(copied: dict[str, dict[str, list[str]]],
                    impact: dict[str, dict[str, list[str]]]) -> None:
    lines = [HEADER]
    for class_id, skills in copied.items():
        lines.append(f"  {json.dumps(class_id)}: {{\n")
        for skill, paths in skills.items():
            entries = ", ".join(json.dumps(path) for path in paths)
            lines.append(f"    {json.dumps(skill)}: [{entries}],\n")
        lines.append("  },\n")
    lines.append(FOOTER)
    lines.append(IMPACT_HEADER)
    for class_id, skills in impact.items():
        lines.append(f"  {json.dumps(class_id)}: {{\n")
        for skill, paths in skills.items():
            entries = ", ".join(json.dumps(path) for path in paths)
            lines.append(f"    {json.dumps(skill)}: [{entries}],\n")
        lines.append("  },\n")
    lines.append(IMPACT_FOOTER)
    GENERATED.write_text("".join(lines), encoding="utf-8")


def encode_take(origin: Path, target: Path) -> None:
    """Re-encode one recorded take to mono 48 kHz Ogg/Opus."""
    with av.open(str(origin)) as recording:
        stream = recording.streams.audio[0]
        resampler = AudioResampler(format="fltp", layout="mono", rate=ENCODED_SAMPLE_RATE)
        with av.open(str(target), "w", format="ogg") as output:
            encoded = output.add_stream(ENCODED_CODEC, rate=ENCODED_SAMPLE_RATE)
            encoded.layout = "mono"
            encoded.bit_rate = ENCODED_BIT_RATE
            for frame in recording.decode(stream):
                for resampled in resampler.resample(frame):
                    for packet in encoded.encode(resampled):
                        output.mux(packet)
            for packet in encoded.encode(None):
                output.mux(packet)


def encode_impact(source: Path, relative_file: str) -> str | None:
    """Encodes one recorded landing sound and returns its asset URL."""
    file_path = Path(relative_file.replace("\\", "/"))
    origin = source / "global" / "sfx" / file_path
    if file_path.suffix.lower() != ".flac" or not origin.exists():
        return None
    IMPACT_ROOT.mkdir(parents=True, exist_ok=True)
    # The recording's own folder keeps two same-named takes apart: the
    # sorceress' boom1 and a combat sizzle never collide.
    stem = f"{file_path.parent.name}-{file_path.stem}{ENCODED_SUFFIX}"
    target = IMPACT_ROOT / stem
    if not target.exists() or target.stat().st_mtime < origin.stat().st_mtime:
        encode_take(origin, target)
    return f"assets/d2survivors/audio/impacts/{stem}"


def build_impacts(source: Path) -> dict[str, dict[str, list[str]]]:
    """Collects every skill's do/target/missile-hit sound into its own set."""
    tables = source / "global" / "excel" / "base"
    skills = read_table(tables / "skills.txt")
    missiles = {row["Missile"].strip(): row for row in read_table(tables / "missiles.txt")}
    sounds: dict[str, str] = {}
    for row in read_table(tables / "sounds.txt"):
        name = row["Sound"].strip()
        file_name = row["FileName"].strip()
        if name and file_name:
            sounds[name] = file_name

    impact: dict[str, dict[str, list[str]]] = {}
    for class_id, class_skills in SKILL_SOUNDS.items():
        impact[class_id] = {}
        for skill in class_skills:
            row = next((entry for entry in skills if entry["skill"].strip() == skill), None)
            names: list[str] = []
            if row:
                for column in ("dosound", "tgtsound"):
                    names.extend(part.strip() for part in row[column].split(",") if part.strip())
                for column in ("srvmissile", "srvmissilea", "srvmissileb", "srvmissilec", "cltmissile"):
                    missile = missiles.get(row[column].strip())
                    if missile and missile["HitSound"].strip():
                        names.append(missile["HitSound"].strip())
            if not names:
                names.extend(IMPACT_OVERRIDES.get(skill, ()))
            paths: list[str] = []
            for name in names:
                for _, file_name in sound_takes(name, sounds):
                    path = encode_impact(source, file_name)
                    if path and path not in paths:
                        paths.append(path)
            if paths:
                impact[class_id][skill] = paths
        take_count = sum(len(paths) for paths in impact[class_id].values())
        size = sum((IMPACT_ROOT / Path(p).name).stat().st_size
                   for paths in impact[class_id].values() for p in paths)
        print(f"{class_id + ' impact':20} {len(impact[class_id]):2} skills, "
              f"{take_count:3} takes, {size / 1024:6.0f} KiB")
    return impact


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
                file_name = f"{name}{ENCODED_SUFFIX}" if owner == class_id else f"{owner}-{name}{ENCODED_SUFFIX}"
                target = class_dir / file_name
                if not target.exists() or target.stat().st_mtime < origin.stat().st_mtime:
                    encode_take(origin, target)
                paths.append(f"assets/d2survivors/audio/skills/{class_id}/{file_name}")
            copied[class_id][skill] = paths
        takes = sum(len(p) for p in copied[class_id].values())
        size = sum((class_dir / Path(p).name).stat().st_size for p in copied[class_id].values() for p in p)
        print(f"{class_id:12} {len(copied[class_id]):2} skills, {takes:3} takes, {size / 1024:6.0f} KiB")

    # The lossless copies this tool used to ship are dead weight now: drop them
    # so a checkout only carries the encoded takes.
    for class_id in SKILL_SOUNDS:
        for stale in (AUDIO_ROOT / class_id).glob("*.flac"):
            stale.unlink()
            print(f"removed {stale.relative_to(PROJECT_ROOT)}")

    impact = build_impacts(source)
    write_generated(copied, impact)
    print(f"wrote {GENERATED.relative_to(PROJECT_ROOT)}")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    args = parser.parse_args(argv)
    build(args.source)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
