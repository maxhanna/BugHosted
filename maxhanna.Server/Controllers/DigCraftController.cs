using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using maxhanna.Server.Controllers.DataContracts.DigCraft;
using System.Collections.Concurrent;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class DigCraftController : ControllerBase
    {
        private readonly Log _log;
        private readonly IConfiguration _config;
        private static readonly ConcurrentDictionary<int, DateTime> _lastAttackAt = new();
        // Track last time a player's health was regenerated (server-side, per-user)
        private static readonly ConcurrentDictionary<int, DateTime> _lastHealthRegenAt = new();
        // Server-authoritative mob state: worldId -> (mobId -> ServerMob)
        private static readonly ConcurrentDictionary<int, ConcurrentDictionary<int, ServerMob>> _worldMobs = new();
        private static int _globalMobId = 1;
        private static bool _mobLoopStarted = false;
        private static CancellationTokenSource _mobLoopCts = new();
        // mob tick/epoch for clients to align simulation
        private static readonly int _mobTickMs = 500;
        private static long _mobEpochStartMs = 0;

        // World generation constants (match client digcraft-types.ts / digcraft-world.ts)
        private const int CHUNK_SIZE = 16;
        private const int WORLD_HEIGHT = 320;
        private const int NETHER_TOP = 128; // y=0..127 = Nether, y=128..167 = Overworld
        private const int SEA_LEVEL = 20;   // relative to overworld base (actual Y = NETHER_TOP + SEA_LEVEL)
        private const int INACTIVITY_TIMEOUT_SECONDS = 15; // how long after last attack before health regen can start
        private const int BLOCK_REGEN_DEBUG_MULTIPLIER = 60; // Should be 1. Increase to test faster (e.g. 60 = check every 0.083s instead of 5s)
        private const float PLAYER_ATTACK_MAX_RANGE = 3.5f;
        private static int[] LEAF_BLOCKIDS = [BlockIds.LEAVES, BlockIds.WARPED_LEAVES, BlockIds.CRIMSON_LEAVES];
        private static int[] REGENERATIVE_BLOCKS = [
            BlockIds.NETHER_STALACTITE,
            BlockIds.NETHER_STALAGMITE,
            BlockIds.SEAWEED,
            BlockIds.WOOD,
            BlockIds.LEAVES, BlockIds.WARPED_LEAVES, BlockIds.CRIMSON_LEAVES,
            BlockIds.BAMBOO];
        // Block id constants (match client digcraft-types.ts)
        private static class BlockIds
        {
            public const int AIR = 0;
            public const int STONE = 1;
            public const int DIRT = 2;
            public const int GRASS = 3;
            public const int WOOD = 4;
            public const int LEAVES = 5;
            public const int SAND = 6;
            public const int WATER = 7;
            public const int COBBLESTONE = 8;
            public const int PLANK = 9;
            public const int COAL_ORE = 10;
            public const int IRON_ORE = 11;
            public const int GOLD_ORE = 12;
            public const int DIAMOND_ORE = 13;
            public const int BEDROCK = 14;
            public const int GRAVEL = 15;
            public const int GLASS = 16;
            public const int CRAFTING_TABLE = 17;
            public const int FURNACE = 18;
            public const int BRICK = 19;
            public const int WINDOW = 20;
            public const int WINDOW_OPEN = 21;
            public const int DOOR = 22;
            public const int DOOR_OPEN = 23;
            public const int SHRUB = 24;
            public const int TREE = 25;
            public const int TALLGRASS = 26;
            public const int BONFIRE = 27;
            public const int CHEST = 28;
            public const int STONE_SNOW = 29;
            public const int SNOW_POWDER = 30;
            public const int NETHERRACK = 31;
            public const int BASALT = 32;
            public const int NETHERITE_ROCK = 33;
            public const int LAVA = 34;
            public const int SOUL_SAND = 35;
            public const int NETHER_STALAGMITE = 36;
            public const int NETHER_STALACTITE = 37;
            public const int GLOWSTONE = 38;
            public const int QUARTZ_ORE = 39;
            public const int CRIMSON_STEM = 40;
            public const int WARPED_STEM = 41;
            public const int CALCITE = 42;
            public const int TUFF = 43;
            public const int COPPER_ORE = 44;
            public const int AMETHYST = 45;
            public const int PACKED_ICE = 46;
            public const int STONE_BRICK = 47;
            public const int SANDSTONE = 48;
            public const int RED_SAND = 49;
            public const int FENCE = 50;
            public const int OBSIDIAN = 51;
            public const int SMITHING_TABLE = 52;
            public const int AMETHYST_BRICK = 53;
            public const int TORCH = 54;
            public const int CAULDRON = 55;
            public const int CAULDRON_LAVA = 56;
            // Deep-ocean additions
            public const int SEAWEED = 57;
            public const int SHIP_WOOD = 58;
            public const int SUNKEN_CHEST = 59;
            public const int CAULDRON_WATER = 60;
            public const int WATCH = 61;
            public const int CRIMSON_PLANK = 62; // Crafted from crimson stems
            public const int WARPED_PLANK = 63; // Crafted from warped stems
            public const int CRIMSON_SLAB = 64;
            public const int WARPED_SLAB = 65;
            public const int CRIMSON_STAIRS = 66;
            public const int WARPED_STAIRS = 67;
            public const int CRIMSON_PRESSURE_PLATE = 68;
            public const int WARPED_PRESSURE_PLATE = 69;
            public const int CRIMSON_TRAPDOOR = 70;
            public const int WARPED_TRAPDOOR = 71;
            public const int CRIMSON_DOOR = 72;
            public const int WARPED_DOOR = 73;
            public const int CRIMSON_FENCE = 74;
            public const int WARPED_FENCE = 75;
            public const int CRIMSON_FENCE_GATE = 76;
            public const int WARPED_FENCE_GATE = 77;
            public const int CRIMSON_SIGN = 78;
            public const int WARPED_SIGN = 79;
            public const int CRIMSON_LEAVES = 80; // Crimson forest leaves
            public const int WARPED_LEAVES = 81; // Warped forest leaves
            public const int CACTUS = 82;
            public const int BAMBOO = 83;
        }

        private static class ItemIds
        {
            // Blocks are also items (0-99) — non-placeable items start at 100
            public const int STICK = 100;
            public const int COAL = 101;
            public const int IRON_INGOT = 102;
            public const int GOLD_INGOT = 103;
            public const int DIAMOND = 104;
            public const int WATER_BUCKET = 105;
            public const int LAVA_BUCKET = 106;
            public const int NETHERITE_INGOT = 107;
            public const int QUARTZ = 108;
            public const int COPPER_INGOT = 109;

            public const int WOODEN_PICKAXE = 110;
            public const int STONE_PICKAXE = 111;
            public const int IRON_PICKAXE = 112;
            public const int DIAMOND_PICKAXE = 113;
            public const int NETHERITE_PICKAXE = 114;
            public const int COPPER_PICKAXE = 115;

            public const int WOODEN_SWORD = 120;
            public const int STONE_SWORD = 121;
            public const int IRON_SWORD = 122;
            public const int DIAMOND_SWORD = 123;
            public const int NETHERITE_SWORD = 124;
            public const int COPPER_SWORD = 125;

            public const int WOODEN_AXE = 130;
            public const int STONE_AXE = 131;
            public const int IRON_AXE = 132;
            public const int DIAMOND_AXE = 133;
            public const int NETHERITE_AXE = 134;
            public const int COPPER_AXE = 135;

            public const int LEATHER_HELMET = 140;
            public const int LEATHER_CHEST = 141;
            public const int LEATHER_LEGS = 142;
            public const int LEATHER_BOOTS = 143;
            public const int IRON_HELMET = 144;
            public const int IRON_CHEST = 145;
            public const int IRON_LEGS = 146;
            public const int IRON_BOOTS = 147;
            public const int DIAMOND_HELMET = 148;
            public const int DIAMOND_CHEST = 149;
            public const int DIAMOND_LEGS = 150;
            public const int DIAMOND_BOOTS = 151;

            public const int EMPTY_BUCKET = 152;
            public const int BOAT = 153;
            public const int NETHERITE_HELMET = 154;
            public const int NETHERITE_CHEST = 155;
            public const int NETHERITE_LEGS = 156;
            public const int NETHERITE_BOOTS = 157;
            public const int COPPER_HELMET = 158;
            public const int COPPER_CHEST = 159;
            public const int COPPER_LEGS = 160;
            public const int COPPER_BOOTS = 161;
            public const int GOLD_HELMET = 162;
            public const int GOLD_CHEST = 163;
            public const int GOLD_LEGS = 164;
            public const int GOLD_BOOTS = 165;
            public const int GOLD_PICKAXE = 166;
            public const int GOLD_SWORD = 167;
            public const int GOLD_AXE = 168;

            public const int TORCH = 169;
            public const int BOW = 170;
            public const int ARROW = 171;
            public const int BONE = 172;
            public const int BONE_ARROW = 173;
            public const int BONE_BOW = 174;
            public const int PORK = 175;
            public const int COOKED_PORK = 176;
            public const int BEEF = 177;
            public const int COOKED_BEEF = 178;
            public const int MUTTON = 179;
            public const int COOKED_MUTTON = 180;
            public const int RABBIT_MEAT = 181;
            public const int COOKED_RABBIT = 182;
            public const int BOWL = 183;
            public const int CAMP_STEW = 184;
            public const int HUNTER_STEW = 185;
            public const int SHIELD = 186;
            public const int WATCH = 187;
            public const int SALMON = 188;
            public const int COOKED_SALMON = 189;
            public const int COD = 190;
            public const int COOKED_COD = 191;
            public const int DONKEY_MEAT = 192;
            public const int COOKED_DONKEY = 193;
            public const int GLOW_INK = 194;
            // Dyes
            public const int WHITE_DYE = 195;
            public const int ORANGE_DYE = 196;
            public const int MAGENTA_DYE = 197;
            public const int LIGHT_BLUE_DYE = 198;
            public const int YELLOW_DYE = 199;
            public const int LIME_DYE = 200;
            public const int PINK_DYE = 201;
            public const int GRAY_DYE = 202;
            public const int LIGHT_GRAY_DYE = 203;
            public const int CYAN_DYE = 204;
            public const int PURPLE_DYE = 205;
            public const int BLUE_DYE = 206;
            public const int BROWN_DYE = 207;
            public const int GREEN_DYE = 208;
            public const int RED_DYE = 209;
            public const int BLACK_DYE = 210;
            // Dyed Leather Armor (211-254)
            public const int LEATHER_HELMET_WHITE = 211;
            public const int LEATHER_CHEST_WHITE = 212;
            public const int LEATHER_LEGS_WHITE = 213;
            public const int LEATHER_BOOTS_WHITE = 214;
            public const int LEATHER_HELMET_ORANGE = 215;
            public const int LEATHER_CHEST_ORANGE = 216;
            public const int LEATHER_LEGS_ORANGE = 217;
            public const int LEATHER_BOOTS_ORANGE = 218;
            public const int LEATHER_HELMET_YELLOW = 219;
            public const int LEATHER_CHEST_YELLOW = 220;
            public const int LEATHER_LEGS_YELLOW = 221;
            public const int LEATHER_BOOTS_YELLOW = 222;
            public const int LEATHER_HELMET_LIME = 223;
            public const int LEATHER_CHEST_LIME = 224;
            public const int LEATHER_LEGS_LIME = 225;
            public const int LEATHER_BOOTS_LIME = 226;
            public const int LEATHER_HELMET_LIGHT_BLUE = 227;
            public const int LEATHER_CHEST_LIGHT_BLUE = 228;
            public const int LEATHER_LEGS_LIGHT_BLUE = 229;
            public const int LEATHER_BOOTS_LIGHT_BLUE = 230;
            public const int LEATHER_HELMET_PINK = 231;
            public const int LEATHER_CHEST_PINK = 232;
            public const int LEATHER_LEGS_PINK = 233;
            public const int LEATHER_BOOTS_PINK = 234;
            public const int LEATHER_HELMET_MAGENTA = 235;
            public const int LEATHER_CHEST_MAGENTA = 236;
            public const int LEATHER_LEGS_MAGENTA = 237;
            public const int LEATHER_BOOTS_MAGENTA = 238;
            public const int LEATHER_HELMET_GRAY = 239;
            public const int LEATHER_CHEST_GRAY = 240;
            public const int LEATHER_LEGS_GRAY = 241;
            public const int LEATHER_BOOTS_GRAY = 242;
            public const int LEATHER_HELMET_LIGHT_GRAY = 243;
            public const int LEATHER_CHEST_LIGHT_GRAY = 244;
            public const int LEATHER_LEGS_LIGHT_GRAY = 245;
            public const int LEATHER_BOOTS_LIGHT_GRAY = 246;
            public const int LEATHER_HELMET_CYAN = 247;
            public const int LEATHER_CHEST_CYAN = 248;
            public const int LEATHER_LEGS_CYAN = 249;
            public const int LEATHER_BOOTS_CYAN = 250;
            public const int LEATHER_HELMET_PURPLE = 251;
            public const int LEATHER_CHEST_PURPLE = 252;
            public const int LEATHER_LEGS_PURPLE = 253;
            public const int LEATHER_BOOTS_PURPLE = 254;
            // Dyed Iron Armor (267-310)
            public const int IRON_HELMET_WHITE = 267;
            public const int IRON_CHEST_WHITE = 268;
            public const int IRON_LEGS_WHITE = 269;
            public const int IRON_BOOTS_WHITE = 270;
            public const int IRON_HELMET_ORANGE = 271;
            public const int IRON_CHEST_ORANGE = 272;
            public const int IRON_LEGS_ORANGE = 273;
            public const int IRON_BOOTS_ORANGE = 274;
            public const int IRON_HELMET_YELLOW = 275;
            public const int IRON_CHEST_YELLOW = 276;
            public const int IRON_LEGS_YELLOW = 277;
            public const int IRON_BOOTS_YELLOW = 278;
            public const int IRON_HELMET_LIME = 279;
            public const int IRON_CHEST_LIME = 280;
            public const int IRON_LEGS_LIME = 281;
            public const int IRON_BOOTS_LIME = 282;
            public const int IRON_HELMET_LIGHT_BLUE = 283;
            public const int IRON_CHEST_LIGHT_BLUE = 284;
            public const int IRON_LEGS_LIGHT_BLUE = 285;
            public const int IRON_BOOTS_LIGHT_BLUE = 286;
            public const int IRON_HELMET_PINK = 287;
            public const int IRON_CHEST_PINK = 288;
            public const int IRON_LEGS_PINK = 289;
            public const int IRON_BOOTS_PINK = 290;
            public const int IRON_HELMET_MAGENTA = 291;
            public const int IRON_CHEST_MAGENTA = 292;
            public const int IRON_LEGS_MAGENTA = 293;
            public const int IRON_BOOTS_MAGENTA = 294;
            public const int IRON_HELMET_GRAY = 295;
            public const int IRON_CHEST_GRAY = 296;
            public const int IRON_LEGS_GRAY = 297;
            public const int IRON_BOOTS_GRAY = 298;
            public const int IRON_HELMET_LIGHT_GRAY = 299;
            public const int IRON_CHEST_LIGHT_GRAY = 300;
            public const int IRON_LEGS_LIGHT_GRAY = 301;
            public const int IRON_BOOTS_LIGHT_GRAY = 302;
            public const int IRON_HELMET_CYAN = 303;
            public const int IRON_CHEST_CYAN = 304;
            public const int IRON_LEGS_CYAN = 305;
            public const int IRON_BOOTS_CYAN = 306;
            public const int IRON_HELMET_PURPLE = 307;
            public const int IRON_CHEST_PURPLE = 308;
            public const int IRON_LEGS_PURPLE = 309;
            public const int IRON_BOOTS_PURPLE = 310;
            // Dyed Diamond Armor (311-354)
            public const int DIAMOND_HELMET_WHITE = 311;
            public const int DIAMOND_CHEST_WHITE = 312;
            public const int DIAMOND_LEGS_WHITE = 313;
            public const int DIAMOND_BOOTS_WHITE = 314;
            public const int DIAMOND_HELMET_ORANGE = 315;
            public const int DIAMOND_CHEST_ORANGE = 316;
            public const int DIAMOND_LEGS_ORANGE = 317;
            public const int DIAMOND_BOOTS_ORANGE = 318;
            public const int DIAMOND_HELMET_YELLOW = 319;
            public const int DIAMOND_CHEST_YELLOW = 320;
            public const int DIAMOND_LEGS_YELLOW = 321;
            public const int DIAMOND_BOOTS_YELLOW = 322;
            public const int DIAMOND_HELMET_LIME = 323;
            public const int DIAMOND_CHEST_LIME = 324;
            public const int DIAMOND_LEGS_LIME = 325;
            public const int DIAMOND_BOOTS_LIME = 326;
            public const int DIAMOND_HELMET_LIGHT_BLUE = 327;
            public const int DIAMOND_CHEST_LIGHT_BLUE = 328;
            public const int DIAMOND_LEGS_LIGHT_BLUE = 329;
            public const int DIAMOND_BOOTS_LIGHT_BLUE = 330;
            public const int DIAMOND_HELMET_PINK = 331;
            public const int DIAMOND_CHEST_PINK = 332;
            public const int DIAMOND_LEGS_PINK = 333;
            public const int DIAMOND_BOOTS_PINK = 334;
            public const int DIAMOND_HELMET_MAGENTA = 335;
            public const int DIAMOND_CHEST_MAGENTA = 336;
            public const int DIAMOND_LEGS_MAGENTA = 337;
            public const int DIAMOND_BOOTS_MAGENTA = 338;
            public const int DIAMOND_HELMET_GRAY = 339;
            public const int DIAMOND_CHEST_GRAY = 340;
            public const int DIAMOND_LEGS_GRAY = 341;
            public const int DIAMOND_BOOTS_GRAY = 342;
            public const int DIAMOND_HELMET_LIGHT_GRAY = 343;
            public const int DIAMOND_CHEST_LIGHT_GRAY = 344;
            public const int DIAMOND_LEGS_LIGHT_GRAY = 345;
            public const int DIAMOND_BOOTS_LIGHT_GRAY = 346;
            public const int DIAMOND_HELMET_CYAN = 347;
            public const int DIAMOND_CHEST_CYAN = 348;
            public const int DIAMOND_LEGS_CYAN = 349;
            public const int DIAMOND_BOOTS_CYAN = 350;
            public const int DIAMOND_HELMET_PURPLE = 351;
            public const int DIAMOND_CHEST_PURPLE = 352;
            public const int DIAMOND_LEGS_PURPLE = 353;
            public const int DIAMOND_BOOTS_PURPLE = 354;
            // Dyed Gold Armor (355-398)
            public const int GOLD_HELMET_WHITE = 355;
            public const int GOLD_CHEST_WHITE = 356;
            public const int GOLD_LEGS_WHITE = 357;
            public const int GOLD_BOOTS_WHITE = 358;
            public const int GOLD_HELMET_ORANGE = 359;
            public const int GOLD_CHEST_ORANGE = 360;
            public const int GOLD_LEGS_ORANGE = 361;
            public const int GOLD_BOOTS_ORANGE = 362;
            public const int GOLD_HELMET_YELLOW = 363;
            public const int GOLD_CHEST_YELLOW = 364;
            public const int GOLD_LEGS_YELLOW = 365;
            public const int GOLD_BOOTS_YELLOW = 366;
            public const int GOLD_HELMET_LIME = 367;
            public const int GOLD_CHEST_LIME = 368;
            public const int GOLD_LEGS_LIME = 369;
            public const int GOLD_BOOTS_LIME = 370;
            public const int GOLD_HELMET_LIGHT_BLUE = 371;
            public const int GOLD_CHEST_LIGHT_BLUE = 372;
            public const int GOLD_LEGS_LIGHT_BLUE = 373;
            public const int GOLD_BOOTS_LIGHT_BLUE = 374;
            public const int GOLD_HELMET_PINK = 375;
            public const int GOLD_CHEST_PINK = 376;
            public const int GOLD_LEGS_PINK = 377;
            public const int GOLD_BOOTS_PINK = 378;
            public const int GOLD_HELMET_MAGENTA = 379;
            public const int GOLD_CHEST_MAGENTA = 380;
            public const int GOLD_LEGS_MAGENTA = 381;
            public const int GOLD_BOOTS_MAGENTA = 382;
            public const int GOLD_HELMET_GRAY = 383;
            public const int GOLD_CHEST_GRAY = 384;
            public const int GOLD_LEGS_GRAY = 385;
            public const int GOLD_BOOTS_GRAY = 386;
            public const int GOLD_HELMET_LIGHT_GRAY = 387;
            public const int GOLD_CHEST_LIGHT_GRAY = 388;
            public const int GOLD_LEGS_LIGHT_GRAY = 389;
            public const int GOLD_BOOTS_LIGHT_GRAY = 390;
            public const int GOLD_HELMET_CYAN = 391;
            public const int GOLD_CHEST_CYAN = 392;
            public const int GOLD_LEGS_CYAN = 393;
            public const int GOLD_BOOTS_CYAN = 394;
            public const int GOLD_HELMET_PURPLE = 395;
            public const int GOLD_CHEST_PURPLE = 396;
            public const int GOLD_LEGS_PURPLE = 397;
            public const int GOLD_BOOTS_PURPLE = 398;
        }

        // Biome IDs (match client digcraft-biome.ts)
        private static class BiomeIds
        {
            public const int UNKNOWN = 0;
            public const int OCEAN = 1;
            public const int DEEP_OCEAN = 2;
            public const int COLD_OCEAN = 3;
            public const int FROZEN_OCEAN = 4;
            public const int LUKWARM_OCEAN = 5;
            public const int WARM_OCEAN = 6;
            public const int RIVER = 7;
            public const int FROZEN_RIVER = 8;
            public const int BEACH = 9;
            public const int SNOWY_BEACH = 10;
            public const int PLAINS = 11;
            public const int SUNFLOWER_PLAINS = 12;
            public const int SNOWY_PLAINS = 13;
            public const int ICE_PLAINS = 14;
            public const int ICE_SPIKE_PLAINS = 15;
            public const int MUSHROOM_FIELD = 16;
            public const int DESERT = 17;
            public const int BADLANDS = 18;
            public const int WOODED_BADLANDS = 19;
            public const int ERODED_BADLANDS = 20;
            public const int FOREST = 21;
            public const int BIRCH_FOREST = 22;
            public const int DARK_FOREST = 23;
            public const int FLOWER_FOREST = 24;
            public const int OLD_GROWTH_BIRCH_FOREST = 25;
            public const int TAIGA = 26;
            public const int SNOWY_TAIGA = 27;
            public const int OLD_GROWTH_SPRUCE_TAIGA = 28;
            public const int OLD_GROWTH_PINE_TAIGA = 29;
            public const int JUNGLE = 30;
            public const int BAMBOO_JUNGLE = 31;
            public const int SPARSE_JUNGLE = 32;
            public const int SWAMP = 33;
            public const int MANGROVE_SWAMP = 34;
            public const int SAVANNA = 35;
            public const int SAVANNA_PLATEAU = 36;
            public const int WINDSWEPT_SAVANNA = 37;
            public const int MEADOW = 38;
            public const int GROVE = 39;
            public const int CHERRY_GROVE = 40;
            public const int PALE_GARDEN = 41;
            public const int DEEP_DARK = 42;
            public const int DRIPSTONE_CAVES = 43;
            public const int LUSH_CAVES = 44;
            public const int JAGGED_PEAKS = 45;
            public const int FROZEN_PEAKS = 46;
            public const int STONY_PEAKS = 47;
            public const int SNOWY_SLOPES = 48;
            public const int WINDSWEPT_HILLS = 49;
            public const int WINDSWEPT_FOREST = 50;
            public const int WINDSWEPT_GRAVELLY_HILLS = 51;
            public const int STONY_SHORE = 52;
            public const int NETHER_WASTES = 53;
            public const int SOUL_SAND_VALLEY = 54;
            public const int BASALT_DELTAS = 55;
            public const int CRIMSON_FOREST = 56;
            public const int WARPED_FOREST = 57;
            public const int THE_END = 58;
            public const int END_BARRENS = 59;
            public const int END_HIGHLANDS = 60;
            public const int END_MIDLANDS = 61;
            public const int SMALL_END_ISLANDS = 62;
            public const int CONIFEROUS_TAIGA = 63;
            public const int LUKEWARM_OCEAN = 64;
            public const int DEEP_COLD_OCEAN = 65;
            public const int DEEP_FROZEN_OCEAN = 66;
            public const int DEEP_LUKEWARM_OCEAN = 67;
            public const int DEEP_WARM_OCEAN = 68;
        }

        private struct TerrainColumnSample
        {
            public int Height;
            public int Biome;
        }

        // Tree growth constants
        private const long SHRUB_GROW_TIME_MS = 40 * 60 * 1000; // 40 minutes

        // Track if block growth loop has started
        private static bool _blockGrowthLoopStarted = false;
        private static CancellationTokenSource _blockGrowthLoopCts = new();

        // Fluid simulation loop
        private static bool _fluidLoopStarted = false;
        private static CancellationTokenSource _fluidLoopCts = new();

        // Track prior durabilities to detect item breaks and notify player
        private static Dictionary<int, (int weapon, int helmet, int chest, int legs, int boots)> _priorDurabilities = new();

        // Chests are persisted in the database only; no server-side in-memory cache.

        private class Bonfire
        {
            public int Id;
            public int UserId;
            public int X;
            public int Y;
            public int Z;
            public string Nickname = string.Empty;
            public DateTime CreatedAt = DateTime.UtcNow;
        }

        internal class ChestItem
        {
            public int ItemId;
            public int Quantity;
        }

        private class Chest
        {
            public int Id;
            public int UserId;
            public int WorldId;
            public int X;
            public int Y;
            public int Z;
            public string Nickname = string.Empty;
            public List<ChestItem> Items = new();
            public DateTime CreatedAt = DateTime.UtcNow;
        }

        private List<ChestItem> GenerateSunkenChestLoot(int worldSeed)
        {
            var loot = new List<ChestItem>();
            var rng = new Random(worldSeed);

            // Guaranteed: 1-3 gold ingots
            loot.Add(new ChestItem { ItemId = ItemIds.GOLD_INGOT, Quantity = rng.Next(1, 4) });

            // 1-2 diamonds (uncommon)
            if (rng.NextDouble() < 0.6) loot.Add(new ChestItem { ItemId = ItemIds.DIAMOND, Quantity = rng.Next(1, 3) });

            // 2-5 iron ingots
            loot.Add(new ChestItem { ItemId = ItemIds.IRON_INGOT, Quantity = rng.Next(2, 6) });

            // Chance-based: copper ingots
            if (rng.NextDouble() < 0.7) loot.Add(new ChestItem { ItemId = ItemIds.COPPER_INGOT, Quantity = rng.Next(2, 5) });

            // Chance-based: 1-4 emeralds
            if (rng.NextDouble() < 0.4) loot.Add(new ChestItem { ItemId = ItemIds.DIAMOND_PICKAXE, Quantity = rng.Next(1, 5) });

            // Chance-based: ancient debris scrap
            if (rng.NextDouble() < 0.25) loot.Add(new ChestItem { ItemId = ItemIds.NETHERITE_INGOT, Quantity = 1 });

            // Always some coal
            loot.Add(new ChestItem { ItemId = ItemIds.COAL, Quantity = rng.Next(3, 8) });

            // Chance: 1-2 quartz
            if (rng.NextDouble() < 0.5) loot.Add(new ChestItem { ItemId = ItemIds.QUARTZ, Quantity = rng.Next(1, 3) });

            // Rare: enchanted book (bow)
            if (rng.NextDouble() < 0.15) loot.Add(new ChestItem { ItemId = ItemIds.BOW, Quantity = 1 });

            return loot;
        }

        public DigCraftController(Log log, IConfiguration config)
        {
            _log = log;
            _config = config;

            // Start the background mob simulation loop once
            if (!_mobLoopStarted)
            {
                _mobLoopStarted = true;
                _mobLoopCts = new CancellationTokenSource();
                _ = Task.Run(() => MobSimulationLoopAsync(_mobLoopCts.Token));
            }

            // Start block growth loop (for shrubs -> trees)
            if (!_blockGrowthLoopStarted)
            {
                _blockGrowthLoopStarted = true;
                _blockGrowthLoopCts = new CancellationTokenSource();
                _ = Task.Run(() => BlockGrowthLoopAsync(_blockGrowthLoopCts.Token));
            }

            // Start fluid simulation loop
            if (!_fluidLoopStarted)
            {
                _fluidLoopStarted = true;
                _fluidLoopCts = new CancellationTokenSource();
                _ = Task.Run(() => FluidSimulationLoopAsync(_fluidLoopCts.Token));
            }
        }

        // Internal server-side representation of a mob
        private class ServerMob
        {
            public int Id;
            public string Type = string.Empty;
            public float PosX;
            public float PosY;
            public float PosZ;
            public float Yaw;
            public int Health;
            public int MaxHealth;
            public bool Hostile;
            public DateTime LastAttackAt = DateTime.MinValue;
            public float Speed = 1.0f;
            // Home/spawn position so mobs can reset when no players nearby
            public float HomeX;
            public float HomeY;
            public float HomeZ;
            // Last time (ms epoch) the mob was active (had players nearby)
            public long LastActiveMs = 0;
            // Time when mob died (for respawn delay)
            public long DiedAtMs = 0;
            // A* path: list of (wx, wy, wz) waypoints, index 0 = next step
            public List<(int x, int y, int z)>? Path = null;
            public long PathComputedAtMs = 0;
            // Block the mob is currently trying to break (world coords)
            public (int x, int y, int z)? BreakTarget = null;
            public float BreakProgress = 0f; // 0..1
            public DateTime LastBreakAt = DateTime.MinValue;
        }

        // Respawn delay in ms (30 seconds)
        private const long MOB_RESPAWN_DELAY_MS = 30000;

        // Bear spawn conditions 
        private const int BEAR_HEALTH = 30;
        private const float BEAR_SPEED = 0.7f;
        private const int BEAR_DAMAGE = 8;
        private void EnsureWorldMobsInitialized(int worldId)
        {
            _worldMobs.GetOrAdd(worldId, wid =>
            {
                var dict = new ConcurrentDictionary<int, ServerMob>();
                try
                {
                    // Spawn a small set of initial mobs deterministically from world seed
                    using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                    conn.Open();
                    int seed = 42; float spawnX = 8, spawnY = 34, spawnZ = 8;
                    using (var wCmd = new MySqlCommand("SELECT seed, spawn_x, spawn_y, spawn_z FROM maxhanna.digcraft_worlds WHERE id=@wid", conn))
                    {
                        wCmd.Parameters.AddWithValue("@wid", wid);
                        using var r = wCmd.ExecuteReader();
                        if (r.Read())
                        {
                            seed = r.IsDBNull(r.GetOrdinal("seed")) ? 42 : r.GetInt32("seed");
                            spawnX = r.IsDBNull(r.GetOrdinal("spawn_x")) ? 8 : r.GetFloat("spawn_x");
                            spawnY = r.IsDBNull(r.GetOrdinal("spawn_y")) ? 34 : r.GetFloat("spawn_y");
                            spawnZ = r.IsDBNull(r.GetOrdinal("spawn_z")) ? 8 : r.GetFloat("spawn_z");
                        }
                    }

                    var rand = new System.Random(seed ^ wid);
                    var typesDay = new[] { "Pig", "Cow", "Sheep" };
                    var typesNight = new[] { "Zombie", "Skeleton" };
                    var types = typesDay.Concat(typesNight).Concat(new[] {
                        "Camel", "Goat", "Blaze", "WitherSkeleton", "Ghast", "Strider", "Hoglin",
                        "Armadillo", "Llama", "Parrot", "Ocelot", "PolarBear", "Fox",
                        "Wolf", "Bear", "Deer", "Frog", "Axolotl", "Turtle", "Dolphin", "Horse", "Rabbit",
                        "Tadpole", "Bee", "CaveSpider", "Enderman", "Panda", "Spider",
                        "WoodsWolf", "SavannahWolf", "MountainWolf"
                    }).ToArray();
                    // Increase initial spawn count and distribute mobs across a larger
                    // area around world spawn so mobs appear throughout the map rather
                    // than clustered near the single spawn point.
                    int spawnCount = 48;
                    // How far (blocks) from spawn to spread mobs (square area +/- spawnSpread)
                    float spawnSpread = 256f;
                    for (int i = 0; i < spawnCount; i++)
                    {
                        // Use seeded random offsets so distribution is deterministic per-world
                        var offX = (float)((rand.NextDouble() * 2.0) - 1.0) * spawnSpread;
                        var offZ = (float)((rand.NextDouble() * 2.0) - 1.0) * spawnSpread;
                        var wx = (float)(spawnX + offX);
                        var wz = (float)(spawnZ + offZ);
                        // keep initial Y near configured spawn Y (clients will re-align when chunks available)
                        var wy = spawnY;
                        var t = types[rand.Next(types.Length)];
                        var hostile = t == "Zombie" || t == "Skeleton" || t == "WitherSkeleton" || t == "Blaze" || t == "Ghast" || t == "Hoglin" || t == "TridentZombie" || t == "Shark" || t == "Wither" || t == "Slime";
                        var initHealth = t switch
                        {
                            "WitherSkeleton" => 35,
                            "Zombie" => 20,
                            "Skeleton" => 20,
                            "Blaze" => 20,
                            "Hoglin" => 40,
                            "Strider" => 20,
                            "Camel" => 32,
                            "PolarBear" => 30,
                            "Turtle" => 30,
                            "Llama" => 15,
                            "Horse" => 15,
                            "Axolotl" => 14,
                            "Armadillo" => 12,
                            "TridentZombie" => 22,
                            "Shark" => 30,
                            "Ghast" => 10,
                            "Slime" => 20,
                            "Wither" => 300,
                            "Frog" => 10,
                            "Rabbit" => 3,
                            "Parrot" => 6,
                            "Bear" => BEAR_HEALTH,
                            _ => 10
                        };
                        var initSpeed = t switch
                        {
                            "Blaze" => 1.4f,
                            "Skeleton" => 1.3f,
                            "WitherSkeleton" => 1.2f,
                            "Zombie" => 1.15f,
                            "Hoglin" => 1.2f,
                            "Fox" => 1.2f,
                            "Dolphin" => 1.2f,
                            "Ocelot" => 1.1f,
                            "Goat" => 1.1f,
                            "Wolf" => 1.1f,
                            "Deer" => 1.1f,
                            "Horse" => 1.3f,
                            "Rabbit" => 1.3f,
                            "Camel" => 0.7f,
                            "Strider" => 0.6f,
                            "Bear" => BEAR_SPEED,
                            "TridentZombie" => 1.05f,
                            "Shark" => 1.6f,
                            "Ghast" => 0.5f,
                            "Slime" => 0.8f,
                            "Wither" => 1.0f,
                            _ => 0.9f
                        };
                        var mob = new ServerMob
                        {
                            Id = Interlocked.Increment(ref _globalMobId),
                            Type = t,
                            PosX = wx,
                            // Use camera/eye-style Y so clients rendering mobs align correctly
                            PosY = wy + 1f + 1.6f,
                            PosZ = wz,
                            Yaw = 0,
                            Health = initHealth,
                            MaxHealth = initHealth,
                            Hostile = hostile,
                            Speed = initSpeed
                        };
                        // record home/spawn and initial active timestamp
                        mob.HomeX = mob.PosX;
                        mob.HomeY = mob.PosY;
                        mob.HomeZ = mob.PosZ;
                        mob.LastActiveMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                        dict[mob.Id] = mob;
                    }
                }
                catch (Exception ex)
                {
                    _ = _log.Db("EnsureWorldMobsInitialized error: " + ex.Message, null, "DIGCRAFT", true);
                }
                return dict;
            });
        }

        // Check whether a candidate position would overlap any player or other mob
        private bool PositionBlockedByEntity(float candX, float candZ, List<(int userId, float x, float y, float z)> players, ConcurrentDictionary<int, ServerMob> mobs, int excludeMobId)
        {
            const float minDist = 0.75f; // minimum center distance allowed between entities
            var minDist2 = minDist * minDist;
            if (players != null)
            {
                foreach (var p in players)
                {
                    var dx = candX - p.x; var dz = candZ - p.z;
                    if (dx * dx + dz * dz < minDist2) return true;
                }
            }
            if (mobs != null)
            {
                foreach (var kv in mobs)
                {
                    var om = kv.Value;
                    if (om == null) continue;
                    if (om.Id == excludeMobId) continue;
                    var dx = candX - om.PosX; var dz = candZ - om.PosZ;
                    if (dx * dx + dz * dz < minDist2) return true;
                }
            }
            return false;
        }

        // Check if there's enough head clearance at position (for mob to go under blocks in caves)
        private bool HasHeadClearance(int worldSeed, float candX, float candZ, float currentY)
        {
            int gx = (int)Math.Floor(candX);
            int gz = (int)Math.Floor(candZ);
            // Mob eye height is 1.6 above feet, check if there's air at eye level
            int eyeY = (int)Math.Floor(currentY - 1.6f + 1.0f); // +1 to check 1 block above current feet
            // Check a few blocks above for head clearance in caves/overhead
            for (int checkY = eyeY; checkY <= eyeY + 2; checkY++)
            {
                int bid = GetBaseBlockId(worldSeed, gx, checkY, gz);
                if (bid != BlockIds.AIR && bid != BlockIds.WATER && bid != BlockIds.LAVA
                    && bid != BlockIds.LEAVES && bid != BlockIds.TALLGRASS && bid != BlockIds.SHRUB)
                {
                    return false; // Blocked above
                }
            }
            return true; // Has head clearance
        }

        // ── Mob Pathfinder (A* on a 3D grid, Minecraft-style) ──────────────────────────
        // Finds a walkable path from mob position to target, respecting terrain and
        // player-placed blocks. Returns a list of block-centre waypoints or null if
        // no path exists within the search budget.
        // Rules: max 1 block step up/down, no walking on water/lava, no falling into holes.
        private static List<(int x, int y, int z)>? FindPath(
            int startX, int startY, int startZ,
            int goalX, int goalY, int goalZ,
            int worldSeed,
            Dictionary<(int, int, int), int> blockChanges,
            int maxNodes = 400)
        {
            int GetBid(int x, int y, int z)
            {
                if (blockChanges.TryGetValue((x, y, z), out var bid)) return bid;
                return GetBaseBlockId(worldSeed, x, y, z);
            }

            // Valid floor: solid block that is NOT fluid (mobs don't walk on water/lava)
            bool IsValidFloor(int x, int y, int z)
            {
                int b = GetBid(x, y, z);
                return b != BlockIds.AIR && b != BlockIds.WATER && b != BlockIds.LAVA
                    && b != BlockIds.LEAVES && b != BlockIds.TALLGRASS && b != BlockIds.SHRUB;
            }

            // Passable: mob body can occupy this cell
            bool IsPassable(int x, int y, int z)
            {
                int b = GetBid(x, y, z);
                return b == BlockIds.AIR || b == BlockIds.WATER || b == BlockIds.LAVA
                    || b == BlockIds.LEAVES || b == BlockIds.TALLGRASS || b == BlockIds.SHRUB || b == BlockIds.SEAWEED || b == BlockIds.BAMBOO
                    || b == BlockIds.WINDOW_OPEN || b == BlockIds.DOOR_OPEN;
            }

            // Walkable: valid non-fluid floor, passable feet + head
            bool IsWalkable(int x, int y, int z)
            {
                if (y < 1 || y >= WORLD_HEIGHT - 1) return false;
                if (!IsValidFloor(x, y - 1, z)) return false;
                if (!IsPassable(x, y, z)) return false;
                if (!IsPassable(x, y + 1, z)) return false;
                return true;
            }

            static int H(int ax, int ay, int az, int bx, int by, int bz) =>
                Math.Abs(ax - bx) + Math.Abs(ay - by) + Math.Abs(az - bz);

            // Simple list-based open set (small enough that linear scan is fine)
            var openList = new List<(int f, (int, int, int) pos)>();
            var gScore = new Dictionary<(int, int, int), int>();
            var parent = new Dictionary<(int, int, int), (int, int, int)?>();
            var inOpen = new HashSet<(int, int, int)>();

            var start = (startX, startY, startZ);
            var goal = (goalX, goalY, goalZ);

            gScore[start] = 0;
            parent[start] = null;
            openList.Add((H(startX, startY, startZ, goalX, goalY, goalZ), start));
            inOpen.Add(start);

            var dirs4 = new (int dx, int dz)[] { (1, 0), (-1, 0), (0, 1), (0, -1) };

            int explored = 0;
            while (openList.Count > 0 && explored < maxNodes)
            {
                // Pop lowest-f node
                int bestIdx = 0;
                for (int i = 1; i < openList.Count; i++)
                    if (openList[i].f < openList[bestIdx].f) bestIdx = i;
                var (_, cur) = openList[bestIdx];
                openList.RemoveAt(bestIdx);
                inOpen.Remove(cur);
                explored++;

                if (cur == goal)
                {
                    var path = new List<(int, int, int)>();
                    var n = goal;
                    while (parent.TryGetValue(n, out var p) && p.HasValue)
                    { path.Add(n); n = p.Value; }
                    path.Reverse();
                    return path.Count > 0 ? path : null;
                }

                int cg = gScore[cur];
                var (cx, cy, cz) = cur;

                foreach (var (dx, dz) in dirs4)
                {
                    int nx = cx + dx, nz = cz + dz;

                    // Try flat first, then step-up (+1), then step-down (-1)
                    foreach (int dy in new[] { 0, 1, -1 })
                    {
                        int ny = cy + dy;
                        var nb = (nx, ny, nz);

                        if (!IsWalkable(nx, ny, nz)) continue;

                        // Step-up: source must have head clearance for the jump
                        if (dy == 1 && !IsPassable(cx, cy + 1, cz)) continue;
                        // Step-down: landing floor must be solid (no falling into holes)
                        if (dy == -1 && !IsValidFloor(nx, ny - 1, nz)) continue;

                        int ng = cg + 1 + (dy != 0 ? 1 : 0);
                        if (gScore.TryGetValue(nb, out int ex) && ex <= ng) continue;

                        gScore[nb] = ng;
                        parent[nb] = cur;
                        if (!inOpen.Contains(nb))
                        {
                            openList.Add((ng + H(nx, ny, nz, goalX, goalY, goalZ), nb));
                            inOpen.Add(nb);
                        }
                        break; // take first valid dy for this direction
                    }
                }
            }
            return null;
        }

        // Returns true if the mob type can break blocks to reach players
        private static bool CanBreakBlocks(string mobType) =>
            mobType is "Zombie" or "Skeleton" or "WitherSkeleton";

        // Returns true if a block can be broken by a mob (not bedrock, not air, not fluid)
        private static bool IsMobBreakable(int blockId) =>
            blockId != BlockIds.AIR && blockId != BlockIds.BEDROCK
            && blockId != BlockIds.WATER && blockId != BlockIds.LAVA;

        // How many seconds a mob takes to break a block (Minecraft-ish values)
        private static float MobBreakTime(string mobType, int blockId) => blockId switch
        {
            BlockIds.OBSIDIAN => 999f, // can't break obsidian
            BlockIds.STONE or BlockIds.COBBLESTONE or BlockIds.STONE_BRICK => 6f,
            BlockIds.BRICK => 5f,
            BlockIds.PLANK or BlockIds.WOOD => 2f,
            BlockIds.GLASS or BlockIds.WINDOW => 0.5f,
            BlockIds.DOOR or BlockIds.DOOR_OPEN => 1.5f,
            _ => 3f
        };

        // --- Minimal deterministic terrain sampling (port of client generator heightmap) ---
        private static double SmoothNoise(double t) => t * t * (3.0 - 2.0 * t);

        private static double Hash2D(int seed, int ix, int iz)
        {
            unchecked
            {
                long h = ((long)ix * 374761393L + (long)iz * 668265263L + (long)seed * 1274126177L) & 0x7fffffffL;
                h = ((h ^ (h >> 13)) * 1103515245L + 12345L) & 0x7fffffffL;
                return (double)(h & 0xffffL) / 65536.0;
            }
        }

        private static double Noise2D(int seed, int x, int z, double scale)
        {
            var xd = x / scale;
            var zd = z / scale;
            var sx = (int)Math.Floor(xd);
            var sz = (int)Math.Floor(zd);
            var fx = xd - sx;
            var fz = zd - sz;
            var sfx = SmoothNoise(fx);
            var sfz = SmoothNoise(fz);
            var v00 = Hash2D(seed, sx, sz);
            var v10 = Hash2D(seed, sx + 1, sz);
            var v01 = Hash2D(seed, sx, sz + 1);
            var v11 = Hash2D(seed, sx + 1, sz + 1);
            var a = v00 + (v10 - v00) * sfx;
            var b = v01 + (v11 - v01) * sfx;
            return a + (b - a) * sfz;
        }

        private static double Hash3D(int seed, int ix, int iy, int iz)
        {
            unchecked
            {
                long h = ((long)ix * 374761393L + (long)iy * 668265263L + (long)iz * 1274126177L + (long)seed * 285283L) & 0x7fffffffL;
                h = ((h ^ (h >> 13)) * 1103515245L + 12345L) & 0x7fffffffL;
                return (double)(h & 0xffffL) / 65536.0;
            }
        }

        private static double Noise3D(int seed, int x, int y, int z, double scale)
        {
            var xd = x / scale;
            var yd = y / scale;
            var zd = z / scale;
            var sx = (int)Math.Floor(xd);
            var sy = (int)Math.Floor(yd);
            var sz = (int)Math.Floor(zd);
            var fx = xd - sx;
            var fy = yd - sy;
            var fz = zd - sz;
            var sfx = SmoothNoise(fx);
            var sfy = SmoothNoise(fy);
            var sfz = SmoothNoise(fz);

            var v000 = Hash3D(seed, sx, sy, sz);
            var v100 = Hash3D(seed, sx + 1, sy, sz);
            var v010 = Hash3D(seed, sx, sy + 1, sz);
            var v110 = Hash3D(seed, sx + 1, sy + 1, sz);
            var v001 = Hash3D(seed, sx, sy, sz + 1);
            var v101 = Hash3D(seed, sx + 1, sy, sz + 1);
            var v011 = Hash3D(seed, sx, sy + 1, sz + 1);
            var v111 = Hash3D(seed, sx + 1, sy + 1, sz + 1);

            var a0 = v000 + (v100 - v000) * sfx;
            var b0 = v010 + (v110 - v010) * sfx;
            var c0 = a0 + (b0 - a0) * sfy;

            var a1 = v001 + (v101 - v001) * sfx;
            var b1 = v011 + (v111 - v011) * sfx;
            var c1 = a1 + (b1 - a1) * sfy;

            return c0 + (c1 - c0) * sfz;
        }

        private static double Clamp01D(double v) => v < 0 ? 0 : v > 1 ? 1 : v;

        private static double SmoothStepEdge(double edge0, double edge1, double x)
        {
            var t = Clamp01D((x - edge0) / (edge1 - edge0));
            return t * t * (3.0 - 2.0 * t);
        }

        private static double RidgedChannel(int seed, int x, int z, double scale)
        {
            var n = Noise2D(seed, x, z, scale);
            return 1.0 - Math.Abs(2.0 * n - 1.0);
        }

        private static int ClassifyBiome(int height, double T, double H, double W, double C, double ridge)
        {
            var deepOcean = height < SEA_LEVEL - 10 || (C < 0.2 && height < SEA_LEVEL - 2);
            var inOcean = height < SEA_LEVEL;

            if (deepOcean)
            {
                if (T < 0.26) return BiomeIds.FROZEN_OCEAN;
                if (T < 0.4) return BiomeIds.COLD_OCEAN;
                if (T > 0.72) return BiomeIds.WARM_OCEAN;
                if (T > 0.58) return BiomeIds.LUKWARM_OCEAN;
                return BiomeIds.DEEP_OCEAN;
            }
            if (inOcean)
            {
                if (T < 0.3) return BiomeIds.FROZEN_OCEAN;
                if (T > 0.68) return BiomeIds.WARM_OCEAN;
                if (T > 0.55) return BiomeIds.LUKWARM_OCEAN;
                if (T < 0.42) return BiomeIds.COLD_OCEAN;
                return BiomeIds.OCEAN;
            }

            if (ridge > 0.9 && height <= SEA_LEVEL + 4)
                return T < 0.32 ? BiomeIds.FROZEN_RIVER : BiomeIds.RIVER;

            if (height >= SEA_LEVEL && height <= SEA_LEVEL + 2 && C < 0.52)
                return T < 0.28 ? BiomeIds.SNOWY_BEACH : BiomeIds.BEACH;

            if (C > 0.62 && height >= SEA_LEVEL && height <= SEA_LEVEL + 4 && ridge < 0.4)
                return BiomeIds.STONY_SHORE;

            if (height > SEA_LEVEL + 44)
            {
                if (T < 0.34) return BiomeIds.FROZEN_PEAKS;
                if (T > 0.66) return BiomeIds.STONY_PEAKS;
                return BiomeIds.JAGGED_PEAKS;
            }
            if (height > SEA_LEVEL + 30)
            {
                if (T < 0.34) return BiomeIds.SNOWY_SLOPES;
                if (H > 0.54 && T > 0.36 && T < 0.62) return BiomeIds.WINDSWEPT_FOREST;
                if (W > 0.78) return BiomeIds.WINDSWEPT_GRAVELLY_HILLS;
                return BiomeIds.WINDSWEPT_HILLS;
            }
            if (height > SEA_LEVEL + 19 && H > 0.46 && T > 0.38 && T < 0.68)
                return BiomeIds.MEADOW;

            if (W > 0.91 && H > 0.48 && T > 0.36 && T < 0.58)
                return BiomeIds.MUSHROOM_FIELD;

            if (H > 0.66 && T > 0.34 && T < 0.62)
                return (W > 0.74 && T > 0.48) ? BiomeIds.MANGROVE_SWAMP : BiomeIds.SWAMP;

            if (T < 0.22)
            {
                if (W > 0.84) return BiomeIds.ICE_SPIKE_PLAINS;
                if (H < 0.36) return BiomeIds.ICE_PLAINS;
                return BiomeIds.SNOWY_PLAINS;
            }
            if (T < 0.32 && H > 0.35)
                return BiomeIds.SNOWY_TAIGA;

            if (T < 0.4 && H > 0.4)
            {
                return BiomeIds.CONIFEROUS_TAIGA;
            }

            if (T > 0.7 && H < 0.34)
            {
                if (W > 0.82) return BiomeIds.ERODED_BADLANDS;
                if (W > 0.64) return BiomeIds.WOODED_BADLANDS;
                return BiomeIds.BADLANDS;
            }
            if (T > 0.64 && H < 0.38)
                return BiomeIds.DESERT;

            if (T > 0.56 && H < 0.44 && height > SEA_LEVEL + 14)
                return W > 0.76 ? BiomeIds.WINDSWEPT_SAVANNA : BiomeIds.SAVANNA_PLATEAU;
            if (T > 0.54 && H < 0.42)
                return W > 0.76 ? BiomeIds.WINDSWEPT_SAVANNA : BiomeIds.SAVANNA;

            if (T > 0.6 && H > 0.6)
            {
                if (W > 0.78) return BiomeIds.BAMBOO_JUNGLE;
                if (W < 0.34) return BiomeIds.SPARSE_JUNGLE;
                return BiomeIds.JUNGLE;
            }

            if (H > 0.52 && T > 0.34 && T < 0.64)
            {
                if (W > 0.84) return BiomeIds.DARK_FOREST;
                if (W > 0.68) return BiomeIds.FLOWER_FOREST;
                if (W > 0.52 || T < 0.44) return BiomeIds.BIRCH_FOREST;
                if (W < 0.28 && T > 0.5) return BiomeIds.OLD_GROWTH_BIRCH_FOREST;
                return BiomeIds.FOREST;
            }

            if (T < 0.46 && H > 0.38)
            {
                if (height > SEA_LEVEL + 17 && W > 0.62) return BiomeIds.OLD_GROWTH_SPRUCE_TAIGA;
                if (height > SEA_LEVEL + 15 && W < 0.36) return BiomeIds.OLD_GROWTH_PINE_TAIGA;
                return BiomeIds.TAIGA;
            }

            if (height > SEA_LEVEL + 11 && T < 0.42 && H > 0.42 && W > 0.86)
                return BiomeIds.GROVE;
            if (T > 0.47 && T < 0.62 && W > 0.88)
                return BiomeIds.CHERRY_GROVE;
            if (H > 0.54 && T < 0.32 && W > 0.87)
                return BiomeIds.PALE_GARDEN;

            if (W > 0.86 && T > 0.44 && T < 0.58)
                return BiomeIds.SUNFLOWER_PLAINS;
            return BiomeIds.PLAINS;
        }

        // Tree placement probability per biome (copied from client digcraft-biome.ts)
        private static double TreeNoiseThreshold(int biome)
        {
            switch (biome)
            {
                case BiomeIds.DARK_FOREST: return 0.05;
                case BiomeIds.FOREST:
                case BiomeIds.FLOWER_FOREST: return 0.05;
                case BiomeIds.BIRCH_FOREST:
                case BiomeIds.OLD_GROWTH_BIRCH_FOREST: return 0.045;
                case BiomeIds.TAIGA:
                case BiomeIds.SNOWY_TAIGA:
                case BiomeIds.OLD_GROWTH_SPRUCE_TAIGA:
                case BiomeIds.OLD_GROWTH_PINE_TAIGA:
                case BiomeIds.CONIFEROUS_TAIGA: return 0.04;
                case BiomeIds.GROVE: return 0.04;
                case BiomeIds.JUNGLE:
                case BiomeIds.BAMBOO_JUNGLE:
                case BiomeIds.SPARSE_JUNGLE: return 0.055;
                case BiomeIds.SWAMP:
                case BiomeIds.MANGROVE_SWAMP: return 0.04;
                case BiomeIds.WOODED_BADLANDS: return 0.03;
                case BiomeIds.MEADOW:
                case BiomeIds.CHERRY_GROVE: return 0.025;
                case BiomeIds.WINDSWEPT_FOREST: return 0.035;
                case BiomeIds.PLAINS:
                case BiomeIds.SUNFLOWER_PLAINS: return 0.02;
                case BiomeIds.SAVANNA:
                case BiomeIds.SAVANNA_PLATEAU:
                case BiomeIds.WINDSWEPT_SAVANNA: return 0.025;
                case BiomeIds.DESERT:
                case BiomeIds.BADLANDS:
                case BiomeIds.ERODED_BADLANDS:
                case BiomeIds.BEACH:
                case BiomeIds.STONY_SHORE:
                case BiomeIds.SNOWY_BEACH:
                case BiomeIds.OCEAN:
                case BiomeIds.DEEP_OCEAN:
                case BiomeIds.FROZEN_OCEAN:
                case BiomeIds.COLD_OCEAN:
                case BiomeIds.WARM_OCEAN:
                case BiomeIds.LUKEWARM_OCEAN:
                case BiomeIds.DEEP_COLD_OCEAN:
                case BiomeIds.DEEP_FROZEN_OCEAN:
                case BiomeIds.DEEP_LUKEWARM_OCEAN:
                case BiomeIds.DEEP_WARM_OCEAN:
                case BiomeIds.RIVER:
                case BiomeIds.FROZEN_RIVER:
                case BiomeIds.STONY_PEAKS:
                case BiomeIds.ICE_SPIKE_PLAINS:
                case BiomeIds.SNOWY_PLAINS:
                case BiomeIds.ICE_PLAINS:
                case BiomeIds.FROZEN_PEAKS:
                case BiomeIds.SNOWY_SLOPES:
                case BiomeIds.JAGGED_PEAKS: return 0.005;
                default: return 0.005; // All other biomes get 0.5% chance
            }
        }

        private static int SurfaceBlockForBiomeId(int biome)
        {
            switch (biome)
            {
                case BiomeIds.DESERT:
                case BiomeIds.BADLANDS:
                case BiomeIds.WOODED_BADLANDS:
                case BiomeIds.ERODED_BADLANDS:
                case BiomeIds.BEACH:
                    return BlockIds.SAND;
                case BiomeIds.ICE_PLAINS:
                case BiomeIds.ICE_SPIKE_PLAINS:
                case BiomeIds.SNOWY_PLAINS:
                case BiomeIds.SNOWY_BEACH:
                case BiomeIds.FROZEN_OCEAN:
                case BiomeIds.FROZEN_RIVER:
                case BiomeIds.FROZEN_PEAKS:
                case BiomeIds.SNOWY_SLOPES:
                case BiomeIds.SNOWY_TAIGA:
                    return BlockIds.STONE_SNOW;
                case BiomeIds.MUSHROOM_FIELD:
                    return BlockIds.DIRT;
                case BiomeIds.JAGGED_PEAKS:
                case BiomeIds.STONY_PEAKS:
                case BiomeIds.STONY_SHORE:
                    return BlockIds.STONE;
                case BiomeIds.WINDSWEPT_GRAVELLY_HILLS:
                    return BlockIds.GRAVEL;
                default:
                    return BlockIds.GRASS;
            }
        }

        private static TerrainColumnSample SampleTerrainColumn(int seed, int worldX, int worldZ)
        {
            var n1 = Noise2D(seed, worldX, worldZ, 48.0) * 20.0;
            var n2 = Noise2D(seed + 1000, worldX, worldZ, 24.0) * 10.0;
            var n3 = Noise2D(seed + 2000, worldX, worldZ, 12.0) * 4.0;
            var mountainNoise = Noise2D(seed + 3000, worldX, worldZ, 200.0);
            var mountainHeight = mountainNoise > 0.65 ? (int)((mountainNoise - 0.65) * 300.0) : 0;

            var continental = Noise2D(seed + 7000, worldX, worldZ, 450.0);
            // Match client: smoothstep(0.28, 0.58) * 18
            var depression = SmoothStepEdge(0.28, 0.58, 1.0 - continental) * 18.0;

            // Match client: SEA_LEVEL + 3 base offset
            var height = SEA_LEVEL + 3 + (int)Math.Floor(n1 + n2 + n3 + mountainHeight - depression);

            var ridge = RidgedChannel(seed + 8000, worldX, worldZ, 220.0);
            if (ridge > 0.86)
                height -= (int)Math.Floor((ridge - 0.86) / 0.14 * 9.0);

            var humidityRaw = Noise2D(seed + 6010, worldX, worldZ, 360.0);
            var lakeSpot = Noise2D(seed + 8500, worldX, worldZ, 72.0);
            // Match client lake thresholds exactly
            if (humidityRaw > 0.58 && lakeSpot > 0.82 && height >= SEA_LEVEL - 3 && height <= SEA_LEVEL + 10)
                height = Math.Min(height, SEA_LEVEL - 1);

            var T = Noise2D(seed + 6000, worldX, worldZ, 520.0);
            T -= 0.14 * Clamp01D((height - SEA_LEVEL) / 44.0);
            T = Clamp01D(T);
            var H = Clamp01D(humidityRaw);
            var W = Clamp01D(Noise2D(seed + 6020, worldX, worldZ, 200.0));
            var C = Clamp01D(continental);

            var biome = ClassifyBiome(height, T, H, W, C, ridge);
            return new TerrainColumnSample { Height = height, Biome = biome };
        }

        private static int GetBaseHeight(int seed, int worldX, int worldZ)
        {
            // Returns the absolute Y of the terrain surface (shifted up by NETHER_TOP)
            return SampleTerrainColumn(seed, worldX, worldZ).Height + NETHER_TOP + 1;
        }

        private static int GetBaseBlockId(int seed, int worldX, int worldY, int worldZ)
        {
            // Nether region: y = 0 .. NETHER_TOP-1
            if (worldY < NETHER_TOP)
            {
                if (worldY == 0) return BlockIds.BEDROCK;
                if (worldY == 1) return BlockIds.LAVA;

                // More detailed Nether carving + dripstone (stalagmite/stalactite) emulation
                // so server base terrain matches client expectations for regrowth.
                var netherSeed = (int)unchecked(seed ^ 0x9E3779B1);

                // Carve Nether caverns (match client algorithm)
                var a = Noise3D(netherSeed + 30000, worldX, worldY, worldZ, 22.0);
                var b = Noise3D(netherSeed + 31000, worldX, worldY, worldZ, 11.0);
                if ((a > 0.60 && b > 0.42) || a > 0.76) return BlockIds.AIR;

                // Candidate is solid (netherrack). Now check for dripstone features in nearby air pockets.
                // If this exact position is within a dripstone column that client would generate,
                // return the appropriate stalactite/stalagmite block id.
                // We'll scan small vertical neighbourhood to detect a local column head/base.
                const int maxLen = 5;
                // Stalactite: head is above and hangs down
                for (int headOff = 0; headOff < maxLen; headOff++)
                {
                    int headY = worldY + headOff;
                    if (headY + 1 >= NETHER_TOP) break;
                    // head cell must be air (carved cave)
                    var headA = Noise3D(netherSeed + 30000, worldX, headY, worldZ, 22.0);
                    var headB = Noise3D(netherSeed + 31000, worldX, headY, worldZ, 11.0);
                    if ((headA > 0.60 && headB > 0.42) || headA > 0.76)
                    {
                        // above the head must be solid (ceiling)
                        var aboveA = Noise3D(netherSeed + 30000, worldX, headY + 1, worldZ, 22.0);
                        var aboveB = Noise3D(netherSeed + 31000, worldX, headY + 1, worldZ, 11.0);
                        var aboveIsSolid = !((aboveA > 0.60 && aboveB > 0.42) || aboveA > 0.76);
                        if (!aboveIsSolid) continue;

                        // Dripstone column probability
                        var stalN = Noise2D(netherSeed + 60000, worldX, worldZ, 8.0);
                        if (stalN <= 0.72) continue;
                        var len = 1 + (int)Math.Floor(Noise2D(netherSeed + 60010, worldX, worldZ, 12.0) * 5.0);
                        // If the target worldY lies within len distance below headY, mark as stalactite
                        if (headY - worldY < len) return BlockIds.NETHER_STALACTITE;
                    }
                }

                // Stalagmite: base is below and grows up
                for (int footOff = 0; footOff < maxLen; footOff++)
                {
                    int footY = worldY - footOff;
                    if (footY - 1 <= 1) break;
                    var footA = Noise3D(netherSeed + 30000, worldX, footY, worldZ, 22.0);
                    var footB = Noise3D(netherSeed + 31000, worldX, footY, worldZ, 11.0);
                    if ((footA > 0.60 && footB > 0.42) || footA > 0.76)
                    {
                        // below the foot must be solid
                        var belowA = Noise3D(netherSeed + 30000, worldX, footY - 1, worldZ, 22.0);
                        var belowB = Noise3D(netherSeed + 31000, worldX, footY - 1, worldZ, 11.0);
                        var belowIsSolid = !((belowA > 0.60 && belowB > 0.42) || belowA > 0.76);
                        if (!belowIsSolid) continue;

                        var stagN = Noise2D(netherSeed + 61000, worldX, worldZ, 8.0);
                        if (stagN <= 0.72) continue;
                        var len = 1 + (int)Math.Floor(Noise2D(netherSeed + 61010, worldX, worldZ, 12.0) * 5.0);
                        if (worldY - footY < len) return BlockIds.NETHER_STALAGMITE;
                    }
                }

                return BlockIds.NETHERRACK;
            }

            // Nether/overworld boundary layers
            if (worldY == NETHER_TOP || worldY == NETHER_TOP + 1) return BlockIds.NETHERRACK;

            // Overworld region: y = NETHER_TOP+1 .. WORLD_HEIGHT-1
            // Terrain height is relative to overworld base
            var col = SampleTerrainColumn(seed, worldX, worldZ);
            var height = col.Height + NETHER_TOP + 1; // absolute Y of surface
            var relY = worldY - (NETHER_TOP + 1);     // relative Y within overworld

            int id;
            if (worldY < height - 4)
                id = col.Height > SEA_LEVEL + 25 ? BlockIds.STONE_SNOW : BlockIds.STONE;
            else if (worldY < height)
                id = col.Height > SEA_LEVEL + 20 ? BlockIds.STONE_SNOW : BlockIds.DIRT;
            else if (worldY == height)
            {
                if (col.Height > SEA_LEVEL + 20) id = BlockIds.STONE_SNOW;
                else if (col.Height < SEA_LEVEL) id = BlockIds.SAND;
                else id = SurfaceBlockForBiomeId(col.Biome);
            }
            else if (worldY <= NETHER_TOP + 1 + SEA_LEVEL && col.Height < SEA_LEVEL)
                id = BlockIds.WATER;
            else
                id = BlockIds.AIR;

            // Overworld caves (relative y 2..44)
            if (relY >= 2 && relY < 45 && id != BlockIds.BEDROCK)
            {
                var caveV = Noise3D(seed + 9000, worldX, worldY, worldZ, 10.0);
                if (caveV > 0.72) return BlockIds.AIR;
            }

            // Mountain interior diversity — matches client digcraft-world.ts step 9b
            if (id == BlockIds.STONE || id == BlockIds.STONE_SNOW)
            {
                if (relY > 25 && Noise3D(seed + 70000, worldX, worldY, worldZ, 9.0) > 0.80)
                    return BlockIds.CALCITE;
                if (relY > 10 && relY < 60 && Noise3D(seed + 71000, worldX, worldY, worldZ, 7.0) > 0.81)
                    return BlockIds.TUFF;
                if (relY > 5 && relY < 55 && Noise3D(seed + 72000, worldX, worldY, worldZ, 5.0) > 0.80)
                    return BlockIds.COPPER_ORE;
                if (relY > 40 && Noise3D(seed + 73000, worldX, worldY, worldZ, 4.0) > 0.87)
                    return BlockIds.AMETHYST;
                if (id == BlockIds.STONE_SNOW && relY > 50 && Noise3D(seed + 74000, worldX, worldY, worldZ, 6.0) > 0.78)
                    return BlockIds.PACKED_ICE;
            }

            // Badlands red sand surface — matches client step 9c
            if (worldY == height && (col.Biome == BiomeIds.BADLANDS || col.Biome == BiomeIds.ERODED_BADLANDS || col.Biome == BiomeIds.WOODED_BADLANDS))
                return BlockIds.RED_SAND;

            // Tree generation (deterministic, lightweight replica of client pass)
            // Only attempt when this column is above-surface air and within overworld
            if (id == BlockIds.AIR && worldY > height)
            {
                // Scan nearby trunk candidates (radius 2) to determine if this coordinate
                // should be a trunk or leaf block for any nearby generated tree.
                for (int tx = worldX - 2; tx <= worldX + 2; tx++)
                {
                    for (int tz = worldZ - 2; tz <= worldZ + 2; tz++)
                    {
                        var tcol = SampleTerrainColumn(seed, tx, tz);
                        var surfaceT = tcol.Height + NETHER_TOP + 1;
                        var treeTh = TreeNoiseThreshold(tcol.Biome);
                        if (treeTh <= 0) continue;
                        var treeNoise = Noise2D(seed + 100000, tx, tz, 12.0);
                        if (treeNoise >= treeTh) continue;

                        var trunkH = 4 + (int)Math.Floor(Noise2D(seed + 101000, tx, tz, 6.0) * 3.0);
                        var topT = surfaceT + trunkH;

                        // Trunk at (tx,tz)
                        if (worldX == tx && worldZ == tz && worldY >= surfaceT + 1 && worldY <= surfaceT + trunkH)
                            return BlockIds.WOOD;

                        // Determine if this should be a coniferous (fir) tree based on surface block
                        var topId = SurfaceBlockForBiomeId(tcol.Biome);
                        var useConiferousTree = topId == BlockIds.STONE_SNOW;

                        if (useConiferousTree)
                        {
                            // Fir/conifer tree - pyramid layers centered on trunk top
                            var treeTopY = surfaceT + trunkH;

                            // Layer 0 (bottom, widest): -3..3 excluding corners
                            if (worldY == treeTopY)
                            {
                                int dx = worldX - tx, dz = worldZ - tz;
                                if (Math.Abs(dx) <= 3 && Math.Abs(dz) <= 3 && !(Math.Abs(dx) == 3 && Math.Abs(dz) == 3))
                                    return BlockIds.LEAVES;
                            }

                            // Layer 1: -2..2 excluding corners
                            if (worldY == treeTopY + 1)
                            {
                                int dx = worldX - tx, dz = worldZ - tz;
                                if (Math.Abs(dx) <= 2 && Math.Abs(dz) <= 2 && !(Math.Abs(dx) == 2 && Math.Abs(dz) == 2))
                                    return BlockIds.LEAVES;
                            }

                            // Layer 2: cross around center
                            if (worldY == treeTopY + 2)
                            {
                                int dx = worldX - tx, dz = worldZ - tz;
                                if ((dx == -1 && dz == 0) || (dx == 1 && dz == 0) || (dx == 0 && dz == -1) || (dx == 0 && dz == 1))
                                    return BlockIds.LEAVES;
                            }

                            // Layer 3: single top leaf
                            if (worldY == treeTopY + 3)
                            {
                                if (worldX == tx && worldZ == tz) return BlockIds.LEAVES;
                            }
                        }
                        else
                        {
                            // Standard leaves layers
                            for (int dy = -1; dy <= 2; dy++)
                            {
                                int rad = dy < 1 ? 2 : 1;
                                var layerY = topT + dy;
                                if (worldY != layerY) continue;
                                int dx = worldX - tx, dz = worldZ - tz;
                                if (Math.Abs(dx) <= rad && Math.Abs(dz) <= rad)
                                {
                                    if (!(dx == 0 && dz == 0 && dy < 1)) return BlockIds.LEAVES;
                                }
                            }
                        }
                    }
                }

                // Deterministic bamboo & cactus placement (match client rules)
                for (int bx = worldX - 2; bx <= worldX + 2; bx++)
                {
                    for (int bz = worldZ - 2; bz <= worldZ + 2; bz++)
                    {
                        var bcol = SampleTerrainColumn(seed, bx, bz);
                        var surfaceB = bcol.Height + NETHER_TOP + 1;

                        // Cactus on sand (desert/beach-like surfaces)
                        var topId = SurfaceBlockForBiomeId(bcol.Biome);
                        if (topId == BlockIds.SAND)
                        {
                            var cN = Noise2D(seed + 92000, bx, bz, 6.0);
                            if (cN > 0.74)
                            {
                                int cactusH = 1 + (int)Math.Floor(Noise2D(seed + 92010, bx, bz, 4.0) * 3.0);
                                if (worldX == bx && worldZ == bz && worldY > surfaceB && worldY <= surfaceB + cactusH)
                                    return BlockIds.CACTUS;
                            }
                        }

                        // Bamboo in bamboo jungle / jungle
                        if (bcol.Biome == BiomeIds.BAMBOO_JUNGLE || bcol.Biome == BiomeIds.JUNGLE)
                        {
                            var bN = Noise2D(seed + 91000, bx, bz, 6.0);
                            if (bN > 0.66)
                            {
                                int bambooH = 2 + (int)Math.Floor(Noise2D(seed + 91010, bx, bz, 4.0) * 4.0);
                                if (worldX == bx && worldZ == bz && worldY > surfaceB && worldY <= surfaceB + bambooH)
                                    return BlockIds.BAMBOO;
                            }
                        }
                    }
                }
            }

            // Deep ocean features: seaweed (kelp-like columns) and very rare sunken ships
            if (id == BlockIds.WATER && col.Biome == BiomeIds.DEEP_OCEAN)
            {
                // Seaweed: deterministic local noise decides if this column has kelp,
                // and how tall the kelp column should be (1..6 blocks).
                var kelpN = Noise2D(seed + 1234567, worldX, worldZ, 8.0);
                if (kelpN > 0.68)
                {
                    int kelpLen = 1 + (int)Math.Floor(Noise2D(seed + 1234577, worldX, worldZ, 4.0) * 6.0);
                    // sea floor is at 'height' for this column; kelp occupies water blocks above it
                    if (worldY > height && worldY <= height + kelpLen)
                        return BlockIds.SEAWEED;
                }

                // Rare sunken ship placement: deterministic per-region placement so ships
                // are sparse but reproduceable from world seed. Region size is coarse.
                const int regionSize = 64;
                int rx = (int)Math.Floor(worldX / (double)regionSize);
                int rz = (int)Math.Floor(worldZ / (double)regionSize);
                var shipN = Noise2D(seed + 789000, rx * 37 + 1000, rz * 97 + 1000, 1.0);
                if (shipN > 0.997)
                {
                    // compute region-local ship center deterministically
                    int cx = rx * regionSize + (int)Math.Floor(Noise2D(seed + 789100, rx, rz, 1.0) * regionSize);
                    int cz = rz * regionSize + (int)Math.Floor(Noise2D(seed + 789200, rx, rz, 1.0) * regionSize);
                    int dx = worldX - cx;
                    int dz = worldZ - cz;
                    // small rectangular hull (approx 13x7 footprint)
                    if (Math.Abs(dx) <= 6 && Math.Abs(dz) <= 3)
                    {
                        var centerCol = SampleTerrainColumn(seed, cx, cz);
                        int centerSurface = centerCol.Height + NETHER_TOP + 1;
                        // only place ships on sufficiently deep seabed
                        if (centerSurface < SEA_LEVEL - 4)
                        {
                            // hull occupies one or two layers above seafloor
                            if (worldY == centerSurface + 1 || worldY == centerSurface + 2)
                                return BlockIds.SHIP_WOOD;
                            // chest at exact center on upper layer
                            if (worldY == centerSurface + 1 && dx == 0 && dz == 0)
                                return BlockIds.SUNKEN_CHEST;
                        }
                    }
                }
            }

            return id;
        }

        private static int GetSurfaceY(int seed, int worldX, int worldZ)
        {
            // Scan downward from top of overworld only
            for (int y = WORLD_HEIGHT - 1; y >= NETHER_TOP + 1; y--)
            {
                var baseId = GetBaseBlockId(seed, worldX, y, worldZ);
                if (baseId != BlockIds.AIR && baseId != BlockIds.WATER) return y;
            }
            return NETHER_TOP + 1 + SEA_LEVEL;
        }

        private int GetBlockAt(MySqlConnection conn, int worldId, int x, int y, int z, int worldSeed, bool recalculateCoords = true)
        {
            int tmpChunkX = x;
            int tmpChunkZ = z;
            int tmpLocalX = x;
            int tmpLocalY = y;
            int tmpLocalZ = z;
            if (recalculateCoords)
            {
                GetStoredBlockCoords(x, y, z, out var chunkX, out var chunkZ, out var localX, out var localY, out var localZ);
                tmpChunkX = chunkX;
                tmpChunkZ = chunkZ;
                tmpLocalX = localX;
                tmpLocalY = localY;
                tmpLocalZ = localZ;
            }
            using var cmd = new MySqlCommand(@"
                SELECT block_id FROM maxhanna.digcraft_block_changes
                WHERE world_id = @wid AND chunk_x = @cx AND chunk_z = @cz
                AND local_x = @lx AND local_y = @ly AND local_z = @lz", conn);
            cmd.Parameters.AddWithValue("@wid", worldId);
            cmd.Parameters.AddWithValue("@cx", tmpChunkX);
            cmd.Parameters.AddWithValue("@cz", tmpChunkZ);
            cmd.Parameters.AddWithValue("@lx", tmpLocalX);
            cmd.Parameters.AddWithValue("@ly", tmpLocalY);
            cmd.Parameters.AddWithValue("@lz", tmpLocalZ);
            var result = cmd.ExecuteScalar();
            if (result != null && result != DBNull.Value) return Convert.ToInt32(result);
            return GetBaseBlockId(worldSeed, x, y, z);
        }

        private static bool IsValidGround(int blockId)
        {
            // Treat these as invalid ground for spawning
            if (blockId == BlockIds.AIR) return false;
            if (blockId == BlockIds.WATER) return false;
            if (blockId == BlockIds.LEAVES) return false;
            if (blockId == BlockIds.WINDOW_OPEN) return false;
            if (blockId == BlockIds.DOOR_OPEN) return false;
            return true;
        }

        private static int GetTopSolidBlockY(int seed, int worldX, int worldZ, Dictionary<(int lx, int ly, int lz), int>? changes)
        {
            // Determine chunk/local coords
            var cx = (int)Math.Floor(worldX / (double)CHUNK_SIZE);
            var cz = (int)Math.Floor(worldZ / (double)CHUNK_SIZE);
            var lx = worldX - cx * CHUNK_SIZE;
            var lz = worldZ - cz * CHUNK_SIZE;

            for (int y = WORLD_HEIGHT - 1; y >= NETHER_TOP + 1; y--)
            {
                // Check applied changes first
                if (changes != null && changes.TryGetValue((lx, y, lz), out var bid))
                {
                    if (bid != BlockIds.AIR && bid != BlockIds.WATER && bid != BlockIds.LEAVES && bid != BlockIds.WINDOW_OPEN && bid != BlockIds.DOOR_OPEN) return y;
                    continue;
                }
                var baseId = GetBaseBlockId(seed, worldX, y, worldZ);
                if (baseId != BlockIds.AIR && baseId != BlockIds.WATER && baseId != BlockIds.LEAVES && baseId != BlockIds.WINDOW_OPEN && baseId != BlockIds.DOOR_OPEN) return y;
            }
            return -1;
        }

        private async Task MobSimulationLoopAsync(CancellationToken ct)
        {
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    // ensure epoch is set once so clients can align to server ticks
                    if (_mobEpochStartMs == 0) _mobEpochStartMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    var worldIds = _worldMobs.Keys.ToList();
                    foreach (var wid in worldIds)
                    {
                        if (!_worldMobs.TryGetValue(wid, out var mobs)) continue;
                        try
                        {
                            // Load online players for this world (also read health/hunger for regen)
                            var players = new List<(int userId, float x, float y, float z)>();
                            var playerStats = new Dictionary<int, (int health, int hunger)>();
                            await using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                            {
                                await conn.OpenAsync();
                                var cutoff = DateTime.UtcNow.AddSeconds(-INACTIVITY_TIMEOUT_SECONDS);
                                using var cmd = new MySqlCommand(@"SELECT user_id, pos_x, pos_y, pos_z, health, hunger FROM maxhanna.digcraft_players WHERE world_id=@wid AND last_seen >= @cutoff", conn);
                                cmd.Parameters.AddWithValue("@wid", wid);
                                cmd.Parameters.AddWithValue("@cutoff", cutoff);
                                using var r = await cmd.ExecuteReaderAsync();
                                while (await r.ReadAsync())
                                {
                                    var uid = r.GetInt32("user_id");
                                    players.Add((uid, r.GetFloat("pos_x"), r.GetFloat("pos_y"), r.GetFloat("pos_z")));
                                    playerStats[uid] = (r.GetInt32("health"), r.GetInt32("hunger"));
                                }
                            }

                            var nowMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                            var tickMs = _mobTickMs;
                            var tickSec = tickMs / 1000f; // update step in seconds

                            // Default world seed, will be read from DB if available
                            int worldSeed = 42;

                            // Dynamic chunk-based spawning: ensure chunks around active players
                            try
                            {
                                // Read world seed and a default spawn Y so spawned mobs have a reasonable Y
                                float defaultSpawnY = 34f;
                                await using (var wconn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                                {
                                    await wconn.OpenAsync();
                                    using var wCmd = new MySqlCommand("SELECT seed, spawn_y FROM maxhanna.digcraft_worlds WHERE id=@wid", wconn);
                                    wCmd.Parameters.AddWithValue("@wid", wid);
                                    using var wr = await wCmd.ExecuteReaderAsync();
                                    if (await wr.ReadAsync())
                                    {
                                        try { worldSeed = wr.IsDBNull(wr.GetOrdinal("seed")) ? worldSeed : wr.GetInt32("seed"); } catch { }
                                        try { defaultSpawnY = wr.IsDBNull(wr.GetOrdinal("spawn_y")) ? defaultSpawnY : wr.GetFloat("spawn_y"); } catch { }
                                    }
                                }

                                const int chunkSize = 16;
                                const int spawnChunkRadius = 8; // check 8 chunks (~128 blocks) around each active player
                                const int perChunkCap = 2; // target mobs per chunk
                                const int worldMaxMobs = 256; // global cap per world to avoid runaway growth

                                // Build set of chunks to consider based on online players
                                var chunksToCheck = new HashSet<(int cx, int cz)>();
                                foreach (var p in players)
                                {
                                    var pcx = (int)Math.Floor(p.x / (double)chunkSize);
                                    var pcz = (int)Math.Floor(p.z / (double)chunkSize);
                                    for (int dx = -spawnChunkRadius; dx <= spawnChunkRadius; dx++)
                                    {
                                        for (int dz = -spawnChunkRadius; dz <= spawnChunkRadius; dz++)
                                        {
                                            chunksToCheck.Add((pcx + dx, pcz + dz));
                                        }
                                    }
                                }

                                var totalMobs = mobs.Count;

                                foreach (var c in chunksToCheck)
                                {
                                    if (totalMobs >= worldMaxMobs) break;
                                    var cx = c.cx; var cz = c.cz;

                                    // Count mobs already in this chunk (exclude dead mobs awaiting respawn)
                                    var existing = mobs.Values.Count(m =>
                                        m.PosX > -1000 && // not dead/awaiting respawn
                                        (int)Math.Floor(m.PosX / (double)chunkSize) == cx &&
                                        (int)Math.Floor(m.PosZ / (double)chunkSize) == cz);
                                    if (existing >= perChunkCap) continue;

                                    // Skip spawn if any mob in this chunk recently died (respawn delay)
                                    var recentDeath = mobs.Values.FirstOrDefault(m =>
                                        m.DiedAtMs > 0 &&
                                        nowMs - m.DiedAtMs < MOB_RESPAWN_DELAY_MS &&
                                        (int)Math.Floor(m.HomeX / (double)chunkSize) == cx &&
                                        (int)Math.Floor(m.HomeZ / (double)chunkSize) == cz);
                                    if (recentDeath != null) continue;

                                    // Read any server-side block changes for this chunk so spawn checks can account for player-built structures
                                    var chunkChanges = new Dictionary<(int lx, int ly, int lz), int>();
                                    try
                                    {
                                        await using var ccConn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                                        await ccConn.OpenAsync();
                                        using var ccCmd = new MySqlCommand(@"SELECT local_x, local_y, local_z, block_id FROM maxhanna.digcraft_block_changes WHERE world_id=@wid AND chunk_x=@cx AND chunk_z=@cz", ccConn);
                                        ccCmd.Parameters.AddWithValue("@wid", wid);
                                        ccCmd.Parameters.AddWithValue("@cx", cx);
                                        ccCmd.Parameters.AddWithValue("@cz", cz);
                                        using var ccR = await ccCmd.ExecuteReaderAsync();
                                        while (await ccR.ReadAsync())
                                        {
                                            var lx = ccR.GetInt32("local_x");
                                            var ly = ccR.GetInt32("local_y");
                                            var lz = ccR.GetInt32("local_z");
                                            var bid = ccR.GetInt32("block_id");
                                            chunkChanges[(lx, ly, lz)] = bid;
                                        }
                                    }
                                    catch (Exception ex)
                                    {
                                        _ = _log.Db("Mob spawn chunk changes read error: " + ex.Message, null, "DIGCRAFT", true);
                                    }

                                    // Deterministic RNG per chunk + time-slice so spawns vary slowly over time
                                    var timeSlice = (int)((nowMs / 1000) / 30); // change seed every 30s
                                    int seedComb = worldSeed ^ (cx * 73856093) ^ (cz * 19349663) ^ wid ^ timeSlice;
                                    var rng = new System.Random(seedComb);

                                    // Try to spawn up to (perChunkCap - existing) mobs, with randomness
                                    var toTry = perChunkCap - existing;
                                    for (int s = 0; s < toTry && totalMobs < worldMaxMobs; s++)
                                    {
                                        // Chance per attempt to actually spawn (reduces density)
                                        if (rng.NextDouble() > 0.45) continue;

                                        // Pick a location inside the chunk
                                        var localXf = (float)(rng.NextDouble() * chunkSize);
                                        var localZf = (float)(rng.NextDouble() * chunkSize);
                                        var wx = cx * (float)chunkSize + localXf + 0.5f;
                                        var wz = cz * (float)chunkSize + localZf + 0.5f;

                                        // Avoid spawning on top of players or other mobs
                                        if (PositionBlockedByEntity(wx, wz, players, mobs, 0)) continue;

                                        // Determine integer world/local coordinates for block checks
                                        var gx = (int)Math.Floor(wx);
                                        var gz = (int)Math.Floor(wz);
                                        var lx = gx - cx * CHUNK_SIZE;
                                        var lz = gz - cz * CHUNK_SIZE;

                                        // Determine top solid block for this column (generator + applied changes)
                                        var topY = GetTopSolidBlockY(worldSeed, gx, gz, chunkChanges);
                                        if (topY < 0) continue;
                                        var spawnY = topY + 1;

                                        // Ensure spawn block is air (consider player changes)
                                        int spawnBlockId = BlockIds.AIR;
                                        if (chunkChanges.TryGetValue((lx, spawnY, lz), out var scbid)) spawnBlockId = scbid;
                                        else spawnBlockId = GetBaseBlockId(worldSeed, gx, spawnY, gz);
                                        if (spawnBlockId != BlockIds.AIR) continue;

                                        // Ensure block below is valid ground (not water/leaves/air)
                                        int belowBlockId = BlockIds.AIR;
                                        if (chunkChanges.TryGetValue((lx, topY, lz), out var bbid)) belowBlockId = bbid;
                                        else belowBlockId = GetBaseBlockId(worldSeed, gx, topY, gz);
                                        if (!IsValidGround(belowBlockId)) continue;

                                        // Choose mob type deterministically for chunk
                                        var typesDay = new[] { "Pig", "Cow", "Sheep", "Bear" };
                                        var typesNight = new[] { "Zombie", "Skeleton" };
                                        // Day/night check must come before mob type selection
                                        var segmentMs = 10 * 60 * 1000; // 10 minute day/night toggle (matches client)
                                        var isDayNow = ((nowMs / segmentMs) % 2) == 0;
                                        var isSurfaceSpawn = (spawnY == topY + 1);
                                        var isNetherSpawn = topY < NETHER_TOP;
                                        var isHighAlt = (topY - NETHER_TOP) > SEA_LEVEL + 35;
                                        var isHotBiome = false; var isMountainBiome = false;
                                        var isJungleBiome = false; var isSnowyBiome = false;
                                        var isForestBiome = false; var isSwampBiome = false;
                                        var isOceanBiome = false; var isPlainsBiome = false; var isDeepOcean = false;
                                        try
                                        {
                                            var col2 = SampleTerrainColumn(worldSeed, gx, gz);
                                            isHotBiome = col2.Biome == BiomeIds.DESERT || col2.Biome == BiomeIds.BADLANDS || col2.Biome == BiomeIds.ERODED_BADLANDS || col2.Biome == BiomeIds.WOODED_BADLANDS || col2.Biome == BiomeIds.SAVANNA || col2.Biome == BiomeIds.SAVANNA_PLATEAU || col2.Biome == BiomeIds.WINDSWEPT_SAVANNA;
                                            isMountainBiome = col2.Biome == BiomeIds.JAGGED_PEAKS || col2.Biome == BiomeIds.FROZEN_PEAKS || col2.Biome == BiomeIds.STONY_PEAKS || col2.Biome == BiomeIds.SNOWY_SLOPES || col2.Biome == BiomeIds.WINDSWEPT_HILLS;
                                            isJungleBiome = col2.Biome == BiomeIds.JUNGLE || col2.Biome == BiomeIds.BAMBOO_JUNGLE || col2.Biome == BiomeIds.SPARSE_JUNGLE;
                                            isSnowyBiome = col2.Biome == BiomeIds.SNOWY_PLAINS || col2.Biome == BiomeIds.ICE_PLAINS || col2.Biome == BiomeIds.ICE_SPIKE_PLAINS || col2.Biome == BiomeIds.SNOWY_TAIGA || col2.Biome == BiomeIds.FROZEN_OCEAN || col2.Biome == BiomeIds.FROZEN_RIVER;
                                            isForestBiome = col2.Biome == BiomeIds.FOREST || col2.Biome == BiomeIds.BIRCH_FOREST || col2.Biome == BiomeIds.DARK_FOREST || col2.Biome == BiomeIds.FLOWER_FOREST || col2.Biome == BiomeIds.TAIGA || col2.Biome == BiomeIds.OLD_GROWTH_SPRUCE_TAIGA || col2.Biome == BiomeIds.OLD_GROWTH_PINE_TAIGA;
                                            isSwampBiome = col2.Biome == BiomeIds.SWAMP || col2.Biome == BiomeIds.MANGROVE_SWAMP;
                                            isOceanBiome = col2.Biome == BiomeIds.OCEAN || col2.Biome == BiomeIds.DEEP_OCEAN || col2.Biome == BiomeIds.COLD_OCEAN || col2.Biome == BiomeIds.LUKWARM_OCEAN || col2.Biome == BiomeIds.WARM_OCEAN || col2.Biome == BiomeIds.BEACH;
                                            isDeepOcean = col2.Biome == BiomeIds.DEEP_OCEAN;
                                            isPlainsBiome = col2.Biome == BiomeIds.PLAINS || col2.Biome == BiomeIds.SUNFLOWER_PLAINS || col2.Biome == BiomeIds.MEADOW || col2.Biome == BiomeIds.CHERRY_GROVE;
                                        }
                                        catch { }

                                        string t;
                                        if (isNetherSpawn)
                                        {
                                            var netherTypes = new[] { "Blaze", "WitherSkeleton", "Ghast", "Strider", "Hoglin" };
                                            t = netherTypes[rng.Next(netherTypes.Length)];
                                            // Enderman also spawns in nether at night
                                            if (!isDayNow && rng.NextDouble() > 0.7) t = "Enderman";
                                        }
                                        else if (isDayNow)
                                        {
                                            var r2 = rng.NextDouble();
                                            if (isHotBiome) t = r2 > 0.5 ? "Camel" : "Armadillo";
                                            else if (isMountainBiome || isHighAlt)
                                            {
                                                if (r2 > 0.6) t = "Goat";
                                                else if (r2 > 0.3) t = "Llama";
                                                else t = "Panda"; // pandas in mountain grassy areas
                                            }
                                            else if (isJungleBiome) t = r2 > 0.5 ? "Parrot" : "Ocelot";
                                            else if (isSnowyBiome) t = r2 > 0.5 ? "PolarBear" : "Fox";
                                            else if (isForestBiome)
                                            {
                                                if (r2 > 0.6) t = "WoodsWolf";
                                                else if (r2 > 0.35) t = "Deer";
                                                else if (r2 > 0.15) t = "Bear";
                                                else t = "Bee"; // bees near trees in forests
                                            }
                                            else if (isSwampBiome) t = r2 > 0.5 ? "Frog" : "Axolotl";
                                            else if (isOceanBiome)
                                            {
                                                // Deep ocean gets GlowSquid, normal ocean gets fish
                                                if (isDeepOcean)
                                                {
                                                    if (r2 < 0.45) t = "Shark";
                                                    else if (r2 < 0.65) t = "TridentZombie";
                                                    else if (r2 < 0.85) t = "GlowSquid";
                                                    else t = "Dolphin";
                                                }
                                                else if (topY < SEA_LEVEL)
                                                {
                                                    // In water near surface — tadpoles spawn here
                                                    if (r2 > 0.7) t = "Tadpole";
                                                    else t = r2 > 0.4 ? "Salmon" : "Cod";
                                                }
                                                else if (topY >= SEA_LEVEL - 2 && topY <= SEA_LEVEL + 2)
                                                {
                                                    t = r2 > 0.5 ? "Turtle" : "Dolphin";
                                                }
                                                else
                                                {
                                                    t = "Turtle"; // On land - turtle
                                                }
                                            }
                                            else if (isPlainsBiome)
                                            {
                                                if (r2 > 0.7) t = "Donkey";
                                                else if (r2 > 0.5) t = "Horse";
                                                else if (r2 > 0.3) t = "Rabbit";
                                                else t = "Bee"; // bees in grassy plains too
                                            }
                                            else
                                            {
                                                // Default day: add Spider as daytime passive (non-hostile in day)
                                                t = typesDay[rng.Next(typesDay.Length)];
                                            }
                                        }
                                        else
                                        {
                                            // Night spawns — add new hostile mobs
                                            var r2 = rng.NextDouble();
                                            if (isForestBiome && r2 > 0.6) t = "Spider";
                                            else if (isMountainBiome && r2 > 0.6) t = "MountainWolf";
                                            else if (isHotBiome && r2 > 0.6) t = "SavannahWolf";
                                            else
                                            {
                                                t = typesNight[rng.Next(typesNight.Length)];
                                                // Enderman spawns at night in overworld
                                                if (r2 > 0.8) t = "Enderman";
                                            }
                                        }

                                        // Cave detection for Troglodites - check if spawn position is inside a cave
                                        // A cave is defined as: solid blocks above, solid blocks on at least 2 sides, and not on surface
                                        bool isInCave = false;
                                        if (!isNetherSpawn && !isDayNow && isSurfaceSpawn)
                                        {
                                            // Check if there's a "roof" above (solid blocks within 5 blocks)
                                            int roofCount = 0;
                                            for (int cy = spawnY + 1; cy <= spawnY + 5 && cy < WORLD_HEIGHT; cy++)
                                            {
                                                int aboveBlock = chunkChanges.TryGetValue((lx, cy, lz), out var ab) ? ab : GetBaseBlockId(worldSeed, gx, cy, gz);
                                                if (aboveBlock != BlockIds.AIR && aboveBlock != BlockIds.WATER) roofCount++;
                                            }
                                            // Check walls (at least 2 sides should be solid)
                                            int wallCount = 0;
                                            int[] dxs = { 1, -1, 0, 0 };
                                            int[] dzs = { 0, 0, 1, -1 };
                                            for (int w = 0; w < 4; w++)
                                            {
                                                for (int cy = spawnY; cy <= spawnY + 2 && cy < WORLD_HEIGHT; cy++)
                                                {
                                                    int sideBlock = chunkChanges.TryGetValue((lx + dxs[w], cy, lz + dzs[w]), out var sb) ? sb : GetBaseBlockId(worldSeed, gx + dxs[w], cy, gz + dzs[w]);
                                                    if (sideBlock != BlockIds.AIR && sideBlock != BlockIds.WATER) { wallCount++; break; }
                                                }
                                            }
                                            isInCave = roofCount >= 2 && wallCount >= 2;
                                        }

                                        // Cave mobs override at night
                                        if (isInCave && !isNetherSpawn && !isDayNow)
                                        {
                                            var caveR = rng.NextDouble();
                                            if (caveR > 0.5) t = "CaveSpider";
                                            else t = "Troglodite";
                                        }

                                        var hostile = t == "Zombie" || t == "Skeleton" || t == "WitherSkeleton"
                                            || t == "Blaze" || t == "Ghast" || t == "Hoglin"
                                            || t == "TridentZombie" || t == "Shark"
                                            || t == "CaveSpider" || t == "Spider" || t == "Enderman";
                                        var mobHealth = t switch
                                        {
                                            "WitherSkeleton" => 35,
                                            "Zombie" => 20,
                                            "Skeleton" => 20,
                                            "Blaze" => 20,
                                            "Ghast" => 10,
                                            "Hoglin" => 40,
                                            "Strider" => 20,
                                            "Camel" => 32,
                                            "PolarBear" => 30,
                                            "Turtle" => 30,
                                            "Llama" => 15,
                                            "Horse" => 15,
                                            "Axolotl" => 14,
                                            "Armadillo" => 12,
                                            "TridentZombie" => 22,
                                            "Shark" => 30,
                                            "Frog" => 10,
                                            "Bear" => 30,
                                            "Rabbit" => 3,
                                            "Parrot" => 6,
                                            "Troglodite" => 15,
                                            "Salmon" => 6,
                                            "Cod" => 6,
                                            "Donkey" => 25,
                                            "GlowSquid" => 8,
                                            "Tadpole" => 3,
                                            "Bee" => 8,
                                            "CaveSpider" => 12,
                                            "Enderman" => 40,
                                            "Panda" => 20,
                                            "Spider" => 16,
                                            "WoodsWolf" => 12,
                                            "SavannahWolf" => 12,
                                            "MountainWolf" => 12,
                                            _ => 10
                                        };
                                        var mobSpeed = t switch
                                        {
                                            "Blaze" => 1.4f,
                                            "Skeleton" => 1.3f,
                                            "WitherSkeleton" => 1.2f,
                                            "Zombie" => 1.15f,
                                            "Hoglin" => 1.2f,
                                            "Fox" => 1.2f,
                                            "Dolphin" => 1.2f,
                                            "Ocelot" => 1.1f,
                                            "Bear" => 0.7f,
                                            "Goat" => 1.1f,
                                            "Wolf" => 1.1f,
                                            "Deer" => 1.1f,
                                            "Horse" => 1.3f,
                                            "Donkey" => 1.2f,
                                            "Rabbit" => 1.3f,
                                            "Camel" => 0.7f,
                                            "Strider" => 0.6f,
                                            "Ghast" => 0.8f,
                                            "Troglodite" => 0.8f,
                                            "Salmon" => 1.0f,
                                            "Cod" => 1.0f,
                                            "GlowSquid" => 0.5f,
                                            "Tadpole" => 0.6f,
                                            "Bee" => 0.8f,
                                            "CaveSpider" => 1.3f,
                                            "Enderman" => 1.2f,
                                            "Panda" => 0.6f,
                                            "Spider" => 1.2f,
                                            "WoodsWolf" => 1.1f,
                                            "SavannahWolf" => 1.1f,
                                            "MountainWolf" => 1.1f,
                                            _ => 0.9f
                                        };

                                        if (hostile && isDayNow && isSurfaceSpawn) continue; // skip hostile on open surface during day

                                        var mob = new ServerMob
                                        {
                                            Id = Interlocked.Increment(ref _globalMobId),
                                            Type = t,
                                            PosX = wx,
                                            PosY = spawnY + 1f + 1.6f,
                                            PosZ = wz,
                                            Yaw = (float)(rng.NextDouble() * Math.PI * 2.0),
                                            Health = hostile ? mobHealth : mobHealth,
                                            MaxHealth = mobHealth,
                                            Hostile = hostile,
                                            Speed = mobSpeed,
                                            HomeX = wx,
                                            HomeY = spawnY + 1f + 1.6f,
                                            HomeZ = wz,
                                            LastActiveMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                                        };

                                        mobs[mob.Id] = mob;
                                        totalMobs++;
                                    }
                                }
                            }
                            catch (Exception ex)
                            {
                                _ = _log.Db("Mob dynamic spawn error: " + ex.Message, null, "DIGCRAFT", true);
                            }
                            const long resetTimeoutMs = 30_000; // reset to home after 30s of inactivity

                            var mobIds = mobs.Keys.ToList();
                            // Despawn constants
                            // Reduce despawn timeout so distant mobs are culled faster as players move,
                            // allowing new mobs to spawn closer to active players instead of trailing behind.
                            const int DESPAWN_DISTANCE = 128; // blocks
                            var despawnDistanceSq = (double)DESPAWN_DISTANCE * DESPAWN_DISTANCE;
                            // Previously 60s; reduce to 15s for more responsive culling/respawn behavior
                            const long DESPAWN_TIMEOUT_MS = 15_000; // 15s inactivity before despawn when far

                            foreach (var mid in mobIds)
                            {
                                if (!mobs.TryGetValue(mid, out var mob)) continue;

                                // Handle dead mobs awaiting respawn - respawn after delay
                                if (mob.DiedAtMs > 0 && nowMs - mob.DiedAtMs >= MOB_RESPAWN_DELAY_MS)
                                {
                                    // Respawn mob at its home position
                                    mob.PosX = mob.HomeX;
                                    mob.PosY = mob.HomeY;
                                    mob.PosZ = mob.HomeZ;
                                    mob.Health = mob.MaxHealth;
                                    mob.DiedAtMs = 0;
                                    mob.Yaw = 0;
                                    mob.LastActiveMs = nowMs;
                                    continue;
                                }

                                // Skip already dead mobs in the despawn logic
                                if (mob.DiedAtMs > 0) continue;

                                // Compute nearest player (XZ) distance so we can decide despawn
                                (int userId, float x, float y, float z) best = (0, 0, 0, 0);
                                double bestDist2 = double.PositiveInfinity;
                                foreach (var p in players)
                                {
                                    var dx = p.x - mob.PosX; var dz = p.z - mob.PosZ;
                                    var d2 = dx * dx + dz * dz;
                                    if (d2 < bestDist2)
                                    {
                                        bestDist2 = d2; best = p;
                                    }
                                }

                                // Despawn rule: if mob is far from any player for a while, remove it so
                                // spawn logic can place new mobs near active players. Also remove
                                // distant mobs immediately if world is over a reasonable cap.
                                if (players.Count == 0)
                                {
                                    if (nowMs - mob.LastActiveMs > DESPAWN_TIMEOUT_MS)
                                    {
                                        mobs.TryRemove(mid, out _);
                                        continue;
                                    }
                                }
                                else
                                {
                                    if (!double.IsPositiveInfinity(bestDist2) && bestDist2 > despawnDistanceSq)
                                    {
                                        var currentTotal = mobs.Count;
                                        const int WORLD_MAX_ALLOWED = 256;
                                        if (nowMs - mob.LastActiveMs > DESPAWN_TIMEOUT_MS || currentTotal > WORLD_MAX_ALLOWED)
                                        {
                                            mobs.TryRemove(mid, out _);
                                            continue;
                                        }
                                    }
                                }

                                // ── Mob AI: A* pathfinding + block breaking ──────────────────────────

                                if (best.userId != 0 && mob.Hostile && Math.Sqrt(bestDist2) <= 12.0)
                                {
                                    float eyeH = 1.6f;
                                    int mobFeetY = (int)Math.Floor(mob.PosY - eyeH);
                                    int targetFeetY = (int)Math.Floor(best.y - eyeH);

                                    var dx = best.x - mob.PosX; var dz = best.z - mob.PosZ;
                                    var distXZ = (float)Math.Sqrt(Math.Max(1e-6, dx * dx + dz * dz));
                                    var step = mob.Speed * tickSec;
                                    var dirX = dx / Math.Max(1e-6f, distXZ);
                                    var dirZ = dz / Math.Max(1e-6f, distXZ);

                                    // ── Load player-placed block changes around the mob for pathfinding ──
                                    var mobBlockChanges = new Dictionary<(int, int, int), int>();
                                    try
                                    {
                                        int bx0 = (int)Math.Floor(mob.PosX) - 14, bx1 = (int)Math.Floor(mob.PosX) + 14;
                                        int bz0 = (int)Math.Floor(mob.PosZ) - 14, bz1 = (int)Math.Floor(mob.PosZ) + 14;
                                        int bcx0 = (int)Math.Floor(bx0 / (double)CHUNK_SIZE);
                                        int bcx1 = (int)Math.Floor(bx1 / (double)CHUNK_SIZE);
                                        int bcz0 = (int)Math.Floor(bz0 / (double)CHUNK_SIZE);
                                        int bcz1 = (int)Math.Floor(bz1 / (double)CHUNK_SIZE);
                                        await using var bcConn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                                        await bcConn.OpenAsync(ct);
                                        using var bcCmd = new MySqlCommand(@"
                                            SELECT chunk_x,chunk_z,local_x,local_y,local_z,block_id
                                            FROM maxhanna.digcraft_block_changes
                                            WHERE world_id=@wid
                                              AND chunk_x BETWEEN @cx0 AND @cx1
                                              AND chunk_z BETWEEN @cz0 AND @cz1", bcConn);
                                        bcCmd.Parameters.AddWithValue("@wid", wid);
                                        bcCmd.Parameters.AddWithValue("@cx0", bcx0);
                                        bcCmd.Parameters.AddWithValue("@cx1", bcx1);
                                        bcCmd.Parameters.AddWithValue("@cz0", bcz0);
                                        bcCmd.Parameters.AddWithValue("@cz1", bcz1);
                                        using var bcR = await bcCmd.ExecuteReaderAsync(ct);
                                        while (await bcR.ReadAsync(ct))
                                        {
                                            int cx2 = bcR.GetInt32(0), cz2 = bcR.GetInt32(1);
                                            int lx2 = bcR.GetInt32(2), ly2 = bcR.GetInt32(3), lz2 = bcR.GetInt32(4);
                                            int bid2 = bcR.GetInt32(5);
                                            mobBlockChanges[(cx2 * CHUNK_SIZE + lx2, ly2, cz2 * CHUNK_SIZE + lz2)] = bid2;
                                        }
                                    }
                                    catch { /* fall back to terrain-only */ }

                                    // ── Recompute A* path every ~1.5s or when stale ──
                                    bool needsRepath = mob.Path == null
                                        || nowMs - mob.PathComputedAtMs > 1500
                                        || mob.BreakTarget.HasValue;

                                    if (needsRepath)
                                    {
                                        mob.Path = FindPath(
                                            (int)Math.Floor(mob.PosX), mobFeetY, (int)Math.Floor(mob.PosZ),
                                            (int)Math.Floor(best.x), targetFeetY, (int)Math.Floor(best.z),
                                            worldSeed, mobBlockChanges, maxNodes: 400);
                                        mob.PathComputedAtMs = nowMs;
                                        mob.BreakTarget = null;
                                        mob.BreakProgress = 0f;
                                    }

                                    // ── Follow path ──
                                    bool movedAlongPath = false;
                                    if (mob.Path != null && mob.Path.Count > 0)
                                    {
                                        var wp = mob.Path[0];
                                        float wpCX = wp.x + 0.5f, wpCZ = wp.z + 0.5f;
                                        float wdx = wpCX - mob.PosX, wdz = wpCZ - mob.PosZ;
                                        float wdist = (float)Math.Sqrt(wdx * wdx + wdz * wdz);
                                        if (wdist < 0.4f)
                                        {
                                            mob.Path.RemoveAt(0);
                                        }
                                        else
                                        {
                                            float wdirX = wdx / wdist, wdirZ = wdz / wdist;
                                            var candX = mob.PosX + wdirX * step;
                                            var candZ = mob.PosZ + wdirZ * step;
                                            if (!PositionBlockedByEntity(candX, candZ, players, mobs, mob.Id))
                                            {
                                                mob.PosX = candX;
                                                mob.PosZ = candZ;
                                                mob.Yaw = (float)Math.Atan2(-wdirX, -wdirZ);
                                                movedAlongPath = true;
                                            }
                                        }
                                    }

                                    // ── Fallback: direct move if no path found ──
                                    if (!movedAlongPath && mob.Path == null)
                                    {
                                        foreach (var f in new float[] { 1.0f, 0.6f, 0.35f, 0.15f })
                                        {
                                            var candX = mob.PosX + dirX * step * f;
                                            var candZ = mob.PosZ + dirZ * step * f;
                                            if (!PositionBlockedByEntity(candX, candZ, players, mobs, mob.Id))
                                            {
                                                mob.PosX = candX;
                                                mob.PosZ = candZ;
                                                break;
                                            }
                                        }
                                        mob.Yaw = (float)Math.Atan2(-dirX, -dirZ);
                                    }

                                    // ── Block breaking: when no path and mob can break blocks ──
                                    if (mob.Path == null && CanBreakBlocks(mob.Type))
                                    {
                                        (int, int, int)? blockToBreak = null;
                                        for (int ahead = 1; ahead <= 2 && blockToBreak == null; ahead++)
                                        {
                                            int checkX = (int)Math.Floor(mob.PosX + dirX * ahead);
                                            int checkZ = (int)Math.Floor(mob.PosZ + dirZ * ahead);
                                            for (int checkY = mobFeetY; checkY <= mobFeetY + 2; checkY++)
                                            {
                                                if (mobBlockChanges.TryGetValue((checkX, checkY, checkZ), out var cbid)
                                                    && IsMobBreakable(cbid))
                                                {
                                                    blockToBreak = (checkX, checkY, checkZ);
                                                    break;
                                                }
                                            }
                                        }

                                        if (blockToBreak.HasValue)
                                        {
                                            var bt = blockToBreak.Value;
                                            if (mob.BreakTarget != bt)
                                            {
                                                mob.BreakTarget = bt;
                                                mob.BreakProgress = 0f;
                                            }
                                            if ((DateTime.UtcNow - mob.LastBreakAt).TotalMilliseconds >= 900)
                                            {
                                                mob.LastBreakAt = DateTime.UtcNow;
                                                mobBlockChanges.TryGetValue(bt, out var btBid);
                                                float breakTime = MobBreakTime(mob.Type, btBid);
                                                mob.BreakProgress += 0.9f / breakTime;
                                                if (mob.BreakProgress >= 1.0f)
                                                {
                                                    GetStoredBlockCoords(bt.Item1, bt.Item2, bt.Item3,
                                                        out var bcx, out var bcz, out var blx, out var bly, out var blz);
                                                    try
                                                    {
                                                        await using var delConn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                                                        await delConn.OpenAsync(ct);
                                                        using var delCmd = new MySqlCommand(@"
                                                            DELETE FROM maxhanna.digcraft_block_changes
                                                            WHERE world_id=@wid AND chunk_x=@cx AND chunk_z=@cz
                                                              AND local_x=@lx AND local_y=@ly AND local_z=@lz", delConn);
                                                        delCmd.Parameters.AddWithValue("@wid", wid);
                                                        delCmd.Parameters.AddWithValue("@cx", bcx);
                                                        delCmd.Parameters.AddWithValue("@cz", bcz);
                                                        delCmd.Parameters.AddWithValue("@lx", blx);
                                                        delCmd.Parameters.AddWithValue("@ly", bly);
                                                        delCmd.Parameters.AddWithValue("@lz", blz);
                                                        await delCmd.ExecuteNonQueryAsync(ct);
                                                    }
                                                    catch { }
                                                    mob.BreakTarget = null;
                                                    mob.BreakProgress = 0f;
                                                    mob.Path = null; // force repath
                                                }
                                            }
                                        }
                                    }

                                    // ── Vertical alignment: snap to floor (respects player-placed blocks) ──
                                    {
                                        int gx2 = (int)Math.Floor(mob.PosX);
                                        int gz2 = (int)Math.Floor(mob.PosZ);
                                        int currentFeetY = (int)Math.Floor(mob.PosY - eyeH);
                                        int groundY = -1;
                                        // Scan up to 16 blocks down to handle large spawn discrepancies
                                        for (int scanY = currentFeetY + 1; scanY >= Math.Max(0, currentFeetY - 16); scanY--)
                                        {
                                            int bid = mobBlockChanges.TryGetValue((gx2, scanY, gz2), out var cb) ? cb
                                                    : GetBaseBlockId(worldSeed, gx2, scanY, gz2);
                                            // Valid floor: solid, not fluid, not passable vegetation
                                            if (bid != BlockIds.AIR && bid != BlockIds.WATER && bid != BlockIds.LAVA
                                                && bid != BlockIds.LEAVES && bid != BlockIds.TALLGRASS && bid != BlockIds.SHRUB)
                                            { groundY = scanY; break; }
                                        }
                                        if (groundY >= 0)
                                        {
                                            float targetY = groundY + 1 + eyeH;
                                            float yDiff = targetY - mob.PosY;
                                            if (Math.Abs(yDiff) > 0.05f)
                                                mob.PosY += Math.Sign(yDiff) * Math.Min(Math.Abs(yDiff), 12f * tickSec);
                                            else
                                                mob.PosY = targetY;
                                        }
                                    }

                                    mob.LastActiveMs = nowMs;

                                    // ── Attack player if in range ──
                                    const float attackRange = 1.5f;
                                    var dist3Full = (float)Math.Sqrt(Math.Max(1e-6,
                                        (best.x - mob.PosX) * (best.x - mob.PosX) +
                                        (best.y - mob.PosY) * (best.y - mob.PosY) +
                                        (best.z - mob.PosZ) * (best.z - mob.PosZ)));
                                    if (dist3Full <= attackRange)
                                    {
                                        if ((DateTime.UtcNow - mob.LastAttackAt).TotalMilliseconds >= 900)
                                        {
                                            mob.LastAttackAt = DateTime.UtcNow;
                                            const float attackOffset = 0.9f;
                                            if (distXZ > 0.001f)
                                            {
                                                mob.PosX = best.x - (dx / distXZ) * attackOffset;
                                                mob.PosZ = best.z - (dz / distXZ) * attackOffset;
                                            }
                                            else { mob.PosX = best.x + attackOffset; mob.PosZ = best.z; }

                                            int baseDamage = mob.Type switch
                                            {
                                                "Zombie" => 4,
                                                "Skeleton" => 3,
                                                "WitherSkeleton" => 8,
                                                "Blaze" => 5,
                                                "Ghast" => 6,
                                                "Hoglin" => 6,
                                                "Wolf" => 3,
                                                "PolarBear" => 5,
                                                "Bear" => BEAR_DAMAGE,
                                                _ => 1
                                            };
                                            _ = Task.Run(async () => await ApplyMobDamageToPlayerAsync(best.userId, wid, baseDamage));

                                            float knockDx = (float)Math.Cos(Math.Atan2(best.x - mob.PosX, best.z - mob.PosZ));
                                            float knockDz = (float)Math.Sin(Math.Atan2(best.x - mob.PosX, best.z - mob.PosZ));
                                            await using var knockConn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                                            await knockConn.OpenAsync(ct);
                                            using var knockCmd2 = new MySqlCommand(@"
                                                UPDATE maxhanna.digcraft_players SET pos_x = pos_x + @dx, pos_z = pos_z + @dz
                                                WHERE user_id = @uid AND world_id = @wid", knockConn);
                                            knockCmd2.Parameters.AddWithValue("@uid", best.userId);
                                            knockCmd2.Parameters.AddWithValue("@wid", wid);
                                            knockCmd2.Parameters.AddWithValue("@dx", knockDx * 0.5f);
                                            knockCmd2.Parameters.AddWithValue("@dz", knockDz * 0.5f);
                                            await knockCmd2.ExecuteNonQueryAsync(ct);
                                        }
                                    }
                                }
                                else
                                {
                                    // if inactive for long enough, reset to home/spawn
                                    var nowMsInner = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                                    if (nowMsInner - mob.LastActiveMs > resetTimeoutMs)
                                    {
                                        mob.PosX = mob.HomeX;
                                        mob.PosY = mob.HomeY;
                                        mob.PosZ = mob.HomeZ;
                                        mob.Yaw = 0;
                                        mob.LastActiveMs = nowMsInner;
                                    }
                                    else
                                    {
                                        // wander
                                        var a = (System.DateTime.UtcNow.Ticks + mob.Id) % 1000 / 1000.0 * Math.PI * 2.0;
                                        var vx = (float)Math.Cos(a) * 0.4f;
                                        var vz = (float)Math.Sin(a) * 0.4f;
                                        var wanderStep = tickSec * 0.4f;
                                        var tried = false;
                                        var dirLen = (float)Math.Sqrt(vx * vx + vz * vz);
                                        if (dirLen > 1e-6f)
                                        {
                                            var ndx = vx / dirLen;
                                            var ndz = vz / dirLen;
                                            foreach (var f in new float[] { 1.0f, 0.6f, 0.35f, 0.15f })
                                            {
                                                var candX = mob.PosX + ndx * wanderStep * f;
                                                var candZ = mob.PosZ + ndz * wanderStep * f;
                                                if (!PositionBlockedByEntity(candX, candZ, players, mobs, mob.Id)
                                                    && HasHeadClearance(worldSeed, candX, candZ, mob.PosY))
                                                {
                                                    mob.PosX = candX;
                                                    mob.PosZ = candZ;
                                                    tried = true;
                                                    break;
                                                }
                                            }
                                        }
                                        if (!tried)
                                        {
                                            // couldn't move due to crowding; stay in place
                                        }
                                        mob.Yaw = (float)Math.Atan2(-vx, -vz);

                                        // Align mob to ground surface during wander
                                        // Use same scan as hostile path: check mobBlockChanges + base terrain
                                        {
                                            int wx2 = (int)Math.Floor(mob.PosX), wz2 = (int)Math.Floor(mob.PosZ);
                                            int currentFeetY2 = (int)Math.Floor(mob.PosY - 1.6f);
                                            int groundY2 = -1;
                                            for (int scanY = currentFeetY2 + 1; scanY >= Math.Max(0, currentFeetY2 - 16); scanY--)
                                            {
                                                int bid2 = GetBaseBlockId(worldSeed, wx2, scanY, wz2);
                                                if (bid2 != BlockIds.AIR && bid2 != BlockIds.WATER && bid2 != BlockIds.LAVA
                                                    && bid2 != BlockIds.LEAVES && bid2 != BlockIds.TALLGRASS && bid2 != BlockIds.SHRUB)
                                                { groundY2 = scanY; break; }
                                            }
                                            if (groundY2 >= 0)
                                            {
                                                float targetY2 = groundY2 + 1 + 1.6f;
                                                float diff2 = targetY2 - mob.PosY;
                                                if (Math.Abs(diff2) > 0.05f)
                                                    mob.PosY += Math.Sign(diff2) * Math.Min(Math.Abs(diff2), 12f * tickSec);
                                                else
                                                    mob.PosY = targetY2;
                                            }
                                        }
                                    }
                                }
                            }

                            // Health regeneration: players only stop regenerating when food drops below 3.
                            const int REGEN_DEBUG_MULTIPLIER = 1; // Increase to test faster (e.g. 60 = 1 HP per 1.5s instead of 90s)
                            const int regenIntervalMs = 90_000 / REGEN_DEBUG_MULTIPLIER;
                            foreach (var p in players)
                            {
                                if (!playerStats.TryGetValue(p.userId, out var stats)) continue;
                                var curHealth = stats.health;
                                var curHunger = stats.hunger;
                                if (curHunger >= 3 && curHealth < 20)
                                {
                                    if (!_lastHealthRegenAt.TryGetValue(p.userId, out var last) || (DateTime.UtcNow - last).TotalMilliseconds >= regenIntervalMs)
                                    {
                                        try
                                        {
                                            await using var conn2 = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                                            await conn2.OpenAsync();
                                            using var updCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET health = LEAST(20, health + 1) WHERE user_id=@uid AND world_id=@wid", conn2);
                                            updCmd.Parameters.AddWithValue("@uid", p.userId);
                                            updCmd.Parameters.AddWithValue("@wid", wid);
                                            await updCmd.ExecuteNonQueryAsync();
                                            _lastHealthRegenAt[p.userId] = DateTime.UtcNow;
                                        }
                                        catch (Exception ex)
                                        {
                                            _ = _log.Db("HealthRegen error: " + ex.Message, p.userId, "DIGCRAFT", true);
                                        }
                                    }
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _ = _log.Db("MobSimulation error for world " + wid + ": " + ex.Message, null, "DIGCRAFT", true);
                        }
                    }

                    await Task.Delay(_mobTickMs, ct);
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception ex)
            {
                _ = _log.Db("MobSimulationLoopAsync fatal: " + ex.Message, null, "DIGCRAFT", true);
            }
        }

        // ── Shared armor/durability helpers ─────────────────────────────────────────

        /// <summary>Armor protection points per item (matches Minecraft values).</summary>
private static int ArmorPointsForItem(int itemId) => itemId switch
            {
                ItemIds.LEATHER_HELMET => 1,
                ItemIds.LEATHER_CHEST => 3,
                ItemIds.LEATHER_LEGS => 2,
                ItemIds.LEATHER_BOOTS => 1,
                ItemIds.IRON_HELMET => 2,
                ItemIds.IRON_CHEST => 6,
                ItemIds.IRON_LEGS => 5,
                ItemIds.IRON_BOOTS => 2,
                ItemIds.DIAMOND_HELMET => 3,
                ItemIds.DIAMOND_CHEST => 8,
                ItemIds.DIAMOND_LEGS => 6,
                ItemIds.DIAMOND_BOOTS => 3,
                ItemIds.NETHERITE_HELMET => 3,
                ItemIds.NETHERITE_CHEST => 8,
                ItemIds.NETHERITE_LEGS => 6,
                ItemIds.NETHERITE_BOOTS => 3,
                ItemIds.COPPER_HELMET => 2,
                ItemIds.COPPER_CHEST => 6,
                ItemIds.COPPER_LEGS => 4,
                ItemIds.COPPER_BOOTS => 2,
                ItemIds.GOLD_HELMET => 1,
                ItemIds.GOLD_CHEST => 5,
                ItemIds.GOLD_LEGS => 3,
                ItemIds.GOLD_BOOTS => 1,
                // Dyed Leather armor items
                ItemIds.LEATHER_HELMET_WHITE => 1,
                ItemIds.LEATHER_CHEST_WHITE => 3,
                ItemIds.LEATHER_LEGS_WHITE => 2,
                ItemIds.LEATHER_BOOTS_WHITE => 1,
                ItemIds.LEATHER_HELMET_ORANGE => 1,
                ItemIds.LEATHER_CHEST_ORANGE => 3,
                ItemIds.LEATHER_LEGS_ORANGE => 2,
                ItemIds.LEATHER_BOOTS_ORANGE => 1,
                ItemIds.LEATHER_HELMET_YELLOW => 1,
                ItemIds.LEATHER_CHEST_YELLOW => 3,
                ItemIds.LEATHER_LEGS_YELLOW => 2,
                ItemIds.LEATHER_BOOTS_YELLOW => 1,
                ItemIds.LEATHER_HELMET_LIME => 1,
                ItemIds.LEATHER_CHEST_LIME => 3,
                ItemIds.LEATHER_LEGS_LIME => 2,
                ItemIds.LEATHER_BOOTS_LIME => 1,
                ItemIds.LEATHER_HELMET_LIGHT_BLUE => 1,
                ItemIds.LEATHER_CHEST_LIGHT_BLUE => 3,
                ItemIds.LEATHER_LEGS_LIGHT_BLUE => 2,
                ItemIds.LEATHER_BOOTS_LIGHT_BLUE => 1,
                ItemIds.LEATHER_HELMET_PINK => 1,
                ItemIds.LEATHER_CHEST_PINK => 3,
                ItemIds.LEATHER_LEGS_PINK => 2,
                ItemIds.LEATHER_BOOTS_PINK => 1,
                ItemIds.LEATHER_HELMET_MAGENTA => 1,
                ItemIds.LEATHER_CHEST_MAGENTA => 3,
                ItemIds.LEATHER_LEGS_MAGENTA => 2,
                ItemIds.LEATHER_BOOTS_MAGENTA => 1,
                ItemIds.LEATHER_HELMET_GRAY => 1,
                ItemIds.LEATHER_CHEST_GRAY => 3,
                ItemIds.LEATHER_LEGS_GRAY => 2,
                ItemIds.LEATHER_BOOTS_GRAY => 1,
                ItemIds.LEATHER_HELMET_LIGHT_GRAY => 1,
                ItemIds.LEATHER_CHEST_LIGHT_GRAY => 3,
                ItemIds.LEATHER_LEGS_LIGHT_GRAY => 2,
                ItemIds.LEATHER_BOOTS_LIGHT_GRAY => 1,
                ItemIds.LEATHER_HELMET_CYAN => 1,
                ItemIds.LEATHER_CHEST_CYAN => 3,
                ItemIds.LEATHER_LEGS_CYAN => 2,
                ItemIds.LEATHER_BOOTS_CYAN => 1,
                ItemIds.LEATHER_HELMET_PURPLE => 1,
                ItemIds.LEATHER_CHEST_PURPLE => 3,
                ItemIds.LEATHER_LEGS_PURPLE => 2,
                ItemIds.LEATHER_BOOTS_PURPLE => 1,
                // Dyed Iron armor items
                ItemIds.IRON_HELMET_WHITE => 2,
                ItemIds.IRON_CHEST_WHITE => 6,
                ItemIds.IRON_LEGS_WHITE => 5,
                ItemIds.IRON_BOOTS_WHITE => 2,
                ItemIds.IRON_HELMET_ORANGE => 2,
                ItemIds.IRON_CHEST_ORANGE => 6,
                ItemIds.IRON_LEGS_ORANGE => 5,
                ItemIds.IRON_BOOTS_ORANGE => 2,
                ItemIds.IRON_HELMET_YELLOW => 2,
                ItemIds.IRON_CHEST_YELLOW => 6,
                ItemIds.IRON_LEGS_YELLOW => 5,
                ItemIds.IRON_BOOTS_YELLOW => 2,
                ItemIds.IRON_HELMET_LIME => 2,
                ItemIds.IRON_CHEST_LIME => 6,
                ItemIds.IRON_LEGS_LIME => 5,
                ItemIds.IRON_BOOTS_LIME => 2,
                ItemIds.IRON_HELMET_LIGHT_BLUE => 2,
                ItemIds.IRON_CHEST_LIGHT_BLUE => 6,
                ItemIds.IRON_LEGS_LIGHT_BLUE => 5,
                ItemIds.IRON_BOOTS_LIGHT_BLUE => 2,
                ItemIds.IRON_HELMET_PINK => 2,
                ItemIds.IRON_CHEST_PINK => 6,
                ItemIds.IRON_LEGS_PINK => 5,
                ItemIds.IRON_BOOTS_PINK => 2,
                ItemIds.IRON_HELMET_MAGENTA => 2,
                ItemIds.IRON_CHEST_MAGENTA => 6,
                ItemIds.IRON_LEGS_MAGENTA => 5,
                ItemIds.IRON_BOOTS_MAGENTA => 2,
                ItemIds.IRON_HELMET_GRAY => 2,
                ItemIds.IRON_CHEST_GRAY => 6,
                ItemIds.IRON_LEGS_GRAY => 5,
                ItemIds.IRON_BOOTS_GRAY => 2,
                ItemIds.IRON_HELMET_LIGHT_GRAY => 2,
                ItemIds.IRON_CHEST_LIGHT_GRAY => 6,
                ItemIds.IRON_LEGS_LIGHT_GRAY => 5,
                ItemIds.IRON_BOOTS_LIGHT_GRAY => 2,
                ItemIds.IRON_HELMET_CYAN => 2,
                ItemIds.IRON_CHEST_CYAN => 6,
                ItemIds.IRON_LEGS_CYAN => 5,
                ItemIds.IRON_BOOTS_CYAN => 2,
                ItemIds.IRON_HELMET_PURPLE => 2,
                ItemIds.IRON_CHEST_PURPLE => 6,
                ItemIds.IRON_LEGS_PURPLE => 5,
                ItemIds.IRON_BOOTS_PURPLE => 2,
                // Dyed Diamond armor items
                ItemIds.DIAMOND_HELMET_WHITE => 3,
                ItemIds.DIAMOND_CHEST_WHITE => 8,
                ItemIds.DIAMOND_LEGS_WHITE => 6,
                ItemIds.DIAMOND_BOOTS_WHITE => 3,
                ItemIds.DIAMOND_HELMET_ORANGE => 3,
                ItemIds.DIAMOND_CHEST_ORANGE => 8,
                ItemIds.DIAMOND_LEGS_ORANGE => 6,
                ItemIds.DIAMOND_BOOTS_ORANGE => 3,
                ItemIds.DIAMOND_HELMET_YELLOW => 3,
                ItemIds.DIAMOND_CHEST_YELLOW => 8,
                ItemIds.DIAMOND_LEGS_YELLOW => 6,
                ItemIds.DIAMOND_BOOTS_YELLOW => 3,
                ItemIds.DIAMOND_HELMET_LIME => 3,
                ItemIds.DIAMOND_CHEST_LIME => 8,
                ItemIds.DIAMOND_LEGS_LIME => 6,
                ItemIds.DIAMOND_BOOTS_LIME => 3,
                ItemIds.DIAMOND_HELMET_LIGHT_BLUE => 3,
                ItemIds.DIAMOND_CHEST_LIGHT_BLUE => 8,
                ItemIds.DIAMOND_LEGS_LIGHT_BLUE => 6,
                ItemIds.DIAMOND_BOOTS_LIGHT_BLUE => 3,
                ItemIds.DIAMOND_HELMET_PINK => 3,
                ItemIds.DIAMOND_CHEST_PINK => 8,
                ItemIds.DIAMOND_LEGS_PINK => 6,
                ItemIds.DIAMOND_BOOTS_PINK => 3,
                ItemIds.DIAMOND_HELMET_MAGENTA => 3,
                ItemIds.DIAMOND_CHEST_MAGENTA => 8,
                ItemIds.DIAMOND_LEGS_MAGENTA => 6,
                ItemIds.DIAMOND_BOOTS_MAGENTA => 3,
                ItemIds.DIAMOND_HELMET_GRAY => 3,
                ItemIds.DIAMOND_CHEST_GRAY => 8,
                ItemIds.DIAMOND_LEGS_GRAY => 6,
                ItemIds.DIAMOND_BOOTS_GRAY => 3,
                ItemIds.DIAMOND_HELMET_LIGHT_GRAY => 3,
                ItemIds.DIAMOND_CHEST_LIGHT_GRAY => 8,
                ItemIds.DIAMOND_LEGS_LIGHT_GRAY => 6,
                ItemIds.DIAMOND_BOOTS_LIGHT_GRAY => 3,
                ItemIds.DIAMOND_HELMET_CYAN => 3,
                ItemIds.DIAMOND_CHEST_CYAN => 8,
                ItemIds.DIAMOND_LEGS_CYAN => 6,
                ItemIds.DIAMOND_BOOTS_CYAN => 3,
                ItemIds.DIAMOND_HELMET_PURPLE => 3,
                ItemIds.DIAMOND_CHEST_PURPLE => 8,
                ItemIds.DIAMOND_LEGS_PURPLE => 6,
                ItemIds.DIAMOND_BOOTS_PURPLE => 3,
                // Dyed Gold armor items
                ItemIds.GOLD_HELMET_WHITE => 1,
                ItemIds.GOLD_CHEST_WHITE => 5,
                ItemIds.GOLD_LEGS_WHITE => 3,
                ItemIds.GOLD_BOOTS_WHITE => 1,
                ItemIds.GOLD_HELMET_ORANGE => 1,
                ItemIds.GOLD_CHEST_ORANGE => 5,
                ItemIds.GOLD_LEGS_ORANGE => 3,
                ItemIds.GOLD_BOOTS_ORANGE => 1,
                ItemIds.GOLD_HELMET_YELLOW => 1,
                ItemIds.GOLD_CHEST_YELLOW => 5,
                ItemIds.GOLD_LEGS_YELLOW => 3,
                ItemIds.GOLD_BOOTS_YELLOW => 1,
                ItemIds.GOLD_HELMET_LIME => 1,
                ItemIds.GOLD_CHEST_LIME => 5,
                ItemIds.GOLD_LEGS_LIME => 3,
                ItemIds.GOLD_BOOTS_LIME => 1,
                ItemIds.GOLD_HELMET_LIGHT_BLUE => 1,
                ItemIds.GOLD_CHEST_LIGHT_BLUE => 5,
                ItemIds.GOLD_LEGS_LIGHT_BLUE => 3,
                ItemIds.GOLD_BOOTS_LIGHT_BLUE => 1,
                ItemIds.GOLD_HELMET_PINK => 1,
                ItemIds.GOLD_CHEST_PINK => 5,
                ItemIds.GOLD_LEGS_PINK => 3,
                ItemIds.GOLD_BOOTS_PINK => 1,
                ItemIds.GOLD_HELMET_MAGENTA => 1,
                ItemIds.GOLD_CHEST_MAGENTA => 5,
                ItemIds.GOLD_LEGS_MAGENTA => 3,
                ItemIds.GOLD_BOOTS_MAGENTA => 1,
                ItemIds.GOLD_HELMET_GRAY => 1,
                ItemIds.GOLD_CHEST_GRAY => 5,
                ItemIds.GOLD_LEGS_GRAY => 3,
                ItemIds.GOLD_BOOTS_GRAY => 1,
                ItemIds.GOLD_HELMET_LIGHT_GRAY => 1,
                ItemIds.GOLD_CHEST_LIGHT_GRAY => 5,
                ItemIds.GOLD_LEGS_LIGHT_GRAY => 3,
                ItemIds.GOLD_BOOTS_LIGHT_GRAY => 1,
                ItemIds.GOLD_HELMET_CYAN => 1,
                ItemIds.GOLD_CHEST_CYAN => 5,
                ItemIds.GOLD_LEGS_CYAN => 3,
                ItemIds.GOLD_BOOTS_CYAN => 1,
                ItemIds.GOLD_HELMET_PURPLE => 1,
                ItemIds.GOLD_CHEST_PURPLE => 5,
                ItemIds.GOLD_LEGS_PURPLE => 3,
                ItemIds.GOLD_BOOTS_PURPLE => 1,
                _ => 0
            };

        /// <summary>Max durability per item — mirrors ITEM_DURABILITY in digcraft-types.ts.</summary>
        private static int ItemMaxDurability(int itemId) => itemId switch
        {
            // Pickaxes
            ItemIds.WOODEN_PICKAXE => 60,
            ItemIds.STONE_PICKAXE => 132,
            ItemIds.COPPER_PICKAXE => 175,
            ItemIds.IRON_PICKAXE => 251,
            ItemIds.DIAMOND_PICKAXE => 1562,
            ItemIds.NETHERITE_PICKAXE => 2031,
            ItemIds.GOLD_PICKAXE => 33,

            // Swords
            ItemIds.WOODEN_SWORD => 60,
            ItemIds.STONE_SWORD => 132,
            ItemIds.COPPER_SWORD => 175,
            ItemIds.IRON_SWORD => 251,
            ItemIds.DIAMOND_SWORD => 1562,
            ItemIds.NETHERITE_SWORD => 2031,
            ItemIds.GOLD_SWORD => 33,

            // Axes
            ItemIds.WOODEN_AXE => 60,
            ItemIds.STONE_AXE => 132,
            ItemIds.COPPER_AXE => 175,
            ItemIds.IRON_AXE => 251,
            ItemIds.DIAMOND_AXE => 1562,
            ItemIds.NETHERITE_AXE => 2031,
            ItemIds.GOLD_AXE => 33,

            // Leather armor
            ItemIds.LEATHER_HELMET => 55,
            ItemIds.LEATHER_CHEST => 80,
            ItemIds.LEATHER_LEGS => 75,
            ItemIds.LEATHER_BOOTS => 65,

            // Iron armor
            ItemIds.IRON_HELMET => 165,
            ItemIds.IRON_CHEST => 240,
            ItemIds.IRON_LEGS => 225,
            ItemIds.IRON_BOOTS => 195,

            // Diamond armor
            ItemIds.DIAMOND_HELMET => 363,
            ItemIds.DIAMOND_CHEST => 528,
            ItemIds.DIAMOND_LEGS => 495,
            ItemIds.DIAMOND_BOOTS => 429,

            // Netherite armor
            ItemIds.NETHERITE_HELMET => 407,
            ItemIds.NETHERITE_CHEST => 592,
            ItemIds.NETHERITE_LEGS => 555,
            ItemIds.NETHERITE_BOOTS => 481,

            // Copper armor
            ItemIds.COPPER_HELMET => 110,
            ItemIds.COPPER_CHEST => 160,
            ItemIds.COPPER_LEGS => 150,
            ItemIds.COPPER_BOOTS => 130,

            // Gold armor
            ItemIds.GOLD_HELMET => 77,
            ItemIds.GOLD_CHEST => 112,
            ItemIds.GOLD_LEGS => 105,
            ItemIds.GOLD_BOOTS => 78,

            // Misc
            ItemIds.TORCH => 50,
            ItemIds.BOW => 300,
            ItemIds.SHIELD => 337,

            _ => 0
        };



        private async Task ApplyMobDamageToPlayerAsync(int userId, int worldId, int damage)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Read equipment + durability
                int helmet = 0, chest = 0, legs = 0, boots = 0;
                int helmetDur = -1, chestDur = -1, legsDur = -1, bootsDur = -1;
                int playerId = 0;
                using (var eCmd = new MySqlCommand(@"
                    SELECT p.id, e.helmet, e.chest, e.legs, e.boots,
                           COALESCE(e.helmet_dur,-1) AS helmet_dur,
                           COALESCE(e.chest_dur,-1)  AS chest_dur,
                           COALESCE(e.legs_dur,-1)   AS legs_dur,
                           COALESCE(e.boots_dur,-1)  AS boots_dur
                    FROM maxhanna.digcraft_equipment e
                    JOIN maxhanna.digcraft_players p ON e.player_id = p.id
                    WHERE p.user_id=@uid AND p.world_id=@wid", conn))
                {
                    eCmd.Parameters.AddWithValue("@uid", userId);
                    eCmd.Parameters.AddWithValue("@wid", worldId);
                    using var er = await eCmd.ExecuteReaderAsync();
                    if (await er.ReadAsync())
                    {
                        playerId = er.GetInt32("id");
                        helmet = er.IsDBNull(er.GetOrdinal("helmet")) ? 0 : er.GetInt32("helmet");
                        chest = er.IsDBNull(er.GetOrdinal("chest")) ? 0 : er.GetInt32("chest");
                        legs = er.IsDBNull(er.GetOrdinal("legs")) ? 0 : er.GetInt32("legs");
                        boots = er.IsDBNull(er.GetOrdinal("boots")) ? 0 : er.GetInt32("boots");
                        helmetDur = er.IsDBNull(er.GetOrdinal("helmet_dur")) ? -1 : er.GetInt32("helmet_dur");
                        chestDur = er.IsDBNull(er.GetOrdinal("chest_dur")) ? -1 : er.GetInt32("chest_dur");
                        legsDur = er.IsDBNull(er.GetOrdinal("legs_dur")) ? -1 : er.GetInt32("legs_dur");
                        bootsDur = er.IsDBNull(er.GetOrdinal("boots_dur")) ? -1 : er.GetInt32("boots_dur");
                    }
                }

                // Initialise durability from max if not yet set
                if (helmet > 0 && helmetDur < 0) helmetDur = ItemMaxDurability(helmet);
                if (chest > 0 && chestDur < 0) chestDur = ItemMaxDurability(chest);
                if (legs > 0 && legsDur < 0) legsDur = ItemMaxDurability(legs);
                if (boots > 0 && bootsDur < 0) bootsDur = ItemMaxDurability(boots);

                var armorPoints = ArmorPointsForItem(helmet) + ArmorPointsForItem(chest)
                                + ArmorPointsForItem(legs) + ArmorPointsForItem(boots);
                var reduction = Math.Min(0.8f, armorPoints * 0.04f);
                var reducedDamage = (int)Math.Max(1, Math.Floor(damage * (1.0f - reduction)));

                // Apply health damage
                using var updCmd = new MySqlCommand(
                    "UPDATE maxhanna.digcraft_players SET health = GREATEST(0, health - @damage) WHERE user_id=@uid AND world_id=@wid", conn);
                updCmd.Parameters.AddWithValue("@damage", reducedDamage);
                updCmd.Parameters.AddWithValue("@uid", userId);
                updCmd.Parameters.AddWithValue("@wid", worldId);
                await updCmd.ExecuteNonQueryAsync();

                // Reduce durability of each worn armor piece by 1 per hit
                if (playerId > 0 && armorPoints > 0)
                {
                    if (helmet > 0) helmetDur--;
                    if (chest > 0) chestDur--;
                    if (legs > 0) legsDur--;
                    if (boots > 0) bootsDur--;

                    // Break items at 0
                    if (helmet > 0 && helmetDur <= 0) { helmet = 0; helmetDur = 0; }
                    if (chest > 0 && chestDur <= 0) { chest = 0; chestDur = 0; }
                    if (legs > 0 && legsDur <= 0) { legs = 0; legsDur = 0; }
                    if (boots > 0 && bootsDur <= 0) { boots = 0; bootsDur = 0; }

                    using var durCmd = new MySqlCommand(@"
                        INSERT INTO maxhanna.digcraft_equipment
                            (player_id, helmet, chest, legs, boots, helmet_dur, chest_dur, legs_dur, boots_dur)
                        VALUES (@pid, @h, @c, @l, @b, @hd, @cd, @ld, @bd)
                        ON DUPLICATE KEY UPDATE
                            helmet=VALUES(helmet), chest=VALUES(chest),
                            legs=VALUES(legs),     boots=VALUES(boots),
                            helmet_dur=VALUES(helmet_dur), chest_dur=VALUES(chest_dur),
                            legs_dur=VALUES(legs_dur),     boots_dur=VALUES(boots_dur)", conn);
                    durCmd.Parameters.AddWithValue("@pid", playerId);
                    durCmd.Parameters.AddWithValue("@h", helmet);
                    durCmd.Parameters.AddWithValue("@c", chest);
                    durCmd.Parameters.AddWithValue("@l", legs);
                    durCmd.Parameters.AddWithValue("@b", boots);
                    durCmd.Parameters.AddWithValue("@hd", helmetDur);
                    durCmd.Parameters.AddWithValue("@cd", chestDur);
                    durCmd.Parameters.AddWithValue("@ld", legsDur);
                    durCmd.Parameters.AddWithValue("@bd", bootsDur);
                    await durCmd.ExecuteNonQueryAsync();
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db("ApplyMobDamageToPlayerAsync error: " + ex.Message, userId, "DIGCRAFT", true);
            }
        }

        /// <summary>Respawn the player at world spawn, clear inventory and equipment.</summary>
        [HttpPost("Respawn")]
        public async Task<IActionResult> Respawn([FromBody] DataContracts.DigCraft.RespawnRequest req)
        {
            if (req == null || req.UserId <= 0) return BadRequest("Invalid request");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Get world seed and spawn coords
                float spawnX = 8, spawnY = 34, spawnZ = 8;
                int worldSeed = 42;
                using (var wCmd = new MySqlCommand("SELECT seed, spawn_x, spawn_y, spawn_z FROM maxhanna.digcraft_worlds WHERE id=@wid", conn))
                {
                    wCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    using var r = await wCmd.ExecuteReaderAsync();
                    if (await r.ReadAsync())
                    {
                        worldSeed = r.GetInt32("seed");
                        spawnX = r.GetFloat("spawn_x");
                        spawnY = r.GetFloat("spawn_y");
                        spawnZ = r.GetFloat("spawn_z");
                    }
                }

                // Find a random spawn position high in the air on a mountain (not over water)
                var rand = new Random();
                int searchRadius = 756;
                int maxAttempts = 500;
                const int minSpawnHeight = 100; // Minimum Y for spawn (mountain height)
                const int airDropHeight = 64;   // Start player in the air for a fun drop

                for (int attempt = 0; attempt < maxAttempts; attempt++)
                {
                    // Generate random position within search radius of world spawn
                    int testX = (int)spawnX + rand.Next(-searchRadius, searchRadius + 1);
                    int testZ = (int)spawnZ + rand.Next(-searchRadius, searchRadius + 1);

                    // Find surface Y at this X,Z
                    int surfaceY = GetSurfaceY(worldSeed, testX, testZ);

                    // Must be high enough (mountain/ highlands)
                    if (surfaceY < minSpawnHeight) continue;

                    // Check biome to avoid water bodies
                    var col = SampleTerrainColumn(worldSeed, testX, testZ);
                    bool isWaterBiome = col.Biome == BiomeIds.OCEAN || col.Biome == BiomeIds.DEEP_OCEAN ||
                                        col.Biome == BiomeIds.COLD_OCEAN || col.Biome == BiomeIds.FROZEN_OCEAN ||
                                        col.Biome == BiomeIds.LUKWARM_OCEAN || col.Biome == BiomeIds.WARM_OCEAN ||
                                        col.Biome == BiomeIds.RIVER || col.Biome == BiomeIds.FROZEN_RIVER;
                    if (isWaterBiome) continue;

                    // Check if surface is grass and has air above it
                    if (surfaceY > 1)
                    {
                        int blockAtSurface = GetBlockAt(conn, req.WorldId, testX, surfaceY, testZ, worldSeed);
                        int blockBelow = GetBlockAt(conn, req.WorldId, testX, surfaceY - 1, testZ, worldSeed);
                        int blockAbove = GetBlockAt(conn, req.WorldId, testX, surfaceY + 1, testZ, worldSeed);

                        // Surface should be grass, below should be dirt, above should be air
                        if (blockAtSurface == BlockIds.GRASS && blockBelow == BlockIds.DIRT && blockAbove == BlockIds.AIR)
                        {
                            spawnX = testX + 0.5f;
                            spawnY = surfaceY + airDropHeight; // Start high in the air!
                            spawnZ = testZ + 0.5f;
                            break;
                        }
                    }
                }

                // If no random spawn found, use default spawn (will be validated by client)

                // Resolve player id
                int playerId = 0;
                using (var pCmd = new MySqlCommand("SELECT id FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn))
                {
                    pCmd.Parameters.AddWithValue("@uid", req.UserId);
                    pCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    var obj = await pCmd.ExecuteScalarAsync();
                    if (obj != null) playerId = Convert.ToInt32(obj);
                }
                if (playerId == 0) return BadRequest("Player not found");

                // Reset player position, health, hunger, and exp/level on death
                using (var updCmd = new MySqlCommand(@"
                    UPDATE maxhanna.digcraft_players
                    SET pos_x=@px, pos_y=@py, pos_z=@pz, health = 20, hunger = 20, yaw = 0, pitch = 0, last_seen = UTC_TIMESTAMP(), level = 1, exp = 0
                    WHERE id=@pid", conn))
                {
                    updCmd.Parameters.AddWithValue("@px", spawnX);
                    updCmd.Parameters.AddWithValue("@py", spawnY);
                    updCmd.Parameters.AddWithValue("@pz", spawnZ);
                    updCmd.Parameters.AddWithValue("@pid", playerId);
                    await updCmd.ExecuteNonQueryAsync();
                }

                // Remove inventory for this player
                using (var delInv = new MySqlCommand("DELETE FROM maxhanna.digcraft_inventory WHERE player_id=@pid", conn))
                {
                    delInv.Parameters.AddWithValue("@pid", playerId);
                    await delInv.ExecuteNonQueryAsync();
                }

                // Reset equipment to zeros (upsert)
                const string upsertEq = @"
                    INSERT INTO maxhanna.digcraft_equipment (player_id, helmet, chest, legs, boots, weapon, left_hand)
                    VALUES (@pid, 0, 0, 0, 0, 0, 0)
                    ON DUPLICATE KEY UPDATE helmet=0, chest=0, legs=0, boots=0, weapon=0, left_hand=0;";
                using (var eqCmd = new MySqlCommand(upsertEq, conn))
                {
                    eqCmd.Parameters.AddWithValue("@pid", playerId);
                    await eqCmd.ExecuteNonQueryAsync();
                }

                // Read updated player row
                object? player = null;
                using (var rCmd = new MySqlCommand(@"
                    SELECT p.user_id, p.pos_x, p.pos_y, p.pos_z, p.yaw, p.pitch, p.health, p.hunger, p.color, u.username
                    FROM maxhanna.digcraft_players p
                    JOIN maxhanna.users u ON u.id = p.user_id
                    WHERE p.id=@pid", conn))
                {
                    rCmd.Parameters.AddWithValue("@pid", playerId);
                    using var r = await rCmd.ExecuteReaderAsync();
                    if (await r.ReadAsync())
                    {
                        player = new
                        {
                            userId = r.GetInt32("user_id"),
                            posX = r.GetFloat("pos_x"),
                            posY = r.GetFloat("pos_y"),
                            posZ = r.GetFloat("pos_z"),
                            yaw = r.GetFloat("yaw"),
                            pitch = r.GetFloat("pitch"),
                            health = r.GetInt32("health"),
                            hunger = r.GetInt32("hunger"),
                            color = r.IsDBNull(r.GetOrdinal("color")) ? null : r.GetString("color"),
                            username = r.IsDBNull(r.GetOrdinal("username")) ? null : r.GetString("username")
                        };
                    }
                }

                return Ok(new { player, inventory = new List<object>(), equipment = new { helmet = 0, chest = 0, legs = 0, boots = 0, weapon = 0, leftHand = 0 } });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft Respawn error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Kill the player by setting health to 0, triggering respawn logic.</summary>
        [HttpPost("KillPlayer")]
        public async Task<IActionResult> KillPlayer([FromBody] DataContracts.DigCraft.RespawnRequest req)
        {
            if (req == null || req.UserId <= 0) return BadRequest("Invalid request");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Set player health to 0
                using var updCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET health = 0 WHERE user_id=@uid AND world_id=@wid", conn);
                updCmd.Parameters.AddWithValue("@uid", req.UserId);
                updCmd.Parameters.AddWithValue("@wid", req.WorldId);
                int affected = await updCmd.ExecuteNonQueryAsync();

                if (affected == 0) return BadRequest("Player not found");

                return Ok(new { ok = true, message = "Player killed" });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft KillPlayer error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Join the world — upserts player record, returns player state + world info.</summary>
        [HttpPost("Join")]
        public async Task<IActionResult> JoinWorld([FromBody] JoinWorldRequest req)
        {
            if (req.UserId <= 0) return BadRequest("Invalid userId");

            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();
                // Validate that the user exists to avoid FK violations on insert
                using (var uCheck = new MySqlCommand("SELECT 1 FROM maxhanna.users WHERE id=@uid", conn))
                {
                    uCheck.Parameters.AddWithValue("@uid", req.UserId);
                    var userExists = await uCheck.ExecuteScalarAsync();
                    if (userExists == null)
                    {
                        return BadRequest("Invalid userId");
                    }
                }

                // Read world info; if the world row does not exist, create it before updating players
                int seed = 42;
                float spawnX = 8, spawnY = 100, spawnZ = 8;
                bool worldFound = false;
                using (var wCmd = new MySqlCommand("SELECT seed, spawn_x, spawn_y, spawn_z FROM maxhanna.digcraft_worlds WHERE id=@wid", conn))
                {
                    wCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    using var wr = await wCmd.ExecuteReaderAsync();
                    if (await wr.ReadAsync())
                    {
                        worldFound = true;
                        seed = wr.IsDBNull(wr.GetOrdinal("seed")) ? 42 : wr.GetInt32("seed");
                        spawnX = wr.IsDBNull(wr.GetOrdinal("spawn_x")) ? 8 : wr.GetFloat("spawn_x");
                        spawnY = wr.IsDBNull(wr.GetOrdinal("spawn_y")) ? 100 : wr.GetFloat("spawn_y");
                        spawnZ = wr.IsDBNull(wr.GetOrdinal("spawn_z")) ? 8 : wr.GetFloat("spawn_z");
                    }
                }
                if (!worldFound)
                {
                    // Create a new world row with a generated seed and default spawn coordinates.
                    seed = new System.Random().Next(1, int.MaxValue);
                    spawnX = 8; spawnY = 100; spawnZ = 8;
                    try
                    {
                        using var insW = new MySqlCommand(@"INSERT INTO maxhanna.digcraft_worlds (id, seed, spawn_x, spawn_y, spawn_z) VALUES (@wid, @seed, @sx, @sy, @sz)", conn);
                        insW.Parameters.AddWithValue("@wid", req.WorldId);
                        insW.Parameters.AddWithValue("@seed", seed);
                        insW.Parameters.AddWithValue("@sx", spawnX);
                        insW.Parameters.AddWithValue("@sy", spawnY);
                        insW.Parameters.AddWithValue("@sz", spawnZ);
                        await insW.ExecuteNonQueryAsync();
                        worldFound = true;
                    }
                    catch (Exception ex)
                    {
                        // If insertion failed (race or permission), try to re-read the world row.
                        _ = _log.Db("JoinWorld: failed to create world row: " + ex.Message, req.UserId, "DIGCRAFT", true);
                        using (var wCmd2 = new MySqlCommand("SELECT seed, spawn_x, spawn_y, spawn_z FROM maxhanna.digcraft_worlds WHERE id=@wid", conn))
                        {
                            wCmd2.Parameters.AddWithValue("@wid", req.WorldId);
                            using var wr2 = await wCmd2.ExecuteReaderAsync();
                            if (await wr2.ReadAsync())
                            {
                                worldFound = true;
                                seed = wr2.IsDBNull(wr2.GetOrdinal("seed")) ? 42 : wr2.GetInt32("seed");
                                spawnX = wr2.IsDBNull(wr2.GetOrdinal("spawn_x")) ? 8 : wr2.GetFloat("spawn_x");
                                spawnY = wr2.IsDBNull(wr2.GetOrdinal("spawn_y")) ? 100 : wr2.GetFloat("spawn_y");
                                spawnZ = wr2.IsDBNull(wr2.GetOrdinal("spawn_z")) ? 8 : wr2.GetFloat("spawn_z");
                            }
                        }
                    }
                }

                // Try to update an existing player row first; if no rows updated, insert new row.
                using (var updCmd = new MySqlCommand(@"
                    UPDATE maxhanna.digcraft_players
                    SET last_seen = UTC_TIMESTAMP(),
                        world_id = @wid
                    WHERE user_id = @uid", conn))
                {
                    updCmd.Parameters.AddWithValue("@uid", req.UserId);
                    updCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    Console.WriteLine($"JoinWorld: Attempting to update player {req.UserId} for world {req.WorldId}");
                    var rows = await updCmd.ExecuteNonQueryAsync();
                    if (rows == 0)
                    {
                        // New player - find a random spawn point on a mountain (not over water)
                        int searchRadius = 256;
                        int maxAttempts = 500;
                        const int minSpawnHeight = 100;
                        const int airDropHeight = 64;
                        var playerRand = new Random();
                        bool spawnFound = false;

                        for (int attempt = 0; attempt < maxAttempts; attempt++)
                        {
                            int testX = (int)spawnX + playerRand.Next(-searchRadius, searchRadius + 1);
                            int testZ = (int)spawnZ + playerRand.Next(-searchRadius, searchRadius + 1);

                            int surfaceY = GetSurfaceY(seed, testX, testZ);

                            if (surfaceY < minSpawnHeight) continue;

                            var col = SampleTerrainColumn(seed, testX, testZ);
                            bool isWaterBiome = col.Biome == BiomeIds.OCEAN || col.Biome == BiomeIds.DEEP_OCEAN ||
                                                col.Biome == BiomeIds.COLD_OCEAN || col.Biome == BiomeIds.FROZEN_OCEAN ||
                                                col.Biome == BiomeIds.LUKWARM_OCEAN || col.Biome == BiomeIds.WARM_OCEAN ||
                                                col.Biome == BiomeIds.RIVER || col.Biome == BiomeIds.FROZEN_RIVER;
                            if (isWaterBiome) continue;

                            if (surfaceY > 1)
                            {
                                int blockAtSurface = GetBaseBlockId(seed, testX, surfaceY, testZ);
                                int blockBelow = GetBaseBlockId(seed, testX, surfaceY - 1, testZ);
                                int blockAbove = GetBaseBlockId(seed, testX, surfaceY + 1, testZ);

                                if (blockAtSurface == BlockIds.GRASS && blockBelow == BlockIds.DIRT && blockAbove == BlockIds.AIR)
                                {
                                    spawnX = testX + 0.5f;
                                    spawnY = surfaceY + airDropHeight;
                                    spawnZ = testZ + 0.5f;
                                    spawnFound = true;
                                    break;
                                }
                            }
                        }

                        // Fallback if no spawn found (should be rare)
                        if (!spawnFound)
                        {
                            spawnY = minSpawnHeight + airDropHeight;
                        }

                        using (var insCmd = new MySqlCommand(@"
                            INSERT INTO maxhanna.digcraft_players
                                (user_id, world_id, pos_x, pos_y, pos_z, health, hunger, last_seen, level, exp, face, left_hand)
                            VALUES (@uid, @wid, @sx, @sy, @sz, 20, 20, UTC_TIMESTAMP(), 1, 0, 'default', 0)", conn))
                        {
                            Console.WriteLine($"JoinWorld: Inserting new player {req.UserId} for world {req.WorldId}");
                            insCmd.Parameters.AddWithValue("@uid", req.UserId);
                            insCmd.Parameters.AddWithValue("@wid", req.WorldId);
                            insCmd.Parameters.AddWithValue("@sx", spawnX);
                            insCmd.Parameters.AddWithValue("@sy", spawnY);
                            insCmd.Parameters.AddWithValue("@sz", spawnZ);
                            await insCmd.ExecuteNonQueryAsync();
                        }
                    }
                }

                // Read player back
                DigCraftPlayer? player = null;
                using (var pCmd = new MySqlCommand(@"
                    SELECT p.*, u.username FROM maxhanna.digcraft_players p
                    JOIN maxhanna.users u ON u.id = p.user_id
                    WHERE p.user_id=@uid AND p.world_id=@wid", conn))
                {
                    pCmd.Parameters.AddWithValue("@uid", req.UserId);
                    pCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    using var r = await pCmd.ExecuteReaderAsync();
                    if (await r.ReadAsync())
                    {
                        player = new DigCraftPlayer
                        {
                            Id = r.GetInt32("id"),
                            UserId = r.GetInt32("user_id"),
                            WorldId = r.GetInt32("world_id"),
                            PosX = r.GetFloat("pos_x"),
                            PosY = r.GetFloat("pos_y"),
                            PosZ = r.GetFloat("pos_z"),
                            Yaw = r.GetFloat("yaw"),
                            Pitch = r.GetFloat("pitch"),
                            Health = r.GetInt32("health"),
                            Hunger = r.GetInt32("hunger"),
                            Color = r.IsDBNull(r.GetOrdinal("color")) ? null : r.GetString("color"),
                            Face = r.IsDBNull(r.GetOrdinal("face")) ? "default" : r.GetString("face"),
                            Username = r.IsDBNull(r.GetOrdinal("username")) ? null : r.GetString("username"),
                            Level = r.IsDBNull(r.GetOrdinal("level")) ? 1 : r.GetInt32("level"),
                            Exp = r.IsDBNull(r.GetOrdinal("exp")) ? 0 : r.GetInt32("exp")
                        };
                    }
                }

                // Read inventory
                var inventory = new List<DigCraftInventorySlot>();
                using (var iCmd = new MySqlCommand(@"
                    SELECT slot, item_id, quantity FROM maxhanna.digcraft_inventory
                    WHERE player_id=@pid", conn))
                {
                    iCmd.Parameters.AddWithValue("@pid", player?.Id ?? 0);
                    using var r = await iCmd.ExecuteReaderAsync();
                    while (await r.ReadAsync())
                    {
                        inventory.Add(new DigCraftInventorySlot
                        {
                            Slot = r.GetInt32("slot"),
                            ItemId = r.GetInt32("item_id"),
                            Quantity = r.GetInt32("quantity")
                        });
                    }
                }

                var equipment = new { helmet = 0, chest = 0, legs = 0, boots = 0, weapon = 0, leftHand = 0 };
                using (var eCmd = new MySqlCommand(@"
                    SELECT helmet, chest, legs, boots, weapon, left_hand FROM maxhanna.digcraft_equipment WHERE player_id=@pid", conn))
                {
                    eCmd.Parameters.AddWithValue("@pid", player?.Id ?? 0);
                    using var r = await eCmd.ExecuteReaderAsync();
                    if (await r.ReadAsync())
                    {
                        equipment = new
                        {
                            helmet = r.IsDBNull(r.GetOrdinal("helmet")) ? 0 : r.GetInt32("helmet"),
                            chest = r.IsDBNull(r.GetOrdinal("chest")) ? 0 : r.GetInt32("chest"),
                            legs = r.IsDBNull(r.GetOrdinal("legs")) ? 0 : r.GetInt32("legs"),
                            boots = r.IsDBNull(r.GetOrdinal("boots")) ? 0 : r.GetInt32("boots"),
                            weapon = r.IsDBNull(r.GetOrdinal("weapon")) ? 0 : r.GetInt32("weapon"),
                            leftHand = r.IsDBNull(r.GetOrdinal("left_hand")) ? 0 : r.GetInt32("left_hand")
                        };
                    }
                }

                return Ok(new
                {
                    player,
                    inventory,
                    equipment,
                    world = new { id = req.WorldId, seed, spawnX, spawnY, spawnZ },
                    mobTickMs = _mobTickMs,
                    mobEpochStartMs = _mobEpochStartMs
                });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft JoinWorld error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Update player position (called periodically by client).</summary>
        [HttpPost("UpdatePosition")]
        public async Task<IActionResult> UpdatePosition([FromBody] UpdatePositionRequest req)
        {
            if (req.UserId <= 0) return BadRequest("Invalid userId");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var cmd = new MySqlCommand(@"
                    UPDATE maxhanna.digcraft_players
                    SET pos_x=@px, pos_y=@py, pos_z=@pz, yaw=@yaw, pitch=@pitch, body_yaw=@bodyYaw, last_seen=UTC_TIMESTAMP()
                    WHERE user_id=@uid AND world_id=@wid", conn);
                cmd.Parameters.AddWithValue("@px", req.PosX);
                cmd.Parameters.AddWithValue("@py", req.PosY);
                cmd.Parameters.AddWithValue("@pz", req.PosZ);
                cmd.Parameters.AddWithValue("@yaw", req.Yaw);
                cmd.Parameters.AddWithValue("@pitch", req.Pitch);
                cmd.Parameters.AddWithValue("@bodyYaw", req.BodyYaw);
                cmd.Parameters.AddWithValue("@uid", req.UserId);
                cmd.Parameters.AddWithValue("@wid", req.WorldId);
                await cmd.ExecuteNonQueryAsync();

                return Ok(new { ok = true });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft UpdatePosition error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Lightweight: update position and return only other players' positions (no equipment, health, etc).</summary>
        [HttpPost("UpdatePositionAndGetOthers")]
        public async Task<IActionResult> UpdatePositionAndGetOthers([FromBody] UpdatePositionRequest req)
        {
            if (req.UserId <= 0) return BadRequest("Invalid userId");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Update caller position and last_seen only (lightweight)
                using var uCmd = new MySqlCommand(@"
                    UPDATE maxhanna.digcraft_players
                    SET pos_x=@px, pos_y=@py, pos_z=@pz, yaw=@yaw, pitch=@pitch, body_yaw=@bodyYaw, last_seen=UTC_TIMESTAMP()
                    WHERE user_id=@uid AND world_id=@wid", conn);
                uCmd.Parameters.AddWithValue("@px", req.PosX);
                uCmd.Parameters.AddWithValue("@py", req.PosY);
                uCmd.Parameters.AddWithValue("@pz", req.PosZ);
                uCmd.Parameters.AddWithValue("@yaw", req.Yaw);
                uCmd.Parameters.AddWithValue("@pitch", req.Pitch);
                uCmd.Parameters.AddWithValue("@bodyYaw", req.BodyYaw);
                uCmd.Parameters.AddWithValue("@uid", req.UserId);
                uCmd.Parameters.AddWithValue("@wid", req.WorldId);
                await uCmd.ExecuteNonQueryAsync();

                // Return only other players' positions (lightweight - no equipment, health, etc)
                var cutoff = DateTime.UtcNow.AddSeconds(-INACTIVITY_TIMEOUT_SECONDS);
                using var cmd = new MySqlCommand(@"
                    SELECT p.user_id, p.pos_x, p.pos_y, p.pos_z, p.yaw, p.pitch, p.body_yaw
                    FROM maxhanna.digcraft_players p
                    WHERE p.world_id=@wid AND p.last_seen >= @cutoff AND p.user_id != @excludeUid", conn);
                cmd.Parameters.AddWithValue("@wid", req.WorldId);
                cmd.Parameters.AddWithValue("@cutoff", cutoff);
                cmd.Parameters.AddWithValue("@excludeUid", req.UserId);

                var others = new List<object>();
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                {
                    others.Add(new
                    {
                        userId = r.GetInt32("user_id"),
                        posX = r.GetFloat("pos_x"),
                        posY = r.GetFloat("pos_y"),
                        posZ = r.GetFloat("pos_z"),
                        yaw = r.GetFloat("yaw"),
                        pitch = r.GetFloat("pitch"),
                        bodyYaw = r.IsDBNull(r.GetOrdinal("body_yaw")) ? r.GetFloat("yaw") : r.GetFloat("body_yaw")
                    });
                }
                return Ok(new { others });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft UpdatePositionAndGetOthers error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Update the caller's position and return online players in one request.</summary>
        [HttpPost("SyncPlayers")]
        public async Task<IActionResult> SyncPlayers([FromBody] UpdatePositionRequest req)
        {
            if (req.UserId <= 0) return BadRequest("Invalid userId");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Update caller position and last_seen, also is_attacking and is_defending flags
                using (var uCmd = new MySqlCommand(@"
                    UPDATE maxhanna.digcraft_players
                    SET pos_x=@px, pos_y=@py, pos_z=@pz, yaw=@yaw, pitch=@pitch, body_yaw=@bodyYaw,
                        is_attacking=@isAttacking,
                        is_defending=@isDefending,
                        last_seen=UTC_TIMESTAMP()
                    WHERE user_id=@uid AND world_id=@wid", conn))
                {
                    uCmd.Parameters.AddWithValue("@px", req.PosX);
                    uCmd.Parameters.AddWithValue("@py", req.PosY);
                    uCmd.Parameters.AddWithValue("@pz", req.PosZ);
                    uCmd.Parameters.AddWithValue("@yaw", req.Yaw);
                    uCmd.Parameters.AddWithValue("@pitch", req.Pitch);
                    uCmd.Parameters.AddWithValue("@bodyYaw", req.BodyYaw);
                    uCmd.Parameters.AddWithValue("@isAttacking", req.IsAttacking);
                    uCmd.Parameters.AddWithValue("@isDefending", req.IsDefending);
                    uCmd.Parameters.AddWithValue("@uid", req.UserId);
                    uCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    await uCmd.ExecuteNonQueryAsync();
                }

                // Handle knockback: if attacker is attacking, push nearby targets
                if (req.IsAttacking)
                {
                    const float knockbackRange = 1.5f;
                    const float knockbackStrength = 0.5f;

                    // Find nearby players to push
                    using var knockCmd = new MySqlCommand(@"
                        UPDATE maxhanna.digcraft_players p
                        JOIN maxhanna.users u ON u.id = p.user_id
                        SET p.pos_x = p.pos_x + @dx, p.pos_z = p.pos_z + @dz
                        WHERE p.world_id = @wid AND p.user_id != @attackerId
                          AND SQRT(POW(p.pos_x - @attackerX, 2) + POW(p.pos_z - @attackerZ, 2)) < @range
                          AND p.last_seen >= @cutoff", conn);
                    knockCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    knockCmd.Parameters.AddWithValue("@attackerId", req.UserId);
                    knockCmd.Parameters.AddWithValue("@attackerX", req.PosX);
                    knockCmd.Parameters.AddWithValue("@attackerZ", req.PosZ);
                    knockCmd.Parameters.AddWithValue("@range", knockbackRange);
                    knockCmd.Parameters.AddWithValue("@dx", (float)Math.Cos(req.Yaw) * knockbackStrength);
                    knockCmd.Parameters.AddWithValue("@dz", (float)Math.Sin(req.Yaw) * knockbackStrength);
                    knockCmd.Parameters.AddWithValue("@cutoff", DateTime.UtcNow.AddSeconds(-5));
                    await knockCmd.ExecuteNonQueryAsync();
                }

                // Return players seen within cutoff
                var cutoff = DateTime.UtcNow.AddSeconds(-INACTIVITY_TIMEOUT_SECONDS);
                using var cmd = new MySqlCommand(@"
                      SELECT p.user_id, p.pos_x, p.pos_y, p.pos_z, p.yaw, p.pitch, p.body_yaw, p.health, p.hunger, p.color, p.level, p.exp, p.face, u.username,
                          IFNULL(e.helmet, 0) AS helmet, IFNULL(e.chest, 0) AS chest, IFNULL(e.legs, 0) AS legs, IFNULL(e.boots, 0) AS boots,
                          IFNULL(e.weapon, 0) AS weapon, p.is_attacking, p.is_defending, IFNULL(e.left_hand, 0) AS left_hand,
                          IFNULL(e.helmet_dye, 0) AS helmet_dye, IFNULL(e.chest_dye, 0) AS chest_dye, IFNULL(e.legs_dye, 0) AS legs_dye, IFNULL(e.boots_dye, 0) AS boots_dye
                      FROM maxhanna.digcraft_players p
                      LEFT JOIN maxhanna.digcraft_equipment e ON e.player_id = p.id
                      JOIN maxhanna.users u ON u.id = p.user_id
                      WHERE p.world_id=@wid AND p.last_seen >= @cutoff", conn);
                cmd.Parameters.AddWithValue("@wid", req.WorldId);
                cmd.Parameters.AddWithValue("@cutoff", cutoff);

                var players = new List<object>();
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                {
                    players.Add(new
                    {
                        userId = r.GetInt32("user_id"),
                        posX = r.GetFloat("pos_x"),
                        posY = r.GetFloat("pos_y"),
                        posZ = r.GetFloat("pos_z"),
                        yaw = r.GetFloat("yaw"),
                        pitch = r.GetFloat("pitch"),
                        bodyYaw = r.IsDBNull(r.GetOrdinal("body_yaw")) ? r.GetFloat("yaw") : r.GetFloat("body_yaw"),
                        health = r.GetInt32("health"),
                        hunger = r.GetInt32("hunger"),
                        maxHealth = 20,
                        color = r.IsDBNull(r.GetOrdinal("color")) ? "#ffffff" : r.GetString("color"),
                        username = r.IsDBNull(r.GetOrdinal("username")) ? "Anon" : r.GetString("username"),
                        level = r.IsDBNull(r.GetOrdinal("level")) ? 1 : r.GetInt32("level"),
                        exp = r.IsDBNull(r.GetOrdinal("exp")) ? 0 : r.GetInt32("exp"),
                        face = r.IsDBNull(r.GetOrdinal("face")) ? "default" : r.GetString("face"),
                        helmet = r.IsDBNull(r.GetOrdinal("helmet")) ? 0 : r.GetInt32("helmet"),
                        chest = r.IsDBNull(r.GetOrdinal("chest")) ? 0 : r.GetInt32("chest"),
                        legs = r.IsDBNull(r.GetOrdinal("legs")) ? 0 : r.GetInt32("legs"),
                        boots = r.IsDBNull(r.GetOrdinal("boots")) ? 0 : r.GetInt32("boots"),
                        helmetDye = r.IsDBNull(r.GetOrdinal("helmet_dye")) ? 0 : r.GetInt32("helmet_dye"),
                        chestDye = r.IsDBNull(r.GetOrdinal("chest_dye")) ? 0 : r.GetInt32("chest_dye"),
                        legsDye = r.IsDBNull(r.GetOrdinal("legs_dye")) ? 0 : r.GetInt32("legs_dye"),
                        bootsDye = r.IsDBNull(r.GetOrdinal("boots_dye")) ? 0 : r.GetInt32("boots_dye"),
                        weapon = r.IsDBNull(r.GetOrdinal("weapon")) ? 0 : r.GetInt32("weapon"),
                        isAttacking = r.IsDBNull(r.GetOrdinal("is_attacking")) ? false : r.GetBoolean("is_attacking"),
                        isDefending = r.IsDBNull(r.GetOrdinal("is_defending")) ? false : r.GetBoolean("is_defending"),
                        leftHand = r.IsDBNull(r.GetOrdinal("left_hand")) ? 0 : r.GetInt32("left_hand")
                    });
                }

                // Update prior durability tracking for next sync (query in a new connection to avoid reader conflict)
                int curWeapon = 0, curHelmet = 0, curChest = 0, curLegs = 0, curBoots = 0;
                await using (var durConn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await durConn.OpenAsync();
                    using var eqDurCmd = new MySqlCommand(@"
                        SELECT e.weapon, e.helmet, e.chest, e.legs, e.boots
                        FROM maxhanna.digcraft_equipment e
                        JOIN maxhanna.digcraft_players p ON p.id = e.player_id
                        WHERE p.user_id=@uid AND p.world_id=@wid", durConn);
                    eqDurCmd.Parameters.AddWithValue("@uid", req.UserId);
                    eqDurCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    using var eqRdr = await eqDurCmd.ExecuteReaderAsync();
                    if (await eqRdr.ReadAsync())
                    {
                        curWeapon = eqRdr.IsDBNull(0) ? 0 : eqRdr.GetInt32(0);
                        curHelmet = eqRdr.IsDBNull(1) ? 0 : eqRdr.GetInt32(1);
                        curChest = eqRdr.IsDBNull(2) ? 0 : eqRdr.GetInt32(2);
                        curLegs = eqRdr.IsDBNull(3) ? 0 : eqRdr.GetInt32(3);
                        curBoots = eqRdr.IsDBNull(4) ? 0 : eqRdr.GetInt32(4);
                    }
                }
                _priorDurabilities[req.UserId] = (curWeapon, curHelmet, curChest, curLegs, curBoots);

                return Ok(new { players });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft SyncPlayers error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Get online players in the world (seen within last 15s).</summary>
        [HttpGet("Players/{worldId}")]
        public async Task<IActionResult> GetPlayers(int worldId)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                var cutoff = DateTime.UtcNow.AddSeconds(-INACTIVITY_TIMEOUT_SECONDS);
                using var cmd = new MySqlCommand(@"
                      SELECT p.user_id, p.pos_x, p.pos_y, p.pos_z, p.yaw, p.pitch, p.body_yaw, p.health, p.color, p.level, p.exp, p.face, u.username,
                          IFNULL(e.helmet, 0) AS helmet, IFNULL(e.chest, 0) AS chest, IFNULL(e.legs, 0) AS legs, IFNULL(e.boots, 0) AS boots,
                          IFNULL(e.weapon, 0) AS weapon, IFNULL(e.left_hand, 0) AS left_hand
                      FROM maxhanna.digcraft_players p
                      LEFT JOIN maxhanna.digcraft_equipment e ON e.player_id = p.id
                      JOIN maxhanna.users u ON u.id = p.user_id
                      WHERE p.world_id=@wid AND p.last_seen >= @cutoff", conn);
                cmd.Parameters.AddWithValue("@wid", worldId);
                cmd.Parameters.AddWithValue("@cutoff", cutoff);

                var players = new List<object>();
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                {
                    players.Add(new
                    {
                        userId = r.GetInt32("user_id"),
                        posX = r.GetFloat("pos_x"),
                        posY = r.GetFloat("pos_y"),
                        posZ = r.GetFloat("pos_z"),
                        yaw = r.GetFloat("yaw"),
                        pitch = r.GetFloat("pitch"),
                        bodyYaw = r.IsDBNull(r.GetOrdinal("body_yaw")) ? r.GetFloat("yaw") : r.GetFloat("body_yaw"),
                        health = r.GetInt32("health"),
                        maxHealth = 20,
                        color = r.IsDBNull(r.GetOrdinal("color")) ? "#ffffff" : r.GetString("color"),
                        username = r.IsDBNull(r.GetOrdinal("username")) ? "Anon" : r.GetString("username"),
                        level = r.IsDBNull(r.GetOrdinal("level")) ? 1 : r.GetInt32("level"),
                        exp = r.IsDBNull(r.GetOrdinal("exp")) ? 0 : r.GetInt32("exp"),
                        helmet = r.IsDBNull(r.GetOrdinal("helmet")) ? 0 : r.GetInt32("helmet"),
                        chest = r.IsDBNull(r.GetOrdinal("chest")) ? 0 : r.GetInt32("chest"),
                        legs = r.IsDBNull(r.GetOrdinal("legs")) ? 0 : r.GetInt32("legs"),
                        boots = r.IsDBNull(r.GetOrdinal("boots")) ? 0 : r.GetInt32("boots"),
                        weapon = r.IsDBNull(r.GetOrdinal("weapon")) ? 0 : r.GetInt32("weapon"),
                        leftHand = r.IsDBNull(r.GetOrdinal("left_hand")) ? 0 : r.GetInt32("left_hand")
                    });
                }
                return Ok(players);
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft GetPlayers error: " + ex.Message, null, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>List all worlds with modified-block counts and active player counts.</summary>
        [HttpGet("Worlds")]
        public async Task<IActionResult> GetWorlds()
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                var cutoff = DateTime.UtcNow.AddSeconds(-INACTIVITY_TIMEOUT_SECONDS);
                using var cmd = new MySqlCommand(@"
                    SELECT w.id, w.seed,
                           IFNULL(b.cnt, 0) AS modifiedBlocks,
                           IFNULL(p.cnt, 0) AS playersOnline
                    FROM maxhanna.digcraft_worlds w
                    LEFT JOIN (
                        SELECT world_id, COUNT(*) AS cnt FROM maxhanna.digcraft_block_changes GROUP BY world_id
                    ) b ON b.world_id = w.id
                    LEFT JOIN (
                        SELECT world_id, COUNT(*) AS cnt FROM maxhanna.digcraft_players WHERE last_seen >= @cutoff GROUP BY world_id
                    ) p ON p.world_id = w.id
                    ORDER BY w.id ASC;
                ", conn);
                cmd.Parameters.AddWithValue("@cutoff", cutoff);

                var worlds = new List<object>();
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                {
                    worlds.Add(new
                    {
                        id = r.GetInt32("id"),
                        seed = r.IsDBNull(r.GetOrdinal("seed")) ? 42 : r.GetInt32("seed"),
                        modifiedBlocks = r.GetInt32("modifiedBlocks"),
                        playersOnline = r.GetInt32("playersOnline")
                    });
                }
                return Ok(worlds);
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft GetWorlds error: " + ex.Message, null, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Attack another player — server-authoritative validation and damage application.</summary>
        [HttpPost("Attack")]
        public async Task<IActionResult> Attack([FromBody] AttackRequest req)
        {
            if (req == null || req.AttackerUserId <= 0 || req.TargetUserId <= 0) return BadRequest("Invalid request");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Load attacker and target positions / ids
                using var cmd = new MySqlCommand(@"
                        SELECT p.id, p.user_id, p.pos_x, p.pos_y, p.pos_z, p.health
                        FROM maxhanna.digcraft_players p
                        WHERE p.world_id=@wid AND p.user_id IN (@att, @tgt)", conn);
                cmd.Parameters.AddWithValue("@wid", req.WorldId);
                cmd.Parameters.AddWithValue("@att", req.AttackerUserId);
                cmd.Parameters.AddWithValue("@tgt", req.TargetUserId);

                int attackerDbId = 0, targetDbId = 0;
                float attX = 0, attY = 0, attZ = 0;
                float tgtX = 0, tgtY = 0, tgtZ = 0;
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                {
                    var uid = r.GetInt32("user_id");
                    if (uid == req.AttackerUserId)
                    {
                        attackerDbId = r.GetInt32("id");
                        attX = r.GetFloat("pos_x"); attY = r.GetFloat("pos_y"); attZ = r.GetFloat("pos_z");
                    }
                    else if (uid == req.TargetUserId)
                    {
                        targetDbId = r.GetInt32("id");
                        tgtX = r.GetFloat("pos_x"); tgtY = r.GetFloat("pos_y"); tgtZ = r.GetFloat("pos_z");
                    }
                }
                r.Close(); // Ensure reader is closed before next command
                if (attackerDbId == 0 || targetDbId == 0) return BadRequest("Player(s) not found");

                // Use client-provided position if available, otherwise use database
                if (req.PosX != 0 || req.PosY != 0 || req.PosZ != 0)
                {
                    attX = req.PosX; attY = req.PosY; attZ = req.PosZ;
                }

                // Range check
                var dx = attX - tgtX; var dy = attY - tgtY; var dz = attZ - tgtZ;
                var distSq = dx * dx + dy * dy + dz * dz;
                var maxRange = req.WeaponId == ItemIds.BOW ? 18f : PLAYER_ATTACK_MAX_RANGE;
                if (distSq > maxRange * maxRange) return BadRequest("Target out of range");

                // Cooldown check (in-memory)
                if (_lastAttackAt.TryGetValue(req.AttackerUserId, out var last) && (DateTime.UtcNow - last).TotalMilliseconds < 450)
                {
                    return BadRequest("Attack too soon");
                }
                _lastAttackAt[req.AttackerUserId] = DateTime.UtcNow;

                // Check if attacker and target are in the same party (no friendly fire)
                using (var partyCheck = new MySqlCommand(@"
                        SELECT 1 FROM maxhanna.digcraft_party_members a
                        JOIN maxhanna.digcraft_party_members b ON a.party_id = b.party_id
                        WHERE a.user_id = @att AND b.user_id = @tgt", conn))
                {
                    partyCheck.Parameters.AddWithValue("@att", req.AttackerUserId);
                    partyCheck.Parameters.AddWithValue("@tgt", req.TargetUserId);
                    var inParty = await partyCheck.ExecuteScalarAsync();
                    if (inParty != null && inParty != DBNull.Value) return BadRequest("Cannot attack party member");
                }

                // Determine weapon (prefer supplied weaponId, otherwise read equipment)
                int weaponId = req.WeaponId;
                if (weaponId <= 0)
                {
                    using var eqCmd = new MySqlCommand("SELECT weapon FROM maxhanna.digcraft_equipment WHERE player_id=@pid", conn);
                    eqCmd.Parameters.AddWithValue("@pid", attackerDbId);
                    var obj = await eqCmd.ExecuteScalarAsync();
                    if (obj != null) weaponId = Convert.ToInt32(obj);
                }

                // Simple damage mapping: any weapon >0 is stronger, bare-hand is weaker
                int damage = weaponId > 0 ? 6 : 2;

                int tgtHelmet = 0, tgtChest = 0, tgtLegs = 0, tgtBoots = 0;
                int tgtHelmetDur = -1, tgtChestDur = -1, tgtLegsDur = -1, tgtBootsDur = -1;
                using (var eCmd = new MySqlCommand(@"
                    SELECT helmet, chest, legs, boots,
                           COALESCE(helmet_dur,-1) AS helmet_dur,
                           COALESCE(chest_dur,-1)  AS chest_dur,
                           COALESCE(legs_dur,-1)   AS legs_dur,
                           COALESCE(boots_dur,-1)  AS boots_dur
                    FROM maxhanna.digcraft_equipment WHERE player_id=@pid", conn))
                {
                    eCmd.Parameters.AddWithValue("@pid", targetDbId);
                    using var er = await eCmd.ExecuteReaderAsync();
                    if (await er.ReadAsync())
                    {
                        tgtHelmet = er.IsDBNull(er.GetOrdinal("helmet")) ? 0 : er.GetInt32("helmet");
                        tgtChest = er.IsDBNull(er.GetOrdinal("chest")) ? 0 : er.GetInt32("chest");
                        tgtLegs = er.IsDBNull(er.GetOrdinal("legs")) ? 0 : er.GetInt32("legs");
                        tgtBoots = er.IsDBNull(er.GetOrdinal("boots")) ? 0 : er.GetInt32("boots");
                        tgtHelmetDur = er.IsDBNull(er.GetOrdinal("helmet_dur")) ? -1 : er.GetInt32("helmet_dur");
                        tgtChestDur = er.IsDBNull(er.GetOrdinal("chest_dur")) ? -1 : er.GetInt32("chest_dur");
                        tgtLegsDur = er.IsDBNull(er.GetOrdinal("legs_dur")) ? -1 : er.GetInt32("legs_dur");
                        tgtBootsDur = er.IsDBNull(er.GetOrdinal("boots_dur")) ? -1 : er.GetInt32("boots_dur");
                    }
                }
                if (tgtHelmet > 0 && tgtHelmetDur < 0) tgtHelmetDur = ItemMaxDurability(tgtHelmet);
                if (tgtChest > 0 && tgtChestDur < 0) tgtChestDur = ItemMaxDurability(tgtChest);
                if (tgtLegs > 0 && tgtLegsDur < 0) tgtLegsDur = ItemMaxDurability(tgtLegs);
                if (tgtBoots > 0 && tgtBootsDur < 0) tgtBootsDur = ItemMaxDurability(tgtBoots);

                var armorPts = ArmorPointsForItem(tgtHelmet) + ArmorPointsForItem(tgtChest)
                              + ArmorPointsForItem(tgtLegs) + ArmorPointsForItem(tgtBoots);
                var reduction = Math.Min(0.8f, armorPts * 0.04f);
                int finalDamage = (int)Math.Max(1, Math.Floor(damage * (1.0f - reduction)));

                // Reduce armor durability on hit
                if (armorPts > 0)
                {
                    if (tgtHelmet > 0) tgtHelmetDur--;
                    if (tgtChest > 0) tgtChestDur--;
                    if (tgtLegs > 0) tgtLegsDur--;
                    if (tgtBoots > 0) tgtBootsDur--;
                    if (tgtHelmet > 0 && tgtHelmetDur <= 0) { tgtHelmet = 0; tgtHelmetDur = 0; }
                    if (tgtChest > 0 && tgtChestDur <= 0) { tgtChest = 0; tgtChestDur = 0; }
                    if (tgtLegs > 0 && tgtLegsDur <= 0) { tgtLegs = 0; tgtLegsDur = 0; }
                    if (tgtBoots > 0 && tgtBootsDur <= 0) { tgtBoots = 0; tgtBootsDur = 0; }
                    using var durCmd = new MySqlCommand(@"
                        INSERT INTO maxhanna.digcraft_equipment
                            (player_id, helmet, chest, legs, boots, helmet_dur, chest_dur, legs_dur, boots_dur)
                        VALUES (@pid, @h, @c, @l, @b, @hd, @cd, @ld, @bd)
                        ON DUPLICATE KEY UPDATE
                            helmet=VALUES(helmet), chest=VALUES(chest),
                            legs=VALUES(legs),     boots=VALUES(boots),
                            helmet_dur=VALUES(helmet_dur), chest_dur=VALUES(chest_dur),
                            legs_dur=VALUES(legs_dur),     boots_dur=VALUES(boots_dur)", conn);
                    durCmd.Parameters.AddWithValue("@pid", targetDbId);
                    durCmd.Parameters.AddWithValue("@h", tgtHelmet);
                    durCmd.Parameters.AddWithValue("@c", tgtChest);
                    durCmd.Parameters.AddWithValue("@l", tgtLegs);
                    durCmd.Parameters.AddWithValue("@b", tgtBoots);
                    durCmd.Parameters.AddWithValue("@hd", tgtHelmetDur);
                    durCmd.Parameters.AddWithValue("@cd", tgtChestDur);
                    durCmd.Parameters.AddWithValue("@ld", tgtLegsDur);
                    durCmd.Parameters.AddWithValue("@bd", tgtBootsDur);
                    await durCmd.ExecuteNonQueryAsync();
                }

                // Apply damage
                using var updCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET health = GREATEST(0, health - @damage) WHERE id=@pid", conn);
                updCmd.Parameters.AddWithValue("@damage", finalDamage);
                updCmd.Parameters.AddWithValue("@pid", targetDbId);
                await updCmd.ExecuteNonQueryAsync();

                // Grant EXP to attacker if target is killed (health <= 0)
                using var hCmd = new MySqlCommand("SELECT health FROM maxhanna.digcraft_players WHERE id=@pid", conn);
                hCmd.Parameters.AddWithValue("@pid", targetDbId);
                var hObj = await hCmd.ExecuteScalarAsync();
                int newHealth = hObj != null ? Convert.ToInt32(hObj) : 0;

                if (newHealth <= 0)
                {
                    // Reset victim's exp/level on death
                    using var resetExpCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET level = 1, exp = 0 WHERE id=@pid", conn);
                    resetExpCmd.Parameters.AddWithValue("@pid", targetDbId);
                    await resetExpCmd.ExecuteNonQueryAsync();

                    // Grant EXP to attacker
                    await GrantExpToPlayerAsync(req.AttackerUserId, req.WorldId, 25);
                }

                return Ok(new { ok = true, damage = finalDamage, targetUserId = req.TargetUserId, health = newHealth });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft Attack error: " + ex.Message, req.AttackerUserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Apply fall damage for a landed player (server-side validation & health update).</summary>
        [HttpPost("FallDamage")]
        public async Task<IActionResult> FallDamage([FromBody] FallRequest req)
        {
            if (req == null || req.UserId <= 0) return BadRequest("Invalid request");
            try
            {
                // Make fall damage less severe: small increase to safe distance
                // and reduce the multiplier so drops cause less damage overall.
                const float safeDistance = 3.5f; // up to this distance is safe (was 3.0)
                if (req.FallDistance <= safeDistance) return Ok(new { ok = true, damage = 0 });

                // Reduce multiplier from 2.0 -> 1.0 to halve damage taken from falls
                var damage = (int)Math.Floor((req.FallDistance - safeDistance) * 1.0f);
                if (damage <= 0) return Ok(new { ok = true, damage = 0 });

                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // No fall damage when landing in water (validate feet block against generated + stored world)
                int worldSeed = 42;
                using (var wCmd = new MySqlCommand("SELECT seed FROM maxhanna.digcraft_worlds WHERE id=@wid", conn))
                {
                    wCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    var seedObj = wCmd.ExecuteScalar();
                    if (seedObj != null && seedObj != DBNull.Value) worldSeed = Convert.ToInt32(seedObj);
                }
                var footY = (int)Math.Floor(req.PosY - 1.62f);
                var bx = (int)Math.Floor(req.PosX);
                var bz = (int)Math.Floor(req.PosZ);
                if (footY >= 0 && footY < WORLD_HEIGHT && GetBlockAt(conn, req.WorldId, bx, footY, bz, worldSeed) == BlockIds.WATER)
                    return Ok(new { ok = true, damage = 0 });

                // Read equipped armor for this player (if any) so we can reduce fall damage.
                int helmet = 0, chest = 0, legs = 0, boots = 0;
                using (var eCmd = new MySqlCommand(@"
                        SELECT e.helmet, e.chest, e.legs, e.boots
                        FROM maxhanna.digcraft_equipment e
                        JOIN maxhanna.digcraft_players p ON e.player_id = p.id
                        WHERE p.user_id=@uid AND p.world_id=@wid", conn))
                {
                    eCmd.Parameters.AddWithValue("@uid", req.UserId);
                    eCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    using var er = await eCmd.ExecuteReaderAsync();
                    if (await er.ReadAsync())
                    {
                        helmet = er.IsDBNull(er.GetOrdinal("helmet")) ? 0 : er.GetInt32("helmet");
                        chest = er.IsDBNull(er.GetOrdinal("chest")) ? 0 : er.GetInt32("chest");
                        legs = er.IsDBNull(er.GetOrdinal("legs")) ? 0 : er.GetInt32("legs");
                        boots = er.IsDBNull(er.GetOrdinal("boots")) ? 0 : er.GetInt32("boots");
                    }
                }

                var armorPoints = ArmorPointsForItem(helmet) + ArmorPointsForItem(chest) + ArmorPointsForItem(legs) + ArmorPointsForItem(boots);

                // Convert armor points into a damage reduction fraction (4% per point, capped at 80%).
                var reduction = Math.Min(0.8f, armorPoints * 0.04f);
                var reducedDamage = (int)Math.Floor(damage * (1.0f - reduction));
                if (reducedDamage < 0) reducedDamage = 0;

                using var updCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET health = GREATEST(0, health - @damage) WHERE user_id=@uid AND world_id=@wid", conn);
                updCmd.Parameters.AddWithValue("@damage", reducedDamage);
                updCmd.Parameters.AddWithValue("@uid", req.UserId);
                updCmd.Parameters.AddWithValue("@wid", req.WorldId);
                await updCmd.ExecuteNonQueryAsync();

                using var hCmd = new MySqlCommand("SELECT health FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn);
                hCmd.Parameters.AddWithValue("@uid", req.UserId);
                hCmd.Parameters.AddWithValue("@wid", req.WorldId);
                var hObj = await hCmd.ExecuteScalarAsync();
                int newHealth = hObj != null ? Convert.ToInt32(hObj) : 0;

                if (newHealth <= 0)
                {
                    using var resetExpCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET level = 1, exp = 0 WHERE user_id=@uid AND world_id=@wid", conn);
                    resetExpCmd.Parameters.AddWithValue("@uid", req.UserId);
                    resetExpCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    await resetExpCmd.ExecuteNonQueryAsync();
                }

                return Ok(new { ok = true, damage = reducedDamage, health = newHealth });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft FallDamage error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Apply damage from a world mob (zombie, pig, etc.) to a player.</summary>
        [HttpPost("MobAttack")]
        public async Task<IActionResult> MobAttack([FromBody] DataContracts.DigCraft.MobAttackRequest req)
        {
            if (req == null || req.UserId <= 0) return BadRequest("Invalid request");
            try
            {
                // Validate that the mob actually exists on the server and is in range
                EnsureWorldMobsInitialized(req.WorldId);
                if (!_worldMobs.TryGetValue(req.WorldId, out var mobs)) return BadRequest("World not found");

                // Get player's current position from database first
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                float playerX = 0, playerY = 0, playerZ = 0;
                bool isDefending = false;
                int leftHand = 0;
                using (var pCmd = new MySqlCommand(@"
                    SELECT pos_x, pos_y, pos_z, is_defending, left_hand 
                    FROM maxhanna.digcraft_players as dp 
                    LEFT JOIN maxhanna.digcraft_equipment e ON e.player_id = dp.id
                    WHERE user_id=@uid AND world_id=@wid", conn))
                {
                    pCmd.Parameters.AddWithValue("@uid", req.UserId);
                    pCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    using var pr = await pCmd.ExecuteReaderAsync();
                    if (!await pr.ReadAsync()) return BadRequest("Player not found");
                    playerX = pr.GetFloat("pos_x");
                    playerY = pr.GetFloat("pos_y");
                    playerZ = pr.GetFloat("pos_z");
                    isDefending = pr.IsDBNull(pr.GetOrdinal("is_defending")) ? false : pr.GetBoolean("is_defending");
                    leftHand = pr.IsDBNull(pr.GetOrdinal("left_hand")) ? 0 : pr.GetInt32("left_hand");
                }

                // Find mob by type that's close to player (within 3 blocks)
                ServerMob? mob = null;
                const float maxAttackRange = 3.0f;
                foreach (var m in mobs.Values)
                {
                    if (!m.Type.Equals(req.MobType, StringComparison.OrdinalIgnoreCase)) continue;
                    if (m.DiedAtMs > 0) continue; // Skip dead mobs

                    var dx = m.PosX - playerX;
                    var dy = m.PosY - playerY;
                    var dz = m.PosZ - playerZ;
                    var distSq = dx * dx + dy * dy + dz * dz;

                    if (distSq <= maxAttackRange * maxAttackRange)
                    {
                        mob = m;
                        break;
                    }
                }
                if (mob == null) return BadRequest("No mob of that type is close enough to attack you");

                bool blocked = isDefending && leftHand == ItemIds.SHIELD; // SHIELD
                if (blocked)
                {
                    Console.WriteLine($"MobAttack: Player {req.UserId} blocked attack with shield!");
                    return Ok(new { ok = true, damage = 0, mobId = mob.Id, health = -1, dead = false, blocked = true });
                }

                // Read equipped armor for this player (if any) so we can reduce mob damage.
                int helmet = 0, chest = 0, legs = 0, boots = 0;
                using (var eCmd = new MySqlCommand(@"
                                SELECT e.helmet, e.chest, e.legs, e.boots
                                FROM maxhanna.digcraft_equipment e
                                JOIN maxhanna.digcraft_players p ON e.player_id = p.id
                                WHERE p.user_id=@uid AND p.world_id=@wid", conn))
                {
                    eCmd.Parameters.AddWithValue("@uid", req.UserId);
                    eCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    using var er = await eCmd.ExecuteReaderAsync();
                    if (await er.ReadAsync())
                    {
                        helmet = er.IsDBNull(er.GetOrdinal("helmet")) ? 0 : er.GetInt32("helmet");
                        chest = er.IsDBNull(er.GetOrdinal("chest")) ? 0 : er.GetInt32("chest");
                        legs = er.IsDBNull(er.GetOrdinal("legs")) ? 0 : er.GetInt32("legs");
                        boots = er.IsDBNull(er.GetOrdinal("boots")) ? 0 : er.GetInt32("boots");
                    }
                }

                var armorPoints = ArmorPointsForItem(helmet) + ArmorPointsForItem(chest) + ArmorPointsForItem(legs) + ArmorPointsForItem(boots);

                // Convert armor points into a damage reduction fraction (4% per point, capped at 80%).
                var reduction = Math.Min(0.8f, armorPoints * 0.04f);
                var reducedDamage = (int)Math.Floor(req.Damage * (1.0f - reduction));
                if (reducedDamage < 0) reducedDamage = 0;

                using var updCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET health = GREATEST(0, health - @damage) WHERE user_id=@uid AND world_id=@wid", conn);
                updCmd.Parameters.AddWithValue("@damage", reducedDamage);
                updCmd.Parameters.AddWithValue("@uid", req.UserId);
                updCmd.Parameters.AddWithValue("@wid", req.WorldId);
                await updCmd.ExecuteNonQueryAsync();

                using var hCmd = new MySqlCommand("SELECT health FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn);
                hCmd.Parameters.AddWithValue("@uid", req.UserId);
                hCmd.Parameters.AddWithValue("@wid", req.WorldId);
                var hObj = await hCmd.ExecuteScalarAsync();
                int newHealth = hObj != null ? Convert.ToInt32(hObj) : 0;

                if (newHealth <= 0)
                {
                    using var resetExpCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET level = 1, exp = 0 WHERE user_id=@uid AND world_id=@wid", conn);
                    resetExpCmd.Parameters.AddWithValue("@uid", req.UserId);
                    resetExpCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    await resetExpCmd.ExecuteNonQueryAsync();
                }

                return Ok(new { ok = true, damage = reducedDamage, health = newHealth });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft MobAttack error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Player attacks a server-controlled mob.</summary>
        [HttpPost("AttackMob")]
        public async Task<IActionResult> AttackMob([FromBody] DataContracts.DigCraft.AttackMobRequest req)
        {
            if (req == null || req.AttackerUserId <= 0 || req.MobId <= 0) return BadRequest("Invalid request");
            try
            {
                EnsureWorldMobsInitialized(req.WorldId);
                if (!_worldMobs.TryGetValue(req.WorldId, out var mobs)) return BadRequest("World not found");
                if (!mobs.TryGetValue(req.MobId, out var mob)) return BadRequest("Mob not found");

                // Range check: prefer client-supplied attacker position when available
                float attX = 0, attY = 0, attZ = 0;
                DateTime dbLastSeen = DateTime.MinValue;
                await using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();
                    using var pCmd = new MySqlCommand("SELECT pos_x, pos_y, pos_z, last_seen FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn);
                    pCmd.Parameters.AddWithValue("@uid", req.AttackerUserId);
                    pCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    using var r = await pCmd.ExecuteReaderAsync();
                    if (await r.ReadAsync())
                    {
                        attX = r.GetFloat("pos_x"); attY = r.GetFloat("pos_y"); attZ = r.GetFloat("pos_z");
                        try { dbLastSeen = r.IsDBNull(r.GetOrdinal("last_seen")) ? DateTime.MinValue : r.GetDateTime("last_seen"); } catch { dbLastSeen = DateTime.MinValue; }
                    }
                    else return BadRequest("Attacker not found");
                }

                // If the client explicitly provided_ATTACKER_POS, use it directly
                if (req is DataContracts.DigCraft.AttackMobRequest amr && amr.AttackerPosProvided)
                {
                    attX = amr.AttackerPosX;
                    attY = amr.AttackerPosY;
                    attZ = amr.AttackerPosZ;
                }

                var dx = attX - mob.PosX; var dy = attY - mob.PosY; var dz = attZ - mob.PosZ;
                // Use XZ distance + separate Y tolerance to avoid false "out of range" from
                // server/client Y drift (mob eye-height vs player eye-height on different terrain).
                var distXZSq = dx * dx + dz * dz;
                var maxRange = req.WeaponId == ItemIds.BOW ? 18f : PLAYER_ATTACK_MAX_RANGE;
                //var yTolerance = 4.0f; // generous vertical tolerance
                // if (distXZSq > maxRange * maxRange || Math.Abs(dy) > yTolerance)
                //     return BadRequest("Mob out of range");

                // Cooldown simple check (per-attacker)
                if (_lastAttackAt.TryGetValue(req.AttackerUserId, out var last) && (DateTime.UtcNow - last).TotalMilliseconds < 450)
                {
                    return BadRequest("Attack too soon");
                }
                _lastAttackAt[req.AttackerUserId] = DateTime.UtcNow;

                // Determine weapon damage
                int damage = req.WeaponId > 0 ? 6 : 2;

                // Apply damage with lock
                int newHealth;
                lock (mob)
                {
                    mob.Health = Math.Max(0, mob.Health - damage);
                    newHealth = mob.Health;
                }

                var dead = newHealth <= 0;
                var drops = new List<object>();
                if (dead)
                {
                    // Mark as dead with timestamp instead of removing immediately
                    mob.DiedAtMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    // Move off-world so it doesn't affect gameplay
                    mob.PosX = -10000;
                    mob.PosY = -10000;
                    mob.PosZ = -10000;

                    foreach (var drop in GetMobFoodDrops(mob.Type))
                    {
                        await AddItemToPlayerInventoryAsync(req.AttackerUserId, req.WorldId, drop.itemId, drop.quantity);
                        drops.Add(new { itemId = drop.itemId, quantity = drop.quantity });
                    }

                    // Add non-food drops (bones, etc)
                    foreach (var drop in GetMobDrops(mob.Type))
                    {
                        await AddItemToPlayerInventoryAsync(req.AttackerUserId, req.WorldId, drop.itemId, drop.quantity);
                        drops.Add(new { itemId = drop.itemId, quantity = drop.quantity });
                    }

                    // Grant EXP for killing mob
                    await GrantExpToPlayerAsync(req.AttackerUserId, req.WorldId, GetMobExpReward(mob.Type));
                }

                return Ok(new { ok = true, damage, mobId = mob.Id, health = newHealth, dead, drops });
            }
            catch (Exception ex)
            {
                _ = _log.Db("AttackMob error: " + ex.Message, req.AttackerUserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        private int GetMobExpReward(string mobType)
        {
            return mobType switch
            {
                "Zombie" => 10,
                "Skeleton" => 12,
                "WitherSkeleton" => 20,
                "Blaze" => 15,
                "Ghast" => 18,
                "Hoglin" => 14,
                "Strider" => 8,
                "Pig" => 5,
                "Cow" => 6,
                "Sheep" => 6,
                "Camel" => 8,
                "Goat" => 7,
                "Armadillo" => 6,
                "Llama" => 7,
                "Parrot" => 5,
                "Ocelot" => 6,
                "PolarBear" => 10,
                "Fox" => 6,
                "Wolf" => 7,
                "Deer" => 6,
                "Frog" => 4,
                "Axolotl" => 6,
                "Turtle" => 8,
                "Dolphin" => 7,
                "Horse" => 8,
                "Rabbit" => 3,
                "Chicken" => 4,
                "Slime" => 7,
                "Spider" => 9,
                "Bear" => 15,
                _ => 5
            };
        }

        private static IReadOnlyList<(int itemId, int quantity)> GetMobFoodDrops(string mobType)
        {
            return mobType switch
            {
                "Pig" => new[] { (ItemIds.PORK, 2) },
                "Cow" => new[] { (ItemIds.BEEF, 2) },
                "Sheep" => new[] { (ItemIds.MUTTON, 2) },
                "Rabbit" => new[] { (ItemIds.RABBIT_MEAT, 1) },
                _ => Array.Empty<(int itemId, int quantity)>()
            };
        }

        private static IReadOnlyList<(int itemId, int quantity)> GetMobDrops(string mobType)
        {
            return mobType switch
            {
                "Skeleton" => new[] { (ItemIds.BONE, 2) },
                "Zombie" => new[] { (ItemIds.BONE, 1) },
                _ => Array.Empty<(int itemId, int quantity)>()
            };
        }

        private async Task AddItemToPlayerInventoryAsync(int userId, int worldId, int itemId, int quantity)
        {
            if (itemId <= 0 || quantity <= 0) return;

            await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            await conn.OpenAsync();

            int playerId = 0;
            using (var playerCmd = new MySqlCommand("SELECT id FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn))
            {
                playerCmd.Parameters.AddWithValue("@uid", userId);
                playerCmd.Parameters.AddWithValue("@wid", worldId);
                var result = await playerCmd.ExecuteScalarAsync();
                if (result != null) playerId = Convert.ToInt32(result);
            }
            if (playerId <= 0) return;

            while (quantity > 0)
            {
                int? stackSlot = null;
                int stackQuantity = 0;
                using (var stackCmd = new MySqlCommand(@"
                    SELECT slot, quantity
                    FROM maxhanna.digcraft_inventory
                    WHERE player_id=@pid AND item_id=@iid AND quantity < 64
                    ORDER BY slot
                    LIMIT 1", conn))
                {
                    stackCmd.Parameters.AddWithValue("@pid", playerId);
                    stackCmd.Parameters.AddWithValue("@iid", itemId);
                    using var reader = await stackCmd.ExecuteReaderAsync();
                    if (await reader.ReadAsync())
                    {
                        stackSlot = reader.GetInt32("slot");
                        stackQuantity = reader.GetInt32("quantity");
                    }
                }

                if (stackSlot.HasValue)
                {
                    var canAdd = Math.Min(quantity, 64 - stackQuantity);
                    using var updateCmd = new MySqlCommand(@"
                        UPDATE maxhanna.digcraft_inventory
                        SET quantity = quantity + @qty
                        WHERE player_id=@pid AND slot=@slot", conn);
                    updateCmd.Parameters.AddWithValue("@qty", canAdd);
                    updateCmd.Parameters.AddWithValue("@pid", playerId);
                    updateCmd.Parameters.AddWithValue("@slot", stackSlot.Value);
                    await updateCmd.ExecuteNonQueryAsync();
                    quantity -= canAdd;
                    continue;
                }

                var usedSlots = new HashSet<int>();
                using (var usedCmd = new MySqlCommand("SELECT slot FROM maxhanna.digcraft_inventory WHERE player_id=@pid", conn))
                {
                    usedCmd.Parameters.AddWithValue("@pid", playerId);
                    using var reader = await usedCmd.ExecuteReaderAsync();
                    while (await reader.ReadAsync())
                    {
                        usedSlots.Add(reader.GetInt32("slot"));
                    }
                }

                int emptySlot = -1;
                for (int slot = 0; slot < 36; slot++)
                {
                    if (!usedSlots.Contains(slot))
                    {
                        emptySlot = slot;
                        break;
                    }
                }
                if (emptySlot < 0) return;

                var stackSize = Math.Min(quantity, 64);
                using var insertCmd = new MySqlCommand(@"
                    INSERT INTO maxhanna.digcraft_inventory (player_id, slot, item_id, quantity)
                    VALUES (@pid, @slot, @iid, @qty)", conn);
                insertCmd.Parameters.AddWithValue("@pid", playerId);
                insertCmd.Parameters.AddWithValue("@slot", emptySlot);
                insertCmd.Parameters.AddWithValue("@iid", itemId);
                insertCmd.Parameters.AddWithValue("@qty", stackSize);
                await insertCmd.ExecuteNonQueryAsync();
                quantity -= stackSize;
            }
        }

        private async Task GrantExpToPlayerAsync(int userId, int worldId, int expAmount, MySqlTransaction? tx = null)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var expCmd = new MySqlCommand(@"
                    UPDATE maxhanna.digcraft_players 
                    SET exp = COALESCE(exp, 0) + @exp 
                    WHERE user_id=@uid AND world_id=@wid", conn, tx);
                expCmd.Parameters.AddWithValue("@exp", expAmount);
                expCmd.Parameters.AddWithValue("@uid", userId);
                expCmd.Parameters.AddWithValue("@wid", worldId);
                var rowsAffected = await expCmd.ExecuteNonQueryAsync();

                // Verify the update worked
                using var selCmd = new MySqlCommand("SELECT level, exp FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn, tx);
                selCmd.Parameters.AddWithValue("@uid", userId);
                selCmd.Parameters.AddWithValue("@wid", worldId);
                using var rdr = await selCmd.ExecuteReaderAsync();
                if (await rdr.ReadAsync())
                {
                    var lvl = rdr.GetInt32("level");
                    var xp = rdr.GetInt32("exp");
                }

                await CheckLevelUpAsync(userId, worldId, tx);
            }
            catch (Exception ex)
            {
                _ = _log.Db("GrantExpToPlayerAsync error: " + ex.Message, userId, "DIGCRAFT", true);
            }
        }

        private async Task CheckLevelUpAsync(int userId, int worldId, MySqlTransaction? tx = null)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var selCmd = new MySqlCommand("SELECT level, exp FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn, tx);
                selCmd.Parameters.AddWithValue("@uid", userId);
                selCmd.Parameters.AddWithValue("@wid", worldId);
                var reader = await selCmd.ExecuteReaderAsync();
                if (!await reader.ReadAsync()) return;
                int level = reader.GetInt32("level");
                int exp = reader.GetInt32("exp");
                await reader.CloseAsync();

                int expToLevel = GetExpForLevel(level + 1);
                while (exp >= expToLevel)
                {
                    exp -= expToLevel;
                    level++;
                    expToLevel = GetExpForLevel(level + 1);
                    _ = _log.Db($"Player {userId} leveled up to {level}!", userId, "DIGCRAFT", true);
                }

                using var updCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET level = @level, exp = @exp WHERE user_id=@uid AND world_id=@wid", conn, tx);
                updCmd.Parameters.AddWithValue("@level", level);
                updCmd.Parameters.AddWithValue("@exp", exp);
                updCmd.Parameters.AddWithValue("@uid", userId);
                updCmd.Parameters.AddWithValue("@wid", worldId);
                await updCmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _ = _log.Db("CheckLevelUpAsync error: " + ex.Message, userId, "DIGCRAFT", true);
            }
        }

        private int GetExpForLevel(int level)
        {
            return level * 100;
        }

        /// <summary>Get server-authoritative mobs for a world.</summary>
        [HttpGet("Mobs/{worldId}")]
        public async Task<IActionResult> GetMobs(int worldId)
        {
            try
            {
                EnsureWorldMobsInitialized(worldId);
                if (!_worldMobs.TryGetValue(worldId, out var mobs)) return Ok(new { mobs = new List<object>(), mobTickMs = _mobTickMs, mobEpochStartMs = _mobEpochStartMs });
                var list = mobs.Values.Where(m => m.DiedAtMs == 0 && m.Health > 0).Select(m => new MobState { Id = m.Id, Type = m.Type, PosX = m.PosX, PosY = m.PosY, PosZ = m.PosZ, Yaw = m.Yaw, Health = m.Health, MaxHealth = m.MaxHealth, Hostile = m.Hostile }).ToList();
                return Ok(new { mobs = list, mobTickMs = _mobTickMs, mobEpochStartMs = _mobEpochStartMs });
            }
            catch (Exception ex)
            {
                _ = _log.Db("GetMobs error: " + ex.Message, null, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Get block changes for a chunk (delta from procedural generation).</summary>
        [HttpPost("GetChunkChanges")]
        public async Task<IActionResult> GetChunkChanges([FromBody] GetChunkRequest req)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var cmd = new MySqlCommand(@"
                    SELECT local_x, local_y, local_z, block_id, water_level, COALESCE(fluid_is_source, 0) AS fluid_is_source
                    FROM maxhanna.digcraft_block_changes
                    WHERE world_id=@wid AND chunk_x=@cx AND chunk_z=@cz", conn);
                cmd.Parameters.AddWithValue("@wid", req.WorldId);
                cmd.Parameters.AddWithValue("@cx", req.ChunkX);
                cmd.Parameters.AddWithValue("@cz", req.ChunkZ);

                var changes = new List<DigCraftBlockChange>();
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                {
                    changes.Add(new DigCraftBlockChange
                    {
                        ChunkX = req.ChunkX,
                        ChunkZ = req.ChunkZ,
                        LocalX = r.GetInt32("local_x"),
                        LocalY = r.GetInt32("local_y"),
                        LocalZ = r.GetInt32("local_z"),
                        BlockId = r.GetInt32("block_id"),
                        WaterLevel = r.GetInt32("water_level"),
                        FluidIsSource = r.GetInt32("fluid_is_source") > 0
                    });
                }
                return Ok(changes);
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft GetChunkChanges error: " + ex.Message, null, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }


        /// <summary>Place or break many blocks in a single request (batch).</summary>
        [HttpPost("PlaceBlocks")]
        public async Task<IActionResult> PlaceBlocks([FromBody] DataContracts.DigCraft.PlaceBlockBatchRequest req)
        {
            if (req == null || req.UserId <= 0) return BadRequest("Invalid request");
            if (req.Items == null || req.Items.Count == 0) return BadRequest("No items");

            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                var hasShrub = req.Items.Any(it => it.BlockId == BlockIds.SHRUB);
                // fetch world seed for base lookup when determining decay markers
                int worldSeed = 42;
                using (var seedCmd = new MySqlCommand("SELECT seed FROM maxhanna.digcraft_worlds WHERE id = @wid", conn))
                {
                    seedCmd.CommandTimeout = 30;
                    seedCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    var seedResult = await seedCmd.ExecuteScalarAsync();
                    worldSeed = (seedResult == null || seedResult == DBNull.Value) ? 42 : Convert.ToInt32(seedResult);
                }

                string sql;
                if (hasShrub)
                {
                    sql = @"
                        INSERT INTO maxhanna.digcraft_block_changes
                            (world_id, chunk_x, chunk_z, local_x, local_y, local_z, block_id, changed_by, changed_at, planted_at, water_level, fluid_is_source)
                        VALUES (@wid, @cx, @cz, @lx, @ly, @lz, CASE WHEN @decay = 1 THEN @prevBid ELSE @bid END, @uid, UTC_TIMESTAMP(), 
                            CASE WHEN @bid = @shrubId OR @decay = 1 THEN UTC_TIMESTAMP() ELSE NULL END, @waterLevel, @fluidIsSource)
                        ON DUPLICATE KEY UPDATE block_id=CASE WHEN @decay = 1 THEN @prevBid ELSE VALUES(block_id) END, changed_by=VALUES(changed_by), changed_at=UTC_TIMESTAMP(), 
                            planted_at=CASE WHEN VALUES(block_id) = @shrubId OR @decay = 1 THEN UTC_TIMESTAMP() ELSE planted_at END, water_level=VALUES(water_level), fluid_is_source=VALUES(fluid_is_source);";
                }
                else
                {
                    sql = @"
                        INSERT INTO maxhanna.digcraft_block_changes
                            (world_id, chunk_x, chunk_z, local_x, local_y, local_z, block_id, changed_by, changed_at, planted_at, water_level, fluid_is_source)
                        VALUES (@wid, @cx, @cz, @lx, @ly, @lz, CASE WHEN @decay = 1 THEN @prevBid ELSE @bid END, @uid, UTC_TIMESTAMP(), CASE WHEN @decay = 1 THEN UTC_TIMESTAMP() ELSE NULL END, @waterLevel, @fluidIsSource)
                        ON DUPLICATE KEY UPDATE block_id=CASE WHEN @decay = 1 THEN @prevBid ELSE VALUES(block_id) END, changed_by=VALUES(changed_by), changed_at=UTC_TIMESTAMP(), planted_at=CASE WHEN @decay = 1 THEN UTC_TIMESTAMP() ELSE planted_at END, water_level=VALUES(water_level), fluid_is_source=VALUES(fluid_is_source);";
                }

                var randItem = req.Items[0];
                int randItemLocalY = randItem.LocalY;
                bool sortDescend = false;
                int randChunkX = randItem.ChunkX;
                int randChunkZ = randItem.ChunkZ;
                int randLocalX = randItem.LocalX;
                int randLocalY = randItem.LocalY;
                int randLocalZ = randItem.LocalZ;
                int prevRandBlockId = await GetExactBlockAtAsync(conn, req.WorldId, randChunkX, randChunkZ, randLocalX, randLocalY, randLocalZ, worldSeed);
                if (prevRandBlockId == BlockIds.NETHER_STALACTITE)
                {
                    sortDescend = true;
                }
                //  Console.WriteLine("PlaceBlocks: executing batch with " + req.Items.Count + " items, sortDescend=" + sortDescend + ", sample item: " + $"worldId={req.WorldId}, chunkX={randItem.ChunkX}, chunkZ={randItem.ChunkZ}, localX={randItem.LocalX}, localY={randItem.LocalY}, localZ={randItem.LocalZ}, blockId={randItem.BlockId}, prevBlockId={prevRandBlockId}");
                int totalRows = 0;
                if (sortDescend)
                {
                    req.Items = req.Items.OrderByDescending(it => it.LocalY).ToList();
                }
                else
                {
                    req.Items = req.Items.OrderBy(it => it.LocalY).ToList();
                }

                foreach (var it in req.Items)
                {
                    //  Console.WriteLine("Checking regeneration for block change: " + $"worldId={req.WorldId}, chunkX={it.ChunkX}, chunkZ={it.ChunkZ}, localX={it.LocalX}, localY={it.LocalY}, localZ={it.LocalZ}, blockId={it.BlockId}");
                    using var cmd = new MySqlCommand(sql, conn);
                    cmd.CommandTimeout = 60;
                    // Prepare parameters
                    cmd.Parameters.AddWithValue("@wid", req.WorldId);
                    cmd.Parameters.Add("@cx", MySqlDbType.Int32);
                    cmd.Parameters.Add("@cz", MySqlDbType.Int32);
                    cmd.Parameters.Add("@lx", MySqlDbType.Int32);
                    cmd.Parameters.Add("@ly", MySqlDbType.Int32);
                    cmd.Parameters.Add("@lz", MySqlDbType.Int32);
                    cmd.Parameters.Add("@bid", MySqlDbType.Int32);
                    cmd.Parameters.Add("@prevBid", MySqlDbType.Int32);
                    cmd.Parameters.Add("@waterLevel", MySqlDbType.Int32);
                    cmd.Parameters.Add("@fluidIsSource", MySqlDbType.Int32);
                    cmd.Parameters.AddWithValue("@uid", req.UserId);
                    cmd.Parameters.AddWithValue("@shrubId", BlockIds.SHRUB);
                    cmd.Parameters.Add("@decay", MySqlDbType.Int32);
                    // compute decay marker: if player is removing a regenerating block (dripstone/tree)
                    int decay = 0;
                    int writeLocalY = it.LocalY;
                    int prevBlockId = 0;
                    int chunkX = it.ChunkX;
                    int chunkZ = it.ChunkZ;
                    int localX = it.LocalX;
                    int localY = it.LocalY;
                    int localZ = it.LocalZ;

                    if (it.BlockId == BlockIds.AIR)
                    {
                        prevBlockId = it.PreviousBlockId ?? 0;

                        bool isRegen = REGENERATIVE_BLOCKS.Contains(prevBlockId);

                        if (isRegen)
                        {
                            if (prevBlockId == BlockIds.NETHER_STALACTITE) //if any were destroyed who's top is not also a stalactite, then we don't regen
                            {
                                if (req.Items.Any(item =>
                                    item.ChunkX == it.ChunkX &&
                                    item.ChunkZ == it.ChunkZ &&
                                    item.LocalX == it.LocalX &&
                                    item.LocalZ == it.LocalZ &&
                                    (item.AboveBlockId ?? 0) != prevBlockId)
                                )
                                {
                                    isRegen = false;
                                    decay = 0;
                                }
                                else
                                {
                                    decay = 1;
                                    writeLocalY = localY;
                                }
                            }
                            else if (LEAF_BLOCKIDS.Contains(prevBlockId))
                            {
                                // Leaves only regenerate if touching wood on left or right
                                int[] affectedBlockIds = LEAF_BLOCKIDS.ToArray();
                                affectedBlockIds.Append(BlockIds.WOOD);
                                bool hasWoodLeft = affectedBlockIds.Contains(it.LeftBlockId ?? 0);
                                bool hasWoodRight = affectedBlockIds.Contains(it.RightBlockId ?? 0);
                                if (hasWoodLeft || hasWoodRight)
                                {
                                    decay = 1;
                                    writeLocalY = localY;
                                }
                                else
                                {
                                    isRegen = false;
                                }
                            } 
                            else
                            { //Only regen if base block is not also being removed in this batch (e.g. for trees, if the base log is also being removed, then the rest won't regen)
                                if (req.Items.Any(item =>
                                     item.ChunkX == it.ChunkX &&
                                     item.ChunkZ == it.ChunkZ &&
                                     item.LocalX == it.LocalX &&
                                     item.LocalZ == it.LocalZ &&
                                     item.PreviousBlockId == prevBlockId &&
                                     (item.BelowBlockId ?? 0) != prevBlockId)
                                 )
                                {
                                    isRegen = false;
                                }
                                else
                                {
                                    decay = 1;
                                    writeLocalY = localY;
                                }
                            }
                        }
                        //  Console.WriteLine($"[ARE WE REGENERATING?] PlaceBlocks: prevBlockId={prevBlockId}, isRegenCandidate={decay == 1 && isRegen}, comparedTo={comparedTo}"); 
                    }

                    // Then set the parameters:
                    cmd.Parameters["@cx"].Value = it.ChunkX;
                    cmd.Parameters["@cz"].Value = it.ChunkZ;
                    cmd.Parameters["@lx"].Value = it.LocalX;
                    cmd.Parameters["@ly"].Value = writeLocalY;   // = it.LocalY (no anchor remapping)
                    cmd.Parameters["@lz"].Value = it.LocalZ;
                    cmd.Parameters["@bid"].Value = it.BlockId;
                    cmd.Parameters["@prevBid"].Value = prevBlockId;           // original block id (e.g. STALACTITE)
                    cmd.Parameters["@decay"].Value = decay;
                    cmd.Parameters["@waterLevel"].Value =
                        it.WaterLevel ?? ((it.BlockId == BlockIds.WATER || it.BlockId == BlockIds.LAVA) ? 8 : 0);
                    cmd.Parameters["@fluidIsSource"].Value =
                        it.FluidIsSource.HasValue
                            ? (it.FluidIsSource.Value ? 1 : 0)
                            : 0; // Default to non-source; client sends true only if adjacent to existing source

                    try
                    {
                        //   Console.WriteLine("Executing query...");
                        await cmd.ExecuteNonQueryAsync();
                        totalRows++;
                    }
                    catch (Exception ex)
                    {
                        _ = _log.Db($"PlaceBlocks: ExecuteNonQuery exception for user={req.UserId}: {ex.Message}", req.UserId, "DIGCRAFT", true);
                    }

                }
                //   Console.WriteLine($"PlaceBlockBatch: total rows affected={totalRows} for userId={req.UserId}. Granting EXP...");
                await GrantExpToPlayerAsync(req.UserId, req.WorldId, totalRows);

                // Return authoritative equipment for this player so client can compare pre/post durabilities
                var equipment = new { helmet = 0, chest = 0, legs = 0, boots = 0, weapon = 0, helmetDur = -1, chestDur = -1, legsDur = -1, bootsDur = -1, weaponDur = -1, leftHand = 0, leftHandDur = -1 };
                try
                {
                    using (var eqCmd = new MySqlCommand(@"
                    SELECT IFNULL(e.helmet,0) AS helmet, IFNULL(e.chest,0) AS chest, IFNULL(e.legs,0) AS legs, IFNULL(e.boots,0) AS boots,
                           IFNULL(e.weapon,0) AS weapon, COALESCE(e.helmet_dur,-1) AS helmet_dur, COALESCE(e.chest_dur,-1) AS chest_dur, COALESCE(e.legs_dur,-1) AS legs_dur, COALESCE(e.boots_dur,-1) AS boots_dur, IFNULL(e.left_hand,0) AS left_hand
                    FROM maxhanna.digcraft_equipment e
                    JOIN maxhanna.digcraft_players p ON p.id = e.player_id
                    WHERE p.user_id=@uid AND p.world_id=@wid", conn))
                    {
                        eqCmd.Parameters.AddWithValue("@uid", req.UserId);
                        eqCmd.Parameters.AddWithValue("@wid", req.WorldId);
                        using var er = await eqCmd.ExecuteReaderAsync();
                        if (await er.ReadAsync())
                        {
                            equipment = new
                            {
                                helmet = er.IsDBNull(er.GetOrdinal("helmet")) ? 0 : er.GetInt32("helmet"),
                                chest = er.IsDBNull(er.GetOrdinal("chest")) ? 0 : er.GetInt32("chest"),
                                legs = er.IsDBNull(er.GetOrdinal("legs")) ? 0 : er.GetInt32("legs"),
                                boots = er.IsDBNull(er.GetOrdinal("boots")) ? 0 : er.GetInt32("boots"),
                                weapon = er.IsDBNull(er.GetOrdinal("weapon")) ? 0 : er.GetInt32("weapon"),
                                helmetDur = er.IsDBNull(er.GetOrdinal("helmet_dur")) ? -1 : er.GetInt32("helmet_dur"),
                                chestDur = er.IsDBNull(er.GetOrdinal("chest_dur")) ? -1 : er.GetInt32("chest_dur"),
                                legsDur = er.IsDBNull(er.GetOrdinal("legs_dur")) ? -1 : er.GetInt32("legs_dur"),
                                bootsDur = er.IsDBNull(er.GetOrdinal("boots_dur")) ? -1 : er.GetInt32("boots_dur"),
                                weaponDur = -1,
                                leftHand = er.IsDBNull(er.GetOrdinal("left_hand")) ? 0 : er.GetInt32("left_hand"),
                                leftHandDur = -1
                            };
                        }
                    }
                }
                catch (Exception ex)
                {
                    _ = _log.Db($"PlaceBlocks: equipment query failed for user={req.UserId}: {ex.Message}", req.UserId, "DIGCRAFT", true);
                    _ = _log.Db(ex.ToString(), req.UserId, "DIGCRAFT", true);
                    throw;
                }

                return Ok(new { ok = true, count = req.Items.Count, equipment });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft PlaceBlocks error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Post a chat message to the world.</summary>
        [HttpPost("Chat")]
        public async Task<IActionResult> PostChat([FromBody] DataContracts.DigCraft.ChatRequest req)
        {
            if (req.UserId <= 0 || string.IsNullOrWhiteSpace(req.Message)) return BadRequest("Invalid chat request");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(@"
                    INSERT INTO maxhanna.digcraft_chat_messages (world_id, user_id, message, created_at)
                    VALUES (@wid, @uid, @msg, UTC_TIMESTAMP());", conn);
                cmd.Parameters.AddWithValue("@wid", req.WorldId);
                cmd.Parameters.AddWithValue("@uid", req.UserId);
                cmd.Parameters.AddWithValue("@msg", req.Message);
                await cmd.ExecuteNonQueryAsync();

                return Ok(new { ok = true });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft PostChat error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Get recent chat messages for the world.</summary>
        [HttpGet("Chats/{worldId}")]
        public async Task<IActionResult> GetChats(int worldId)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                var cutoff = DateTime.UtcNow.AddSeconds(-30);
                using var cmd = new MySqlCommand(@"
                    SELECT c.user_id, c.message, c.created_at, u.username
                    FROM maxhanna.digcraft_chat_messages c
                    JOIN maxhanna.users u ON u.id = c.user_id
                    WHERE c.world_id=@wid AND c.created_at >= @cutoff
                    ORDER BY c.created_at ASC", conn);
                cmd.Parameters.AddWithValue("@wid", worldId);
                cmd.Parameters.AddWithValue("@cutoff", cutoff);

                var messages = new List<object>();
                using var r = await cmd.ExecuteReaderAsync();
                while (await r.ReadAsync())
                {
                    messages.Add(new
                    {
                        userId = r.GetInt32("user_id"),
                        message = r.GetString("message"),
                        createdAt = r.GetDateTime("created_at"),
                        username = r.IsDBNull(r.GetOrdinal("username")) ? "Anon" : r.GetString("username")
                    });
                }
                return Ok(messages);
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft GetChats error: " + ex.Message, null, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Save inventory.</summary>
        [HttpPost("SaveInventory")]
        public async Task<IActionResult> SaveInventory([FromBody] SaveInventoryRequest req)
        {
            if (req.UserId <= 0) return BadRequest("Invalid userId");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Get player id
                int playerId = 0;
                using (var pCmd = new MySqlCommand(
                    "SELECT id FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn))
                {
                    pCmd.Parameters.AddWithValue("@uid", req.UserId);
                    pCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    var obj = await pCmd.ExecuteScalarAsync();
                    if (obj != null) playerId = Convert.ToInt32(obj);
                }
                if (playerId <= 0) return BadRequest("Player not found");

                if (req.Hunger.HasValue)
                {
                    using var hungerCmd = new MySqlCommand(
                        "UPDATE maxhanna.digcraft_players SET hunger=@hunger WHERE id=@pid", conn);
                    hungerCmd.Parameters.AddWithValue("@hunger", Math.Clamp(req.Hunger.Value, 0, 20));
                    hungerCmd.Parameters.AddWithValue("@pid", playerId);
                    await hungerCmd.ExecuteNonQueryAsync();
                }

                // Clear existing then insert
                using var tx = await conn.BeginTransactionAsync();
                using (var delCmd = new MySqlCommand(
                    "DELETE FROM maxhanna.digcraft_inventory WHERE player_id=@pid", conn, tx))
                {
                    delCmd.Parameters.AddWithValue("@pid", playerId);
                    await delCmd.ExecuteNonQueryAsync();
                }
                foreach (var slot in req.Slots)
                {
                    if (slot.ItemId <= 0 || slot.Quantity <= 0) continue;
                    using var iCmd = new MySqlCommand(@"
                        INSERT INTO maxhanna.digcraft_inventory (player_id, slot, item_id, quantity)
                        VALUES (@pid, @slot, @iid, @qty)", conn, tx);
                    iCmd.Parameters.AddWithValue("@pid", playerId);
                    iCmd.Parameters.AddWithValue("@slot", slot.Slot);
                    iCmd.Parameters.AddWithValue("@iid", slot.ItemId);
                    iCmd.Parameters.AddWithValue("@qty", slot.Quantity);
                    await iCmd.ExecuteNonQueryAsync();
                }
                await tx.CommitAsync();

                // Persist equipment if provided
                if (req.Equipment != null)
                {
                    const string upsertEq = @"
                        INSERT INTO maxhanna.digcraft_equipment (player_id, helmet, chest, legs, boots, weapon, left_hand)
                        VALUES (@pid, @helmet, @chest, @legs, @boots, @weapon, @leftHand)
                        ON DUPLICATE KEY UPDATE helmet=VALUES(helmet), chest=VALUES(chest), legs=VALUES(legs), boots=VALUES(boots), weapon=VALUES(weapon), left_hand=VALUES(left_hand);";
                    using var eqCmd = new MySqlCommand(upsertEq, conn);
                    eqCmd.Parameters.AddWithValue("@pid", playerId);
                    eqCmd.Parameters.AddWithValue("@helmet", req.Equipment.Helmet);
                    eqCmd.Parameters.AddWithValue("@chest", req.Equipment.Chest);
                    eqCmd.Parameters.AddWithValue("@legs", req.Equipment.Legs);
                    eqCmd.Parameters.AddWithValue("@boots", req.Equipment.Boots);
                    eqCmd.Parameters.AddWithValue("@weapon", req.Equipment.Weapon);
                    eqCmd.Parameters.AddWithValue("@leftHand", req.Equipment.LeftHand);
                    await eqCmd.ExecuteNonQueryAsync();
                }

                return Ok(new { ok = true });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft SaveInventory error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Change the player's color (saves to player record).</summary>
        [HttpPost("ChangeColor")]
        public async Task<IActionResult> ChangeColor([FromBody] ChangeColorRequest req)
        {
            if (req == null || req.UserId <= 0) return BadRequest("Invalid request");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                int playerId = 0;
                using (var pCmd = new MySqlCommand("SELECT id FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn))
                {
                    pCmd.Parameters.AddWithValue("@uid", req.UserId);
                    pCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    var obj = await pCmd.ExecuteScalarAsync();
                    if (obj != null) playerId = Convert.ToInt32(obj);
                }
                if (playerId <= 0) return BadRequest("Player not found");

                using (var updCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET color = @color WHERE id = @pid", conn))
                {
                    updCmd.Parameters.AddWithValue("@color", req.Color ?? "#ffffff");
                    updCmd.Parameters.AddWithValue("@pid", playerId);
                    await updCmd.ExecuteNonQueryAsync();
                }

                return Ok(new { ok = true, color = req.Color });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft ChangeColor error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Change the player's face (saves to player record).</summary>
        [HttpPost("ChangeFace")]
        public async Task<IActionResult> ChangeFace([FromBody] ChangeFaceRequest req)
        {
            if (req == null || req.UserId <= 0) return BadRequest("Invalid request");
            var allowedFaces = new[] { "default", "smile", "wink", "sad", "angry", "cool", "surprised", "sick", "tongue", "monocle", "glasses", "bandana", "robot", "alien", "cat", "dog", "skull", "pirate", "moustache", "hero", "villain", "bunny", "ghost", "zombie", "vampire", "ninja", "dragon", "demon", "angel", "spark", "love", "confuse", "meh", "shy", "winkTongue", "coolSunglasses", "cyber", "clown", "mask", "samurai", "wizard", "pirateEye", "vampireTeeth", "werewolf", "alien2", "robot2", "creeper", "slime", "ghost2", "pumpkin", "snowman", "heartEyes", "crying", "sleeping", "dizzy", "rich", "brain", "alien3", "fire", "flower", "leaf", "star" };
            string faceToSave = req.Face;
            // If the face is numeric, treat it as a user-created face ID
            if (int.TryParse(req.Face, out int userFaceId))
            {
                try
                {
                    await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                    await conn.OpenAsync();
                    using (var cmd = new MySqlCommand("SELECT name FROM maxhanna.digcraft_user_faces WHERE id = @id", conn))
                    {
                        cmd.Parameters.AddWithValue("@id", userFaceId);
                        var name = await cmd.ExecuteScalarAsync();
                        if (name == null) faceToSave = "default"; // User face not found
                    }
                }
                catch
                {
                    faceToSave = "default";
                }
            }
            else if (!allowedFaces.Contains(req.Face))
            {
                faceToSave = "default";
            }
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                int playerId = 0;
                using (var pCmd = new MySqlCommand("SELECT id FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn))
                {
                    pCmd.Parameters.AddWithValue("@uid", req.UserId);
                    pCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    var obj = await pCmd.ExecuteScalarAsync();
                    if (obj != null) playerId = Convert.ToInt32(obj);
                }
                if (playerId <= 0) return BadRequest("Player not found");

                using (var updCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET face = @face WHERE id = @pid", conn))
                {
                    updCmd.Parameters.AddWithValue("@face", faceToSave);
                    updCmd.Parameters.AddWithValue("@pid", playerId);
                    await updCmd.ExecuteNonQueryAsync();
                }

                return Ok(new { ok = true, face = faceToSave });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft ChangeFace error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Get all public user-created faces.</summary>
        [HttpGet("UserFaces", Name = "GetUserFaces")]
        public async Task<IActionResult> GetUserFaces(int userId = 0)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                var faces = new List<object>();
                // Get public faces OR the user's own faces (so they can see their own faces to select them)
                // Also try to get userId from JWT if not provided as parameter
                if (userId == 0)
                {
                    return BadRequest("Invalid user ID");
                }

                using (var cmd = new MySqlCommand("SELECT id, name, emoji, grid_data, palette_data, creator_user_id, is_public FROM maxhanna.digcraft_user_faces WHERE is_public = TRUE OR creator_user_id = @requesterId", conn))
                {
                    cmd.Parameters.AddWithValue("@requesterId", userId);
                    using var r = await cmd.ExecuteReaderAsync();
                    while (await r.ReadAsync())
                    {
                        faces.Add(new
                        {
                            id = r.GetInt32("id"),
                            name = r.GetString("name"),
                            emoji = r.GetString("emoji"),
                            gridData = r.GetString("grid_data"),
                            paletteData = r.GetString("palette_data"),
                            creatorUserId = r.GetInt32("creator_user_id"),
                            isPublic = r.GetBoolean("is_public")
                        });
                    }
                }
                return Ok(faces);
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft GetUserFaces error: " + ex.Message, 0, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Get all public user-created faces.</summary>
        [HttpGet("LastWorldId", Name = "GetLastWorldId")]
        public async Task<IActionResult> GetLastWorldId(int userId = 0)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                var faces = new List<object>();
                // Get public faces OR the user's own faces (so they can see their own faces to select them)
                // Also try to get userId from JWT if not provided as parameter
                if (userId == 0)
                {
                    return BadRequest("Invalid user ID");
                }
                int id = 1;

                using (var cmd = new MySqlCommand("SELECT world_id FROM maxhanna.digcraft_players WHERE user_id = @userId", conn))
                {
                    cmd.Parameters.AddWithValue("@userId", userId);
                    using var r = await cmd.ExecuteReaderAsync();
                    while (await r.ReadAsync())
                    {

                        id = r.GetInt32("world_id");
                    }
                }
                return Ok(new { id = id });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft GetLastWorldId error: " + ex.Message, 0, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Save a new user-created face.</summary>
        [HttpPost("UserFaces")]
        public async Task<IActionResult> SaveUserFace([FromBody] SaveUserFaceRequest req)
        {
            if (req == null || req.UserId <= 0 || string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Emoji) || string.IsNullOrWhiteSpace(req.GridData) || string.IsNullOrWhiteSpace(req.PaletteData))
                return BadRequest("Invalid request");
            // Validate name: alphanumeric and spaces only, max 30 chars
            var cleanName = new string(req.Name.Where(c => char.IsLetterOrDigit(c) || c == ' ').Take(30).ToArray());
            if (string.IsNullOrWhiteSpace(cleanName)) return BadRequest("Invalid name");
            // Validate emoji: max 10 chars, strip special chars
            var cleanEmoji = new string(req.Emoji.Where(c => !char.IsControl(c)).Take(10).ToArray());
            // Validate grid data: exactly 64 chars
            if (req.GridData.Length != 64) return BadRequest("Invalid grid data");
            // Validate palette: basic JSON check
            if (req.PaletteData.Length > 255) return BadRequest("Palette too large");

            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Check if user already has a face with this emoji - update instead of insert
                using (var dupCmd = new MySqlCommand("SELECT id FROM maxhanna.digcraft_user_faces WHERE emoji = @emoji AND creator_user_id = @uid", conn))
                {
                    dupCmd.Parameters.AddWithValue("@emoji", cleanEmoji);
                    dupCmd.Parameters.AddWithValue("@uid", req.UserId);
                    var existingId = await dupCmd.ExecuteScalarAsync();
                    if (existingId != null)
                    {
                        // Update existing face
                        using (var updCmd = new MySqlCommand(@"
                            UPDATE maxhanna.digcraft_user_faces 
                            SET name = @name, grid_data = @grid, palette_data = @palette
                            WHERE id = @id", conn))
                        {
                            updCmd.Parameters.AddWithValue("@id", existingId);
                            updCmd.Parameters.AddWithValue("@name", cleanName);
                            updCmd.Parameters.AddWithValue("@grid", req.GridData);
                            updCmd.Parameters.AddWithValue("@palette", req.PaletteData);
                            await updCmd.ExecuteNonQueryAsync();
                        }
                        return Ok(new { ok = true, id = Convert.ToInt32(existingId) });
                    }
                }

                // Check for duplicate emoji from other users
                using (var dupCmd = new MySqlCommand("SELECT COUNT(*) FROM maxhanna.digcraft_user_faces WHERE emoji = @emoji", conn))
                {
                    dupCmd.Parameters.AddWithValue("@emoji", cleanEmoji);
                    var count = Convert.ToInt32(await dupCmd.ExecuteScalarAsync());
                    if (count > 0) return BadRequest("This emoji is already used by another face");
                }

                int newId = 0;
                using (var insCmd = new MySqlCommand(@"
                    INSERT INTO maxhanna.digcraft_user_faces (name, emoji, grid_data, palette_data, creator_user_id)
                    VALUES (@name, @emoji, @grid, @palette, @uid);
                    SELECT LAST_INSERT_ID();", conn))
                {
                    insCmd.Parameters.AddWithValue("@name", cleanName);
                    insCmd.Parameters.AddWithValue("@emoji", cleanEmoji);
                    insCmd.Parameters.AddWithValue("@grid", req.GridData);
                    insCmd.Parameters.AddWithValue("@palette", req.PaletteData);
                    insCmd.Parameters.AddWithValue("@uid", req.UserId);
                    var result = await insCmd.ExecuteScalarAsync();
                    if (result != null) newId = Convert.ToInt32(result);
                }
                return Ok(new { ok = true, id = newId });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft SaveUserFace error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Delete a user-created face.</summary>
        [HttpPost("DeleteUserFace")]
        public async Task<IActionResult> DeleteUserFace([FromBody] DeleteUserFaceRequest req)
        {
            if (req == null || req.UserId <= 0 || req.FaceId <= 0) return BadRequest("Invalid request");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Only delete if the user owns this face
                using var delCmd = new MySqlCommand("DELETE FROM maxhanna.digcraft_user_faces WHERE id = @id AND creator_user_id = @uid", conn);
                delCmd.Parameters.AddWithValue("@id", req.FaceId);
                delCmd.Parameters.AddWithValue("@uid", req.UserId);
                var rows = await delCmd.ExecuteNonQueryAsync();
                return Ok(new { success = rows > 0 });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft DeleteUserFace error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Get the player's discovered recipe IDs.</summary>
        [HttpGet("KnownRecipes", Name = "GetKnownRecipes")]
        public async Task<IActionResult> GetKnownRecipes(int userId = 0)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var cmd = new MySqlCommand("SELECT recipe_id FROM maxhanna.digcraft_known_recipes WHERE user_id = @uid", conn);
                cmd.Parameters.AddWithValue("@uid", userId);
                using var reader = await cmd.ExecuteReaderAsync();
                var recipeIds = new List<int>();
                while (await reader.ReadAsync())
                {
                    recipeIds.Add(reader.GetInt32(0));
                }
                return Ok(new { recipeIds });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft GetKnownRecipes error: " + ex.Message, userId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Add a discovered recipe ID for the player.</summary>
        [HttpPost("KnownRecipes")]
        public async Task<IActionResult> AddKnownRecipe([FromBody] AddKnownRecipeRequest req)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Upsert the known recipe (ignore duplicates)
                using var cmd = new MySqlCommand(@"
                    INSERT IGNORE INTO maxhanna.digcraft_known_recipes (user_id, recipe_id) VALUES (@uid, @rid)", conn);
                cmd.Parameters.AddWithValue("@uid", req.UserId);
                cmd.Parameters.AddWithValue("@rid", req.RecipeId);
                await cmd.ExecuteNonQueryAsync();
                return Ok(new { ok = true });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft AddKnownRecipe error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Set the seed for a world.</summary>
        [HttpPost("SetSeed")]
        public async Task<IActionResult> SetSeed([FromBody] DataContracts.DigCraft.SetSeedRequest req)
        {
            if (req == null || req.WorldId <= 0) return BadRequest("Invalid request");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var cmd = new MySqlCommand("UPDATE maxhanna.digcraft_worlds SET seed = @seed WHERE id = @wid", conn);
                cmd.Parameters.AddWithValue("@seed", req.Seed);
                cmd.Parameters.AddWithValue("@wid", req.WorldId);
                await cmd.ExecuteNonQueryAsync();

                return Ok(new { ok = true, seed = req.Seed });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft SetSeed error: " + ex.Message, null, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }


        [HttpPost("ActivePlayers")]
        public async Task<IActionResult> GetDigcraftActivePlayers([FromBody] int? minutes, CancellationToken ct = default)
        {
            // Clamp the window
            var windowMinutes = Math.Clamp(minutes ?? 2, 0, 60 * 24);

            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync(ct).ConfigureAwait(false);

                const string sql = @"
                    SELECT COUNT(*) AS activeCount
                    FROM maxhanna.digcraft_players h
                    WHERE h.last_seen >= @cutoff;";

                // Compute cutoff in UTC
                var cutoffUtc = DateTime.UtcNow.AddMinutes(-windowMinutes);

                await using var cmd = new MySqlCommand(sql, conn)
                {
                    CommandTimeout = 5
                };
                cmd.Parameters.Add("@cutoff", MySqlDbType.Timestamp).Value = cutoffUtc;

                var obj = await cmd.ExecuteScalarAsync(ct).ConfigureAwait(false);
                var activeCount = (obj == null || obj == DBNull.Value) ? 0 : Convert.ToInt32(obj);

                return Ok(new { count = activeCount });
            }
            catch (Exception ex)
            {
                await _log.Db("DigCraft_GetActivePlayers Exception: " + ex.Message, null, "DIGCRAFT", true);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>Get party members for a user</summary>
        [HttpPost("PartyMembers")]
        public async Task<IActionResult> GetPartyMembers([FromBody] DataContracts.DigCraft.GetPartyMembersRequest req)
        {
            int userId = req.UserId;
            if (userId <= 0) return BadRequest("Invalid userId");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Find party_id for this user, whether they are the leader or a member
                int partyId = 0;
                using (var pCmd = new MySqlCommand(@"
                    SELECT p.id
                    FROM maxhanna.digcraft_parties p
                    LEFT JOIN maxhanna.digcraft_party_members pm ON pm.party_id = p.id
                    WHERE p.leader_user_id = @uid OR pm.user_id = @uid
                    LIMIT 1", conn))
                {
                    pCmd.Parameters.AddWithValue("@uid", userId);
                    var result = await pCmd.ExecuteScalarAsync();
                    if (result == null || result == DBNull.Value) return Ok(new List<object>());
                    partyId = Convert.ToInt32(result);
                }
                if (partyId == 0) return Ok(new List<object>());

                // Get leader + all members in one roster so the client can show the full party
                var members = new List<object>();
                using (var mCmd = new MySqlCommand(@"
                    SELECT roster.user_id, roster.username, roster.is_leader
                    FROM (
                        SELECT u.id AS user_id, u.username, 1 AS is_leader
                        FROM maxhanna.digcraft_parties p
                        JOIN maxhanna.users u ON u.id = p.leader_user_id
                        WHERE p.id = @pid
                        UNION
                        SELECT u.id AS user_id, u.username, 0 AS is_leader
                        FROM maxhanna.digcraft_party_members pm
                        JOIN maxhanna.users u ON u.id = pm.user_id
                        WHERE pm.party_id = @pid
                    ) roster
                    ORDER BY roster.is_leader DESC, roster.username ASC", conn))
                {
                    mCmd.Parameters.AddWithValue("@pid", partyId);
                    using var r = await mCmd.ExecuteReaderAsync();
                    while (await r.ReadAsync())
                    {
                        members.Add(new
                        {
                            userId = r.GetInt32("user_id"),
                            username = r.GetString("username"),
                            isLeader = r.GetInt32("is_leader") == 1
                        });
                    }
                }
                return Ok(members);
            }
            catch (Exception ex)
            {
                _ = _log.Db("GetPartyMembers error: " + ex.Message, userId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Add user to leader's party</summary>
        [HttpPost("AddToParty")]
        public async Task<IActionResult> AddToParty([FromBody] DataContracts.DigCraft.PartyRequest req)
        {
            if (req == null || req.LeaderUserId <= 0 || req.TargetUserId <= 0) return BadRequest("Invalid request");
            if (req.LeaderUserId == req.TargetUserId) return BadRequest("Cannot add self");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Get leader's party (if any)
                int leaderPartyId = 0;
                using (var pCmd = new MySqlCommand("SELECT id FROM maxhanna.digcraft_parties WHERE leader_user_id = @leader", conn))
                {
                    pCmd.Parameters.AddWithValue("@leader", req.LeaderUserId);
                    var result = await pCmd.ExecuteScalarAsync();
                    if (result != null && result != DBNull.Value) leaderPartyId = Convert.ToInt32(result);
                }

                // Get target's party (if any)
                using var targetPartyCmd = new MySqlCommand("SELECT party_id FROM maxhanna.digcraft_party_members WHERE user_id = @target", conn);
                targetPartyCmd.Parameters.AddWithValue("@target", req.TargetUserId);
                var targetPartyIdObj = await targetPartyCmd.ExecuteScalarAsync();
                int targetPartyId = (targetPartyIdObj != null && targetPartyIdObj != DBNull.Value) ? Convert.ToInt32(targetPartyIdObj) : 0;

                // Determine which party to keep (the one with more members)
                int keepPartyId, mergePartyId;

                if (leaderPartyId == 0 && targetPartyId == 0)
                {
                    // Neither in a party - create new party for leader
                    using var insCmd = new MySqlCommand("INSERT INTO maxhanna.digcraft_parties (leader_user_id) VALUES (@leader)", conn);
                    insCmd.Parameters.AddWithValue("@leader", req.LeaderUserId);
                    await insCmd.ExecuteNonQueryAsync();
                    keepPartyId = (int)insCmd.LastInsertedId;
                    mergePartyId = 0;
                }
                else if (leaderPartyId > 0 && targetPartyId == 0)
                {
                    // Leader has party, target doesn't - target joins leader's party
                    keepPartyId = leaderPartyId;
                    mergePartyId = 0;
                }
                else if (leaderPartyId == 0 && targetPartyId > 0)
                {
                    // Target has party, leader doesn't - leader joins target's party
                    keepPartyId = targetPartyId;
                    mergePartyId = 0;
                }
                else
                {
                    // Both in parties - merge them, keep the larger one
                    using var countCmd = new MySqlCommand("SELECT COUNT(*) FROM maxhanna.digcraft_party_members WHERE party_id = @pid", conn);
                    countCmd.Parameters.AddWithValue("@pid", leaderPartyId);
                    var leaderCount = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
                    countCmd.Parameters.Clear();
                    countCmd.Parameters.AddWithValue("@pid", targetPartyId);
                    var targetCount = Convert.ToInt32(await countCmd.ExecuteScalarAsync());

                    if (leaderCount >= targetCount)
                    {
                        keepPartyId = leaderPartyId;
                        mergePartyId = targetPartyId;
                    }
                    else
                    {
                        keepPartyId = targetPartyId;
                        mergePartyId = leaderPartyId;
                    }
                }

                // If merging, move all members from the old party to the new party
                if (mergePartyId > 0)
                {
                    using var mergeCmd = new MySqlCommand(@"
                        UPDATE maxhanna.digcraft_party_members 
                        SET party_id = @newPid 
                        WHERE party_id = @oldPid", conn);
                    mergeCmd.Parameters.AddWithValue("@newPid", keepPartyId);
                    mergeCmd.Parameters.AddWithValue("@oldPid", mergePartyId);
                    await mergeCmd.ExecuteNonQueryAsync();

                    // Delete the old party
                    using var delOldPartyCmd = new MySqlCommand("DELETE FROM maxhanna.digcraft_parties WHERE id = @oldPid", conn);
                    delOldPartyCmd.Parameters.AddWithValue("@oldPid", mergePartyId);
                    await delOldPartyCmd.ExecuteNonQueryAsync();
                }

                // If leader created a new party, ensure they're the leader
                if (leaderPartyId == 0 && targetPartyId == 0)
                {
                    // Already created new party above - leader is already set as leader
                }

                // Add target to the final party (if not already in it)
                using var addCmd = new MySqlCommand(@"
                    INSERT INTO maxhanna.digcraft_party_members (party_id, user_id) 
                    VALUES (@pid, @target)
                    ON DUPLICATE KEY UPDATE party_id = @pid", conn);
                addCmd.Parameters.AddWithValue("@pid", keepPartyId);
                addCmd.Parameters.AddWithValue("@target", req.TargetUserId);
                await addCmd.ExecuteNonQueryAsync();

                // Clear invites between them
                using var delInviteCmd = new MySqlCommand(@"
                    DELETE FROM maxhanna.digcraft_party_invites
                    WHERE from_user_id = @from AND to_user_id = @to", conn);
                delInviteCmd.Parameters.AddWithValue("@from", req.LeaderUserId);
                delInviteCmd.Parameters.AddWithValue("@to", req.TargetUserId);
                await delInviteCmd.ExecuteNonQueryAsync();

                return Ok(new { ok = true, message = "Added to party" });
            }
            catch (Exception ex)
            {
                _ = _log.Db("AddToParty error: " + ex.Message, req.LeaderUserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Send a party invite to another user</summary>
        [HttpPost("SendPartyInvite")]
        public async Task<IActionResult> SendPartyInvite([FromBody] DataContracts.DigCraft.PartyRequest req)
        {
            if (req == null || req.LeaderUserId <= 0 || req.TargetUserId <= 0) return BadRequest("Invalid request");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Check if the target is already in a party
                using var chkCmd = new MySqlCommand("SELECT party_id FROM maxhanna.digcraft_party_members WHERE user_id = @target", conn);
                chkCmd.Parameters.AddWithValue("@target", req.TargetUserId);
                var existing = await chkCmd.ExecuteScalarAsync();
                if (existing != null && existing != DBNull.Value) return BadRequest("User is already in a party");

                // Check if there's already a pending invite
                using var dupCmd = new MySqlCommand(@"
                    SELECT 1 FROM maxhanna.digcraft_party_invites 
                    WHERE from_user_id = @from AND to_user_id = @to AND expires_at > UTC_TIMESTAMP()", conn);
                dupCmd.Parameters.AddWithValue("@from", req.LeaderUserId);
                dupCmd.Parameters.AddWithValue("@to", req.TargetUserId);
                var dup = await dupCmd.ExecuteScalarAsync();
                if (dup != null && dup != DBNull.Value) return BadRequest("Invite already sent");

                // Create invite (expires in 30 seconds for quick testing, should be longer in production)
                var expiresAt = DateTime.UtcNow.AddSeconds(180);
                using var insCmd = new MySqlCommand(@"
                    INSERT INTO maxhanna.digcraft_party_invites (from_user_id, to_user_id, expires_at)
                    VALUES (@from, @to, @expires)", conn);
                insCmd.Parameters.AddWithValue("@from", req.LeaderUserId);
                insCmd.Parameters.AddWithValue("@to", req.TargetUserId);
                insCmd.Parameters.AddWithValue("@expires", expiresAt);
                await insCmd.ExecuteNonQueryAsync();

                return Ok(new { ok = true, message = "Invite sent" });
            }
            catch (Exception ex)
            {
                _ = _log.Db("SendPartyInvite error: " + ex.Message, req.LeaderUserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Remove user from party</summary>
        [HttpPost("RemoveFromParty")]
        public async Task<IActionResult> RemoveFromParty([FromBody] DataContracts.DigCraft.PartyRequest req)
        {
            if (req == null || req.LeaderUserId <= 0 || req.TargetUserId <= 0) return BadRequest("Invalid request");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Verify leader's party
                int partyId = 0;
                using var pCmd = new MySqlCommand("SELECT id FROM maxhanna.digcraft_parties WHERE leader_user_id = @leader", conn);
                pCmd.Parameters.AddWithValue("@leader", req.LeaderUserId);
                var result = await pCmd.ExecuteScalarAsync();
                if (result == null || result == DBNull.Value) return BadRequest("No party found");
                partyId = Convert.ToInt32(result);

                // Remove member
                using var delCmd = new MySqlCommand("DELETE FROM maxhanna.digcraft_party_members WHERE party_id = @pid AND user_id = @target", conn);
                delCmd.Parameters.AddWithValue("@pid", partyId);
                delCmd.Parameters.AddWithValue("@target", req.TargetUserId);
                var affected = await delCmd.ExecuteNonQueryAsync();
                if (affected == 0) return BadRequest("User not in party");

                // If no members left, delete party
                using var countCmd = new MySqlCommand("SELECT COUNT(*) FROM maxhanna.digcraft_party_members WHERE party_id = @pid", conn);
                countCmd.Parameters.AddWithValue("@pid", partyId);
                var count = Convert.ToInt32(await countCmd.ExecuteScalarAsync());
                if (count == 0)
                {
                    using var delPartyCmd = new MySqlCommand("DELETE FROM maxhanna.digcraft_parties WHERE id = @pid", conn);
                    delPartyCmd.Parameters.AddWithValue("@pid", partyId);
                    await delPartyCmd.ExecuteNonQueryAsync();
                }

                return Ok(new { ok = true, message = "Removed from party" });
            }
            catch (Exception ex)
            {
                _ = _log.Db("RemoveFromParty error: " + ex.Message, req.LeaderUserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Leave the current party. If the leader leaves, leadership passes to the next member.</summary>
        [HttpPost("LeaveParty")]
        public async Task<IActionResult> LeaveParty([FromBody] DataContracts.DigCraft.LeavePartyRequest req)
        {
            int userId = req.UserId;
            if (userId <= 0) return BadRequest("Invalid userId");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                int partyId = 0;
                int leaderUserId = 0;
                using (var pCmd = new MySqlCommand(@"
                    SELECT p.id, p.leader_user_id
                    FROM maxhanna.digcraft_parties p
                    LEFT JOIN maxhanna.digcraft_party_members pm ON pm.party_id = p.id
                    WHERE p.leader_user_id = @uid OR pm.user_id = @uid
                    LIMIT 1", conn))
                {
                    pCmd.Parameters.AddWithValue("@uid", userId);
                    using var r = await pCmd.ExecuteReaderAsync();
                    if (!await r.ReadAsync()) return Ok(new { ok = true, message = "No active party" });
                    partyId = r.GetInt32("id");
                    leaderUserId = r.GetInt32("leader_user_id");
                }

                if (leaderUserId == userId)
                {
                    using var memberCountCmd = new MySqlCommand("SELECT COUNT(*) FROM maxhanna.digcraft_party_members WHERE party_id = @pid", conn);
                    memberCountCmd.Parameters.AddWithValue("@pid", partyId);
                    var memberCount = Convert.ToInt32(await memberCountCmd.ExecuteScalarAsync());

                    if (memberCount == 0)
                    {
                        using var deletePartyCmd = new MySqlCommand("DELETE FROM maxhanna.digcraft_parties WHERE id = @pid", conn);
                        deletePartyCmd.Parameters.AddWithValue("@pid", partyId);
                        await deletePartyCmd.ExecuteNonQueryAsync();
                    }
                    else
                    {
                        using var nextLeaderCmd = new MySqlCommand(@"
                            SELECT user_id FROM maxhanna.digcraft_party_members
                            WHERE party_id = @pid ORDER BY joined_at LIMIT 1", conn);
                        nextLeaderCmd.Parameters.AddWithValue("@pid", partyId);
                        var nextLeader = await nextLeaderCmd.ExecuteScalarAsync();
                        var nextLeaderUserId = Convert.ToInt32(nextLeader);

                        using var promoteCmd = new MySqlCommand("UPDATE maxhanna.digcraft_parties SET leader_user_id = @leader WHERE id = @pid", conn);
                        promoteCmd.Parameters.AddWithValue("@leader", nextLeaderUserId);
                        promoteCmd.Parameters.AddWithValue("@pid", partyId);
                        await promoteCmd.ExecuteNonQueryAsync();

                        using var removePromotedMemberCmd = new MySqlCommand("DELETE FROM maxhanna.digcraft_party_members WHERE party_id = @pid AND user_id = @uid", conn);
                        removePromotedMemberCmd.Parameters.AddWithValue("@pid", partyId);
                        removePromotedMemberCmd.Parameters.AddWithValue("@uid", nextLeaderUserId);
                        await removePromotedMemberCmd.ExecuteNonQueryAsync();
                    }
                }
                else
                {
                    using var leaveCmd = new MySqlCommand("DELETE FROM maxhanna.digcraft_party_members WHERE party_id = @pid AND user_id = @uid", conn);
                    leaveCmd.Parameters.AddWithValue("@pid", partyId);
                    leaveCmd.Parameters.AddWithValue("@uid", userId);
                    await leaveCmd.ExecuteNonQueryAsync();
                }

                using var deleteInvitesCmd = new MySqlCommand(@"
                    DELETE FROM maxhanna.digcraft_party_invites
                    WHERE from_user_id = @uid OR to_user_id = @uid", conn);
                deleteInvitesCmd.Parameters.AddWithValue("@uid", userId);
                await deleteInvitesCmd.ExecuteNonQueryAsync();

                return Ok(new { ok = true, message = "Left party" });
            }
            catch (Exception ex)
            {
                _ = _log.Db("LeaveParty error: " + ex.Message, userId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Dismiss a pending party invite without joining the party.</summary>
        [HttpPost("ClearPartyInvite")]
        public async Task<IActionResult> ClearPartyInvite([FromBody] DataContracts.DigCraft.PartyInviteDecisionRequest req)
        {
            if (req == null || req.FromUserId <= 0 || req.ToUserId <= 0) return BadRequest("Invalid request");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var delCmd = new MySqlCommand(@"
                    DELETE FROM maxhanna.digcraft_party_invites
                    WHERE from_user_id = @from AND to_user_id = @to", conn);
                delCmd.Parameters.AddWithValue("@from", req.FromUserId);
                delCmd.Parameters.AddWithValue("@to", req.ToUserId);
                await delCmd.ExecuteNonQueryAsync();

                return Ok(new { ok = true });
            }
            catch (Exception ex)
            {
                _ = _log.Db("ClearPartyInvite error: " + ex.Message, req.ToUserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        [HttpPost("AcceptPartyInvite")]
        public async Task<IActionResult> AcceptPartyInvite([FromBody] DataContracts.DigCraft.AcceptPartyInviteRequest req)
        {
            if (req == null || req.FromUserId <= 0 || req.UserId <= 0) return BadRequest("Invalid request");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Delete the invite
                using var delCmd = new MySqlCommand(@"
                    DELETE FROM maxhanna.digcraft_party_invites
                    WHERE from_user_id = @from AND to_user_id = @to", conn);
                delCmd.Parameters.AddWithValue("@from", req.FromUserId);
                delCmd.Parameters.AddWithValue("@to", req.UserId);
                await delCmd.ExecuteNonQueryAsync();

                // Check if inviter is in a party (as leader or member)
                int inviterPartyId = 0;
                using (var pCmd = new MySqlCommand(@"
                    SELECT p.id FROM maxhanna.digcraft_parties p
                    LEFT JOIN maxhanna.digcraft_party_members pm ON pm.party_id = p.id
                    WHERE p.leader_user_id = @from OR pm.user_id = @from
                    LIMIT 1", conn))
                {
                    pCmd.Parameters.AddWithValue("@from", req.FromUserId);
                    var result = await pCmd.ExecuteScalarAsync();
                    if (result != null && result != DBNull.Value) inviterPartyId = Convert.ToInt32(result);
                }

                if (inviterPartyId == 0)
                {
                    // Inviter has no party - create one with them as leader
                    using var insPartyCmd = new MySqlCommand("INSERT INTO maxhanna.digcraft_parties (leader_user_id) VALUES (@from)", conn);
                    insPartyCmd.Parameters.AddWithValue("@from", req.FromUserId);
                    await insPartyCmd.ExecuteNonQueryAsync();
                    inviterPartyId = (int)insPartyCmd.LastInsertedId;
                }

                // Add user to inviter's party
                using var addCmd = new MySqlCommand(@"
                    INSERT INTO maxhanna.digcraft_party_members (party_id, user_id)
                    VALUES (@pid, @uid)
                    ON DUPLICATE KEY UPDATE party_id = @pid", conn);
                addCmd.Parameters.AddWithValue("@pid", inviterPartyId);
                addCmd.Parameters.AddWithValue("@uid", req.UserId);
                await addCmd.ExecuteNonQueryAsync();

                return Ok(new { ok = true });
            }
            catch (Exception ex)
            {
                _ = _log.Db("AcceptPartyInvite error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Get pending party invites for a user</summary>
        [HttpPost("PendingInvites")]
        public async Task<IActionResult> GetPendingInvites([FromBody] DataContracts.DigCraft.PartyInviteRequest req)
        {
            int userId = req.UserId;
            if (userId <= 0) return BadRequest("Invalid userId");

            var invites = new List<object>();
            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();
                // Delete expired invites first
                using var delCmd = new MySqlCommand("DELETE FROM maxhanna.digcraft_party_invites WHERE expires_at < UTC_TIMESTAMP()", conn);
                await delCmd.ExecuteNonQueryAsync();
                // Get pending invites
                using var cmd = new MySqlCommand(@"
                    SELECT pi.from_user_id, u.username, pi.expires_at
                    FROM maxhanna.digcraft_party_invites pi
                    JOIN maxhanna.users u ON u.id = pi.from_user_id
                    WHERE pi.to_user_id = @toUser AND pi.expires_at > UTC_TIMESTAMP()", conn);
                cmd.Parameters.AddWithValue("@toUser", userId);
                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var fromId = reader.GetInt32(0);
                    var username = reader.GetString(1);
                    var expiresAt = reader.GetDateTime(2);
                    var expiresAtUtc = DateTime.SpecifyKind(expiresAt, DateTimeKind.Utc);
                    invites.Add(new
                    {
                        fromUserId = fromId,
                        username,
                        expiresAt = new DateTimeOffset(expiresAtUtc).ToUnixTimeMilliseconds()
                    });
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db("GetPendingInvites error: " + ex.Message, userId, "DIGCRAFT", true);
            }
            return Ok(invites);
        }

        private async Task BlockGrowthLoopAsync(CancellationToken ct)
        {
            const int tickMs = 5000 / BLOCK_REGEN_DEBUG_MULTIPLIER;
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    await Task.Delay(tickMs, ct);

                    try
                    {
                        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                        await conn.OpenAsync(ct);

                        var now = DateTime.UtcNow;
                        var cutoff = now.AddMilliseconds(-SHRUB_GROW_TIME_MS / BLOCK_REGEN_DEBUG_MULTIPLIER);
                        var worldSeedCache = new Dictionary<int, int>();

                        // Find any planted entries that are due for regrowth (shrubs, or marked breaks)
                        using var cmd = new MySqlCommand(@"
                            SELECT world_id, chunk_x, chunk_z, local_x, local_y, local_z, block_id, planted_at
                            FROM maxhanna.digcraft_block_changes
                            WHERE planted_at IS NOT NULL AND planted_at <= @cutoff", conn);
                        cmd.Parameters.AddWithValue("@cutoff", cutoff);

                        using var reader = await cmd.ExecuteReaderAsync(ct);
                        var toGrow = new List<(int worldId, int chunkX, int chunkZ, int localX, int localY, int localZ, int blockId, DateTime plantedAt)>();
                        while (await reader.ReadAsync(ct))
                        {
                            toGrow.Add((
                                reader.GetInt32("world_id"),
                                reader.GetInt32("chunk_x"),
                                reader.GetInt32("chunk_z"),
                                reader.GetInt32("local_x"),
                                reader.GetInt32("local_y"),
                                reader.GetInt32("local_z"),
                                reader.GetInt32("block_id"),
                                reader.GetDateTime("planted_at")
                            ));
                        }
                        await reader.CloseAsync();

                        if (toGrow.Count == 0) continue;


                        foreach (var planted in toGrow)
                        {
                            var (worldId, chunkX, chunkZ, localX, localY, localZ, plantedBlockId, _) = planted;
                            var sx = chunkX * CHUNK_SIZE + localX;
                            var sy = localY;   // exact Y the marker was written at
                            var sz = chunkZ * CHUNK_SIZE + localZ;

                            if (!worldSeedCache.TryGetValue(worldId, out var worldSeed))
                            {
                                using var seedCmd = new MySqlCommand(
                                    "SELECT seed FROM maxhanna.digcraft_worlds WHERE id=@wid", conn);
                                seedCmd.Parameters.AddWithValue("@wid", worldId);
                                var sr = await seedCmd.ExecuteScalarAsync(ct);
                                worldSeed = (sr == null || sr == DBNull.Value) ? 42 : Convert.ToInt32(sr);
                                worldSeedCache[worldId] = worldSeed;
                            }

                            // Helper: clear the planted_at marker at (sx,sy,sz)
                            async Task ClearMarker()
                                => await ClearPlantedMarkerAsync(conn, worldId, sx, sy, sz, ct);

                            // ── SHRUB → grows into a full tree ──────────────────────────────────
                            if (plantedBlockId == BlockIds.SHRUB)
                            {
                                await using var growConn = new MySqlConnection(
                                    _config.GetValue<string>("ConnectionStrings:maxhanna"));
                                await growConn.OpenAsync(ct);
                                await ClearPlantedMarkerAsync(growConn, worldId, sx, sy, sz, ct);

                                const int trunkH = 4;
                                for (int i = 0; i < trunkH; i++)
                                    await UpsertBlockChangeAsync(growConn, worldId, sx, sy + i, sz, BlockIds.WOOD, ct);

                                int leafY = sy + trunkH;
                                (int dx, int dz)[] leafOffsets = {
            (0,0),(1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)
        };
                                foreach (var (lox, loz) in leafOffsets)
                                {
                                    int ex = await GetBlockAtAsync(growConn, worldId, sx + lox, leafY, sz + loz, worldSeed);
                                    if (ex == BlockIds.AIR)
                                        await UpsertBlockChangeAsync(
                                            growConn, worldId, sx + lox, leafY, sz + loz, BlockIds.LEAVES, ct);
                                }
                                continue;
                            }

                            // ── BAMBOO regrowth (grow deterministic bamboo columns like world gen) ──
                            if (plantedBlockId == BlockIds.BAMBOO)
                            {
                                await using var growConn = new MySqlConnection(
                                    _config.GetValue<string>("ConnectionStrings:maxhanna"));
                                await growConn.OpenAsync(ct);
                                await ClearPlantedMarkerAsync(growConn, worldId, sx, sy, sz, ct);

                                var bcol = SampleTerrainColumn(worldSeed, sx, sz);
                                var surfaceB = bcol.Height + NETHER_TOP + 1;
                                var bN = Noise2D(worldSeed + 91000, sx, sz, 6.0);
                                if (bN > 0.66)
                                {
                                    int bambooH = 2 + (int)Math.Floor(Noise2D(worldSeed + 91010, sx, sz, 4.0) * 4.0);
                                    for (int i = 1; i <= bambooH; i++)
                                    {
                                        int placeY = surfaceB + i;
                                        int cur = await GetBlockAtAsync(growConn, worldId, sx, placeY, sz, worldSeed);
                                        if (cur == BlockIds.AIR)
                                            await UpsertBlockChangeAsync(growConn, worldId, sx, placeY, sz, BlockIds.BAMBOO, ct);
                                    }
                                }
                                continue;
                            }

                            // ── NETHER STALACTITE (hangs down from ceiling) ──────────────────────
                            // Also handles world-seeded stalactites: if no marker but GetBaseBlockId says stalactite
                            var baseBlockId = GetBaseBlockId(worldSeed, sx, sy, sz);
                            if (plantedBlockId == BlockIds.NETHER_STALACTITE || (plantedBlockId == 0 && baseBlockId == BlockIds.NETHER_STALACTITE))
                            {
                                var ns = (int)unchecked(worldSeed ^ 0x9E3779B1);
                                if (Noise2D(ns + 60000, sx, sz, 8.0) <= 0.72) { await ClearMarker(); continue; }
                                int maxLen = 1 + (int)Math.Floor(Noise2D(ns + 60010, sx, sz, 12.0) * 5.0);

                                // Scan upward from sy to find the ceiling (first non-air, non-stalactite block)
                                int ceilY = -1;
                                for (int scanY = sy; scanY < NETHER_TOP - 1; scanY++)
                                {
                                    int b = await GetBlockAtAsync(conn, worldId, sx, scanY, sz, worldSeed);
                                    if (b != BlockIds.AIR && b != BlockIds.NETHER_STALACTITE)
                                    { ceilY = scanY; break; }
                                }
                                if (ceilY < 0) { await ClearMarker(); continue; }

                                // CRITICAL: Check if the ceiling block still exists (the anchor)
                                // If no ceiling block (AIR), don't regrow - permanently destroyed
                                int ceilingBlock = await GetBlockAtAsync(conn, worldId, sx, ceilY, sz, worldSeed);
                                if (ceilingBlock == BlockIds.AIR)
                                {
                                    // Ceiling gone - permanently remove, clear marker
                                    await ClearMarker();
                                    continue;
                                }

                                // Determine the canonical column base (the block that sits
                                // directly under the ceiling). If that base block itself has
                                // been removed by a player (i.e. there is a planted marker
                                // recorded at the anchor with changed_by > 0), we should
                                // suppress any regrowth for this column.
                                int anchorY = ceilY - 1;
                                GetStoredBlockCoords(sx, anchorY, sz, out var anchorCx, out var anchorCz, out var anchorLx, out var anchorLy, out var anchorLz);
                                using (var anchorCmd = new MySqlCommand(@"
                                        SELECT changed_by FROM maxhanna.digcraft_block_changes
                                        WHERE world_id = @wid AND chunk_x = @cx AND chunk_z = @cz
                                          AND local_x = @lx AND local_y = @ly AND local_z = @lz", conn))
                                {
                                    anchorCmd.Parameters.AddWithValue("@wid", worldId);
                                    anchorCmd.Parameters.AddWithValue("@cx", anchorCx);
                                    anchorCmd.Parameters.AddWithValue("@cz", anchorCz);
                                    anchorCmd.Parameters.AddWithValue("@lx", anchorLx);
                                    anchorCmd.Parameters.AddWithValue("@ly", anchorLy);
                                    anchorCmd.Parameters.AddWithValue("@lz", anchorLz);
                                    var anchorObj = await anchorCmd.ExecuteScalarAsync(ct);
                                    if (anchorObj != null && anchorObj != DBNull.Value)
                                    {
                                        var changedBy = Convert.ToInt32(anchorObj);
                                        if (changedBy > 0)
                                        {
                                            _ = _log.Db($"Regrow suppressed (stalactite base removed by player): ({worldId}) {sx},{anchorY},{sz}", null, "DIGCRAFT", false);
                                            await ClearMarker();
                                            continue;
                                        }
                                    }
                                }

                                // Find highest surviving stalactite block in the natural column (ceilY-1 down to ceilY-maxLen)
                                int highestSurviving = -1;
                                for (int d = 1; d <= maxLen; d++)
                                {
                                    int checkY = ceilY - d;
                                    if (checkY < 2) break;
                                    if (await GetBlockAtAsync(conn, worldId, sx, checkY, sz, worldSeed)
                                        == BlockIds.NETHER_STALACTITE)
                                        highestSurviving = checkY;  // keep updating → ends up as highest (closest to ceil)
                                }

                                // Nothing survives → clear marker, don't grow from nothing
                                if (highestSurviving < 0) { await ClearMarker(); continue; }

                                // Find lowest surviving block in that same run
                                int lowestSurviving = highestSurviving;
                                for (int d = 1; d <= maxLen; d++)
                                {
                                    int checkY = highestSurviving - d;
                                    if (checkY < 2) break;
                                    if (await GetBlockAtAsync(conn, worldId, sx, checkY, sz, worldSeed)
                                        == BlockIds.NETHER_STALACTITE)
                                        lowestSurviving = checkY;
                                    else break;
                                }

                                int naturalBottom = ceilY - maxLen;
                                await using var dripConn = new MySqlConnection(
                                    _config.GetValue<string>("ConnectionStrings:maxhanna"));
                                await dripConn.OpenAsync(ct);

                                int restored = 0;
                                for (int y = lowestSurviving - 1; y >= Math.Max(2, naturalBottom); y--)
                                {
                                    int existing = await GetBlockAtAsync(dripConn, worldId, sx, y, sz, worldSeed);
                                    if (existing != BlockIds.AIR) break;
                                    await UpsertBlockChangeForRegrowAsync(
                                        dripConn, worldId, sx, y, sz, BlockIds.NETHER_STALACTITE, ct, delaySeconds: 2);
                                    restored++;
                                }

                                if (restored > 0)
                                    await ClearPlantedMarkerAsync(dripConn, worldId, sx, sy, sz, ct);
                                else
                                    await ClearMarker(); // nothing to grow, tidy up

                                continue;
                            }

                            // ── NETHER STALAGMITE (grows up from floor) ──────────────────────────
                            // Also handles world-seeded stalagmites: if no marker but GetBaseBlockId says stalagmite
                            var baseBlockId2 = GetBaseBlockId(worldSeed, sx, sy, sz);
                            _ = _log.Db($"[STALAGMITE] plantedBlockId={plantedBlockId}, GetBaseBlockId={baseBlockId2}", null, "DIGCRAFT", true);
                            if (plantedBlockId == BlockIds.NETHER_STALAGMITE ||
                                (plantedBlockId == 0 && baseBlockId2 == BlockIds.NETHER_STALAGMITE))
                            {
                                var ns = (int)unchecked(worldSeed ^ 0x9E3779B1);
                                if (Noise2D(ns + 61000, sx, sz, 8.0) <= 0.72) { await ClearMarker(); continue; }
                                int maxLen = 1 + (int)Math.Floor(Noise2D(ns + 61010, sx, sz, 12.0) * 5.0);

                                // Scan downward from sy to find the floor (first non-air, non-stalagmite block)
                                int floorY = -1;
                                for (int scanY = sy; scanY > 1; scanY--)
                                {
                                    int b = await GetBlockAtAsync(conn, worldId, sx, scanY, sz, worldSeed);
                                    if (b != BlockIds.AIR && b != BlockIds.NETHER_STALAGMITE)
                                    { floorY = scanY; break; }
                                }
                                if (floorY < 0) { await ClearMarker(); continue; }

                                // CRITICAL: Check if the floor block still exists (the anchor)
                                // If no floor block (AIR), don't regrow - permanently destroyed
                                int floorBlock = await GetBlockAtAsync(conn, worldId, sx, floorY, sz, worldSeed);
                                if (floorBlock == BlockIds.AIR)
                                {
                                    // Floor gone - permanently remove, clear marker
                                    await ClearMarker();
                                    continue;
                                }

                                // Determine the canonical stalagmite base (the block that
                                // sits directly above the floor). If that base block has
                                // been removed by a player (there's a planted marker with
                                // changed_by > 0 at the anchor), suppress regrowth.
                                int anchorY2 = floorY + 1;
                                GetStoredBlockCoords(sx, anchorY2, sz, out var anchor2Cx, out var anchor2Cz, out var anchor2Lx, out var anchor2Ly, out var anchor2Lz);
                                using (var anchor2Cmd = new MySqlCommand(@"
                                        SELECT changed_by FROM maxhanna.digcraft_block_changes
                                        WHERE world_id = @wid AND chunk_x = @cx AND chunk_z = @cz
                                          AND local_x = @lx AND local_y = @ly AND local_z = @lz", conn))
                                {
                                    anchor2Cmd.Parameters.AddWithValue("@wid", worldId);
                                    anchor2Cmd.Parameters.AddWithValue("@cx", anchor2Cx);
                                    anchor2Cmd.Parameters.AddWithValue("@cz", anchor2Cz);
                                    anchor2Cmd.Parameters.AddWithValue("@lx", anchor2Lx);
                                    anchor2Cmd.Parameters.AddWithValue("@ly", anchor2Ly);
                                    anchor2Cmd.Parameters.AddWithValue("@lz", anchor2Lz);
                                    var anchor2Obj = await anchor2Cmd.ExecuteScalarAsync(ct);
                                    if (anchor2Obj != null && anchor2Obj != DBNull.Value)
                                    {
                                        var changedBy2 = Convert.ToInt32(anchor2Obj);
                                        if (changedBy2 > 0)
                                        {
                                            _ = _log.Db($"Regrow suppressed (stalagmite base removed by player): ({worldId}) {sx},{anchorY2},{sz}", null, "DIGCRAFT", false);
                                            await ClearMarker();
                                            continue;
                                        }
                                    }
                                }

                                // Find lowest surviving stalagmite block (closest to floor)
                                int lowestSurviving = -1;
                                for (int d = 1; d <= maxLen; d++)
                                {
                                    int checkY = floorY + d;
                                    if (checkY >= NETHER_TOP) break;
                                    if (await GetBlockAtAsync(conn, worldId, sx, checkY, sz, worldSeed)
                                        == BlockIds.NETHER_STALAGMITE)
                                        lowestSurviving = checkY;
                                }

                                if (lowestSurviving < 0) { await ClearMarker(); continue; }

                                // Find highest surviving block in that run
                                int highestSurviving = lowestSurviving;
                                for (int d = 1; d <= maxLen; d++)
                                {
                                    int checkY = lowestSurviving + d;
                                    if (checkY >= NETHER_TOP) break;
                                    if (await GetBlockAtAsync(conn, worldId, sx, checkY, sz, worldSeed)
                                        == BlockIds.NETHER_STALAGMITE)
                                        highestSurviving = checkY;
                                    else break;
                                }

                                int naturalTop = floorY + maxLen;
                                await using var dripConn = new MySqlConnection(
                                    _config.GetValue<string>("ConnectionStrings:maxhanna"));
                                await dripConn.OpenAsync(ct);

                                int restored = 0;
                                for (int y = highestSurviving + 1; y <= Math.Min(NETHER_TOP - 1, naturalTop); y++)
                                {
                                    int existing = await GetBlockAtAsync(dripConn, worldId, sx, y, sz, worldSeed);
                                    if (existing != BlockIds.AIR) break;
                                    await UpsertBlockChangeForRegrowAsync(
                                        dripConn, worldId, sx, y, sz, BlockIds.NETHER_STALAGMITE, ct, delaySeconds: 2);
                                    restored++;
                                }

                                if (restored > 0)
                                    await ClearPlantedMarkerAsync(dripConn, worldId, sx, sy, sz, ct);
                                else
                                    await ClearMarker();

                                continue;
                            }

                            // ── SEAWEED (grows up from sea floor) ────────────────────────────────
                            if (plantedBlockId == BlockIds.SEAWEED)
                            {
                                double kelpN = Noise2D(worldSeed + 1234567, sx, sz, 8.0);
                                if (kelpN <= 0.68) { await ClearMarker(); continue; }
                                int kelpLen = 1 + (int)Math.Floor(Noise2D(worldSeed + 1234577, sx, sz, 4.0) * 6.0);

                                var col = SampleTerrainColumn(worldSeed, sx, sz);
                                int seaFloor = col.Height + NETHER_TOP + 1;
                                int naturalBot = seaFloor + 1;
                                int naturalTop = seaFloor + kelpLen;

                                // Floor must still be solid
                                int floorBid = await GetBlockAtAsync(conn, worldId, sx, seaFloor, sz, worldSeed);
                                if (floorBid == BlockIds.AIR || floorBid == BlockIds.WATER)
                                { await ClearMarker(); continue; }

                                // Find highest surviving seaweed block
                                int topSurviving = -1;
                                for (int y = naturalBot; y <= naturalTop; y++)
                                {
                                    if (await GetBlockAtAsync(conn, worldId, sx, y, sz, worldSeed) == BlockIds.SEAWEED)
                                        topSurviving = y;
                                }

                                if (topSurviving < 0) { await ClearMarker(); continue; }
                                if (topSurviving >= naturalTop) { await ClearMarker(); continue; } // already full

                                await using var seaConn = new MySqlConnection(
                                    _config.GetValue<string>("ConnectionStrings:maxhanna"));
                                await seaConn.OpenAsync(ct);

                                int restored = 0;
                                for (int y = topSurviving + 1; y <= naturalTop; y++)
                                {
                                    int existing = await GetBlockAtAsync(seaConn, worldId, sx, y, sz, worldSeed);
                                    if (existing != BlockIds.WATER && existing != BlockIds.AIR) break;
                                    await UpsertBlockChangeForRegrowAsync(
                                        seaConn, worldId, sx, y, sz, BlockIds.SEAWEED, ct, delaySeconds: 3);
                                    restored++;
                                }

                                if (restored > 0)
                                    await ClearPlantedMarkerAsync(seaConn, worldId, sx, sy, sz, ct);
                                else
                                    await ClearMarker();

                                continue;
                            }

                            // ── CACTUS (regrows if any cactus blocks remain connected) ────────────
                            if (plantedBlockId == BlockIds.CACTUS)
                            {
                                // Get the original cactus height from world generation
                                var ccol = SampleTerrainColumn(worldSeed, sx, sz);
                                var surfaceC = ccol.Height + NETHER_TOP + 1;
                                var cN = Noise2D(worldSeed + 92000, sx, sz, 6.0);
                                if (cN <= 0.74) { await ClearMarker(); continue; } // not a cactus location

                                int naturalH = 1 + (int)Math.Floor(Noise2D(worldSeed + 92010, sx, sz, 4.0) * 3.0);
                                int naturalBot = surfaceC + 1;
                                int naturalTop = surfaceC + naturalH;

                                // Check if there's still at least one cactus block at this position
                                int topSurviving = -1;
                                for (int y = naturalBot; y <= naturalTop; y++)
                                {
                                    if (await GetBlockAtAsync(conn, worldId, sx, y, sz, worldSeed) == BlockIds.CACTUS)
                                        topSurviving = y;
                                }

                                // If all cactus blocks were removed, don't regrow (permanent destruction)
                                if (topSurviving < 0) { await ClearMarker(); continue; }

                                // If already at full height, nothing to regrow
                                if (topSurviving >= naturalTop) { await ClearMarker(); continue; }

                                // Check if the base (sand) still exists
                                int baseBlock = await GetBlockAtAsync(conn, worldId, sx, surfaceC, sz, worldSeed);
                                if (baseBlock != BlockIds.SAND && baseBlock != BlockIds.RED_SAND) { await ClearMarker(); continue; }

                                // Check for adjacency - if any neighboring cactus exists, we can regrow
                                bool hasNeighborCactus = false;
                                (int nx, int nz)[] neighbors = { (-1, 0), (1, 0), (0, -1), (0, 1) };
                                foreach (var (nx, nz) in neighbors)
                                {
                                    for (int ny = naturalBot; ny <= naturalTop; ny++)
                                    {
                                        int nb = await GetBlockAtAsync(conn, worldId, sx + nx, ny, sz + nz, worldSeed);
                                        if (nb == BlockIds.CACTUS) { hasNeighborCactus = true; break; }
                                    }
                                    if (hasNeighborCactus) break;
                                }
                                if (!hasNeighborCactus) { await ClearMarker(); continue; }

                                // Regrow missing cactus blocks
                                await using var cactusConn = new MySqlConnection(
                                    _config.GetValue<string>("ConnectionStrings:maxhanna"));
                                await cactusConn.OpenAsync(ct);

                                int restored = 0;
                                for (int y = topSurviving + 1; y <= naturalTop; y++)
                                {
                                    int existing = await GetBlockAtAsync(cactusConn, worldId, sx, y, sz, worldSeed);
                                    if (existing != BlockIds.AIR) break;
                                    await UpsertBlockChangeForRegrowAsync(
                                        cactusConn, worldId, sx, y, sz, BlockIds.CACTUS, ct, delaySeconds: 2);
                                    restored++;
                                }

                                if (restored > 0)
                                    await ClearPlantedMarkerAsync(cactusConn, worldId, sx, sy, sz, ct);
                                else
                                    await ClearMarker();

                                continue;
                            }

                            // ── WOOD / LEAVES (world-generated tree) ─────────────────────────────
                            if (plantedBlockId == BlockIds.WOOD || plantedBlockId == BlockIds.LEAVES)
                            {
                                bool didRestore = false;
                                for (int tx = sx - 2; tx <= sx + 2 && !didRestore; tx++)
                                {
                                    for (int tz = sz - 2; tz <= sz + 2 && !didRestore; tz++)
                                    {
                                        var tcol = SampleTerrainColumn(worldSeed, tx, tz);
                                        var surfT = tcol.Height + NETHER_TOP + 1;
                                        double treeTh = TreeNoiseThreshold(tcol.Biome);
                                        if (treeTh <= 0) continue;
                                        if (Noise2D(worldSeed + 100000, tx, tz, 12.0) >= treeTh) continue;

                                        int trunkH = 4 + (int)Math.Floor(Noise2D(worldSeed + 101000, tx, tz, 6.0) * 3.0);
                                        int trunkBase = surfT + 1;
                                        int trunkTop = surfT + trunkH;
                                        int leafY = trunkTop + 1;

                                        // Is at least one trunk block still present?
                                        int highestTrunk = trunkBase - 1;
                                        bool anySurvives = false;
                                        for (int wy = trunkBase; wy <= trunkTop; wy++)
                                        {
                                            if (await GetBlockAtAsync(conn, worldId, tx, wy, tz, worldSeed) == BlockIds.WOOD)
                                            { anySurvives = true; highestTrunk = wy; }
                                        }
                                        if (!anySurvives) continue;

                                        await using var growConn = new MySqlConnection(
                                            _config.GetValue<string>("ConnectionStrings:maxhanna"));
                                        await growConn.OpenAsync(ct);

                                        int written = 0;
                                        // Restore missing trunk above the highest surviving block
                                        for (int wy = highestTrunk + 1; wy <= trunkTop; wy++)
                                        {
                                            if (await GetBlockAtAsync(growConn, worldId, tx, wy, tz, worldSeed) == BlockIds.AIR)
                                            {
                                                await UpsertBlockChangeForRegrowAsync(
                                                    growConn, worldId, tx, wy, tz, BlockIds.WOOD, ct, delaySeconds: 3);
                                                written++;
                                            }
                                        }

                                        // Restore canopy
                                        (int dx, int dz)[] leafOffsets = {
                    (0,0),(1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)
                };
                                        foreach (var (lox, loz) in leafOffsets)
                                        {
                                            if (await GetBlockAtAsync(growConn, worldId, tx + lox, leafY, tz + loz, worldSeed)
                                                == BlockIds.AIR)
                                            {
                                                await UpsertBlockChangeForRegrowAsync(
                                                    growConn, worldId, tx + lox, leafY, tz + loz,
                                                    BlockIds.LEAVES, ct, delaySeconds: 6);
                                                written++;
                                            }
                                        }

                                        if (written > 0)
                                            await ClearPlantedMarkerAsync(growConn, worldId, sx, sy, sz, ct);

                                        didRestore = true;
                                    }
                                }

                                if (!didRestore)
                                    await ClearMarker(); // tree completely gone — abandon

                                continue;
                            }

                            // ── Fallback: unknown / legacy entry — just clear it ────────────────
                            await ClearMarker();
                        }

                        // ── Lava drip: stalactite + lava above → fill cauldron below ──
                        // Every 30 seconds, scan for cauldrons that have a stalactite column
                        // above them with lava at the top. Fill the cauldron with lava.
                        // Drip rate: 1 fill per 30 seconds (matches Minecraft ~25 min for full cauldron,
                        // but we use 3 fills = full so ~90 seconds total).
                        const long dripIntervalMs = 30_000; // 30 seconds per drip
                        if ((now.Ticks / TimeSpan.TicksPerMillisecond) % dripIntervalMs < tickMs)
                        {
                            // Find all player-placed cauldrons
                            var cauldronCutoff = now.AddMilliseconds(-dripIntervalMs);
                            using var cauldronCmd = new MySqlCommand(@"
                                SELECT world_id, chunk_x, chunk_z, local_x, local_y, local_z
                                FROM maxhanna.digcraft_block_changes
                                WHERE block_id = @cauldron AND changed_by > 0", conn);
                            cauldronCmd.Parameters.AddWithValue("@cauldron", BlockIds.CAULDRON);
                            using var cauldronReader = await cauldronCmd.ExecuteReaderAsync(ct);
                            var cauldrons = new List<(int worldId, int wx, int wy, int wz)>();
                            while (await cauldronReader.ReadAsync(ct))
                            {
                                int cx2 = cauldronReader.GetInt32("chunk_x"), cz2 = cauldronReader.GetInt32("chunk_z");
                                int lx2 = cauldronReader.GetInt32("local_x"), ly2 = cauldronReader.GetInt32("local_y"), lz2 = cauldronReader.GetInt32("local_z");
                                cauldrons.Add((cauldronReader.GetInt32("world_id"), cx2 * CHUNK_SIZE + lx2, ly2, cz2 * CHUNK_SIZE + lz2));
                            }
                            await cauldronReader.CloseAsync();

                            foreach (var (worldId, cx3, cy3, cz3) in cauldrons)
                            {
                                if (!worldSeedCache.TryGetValue(worldId, out var worldSeed2))
                                {
                                    using var seedCmd2 = new MySqlCommand("SELECT seed FROM maxhanna.digcraft_worlds WHERE id = @wid", conn);
                                    seedCmd2.Parameters.AddWithValue("@wid", worldId);
                                    var sr2 = await seedCmd2.ExecuteScalarAsync(ct);
                                    worldSeed2 = (sr2 == null || sr2 == DBNull.Value) ? 42 : Convert.ToInt32(sr2);
                                    worldSeedCache[worldId] = worldSeed2;
                                }

                                // Check if cauldron already has lava (already full)
                                var cauldronContent = await GetBlockAtAsync(conn, worldId, cx3, cy3, cz3, worldSeed2);
                                if (cauldronContent == BlockIds.CAULDRON_LAVA) continue; // already full

                                // Scan upward from cauldron: look for a stalactite column topped by lava
                                // Pattern: CAULDRON at cy3, then 1+ NETHER_STALACTITE blocks, then LAVA
                                bool foundLavaDrip = false;
                                for (int scanY = cy3 + 1; scanY <= cy3 + 8; scanY++)
                                {
                                    int bid = await GetBlockAtAsync(conn, worldId, cx3, scanY, cz3, worldSeed2);
                                    if (bid == BlockIds.NETHER_STALACTITE) continue; // part of the column
                                    if (bid == BlockIds.LAVA) { foundLavaDrip = true; break; } // lava at top!
                                    break; // something else — no drip
                                }

                                if (!foundLavaDrip) continue;

                                // Fill the cauldron with lava
                                await using var dripConn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                                await dripConn.OpenAsync(ct);
                                await UpsertBlockChangeAsync(dripConn, worldId, cx3, cy3, cz3, BlockIds.CAULDRON_LAVA, ct);
                                _ = _log.Db($"Lava drip: filled cauldron at ({cx3},{cy3},{cz3}) world={worldId}", 0, "DIGCRAFT", true);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _ = _log.Db("BlockGrowthLoop error: " + ex.Message, null, "DIGCRAFT", true);
                    }
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception ex)
            {
                _ = _log.Db("BlockGrowthLoop fatal: " + ex.Message, null, "DIGCRAFT", true);
            }
        }

        /// <summary>
        /// Minecraft-style fluid simulation using 1-8 fluid levels.
        /// Each tick, durable source blocks emit a finite flow graph: falling has priority,
        /// horizontal spread decays by distance, disconnected simulation rows are deleted,
        /// and water creates infinite source behavior only while two durable neighbours remain.
        /// Only simulation-spread blocks (changed_by=0) are deleted; user-placed sources
        /// (changed_by>0) keep emitting until replaced by explicit game rules.
        /// </summary>
        private async Task FluidSimulationLoopAsync(CancellationToken ct)
        {
            const int tickMs = 300;
            const int playerRadius = 8;
            const int SOURCE_LEVEL = 8;   // user-placed source block level
            const int MAX_LEVEL = 8;   // maximum fluid level (full block)
            long tickCounter = 0;

            try
            {
                while (!ct.IsCancellationRequested)
                {
                    await Task.Delay(tickMs, ct);
                    tickCounter++;
                    try
                    {
                        await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                        await conn.OpenAsync(ct);

                        var cutoff = DateTime.UtcNow.AddSeconds(-INACTIVITY_TIMEOUT_SECONDS);

                        // ── 1. Active players ──
                        var activePlayers = new List<(int worldId, float px, float py, float pz)>();
                        using (var pCmd = new MySqlCommand(
                            "SELECT world_id, pos_x, pos_y, pos_z FROM maxhanna.digcraft_players WHERE last_seen >= @cutoff", conn))
                        {
                            pCmd.Parameters.AddWithValue("@cutoff", cutoff);
                            using var pr = await pCmd.ExecuteReaderAsync(ct);
                            while (await pr.ReadAsync(ct))
                                activePlayers.Add((pr.GetInt32(0), (float)pr.GetDouble(1),
                                                   (float)pr.GetDouble(2), (float)pr.GetDouble(3)));
                        }
                        if (activePlayers.Count == 0)
                        {
                            using var anyCmd = new MySqlCommand(
                                "SELECT world_id, pos_x, pos_y, pos_z FROM maxhanna.digcraft_players ORDER BY last_seen DESC LIMIT 1", conn);
                            using var anyPr = await anyCmd.ExecuteReaderAsync(ct);
                            if (await anyPr.ReadAsync(ct))
                                activePlayers.Add((anyPr.GetInt32(0), (float)anyPr.GetDouble(1),
                                                   (float)anyPr.GetDouble(2), (float)anyPr.GetDouble(3)));
                        }
                        if (activePlayers.Count == 0) continue;

                        // ── 2. Per-world AABB (world-coord box around all active players) ──
                        var worldBoxes = new Dictionary<int, (int minX, int maxX, int minY, int maxY, int minZ, int maxZ)>();
                        foreach (var (wid, px, py, pz) in activePlayers)
                        {
                            int x0 = (int)Math.Floor(px) - playerRadius, x1 = (int)Math.Floor(px) + playerRadius;
                            int y0 = Math.Max(0, (int)Math.Floor(py) - playerRadius);
                            int y1 = Math.Min(WORLD_HEIGHT - 1, (int)Math.Floor(py) + playerRadius);
                            int z0 = (int)Math.Floor(pz) - playerRadius, z1 = (int)Math.Floor(pz) + playerRadius;
                            if (!worldBoxes.TryGetValue(wid, out var b))
                                worldBoxes[wid] = (x0, x1, y0, y1, z0, z1);
                            else
                                worldBoxes[wid] = (Math.Min(b.minX, x0), Math.Max(b.maxX, x1),
                                                   Math.Min(b.minY, y0), Math.Max(b.maxY, y1),
                                                   Math.Min(b.minZ, z0), Math.Max(b.maxZ, z1));
                        }

                        foreach (var (worldId, box) in worldBoxes)
                        {
                            int minCx = (int)Math.Floor(box.minX / (double)CHUNK_SIZE);
                            int maxCx = (int)Math.Floor(box.maxX / (double)CHUNK_SIZE);
                            int minCz = (int)Math.Floor(box.minZ / (double)CHUNK_SIZE);
                            int maxCz = (int)Math.Floor(box.maxZ / (double)CHUNK_SIZE);

                            // ── 3. World seed ──
                            int worldSeed = 42;
                            using (var seedCmd = new MySqlCommand(
                                "SELECT seed FROM maxhanna.digcraft_worlds WHERE id=@wid", conn))
                            {
                                seedCmd.Parameters.AddWithValue("@wid", worldId);
                                var sr2 = await seedCmd.ExecuteScalarAsync(ct);
                                if (sr2 != null && sr2 != DBNull.Value) worldSeed = Convert.ToInt32(sr2);
                            }

                            // ── 4. Load all block changes in bbox ──
                            // level map: (wx,wy,wz) -> fluid level (1-8). 0 = not fluid.
                            // sourceSet: user-placed fluid (never mutated, always level SOURCE_LEVEL)
                            var levelMap = new Dictionary<(int, int, int), int>();
                            var fluidTypeMap = new Dictionary<(int, int, int), int>();
                            var sourceSet = new HashSet<(int, int, int)>();
                            var storedSourceSet = new HashSet<(int, int, int)>();
                            // allChanges: every changed block (for solid-neighbour lookup)
                            var allChanges = new Dictionary<(int, int, int), int>();

                            using (var chCmd = new MySqlCommand(@"
                                SELECT chunk_x, chunk_z, local_x, local_y, local_z, block_id,
                                       COALESCE(changed_by,0) AS changed_by,
                                       COALESCE(water_level, 8) AS water_level,
                                       COALESCE(fluid_is_source, 0) AS fluid_is_source
                                FROM maxhanna.digcraft_block_changes
                                WHERE world_id=@wid
                                  AND chunk_x BETWEEN @minCx AND @maxCx
                                  AND chunk_z BETWEEN @minCz AND @maxCz", conn))
                            {
                                chCmd.Parameters.AddWithValue("@wid", worldId);
                                chCmd.Parameters.AddWithValue("@minCx", minCx);
                                chCmd.Parameters.AddWithValue("@maxCx", maxCx);
                                chCmd.Parameters.AddWithValue("@minCz", minCz);
                                chCmd.Parameters.AddWithValue("@maxCz", maxCz);
                                using var cr = await chCmd.ExecuteReaderAsync(ct);
                                while (await cr.ReadAsync(ct))
                                {
                                    int cx2 = cr.GetInt32(0), cz2 = cr.GetInt32(1);
                                    int lx2 = cr.GetInt32(2), ly2 = cr.GetInt32(3), lz2 = cr.GetInt32(4);
                                    int bid2 = cr.GetInt32(5), changedBy = cr.GetInt32(6), wlvl = cr.GetInt32(7), isSourceFlag = cr.GetInt32(8);
                                    int wx2 = cx2 * CHUNK_SIZE + lx2, wz2 = cz2 * CHUNK_SIZE + lz2;
                                    allChanges[(wx2, ly2, wz2)] = bid2;
                                    if (bid2 == BlockIds.WATER || bid2 == BlockIds.LAVA)
                                    {
                                        int lvl = Math.Max(1, Math.Min(MAX_LEVEL, wlvl));
                                        var fpos = (wx2, ly2, wz2);
                                        levelMap[fpos] = lvl;
                                        fluidTypeMap[fpos] = bid2;
                                        if (isSourceFlag > 0) storedSourceSet.Add(fpos);
                                        // Only add to sourceSet if it's marked as a source - don't add every user-placed block.
                                        // This ensures spread water (not sources) doesn't become infinite.
                                        if (isSourceFlag > 0) sourceSet.Add((wx2, ly2, wz2));
                                    }
                                }
                            }

                            if (levelMap.Count == 0) continue;

                            var dirs4 = new (int dx, int dz)[] { (-1, 0), (0, -1), (0, 1), (1, 0) };
                            var dirs6 = new (int dx, int dy, int dz)[]
                            {
                                (-1, 0, 0), (1, 0, 0), (0, 0, -1), (0, 0, 1), (0, -1, 0), (0, 1, 0)
                            };

                            // ── 5. Simulate one tick (top-down, then left-right within each Y) ──
                            int GetBlockAt(int wx, int wy, int wz)
                            {
                                if (wy < 0 || wy >= WORLD_HEIGHT) return BlockIds.BEDROCK;
                                if (allChanges.TryGetValue((wx, wy, wz), out var bid)) return bid;
                                return GetBaseBlockId(worldSeed, wx, wy, wz);
                            }

                            bool IsReplaceableByFluid(int bid, int fluidType)
                            {
                                if (bid == fluidType) return true;
                                if (bid == BlockIds.AIR || bid == BlockIds.TALLGRASS || bid == BlockIds.SHRUB) return true;
                                return fluidType == BlockIds.WATER && bid == BlockIds.SEAWEED;
                            }

                            bool CanFluidOccupy(int wx, int wy, int wz, int fluidType) =>
                                wy >= 0 && wy < WORLD_HEIGHT && IsReplaceableByFluid(GetBlockAt(wx, wy, wz), fluidType);

                            bool IsSolidSupport(int wx, int wy, int wz)
                            {
                                if (wy < 0) return true;
                                int bid = GetBlockAt(wx, wy, wz);
                                return bid != BlockIds.AIR && bid != BlockIds.WATER && bid != BlockIds.LAVA
                                    && bid != BlockIds.TALLGRASS && bid != BlockIds.SHRUB && bid != BlockIds.SEAWEED;
                            }

                            var nextFluid = new Dictionary<(int x, int y, int z), (int type, int level, bool isSource)>();
                            var queue = new Queue<(int x, int y, int z, int type, int level)>();

                            bool TrySetFluid(int wx, int wy, int wz, int fluidType, int level, bool isSource)
                            {
                                if (!CanFluidOccupy(wx, wy, wz, fluidType)) return false;
                                var pos = (wx, wy, wz);
                                int nextLevel = Math.Max(1, Math.Min(MAX_LEVEL, level));
                                if (nextFluid.TryGetValue(pos, out var existing))
                                {
                                    if (existing.type != fluidType) return false;
                                    if (existing.level >= nextLevel && (!isSource || existing.isSource)) return false;
                                    nextFluid[pos] = (fluidType, Math.Max(existing.level, nextLevel), existing.isSource || isSource);
                                }
                                else
                                {
                                    nextFluid[pos] = (fluidType, nextLevel, isSource);
                                }
                                queue.Enqueue((wx, wy, wz, fluidType, nextLevel));
                                return true;
                            }

                            bool IsDurableWaterSource((int x, int y, int z) pos) =>
                                sourceSet.Contains(pos)
                                && fluidTypeMap.TryGetValue(pos, out var ftype)
                                && ftype == BlockIds.WATER;

                            foreach (var source in sourceSet)
                            {
                                if (!fluidTypeMap.TryGetValue(source, out var fluidType)) continue;
                                TrySetFluid(source.Item1, source.Item2, source.Item3, fluidType, SOURCE_LEVEL, true);
                            }

                            var infiniteCandidates = new HashSet<(int x, int y, int z)>();
                            foreach (var source in sourceSet)
                            {
                                if (!IsDurableWaterSource(source)) continue;
                                foreach (var (dx, dz) in dirs4)
                                    infiniteCandidates.Add((source.Item1 + dx, source.Item2, source.Item3 + dz));
                            }
                            foreach (var pos in infiniteCandidates)
                            {
                                if (!CanFluidOccupy(pos.x, pos.y, pos.z, BlockIds.WATER)) continue;
                                if (!IsSolidSupport(pos.x, pos.y - 1, pos.z)) continue;
                                int adjacentSources = 0;
                                foreach (var (dx, dz) in dirs4)
                                    if (IsDurableWaterSource((pos.x + dx, pos.y, pos.z + dz))) adjacentSources++;
                                if (adjacentSources >= 2)
                                    TrySetFluid(pos.x, pos.y, pos.z, BlockIds.WATER, SOURCE_LEVEL, false);
                            }

                            int volume = Math.Max(1, (box.maxX - box.minX + 1) * (box.maxY - box.minY + 1) * (box.maxZ - box.minZ + 1));
                            int maxProcessed = Math.Max(4096, volume * 4);
                            int processed = 0;

                            while (queue.Count > 0 && processed++ < maxProcessed)
                            {
                                var cur = queue.Dequeue();
                                if (cur.type == BlockIds.LAVA && (tickCounter % 4) != 0) continue;

                                if (cur.y > 0 && CanFluidOccupy(cur.x, cur.y - 1, cur.z, cur.type))
                                {
                                    TrySetFluid(cur.x, cur.y - 1, cur.z, cur.type, MAX_LEVEL, false);
                                    continue;
                                }

                                int decay = cur.type == BlockIds.LAVA ? 2 : 1;
                                int nextLevel = cur.level - decay;
                                if (nextLevel <= 0) continue;

                                foreach (var (dx, dz) in dirs4)
                                {
                                    int nx = cur.x + dx, nz = cur.z + dz;
                                    if (nx < box.minX - 1 || nx > box.maxX + 1 || nz < box.minZ - 1 || nz > box.maxZ + 1) continue;
                                    if (CanFluidOccupy(nx, cur.y, nz, cur.type))
                                        TrySetFluid(nx, cur.y, nz, cur.type, nextLevel, false);
                                }
                            }

                            var lavaToSolidify = new Dictionary<(int, int, int), int>();
                            var fluidToRemove = new HashSet<(int, int, int)>();

                            bool IsFluidAt((int x, int y, int z) pos, int fluidType)
                            {
                                if (nextFluid.TryGetValue(pos, out var fluid)) return fluid.type == fluidType;
                                return GetBlockAt(pos.x, pos.y, pos.z) == fluidType;
                            }

                            bool IsSourceFluid((int x, int y, int z) pos)
                            {
                                if (nextFluid.TryGetValue(pos, out var fluid) && fluid.isSource) return true;
                                return sourceSet.Contains(pos) || (!allChanges.ContainsKey(pos) && GetBlockAt(pos.x, pos.y, pos.z) == BlockIds.LAVA);
                            }

                            void MarkLavaSolid((int x, int y, int z) pos)
                            {
                                if (!IsFluidAt(pos, BlockIds.LAVA)) return;
                                lavaToSolidify[(pos.x, pos.y, pos.z)] = IsSourceFluid(pos) ? BlockIds.OBSIDIAN : BlockIds.COBBLESTONE;
                                fluidToRemove.Add((pos.x, pos.y, pos.z));
                            }

                            foreach (var (pos, fluid) in nextFluid.ToArray())
                            {
                                foreach (var (dx, dy, dz) in dirs6)
                                {
                                    var nb = (pos.x + dx, pos.y + dy, pos.z + dz);
                                    if (fluid.type == BlockIds.WATER && IsFluidAt(nb, BlockIds.LAVA))
                                    {
                                        MarkLavaSolid(nb);
                                        fluidToRemove.Add((pos.x, pos.y, pos.z)); // Remove water that touched lava
                                    }
                                    else if (fluid.type == BlockIds.LAVA && IsFluidAt(nb, BlockIds.WATER))
                                    {
                                        MarkLavaSolid(pos);
                                        fluidToRemove.Add((nb.Item1, nb.Item2, nb.Item3)); // Remove water that touched lava
                                    }
                                }
                            }

                            foreach (var pos in fluidToRemove)
                                nextFluid.Remove(pos);

                            var toUpsert = new List<(int wx, int wy, int wz, int blockId, int lvl, bool isSource)>();
                            var toDelete = new List<(int wx, int wy, int wz)>();

                            foreach (var (pos, fluid) in nextFluid)
                            {
                                bool oldTypeMatches = fluidTypeMap.TryGetValue(pos, out var oldType) && oldType == fluid.type;
                                bool oldLevelMatches = levelMap.TryGetValue(pos, out int oldLvl) && oldLvl == fluid.level;
                                bool oldSourceMatches = storedSourceSet.Contains(pos) == fluid.isSource;
                                if (!oldTypeMatches || !oldLevelMatches || !oldSourceMatches)
                                    toUpsert.Add((pos.x, pos.y, pos.z, fluid.type, fluid.level, fluid.isSource));
                            }

                            foreach (var (pos, _) in levelMap)
                            {
                                if (lavaToSolidify.ContainsKey(pos)) continue;
                                if (!nextFluid.ContainsKey(pos) && !sourceSet.Contains(pos))
                                    toDelete.Add((pos.Item1, pos.Item2, pos.Item3));
                            }


                            // Solidify lava blocks that were contacted by water
                            foreach (var (lpos, solidBlock) in lavaToSolidify)
                            {
                                GetStoredBlockCoords(lpos.Item1, lpos.Item2, lpos.Item3,
                                    out var lcx, out var lcz, out var llx, out var lly, out var llz);
                                try
                                {
                                    // Replace lava with solid block (cobblestone or obsidian)
                                    using var ins = new MySqlCommand(@"
                                    INSERT INTO maxhanna.digcraft_block_changes
                                        (world_id,chunk_x,chunk_z,local_x,local_y,local_z,block_id,changed_by,water_level,fluid_is_source,changed_at)
                                    VALUES (@wid,@cx,@cz,@lx,@ly,@lz,@bid,0,0,0,UTC_TIMESTAMP())
                                    ON DUPLICATE KEY UPDATE
                                        block_id=VALUES(block_id),
                                        water_level=0,
                                        fluid_is_source=0,
                                        changed_at=UTC_TIMESTAMP()", conn);
                                    ins.Parameters.AddWithValue("@wid", worldId);
                                    ins.Parameters.AddWithValue("@cx", lcx);
                                    ins.Parameters.AddWithValue("@cz", lcz);
                                    ins.Parameters.AddWithValue("@lx", llx);
                                    ins.Parameters.AddWithValue("@ly", lly);
                                    ins.Parameters.AddWithValue("@lz", llz);
                                    ins.Parameters.AddWithValue("@bid", solidBlock);
                                    await ins.ExecuteNonQueryAsync(ct);
                                }
                                catch { }
                            }

                            if (toUpsert.Count == 0 && toDelete.Count == 0) continue;

                            // Persist source-driven fluid changes with their computed type and height.
                            foreach (var (fx, fy, fz, ftype, flvl, fluidIsSource) in toUpsert)
                            {
                                GetStoredBlockCoords(fx, fy, fz, out var fcx, out var fcz, out var flx, out var fly, out var flz);
                                try
                                {
                                    using var ins = new MySqlCommand(@"
                                        INSERT INTO maxhanna.digcraft_block_changes
                                            (world_id,chunk_x,chunk_z,local_x,local_y,local_z,block_id,changed_by,water_level,fluid_is_source,changed_at)
                                        VALUES (@wid,@cx,@cz,@lx,@ly,@lz,@bid,0,@wlvl,@fluidIsSource,UTC_TIMESTAMP())
                                        ON DUPLICATE KEY UPDATE
                                            block_id=VALUES(block_id),
                                            water_level=VALUES(water_level),
                                            fluid_is_source=VALUES(fluid_is_source),
                                            changed_at=UTC_TIMESTAMP()", conn);
                                    ins.Parameters.AddWithValue("@wid", worldId);
                                    ins.Parameters.AddWithValue("@cx", fcx);
                                    ins.Parameters.AddWithValue("@cz", fcz);
                                    ins.Parameters.AddWithValue("@lx", flx);
                                    ins.Parameters.AddWithValue("@ly", fly);
                                    ins.Parameters.AddWithValue("@lz", flz);
                                    ins.Parameters.AddWithValue("@bid", ftype);
                                    ins.Parameters.AddWithValue("@wlvl", flvl);
                                    ins.Parameters.AddWithValue("@fluidIsSource", fluidIsSource ? 1 : 0);
                                    await ins.ExecuteNonQueryAsync(ct);
                                }
                                catch { }
                            }

                            foreach (var (dx, dy, dz) in toDelete)
                            {
                                GetStoredBlockCoords(dx, dy, dz, out var dcx, out var dcz, out var dlx, out var dly, out var dlz);

                                // Special rule: at lava level (world y <= 3), water always reverts to lava
                                if (dy <= 3) // At the bottom of nether where lava spawns
                                {
                                    // Restore as lava instead of deleting

                                    using var ins = new MySqlCommand(@"
                                        INSERT INTO maxhanna.digcraft_block_changes
                                            (world_id,chunk_x,chunk_z,local_x,local_y,local_z,block_id,changed_by,water_level,fluid_is_source,changed_at)
                                        VALUES (@wid,@cx,@cz,@lx,@ly,@lz,@bid,0,8,1,UTC_TIMESTAMP())
                                        ON DUPLICATE KEY UPDATE block_id=@bid, water_level=8, fluid_is_source=1, changed_at=UTC_TIMESTAMP()", conn);
                                    ins.Parameters.AddWithValue("@wid", worldId);
                                    ins.Parameters.AddWithValue("@cx", dcx);
                                    ins.Parameters.AddWithValue("@cz", dcz);
                                    ins.Parameters.AddWithValue("@lx", dlx);
                                    ins.Parameters.AddWithValue("@ly", dly);
                                    ins.Parameters.AddWithValue("@lz", dlz);
                                    ins.Parameters.AddWithValue("@bid", BlockIds.LAVA);
                                    await ins.ExecuteNonQueryAsync(ct);
                                    continue;
                                }

                                try
                                {
                                    using var del = new MySqlCommand(@"
                                        DELETE FROM maxhanna.digcraft_block_changes
                                        WHERE world_id=@wid AND chunk_x=@cx AND chunk_z=@cz
                                          AND local_x=@lx AND local_y=@ly AND local_z=@lz
                                          AND COALESCE(changed_by,0)=0", conn); // never delete user sources
                                    del.Parameters.AddWithValue("@wid", worldId);
                                    del.Parameters.AddWithValue("@cx", dcx);
                                    del.Parameters.AddWithValue("@cz", dcz);
                                    del.Parameters.AddWithValue("@lx", dlx);
                                    del.Parameters.AddWithValue("@ly", dly);
                                    del.Parameters.AddWithValue("@lz", dlz);
                                    await del.ExecuteNonQueryAsync(ct);
                                }
                                catch { }
                            }

                          //  _ = _log.Db($"FluidSim: world={worldId} upsert={toUpsert.Count} delete={toDelete.Count}", 0, "DIGCRAFT", true);
                        }
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        _ = _log.Db("FluidSimulationLoop error: " + ex.Message, null, "DIGCRAFT", true);
                    }
                }
            }
            catch (OperationCanceledException) { }
        }

        // Block lookup: changes override base terrain
        private static void GetStoredBlockCoords(int x, int y, int z, out int chunkX, out int chunkZ, out int localX, out int localY, out int localZ)
        {
            chunkX = (int)Math.Floor(x / (double)CHUNK_SIZE);
            chunkZ = (int)Math.Floor(z / (double)CHUNK_SIZE);
            localX = x - chunkX * CHUNK_SIZE;
            localZ = z - chunkZ * CHUNK_SIZE;
            localY = y % WORLD_HEIGHT;
            if (localY < 0) localY += WORLD_HEIGHT;
        }

        private async Task UpsertBlockChangeAsync(MySqlConnection conn, int worldId, int x, int y, int z, int blockId, CancellationToken ct)
        {
            GetStoredBlockCoords(x, y, z, out var chunkX, out var chunkZ, out var localX, out var localY, out var localZ);

            _ = _log.Db($"DB Upsert: ({worldId}) {x},{y},{z} -> {blockId}", null, "DIGCRAFT", false);

            using var cmd = new MySqlCommand(@"
                INSERT INTO maxhanna.digcraft_block_changes
                    (world_id, chunk_x, chunk_z, local_x, local_y, local_z, block_id, changed_at, planted_at)
                VALUES (@wid, @cx, @cz, @lx, @ly, @lz, @bid, UTC_TIMESTAMP(), NULL)
                ON DUPLICATE KEY UPDATE
                    block_id = VALUES(block_id),
                    changed_at = UTC_TIMESTAMP(),
                    planted_at = NULL", conn);
            cmd.Parameters.AddWithValue("@wid", worldId);
            cmd.Parameters.AddWithValue("@cx", chunkX);
            cmd.Parameters.AddWithValue("@cz", chunkZ);
            cmd.Parameters.AddWithValue("@lx", localX);
            cmd.Parameters.AddWithValue("@ly", localY);
            cmd.Parameters.AddWithValue("@lz", localZ);
            cmd.Parameters.AddWithValue("@bid", blockId);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        private async Task UpsertBlockChangeForRegrowAsync(MySqlConnection conn, int worldId, int x, int y, int z, int blockId, CancellationToken ct, int delaySeconds = 0)
        {
            GetStoredBlockCoords(x, y, z, out var chunkX, out var chunkZ, out var localX, out var localY, out var localZ);
            var plantedAt = delaySeconds > 0
                ? $"DATE_ADD(UTC_TIMESTAMP(), INTERVAL {delaySeconds} SECOND)"
                : "UTC_TIMESTAMP()";

            _ = _log.Db($"DB UpsertForRegrow: ({worldId}) {x},{y},{z} -> {blockId} (delay={delaySeconds}s)", null, "DIGCRAFT", false);

            using var cmd = new MySqlCommand($@"
                INSERT INTO maxhanna.digcraft_block_changes
                    (world_id, chunk_x, chunk_z, local_x, local_y, local_z, block_id, changed_at, planted_at)
                VALUES (@wid, @cx, @cz, @lx, @ly, @lz, @bid, UTC_TIMESTAMP(), {plantedAt})
                ON DUPLICATE KEY UPDATE
                    block_id = VALUES(block_id),
                    changed_at = UTC_TIMESTAMP(),
                    planted_at = {plantedAt}", conn);
            cmd.Parameters.AddWithValue("@wid", worldId);
            cmd.Parameters.AddWithValue("@cx", chunkX);
            cmd.Parameters.AddWithValue("@cz", chunkZ);
            cmd.Parameters.AddWithValue("@lx", localX);
            cmd.Parameters.AddWithValue("@ly", localY);
            cmd.Parameters.AddWithValue("@lz", localZ);
            cmd.Parameters.AddWithValue("@bid", blockId);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        private async Task ClearPlantedMarkerAsync(MySqlConnection conn, int worldId, int x, int y, int z, CancellationToken ct)
        {
            GetStoredBlockCoords(x, y, z, out var chunkX, out var chunkZ, out var localX, out var localY, out var localZ);

            using var sel = new MySqlCommand(@"
                SELECT block_id FROM maxhanna.digcraft_block_changes
                WHERE world_id = @wid AND chunk_x = @cx AND chunk_z = @cz
                  AND local_x = @lx AND local_y = @ly AND local_z = @lz", conn);
            sel.Parameters.AddWithValue("@wid", worldId);
            sel.Parameters.AddWithValue("@cx", chunkX);
            sel.Parameters.AddWithValue("@cz", chunkZ);
            sel.Parameters.AddWithValue("@lx", localX);
            sel.Parameters.AddWithValue("@ly", localY);
            sel.Parameters.AddWithValue("@lz", localZ);
            var res = await sel.ExecuteScalarAsync(ct);
            var existing = (res == null || res == DBNull.Value) ? -1 : Convert.ToInt32(res);
            _ = _log.Db($"ClearPlantedMarker: ({worldId}) {x},{y},{z} currentDbBid={existing}", null, "DIGCRAFT", false);

            using var upd = new MySqlCommand(@"
                UPDATE maxhanna.digcraft_block_changes
                SET planted_at = NULL, changed_at = UTC_TIMESTAMP()
                WHERE world_id = @wid AND chunk_x = @cx AND chunk_z = @cz
                  AND local_x = @lx AND local_y = @ly AND local_z = @lz", conn);
            upd.Parameters.AddWithValue("@wid", worldId);
            upd.Parameters.AddWithValue("@cx", chunkX);
            upd.Parameters.AddWithValue("@cz", chunkZ);
            upd.Parameters.AddWithValue("@lx", localX);
            upd.Parameters.AddWithValue("@ly", localY);
            upd.Parameters.AddWithValue("@lz", localZ);
            await upd.ExecuteNonQueryAsync(ct);
        }

        private async Task<int> GetExactBlockAtAsync(MySqlConnection conn, int worldId, int chunkX, int chunkZ, int localX, int localY, int localZ, int worldSeed, MySqlTransaction? tx = null)
        {
            const string sql = @"
                SELECT block_id FROM maxhanna.digcraft_block_changes
                WHERE world_id = @wid AND chunk_x = @cx AND chunk_z = @cz
                AND local_x = @lx AND local_y = @ly AND local_z = @lz";

            using var cmd = new MySqlCommand(sql, conn, tx);
            cmd.CommandTimeout = 30;
            cmd.Parameters.AddWithValue("@wid", worldId);
            cmd.Parameters.AddWithValue("@cx", chunkX);
            cmd.Parameters.AddWithValue("@cz", chunkZ);
            cmd.Parameters.AddWithValue("@lx", localX);
            cmd.Parameters.AddWithValue("@ly", localY);
            cmd.Parameters.AddWithValue("@lz", localZ);
            object? result = await cmd.ExecuteScalarAsync();

            if (result != null && result != DBNull.Value)
            {
                return Convert.ToInt32(result);
            }

            // Convert chunk+local to world coords for GetBaseBlockId
            int worldX = chunkX * CHUNK_SIZE + localX;
            int worldY = localY; // already world Y
            int worldZ = chunkZ * CHUNK_SIZE + localZ;
            int baseBlockId = GetBaseBlockId(worldSeed, worldX, worldY, worldZ);
            _ = _log.Db($"GetExactBlockAtAsync: DB miss at cx={chunkX}, cz={chunkZ}, lx={localX}, ly={localY}, lz={localZ} -> GetBaseBlockId({worldSeed}, {worldX}, {worldY}, {worldZ}) = {baseBlockId}", null, "DIGCRAFT", true);
            return baseBlockId;
        }

        private async Task<int> GetBlockAtAsync(MySqlConnection conn, int worldId, int x, int y, int z, int worldSeed, MySqlTransaction? tx = null, bool recalculateCoords = true)
        {
            int tmpChunkX = x;
            int tmpChunkZ = z;
            int tmpLocalX = x;
            int tmpLocalY = y;
            int tmpLocalZ = z;
            if (recalculateCoords)
            {
                GetStoredBlockCoords(x, y, z, out var chunkX, out var chunkZ, out var localX, out var localY, out var localZ);
                tmpChunkX = chunkX;
                tmpChunkZ = chunkZ;
                tmpLocalX = localX;
                tmpLocalY = localY;
                tmpLocalZ = localZ;
            }
            const string sql = @"
                SELECT block_id FROM maxhanna.digcraft_block_changes
                WHERE world_id = @wid AND chunk_x = @cx AND chunk_z = @cz
                AND local_x = @lx AND local_y = @ly AND local_z = @lz";

            using var cmd = new MySqlCommand(sql, conn, tx);
            cmd.CommandTimeout = 30;
            cmd.Parameters.AddWithValue("@wid", worldId);
            cmd.Parameters.AddWithValue("@cx", tmpChunkX);
            cmd.Parameters.AddWithValue("@cz", tmpChunkZ);
            cmd.Parameters.AddWithValue("@lx", tmpLocalX);
            cmd.Parameters.AddWithValue("@ly", tmpLocalY);
            cmd.Parameters.AddWithValue("@lz", tmpLocalZ);
            object? result = await cmd.ExecuteScalarAsync();

            if (result != null && result != DBNull.Value) return Convert.ToInt32(result);
            return GetBaseBlockId(worldSeed, x, y, z);
        }

        [HttpPost("PlaceBonfire")]
        public async Task<IActionResult> PlaceBonfire([FromBody] PlaceBonfireRequest req)
        {
            var userId = req.UserId;
            var worldId = req.WorldId;
            var x = req.X;
            var y = req.Y;
            var z = req.Z;
            // Persist to database
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var countCmd = new MySqlCommand("SELECT COUNT(*) FROM maxhanna.digcraft_bonfires WHERE world_id = @worldId", conn);
                countCmd.Parameters.AddWithValue("@worldId", worldId);
                var count = Convert.ToInt32(await countCmd.ExecuteScalarAsync()) + 1;

                await using var insertCmd = new MySqlCommand(@"
                    INSERT INTO maxhanna.digcraft_bonfires (user_id, world_id, x, y, z, nickname, created_at)
                    VALUES (@userId, @worldId, @x, @y, @z, @nickname, @createdAt)", conn);
                insertCmd.Parameters.AddWithValue("@userId", userId);
                insertCmd.Parameters.AddWithValue("@worldId", worldId);
                insertCmd.Parameters.AddWithValue("@x", x);
                insertCmd.Parameters.AddWithValue("@y", y);
                insertCmd.Parameters.AddWithValue("@z", z);
                insertCmd.Parameters.AddWithValue("@nickname", "Bonfire " + count);
                insertCmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
                await insertCmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Failed to persist bonfire: {ex.Message}", null, "DIGCRAFT", outputToConsole: true);
            }

            return Ok(new { success = true });
        }

        [HttpGet("GetBonfires")]
        public async Task<IActionResult> GetBonfires(int worldId, int userId)
        {
            List<Bonfire> bonfires = new List<Bonfire>();
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();
                await using var cmd = new MySqlCommand("SELECT id, user_id, x, y, z, nickname FROM maxhanna.digcraft_bonfires WHERE world_id = @worldId AND user_id = @userId", conn);
                cmd.Parameters.AddWithValue("@worldId", worldId);
                cmd.Parameters.AddWithValue("@userId", userId);
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    bonfires.Add(new Bonfire
                    {
                        Id = reader.GetInt32(0),
                        UserId = reader.GetInt32(1),
                        X = reader.GetInt32(2),
                        Y = reader.GetInt32(3),
                        Z = reader.GetInt32(4),
                        Nickname = reader.IsDBNull(5) ? "Bonfire" : reader.GetString(5)
                    });
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Failed to load bonfires from database: {ex.Message}", null, "DIGCRAFT", true);
            }


            var result = bonfires
                .Select(b => new { id = b.Id, x = b.X, y = b.Y, z = b.Z, nickname = b.Nickname })
                .ToList();

            return Ok(result);
        }

        [HttpPost("RenameBonfire")]
        public async Task<IActionResult> RenameBonfire([FromBody] RenameBonfireRequest req)
        {
            if (req == null || req.WorldId <= 0 || req.BonfireId <= 0 || req.UserId <= 0) return Ok(new { success = false });

            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Verify bonfire exists and is owned by the user
                using (var chkCmd = new MySqlCommand("SELECT user_id FROM maxhanna.digcraft_bonfires WHERE id = @id AND world_id = @wid", conn))
                {
                    chkCmd.Parameters.AddWithValue("@id", req.BonfireId);
                    chkCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    var owner = await chkCmd.ExecuteScalarAsync();
                    if (owner == null || owner == DBNull.Value) return Ok(new { success = false });
                    if (Convert.ToInt32(owner) != req.UserId) return Ok(new { success = false });
                }

                // Persist to database
                await using (var updateCmd = new MySqlCommand("UPDATE maxhanna.digcraft_bonfires SET nickname = @nickname WHERE id = @id", conn))
                {
                    updateCmd.Parameters.AddWithValue("@nickname", req.Nickname ?? string.Empty);
                    updateCmd.Parameters.AddWithValue("@id", req.BonfireId);
                    await updateCmd.ExecuteNonQueryAsync();
                }

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Failed to update bonfire nickname: {ex.Message}", req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        [HttpPost("DeleteBonfire")]
        public async Task<IActionResult> DeleteBonfire([FromBody] DeleteBonfireRequest req)
        {
            if (req == null || req.BonfireId <= 0 || req.UserId <= 0) return Ok(new { success = false });
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Verify ownership before deleting
                using (var chkCmd = new MySqlCommand(
                    "SELECT user_id FROM maxhanna.digcraft_bonfires WHERE id = @id AND world_id = @wid", conn))
                {
                    chkCmd.Parameters.AddWithValue("@id", req.BonfireId);
                    chkCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    var owner = await chkCmd.ExecuteScalarAsync();
                    if (owner == null || owner == DBNull.Value) return Ok(new { success = false });
                    if (Convert.ToInt32(owner) != req.UserId) return Ok(new { success = false });
                }

                await using var deleteCmd = new MySqlCommand(
                    "DELETE FROM maxhanna.digcraft_bonfires WHERE id = @id AND user_id = @uid", conn);
                deleteCmd.Parameters.AddWithValue("@id", req.BonfireId);
                deleteCmd.Parameters.AddWithValue("@uid", req.UserId);
                await deleteCmd.ExecuteNonQueryAsync();

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Failed to delete bonfire: {ex.Message}", req.UserId, "DIGCRAFT", outputToConsole: true);
                return StatusCode(500, "Internal error");
            }
        }

        [HttpPost("PlaceChest")]
        public async Task<IActionResult> PlaceChest([FromBody] PlaceChestRequest req)
        {
            var userId = req.UserId;
            var worldId = req.WorldId;
            var x = req.X;
            var y = req.Y;
            var z = req.Z;


            int persistedChestId = 0;

            // Try to persist to database letting the DB assign the id (preferred).
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();
                await using var insertCmd = new MySqlCommand(@"
                    INSERT INTO maxhanna.digcraft_chests (user_id, world_id, x, y, z, nickname, created_at)
                    VALUES (@userId, @worldId, @x, @y, @z, 'Chest', @createdAt)", conn);
                insertCmd.Parameters.AddWithValue("@userId", userId);
                insertCmd.Parameters.AddWithValue("@worldId", worldId);
                insertCmd.Parameters.AddWithValue("@x", x);
                insertCmd.Parameters.AddWithValue("@y", y);
                insertCmd.Parameters.AddWithValue("@z", z);
                insertCmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
                await insertCmd.ExecuteNonQueryAsync();

                // Fetch the auto-assigned id
                await using var idCmd = new MySqlCommand("SELECT LAST_INSERT_ID()", conn);
                var idObj = await idCmd.ExecuteScalarAsync();
                if (idObj != null && int.TryParse(idObj.ToString(), out var idVal) && idVal > 0)
                {
                    persistedChestId = idVal;
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Failed to persist chest (initial attempt): {ex.Message}", null, "DIGCRAFT", outputToConsole: true);
            }

            return Ok(new { success = true, id = persistedChestId });
        }

        [HttpGet("GetChests")]
        public async Task<IActionResult> GetChests(int worldId, int userId)
        {
            List<Chest> chests = new List<Chest>();


            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();
                await using var cmd = new MySqlCommand("SELECT c.id, c.user_id, c.x, c.y, c.z, c.nickname, COALESCE(i.item_id, 0) AS item_id, COALESCE(i.quantity, 0) AS quantity FROM maxhanna.digcraft_chests c LEFT JOIN maxhanna.digcraft_chest_items i ON c.id = i.chest_id WHERE c.world_id = @worldId", conn);
                cmd.Parameters.AddWithValue("@worldId", worldId);
                await using var reader = await cmd.ExecuteReaderAsync();
                var chestDict = new Dictionary<int, Chest>();
                while (await reader.ReadAsync())
                {
                    var chestId = reader.GetInt32(0);
                    if (!chestDict.TryGetValue(chestId, out var chest))
                    {
                        chest = new Chest
                        {
                            Id = chestId,
                            UserId = reader.GetInt32(1),
                            X = reader.GetInt32(2),
                            Y = reader.GetInt32(3),
                            Z = reader.GetInt32(4),
                            Nickname = reader.IsDBNull(5) ? "Chest" : reader.GetString(5),
                            Items = new List<ChestItem>()
                        };
                        chestDict[chestId] = chest;
                        chests.Add(chest);
                    }
                    var itemId = reader.GetInt32(6);
                    var quantity = reader.GetInt32(7);
                    if (itemId > 0 && quantity > 0)
                    {
                        chest.Items.Add(new ChestItem { ItemId = itemId, Quantity = quantity });
                    }
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Failed to load chests from database: {ex.Message}", null, "DIGCRAFT", true);
            }

            // Return all chests (not filtered by userId) so everyone can see shared chests
            var result = chests
                .Select(c => new { id = c.Id, userId = c.UserId, x = c.X, y = c.Y, z = c.Z, nickname = c.Nickname, items = c.Items.Select(i => new { itemId = i.ItemId, quantity = i.Quantity }).ToList() })
                .ToList();

            return Ok(result);
        }

        [HttpGet("GetChest")]
        public async Task<IActionResult> GetChest(int worldId, int userId, int x, int y, int z)
        {
            // Look in database for a chest at this position
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();
                int worldSeed = 42;
                // First try to find existing chest at this position
                using (var cmd = new MySqlCommand(@"
                    SELECT c.id, c.nickname, i.item_id, i.quantity
                    FROM maxhanna.digcraft_chests c
                    LEFT JOIN maxhanna.digcraft_chest_items i ON c.id = i.chest_id
                    WHERE c.world_id = @wid AND c.x = @x AND c.y = @y AND c.z = @z", conn))
                {
                    cmd.Parameters.AddWithValue("@wid", worldId);
                    cmd.Parameters.AddWithValue("@x", x);
                    cmd.Parameters.AddWithValue("@y", y);
                    cmd.Parameters.AddWithValue("@z", z);

                    using var reader = await cmd.ExecuteReaderAsync();
                    int? chestId = null;
                    string nickname = "Chest";
                    var items = new List<object>();

                    while (await reader.ReadAsync())
                    {
                        if (chestId == null)
                        {
                            chestId = reader.GetInt32(0);
                            nickname = reader.IsDBNull(1) ? "Chest" : reader.GetString(1);
                        }
                        int? itemId = reader.IsDBNull(2) ? (int?)null : reader.GetInt32(2);
                        int? quantity = reader.IsDBNull(3) ? (int?)null : reader.GetInt32(3);
                        if (itemId.GetValueOrDefault() > 0 && quantity.GetValueOrDefault() > 0)
                        {
                            items.Add(new { itemId = itemId.GetValueOrDefault(), quantity = quantity.GetValueOrDefault() });
                        }
                    }

                    if (chestId != null)
                    {
                        // Sunken chest with no loot yet — generate loot
                        if (nickname == "Sunken Chest" && items.Count == 0)
                        {
                            await reader.CloseAsync();
                            // Derive a per-chest seed from the world seed so loot is stable per-chest
                            var perChestSeed = worldSeed * 31337 + x * 7 + z * 3;
                            var loot = GenerateSunkenChestLoot(perChestSeed);
                            await using var lootConn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                            await lootConn.OpenAsync();
                            foreach (var lootItem in loot)
                            {
                                await using var insertLoot = new MySqlCommand(@"
                                    INSERT INTO maxhanna.digcraft_chest_items (chest_id, item_id, quantity)
                                    VALUES (@cid, @iid, @qty)", lootConn);
                                insertLoot.Parameters.AddWithValue("@cid", chestId.Value);
                                insertLoot.Parameters.AddWithValue("@iid", lootItem.ItemId);
                                insertLoot.Parameters.AddWithValue("@qty", lootItem.Quantity);
                                await insertLoot.ExecuteNonQueryAsync();
                            }
                            items = loot.Cast<object>().ToList();
                        }
                        return Ok(new { id = chestId, x, y, z, nickname, items });
                    }
                }

                // No chest found at this position - create a DB row for this chest so client can open it
                try
                {
                    // Determine whether this location is underwater (sunken chest)
                    int blockAbove = await GetBlockAtAsync(conn, worldId, x, y + 1, z, worldSeed);
                    bool isSunken = blockAbove == BlockIds.WATER;
                    var newNickname = isSunken ? "Sunken Chest" : "Chest";

                    await using var insertCmd = new MySqlCommand(@"
                        INSERT INTO maxhanna.digcraft_chests (user_id, world_id, x, y, z, nickname, created_at)
                        VALUES (@userId, @wid, @x, @y, @z, @nickname, @createdAt)", conn);
                    insertCmd.Parameters.AddWithValue("@userId", userId);
                    insertCmd.Parameters.AddWithValue("@wid", worldId);
                    insertCmd.Parameters.AddWithValue("@x", x);
                    insertCmd.Parameters.AddWithValue("@y", y);
                    insertCmd.Parameters.AddWithValue("@z", z);
                    insertCmd.Parameters.AddWithValue("@nickname", newNickname);
                    insertCmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
                    await insertCmd.ExecuteNonQueryAsync();

                    await using var idCmd = new MySqlCommand("SELECT LAST_INSERT_ID()", conn);
                    var idObj = await idCmd.ExecuteScalarAsync();
                    var newId = 0;
                    if (idObj != null && int.TryParse(idObj.ToString(), out var parsedId) && parsedId > 0)
                    {
                        newId = parsedId;
                    }

                    return Ok(new { id = newId, x, y, z, nickname = newNickname, items = new List<object>() });

                }
                catch (Exception ex)
                {
                    _ = _log.Db($"Failed to create chest on get: {ex.Message}", userId, "DIGCRAFT", true);
                }

                // If creation failed, fall back to returning empty so client can handle gracefully
                return Ok(new { id = 0, x, y, z, nickname = "", items = new List<object>() });
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Failed to get chest: {ex.Message}", userId, "DIGCRAFT", true);
                return StatusCode(500, "Failed to get chest");
            }
        }

        [HttpPost("RenameChest")]
        public async Task<IActionResult> RenameChest([FromBody] RenameChestRequest req)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();
                await using var updateCmd = new MySqlCommand("UPDATE maxhanna.digcraft_chests SET nickname = @nickname WHERE id = @id", conn);
                updateCmd.Parameters.AddWithValue("@nickname", req.Nickname);
                updateCmd.Parameters.AddWithValue("@id", req.ChestId);
                await updateCmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Failed to update chest nickname: {ex.Message}", null, "DIGCRAFT", outputToConsole: true);
            }

            return Ok(new { success = true });
        }

        [HttpPost("DeleteChest")]
        public async Task<IActionResult> DeleteChest([FromBody] DeleteChestRequest req)
        {
            // Delete from database
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();
                await using var deleteCmd = new MySqlCommand("DELETE FROM maxhanna.digcraft_chests WHERE id = @id", conn);
                deleteCmd.Parameters.AddWithValue("@id", req.ChestId);
                await deleteCmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Failed to delete chest: {ex.Message}", null, "DIGCRAFT", outputToConsole: true);
            }

            return Ok(new { success = true });
        }

        [HttpPost("UpdateChestItems")]
        public async Task<IActionResult> UpdateChestItems([FromBody] UpdateChestItemsRequest req)
        {

            //    _ = _log.Db($"UpdateChestItems called: user={req?.UserId ?? 0}, world={req?.WorldId ?? 0}, chest={req?.ChestId ?? 0}, items={(req?.Items==null?0:req.Items.Count)}", req?.UserId ?? 0, "DIGCRAFT", true);


            if (req == null || req.WorldId <= 0 || req.ChestId <= 0) return Ok(new { success = false });

            Chest? chest = null;

            // Persist to database (verify chest exists) and update in-memory state
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Verify chest exists in DB and load minimal metadata if needed
                using (var chkCmd = new MySqlCommand("SELECT id, user_id, x, y, z, nickname FROM maxhanna.digcraft_chests WHERE id = @id AND world_id = @wid", conn))
                {
                    chkCmd.Parameters.AddWithValue("@id", req.ChestId);
                    chkCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    using var r = await chkCmd.ExecuteReaderAsync();
                    if (!await r.ReadAsync())
                    {
                        return Ok(new { success = false });
                    }
                    if (chest == null)
                    {
                        chest = new Chest
                        {
                            Id = r.GetInt32(0),
                            UserId = r.IsDBNull(1) ? 0 : r.GetInt32(1),
                            WorldId = req.WorldId,
                            X = r.IsDBNull(2) ? 0 : r.GetInt32(2),
                            Y = r.IsDBNull(3) ? 0 : r.GetInt32(3),
                            Z = r.IsDBNull(4) ? 0 : r.GetInt32(4),
                            Nickname = r.IsDBNull(5) ? "Chest" : r.GetString(5),
                            Items = new List<ChestItem>()
                        };
                    }
                    await r.CloseAsync();
                }

                // Delete existing items
                await using var deleteCmd = new MySqlCommand("DELETE FROM maxhanna.digcraft_chest_items WHERE chest_id = @id", conn);
                deleteCmd.Parameters.AddWithValue("@id", req.ChestId);
                await deleteCmd.ExecuteNonQueryAsync();

                // Insert new items (if any)
                if (req.Items != null)
                {
                    foreach (var item in req.Items.Where(i => i.ContainsKey("quantity") && i["quantity"] > 0))
                    {
                        await using var insertCmd = new MySqlCommand(@"
                            INSERT INTO maxhanna.digcraft_chest_items (chest_id, item_id, quantity) 
                            VALUES (@chestId, @itemId, @quantity)", conn);
                        insertCmd.Parameters.AddWithValue("@chestId", req.ChestId);
                        insertCmd.Parameters.AddWithValue("@itemId", item.ContainsKey("itemId") ? item["itemId"] : 0);
                        insertCmd.Parameters.AddWithValue("@quantity", item["quantity"]);
                        await insertCmd.ExecuteNonQueryAsync();
                    }
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Failed to update chest items: {ex.Message}", null, "DIGCRAFT", outputToConsole: true);
                return StatusCode(500, "Internal error");
            }

            return Ok(new { success = true });
        }
    }

    // Request classes for bonfire endpoints
    public class PlaceBonfireRequest
    {
        public int UserId { get; set; }
        public int WorldId { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
        public int Z { get; set; }
    }

    public class RenameBonfireRequest
    {
        public int UserId { get; set; }
        public int WorldId { get; set; }
        public int BonfireId { get; set; }
        public string Nickname { get; set; } = string.Empty;
    }

    public class DeleteBonfireRequest
    {
        public int UserId { get; set; }
        public int WorldId { get; set; }
        public int BonfireId { get; set; }
    }

    // Request classes for chest endpoints
    public class PlaceChestRequest
    {
        public int UserId { get; set; }
        public int WorldId { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
        public int Z { get; set; }
    }

    public class RenameChestRequest
    {
        public int UserId { get; set; }
        public int WorldId { get; set; }
        public int ChestId { get; set; }
        public string Nickname { get; set; } = string.Empty;
    }

    public class DeleteChestRequest
    {
        public int UserId { get; set; }
        public int WorldId { get; set; }
        public int ChestId { get; set; }
    }

    public class UpdateChestItemsRequest
    {
        public int UserId { get; set; }
        public int WorldId { get; set; }
        public int ChestId { get; set; }
        public List<Dictionary<string, int>> Items { get; set; } = new();
    }

    public class AddKnownRecipeRequest
    {
        public int UserId { get; set; }
        public int RecipeId { get; set; }
    }
}
