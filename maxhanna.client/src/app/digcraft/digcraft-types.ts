/** DigCraft core types, block registry, crafting recipes, and constants. */

// ───── Block IDs ─────
export const enum BlockId {
  AIR           = 0,
  STONE         = 1,
  DIRT          = 2,
  GRASS         = 3,
  WOOD          = 4,
  LEAVES        = 5,
  SAND          = 6,
  WATER         = 7,
  COBBLESTONE   = 8,
  PLANK         = 9,
  COAL_ORE      = 10,
  IRON_ORE      = 11,
  GOLD_ORE      = 12,
  DIAMOND_ORE   = 13,
  BEDROCK       = 14,
  GRAVEL        = 15,
  GLASS         = 16,
  CRAFTING_TABLE = 17,
  FURNACE       = 18,
  BRICK         = 19,
  WINDOW        = 20,
  WINDOW_OPEN   = 21,
  DOOR          = 22,
  DOOR_OPEN     = 23,
  SHRUB         = 24,
  TREE          = 25,
  TALLGRASS     = 26,
  BONFIRE       = 27,
  CHEST         = 28,
  STONE_SNOW    = 29, // Snow-covered stone for mountains
  SNOW_POWDER   = 30, // Snow powder drop from STONE_SNOW
  // Nether-specific blocks
  NETHERRACK    = 31,
  BASALT        = 32,
  NETHERITE_ROCK = 33,
  LAVA          = 34,
  SOUL_SAND     = 35,
  NETHER_STALAGMITE = 36,
  NETHER_STALACTITE = 37,
}

// ───── Growth constants ─────
// Time for a shrub to grow into a full tree (40 minutes in ms)
export const SHRUB_GROW_TIME_MS = 40 * 60 * 1000;

// ───── Item IDs (items that aren't placeable blocks start at 100) ─────
export const enum ItemId {
  // Blocks are also items (IDs 0-99 mirror BlockId)
  STICK           = 100,
  COAL            = 101,
  IRON_INGOT      = 102,
  GOLD_INGOT      = 103,
  DIAMOND         = 104,
  WATER_BUCKET    = 105,
  /** Empty bucket (right-click water to fill) */
  EMPTY_BUCKET    = 152,
  /** Placeable boat — faster movement on water */
  BOAT            = 153,
  WOODEN_PICKAXE  = 110,
  STONE_PICKAXE   = 111,
  IRON_PICKAXE    = 112,
  DIAMOND_PICKAXE = 113,
  WOODEN_SWORD    = 120,
  STONE_SWORD     = 121,
  IRON_SWORD      = 122,
  DIAMOND_SWORD   = 123,
  WOODEN_AXE      = 130,
  STONE_AXE       = 131,
  IRON_AXE        = 132,
  LEATHER_HELMET  = 140,
  LEATHER_CHEST   = 141,
  LEATHER_LEGS    = 142,
  LEATHER_BOOTS   = 143,
  IRON_HELMET     = 144,
  IRON_CHEST      = 145,
  IRON_LEGS       = 146,
  IRON_BOOTS      = 147,
  DIAMOND_HELMET  = 148,
  DIAMOND_CHEST   = 149,
  DIAMOND_LEGS    = 150,
  DIAMOND_BOOTS   = 151,
}

// ───── Item Durability (Minecraft values) ─────
export interface ItemDurability {
  maxDurability: number;
  durabilityLossOnBlock: number;
  durabilityLossOnHit: number;
}

