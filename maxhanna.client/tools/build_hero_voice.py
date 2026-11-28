"""Builds the hero speech table from the shipped Diablo II: Resurrected files.

The D2R extract keeps each player class's voice line as a FLAC under
``data/local/sfx/act<N>/<class>/`` and its subtitle text under the same key in
``data/local/lng/strings/vo.json``. Each class file this game can trigger is
re-encoded to the client's small mono Ogg/Opus format (``d2r_voice_encode.py``)
and written to ``audio/voice/<class>/<key>.ogg``, and ``d2-hero-voice.ts``
carries the matching text.
"""

import json
import os
import re
from pathlib import Path

from d2r_voice_encode import ENCODED_SUFFIX, build_take, drop_stale_flacs

EXTRACT = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "d2", "d2r extract", "data", "local")
EXTRACT = os.path.abspath(EXTRACT)
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VOICE_DIR = os.path.join(REPO, "src", "assets", "d2survivors", "audio", "voice")
OUT_FILE = os.path.join(REPO, "src", "app", "d2survivors", "d2-hero-voice.ts")

CLASSES = ["amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress"]
PREFIX = {
    "amazon": "ama",
    "assassin": "ass",
    "barbarian": "bar",
    "druid": "dru",
    "necromancer": "nec",
    "paladin": "pal",
    "sorceress": "sor",
}

# The Act III Durance of Hate lines ship as audio only: their keys are missing
# from vo.json, so the text below is transcribed from the class speech lists.
# Triggered lines whose subtitle text is missing from the shipped string table:
# the voice file is authentic, so the line plays without a subtitle.
TEXT_LESS_KEYS = {"sor_act3_complete_beneathcity"}

# The "not enough mana" bark is not an act line: D2 keeps one per class in the
# shared common set and says it whenever a spell cannot be paid for.
MANA_KEY = "notenoughmana"
MANA_TEXT = "Not enough mana."


FALLBACK_TEXT = {
    "bar_act3_complete_beneathcity": "Maybe now the world will have peace.",
    "ama_act3_complete_beneathcity": "Maybe now the world will have peace.",
    "dru_act3_complete_beneathcity": "Mephisto's hatred was a poisonous void.",
    "pal_act3_complete_beneathcity": "The Lord of Hatred shall darken the world no longer.",
    "ass_act3_complete_beneathcity": "Heh. Mephisto, you were no match for me.",
    "nec_act3_complete_beneathcity": "Good journey, Mephisto. Give my regards to the abyss.",
    "dru_act3_find_beneathcity": "What is that? Hatred stirs within me.",
    "ass_act3_find_beneathcity": "Mephisto, I'm coming for you.",
}


def clean(text):
    """Drops the leading volume code D2R prefixes some strings with."""
    text = re.sub(r"^\d+(?=\D)", "", text or "")
    text = text.replace("\r", " ").replace("\n", " ")
    return re.sub(r"\s+", " ", text).strip()


