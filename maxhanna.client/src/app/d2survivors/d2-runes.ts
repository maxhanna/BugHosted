/**
 * The thirty-three runes, in Diablo II's order (El = 1 ... Zod = 33).
 *
 * A rune is a socketable like a gem or a jewel: it has no paperdoll slot, it
 * never grants anything while carried, and it only does work once it is set in
 * a socket. Unlike a gem it has no effect on its own here - its power is the
 * runeword word it helps spell, which is why `D2Runeword` matches whole socket
 * sequences instead of summing per-rune bonuses.
 */
export interface D2RuneDefinition {
  name: string;
  /** Position in the rune list; also the tier a drop rolls against. */
  order: number;
  /** D2's own required level for the rune as an item. */
  requiredLevel: number;
}

export const D2_RUNES: readonly D2RuneDefinition[] = [
  { name: "El", order: 1, requiredLevel: 11 },
  { name: "Eld", order: 2, requiredLevel: 11 },
  { name: "Tir", order: 3, requiredLevel: 13 },
  { name: "Nef", order: 4, requiredLevel: 13 },
  { name: "Eth", order: 5, requiredLevel: 15 },
  { name: "Ith", order: 6, requiredLevel: 15 },
  { name: "Tal", order: 7, requiredLevel: 17 },
  { name: "Ral", order: 8, requiredLevel: 19 },
  { name: "Ort", order: 9, requiredLevel: 21 },
  { name: "Thul", order: 10, requiredLevel: 23 },
  { name: "Amn", order: 11, requiredLevel: 25 },
  { name: "Sol", order: 12, requiredLevel: 27 },
  { name: "Shael", order: 13, requiredLevel: 29 },
  { name: "Dol", order: 14, requiredLevel: 31 },
  { name: "Hel", order: 15, requiredLevel: 33 },
  { name: "Io", order: 16, requiredLevel: 35 },
  { name: "Lum", order: 17, requiredLevel: 37 },
  { name: "Ko", order: 18, requiredLevel: 39 },
  { name: "Fal", order: 19, requiredLevel: 41 },
  { name: "Lem", order: 20, requiredLevel: 43 },
  { name: "Pul", order: 21, requiredLevel: 45 },
  { name: "Um", order: 22, requiredLevel: 47 },
  { name: "Mal", order: 23, requiredLevel: 49 },
  { name: "Ist", order: 24, requiredLevel: 51 },
  { name: "Gul", order: 25, requiredLevel: 53 },
  { name: "Vex", order: 26, requiredLevel: 55 },
  { name: "Ohm", order: 27, requiredLevel: 57 },
  { name: "Lo", order: 28, requiredLevel: 59 },
  { name: "Sur", order: 29, requiredLevel: 61 },
  { name: "Ber", order: 30, requiredLevel: 63 },
  { name: "Jah", order: 31, requiredLevel: 65 },
  { name: "Cham", order: 32, requiredLevel: 67 },
  { name: "Zod", order: 33, requiredLevel: 69 },
];

export const D2_RUNE_BY_NAME: Readonly<Record<string, D2RuneDefinition>> = Object.fromEntries(
  D2_RUNES.map((rune) => [rune.name.toLowerCase(), rune]),
);

export function d2Rune(name: string | undefined | null): D2RuneDefinition | undefined {
  if (!name) return undefined;
  return D2_RUNE_BY_NAME[name.trim().toLowerCase()];
}

/**
 * The highest rune a monster of this area level can drop. D2 gates runes by the
 * treasure class of the area rather than by the rune's own required level, so
 * the tier is deliberately generous but never lets a Zod fall in the Blood Moor.
 */
export function runeDropTierForLevel(itemLevel: number): number {
  if (itemLevel >= 85) return 33;
  if (itemLevel >= 80) return 30;
  if (itemLevel >= 70) return 26;
  if (itemLevel >= 60) return 22;
  if (itemLevel >= 50) return 18;
  if (itemLevel >= 40) return 15;
  if (itemLevel >= 30) return 12;
  if (itemLevel >= 20) return 9;
  if (itemLevel >= 12) return 6;
  return 3;
}

/** Rolls one rune, weighted towards the low end of the area's tier. */
export function rollRuneForLevel(itemLevel: number, random: () => number = Math.random): D2RuneDefinition {
  const tier = runeDropTierForLevel(itemLevel);
  // Square the roll so the cheap runes stay common and the top of the tier is
  // the rare find it is in D2.
  const pick = Math.floor(Math.pow(random(), 2) * tier);
  return D2_RUNES[Math.max(0, Math.min(D2_RUNES.length - 1, pick))];
}
