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
}

// ───── Item IDs (items that aren't placeable blocks start at 100) ─────
export const enum ItemId {
  // Blocks are also items (IDs 0-99 mirror BlockId)
  STICK           = 100,
  COAL            = 101,
  IRON_INGOT      = 102,
  GOLD_INGOT      = 103,
  DIAMOND         = 104,
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

// ───── Block colour palette (RGBA 0-1) ─────
export interface BlockColor { r: number; g: number; b: number; a: number; top?: { r: number; g: number; b: number }; }

export const BLOCK_COLORS: Record<number, BlockColor> = {
  [BlockId.STONE]:          { r: .50, g: .50, b: .50, a: 1 },
  [BlockId.DIRT]:           { r: .55, g: .36, b: .24, a: 1 },
  [BlockId.GRASS]:          { r: .55, g: .36, b: .24, a: 1, top: { r: .30, g: .65, b: .20 } },
  [BlockId.WOOD]:           { r: .45, g: .30, b: .15, a: 1 },
  [BlockId.LEAVES]:         { r: .15, g: .55, b: .15, a: .85 },
  [BlockId.SAND]:           { r: .85, g: .80, b: .55, a: 1 },
  [BlockId.WATER]:          { r: .20, g: .40, b: .85, a: .60 },
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
  [BlockId.DOOR]:           { r: .45, g: .30, b: .18, a: 1 },
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
  [ItemId.STICK]: 'Stick', [ItemId.COAL]: 'Coal', [ItemId.IRON_INGOT]: 'Iron Ingot',
  [ItemId.GOLD_INGOT]: 'Gold Ingot', [ItemId.DIAMOND]: 'Diamond',
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
  [ItemId.STICK]: '#8B6914', [ItemId.COAL]: '#333', [ItemId.IRON_INGOT]: '#C0C0C0',
  [ItemId.GOLD_INGOT]: '#FFD700', [ItemId.DIAMOND]: '#5CF',
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
];

// ───── World generation constants ─────
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
export const SEA_LEVEL = 20;
export const RENDER_DISTANCE = 4; // chunks

// ───── Network DTOs ─────
export interface DCPlayer {
  userId: number;
  posX: number; posY: number; posZ: number;
  yaw: number; pitch: number;
  health: number;
  username: string;
  weapon?: number;
  color?: string;
  helmet?: number;
  chest?: number;
  legs?: number;
  boots?: number;
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
  [BlockId.CRAFTING_TABLE]: { itemId: BlockId.CRAFTING_TABLE, quantity: 1 },
  [BlockId.FURNACE]:   { itemId: BlockId.FURNACE, quantity: 1 },
  [BlockId.BRICK]:     { itemId: BlockId.BRICK, quantity: 1 },
  [BlockId.WINDOW]:    { itemId: BlockId.PLANK, quantity: 2 },
  [BlockId.DOOR]:      { itemId: BlockId.PLANK, quantity: 3 },
};

// Is the item an actual placeable block?
export function isPlaceable(itemId: number): boolean {
  return itemId >= 1 && itemId < 100;
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
