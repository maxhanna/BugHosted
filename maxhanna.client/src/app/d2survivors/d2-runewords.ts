/**
 * Runeword base classification and matching.
 *
 * Diablo II groups bases into weapon families (swords, axes, maces, hammers,
 * scepters, staves, polearms, spears, daggers, claws/katars, bows) and armour
 * (helms, body armour, shields, paladin shields, shrunken heads). A runeword
 * lists the families it accepts; some list the catch-all "weapons" or the
 * slightly narrower "melee".
 */
import { D2_RUNEWORD_TABLE, type D2RunewordTableEntry } from "./d2-runeword-table";

export type RunewordBaseKind =
  | "sword" | "axe" | "mace" | "hammer" | "scepter" | "staff"
  | "polearm" | "spear" | "javelin" | "dagger" | "katar" | "missile"
  | "wand" | "orb"
  | "helm" | "body" | "shield" | "paladinShield" | "shrunkenHead" | "grimoire";

export type RunewordBaseSelector = RunewordBaseKind | "weapons" | "melee";

const MELEE_ONLY: ReadonlySet<RunewordBaseKind> = new Set<RunewordBaseKind>([
  "missile", "javelin", "orb", "wand",
]);

const NAME_RULES: ReadonlyArray<{ kind: RunewordBaseKind; pattern: RegExp }> = [
  // Polearms before axes: "Cryptic Axe" and "Ogre Axe" are polearms in D2.
  { kind: "polearm", pattern: /polearm|halberd|bardiche|voulge|scythe|poleaxe|bec-de-corbin|partizan|thresher|colossus voulge|cryptic axe|great poleaxe|ogre axe|glaive|war scythe/ },
  { kind: "javelin", pattern: /javelin|pilum|throwing/ },
  { kind: "spear", pattern: /spear|trident|brandistock|spetum|\bpike\b|lance|fuscina|war fork|yari|harpoon/ },
  { kind: "missile", pattern: /bow|crossbow|\barrow\b|\bbolt\b/ },
  { kind: "staff", pattern: /staff|stave|shillelagh|walking stick|stalagmite/ },
  { kind: "scepter", pattern: /scept(er|re)/ },
  { kind: "hammer", pattern: /hammer|maul|mallet|sledge/ },
  { kind: "mace", pattern: /\bmace\b|club|morning star|flail|knout|scourge|truncheon|cudgel|devil star/ },
  { kind: "sword", pattern: /sword|sabre|saber|scimitar|falchion|claymore|bastard|flamberge|gladius|\bblade\b|hydra edge|ataghan/ },
  { kind: "axe", pattern: /axe|cleaver|hatchet|hurlbat|military pick|crowbill|\bnaga\b|tabar|francisca|war spike/ },
  { kind: "dagger", pattern: /dagger|dirk|\bkris\b|stiletto|poignard|rondel|cinquedeas|bone knife|fanged knife|mithril point|legend spike|misericorde/ },
  { kind: "katar", pattern: /katar|wrist blade|hatchet hands|cestus|claws|blade talons|scissors|quhab|wrist spike|fascia|hand scythe|suwayyah|war fist|battle cestus|feral claws|greater talons|runic talons/ },
];

/**
 * Which runeword family a base belongs to, or null for bases no runeword takes
 * (charms, rings, amulets, belts, gloves, boots, orbs and wands are only
 * accepted where the table names them explicitly).
 */
export function runewordBaseKind(
  item: { name?: string; baseName?: string; equipmentType?: string; slot?: string },
): RunewordBaseKind | null {
  const type = item.equipmentType;
  if (type === "helm" || type === "helmet" || type === "barbarianHelm" || type === "druidPelt") return "helm";
  if (type === "body") return "body";
  if (type === "paladinShield") return "paladinShield";
  if (type === "shield") return "shield";
  if (type === "necromancerHead") return "shrunkenHead";
  if (type === "claw") return "katar";
  if (type === "wand") return "wand";
  if (type === "orb") return "orb";
  if (type === "gem" || type === "jewel" || type === "rune") return null;
  if (type === "gloves" || type === "boots" || type === "belt" || type === "ring" || type === "amulet" || type === "charm") return null;

  const name = `${item.baseName ?? ""} ${item.name ?? ""}`.toLowerCase();
  if (!name.trim()) return null;
  // A paladin shield base (Targe, Rondache, ...) is written as a shield but is
  // the only base class Exile accepts.
  if (/targe|rondache|heraldic shield|aerin shield|crown shield|zakarum shield|vortex shield|sacred targe|sacred rondache|ancient shield|royal shield|dragon shield|kurast shield/.test(name)) return "paladinShield";
  if (/grimoire/.test(name)) return "grimoire";
  if (/preserved head|zombie head|unraveller head|gargoyle head|demon head|mummified trophy|fetish trophy|sexton trophy|cantor trophy|hierophant trophy|minion skull|hellspawn skull|overseer skull|succubus skull|bloodlord skull/.test(name)) return "shrunkenHead";
  if (/write|scroll|charm|ring|amulet/.test(name)) return null;
  // Throwing weapons (Throwing Axe, Balanced Axe, Glaive, ...) are their own D2
  // item class and no runeword accepts them, even though their names read like
  // an axe or a blade.
  if (/throwing|balanced|glaive/.test(name)) return null;
  for (const rule of NAME_RULES) {
    if (rule.pattern.test(name)) return rule.kind;
  }
  if (type === "weapon") return null;
  return null;
}

function isWeaponKind(kind: RunewordBaseKind): boolean {
  return kind !== "helm" && kind !== "body" && kind !== "shield"
    && kind !== "paladinShield" && kind !== "shrunkenHead" && kind !== "grimoire";
}

export function runewordAcceptsBase(
  runeword: { bases: readonly string[] },
  kind: RunewordBaseKind | null,
): boolean {
  if (!kind) return false;
  for (const selector of runeword.bases as readonly RunewordBaseSelector[]) {
    if (selector === kind) return true;
    if (selector === "weapons" && isWeaponKind(kind)) return true;
    if (selector === "melee" && isWeaponKind(kind) && !MELEE_ONLY.has(kind)) return true;
  }
  return false;
}

/** The runeword this exact socket sequence spells in this base, if any. */
export function findRuneword(
  kind: RunewordBaseKind | null,
  socketedRuneNames: readonly string[],
): D2RunewordTableEntry | null {
  if (!kind || !socketedRuneNames.length) return null;
  const wanted = socketedRuneNames.map((name) => name.trim().toLowerCase());
  for (const runeword of D2_RUNEWORD_TABLE) {
    if (runeword.runes.length !== wanted.length) continue;
    if (!runewordAcceptsBase(runeword, kind)) continue;
    let matches = true;
    for (let index = 0; index < wanted.length; index += 1) {
      if (runeword.runes[index].toLowerCase() !== wanted[index]) { matches = false; break; }
    }
    if (matches) return runeword;
  }
  return null;
}

/**
 * How many sockets a normal (white) base of this family can carry. D2's own
 * maximum socket counts at high item level, trimmed to the families this game
 * actually drops.
 */
export function runewordSocketCapacity(kind: RunewordBaseKind): number {
  switch (kind) {
    case "body":
    case "helm":
      return 3;
    case "shield":
    case "paladinShield":
    case "shrunkenHead":
    case "grimoire":
      return 4;
    case "dagger":
    case "katar":
      return 3;
    default:
      return 6;
  }
}

export const D2_RUNEWORDS_BY_LENGTH = [...D2_RUNEWORD_TABLE].sort((left, right) => right.runes.length - left.runes.length);