export const ITEM_DURABILITY: Record<number, ItemDurability> = {
  // Pickaxes
  [ItemId.WOODEN_PICKAXE]:  { maxDurability: 60, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.STONE_PICKAXE]:   { maxDurability: 132, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.IRON_PICKAXE]:    { maxDurability: 251, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.DIAMOND_PICKAXE]: { maxDurability: 1562, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  // Swords
  [ItemId.WOODEN_SWORD]:    { maxDurability: 60, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.STONE_SWORD]:     { maxDurability: 132, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.IRON_SWORD]:      { maxDurability: 251, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.DIAMOND_SWORD]:   { maxDurability: 1562, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  // Axes
  [ItemId.WOODEN_AXE]:      { maxDurability: 60, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.STONE_AXE]:       { maxDurability: 132, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.IRON_AXE]:        { maxDurability: 251, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  // Armor
  [ItemId.LEATHER_HELMET]: { maxDurability: 55, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.LEATHER_CHEST]:  { maxDurability: 80, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.LEATHER_LEGS]:   { maxDurability: 75, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.LEATHER_BOOTS]:  { maxDurability: 65, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.IRON_HELMET]:    { maxDurability: 165, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.IRON_CHEST]:     { maxDurability: 240, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.IRON_LEGS]:      { maxDurability: 225, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.IRON_BOOTS]:     { maxDurability: 195, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.DIAMOND_HELMET]: { maxDurability: 363, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.DIAMOND_CHEST]:  { maxDurability: 528, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.DIAMOND_LEGS]:   { maxDurability: 495, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.DIAMOND_BOOTS]:  { maxDurability: 429, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
};

export function getItemDurability(itemId: number): ItemDurability | null {
  return ITEM_DURABILITY[itemId] ?? null;
}

// ───── Block colour palette (RGBA 0-1) ─────
export interface BlockColor { r: number; g: number; b: number; a: number; top?: { r: number; g: number; b: number }; }

export const BLOCK_COLORS: Record<number, BlockColor> = {
  [BlockId.STONE]:          { r: .50, g: .50, b: .50, a: 1 },
  [BlockId.DIRT]:           { r: .55, g: .36, b: .24, a: 1 },
  [BlockId.GRASS]:          { r: .55, g: .36, b: .24, a: 1, top: { r: .30, g: .65, b: .20 } },
  [BlockId.WOOD]:           { r: .45, g: .30, b: .15, a: 1 },
  [BlockId.LEAVES]:         { r: .15, g: .55, b: .15, a: .85 },
  [BlockId.SAND]:           { r: .85, g: .80, b: .55, a: 1 },
  [BlockId.WATER]:          { r: .20, g: .40, b: .80, a: .60 },
  [BlockId.COBBLESTONE]:    { r: .42, g: .42, b: .42, a: 1 },
  [BlockId.PLANK]:          { r: .65, g: .50, b: .28, a: 1 },
  [BlockId.COAL_ORE]:       { r: .30, g: .30, b: .30, a: 1 },
  [BlockId.IRON_ORE]:       { r: .55, g: .48, b: .45, a: 1 },
  [BlockId.GOLD_ORE]:       { r: .70, g: .65, b: .30, a: 1 },
  [BlockId.DIAMOND_ORE]:    { r: .35, g: .70, b: .75, a: 1 },
  [BlockId.BEDROCK]:        { r: .20, g: .20, b: .20, a: 1 },
  [BlockId.GRAVEL]:         { r: .55, g: .52, b: .50, a: 1 },
  [BlockId.GLASS]:          { r: .80, g: .90, b: .95, a: .30 },
  [BlockId.CRAFTING_TABLE]: { r: .60, g: .45, b: .22, a: 1, top: { r: .70, g: .55, b: .30 } },
  [BlockId.FURNACE]:        { r: .45, g: .45, b: .45, a: 1 },
  [BlockId.BRICK]:          { r: .70, g: .35, b: .25, a: 1 },
  [BlockId.WINDOW]:         { r: .72, g: .78, b: .85, a: 1 },
  [BlockId.WINDOW_OPEN]:    { r: .72, g: .78, b: .85, a: 1 },
  [BlockId.DOOR]:           { r: .45, g: .30, b: .18, a: 1 },
  [BlockId.DOOR_OPEN]:      { r: .45, g: .30, b: .18, a: 1 },
  [BlockId.SHRUB]:         { r: .15, g: .55, b: .15, a: 1 },
  [BlockId.TREE]:          { r: .45, g: .30, b: .15, a: 1, top: { r: .15, g: .55, b: .15 } },
  [BlockId.TALLGRASS]:     { r: .20, g: .60, b: .15, a: 0.9 },
  [BlockId.BONFIRE]:        { r: .30, g: .15, b: .05, a: 1 },
  [BlockId.CHEST]:         { r: .55, g: .30, b: .10, a: 1 },
  [BlockId.STONE_SNOW]:    { r: .85, g: .85, b: .90, a: 1 },
  [BlockId.SNOW_POWDER]:   { r: .85, g: .85, b: .90, a: 1 },
  [BlockId.NETHERRACK]:    { r: 0.55, g: 0.15, b: 0.10, a: 1 },
  [BlockId.BASALT]:        { r: 0.18, g: 0.18, b: 0.20, a: 1 },
  [BlockId.NETHERITE_ROCK]:{ r: 0.22, g: 0.20, b: 0.18, a: 1 },
  [BlockId.LAVA]:          { r: 1.00, g: 0.45, b: 0.05, a: 0.92 },
  [BlockId.SOUL_SAND]:     { r: 0.45, g: 0.32, b: 0.25, a: 1 },
  [BlockId.NETHER_STALAGMITE]: { r: 0.44, g: 0.18, b: 0.12, a: 1 },
  [BlockId.NETHER_STALACTITE]: { r: 0.44, g: 0.18, b: 0.12, a: 1 },
};

// ───── Item names for UI ─────
export const ITEM_NAMES: Record<number, string> = {
  [BlockId.AIR]: 'Air',
  [BlockId.STONE]: 'Stone', [BlockId.DIRT]: 'Dirt', [BlockId.GRASS]: 'Grass Block',
  [BlockId.WOOD]: 'Wood', [BlockId.LEAVES]: 'Leaves', [BlockId.SAND]: 'Sand',
  [BlockId.WATER]: 'Water', [BlockId.COBBLESTONE]: 'Cobblestone', [BlockId.PLANK]: 'Planks',
  [BlockId.COAL_ORE]: 'Coal Ore', [BlockId.IRON_ORE]: 'Iron Ore',
  [BlockId.GOLD_ORE]: 'Gold Ore', [BlockId.DIAMOND_ORE]: 'Diamond Ore',
  [BlockId.BEDROCK]: 'Bedrock', [BlockId.GRAVEL]: 'Gravel',
  [BlockId.GLASS]: 'Glass', [BlockId.CRAFTING_TABLE]: 'Crafting Table',
  [BlockId.FURNACE]: 'Furnace', [BlockId.BRICK]: 'Brick',
  [BlockId.WINDOW]: 'Window', [BlockId.WINDOW_OPEN]: 'Open Window',
  [BlockId.DOOR]: 'Door', [BlockId.DOOR_OPEN]: 'Open Door',
  [BlockId.SHRUB]: 'Shrub', [BlockId.TREE]: 'Tree', [BlockId.TALLGRASS]: 'Tall Grass', [BlockId.BONFIRE]: 'Bonfire', [BlockId.CHEST]: 'Chest', [BlockId.STONE_SNOW]: 'Snow Stone', [BlockId.SNOW_POWDER]: 'Snow Powder',
  [BlockId.NETHERRACK]: 'Netherrack',
  [BlockId.BASALT]: 'Basalt',
  [BlockId.NETHERITE_ROCK]: 'Netherite Rock',
  [BlockId.LAVA]: 'Lava',
  [BlockId.SOUL_SAND]: 'Soul Sand',
  [BlockId.NETHER_STALAGMITE]: 'Stalagmite',
  [BlockId.NETHER_STALACTITE]: 'Stalactite',
  [ItemId.STICK]: 'Stick', [ItemId.COAL]: 'Coal', [ItemId.IRON_INGOT]: 'Iron Ingot',
  [ItemId.GOLD_INGOT]: 'Gold Ingot', [ItemId.DIAMOND]: 'Diamond',
  [ItemId.WATER_BUCKET]: 'Water Bucket',
  [ItemId.EMPTY_BUCKET]: 'Bucket',
  [ItemId.BOAT]: 'Boat',
  [ItemId.WOODEN_PICKAXE]: 'Wooden Pickaxe', [ItemId.STONE_PICKAXE]: 'Stone Pickaxe',
  [ItemId.IRON_PICKAXE]: 'Iron Pickaxe', [ItemId.DIAMOND_PICKAXE]: 'Diamond Pickaxe',
  [ItemId.WOODEN_SWORD]: 'Wooden Sword', [ItemId.STONE_SWORD]: 'Stone Sword',
  [ItemId.IRON_SWORD]: 'Iron Sword', [ItemId.DIAMOND_SWORD]: 'Diamond Sword',
  [ItemId.WOODEN_AXE]: 'Wooden Axe', [ItemId.STONE_AXE]: 'Stone Axe',
  [ItemId.IRON_AXE]: 'Iron Axe',
  [ItemId.LEATHER_HELMET]: 'Leather Helmet', [ItemId.LEATHER_CHEST]: 'Leather Chestplate',
  [ItemId.LEATHER_LEGS]: 'Leather Leggings', [ItemId.LEATHER_BOOTS]: 'Leather Boots',
  [ItemId.IRON_HELMET]: 'Iron Helmet', [ItemId.IRON_CHEST]: 'Iron Chestplate',
  [ItemId.IRON_LEGS]: 'Iron Leggings', [ItemId.IRON_BOOTS]: 'Iron Boots',
  [ItemId.DIAMOND_HELMET]: 'Diamond Helmet', [ItemId.DIAMOND_CHEST]: 'Diamond Chestplate',
  [ItemId.DIAMOND_LEGS]: 'Diamond Leggings', [ItemId.DIAMOND_BOOTS]: 'Diamond Boots',
};

// Colour used for item slots in the hotbar/inventory
export const ITEM_COLORS: Record<number, string> = {
  [BlockId.STONE]: '#808080', [BlockId.DIRT]: '#8C5C3C', [BlockId.GRASS]: '#4CA620',
  [BlockId.WOOD]: '#735020', [BlockId.LEAVES]: '#268026', [BlockId.SAND]: '#D9CC8C',
  [BlockId.COBBLESTONE]: '#6B6B6B', [BlockId.PLANK]: '#A6803C',
  [BlockId.COAL_ORE]: '#4D4D4D', [BlockId.IRON_ORE]: '#8C7A73', [BlockId.GOLD_ORE]: '#B3A64D',
  [BlockId.DIAMOND_ORE]: '#59B3BF', [BlockId.GRAVEL]: '#8C8580',
  [BlockId.GLASS]: '#CCE5F2', [BlockId.CRAFTING_TABLE]: '#997336',
  [BlockId.FURNACE]: '#737373', [BlockId.BRICK]: '#B35940',
  [BlockId.WINDOW]: '#CFE6F5', [BlockId.WINDOW_OPEN]: '#CFE6F5',
  [BlockId.DOOR]: '#6F441F', [BlockId.DOOR_OPEN]: '#6F441F',
  [BlockId.SHRUB]: '#268026', [BlockId.TREE]: '#735020', [BlockId.TALLGRASS]: '#4CA620', [BlockId.BONFIRE]: '#FF6600', [BlockId.CHEST]: '#8B4513', [BlockId.STONE_SNOW]: '#DDDDFF', [BlockId.SNOW_POWDER]: '#DDDDFF',
  [BlockId.NETHERRACK]: '#8B2616', [BlockId.BASALT]: '#2E2E33', [BlockId.NETHERITE_ROCK]: '#36302D', [BlockId.LAVA]: '#FF6A19', [BlockId.SOUL_SAND]: '#6E4F40', [BlockId.NETHER_STALAGMITE]: '#8A3A28', [BlockId.NETHER_STALACTITE]: '#8A3A28',
  [ItemId.STICK]: '#8B6914', [ItemId.COAL]: '#333', [ItemId.IRON_INGOT]: '#C0C0C0',
  [ItemId.GOLD_INGOT]: '#FFD700', [ItemId.DIAMOND]: '#5CF',
  [ItemId.WATER_BUCKET]: '#4080FF',
  [ItemId.EMPTY_BUCKET]: '#A0A0A0',
  [ItemId.BOAT]: '#8B4513',
  [ItemId.WOODEN_PICKAXE]: '#8B6914', [ItemId.STONE_PICKAXE]: '#808080',
  [ItemId.IRON_PICKAXE]: '#C0C0C0', [ItemId.DIAMOND_PICKAXE]: '#5CF',
  [ItemId.WOODEN_SWORD]: '#8B6914', [ItemId.STONE_SWORD]: '#808080',
  [ItemId.IRON_SWORD]: '#C0C0C0', [ItemId.DIAMOND_SWORD]: '#5CF',
  [ItemId.WOODEN_AXE]: '#8B6914', [ItemId.STONE_AXE]: '#808080', [ItemId.IRON_AXE]: '#C0C0C0',
  [ItemId.LEATHER_HELMET]: '#8B4513', [ItemId.LEATHER_CHEST]: '#8B4513',
  [ItemId.LEATHER_LEGS]: '#8B4513', [ItemId.LEATHER_BOOTS]: '#8B4513',
  [ItemId.IRON_HELMET]: '#C0C0C0', [ItemId.IRON_CHEST]: '#C0C0C0',
  [ItemId.IRON_LEGS]: '#C0C0C0', [ItemId.IRON_BOOTS]: '#C0C0C0',
  [ItemId.DIAMOND_HELMET]: '#5CF', [ItemId.DIAMOND_CHEST]: '#5CF',
  [ItemId.DIAMOND_LEGS]: '#5CF', [ItemId.DIAMOND_BOOTS]: '#5CF',
};

// ───── Inventory slot ─────
export interface InvSlot { itemId: number; quantity: number; }

// ───── Crafting recipes ─────
export interface CraftRecipe {
  id: number;
  name: string;
  result: { itemId: number; quantity: number };
  ingredients: { itemId: number; quantity: number }[];
}

export const RECIPES: CraftRecipe[] = [
  // Basic
  { id: 1,  name: 'Planks',           result: { itemId: BlockId.PLANK, quantity: 4 },          ingredients: [{ itemId: BlockId.WOOD, quantity: 1 }] },
  { id: 2,  name: 'Sticks',           result: { itemId: ItemId.STICK, quantity: 4 },            ingredients: [{ itemId: BlockId.PLANK, quantity: 2 }] },
  { id: 3,  name: 'Crafting Table',   result: { itemId: BlockId.CRAFTING_TABLE, quantity: 1 },  ingredients: [{ itemId: BlockId.PLANK, quantity: 4 }] },
  { id: 4,  name: 'Furnace',          result: { itemId: BlockId.FURNACE, quantity: 1 },         ingredients: [{ itemId: BlockId.COBBLESTONE, quantity: 8 }] },
  // Pickaxes
  { id: 10, name: 'Wooden Pickaxe',   result: { itemId: ItemId.WOODEN_PICKAXE, quantity: 1 },   ingredients: [{ itemId: BlockId.PLANK, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 11, name: 'Stone Pickaxe',    result: { itemId: ItemId.STONE_PICKAXE, quantity: 1 },    ingredients: [{ itemId: BlockId.COBBLESTONE, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 12, name: 'Iron Pickaxe',     result: { itemId: ItemId.IRON_PICKAXE, quantity: 1 },     ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 13, name: 'Diamond Pickaxe',  result: { itemId: ItemId.DIAMOND_PICKAXE, quantity: 1 },  ingredients: [{ itemId: ItemId.DIAMOND, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  // Swords
  { id: 20, name: 'Wooden Sword',     result: { itemId: ItemId.WOODEN_SWORD, quantity: 1 },     ingredients: [{ itemId: BlockId.PLANK, quantity: 2 }, { itemId: ItemId.STICK, quantity: 1 }] },
  { id: 21, name: 'Stone Sword',      result: { itemId: ItemId.STONE_SWORD, quantity: 1 },      ingredients: [{ itemId: BlockId.COBBLESTONE, quantity: 2 }, { itemId: ItemId.STICK, quantity: 1 }] },
  { id: 22, name: 'Iron Sword',       result: { itemId: ItemId.IRON_SWORD, quantity: 1 },       ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 2 }, { itemId: ItemId.STICK, quantity: 1 }] },
  { id: 23, name: 'Diamond Sword',    result: { itemId: ItemId.DIAMOND_SWORD, quantity: 1 },    ingredients: [{ itemId: ItemId.DIAMOND, quantity: 2 }, { itemId: ItemId.STICK, quantity: 1 }] },
  // Axes
  { id: 30, name: 'Wooden Axe',       result: { itemId: ItemId.WOODEN_AXE, quantity: 1 },       ingredients: [{ itemId: BlockId.PLANK, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 31, name: 'Stone Axe',        result: { itemId: ItemId.STONE_AXE, quantity: 1 },        ingredients: [{ itemId: BlockId.COBBLESTONE, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 32, name: 'Iron Axe',         result: { itemId: ItemId.IRON_AXE, quantity: 1 },         ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  // Smelting (furnace recipes — simplified as crafting)
  { id: 40, name: 'Smelt Iron',       result: { itemId: ItemId.IRON_INGOT, quantity: 1 },       ingredients: [{ itemId: BlockId.IRON_ORE, quantity: 1 }, { itemId: ItemId.COAL, quantity: 1 }] },
  { id: 41, name: 'Smelt Gold',       result: { itemId: ItemId.GOLD_INGOT, quantity: 1 },       ingredients: [{ itemId: BlockId.GOLD_ORE, quantity: 1 }, { itemId: ItemId.COAL, quantity: 1 }] },
  { id: 42, name: 'Smelt Glass',      result: { itemId: BlockId.GLASS, quantity: 1 },           ingredients: [{ itemId: BlockId.SAND, quantity: 1 }, { itemId: ItemId.COAL, quantity: 1 }] },
  // Armor — Leather
  { id: 50, name: 'Leather Helmet',   result: { itemId: ItemId.LEATHER_HELMET, quantity: 1 },   ingredients: [{ itemId: BlockId.LEAVES, quantity: 5 }] },
  { id: 51, name: 'Leather Chestplate', result: { itemId: ItemId.LEATHER_CHEST, quantity: 1 },  ingredients: [{ itemId: BlockId.LEAVES, quantity: 8 }] },
  { id: 52, name: 'Leather Leggings', result: { itemId: ItemId.LEATHER_LEGS, quantity: 1 },     ingredients: [{ itemId: BlockId.LEAVES, quantity: 7 }] },
  { id: 53, name: 'Leather Boots',    result: { itemId: ItemId.LEATHER_BOOTS, quantity: 1 },    ingredients: [{ itemId: BlockId.LEAVES, quantity: 4 }] },
  // Armor — Iron
  { id: 54, name: 'Iron Helmet',      result: { itemId: ItemId.IRON_HELMET, quantity: 1 },      ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 5 }] },
  { id: 55, name: 'Iron Chestplate',  result: { itemId: ItemId.IRON_CHEST, quantity: 1 },       ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 8 }] },
  { id: 56, name: 'Iron Leggings',    result: { itemId: ItemId.IRON_LEGS, quantity: 1 },        ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 7 }] },
  { id: 57, name: 'Iron Boots',       result: { itemId: ItemId.IRON_BOOTS, quantity: 1 },       ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 4 }] },
  // Armor — Diamond
  { id: 58, name: 'Diamond Helmet',   result: { itemId: ItemId.DIAMOND_HELMET, quantity: 1 },   ingredients: [{ itemId: ItemId.DIAMOND, quantity: 5 }] },
  { id: 59, name: 'Diamond Chestplate', result: { itemId: ItemId.DIAMOND_CHEST, quantity: 1 },  ingredients: [{ itemId: ItemId.DIAMOND, quantity: 8 }] },
  { id: 60, name: 'Diamond Leggings', result: { itemId: ItemId.DIAMOND_LEGS, quantity: 1 },     ingredients: [{ itemId: ItemId.DIAMOND, quantity: 7 }] },
  { id: 61, name: 'Diamond Boots',    result: { itemId: ItemId.DIAMOND_BOOTS, quantity: 1 },    ingredients: [{ itemId: ItemId.DIAMOND, quantity: 4 }] },
  // Doors & Windows (crafted from planks)
  { id: 70, name: 'Wooden Window',   result: { itemId: BlockId.WINDOW, quantity: 2 },         ingredients: [{ itemId: BlockId.PLANK, quantity: 3 }] },
  { id: 71, name: 'Wooden Door',     result: { itemId: BlockId.DOOR, quantity: 1 },           ingredients: [{ itemId: BlockId.PLANK, quantity: 6 }] },
  // Shrubs (from leaves - for growing trees)
  { id: 72, name: 'Shrub',           result: { itemId: BlockId.SHRUB, quantity: 1 },            ingredients: [{ itemId: BlockId.LEAVES, quantity: 2 }] },
  // Bonfire (for teleportation)
  { id: 73, name: 'Bonfire',        result: { itemId: BlockId.BONFIRE, quantity: 1 },           ingredients: [{ itemId: ItemId.STICK, quantity: 4 }, { itemId: ItemId.COAL, quantity: 2 }] },
  { id: 74, name: 'Chest',         result: { itemId: BlockId.CHEST, quantity: 1 },           ingredients: [{ itemId: BlockId.PLANK, quantity: 8 }] },
  { id: 75, name: 'Bucket',        result: { itemId: ItemId.EMPTY_BUCKET, quantity: 1 },   ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 3 }] },
  { id: 76, name: 'Boat',          result: { itemId: ItemId.BOAT, quantity: 1 },            ingredients: [{ itemId: BlockId.PLANK, quantity: 5 }] },
];

// ───── World generation constants ─────
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 168;
export const SEA_LEVEL = 20;
export const RENDER_DISTANCE = 4; // chunks
// Height reserved for Nether below the zero-plane (used for display and mapping)
export const NETHER_HEIGHT = Math.floor(WORLD_HEIGHT * 0.32);

// ───── Network DTOs ─────
export interface DCPlayer {
  userId: number;
  posX: number; posY: number; posZ: number;
  yaw: number; pitch: number;
  bodyYaw?: number; // Body rotation (movement direction), head uses yaw/pitch
  health: number;
  maxHealth?: number;
  username: string;
  weapon?: number;
  color?: string;
  helmet?: number;
  chest?: number;
  legs?: number;
  boots?: number;
  level?: number;
  exp?: number;
}

export interface DCWorld {
  id: number;
  seed: number;
  spawnX: number; spawnY: number; spawnZ: number;
}

export interface DCBlockChange {
  chunkX: number; chunkZ: number;
  localX: number; localY: number; localZ: number;
  blockId: number;
}

export interface DCJoinResponse {
  player: {
    id: number; userId: number; worldId: number;
    posX: number; posY: number; posZ: number;
    yaw: number; pitch: number;
    health: number; hunger: number;
    username: string;
    color?: string;
    level?: number;
    exp?: number;
  };
  inventory: { slot: number; itemId: number; quantity: number }[];
  equipment?: { helmet: number; chest: number; legs: number; boots: number; weapon?: number };
  world: DCWorld;
}

// ───── Block-breaking yields (what item(s) you get when you break a block) ─────
export const BLOCK_DROPS: Record<number, { itemId: number; quantity: number }> = {
  [BlockId.STONE]:     { itemId: BlockId.COBBLESTONE, quantity: 1 },
  [BlockId.DIRT]:      { itemId: BlockId.DIRT, quantity: 1 },
  [BlockId.GRASS]:     { itemId: BlockId.DIRT, quantity: 1 },
  [BlockId.WOOD]:      { itemId: BlockId.WOOD, quantity: 1 },
  [BlockId.LEAVES]:    { itemId: BlockId.LEAVES, quantity: 1 },
  [BlockId.SAND]:      { itemId: BlockId.SAND, quantity: 1 },
  [BlockId.COBBLESTONE]: { itemId: BlockId.COBBLESTONE, quantity: 1 },
  [BlockId.PLANK]:     { itemId: BlockId.PLANK, quantity: 1 },
  [BlockId.COAL_ORE]:  { itemId: ItemId.COAL, quantity: 1 },
  [BlockId.IRON_ORE]:  { itemId: BlockId.IRON_ORE, quantity: 1 },
  [BlockId.GOLD_ORE]:  { itemId: BlockId.GOLD_ORE, quantity: 1 },
  [BlockId.DIAMOND_ORE]: { itemId: ItemId.DIAMOND, quantity: 1 },
  [BlockId.GRAVEL]:    { itemId: BlockId.GRAVEL, quantity: 1 },
  [BlockId.GLASS]:     { itemId: BlockId.GLASS, quantity: 1 },
  [BlockId.STONE_SNOW]: { itemId: BlockId.SNOW_POWDER, quantity: 1 },
  [BlockId.CRAFTING_TABLE]: { itemId: BlockId.CRAFTING_TABLE, quantity: 1 },
  [BlockId.FURNACE]:   { itemId: BlockId.FURNACE, quantity: 1 },
  [BlockId.BRICK]:     { itemId: BlockId.BRICK, quantity: 1 },
  [BlockId.WINDOW]:    { itemId: BlockId.PLANK, quantity: 2 },
  [BlockId.DOOR]:      { itemId: BlockId.PLANK, quantity: 3 },
  [BlockId.SHRUB]:     { itemId: BlockId.LEAVES, quantity: 2 },
  [BlockId.TREE]:      { itemId: BlockId.WOOD, quantity: 4 }, // Drops when broken before fully grown
  [BlockId.NETHERRACK]: { itemId: BlockId.NETHERRACK, quantity: 1 },
  [BlockId.BASALT]: { itemId: BlockId.BASALT, quantity: 1 },
  [BlockId.NETHERITE_ROCK]: { itemId: BlockId.NETHERITE_ROCK, quantity: 1 },
  [BlockId.SOUL_SAND]: { itemId: BlockId.SOUL_SAND, quantity: 1 },
  [BlockId.NETHER_STALAGMITE]: { itemId: BlockId.NETHER_STALAGMITE, quantity: 1 },
  [BlockId.NETHER_STALACTITE]: { itemId: BlockId.NETHER_STALACTITE, quantity: 1 },
};

// Is the item an actual placeable block? (Tall grass and bonfire cannot be placed by players via block placement)
export function isPlaceable(itemId: number): boolean {
  return itemId >= 1 && itemId < 100 && itemId !== BlockId.TALLGRASS && itemId !== BlockId.BONFIRE && itemId !== BlockId.CHEST;
}

// Tool speed multipliers for breaking blocks
export function getMiningSpeed(toolId: number): number {
  switch (toolId) {
    case ItemId.WOODEN_PICKAXE: case ItemId.WOODEN_AXE: case ItemId.WOODEN_SWORD: return 2;
    case ItemId.STONE_PICKAXE:  case ItemId.STONE_AXE:  case ItemId.STONE_SWORD:  return 4;
    case ItemId.IRON_PICKAXE:   case ItemId.IRON_AXE:   case ItemId.IRON_SWORD:   return 6;
    case ItemId.DIAMOND_PICKAXE: case ItemId.DIAMOND_SWORD:                        return 8;
    default: return 1;
  }
}

// ───── Block health (hits required to break at base speed) ─────
export const BLOCK_HEALTH: Record<number, number> = {
  [BlockId.BEDROCK]: -1, // Unbreakable
  // 1 hit
  [BlockId.TALLGRASS]: 1,
  [BlockId.SHRUB]: 1,
  // 2 hits
  [BlockId.GRASS]: 2,
  [BlockId.SAND]: 2,
  [BlockId.GRAVEL]: 2,
  [BlockId.LEAVES]: 2,
  [BlockId.TREE]: 2,
  // 3 hits
  [BlockId.DIRT]: 3,
  [BlockId.WOOD]: 3,
  [BlockId.PLANK]: 3,
  [BlockId.COBBLESTONE]: 3,
  [BlockId.BONFIRE]: 3,
  [BlockId.CHEST]: 3,
  // 4 hits
  [BlockId.STONE]: 4,
  [BlockId.COAL_ORE]: 4,
  [BlockId.IRON_ORE]: 4,
  [BlockId.GOLD_ORE]: 4,
  [BlockId.DIAMOND_ORE]: 4,
  [BlockId.GLASS]: 4,
  [BlockId.CRAFTING_TABLE]: 4,
  [BlockId.FURNACE]: 4,
  [BlockId.BRICK]: 4,
  [BlockId.WINDOW]: 4,
  [BlockId.DOOR]: 4,
  [BlockId.NETHERRACK]: 3,
  [BlockId.BASALT]: 4,
  [BlockId.NETHERITE_ROCK]: 12,
  [BlockId.LAVA]: 0,
  [BlockId.SOUL_SAND]: 3,
  [BlockId.NETHER_STALAGMITE]: 2,
  [BlockId.NETHER_STALACTITE]: 2,
  [BlockId.WATER]: 0, // Not mined like solid blocks
};

export function getBlockHealth(blockId: number): number {
  return BLOCK_HEALTH[blockId] ?? 2; // Default to 2 hits
}
