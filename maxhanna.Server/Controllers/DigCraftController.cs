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
        private const int MIN_SEA_LEVEL_Y = -20; // minimum Y level water can flow down to (relative to overworld base)
        private const int INACTIVITY_TIMEOUT_SECONDS = 15; // how long after last attack before health regen can start
        private const float PLAYER_ATTACK_MAX_RANGE = 2.5f;
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

        // Chests are persisted in the database only; no server-side in-memory cache.

        private class Bonfire
        {
            public int Id;
            public int UserId;
            public int WorldId;
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
                        "Wolf", "Bear", "Deer", "Frog", "Axolotl", "Turtle", "Dolphin", "Horse", "Rabbit"
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
                        var hostile = t == "Zombie" || t == "Skeleton" || t == "WitherSkeleton" || t == "Blaze" || t == "Ghast" || t == "Hoglin";
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
                            "Ghast" => 10,
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
                            "Ghast" => 0.8f,
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
                if (worldY == 0)
                {
                    return BlockIds.BEDROCK;
                }
                if (worldY == 1)
                {
                    return BlockIds.LAVA;
                }
                // Simplified: treat as netherrack (server doesn't need full Nether detail for mob/spawn logic)
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
                return BlockIds.AIR;

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

        private int GetBlockAt(MySqlConnection conn, int worldId, int x, int y, int z, int worldSeed)
        {
            GetStoredBlockCoords(x, y, z, out var chunkX, out var chunkZ, out var localX, out var localY, out var localZ);
            using var cmd = new MySqlCommand(@"
                SELECT block_id FROM maxhanna.digcraft_block_changes
                WHERE world_id = @wid AND chunk_x = @cx AND chunk_z = @cz
                AND local_x = @lx AND local_y = @ly AND local_z = @lz", conn);
            cmd.Parameters.AddWithValue("@wid", worldId);
            cmd.Parameters.AddWithValue("@cx", chunkX);
            cmd.Parameters.AddWithValue("@cz", chunkZ);
            cmd.Parameters.AddWithValue("@lx", localX);
            cmd.Parameters.AddWithValue("@ly", localY);
            cmd.Parameters.AddWithValue("@lz", localZ);
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
                                        var isOceanBiome = false; var isPlainsBiome = false;
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
                                            isPlainsBiome = col2.Biome == BiomeIds.PLAINS || col2.Biome == BiomeIds.SUNFLOWER_PLAINS || col2.Biome == BiomeIds.MEADOW || col2.Biome == BiomeIds.CHERRY_GROVE;
                                        }
                                        catch { }

                                        string t;
                                        if (isNetherSpawn)
                                        {
                                            var netherTypes = new[] { "Blaze", "WitherSkeleton", "Ghast", "Strider", "Hoglin" };
                                            t = netherTypes[rng.Next(netherTypes.Length)];
                                        }
                                        else if (isDayNow)
                                        {
                                            var r2 = rng.NextDouble();
                                            if (isHotBiome) t = r2 > 0.5 ? "Camel" : "Armadillo";
                                            else if (isMountainBiome || isHighAlt) t = r2 > 0.5 ? "Goat" : "Llama";
                                            else if (isJungleBiome) t = r2 > 0.5 ? "Parrot" : "Ocelot";
                                            else if (isSnowyBiome) t = r2 > 0.5 ? "PolarBear" : "Fox";
                                            else if (isForestBiome) t = r2 > 0.5 ? "Wolf" : (r2 > 0.25 ? "Deer" : "Bear");
                                            else if (isSwampBiome) t = r2 > 0.5 ? "Frog" : "Axolotl";
                                            else if (isOceanBiome)
                                            {
                                                // Dolphins spawn at water surface, turtles on beach/land
                                                if (topY >= SEA_LEVEL - 2 && topY <= SEA_LEVEL + 2)
                                                {
                                                    t = r2 > 0.5 ? "Turtle" : "Dolphin";
                                                }
                                                else if (topY < SEA_LEVEL)
                                                {
                                                    t = "Dolphin"; // In water - dolphin
                                                }
                                                else
                                                {
                                                    t = "Turtle"; // On land - turtle
                                                }
                                            }
                                            else if (isPlainsBiome) t = r2 > 0.5 ? "Horse" : "Rabbit";
                                            else t = typesDay[rng.Next(typesDay.Length)];
                                        }
                                        else
                                        {
                                            t = typesNight[rng.Next(typesNight.Length)];
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

                                        // Troglodites spawn in caves at night
                                        if (isInCave && !isNetherSpawn && !isDayNow)
                                        {
                                            t = "Troglodite";
                                        }

                                        var hostile = t == "Zombie" || t == "Skeleton" || t == "WitherSkeleton" || t == "Blaze" || t == "Ghast" || t == "Hoglin";
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
                                            "Frog" => 10,
                                            "Bear" => 30,
                                            "Rabbit" => 3,
                                            "Parrot" => 6,
                                            "Troglodite" => 15,
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
                                            "Rabbit" => 1.3f,
                                            "Camel" => 0.7f,
                                            "Strider" => 0.6f,
                                            "Ghast" => 0.8f,
                                            "Troglodite" => 0.8f,
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

                                // Simple AI: find nearest player within aggro range

                                if (best.userId != 0 && mob.Hostile && Math.Sqrt(bestDist2) <= 12.0)
                                {
                                    // horizontal delta
                                    var dx = best.x - mob.PosX; var dz = best.z - mob.PosZ;
                                    // vertical delta to consider full 3D distance for attack checks
                                    var dy = best.y - mob.PosY;
                                    var distXZ = (float)Math.Sqrt(Math.Max(1e-6, dx * dx + dz * dz));
                                    var dist3 = (float)Math.Sqrt(Math.Max(1e-6, dx * dx + dy * dy + dz * dz));
                                    var step = mob.Speed * tickSec;
                                    // move horizontally towards player, but avoid overlapping players or other mobs
                                    var dirX = dx / Math.Max(1e-6f, distXZ);
                                    var dirZ = dz / Math.Max(1e-6f, distXZ);
                                    var tryFracs = new float[] { 1.0f, 0.6f, 0.35f, 0.15f };
                                    foreach (var f in tryFracs)
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
                                    // always update yaw to face direction
                                    mob.Yaw = (float)Math.Atan2(-dirX, -dirZ);

                                    // mark as active
                                    mob.LastActiveMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                                    // Attack if close
                                    const float attackRange = 1.0f;
                                    if (dist3 <= attackRange)
                                    {
                                        if ((DateTime.UtcNow - mob.LastAttackAt).TotalMilliseconds >= 900)
                                        {
                                            mob.LastAttackAt = DateTime.UtcNow;
                                            // Snap mob to be adjacent to the player so damage visually originates nearby
                                            const float attackOffset = 0.9f;
                                            if (distXZ > 0.001f)
                                            {
                                                mob.PosX = best.x - (dx / distXZ) * attackOffset;
                                                mob.PosZ = best.z - (dz / distXZ) * attackOffset;
                                            }
                                            else
                                            {
                                                mob.PosX = best.x + attackOffset;
                                                mob.PosZ = best.z;
                                            }
                                            // Align vertically to the player's Y - but clamp to max 1 block per tick to prevent huge jumps
                                            // This prevents the 3-block teleportation issue while allowing mobs to climb toward players
                                            var verticalDiff = best.y - mob.PosY;
                                            if (Math.Abs(verticalDiff) > 1.0f)
                                            {
                                                // Move at most 1 block toward the player (gradual climbing/descent)
                                                mob.PosY += Math.Sign(verticalDiff) * 1.0f;
                                            }
                                            else
                                            {
                                                // Close enough, snap to player height
                                                mob.PosY = best.y;
                                            }
                                            // Apply damage to player via same logic as MobAttack endpoint
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
                                                if (!PositionBlockedByEntity(candX, candZ, players, mobs, mob.Id))
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

                                        // Align mob to ground surface during wander - prevent large Y jumps by clamping to max 1 block
                                        var targetGroundY = GetTopSolidBlockY(worldSeed, (int)mob.PosX, (int)mob.PosZ, null) + 1 + 1.6f;
                                        var groundDiff = targetGroundY - mob.PosY;
                                        if (Math.Abs(groundDiff) > 1.0f)
                                        {
                                            // Move at most 1 block toward ground level (gradual descent/ascent)
                                            mob.PosY += Math.Sign(groundDiff) * 1.0f;
                                        }
                                        else if (Math.Abs(groundDiff) > 0.01f)
                                        {
                                            // Close enough, snap to ground
                                            mob.PosY = targetGroundY;
                                        }
                                    }
                                }
                            }

                            // Health regeneration: if hunger is full (20) then heal 1 HP every 90 seconds
                            const int regenIntervalMs = 90_000; // 90 seconds -> 20 HP in 30 minutes
                            foreach (var p in players)
                            {
                                if (!playerStats.TryGetValue(p.userId, out var stats)) continue;
                                var curHealth = stats.health;
                                var curHunger = stats.hunger;
                                if (curHunger >= 20 && curHealth < 20)
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

        private async Task ApplyMobDamageToPlayerAsync(int userId, int worldId, int damage)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Read equipment
                int helmet = 0, chest = 0, legs = 0, boots = 0;
                using (var eCmd = new MySqlCommand(@"
                    SELECT e.helmet, e.chest, e.legs, e.boots
                    FROM maxhanna.digcraft_equipment e
                    JOIN maxhanna.digcraft_players p ON e.player_id = p.id
                    WHERE p.user_id=@uid AND p.world_id=@wid", conn))
                {
                    eCmd.Parameters.AddWithValue("@uid", userId);
                    eCmd.Parameters.AddWithValue("@wid", worldId);
                    using var er = await eCmd.ExecuteReaderAsync();
                    if (await er.ReadAsync())
                    {
                        helmet = er.IsDBNull(er.GetOrdinal("helmet")) ? 0 : er.GetInt32("helmet");
                        chest = er.IsDBNull(er.GetOrdinal("chest")) ? 0 : er.GetInt32("chest");
                        legs = er.IsDBNull(er.GetOrdinal("legs")) ? 0 : er.GetInt32("legs");
                        boots = er.IsDBNull(er.GetOrdinal("boots")) ? 0 : er.GetInt32("boots");
                    }
                }

                static int ArmorPointsForItem(int itemId)
                {
                    switch (itemId)
                    {
                        case 140: return 1;
                        case 141: return 3;
                        case 142: return 2;
                        case 143: return 1;
                        case 144: return 2;
                        case 145: return 6;
                        case 146: return 4;
                        case 147: return 2;
                        case 148: return 3;
                        case 149: return 8;
                        case 150: return 6;
                        case 151: return 3;
                        default: return 0;
                    }
                }

                var armorPoints = ArmorPointsForItem(helmet) + ArmorPointsForItem(chest) + ArmorPointsForItem(legs) + ArmorPointsForItem(boots);
                var reduction = Math.Min(0.8f, armorPoints * 0.04f);
                var reducedDamage = (int)Math.Floor(damage * (1.0f - reduction));
                if (reducedDamage < 0) reducedDamage = 0;

                using var updCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET health = GREATEST(0, health - @damage) WHERE user_id=@uid AND world_id=@wid", conn);
                updCmd.Parameters.AddWithValue("@damage", reducedDamage);
                updCmd.Parameters.AddWithValue("@uid", userId);
                updCmd.Parameters.AddWithValue("@wid", worldId);
                await updCmd.ExecuteNonQueryAsync();
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
                    INSERT INTO maxhanna.digcraft_equipment (player_id, helmet, chest, legs, boots, weapon)
                    VALUES (@pid, 0, 0, 0, 0, 0)
                    ON DUPLICATE KEY UPDATE helmet=0, chest=0, legs=0, boots=0, weapon=0;";
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

                return Ok(new { player, inventory = new List<object>(), equipment = new { helmet = 0, chest = 0, legs = 0, boots = 0, weapon = 0 } });
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
                                (user_id, world_id, pos_x, pos_y, pos_z, health, hunger, last_seen, level, exp, face)
                            VALUES (@uid, @wid, @sx, @sy, @sz, 20, 20, UTC_TIMESTAMP(), 1, 0, 'default')", conn))
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

                var equipment = new { helmet = 0, chest = 0, legs = 0, boots = 0, weapon = 0 };
                using (var eCmd = new MySqlCommand(@"
                    SELECT helmet, chest, legs, boots, weapon FROM maxhanna.digcraft_equipment WHERE player_id=@pid", conn))
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
                            weapon = r.IsDBNull(r.GetOrdinal("weapon")) ? 0 : r.GetInt32("weapon")
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

        /// <summary>Update the caller's position and return online players in one request.</summary>
        [HttpPost("SyncPlayers")]
        public async Task<IActionResult> SyncPlayers([FromBody] UpdatePositionRequest req)
        {
            if (req.UserId <= 0) return BadRequest("Invalid userId");
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Update caller position and last_seen, also is_attacking flag 
                using (var uCmd = new MySqlCommand(@"
                    UPDATE maxhanna.digcraft_players
                    SET pos_x=@px, pos_y=@py, pos_z=@pz, yaw=@yaw, pitch=@pitch, body_yaw=@bodyYaw, 
                        is_attacking=@isAttacking,
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
                    uCmd.Parameters.AddWithValue("@uid", req.UserId);
                    uCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    await uCmd.ExecuteNonQueryAsync();
                }

                // Return players seen within cutoff
                var cutoff = DateTime.UtcNow.AddSeconds(-INACTIVITY_TIMEOUT_SECONDS);
                using var cmd = new MySqlCommand(@"
                    SELECT p.user_id, p.pos_x, p.pos_y, p.pos_z, p.yaw, p.pitch, p.body_yaw, p.health, p.color, p.level, p.exp, p.face, u.username,
                           IFNULL(e.helmet, 0) AS helmet, IFNULL(e.chest, 0) AS chest, IFNULL(e.legs, 0) AS legs, IFNULL(e.boots, 0) AS boots,
                           IFNULL(e.weapon, 0) AS weapon, p.is_attacking
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
                        weapon = r.IsDBNull(r.GetOrdinal("weapon")) ? 0 : r.GetInt32("weapon"),
                        isAttacking = r.IsDBNull(r.GetOrdinal("is_attacking")) ? false : r.GetBoolean("is_attacking")
                    });
                }
                return Ok(players);
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
                           IFNULL(e.weapon, 0) AS weapon
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
                        weapon = r.IsDBNull(r.GetOrdinal("weapon")) ? 0 : r.GetInt32("weapon")
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
                const float maxRange = PLAYER_ATTACK_MAX_RANGE; // Max attack range (e.g. 3 blocks)
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

                // Apply damage
                using var updCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET health = GREATEST(0, health - @damage) WHERE id=@pid", conn);
                updCmd.Parameters.AddWithValue("@damage", damage);
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

                return Ok(new { ok = true, damage, targetUserId = req.TargetUserId, health = newHealth });
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

                // Simple armor-point mapping (mirrors client ItemId enums):
                static int ArmorPointsForItem(int itemId)
                {
                    switch (itemId)
                    {
                        // Leather
                        case 140: return 1; // LEATHER_HELMET
                        case 141: return 3; // LEATHER_CHEST
                        case 142: return 2; // LEATHER_LEGS
                        case 143: return 1; // LEATHER_BOOTS
                                            // Iron
                        case 144: return 2; // IRON_HELMET
                        case 145: return 6; // IRON_CHEST
                        case 146: return 4; // IRON_LEGS
                        case 147: return 2; // IRON_BOOTS
                                            // Diamond
                        case 148: return 3; // DIAMOND_HELMET
                        case 149: return 8; // DIAMOND_CHEST
                        case 150: return 6; // DIAMOND_LEGS
                        case 151: return 3; // DIAMOND_BOOTS
                                            // Netherite
                        case 154: return 4; // NETHERITE_HELMET
                        case 155: return 9; // NETHERITE_CHEST
                        case 156: return 7; // NETHERITE_LEGS
                        case 157: return 4; // NETHERITE_BOOTS
                        default: return 0;
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
                using (var pCmd = new MySqlCommand("SELECT pos_x, pos_y, pos_z FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn))
                {
                    pCmd.Parameters.AddWithValue("@uid", req.UserId);
                    pCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    using var pr = await pCmd.ExecuteReaderAsync();
                    if (!await pr.ReadAsync()) return BadRequest("Player not found");
                    playerX = pr.GetFloat("pos_x");
                    playerY = pr.GetFloat("pos_y");
                    playerZ = pr.GetFloat("pos_z");
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

                // Simple armor-point mapping (same mapping used by fall damage)
                static int ArmorPointsForItem(int itemId)
                {
                    switch (itemId)
                    {
                        // Leather
                        case 140: return 1; // LEATHER_HELMET
                        case 141: return 3; // LEATHER_CHEST
                        case 142: return 2; // LEATHER_LEGS
                        case 143: return 1; // LEATHER_BOOTS
                                            // Iron
                        case 144: return 2; // IRON_HELMET
                        case 145: return 6; // IRON_CHEST
                        case 146: return 4; // IRON_LEGS
                        case 147: return 2; // IRON_BOOTS
                                            // Diamond
                        case 148: return 3; // DIAMOND_HELMET
                        case 149: return 8; // DIAMOND_CHEST
                        case 150: return 6; // DIAMOND_LEGS
                        case 151: return 3; // DIAMOND_BOOTS
                                            // Netherite
                        case 154: return 4; // NETHERITE_HELMET
                        case 155: return 9; // NETHERITE_CHEST
                        case 156: return 7; // NETHERITE_LEGS
                        case 157: return 4; // NETHERITE_BOOTS
                        default: return 0;
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
                var distSq = dx * dx + dy * dy + dz * dz;
                //const float maxRange = PLAYER_ATTACK_MAX_RANGE; // Match client's reach (2 blocks + margin)
                //if (distSq > maxRange * maxRange) return BadRequest("Mob out of range");

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
                if (dead)
                {
                    // Mark as dead with timestamp instead of removing immediately
                    mob.DiedAtMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    // Move off-world so it doesn't affect gameplay
                    mob.PosX = -10000;
                    mob.PosY = -10000;
                    mob.PosZ = -10000;

                    // Grant EXP for killing mob
                    await GrantExpToPlayerAsync(req.AttackerUserId, req.WorldId, GetMobExpReward(mob.Type));
                }

                return Ok(new { ok = true, damage, mobId = mob.Id, health = newHealth, dead });
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

        private async Task GrantExpToPlayerAsync(int userId, int worldId, int expAmount)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var expCmd = new MySqlCommand(@"
                    UPDATE maxhanna.digcraft_players 
                    SET exp = COALESCE(exp, 0) + @exp 
                    WHERE user_id=@uid AND world_id=@wid", conn);
                expCmd.Parameters.AddWithValue("@exp", expAmount);
                expCmd.Parameters.AddWithValue("@uid", userId);
                expCmd.Parameters.AddWithValue("@wid", worldId);
                var rowsAffected = await expCmd.ExecuteNonQueryAsync();

                // Verify the update worked
                using var selCmd = new MySqlCommand("SELECT level, exp FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn);
                selCmd.Parameters.AddWithValue("@uid", userId);
                selCmd.Parameters.AddWithValue("@wid", worldId);
                using var rdr = await selCmd.ExecuteReaderAsync();
                if (await rdr.ReadAsync())
                {
                    var lvl = rdr.GetInt32("level");
                    var xp = rdr.GetInt32("exp");
                }

                await CheckLevelUpAsync(userId, worldId);
            }
            catch (Exception ex)
            {
                _ = _log.Db("GrantExpToPlayerAsync error: " + ex.Message, userId, "DIGCRAFT", true);
            }
        }

        private async Task CheckLevelUpAsync(int userId, int worldId)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var selCmd = new MySqlCommand("SELECT level, exp FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn);
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
                    _ = _log.Db($"Player {userId} leveled up to {level}!", userId, "DIGCRAFT", false);
                }

                using var updCmd = new MySqlCommand("UPDATE maxhanna.digcraft_players SET level = @level, exp = @exp WHERE user_id=@uid AND world_id=@wid", conn);
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
                    SELECT local_x, local_y, local_z, block_id, water_level
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
                        WaterLevel = r.GetInt32("water_level")
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

        /// <summary>Place or break a block.</summary>
        [HttpPost("PlaceBlock")]
        public async Task<IActionResult> PlaceBlock([FromBody] PlaceBlockRequest req)
        {
            if (req.UserId <= 0) return BadRequest("Invalid userId");
            try
            {
                _ = _log.Db($"PlaceBlock REQUEST: userId={req.UserId}, worldId={req.WorldId}, blockId={req.BlockId}, cx={req.ChunkX}, cz={req.ChunkZ}, lx={req.LocalX}, ly={req.LocalY}, lz={req.LocalZ}", req.UserId, "DIGCRAFT", true);

                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                var shouldPlant = req.BlockId == BlockIds.SHRUB;
                string sql;
                if (shouldPlant)
                {
                    sql = @"
                        INSERT INTO maxhanna.digcraft_block_changes
                            (world_id, chunk_x, chunk_z, local_x, local_y, local_z, block_id, changed_by, changed_at, planted_at)
                        VALUES (@wid, @cx, @cz, @lx, @ly, @lz, @bid, @uid, UTC_TIMESTAMP(), UTC_TIMESTAMP())
                        ON DUPLICATE KEY UPDATE block_id=VALUES(block_id), changed_by=VALUES(changed_by), changed_at=UTC_TIMESTAMP(), planted_at=UTC_TIMESTAMP();";
                }
                else
                {
                    sql = @"
                        INSERT INTO maxhanna.digcraft_block_changes
                            (world_id, chunk_x, chunk_z, local_x, local_y, local_z, block_id, changed_by, changed_at)
                        VALUES (@wid, @cx, @cz, @lx, @ly, @lz, @bid, @uid, UTC_TIMESTAMP())
                        ON DUPLICATE KEY UPDATE block_id=VALUES(block_id), changed_by=VALUES(changed_by), changed_at=UTC_TIMESTAMP();";
                }
                using var cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@wid", req.WorldId);
                cmd.Parameters.AddWithValue("@cx", req.ChunkX);
                cmd.Parameters.AddWithValue("@cz", req.ChunkZ);
                cmd.Parameters.AddWithValue("@lx", req.LocalX);
                cmd.Parameters.AddWithValue("@ly", req.LocalY);
                cmd.Parameters.AddWithValue("@lz", req.LocalZ);
                cmd.Parameters.AddWithValue("@bid", req.BlockId);
                cmd.Parameters.AddWithValue("@uid", req.UserId);
                var blockRows = await cmd.ExecuteNonQueryAsync();
                //_ = _log.Db($"PlaceBlock: block insert rows={blockRows}", req.UserId, "DIGCRAFT", true);

                await GrantExpToPlayerAsync(req.UserId, req.WorldId, 1);

                return Ok(new { ok = true });
            }
            catch (Exception ex)
            {
                _ = _log.Db("DigCraft PlaceBlock error: " + ex.Message, req.UserId, "DIGCRAFT", true);
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

                await using var tx = await conn.BeginTransactionAsync();

                var hasShrub = req.Items.Any(it => it.BlockId == BlockIds.SHRUB);
                string sql;
                if (hasShrub)
                {
                    sql = @"
                        INSERT INTO maxhanna.digcraft_block_changes
                            (world_id, chunk_x, chunk_z, local_x, local_y, local_z, block_id, changed_by, changed_at, planted_at)
                        VALUES (@wid, @cx, @cz, @lx, @ly, @lz, @bid, @uid, UTC_TIMESTAMP(), 
                            CASE WHEN @bid = @shrubId THEN UTC_TIMESTAMP() ELSE NULL END)
                        ON DUPLICATE KEY UPDATE block_id=VALUES(block_id), changed_by=VALUES(changed_by), changed_at=UTC_TIMESTAMP(), 
                            planted_at=CASE WHEN VALUES(block_id) = @shrubId THEN UTC_TIMESTAMP() ELSE planted_at END;";
                }
                else
                {
                    sql = @"
                        INSERT INTO maxhanna.digcraft_block_changes
                            (world_id, chunk_x, chunk_z, local_x, local_y, local_z, block_id, changed_by, changed_at)
                        VALUES (@wid, @cx, @cz, @lx, @ly, @lz, @bid, @uid, UTC_TIMESTAMP())
                        ON DUPLICATE KEY UPDATE block_id=VALUES(block_id), changed_by=VALUES(changed_by), changed_at=UTC_TIMESTAMP();";
                }

                using var cmd = new MySqlCommand(sql, conn, tx);
                // Prepare parameters
                cmd.Parameters.AddWithValue("@wid", req.WorldId);
                cmd.Parameters.Add("@cx", MySqlDbType.Int32);
                cmd.Parameters.Add("@cz", MySqlDbType.Int32);
                cmd.Parameters.Add("@lx", MySqlDbType.Int32);
                cmd.Parameters.Add("@ly", MySqlDbType.Int32);
                cmd.Parameters.Add("@lz", MySqlDbType.Int32);
                cmd.Parameters.Add("@bid", MySqlDbType.Int32);
                cmd.Parameters.AddWithValue("@uid", req.UserId);
                cmd.Parameters.AddWithValue("@shrubId", BlockIds.SHRUB);
                int totalRows = 0;
                foreach (var it in req.Items)
                {
                    cmd.Parameters["@cx"].Value = it.ChunkX;
                    cmd.Parameters["@cz"].Value = it.ChunkZ;
                    cmd.Parameters["@lx"].Value = it.LocalX;
                    cmd.Parameters["@ly"].Value = it.LocalY;
                    cmd.Parameters["@lz"].Value = it.LocalZ;
                    cmd.Parameters["@bid"].Value = it.BlockId;
                    await cmd.ExecuteNonQueryAsync();
                    totalRows++;
                }
                await tx.CommitAsync();
                await GrantExpToPlayerAsync(req.UserId, req.WorldId, totalRows);

                return Ok(new { ok = true, count = req.Items.Count });
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
                        INSERT INTO maxhanna.digcraft_equipment (player_id, helmet, chest, legs, boots, weapon)
                        VALUES (@pid, @helmet, @chest, @legs, @boots, @weapon)
                        ON DUPLICATE KEY UPDATE helmet=VALUES(helmet), chest=VALUES(chest), legs=VALUES(legs), boots=VALUES(boots), weapon=VALUES(weapon);";
                    using var eqCmd = new MySqlCommand(upsertEq, conn);
                    eqCmd.Parameters.AddWithValue("@pid", playerId);
                    eqCmd.Parameters.AddWithValue("@helmet", req.Equipment.Helmet);
                    eqCmd.Parameters.AddWithValue("@chest", req.Equipment.Chest);
                    eqCmd.Parameters.AddWithValue("@legs", req.Equipment.Legs);
                    eqCmd.Parameters.AddWithValue("@boots", req.Equipment.Boots);
                    eqCmd.Parameters.AddWithValue("@weapon", req.Equipment.Weapon);
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
                var expiresAt = DateTime.UtcNow.AddSeconds(30);
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
            const int tickMs = 5000; // Check every 5 seconds
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
                        var cutoff = now.AddMilliseconds(-SHRUB_GROW_TIME_MS);
                        var worldSeedCache = new Dictionary<int, int>();

                        using var cmd = new MySqlCommand(@"
                            SELECT world_id, chunk_x, chunk_z, local_x, local_y, local_z, planted_at
                            FROM maxhanna.digcraft_block_changes
                            WHERE block_id = @shrub AND planted_at IS NOT NULL AND planted_at <= @cutoff", conn);
                        cmd.Parameters.AddWithValue("@shrub", BlockIds.SHRUB);
                        cmd.Parameters.AddWithValue("@cutoff", cutoff);

                        using var reader = await cmd.ExecuteReaderAsync(ct);
                        var toGrow = new List<(int worldId, int chunkX, int chunkZ, int localX, int localY, int localZ, DateTime plantedAt)>();
                        while (await reader.ReadAsync(ct))
                        {
                            toGrow.Add((
                                reader.GetInt32("world_id"),
                                reader.GetInt32("chunk_x"),
                                reader.GetInt32("chunk_z"),
                                reader.GetInt32("local_x"),
                                reader.GetInt32("local_y"),
                                reader.GetInt32("local_z"),
                                reader.GetDateTime("planted_at")
                            ));
                        }
                        await reader.CloseAsync();

                        if (toGrow.Count == 0) continue;

                        foreach (var shrub in toGrow)
                        {
                            var (worldId, chunkX, chunkZ, localX, localY, localZ, _) = shrub;
                            var sx = chunkX * CHUNK_SIZE + localX;
                            var sy = localY;
                            var sz = chunkZ * CHUNK_SIZE + localZ;

                            if (!worldSeedCache.TryGetValue(worldId, out var worldSeed))
                            {
                                using var seedCmd = new MySqlCommand("SELECT seed FROM maxhanna.digcraft_worlds WHERE id = @wid", conn);
                                seedCmd.Parameters.AddWithValue("@wid", worldId);
                                var seedResult = await seedCmd.ExecuteScalarAsync(ct);
                                worldSeed = (seedResult == null || seedResult == DBNull.Value) ? 42 : Convert.ToInt32(seedResult);
                                worldSeedCache[worldId] = worldSeed;
                            }

                            var belowBlockId = await GetBlockAtAsync(conn, worldId, sx, sy - 1, sz, worldSeed);
                            if (belowBlockId != BlockIds.GRASS && belowBlockId != BlockIds.DIRT) continue;

                            await using var growConn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                            await growConn.OpenAsync(ct);
                            await DeleteBlockChangeAsync(growConn, worldId, sx, sy, sz, ct);

                            var treeBaseY = sy;
                            var trunkHeight = 4;

                            for (int i = 0; i < trunkHeight; i++)
                            {
                                await UpsertBlockChangeAsync(growConn, worldId, sx, treeBaseY + i, sz, BlockIds.WOOD, ct);
                            }

                            var leafY = treeBaseY + trunkHeight;

                            var leafOffsets = new (int dx, int dz)[]
                            {
                                (0, 0), (1, 0), (-1, 0), (0, 1), (0, -1),
                                (1, 1), (1, -1), (-1, 1), (-1, -1)
                            };

                            foreach (var offset in leafOffsets)
                            {
                                var leafX = sx + offset.dx;
                                var leafZ = sz + offset.dz;
                                var existingLeaf = await GetBlockAtAsync(growConn, worldId, leafX, leafY, leafZ, worldSeed);
                                if (existingLeaf == BlockIds.AIR)
                                {
                                    await UpsertBlockChangeAsync(growConn, worldId, leafX, leafY, leafZ, BlockIds.LEAVES, ct);
                                }
                            }

                            await UpsertBlockChangeAsync(growConn, worldId, sx, leafY, sz, BlockIds.LEAVES, ct);
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
        /// Minecraft-style fluid simulation using 0-7 fluid levels.
        /// Each tick, for every active player's 8-block radius:
        ///   1. Fluid flows down into empty/lower cells.
        ///   2. If downward flow is blocked, spreads horizontally to lower-level neighbours.
        ///   3. Levels equalise between horizontal neighbours.
        ///   4. Cells that reach level 0 are removed.
        /// Only simulation-spread blocks (changed_by=0) are mutated; user-placed sources
        /// (changed_by>0) keep their level and are never deleted.
        /// </summary>
        private async Task FluidSimulationLoopAsync(CancellationToken ct)
        {
            const int tickMs = 1200;
            const int playerRadius = 8;
            const int SOURCE_LEVEL = 8;   // user-placed source block level
            const int MAX_LEVEL = 8;   // maximum fluid level (full block)

            try
            {
                while (!ct.IsCancellationRequested)
                {
                    await Task.Delay(tickMs, ct);
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
                            var sourceSet = new HashSet<(int, int, int)>();
                            // allChanges: every changed block (for solid-neighbour lookup)
                            var allChanges = new Dictionary<(int, int, int), int>();

                            using (var chCmd = new MySqlCommand(@"
                                SELECT chunk_x, chunk_z, local_x, local_y, local_z, block_id,
                                       COALESCE(changed_by,0) AS changed_by,
                                       COALESCE(water_level, 8) AS water_level
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
                                    int bid2 = cr.GetInt32(5), changedBy = cr.GetInt32(6), wlvl = cr.GetInt32(7);
                                    int wx2 = cx2 * CHUNK_SIZE + lx2, wz2 = cz2 * CHUNK_SIZE + lz2;
                                    allChanges[(wx2, ly2, wz2)] = bid2;
                                    if (bid2 == BlockIds.WATER || bid2 == BlockIds.LAVA)
                                    {
                                        int lvl = Math.Max(1, Math.Min(MAX_LEVEL, wlvl));
                                        levelMap[(wx2, ly2, wz2)] = lvl;
                                        if (changedBy > 0) sourceSet.Add((wx2, ly2, wz2));
                                    }
                                }
                            }

                            if (levelMap.Count == 0) continue;

                            // Helper: is a world position solid (blocks fluid)?
                            bool IsSolid(int wx, int wy, int wz)
                            {
                                if (allChanges.TryGetValue((wx, wy, wz), out var bid))
                                {
                                    return bid != BlockIds.AIR && bid != BlockIds.WATER && bid != BlockIds.LAVA
                                        && bid != BlockIds.TALLGRASS && bid != BlockIds.SHRUB;
                                }
                                int baseBid = GetBaseBlockId(worldSeed, wx, wy, wz);
                                return baseBid != BlockIds.AIR && baseBid != BlockIds.WATER && baseBid != BlockIds.LAVA
                                    && baseBid != BlockIds.TALLGRASS && baseBid != BlockIds.SHRUB;
                            }

                            int GetLevel(int wx, int wy, int wz) =>
                                levelMap.TryGetValue((wx, wy, wz), out var l) ? l : 0;

                            // ── 5. Simulate one tick (top-down, then left-right within each Y) ──
                            var newLevel = new Dictionary<(int, int, int), int>(levelMap);
                            // Restore sources to full level every tick (infinite source)
                            foreach (var src in sourceSet) newLevel[src] = SOURCE_LEVEL;

                            var dirs4 = new (int dx, int dz)[] { (1, 0), (-1, 0), (0, 1), (0, -1) };

                            // Process top-down so falling water is handled before horizontal spread
                            for (int wy = box.maxY; wy >= box.minY; wy--)
                                for (int wx = box.minX; wx <= box.maxX; wx++)
                                    for (int wz = box.minZ; wz <= box.maxZ; wz++)
                                    {
                                        var pos = (wx, wy, wz);
                                        if (!newLevel.TryGetValue(pos, out int lvl) || lvl <= 0) continue;
                                        if (IsSolid(wx, wy, wz)) continue;

                                        bool isSource = sourceSet.Contains(pos);

                                        // ── Rule 1: flow down ──
                                        var below = (wx, wy - 1, wz);
                                        if (wy > 0 && !IsSolid(wx, wy - 1, wz))
                                        {
                                            int belowLvl = GetLevel(wx, wy - 1, wz);
                                            if (belowLvl < MAX_LEVEL)
                                            {
                                                int give = Math.Min(lvl, MAX_LEVEL - belowLvl);
                                                newLevel[below] = belowLvl + give;
                                                if (!isSource)
                                                {
                                                    newLevel[pos] = lvl - give;
                                                    if (newLevel[pos] <= 0) { newLevel.Remove(pos); continue; }
                                                }
                                                continue; // downward flow takes priority — skip horizontal this tick
                                            }
                                        }

                                        // ── Rule 2 & 3: spread horizontally to lower-level neighbours ──
                                        // Collect neighbours that can receive fluid
                                        var candidates = new List<(int, int, int, int)>(); // (wx,wy,wz, currentLevel)
                                        foreach (var (dx, dz) in dirs4)
                                        {
                                            int nx = wx + dx, nz = wz + dz;
                                            if (IsSolid(nx, wy, nz)) continue;
                                            int nLvl = GetLevel(nx, wy, nz);
                                            if (nLvl < lvl - 1) candidates.Add((nx, wy, nz, nLvl));
                                        }
                                        if (candidates.Count == 0) continue;

                                        // Equalise: distribute evenly
                                        int total = lvl + candidates.Sum(c => c.Item4);
                                        int count = 1 + candidates.Count;
                                        int share = total / count;
                                        int remainder = total % count;

                                        if (!isSource) newLevel[pos] = share + (remainder-- > 0 ? 1 : 0);
                                        foreach (var (nx, ny, nz, _) in candidates)
                                        {
                                            int newLvl = share + (remainder-- > 0 ? 1 : 0);
                                            if (newLvl > 0) newLevel[(nx, ny, nz)] = newLvl;
                                            else newLevel.Remove((nx, ny, nz));
                                        }
                                        if (!isSource && newLevel.TryGetValue(pos, out int pl) && pl <= 0)
                                            newLevel.Remove(pos);
                                    }

                            // ── 6. Compute diff: what changed vs the DB state ──
                            var toUpsert = new List<(int wx, int wy, int wz, int lvl)>();
                            var toDelete = new List<(int wx, int wy, int wz)>();

                            // Blocks that gained or changed level
                            foreach (var (pos, newLvl) in newLevel)
                            {
                                if (!levelMap.TryGetValue(pos, out int oldLvl) || oldLvl != newLvl)
                                    toUpsert.Add((pos.Item1, pos.Item2, pos.Item3, newLvl));
                            }
                            // Blocks that were removed (level dropped to 0)
                            foreach (var (pos, _) in levelMap)
                            {
                                if (!newLevel.ContainsKey(pos) && !sourceSet.Contains(pos))
                                    toDelete.Add((pos.Item1, pos.Item2, pos.Item3));
                            }

                            if (toUpsert.Count == 0 && toDelete.Count == 0) continue;

                            // ── 7. Persist changes ──
                            // Determine fluid type for new cells (inherit from nearest source — use WATER as default)
                            int GetFluidType(int wx, int wy, int wz)
                            {
                                if (levelMap.TryGetValue((wx, wy, wz), out _) && allChanges.TryGetValue((wx, wy, wz), out var bid))
                                    return bid;
                                // Check neighbours for fluid type
                                foreach (var (dx, dz) in dirs4)
                                    if (allChanges.TryGetValue((wx + dx, wy, wz + dz), out var nb) &&
                                        (nb == BlockIds.WATER || nb == BlockIds.LAVA)) return nb;
                                if (allChanges.TryGetValue((wx, wy + 1, wz), out var above) &&
                                    (above == BlockIds.WATER || above == BlockIds.LAVA)) return above;
                                return BlockIds.WATER;
                            }

                            foreach (var (fx, fy, fz, flvl) in toUpsert)
                            {
                                GetStoredBlockCoords(fx, fy, fz, out var fcx, out var fcz, out var flx, out var fly, out var flz);
                                int ftype = GetFluidType(fx, fy, fz);
                                try
                                {
                                    using var ins = new MySqlCommand(@"
                                        INSERT INTO maxhanna.digcraft_block_changes
                                            (world_id,chunk_x,chunk_z,local_x,local_y,local_z,block_id,changed_by,water_level,changed_at)
                                        VALUES (@wid,@cx,@cz,@lx,@ly,@lz,@bid,0,@wlvl,UTC_TIMESTAMP())
                                        ON DUPLICATE KEY UPDATE
                                            block_id=VALUES(block_id),
                                            water_level=VALUES(water_level),
                                            changed_at=UTC_TIMESTAMP()", conn);
                                    ins.Parameters.AddWithValue("@wid", worldId);
                                    ins.Parameters.AddWithValue("@cx", fcx);
                                    ins.Parameters.AddWithValue("@cz", fcz);
                                    ins.Parameters.AddWithValue("@lx", flx);
                                    ins.Parameters.AddWithValue("@ly", fly);
                                    ins.Parameters.AddWithValue("@lz", flz);
                                    ins.Parameters.AddWithValue("@bid", ftype);
                                    ins.Parameters.AddWithValue("@wlvl", flvl);
                                    await ins.ExecuteNonQueryAsync(ct);
                                }
                                catch { }
                            }

                            foreach (var (dx, dy, dz) in toDelete)
                            {
                                GetStoredBlockCoords(dx, dy, dz, out var dcx, out var dcz, out var dlx, out var dly, out var dlz);
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

                            _ = _log.Db($"FluidSim: world={worldId} upsert={toUpsert.Count} delete={toDelete.Count}", 0, "DIGCRAFT", true);
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

        private async Task DeleteBlockChangeAsync(MySqlConnection conn, int worldId, int x, int y, int z, CancellationToken ct)
        {
            GetStoredBlockCoords(x, y, z, out var chunkX, out var chunkZ, out var localX, out var localY, out var localZ);

            using var cmd = new MySqlCommand(@"
                DELETE FROM maxhanna.digcraft_block_changes
                WHERE world_id = @wid
                  AND chunk_x = @cx
                  AND chunk_z = @cz
                  AND local_x = @lx
                  AND local_y = @ly
                  AND local_z = @lz", conn);
            cmd.Parameters.AddWithValue("@wid", worldId);
            cmd.Parameters.AddWithValue("@cx", chunkX);
            cmd.Parameters.AddWithValue("@cz", chunkZ);
            cmd.Parameters.AddWithValue("@lx", localX);
            cmd.Parameters.AddWithValue("@ly", localY);
            cmd.Parameters.AddWithValue("@lz", localZ);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        private async Task<int> GetBlockAtAsync(MySqlConnection conn, int worldId, int x, int y, int z, int worldSeed)
        {
            GetStoredBlockCoords(x, y, z, out var chunkX, out var chunkZ, out var localX, out var localY, out var localZ);

            using var cmd = new MySqlCommand(@"
                SELECT block_id FROM maxhanna.digcraft_block_changes
                WHERE world_id = @wid AND chunk_x = @cx AND chunk_z = @cz
                AND local_x = @lx AND local_y = @ly AND local_z = @lz", conn);
            cmd.Parameters.AddWithValue("@wid", worldId);
            cmd.Parameters.AddWithValue("@cx", chunkX);
            cmd.Parameters.AddWithValue("@cz", chunkZ);
            cmd.Parameters.AddWithValue("@lx", localX);
            cmd.Parameters.AddWithValue("@ly", localY);
            cmd.Parameters.AddWithValue("@lz", localZ);
            var result = await cmd.ExecuteScalarAsync();
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
                        return Ok(new { id = chestId, x, y, z, nickname, items });
                    }
                }

                // No chest found at this position - create a DB row for this chest so client can open it
                try
                {
                    await using var insertCmd = new MySqlCommand(@"
                        INSERT INTO maxhanna.digcraft_chests (user_id, world_id, x, y, z, nickname, created_at)
                        VALUES (@userId, @wid, @x, @y, @z, @nickname, @createdAt)", conn);
                    insertCmd.Parameters.AddWithValue("@userId", userId);
                    insertCmd.Parameters.AddWithValue("@wid", worldId);
                    insertCmd.Parameters.AddWithValue("@x", x);
                    insertCmd.Parameters.AddWithValue("@y", y);
                    insertCmd.Parameters.AddWithValue("@z", z);
                    insertCmd.Parameters.AddWithValue("@nickname", "Chest");
                    insertCmd.Parameters.AddWithValue("@createdAt", DateTime.UtcNow);
                    await insertCmd.ExecuteNonQueryAsync();

                    await using var idCmd = new MySqlCommand("SELECT LAST_INSERT_ID()", conn);
                    var idObj = await idCmd.ExecuteScalarAsync();
                    var newId = 0;
                    if (idObj != null && int.TryParse(idObj.ToString(), out var parsedId) && parsedId > 0)
                    {
                        newId = parsedId;
                    }

                    return Ok(new { id = newId, x, y, z, nickname = "Chest", items = new List<object>() });

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
