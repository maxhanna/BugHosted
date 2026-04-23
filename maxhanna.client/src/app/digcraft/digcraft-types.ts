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
  GLOWSTONE     = 38, // Nether ceiling clusters, emits light
  QUARTZ_ORE    = 39, // Nether quartz vein
  CRIMSON_STEM  = 40, // Nether crimson forest pillar
  WARPED_STEM   = 41, // Nether warped forest pillar
  // Mountain / deep overworld blocks
  CALCITE       = 42, // White mountain interior filler
  TUFF          = 43, // Dark grey mountain filler
  COPPER_ORE    = 44, // Mountain ore
  AMETHYST      = 45, // Geode crystal
  PACKED_ICE    = 46, // Frozen peaks filler
  // Decorative / structural
  STONE_BRICK   = 47, // Crafted from stone
  SANDSTONE     = 48, // Crafted from sand
  RED_SAND      = 49, // Badlands surface
  FENCE         = 50, // Wooden fence post
  OBSIDIAN      = 51, // Formed where lava meets water; very hard
  SMITHING_TABLE = 52, // Required for netherite upgrades
  AMETHYST_BRICK = 53, // Decorative amethyst bricks (leaf-like purple/grey)
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
  LAVA_BUCKET    = 106,
  NETHERITE_INGOT = 107, // Smelted from Netherite Rock
  QUARTZ          = 108, // Mined from Quartz Ore
  COPPER_INGOT    = 109, // Smelted from Copper Ore
  /** Empty bucket (right-click water to fill) */
  EMPTY_BUCKET    = 152,
  /** Placeable boat — faster movement on water */
  BOAT            = 153,
  WOODEN_PICKAXE  = 110,
  STONE_PICKAXE   = 111,
  IRON_PICKAXE    = 112,
  DIAMOND_PICKAXE = 113,
  NETHERITE_PICKAXE = 114,
  COPPER_PICKAXE  = 115,
  WOODEN_SWORD    = 120,
  STONE_SWORD     = 121,
  IRON_SWORD      = 122,
  DIAMOND_SWORD   = 123,
  NETHERITE_SWORD = 124,
  COPPER_SWORD    = 125,
  WOODEN_AXE      = 130,
  STONE_AXE       = 131,
  IRON_AXE        = 132,
  DIAMOND_AXE     = 133,
  NETHERITE_AXE   = 134,
  COPPER_AXE      = 135,
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
  NETHERITE_HELMET = 154,
  NETHERITE_CHEST  = 155,
  NETHERITE_LEGS   = 156,
  NETHERITE_BOOTS  = 157,
  COPPER_HELMET   = 158,
  COPPER_CHEST    = 159,
  COPPER_LEGS     = 160,
  COPPER_BOOTS    = 161,
  GOLD_HELMET    = 162,
  GOLD_CHEST    = 163,
  GOLD_LEGS     = 164,
  GOLD_BOOTS    = 165,
  GOLD_PICKAXE   = 166,
  GOLD_SWORD    = 167,
  GOLD_AXE     = 168,
  BOW         = 170,
  ARROW       = 171,
  PORK        = 172,
  COOKED_PORK = 173,
  BEEF        = 174,
  COOKED_BEEF = 175,
  MUTTON      = 176,
  COOKED_MUTTON = 177,
  RABBIT_MEAT = 178,
  COOKED_RABBIT = 179,
  BOWL        = 180,
  CAMP_STEW   = 181,
  HUNTER_STEW = 182,
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
  [ItemId.COPPER_PICKAXE]:  { maxDurability: 175, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.IRON_PICKAXE]:    { maxDurability: 251, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.DIAMOND_PICKAXE]: { maxDurability: 1562, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.NETHERITE_PICKAXE]: { maxDurability: 2031, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  // Swords
  [ItemId.WOODEN_SWORD]:    { maxDurability: 60, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.STONE_SWORD]:     { maxDurability: 132, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.COPPER_SWORD]:    { maxDurability: 175, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.IRON_SWORD]:      { maxDurability: 251, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.DIAMOND_SWORD]:   { maxDurability: 1562, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.NETHERITE_SWORD]: { maxDurability: 2031, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  // Axes
  [ItemId.WOODEN_AXE]:      { maxDurability: 60, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.STONE_AXE]:       { maxDurability: 132, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.COPPER_AXE]:      { maxDurability: 175, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.IRON_AXE]:        { maxDurability: 251, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.DIAMOND_AXE]:     { maxDurability: 1562, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.NETHERITE_AXE]:   { maxDurability: 2031, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
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
  [ItemId.NETHERITE_HELMET]: { maxDurability: 407, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.NETHERITE_CHEST]:  { maxDurability: 592, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.NETHERITE_LEGS]:   { maxDurability: 555, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.NETHERITE_BOOTS]:  { maxDurability: 481, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  // Copper Armor (between iron and diamond)
  [ItemId.COPPER_HELMET]:    { maxDurability: 110, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.COPPER_CHEST]:     { maxDurability: 160, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.COPPER_LEGS]:      { maxDurability: 150, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.COPPER_BOOTS]:     { maxDurability: 130, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  // Gold Armor (lower than iron) and Gold Tools
  [ItemId.GOLD_PICKAXE]:   { maxDurability: 33, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.GOLD_SWORD]:    { maxDurability: 33, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.GOLD_AXE]:     { maxDurability: 33, durabilityLossOnBlock: 1, durabilityLossOnHit: 2 },
  [ItemId.GOLD_HELMET]:  { maxDurability: 77, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.GOLD_CHEST]:    { maxDurability: 112, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.GOLD_LEGS]:    { maxDurability: 105, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  [ItemId.GOLD_BOOTS]:   { maxDurability: 78, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
  // Bow (uses durability per shot)
  [ItemId.BOW]:         { maxDurability: 300, durabilityLossOnBlock: 0, durabilityLossOnHit: 1 },
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
  [BlockId.GLOWSTONE]:     { r: 0.95, g: 0.85, b: 0.40, a: 1 },
  [BlockId.QUARTZ_ORE]:    { r: 0.62, g: 0.30, b: 0.25, a: 1 },
  [BlockId.CRIMSON_STEM]:  { r: 0.55, g: 0.10, b: 0.12, a: 1 },
  [BlockId.WARPED_STEM]:   { r: 0.10, g: 0.42, b: 0.40, a: 1 },
  [BlockId.CALCITE]:       { r: 0.88, g: 0.88, b: 0.86, a: 1 },
  [BlockId.TUFF]:          { r: 0.38, g: 0.38, b: 0.35, a: 1 },
  [BlockId.COPPER_ORE]:    { r: 0.55, g: 0.48, b: 0.35, a: 1 },
  [BlockId.AMETHYST]:      { r: 0.55, g: 0.30, b: 0.75, a: 1 },
  [BlockId.PACKED_ICE]:    { r: 0.60, g: 0.75, b: 0.92, a: 1 },
  [BlockId.STONE_BRICK]:   { r: 0.44, g: 0.44, b: 0.44, a: 1 },
  [BlockId.SANDSTONE]:     { r: 0.88, g: 0.82, b: 0.58, a: 1 },
  [BlockId.RED_SAND]:      { r: 0.78, g: 0.42, b: 0.18, a: 1 },
  [BlockId.FENCE]:         { r: 0.65, g: 0.50, b: 0.28, a: 1 },
  [BlockId.OBSIDIAN]:      { r: 0.10, g: 0.08, b: 0.14, a: 1 },
  [BlockId.AMETHYST_BRICK]: { r: 0.50, g: 0.38, b: 0.72, a: 0.9 },
  [BlockId.SMITHING_TABLE]: { r: 0.30, g: 0.22, b: 0.18, a: 1, top: { r: 0.55, g: 0.42, b: 0.30 } },
};

// ───── Item names for UI ─────
export const ITEM_NAMES: Record<number, string> = {
  [BlockId.AIR]: 'Air',
  [BlockId.STONE]: 'Stone', 
  [BlockId.DIRT]: 'Dirt', 
  [BlockId.GRASS]: 'Grass Block',
  [BlockId.WOOD]: 'Wood', 
  [BlockId.LEAVES]: 'Leaves', 
  [BlockId.SAND]: 'Sand',
  [BlockId.WATER]: 'Water', 
  [BlockId.COBBLESTONE]: 'Cobblestone', 
  [BlockId.PLANK]: 'Planks',
  [BlockId.COAL_ORE]: 'Coal Ore', 
  [BlockId.IRON_ORE]: 'Iron Ore',
  [BlockId.GOLD_ORE]: 'Gold Ore', 
  [BlockId.DIAMOND_ORE]: 'Diamond Ore',
  [BlockId.BEDROCK]: 'Bedrock',
  [BlockId.GRAVEL]: 'Gravel',
  [BlockId.GLASS]: 'Glass', 
  [BlockId.CRAFTING_TABLE]: 'Crafting Table',
  [BlockId.FURNACE]: 'Furnace', 
  [BlockId.BRICK]: 'Brick',
  [BlockId.WINDOW]: 'Window', 
  [BlockId.WINDOW_OPEN]: 'Open Window',
  [BlockId.DOOR]: 'Door', 
  [BlockId.DOOR_OPEN]: 'Open Door',
  [BlockId.SHRUB]: 'Shrub', 
  [BlockId.TREE]: 'Tree', 
  [BlockId.TALLGRASS]: 'Tall Grass', 
  [BlockId.BONFIRE]: 'Bonfire', 
  [BlockId.CHEST]: 'Chest', 
  [BlockId.STONE_SNOW]: 'Snow Stone', 
  [BlockId.SNOW_POWDER]: 'Snow Powder',
  [BlockId.NETHERRACK]: 'Netherrack',
  [BlockId.BASALT]: 'Basalt',
  [BlockId.NETHERITE_ROCK]: 'Netherite Rock',
  [BlockId.LAVA]: 'Lava',
  [BlockId.SOUL_SAND]: 'Soul Sand',
  [BlockId.NETHER_STALAGMITE]: 'Stalagmite',
  [BlockId.NETHER_STALACTITE]: 'Stalactite',
  [BlockId.GLOWSTONE]: 'Glowstone',
  [BlockId.QUARTZ_ORE]: 'Quartz Ore',
  [BlockId.CRIMSON_STEM]: 'Crimson Stem',
  [BlockId.WARPED_STEM]: 'Warped Stem',
  [BlockId.CALCITE]: 'Calcite',
  [BlockId.TUFF]: 'Tuff',
  [BlockId.COPPER_ORE]: 'Copper Ore',
  [BlockId.AMETHYST]: 'Amethyst',
  [BlockId.PACKED_ICE]: 'Packed Ice',
  [BlockId.STONE_BRICK]: 'Stone Bricks',
  [BlockId.SANDSTONE]: 'Sandstone',
  [BlockId.RED_SAND]: 'Red Sand',
  [BlockId.FENCE]: 'Fence',
  [BlockId.OBSIDIAN]: 'Obsidian',
  [BlockId.AMETHYST_BRICK]: 'Amethyst Bricks',
  [BlockId.SMITHING_TABLE]: 'Smithing Table',
  [ItemId.STICK]: 'Stick', 
  [ItemId.COAL]: 'Coal', 
  [ItemId.IRON_INGOT]: 'Iron Ingot',
  [ItemId.GOLD_INGOT]: 'Gold Ingot', 
  [ItemId.DIAMOND]: 'Diamond',
  [ItemId.NETHERITE_INGOT]: 'Netherite Ingot',
  [ItemId.QUARTZ]: 'Quartz',
  [ItemId.COPPER_INGOT]: 'Copper Ingot',
  [ItemId.WATER_BUCKET]: 'Water Bucket',
  [ItemId.LAVA_BUCKET]: 'Lava Bucket',
  [ItemId.EMPTY_BUCKET]: 'Bucket',
  [ItemId.BOAT]: 'Boat',
  [ItemId.WOODEN_PICKAXE]: 'Wooden Pickaxe', 
  [ItemId.STONE_PICKAXE]: 'Stone Pickaxe',
  [ItemId.COPPER_PICKAXE]: 'Copper Pickaxe',
  [ItemId.IRON_PICKAXE]: 'Iron Pickaxe', 
  [ItemId.DIAMOND_PICKAXE]: 'Diamond Pickaxe',
  [ItemId.NETHERITE_PICKAXE]: 'Netherite Pickaxe',
  [ItemId.WOODEN_SWORD]: 'Wooden Sword', 
  [ItemId.STONE_SWORD]: 'Stone Sword',
  [ItemId.COPPER_SWORD]: 'Copper Sword',
  [ItemId.IRON_SWORD]: 'Iron Sword', 
  [ItemId.DIAMOND_SWORD]: 'Diamond Sword',
  [ItemId.NETHERITE_SWORD]: 'Netherite Sword',
  [ItemId.WOODEN_AXE]: 'Wooden Axe', 
  [ItemId.STONE_AXE]: 'Stone Axe',
  [ItemId.COPPER_AXE]: 'Copper Axe',
  [ItemId.IRON_AXE]: 'Iron Axe',
  [ItemId.DIAMOND_AXE]: 'Diamond Axe',
  [ItemId.NETHERITE_AXE]: 'Netherite Axe',
  [ItemId.LEATHER_HELMET]: 'Leather Helmet', 
  [ItemId.LEATHER_CHEST]: 'Leather Chestplate',
  [ItemId.LEATHER_LEGS]: 'Leather Leggings', 
  [ItemId.LEATHER_BOOTS]: 'Leather Boots',
  [ItemId.IRON_HELMET]: 'Iron Helmet', 
  [ItemId.IRON_CHEST]: 'Iron Chestplate',
  [ItemId.IRON_LEGS]: 'Iron Leggings', 
  [ItemId.IRON_BOOTS]: 'Iron Boots',
  [ItemId.DIAMOND_HELMET]: 'Diamond Helmet', 
  [ItemId.DIAMOND_CHEST]: 'Diamond Chestplate',
  [ItemId.DIAMOND_LEGS]: 'Diamond Leggings', 
  [ItemId.DIAMOND_BOOTS]: 'Diamond Boots',
  [ItemId.NETHERITE_HELMET]: 'Netherite Helmet',
  [ItemId.NETHERITE_CHEST]: 'Netherite Chestplate',
  [ItemId.NETHERITE_LEGS]: 'Netherite Leggings', 
  [ItemId.NETHERITE_BOOTS]: 'Netherite Boots',
  [ItemId.COPPER_HELMET]: 'Copper Helmet',
  [ItemId.COPPER_CHEST]: 'Copper Chestplate',
  [ItemId.COPPER_LEGS]: 'Copper Leggings',
  [ItemId.COPPER_BOOTS]: 'Copper Boots',
  [ItemId.GOLD_HELMET]: 'Gold Helmet',
  [ItemId.GOLD_CHEST]: 'Gold Chestplate',
  [ItemId.GOLD_LEGS]: 'Gold Leggings',
  [ItemId.GOLD_BOOTS]: 'Gold Boots',
  [ItemId.GOLD_PICKAXE]: 'Gold Pickaxe', 
  [ItemId.GOLD_SWORD]: 'Gold Sword',
  [ItemId.GOLD_AXE]: 'Gold Axe',
  [ItemId.BOW]: 'Bow',
  [ItemId.ARROW]: 'Arrow',
  [ItemId.PORK]: 'Pork',
  [ItemId.COOKED_PORK]: 'Cooked Pork',
  [ItemId.BEEF]: 'Beef',
  [ItemId.COOKED_BEEF]: 'Cooked Beef',
  [ItemId.MUTTON]: 'Mutton',
  [ItemId.COOKED_MUTTON]: 'Cooked Mutton',
  [ItemId.RABBIT_MEAT]: 'Rabbit Meat',
  [ItemId.COOKED_RABBIT]: 'Cooked Rabbit',
  [ItemId.BOWL]: 'Bowl',
  [ItemId.CAMP_STEW]: 'Camp Stew',
  [ItemId.HUNTER_STEW]: "Hunter's Stew",
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
  [BlockId.GLOWSTONE]: '#F2D966', [BlockId.QUARTZ_ORE]: '#9E4D40', [BlockId.CRIMSON_STEM]: '#8C1A1E', [BlockId.WARPED_STEM]: '#1A6B66',
  [BlockId.CALCITE]: '#E0E0DC', [BlockId.TUFF]: '#606059', [BlockId.COPPER_ORE]: '#8C7A59', [BlockId.AMETHYST]: '#8C4DBF', [BlockId.PACKED_ICE]: '#99BFEB',
  [BlockId.STONE_BRICK]: '#707070', [BlockId.SANDSTONE]: '#E0D194', [BlockId.RED_SAND]: '#C76B2E', [BlockId.FENCE]: '#A6803C', [BlockId.OBSIDIAN]: '#1A1424', [BlockId.AMETHYST_BRICK]: '#8B5BC5', [BlockId.SMITHING_TABLE]: '#4A3020',
  [ItemId.STICK]: '#8B6914', [ItemId.COAL]: '#333', [ItemId.IRON_INGOT]: '#C0C0C0',
  [ItemId.GOLD_INGOT]: '#FFD700', [ItemId.DIAMOND]: '#5CF',
  [ItemId.NETHERITE_INGOT]: '#4A3F3A', [ItemId.QUARTZ]: '#F0EAE0', [ItemId.COPPER_INGOT]: '#D4804A',
  [ItemId.WATER_BUCKET]: '#4080FF',
  [ItemId.LAVA_BUCKET]: '#FF6600',
  [ItemId.EMPTY_BUCKET]: '#A0A0A0',
  [ItemId.BOAT]: '#8B4513',
  [ItemId.WOODEN_PICKAXE]: '#8B6914', [ItemId.STONE_PICKAXE]: '#808080',
  [ItemId.COPPER_PICKAXE]: '#D4804A',
  [ItemId.IRON_PICKAXE]: '#C0C0C0', [ItemId.DIAMOND_PICKAXE]: '#5CF',
  [ItemId.NETHERITE_PICKAXE]: '#4A3F3A',
  [ItemId.WOODEN_SWORD]: '#8B6914', [ItemId.STONE_SWORD]: '#808080',
  [ItemId.COPPER_SWORD]: '#D4804A',
  [ItemId.IRON_SWORD]: '#C0C0C0', [ItemId.DIAMOND_SWORD]: '#5CF',
  [ItemId.NETHERITE_SWORD]: '#4A3F3A',
  [ItemId.WOODEN_AXE]: '#8B6914', [ItemId.STONE_AXE]: '#808080', [ItemId.COPPER_AXE]: '#D4804A',
  [ItemId.IRON_AXE]: '#C0C0C0', [ItemId.DIAMOND_AXE]: '#5CF', [ItemId.NETHERITE_AXE]: '#4A3F3A',
  [ItemId.LEATHER_HELMET]: '#8B4513', [ItemId.LEATHER_CHEST]: '#8B4513',
  [ItemId.LEATHER_LEGS]: '#8B4513', [ItemId.LEATHER_BOOTS]: '#8B4513',
  [ItemId.IRON_HELMET]: '#C0C0C0', [ItemId.IRON_CHEST]: '#C0C0C0',
  [ItemId.IRON_LEGS]: '#C0C0C0', [ItemId.IRON_BOOTS]: '#C0C0C0',
  [ItemId.DIAMOND_HELMET]: '#5CF', [ItemId.DIAMOND_CHEST]: '#5CF',
  [ItemId.DIAMOND_LEGS]: '#5CF', [ItemId.DIAMOND_BOOTS]: '#5CF',
  [ItemId.NETHERITE_HELMET]: '#4A3F3A', [ItemId.NETHERITE_CHEST]: '#4A3F3A',
  [ItemId.NETHERITE_LEGS]: '#4A3F3A', [ItemId.NETHERITE_BOOTS]: '#4A3F3A',
  [ItemId.COPPER_HELMET]: '#D4804A', [ItemId.COPPER_CHEST]: '#D4804A',
  [ItemId.COPPER_LEGS]: '#D4804A', [ItemId.COPPER_BOOTS]: '#D4804A',
  [ItemId.GOLD_PICKAXE]: '#FFD700', [ItemId.GOLD_SWORD]: '#FFD700',
  [ItemId.GOLD_AXE]: '#FFD700',
  [ItemId.GOLD_HELMET]: '#FFD700', [ItemId.GOLD_CHEST]: '#FFD700',
  [ItemId.GOLD_LEGS]: '#FFD700', [ItemId.GOLD_BOOTS]: '#FFD700',
  [ItemId.BOW]: '#8B4513', [ItemId.ARROW]: '#C0C0C0',
  [ItemId.PORK]: '#D98C8C',
  [ItemId.COOKED_PORK]: '#9C4F43',
  [ItemId.BEEF]: '#A8554D',
  [ItemId.COOKED_BEEF]: '#6B3B2B',
  [ItemId.MUTTON]: '#B77C71',
  [ItemId.COOKED_MUTTON]: '#70473A',
  [ItemId.RABBIT_MEAT]: '#C68E73',
  [ItemId.COOKED_RABBIT]: '#85583E',
  [ItemId.BOWL]: '#9C6B3F',
  [ItemId.CAMP_STEW]: '#B46A3C',
  [ItemId.HUNTER_STEW]: '#8A4E2D',
};

// ───── Inventory slot ─────
export interface InvSlot { itemId: number; quantity: number; }

export interface FoodInfo {
  hungerRestored: number;
  category: 'raw' | 'cooked' | 'meal';
}

export const FOOD_VALUES: Record<number, FoodInfo> = {
  [ItemId.PORK]: { hungerRestored: 1, category: 'raw' },
  [ItemId.BEEF]: { hungerRestored: 1, category: 'raw' },
  [ItemId.MUTTON]: { hungerRestored: 1, category: 'raw' },
  [ItemId.RABBIT_MEAT]: { hungerRestored: 1, category: 'raw' },
  [ItemId.COOKED_PORK]: { hungerRestored: 4, category: 'cooked' },
  [ItemId.COOKED_BEEF]: { hungerRestored: 5, category: 'cooked' },
  [ItemId.COOKED_MUTTON]: { hungerRestored: 4, category: 'cooked' },
  [ItemId.COOKED_RABBIT]: { hungerRestored: 3, category: 'cooked' },
  [ItemId.CAMP_STEW]: { hungerRestored: 6, category: 'meal' },
  [ItemId.HUNTER_STEW]: { hungerRestored: 8, category: 'meal' },
};

export interface MobDropDefinition {
  itemId: number;
  quantity: number;
}

export const MOB_FOOD_DROPS: Record<string, MobDropDefinition[]> = {
  Pig: [{ itemId: ItemId.PORK, quantity: 2 }],
  Cow: [{ itemId: ItemId.BEEF, quantity: 2 }],
  Sheep: [{ itemId: ItemId.MUTTON, quantity: 2 }],
  Rabbit: [{ itemId: ItemId.RABBIT_MEAT, quantity: 1 }],
};

// ───── Crafting recipes ─────
export interface CraftRecipe {
  id: number;
  name: string;
  result: { itemId: number; quantity: number };
  ingredients: { itemId: number; quantity: number }[];
  /** If true, player must have a Furnace in inventory to craft */
  requiresFurnace?: boolean;
  /** If true, player must have a Smithing Table in inventory to craft */
  requiresSmithingTable?: boolean;
  /** Recipe type for filtering */
  recipeType?: 'general' | 'smithing' | 'furnace';
}

export const RECIPES: CraftRecipe[] = [
  { id: 1,  name: 'Planks',           result: { itemId: BlockId.PLANK, quantity: 4 },          ingredients: [{ itemId: BlockId.WOOD, quantity: 1 }] },
  { id: 2,  name: 'Sticks',           result: { itemId: ItemId.STICK, quantity: 4 },            ingredients: [{ itemId: BlockId.PLANK, quantity: 2 }] },
  { id: 3,  name: 'Crafting Table',   result: { itemId: BlockId.CRAFTING_TABLE, quantity: 1 },  ingredients: [{ itemId: BlockId.PLANK, quantity: 4 }] },
  { id: 4,  name: 'Furnace',          result: { itemId: BlockId.FURNACE, quantity: 1 },         ingredients: [{ itemId: BlockId.COBBLESTONE, quantity: 8 }] },
  { id: 10, name: 'Wooden Pickaxe',   result: { itemId: ItemId.WOODEN_PICKAXE, quantity: 1 },   ingredients: [{ itemId: BlockId.PLANK, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 11, name: 'Stone Pickaxe',    result: { itemId: ItemId.STONE_PICKAXE, quantity: 1 },    ingredients: [{ itemId: BlockId.COBBLESTONE, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 12, name: 'Copper Pickaxe',    result: { itemId: ItemId.COPPER_PICKAXE, quantity: 1 },    ingredients: [{ itemId: ItemId.COPPER_INGOT, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 13, name: 'Iron Pickaxe',     result: { itemId: ItemId.IRON_PICKAXE, quantity: 1 },     ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 14, name: 'Gold Pickaxe', result: { itemId: ItemId.GOLD_PICKAXE, quantity: 1 }, ingredients: [{ itemId: ItemId.GOLD_INGOT, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 15, name: 'Diamond Pickaxe',  result: { itemId: ItemId.DIAMOND_PICKAXE, quantity: 1 },  ingredients: [{ itemId: ItemId.DIAMOND, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 20, name: 'Wooden Sword',     result: { itemId: ItemId.WOODEN_SWORD, quantity: 1 },     ingredients: [{ itemId: BlockId.PLANK, quantity: 2 }, { itemId: ItemId.STICK, quantity: 1 }] },
  { id: 21, name: 'Stone Sword',      result: { itemId: ItemId.STONE_SWORD, quantity: 1 },      ingredients: [{ itemId: BlockId.COBBLESTONE, quantity: 2 }, { itemId: ItemId.STICK, quantity: 1 }] },
  { id: 22, name: 'Copper Sword',     result: { itemId: ItemId.COPPER_SWORD, quantity: 1 },    ingredients: [{ itemId: ItemId.COPPER_INGOT, quantity: 2 }, { itemId: ItemId.STICK, quantity: 1 }] },
  { id: 23, name: 'Gold Sword', result: { itemId: ItemId.GOLD_SWORD, quantity: 1 }, ingredients: [{ itemId: ItemId.GOLD_INGOT, quantity: 2 }, { itemId: ItemId.STICK, quantity: 1 }] },
  { id: 24, name: 'Iron Sword',       result: { itemId: ItemId.IRON_SWORD, quantity: 1 },       ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 2 }, { itemId: ItemId.STICK, quantity: 1 }] },
  { id: 25, name: 'Diamond Sword',    result: { itemId: ItemId.DIAMOND_SWORD, quantity: 1 },    ingredients: [{ itemId: ItemId.DIAMOND, quantity: 2 }, { itemId: ItemId.STICK, quantity: 1 }] },
  { id: 30, name: 'Wooden Axe',       result: { itemId: ItemId.WOODEN_AXE, quantity: 1 },       ingredients: [{ itemId: BlockId.PLANK, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 31, name: 'Stone Axe',        result: { itemId: ItemId.STONE_AXE, quantity: 1 },        ingredients: [{ itemId: BlockId.COBBLESTONE, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 32, name: 'Copper Axe',       result: { itemId: ItemId.COPPER_AXE, quantity: 1 },       ingredients: [{ itemId: ItemId.COPPER_INGOT, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 33, name: 'Iron Axe',         result: { itemId: ItemId.IRON_AXE, quantity: 1 },         ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 34, name: 'Gold Axe', result: { itemId: ItemId.GOLD_AXE, quantity: 1 }, ingredients: [{ itemId: ItemId.GOLD_INGOT, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 35, name: 'Diamond Axe', result: { itemId: ItemId.DIAMOND_AXE, quantity: 1 }, ingredients: [{ itemId: ItemId.DIAMOND, quantity: 3 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 40, name: 'Smelt Iron',       result: { itemId: ItemId.IRON_INGOT, quantity: 1 },       ingredients: [{ itemId: BlockId.IRON_ORE, quantity: 1 }, { itemId: ItemId.COAL, quantity: 1 }], requiresFurnace: true, recipeType: 'furnace' },
  { id: 41, name: 'Smelt Gold',       result: { itemId: ItemId.GOLD_INGOT, quantity: 1 },       ingredients: [{ itemId: BlockId.GOLD_ORE, quantity: 1 }, { itemId: ItemId.COAL, quantity: 1 }], requiresFurnace: true, recipeType: 'furnace' },
  { id: 42, name: 'Smelt Glass',      result: { itemId: BlockId.GLASS, quantity: 1 },           ingredients: [{ itemId: BlockId.SAND, quantity: 1 }, { itemId: ItemId.COAL, quantity: 1 }], requiresFurnace: true, recipeType: 'furnace' },
  { id: 43, name: 'Smelt Netherite', result: { itemId: ItemId.NETHERITE_INGOT, quantity: 1 }, ingredients: [{ itemId: BlockId.NETHERITE_ROCK, quantity: 2 }, { itemId: ItemId.COAL, quantity: 1 }], requiresFurnace: true, recipeType: 'furnace' },
  { id: 44, name: 'Smelt Copper', result: { itemId: ItemId.COPPER_INGOT, quantity: 1 }, ingredients: [{ itemId: BlockId.COPPER_ORE, quantity: 1 }, { itemId: ItemId.COAL, quantity: 1 }], requiresFurnace: true, recipeType: 'furnace' },
  { id: 45, name: 'Smelt Quartz', result: { itemId: ItemId.QUARTZ, quantity: 1 }, ingredients: [{ itemId: BlockId.QUARTZ_ORE, quantity: 1 }, { itemId: ItemId.COAL, quantity: 1 }], requiresFurnace: true, recipeType: 'furnace' },
  { id: 46, name: 'Smelt Brick', result: { itemId: BlockId.BRICK, quantity: 4 }, ingredients: [{ itemId: BlockId.SAND, quantity: 4 }, { itemId: ItemId.COAL, quantity: 1 }], requiresFurnace: true, recipeType: 'furnace' },
  { id: 54, name: 'Leather Helmet',   result: { itemId: ItemId.LEATHER_HELMET, quantity: 1 },   ingredients: [{ itemId: BlockId.LEAVES, quantity: 5 }] },
  { id: 55, name: 'Leather Chestplate', result: { itemId: ItemId.LEATHER_CHEST, quantity: 1 },  ingredients: [{ itemId: BlockId.LEAVES, quantity: 8 }] },
  { id: 56, name: 'Leather Leggings', result: { itemId: ItemId.LEATHER_LEGS, quantity: 1 },     ingredients: [{ itemId: BlockId.LEAVES, quantity: 7 }] },
  { id: 57, name: 'Leather Boots',    result: { itemId: ItemId.LEATHER_BOOTS, quantity: 1 },    ingredients: [{ itemId: BlockId.LEAVES, quantity: 4 }] },
  { id: 58, name: 'Iron Helmet',      result: { itemId: ItemId.IRON_HELMET, quantity: 1 },      ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 5 }] },
  { id: 59, name: 'Iron Chestplate',  result: { itemId: ItemId.IRON_CHEST, quantity: 1 },       ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 8 }] },
  { id: 60, name: 'Iron Leggings',    result: { itemId: ItemId.IRON_LEGS, quantity: 1 },        ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 7 }] },
  { id: 61, name: 'Iron Boots',       result: { itemId: ItemId.IRON_BOOTS, quantity: 1 },       ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 4 }] },
  { id: 62, name: 'Diamond Helmet',   result: { itemId: ItemId.DIAMOND_HELMET, quantity: 1 },   ingredients: [{ itemId: ItemId.DIAMOND, quantity: 5 }] },
  { id: 63, name: 'Diamond Chestplate', result: { itemId: ItemId.DIAMOND_CHEST, quantity: 1 },  ingredients: [{ itemId: ItemId.DIAMOND, quantity: 8 }] },
  { id: 64, name: 'Diamond Leggings', result: { itemId: ItemId.DIAMOND_LEGS, quantity: 1 },     ingredients: [{ itemId: ItemId.DIAMOND, quantity: 7 }] },
  { id: 65, name: 'Diamond Boots',    result: { itemId: ItemId.DIAMOND_BOOTS, quantity: 1 },    ingredients: [{ itemId: ItemId.DIAMOND, quantity: 4 }] },
  { id: 66, name: 'Netherite Helmet', result: { itemId: ItemId.NETHERITE_HELMET, quantity: 1 }, ingredients: [{ itemId: ItemId.DIAMOND_HELMET, quantity: 1 }, { itemId: ItemId.NETHERITE_INGOT, quantity: 1 }], requiresSmithingTable: true, recipeType: 'smithing' },
  { id: 67, name: 'Netherite Chestplate', result: { itemId: ItemId.NETHERITE_CHEST, quantity: 1 }, ingredients: [{ itemId: ItemId.DIAMOND_CHEST, quantity: 1 }, { itemId: ItemId.NETHERITE_INGOT, quantity: 1 }], requiresSmithingTable: true, recipeType: 'smithing' },
  { id: 68, name: 'Netherite Leggings', result: { itemId: ItemId.NETHERITE_LEGS, quantity: 1 }, ingredients: [{ itemId: ItemId.DIAMOND_LEGS, quantity: 1 }, { itemId: ItemId.NETHERITE_INGOT, quantity: 1 }], requiresSmithingTable: true, recipeType: 'smithing' },
  { id: 69, name: 'Netherite Boots', result: { itemId: ItemId.NETHERITE_BOOTS, quantity: 1 }, ingredients: [{ itemId: ItemId.DIAMOND_BOOTS, quantity: 1 }, { itemId: ItemId.NETHERITE_INGOT, quantity: 1 }], requiresSmithingTable: true, recipeType: 'smithing' },
  { id: 70, name: 'Netherite Pickaxe', result: { itemId: ItemId.NETHERITE_PICKAXE, quantity: 1 }, ingredients: [{ itemId: ItemId.DIAMOND_PICKAXE, quantity: 1 }, { itemId: ItemId.NETHERITE_INGOT, quantity: 1 }], requiresSmithingTable: true, recipeType: 'smithing' },
  { id: 71, name: 'Netherite Sword', result: { itemId: ItemId.NETHERITE_SWORD, quantity: 1 }, ingredients: [{ itemId: ItemId.DIAMOND_SWORD, quantity: 1 }, { itemId: ItemId.NETHERITE_INGOT, quantity: 1 }], requiresSmithingTable: true, recipeType: 'smithing' },
  { id: 72, name: 'Netherite Axe', result: { itemId: ItemId.NETHERITE_AXE, quantity: 1 }, ingredients: [{ itemId: ItemId.DIAMOND_AXE, quantity: 1 }, { itemId: ItemId.NETHERITE_INGOT, quantity: 1 }], requiresSmithingTable: true, recipeType: 'smithing' },
  { id: 73, name: 'Copper Helmet', result: { itemId: ItemId.COPPER_HELMET, quantity: 1 }, ingredients: [{ itemId: ItemId.COPPER_INGOT, quantity: 5 }] },
  { id: 74, name: 'Copper Chestplate', result: { itemId: ItemId.COPPER_CHEST, quantity: 1 }, ingredients: [{ itemId: ItemId.COPPER_INGOT, quantity: 8 }] },
  { id: 75, name: 'Copper Leggings', result: { itemId: ItemId.COPPER_LEGS, quantity: 1 }, ingredients: [{ itemId: ItemId.COPPER_INGOT, quantity: 7 }] },
  { id: 76, name: 'Copper Boots', result: { itemId: ItemId.COPPER_BOOTS, quantity: 1 }, ingredients: [{ itemId: ItemId.COPPER_INGOT, quantity: 4 }] },
  { id: 77, name: 'Gold Helmet', result: { itemId: ItemId.GOLD_HELMET, quantity: 1 }, ingredients: [{ itemId: ItemId.GOLD_INGOT, quantity: 5 }] },
  { id: 78, name: 'Gold Chestplate', result: { itemId: ItemId.GOLD_CHEST, quantity: 1 }, ingredients: [{ itemId: ItemId.GOLD_INGOT, quantity: 8 }] },
  { id: 79, name: 'Gold Leggings', result: { itemId: ItemId.GOLD_LEGS, quantity: 1 }, ingredients: [{ itemId: ItemId.GOLD_INGOT, quantity: 7 }] },
  { id: 80, name: 'Gold Boots', result: { itemId: ItemId.GOLD_BOOTS, quantity: 1 }, ingredients: [{ itemId: ItemId.GOLD_INGOT, quantity: 4 }] },
  { id: 88, name: 'Bow',             result: { itemId: ItemId.BOW, quantity: 1 },              ingredients: [{ itemId: ItemId.STICK, quantity: 3 }, { itemId: BlockId.PLANK, quantity: 3 }] },
  { id: 89, name: 'Arrow', result: { itemId: ItemId.ARROW, quantity: 4 }, ingredients: [{ itemId: ItemId.STICK, quantity: 1 }, { itemId: BlockId.PLANK, quantity: 1 }, { itemId: BlockId.STONE, quantity: 1 }] },
  { id: 90, name: 'Arrow', result: { itemId: ItemId.ARROW, quantity: 4 }, ingredients: [{ itemId: ItemId.STICK, quantity: 1 }, { itemId: BlockId.PLANK, quantity: 1 }, { itemId: BlockId.COBBLESTONE, quantity: 1 }] },
  { id: 91, name: 'Smithing Table', result: { itemId: BlockId.SMITHING_TABLE, quantity: 1 }, ingredients: [{ itemId: BlockId.PLANK, quantity: 4 }, { itemId: ItemId.IRON_INGOT, quantity: 2 }] },
  { id: 92, name: 'Amethyst Bricks', result: { itemId: BlockId.AMETHYST_BRICK, quantity: 1 }, ingredients: [{ itemId: BlockId.AMETHYST, quantity: 1 }, { itemId: BlockId.COBBLESTONE, quantity: 1 }] },
  { id: 93, name: 'Obsidian Wall', result: { itemId: BlockId.OBSIDIAN, quantity: 1 }, ingredients: [{ itemId: BlockId.NETHERRACK, quantity: 4 }, { itemId: ItemId.COAL, quantity: 2 }] },
  { id: 94, name: 'Wooden Window', result: { itemId: BlockId.WINDOW, quantity: 2 }, ingredients: [{ itemId: BlockId.PLANK, quantity: 3 }] },
  { id: 95, name: 'Wooden Door', result: { itemId: BlockId.DOOR, quantity: 1 }, ingredients: [{ itemId: BlockId.PLANK, quantity: 6 }] },
  { id: 96, name: 'Shrub', result: { itemId: BlockId.SHRUB, quantity: 1 }, ingredients: [{ itemId: BlockId.LEAVES, quantity: 2 }] },
  { id: 97, name: 'Bonfire', result: { itemId: BlockId.BONFIRE, quantity: 1 }, ingredients: [{ itemId: ItemId.STICK, quantity: 4 }, { itemId: ItemId.COAL, quantity: 2 }] },
  { id: 98, name: 'Chest', result: { itemId: BlockId.CHEST, quantity: 1 }, ingredients: [{ itemId: BlockId.PLANK, quantity: 8 }] },
  { id: 99, name: 'Bucket', result: { itemId: ItemId.EMPTY_BUCKET, quantity: 1 }, ingredients: [{ itemId: ItemId.IRON_INGOT, quantity: 3 }] },
  { id: 100, name: 'Boat', result: { itemId: ItemId.BOAT, quantity: 1 }, ingredients: [{ itemId: BlockId.PLANK, quantity: 5 }] },
  { id: 101, name: 'Stone Bricks', result: { itemId: BlockId.STONE_BRICK, quantity: 4 }, ingredients: [{ itemId: BlockId.STONE, quantity: 4 }] },
  { id: 102, name: 'Castle Bricks', result: { itemId: BlockId.STONE_BRICK, quantity: 4 }, ingredients: [{ itemId: BlockId.COBBLESTONE, quantity: 4 }] },
  { id: 103, name: 'Sandstone', result: { itemId: BlockId.SANDSTONE, quantity: 2 }, ingredients: [{ itemId: BlockId.SAND, quantity: 4 }] },
  { id: 104, name: 'Fence', result: { itemId: BlockId.FENCE, quantity: 3 }, ingredients: [{ itemId: BlockId.PLANK, quantity: 4 }, { itemId: ItemId.STICK, quantity: 2 }] },
  { id: 105, name: 'Cook Pork', result: { itemId: ItemId.COOKED_PORK, quantity: 1 }, ingredients: [{ itemId: ItemId.PORK, quantity: 1 }, { itemId: ItemId.COAL, quantity: 1 }], requiresFurnace: true, recipeType: 'furnace' },
  { id: 106, name: 'Cook Beef', result: { itemId: ItemId.COOKED_BEEF, quantity: 1 }, ingredients: [{ itemId: ItemId.BEEF, quantity: 1 }, { itemId: ItemId.COAL, quantity: 1 }], requiresFurnace: true, recipeType: 'furnace' },
  { id: 107, name: 'Cook Mutton', result: { itemId: ItemId.COOKED_MUTTON, quantity: 1 }, ingredients: [{ itemId: ItemId.MUTTON, quantity: 1 }, { itemId: ItemId.COAL, quantity: 1 }], requiresFurnace: true, recipeType: 'furnace' },
  { id: 108, name: 'Cook Rabbit', result: { itemId: ItemId.COOKED_RABBIT, quantity: 1 }, ingredients: [{ itemId: ItemId.RABBIT_MEAT, quantity: 1 }, { itemId: ItemId.COAL, quantity: 1 }], requiresFurnace: true, recipeType: 'furnace' },
  { id: 109, name: 'Bowl', result: { itemId: ItemId.BOWL, quantity: 2 }, ingredients: [{ itemId: BlockId.PLANK, quantity: 3 }] },
  { id: 110, name: 'Camp Stew', result: { itemId: ItemId.CAMP_STEW, quantity: 1 }, ingredients: [{ itemId: ItemId.COOKED_RABBIT, quantity: 1 }, { itemId: ItemId.COOKED_PORK, quantity: 1 }, { itemId: ItemId.BOWL, quantity: 1 }] },
  { id: 111, name: "Hunter's Stew", result: { itemId: ItemId.HUNTER_STEW, quantity: 1 }, ingredients: [{ itemId: ItemId.COOKED_BEEF, quantity: 1 }, { itemId: ItemId.COOKED_MUTTON, quantity: 1 }, { itemId: ItemId.BOWL, quantity: 1 }] },
];

// ───── World generation constants ─────
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 320;
export const SEA_LEVEL = 20;
export const RENDER_DISTANCE = 4; // chunks
export const MAX_STACK_SIZE = 64;
export const MAX_INVENTORY_LENGTH = 36;
export const PLAYER_ATTACK_MAX_RANGE = 2.2; // blocks (allows reaching 2 blocks away)
export const BOW_ATTACK_MAX_RANGE = 18; // blocks
export const WATER_SOURCE_STRENGTH = 8;
export const LAVA_SOURCE_STRENGTH = 8;
export const WATER_MIN_FLOW_STRENGTH = 1;
export const LAVA_MIN_FLOW_STRENGTH = 4;

export function isFluidBlock(blockId: number): boolean {
  return blockId === BlockId.WATER || blockId === BlockId.LAVA;
}

export function isReplaceableByFluid(blockId: number): boolean {
  return blockId === BlockId.AIR
    || blockId === BlockId.TALLGRASS
    || blockId === BlockId.SHRUB
    || blockId === BlockId.TREE
    || blockId === BlockId.BONFIRE
    || blockId === BlockId.WINDOW_OPEN
    || blockId === BlockId.DOOR_OPEN;
}

export function isWaterloggableBlock(blockId: number): boolean {
  return blockId === BlockId.TALLGRASS
    || blockId === BlockId.SHRUB
    || blockId === BlockId.WINDOW_OPEN
    || blockId === BlockId.DOOR_OPEN;
}

export function blocksFluid(blockId: number): boolean {
  return !isReplaceableByFluid(blockId) && !isFluidBlock(blockId) && blockId !== BlockId.LEAVES;
}
export const MAX_VIEW_DISTANCE = 24;
// Depth of the Nether dimension (y = -NETHER_DEPTH to y = -1)
export const NETHER_DEPTH = 128;
// Height reserved for Nether below the zero-plane (used for display and mapping)
export const NETHER_HEIGHT = Math.floor(WORLD_HEIGHT * 0.32);
export const INVULNERABLE_BLOCKS = [BlockId.CHEST, BlockId.BONFIRE];

// ───── Network DTOs ─────
export interface DCPlayer {
  userId: number;
  posX: number; posY: number; posZ: number;
  yaw: number; pitch: number;
  bodyYaw?: number; // Body rotation (movement direction), head uses yaw/pitch
  isAttacking?: boolean;
  health: number;
  hunger?: number;
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
  face?: string;
}

export interface DCWorld {
  id: number;
  seed: number;
  spawnX: number; spawnY: number; spawnZ: number;
}

export interface DCBlockChange {
  chunkX: number; chunkZ: number;
  localX: number; localY: number; localZ: number;
  blockId: number; waterLevel?: number; fluidIsSource?: boolean;
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
  [BlockId.GLOWSTONE]:    { itemId: BlockId.GLOWSTONE, quantity: 1 },
  [BlockId.QUARTZ_ORE]:   { itemId: ItemId.QUARTZ, quantity: 1 },
  [BlockId.CRIMSON_STEM]: { itemId: BlockId.CRIMSON_STEM, quantity: 1 },
  [BlockId.WARPED_STEM]:  { itemId: BlockId.WARPED_STEM, quantity: 1 },
  [BlockId.CALCITE]:      { itemId: BlockId.CALCITE, quantity: 1 },
  [BlockId.TUFF]:         { itemId: BlockId.TUFF, quantity: 1 },
  [BlockId.COPPER_ORE]:   { itemId: BlockId.COPPER_ORE, quantity: 1 },
  [BlockId.AMETHYST]:     { itemId: BlockId.AMETHYST, quantity: 1 },
  [BlockId.AMETHYST_BRICK]: { itemId: BlockId.AMETHYST_BRICK, quantity: 1 },
  [BlockId.PACKED_ICE]:   { itemId: BlockId.PACKED_ICE, quantity: 1 },
  [BlockId.STONE_BRICK]:  { itemId: BlockId.STONE_BRICK, quantity: 1 },
  [BlockId.SANDSTONE]:    { itemId: BlockId.SANDSTONE, quantity: 1 },
  [BlockId.RED_SAND]:     { itemId: BlockId.RED_SAND, quantity: 1 },
  [BlockId.FENCE]:        { itemId: BlockId.FENCE, quantity: 1 },
  [BlockId.OBSIDIAN]:     { itemId: BlockId.OBSIDIAN, quantity: 1 },
  [BlockId.SMITHING_TABLE]: { itemId: BlockId.SMITHING_TABLE, quantity: 1 },
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
    case ItemId.COPPER_PICKAXE: case ItemId.COPPER_AXE:  case ItemId.COPPER_SWORD: return 5;
    case ItemId.GOLD_PICKAXE: case ItemId.GOLD_AXE:  case ItemId.GOLD_SWORD: return 6;
    case ItemId.IRON_PICKAXE:   case ItemId.IRON_AXE:   case ItemId.IRON_SWORD:   return 7;
    case ItemId.DIAMOND_PICKAXE: case ItemId.DIAMOND_AXE: case ItemId.DIAMOND_SWORD: return 8;
    case ItemId.NETHERITE_PICKAXE: case ItemId.NETHERITE_AXE: case ItemId.NETHERITE_SWORD: return 10;
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
  [BlockId.GLOWSTONE]:    3,
  [BlockId.QUARTZ_ORE]:   4,
  [BlockId.CRIMSON_STEM]: 3,
  [BlockId.WARPED_STEM]:  3,
  [BlockId.CALCITE]:      3,
  [BlockId.TUFF]:         3,
  [BlockId.COPPER_ORE]:   4,
  [BlockId.AMETHYST]:     4,
  [BlockId.AMETHYST_BRICK]: 18,
  [BlockId.PACKED_ICE]:   3,
  [BlockId.STONE_BRICK]:  4,
  [BlockId.SANDSTONE]:    3,
  [BlockId.RED_SAND]:     2,
  [BlockId.FENCE]:        3,
  [BlockId.OBSIDIAN]:     20,
  [BlockId.SMITHING_TABLE]: 4,
};

export function getBlockHealth(blockId: number): number {
  return BLOCK_HEALTH[blockId] ?? 2; // Default to 2 hits
}