def main():
    with open(os.path.join(EXTRACT, "lng", "strings", "vo.json"), encoding="utf-8-sig") as handle:
        strings = {entry["Key"]: entry.get("enUS", "") for entry in json.load(handle)}

    table = {}
    copied = 0
    skipped = []
    for class_name in CLASSES:
        lines = {}
        for act in range(1, 6):
            folder = os.path.join(EXTRACT, "sfx", "act%d" % act, class_name)
            if not os.path.isdir(folder):
                continue
            for name in sorted(os.listdir(folder)):
                if not name.endswith(".flac"):
                    continue
                key = name[: -len(".flac")]
                text = clean(strings.get(key, "")) or FALLBACK_TEXT.get(key, "")
                if not text and key not in TEXT_LESS_KEYS:
                    skipped.append(key)
                    continue
                target_dir = os.path.join(VOICE_DIR, class_name)
                os.makedirs(target_dir, exist_ok=True)
                encoded_name = key + ENCODED_SUFFIX
                build_take(Path(folder) / name, Path(target_dir) / encoded_name)
                copied += 1
                # The table is keyed by the event (the file name without the
                # class prefix) so every class answers to the same event key.
                prefix = PREFIX[class_name] + "_"
                event_key = key[len(prefix):] if key.startswith(prefix) else key
                lines[event_key] = {
                    "path": "assets/d2survivors/audio/voice/%s/%s" % (class_name, encoded_name),
                    "text": text,
                }
        # The mana refusal is spoken outside the act script, from the common set.
        mana_name = "%s_%s.flac" % (PREFIX[class_name], MANA_KEY)
        mana_file = os.path.join(EXTRACT, "sfx", "common", class_name, mana_name)
        if os.path.isfile(mana_file):
            text = clean(strings.get(mana_name[: -len(".flac")], "")) or MANA_TEXT
            target_dir = os.path.join(VOICE_DIR, class_name)
            os.makedirs(target_dir, exist_ok=True)
            encoded_name = MANA_KEY + ENCODED_SUFFIX
            build_take(Path(mana_file), Path(target_dir) / encoded_name)
            copied += 1
            lines[MANA_KEY] = {
                "path": "assets/d2survivors/audio/voice/%s/%s" % (class_name, encoded_name),
                "text": text,
            }
        else:
            skipped.append("%s_%s" % (PREFIX[class_name], MANA_KEY))
        table[class_name] = lines

    body = []
    for class_name in CLASSES:
        body.append('  "%s": {' % class_name)
        for key, line in table[class_name].items():
            body.append(
                '    "%s": { path: %s, text: %s },'
                % (key, json.dumps(line["path"]), json.dumps(line["text"], ensure_ascii=False))
            )
        body.append("  },")

    source = """/**
 * The hero's spoken lines, lifted from the shipped Diablo II: Resurrected
 * files: the audio from data/local/sfx and the subtitle text from that build's
 * string table, so each quote matches the voice that says it.
 *
 * Generated by tools/build_hero_voice.py; add lines there rather than by hand.
 */

export interface HeroVoiceLine {
  /** Path of the voice file, relative to the client root. */
  path: string;
  /** Subtitle text shown while the line plays. */
  text: string;
}

/** Class voice lines, keyed by class id and then by the original voice key. */
export const HERO_VOICE_LINES: Record<string, Record<string, HeroVoiceLine>> = {
%s
};

/**
 * Areas whose entry has a class line in the original game. The areas this game
 * walks through that had no entry line (most of the outdoor stretches) stay
 * silent, exactly as they do in Diablo II. Stony Field and Dark Wood hold the
 * Cairn Stones and the Tree of Inifuss, so entering them plays the line the
 * class says on finding those objects.
 */
export const AREA_VOICE_EVENTS: Record<string, string> = {
  "Blood Moor": "act1_entry_wilderness",
  "Stony Field": "act1_find_cairnstones",
  "Dark Wood": "act1_find_treeofinifuss",
  Catacombs: "act1_entry_catacombs",
  Tristram: "act1_find_tristram",
  "Claw Viper Temple": "act2_entry_clawviperlair",
  "Arcane Sanctuary": "act2_entry_arcanesanctuary",
  "Durance of Hate": "act3_find_beneathcity",
  "Bloody Foothills": "act5_entry_wilderness",
  "Nihlathak's Temple": "act5_entry_nihlathaksland",
  "Arreat Summit": "act5_entry_mountaintop",
  "Worldstone Keep": "act5_entry_worldstone",
};

/**
 * Areas that hold a quest object with a class line. This game has no clickable
 * quest props, so each line plays as the hero leaves the zone whose objective it
 * belongs to: Radament's lair in the Sewers, Izual in the Plains of Despair and
 * Shenk in the Bloody Foothills.
 */
export const AREA_COMPLETE_VOICE_EVENTS: Record<string, string> = {
  Sewers: "act2_complete_radamentlair",
  "Plains of Despair": "act4_free_izual",
  "Bloody Foothills": "act5_complete_stopsiege",
};

/** Bosses whose death has a class line, keyed by the enemy species. */
export const BOSS_VOICE_EVENTS: Record<string, string> = {
  andariel: "act1_complete_andariel",
  duriel: "act2_complete_tombs",
  mephisto: "act3_complete_beneathcity",
  diablo: "act4_kill_diablo",
  baal: "act5_complete_defeatbaal",
  nihlathak: "act5_complete_nihlathaksecret",
};

/** The line a class says for an event, if that class recorded one. */
export function heroVoiceLine(classId: string, eventKey: string | undefined | null): HeroVoiceLine | undefined {
  if (!eventKey) return undefined;
  return HERO_VOICE_LINES[classId]?.[eventKey];
}
""" % "\n".join(body)

    with open(OUT_FILE, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(source)

    removed = drop_stale_flacs(Path(VOICE_DIR))
    if removed:
        print("removed", removed, "lossless leftover(s)")
    print("encoded", copied, "files")
    print("classes", {name: len(lines) for name, lines in table.items()})
    print("skipped without text", len(skipped))
    print("skipped sample", skipped[:12])


if __name__ == "__main__":
    main()
