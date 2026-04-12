using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using maxhanna.Server.Controllers.DataContracts.DigCraft;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

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
        }

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
                    var types = typesDay.Concat(typesNight).ToArray();
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
                        var hostile = t == "Zombie" || t == "Skeleton";
                        var mob = new ServerMob
                        {
                            Id = Interlocked.Increment(ref _globalMobId),
                            Type = t,
                            PosX = wx,
                            // Use camera/eye-style Y so clients rendering mobs align correctly
                            PosY = wy + 1f + 1.6f,
                            PosZ = wz,
                            Yaw = 0,
                            Health = hostile ? 20 : 10,
                            MaxHealth = hostile ? 20 : 10,
                            Hostile = hostile,
                            Speed = hostile ? 1.15f : 0.9f
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
                                var cutoff = DateTime.UtcNow.AddSeconds(-120);
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
                            const long resetTimeoutMs = 30_000; // reset to home after 30s of inactivity

                            var mobIds = mobs.Keys.ToList();
                            foreach (var mid in mobIds)
                            {
                                if (!mobs.TryGetValue(mid, out var mob)) continue;
                                if (mob.Health <= 0)
                                {
                                    mobs.TryRemove(mid, out _);
                                    continue;
                                }

                                // Simple AI: find nearest player within aggro range
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
                                    var moved = false;
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
                                            moved = true;
                                            break;
                                        }
                                    }
                                    // always update yaw to face direction
                                    mob.Yaw = (float)Math.Atan2(-dirX, -dirZ);

                                    // mark as active
                                    mob.LastActiveMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                                    // Attack if close
                                    const float attackRange = 1.4f;
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
                                                // align vertically to the player's eye Y so mob appears next to player
                                                mob.PosY = best.y;
                                                // Apply damage to player via same logic as MobAttack endpoint
                                                int baseDamage = mob.Type == "Zombie" ? 4 : mob.Type == "Skeleton" ? 3 : 1;
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
                        case 140: return 1; case 141: return 3; case 142: return 2; case 143: return 1;
                        case 144: return 2; case 145: return 6; case 146: return 4; case 147: return 2;
                        case 148: return 3; case 149: return 8; case 150: return 6; case 151: return 3;
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

                // Get spawn coords for the world
                float spawnX = 8, spawnY = 34, spawnZ = 8;
                using (var wCmd = new MySqlCommand("SELECT spawn_x, spawn_y, spawn_z FROM maxhanna.digcraft_worlds WHERE id=@wid", conn))
                {
                    wCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    using var r = await wCmd.ExecuteReaderAsync();
                    if (await r.ReadAsync())
                    {
                        spawnX = r.GetFloat("spawn_x");
                        spawnY = r.GetFloat("spawn_y");
                        spawnZ = r.GetFloat("spawn_z");
                    }
                }

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

                // Reset player position, health and hunger
                using (var updCmd = new MySqlCommand(@"
                    UPDATE maxhanna.digcraft_players
                    SET pos_x=@px, pos_y=@py, pos_z=@pz, health = 20, hunger = 20, yaw = 0, pitch = 0, last_seen = UTC_TIMESTAMP()
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

        /// <summary>Join the world — upserts player record, returns player state + world info.</summary>
        [HttpPost("Join")]
        public async Task<IActionResult> JoinWorld([FromBody] JoinWorldRequest req)
        {
            if (req.UserId <= 0) return BadRequest("Invalid userId");

            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                // Get world info
                int seed = 42;
                float spawnX = 8, spawnY = 34, spawnZ = 8;
                using (var wCmd = new MySqlCommand(
                    "SELECT seed, spawn_x, spawn_y, spawn_z FROM maxhanna.digcraft_worlds WHERE id=@wid", conn))
                {
                    wCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    using var r = await wCmd.ExecuteReaderAsync();
                    if (await r.ReadAsync())
                    {
                        seed = r.GetInt32("seed");
                        spawnX = r.GetFloat("spawn_x");
                        spawnY = r.GetFloat("spawn_y");
                        spawnZ = r.GetFloat("spawn_z");
                    }
                }

                // Upsert player
                const string upsert = @"
                    INSERT INTO maxhanna.digcraft_players
                        (user_id, world_id, pos_x, pos_y, pos_z, health, hunger, last_seen)
                    VALUES (@uid, @wid, @sx, @sy, @sz, 20, 20, UTC_TIMESTAMP())
                    ON DUPLICATE KEY UPDATE last_seen = UTC_TIMESTAMP();";
                using (var cmd = new MySqlCommand(upsert, conn))
                {
                    cmd.Parameters.AddWithValue("@uid", req.UserId);
                    cmd.Parameters.AddWithValue("@wid", req.WorldId);
                    cmd.Parameters.AddWithValue("@sx", spawnX);
                    cmd.Parameters.AddWithValue("@sy", spawnY);
                    cmd.Parameters.AddWithValue("@sz", spawnZ);
                    await cmd.ExecuteNonQueryAsync();
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
                            Username = r.IsDBNull(r.GetOrdinal("username")) ? null : r.GetString("username")
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
                    SET pos_x=@px, pos_y=@py, pos_z=@pz, yaw=@yaw, pitch=@pitch, last_seen=UTC_TIMESTAMP()
                    WHERE user_id=@uid AND world_id=@wid", conn);
                cmd.Parameters.AddWithValue("@px", req.PosX);
                cmd.Parameters.AddWithValue("@py", req.PosY);
                cmd.Parameters.AddWithValue("@pz", req.PosZ);
                cmd.Parameters.AddWithValue("@yaw", req.Yaw);
                cmd.Parameters.AddWithValue("@pitch", req.Pitch);
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

                // Update caller position and last_seen
                using (var uCmd = new MySqlCommand(@"
                    UPDATE maxhanna.digcraft_players
                    SET pos_x=@px, pos_y=@py, pos_z=@pz, yaw=@yaw, pitch=@pitch, last_seen=UTC_TIMESTAMP()
                    WHERE user_id=@uid AND world_id=@wid", conn))
                {
                    uCmd.Parameters.AddWithValue("@px", req.PosX);
                    uCmd.Parameters.AddWithValue("@py", req.PosY);
                    uCmd.Parameters.AddWithValue("@pz", req.PosZ);
                    uCmd.Parameters.AddWithValue("@yaw", req.Yaw);
                    uCmd.Parameters.AddWithValue("@pitch", req.Pitch);
                    uCmd.Parameters.AddWithValue("@uid", req.UserId);
                    uCmd.Parameters.AddWithValue("@wid", req.WorldId);
                    await uCmd.ExecuteNonQueryAsync();
                }

                // Return players seen within cutoff
                var cutoff = DateTime.UtcNow.AddSeconds(-120);
                using var cmd = new MySqlCommand(@"
                    SELECT p.user_id, p.pos_x, p.pos_y, p.pos_z, p.yaw, p.pitch, p.health, p.color, u.username,
                           IFNULL(e.helmet, 0) AS helmet, IFNULL(e.chest, 0) AS chest, IFNULL(e.legs, 0) AS legs, IFNULL(e.boots, 0) AS boots,
                           IFNULL(e.weapon, 0) AS weapon
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
                        health = r.GetInt32("health"),
                        color = r.IsDBNull(r.GetOrdinal("color")) ? "#ffffff" : r.GetString("color"),
                        username = r.IsDBNull(r.GetOrdinal("username")) ? "Anon" : r.GetString("username"),
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
                _ = _log.Db("DigCraft SyncPlayers error: " + ex.Message, req.UserId, "DIGCRAFT", true);
                return StatusCode(500, "Internal error");
            }
        }

        /// <summary>Get online players in the world (seen within last 120s).</summary>
        [HttpGet("Players/{worldId}")]
        public async Task<IActionResult> GetPlayers(int worldId)
        {
            try
            {
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                var cutoff = DateTime.UtcNow.AddSeconds(-120);
                using var cmd = new MySqlCommand(@"
                    SELECT p.user_id, p.pos_x, p.pos_y, p.pos_z, p.yaw, p.pitch, p.health, p.color, u.username,
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
                        health = r.GetInt32("health"),
                        color = r.IsDBNull(r.GetOrdinal("color")) ? "#ffffff" : r.GetString("color"),
                        username = r.IsDBNull(r.GetOrdinal("username")) ? "Anon" : r.GetString("username"),
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

                var cutoff = DateTime.UtcNow.AddSeconds(-120);
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
                    if (attackerDbId == 0 || targetDbId == 0) return BadRequest("Player(s) not found");

                    // Range check
                    var dx = attX - tgtX; var dy = attY - tgtY; var dz = attZ - tgtZ;
                    var distSq = dx * dx + dy * dy + dz * dz;
                    const float maxRange = 3.5f;
                    if (distSq > maxRange * maxRange) return BadRequest("Target out of range");

                    // Cooldown check (in-memory)
                    if (_lastAttackAt.TryGetValue(req.AttackerUserId, out var last) && (DateTime.UtcNow - last).TotalMilliseconds < 450)
                    {
                        return BadRequest("Attack too soon");
                    }
                    _lastAttackAt[req.AttackerUserId] = DateTime.UtcNow;

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

                    // Return updated health
                    using var hCmd = new MySqlCommand("SELECT health FROM maxhanna.digcraft_players WHERE id=@pid", conn);
                    hCmd.Parameters.AddWithValue("@pid", targetDbId);
                    var hObj = await hCmd.ExecuteScalarAsync();
                    int newHealth = hObj != null ? Convert.ToInt32(hObj) : 0;

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
                            await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                            await conn.OpenAsync();

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

                            // Range check: load attacker position
                            float attX = 0, attY = 0, attZ = 0;
                            await using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                            {
                                await conn.OpenAsync();
                                using var pCmd = new MySqlCommand("SELECT pos_x, pos_y, pos_z FROM maxhanna.digcraft_players WHERE user_id=@uid AND world_id=@wid", conn);
                                pCmd.Parameters.AddWithValue("@uid", req.AttackerUserId);
                                pCmd.Parameters.AddWithValue("@wid", req.WorldId);
                                using var r = await pCmd.ExecuteReaderAsync();
                                if (await r.ReadAsync()) { attX = r.GetFloat("pos_x"); attY = r.GetFloat("pos_y"); attZ = r.GetFloat("pos_z"); }
                                else return BadRequest("Attacker not found");
                            }

                            var dx = attX - mob.PosX; var dy = attY - mob.PosY; var dz = attZ - mob.PosZ;
                            var distSq = dx * dx + dy * dy + dz * dz;
                            const float maxRange = 3.5f;
                            if (distSq > maxRange * maxRange) return BadRequest("Mob out of range");

                            // Cooldown simple check (per-attacker)
                            if (_lastAttackAt.TryGetValue(req.AttackerUserId, out var last) && (DateTime.UtcNow - last).TotalMilliseconds < 450)
                            {
                                return BadRequest("Attack too soon");
                            }
                            _lastAttackAt[req.AttackerUserId] = DateTime.UtcNow;

                            // Determine weapon damage
                            int damage = req.WeaponId > 0 ? 6 : 2;

                            lock (mob)
                            {
                                mob.Health = Math.Max(0, mob.Health - damage);
                            }

                            var dead = mob.Health <= 0;
                            if (dead)
                            {
                                mobs.TryRemove(mob.Id, out _);
                            }

                            return Ok(new { ok = true, damage, mobId = mob.Id, health = mob.Health, dead });
                        }
                        catch (Exception ex)
                        {
                            _ = _log.Db("AttackMob error: " + ex.Message, req.AttackerUserId, "DIGCRAFT", true);
                            return StatusCode(500, "Internal error");
                        }
                    }

                    /// <summary>Get server-authoritative mobs for a world.</summary>
                    [HttpGet("Mobs/{worldId}")]
                    public async Task<IActionResult> GetMobs(int worldId)
                    {
                        try
                        {
                            EnsureWorldMobsInitialized(worldId);
                            if (!_worldMobs.TryGetValue(worldId, out var mobs)) return Ok(new { mobs = new List<object>(), mobTickMs = _mobTickMs, mobEpochStartMs = _mobEpochStartMs });
                            var list = mobs.Values.Select(m => new MobState { Id = m.Id, Type = m.Type, PosX = m.PosX, PosY = m.PosY, PosZ = m.PosZ, Yaw = m.Yaw, Health = m.Health, MaxHealth = m.MaxHealth, Hostile = m.Hostile }).ToList();
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
                    SELECT local_x, local_y, local_z, block_id
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
                        BlockId = r.GetInt32("block_id")
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
                await using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                const string sql = @"
                    INSERT INTO maxhanna.digcraft_block_changes
                        (world_id, chunk_x, chunk_z, local_x, local_y, local_z, block_id, changed_by, changed_at)
                    VALUES (@wid, @cx, @cz, @lx, @ly, @lz, @bid, @uid, UTC_TIMESTAMP())
                    ON DUPLICATE KEY UPDATE block_id=VALUES(block_id), changed_by=VALUES(changed_by), changed_at=UTC_TIMESTAMP();";
                using var cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@wid", req.WorldId);
                cmd.Parameters.AddWithValue("@cx", req.ChunkX);
                cmd.Parameters.AddWithValue("@cz", req.ChunkZ);
                cmd.Parameters.AddWithValue("@lx", req.LocalX);
                cmd.Parameters.AddWithValue("@ly", req.LocalY);
                cmd.Parameters.AddWithValue("@lz", req.LocalZ);
                cmd.Parameters.AddWithValue("@bid", req.BlockId);
                cmd.Parameters.AddWithValue("@uid", req.UserId);
                await cmd.ExecuteNonQueryAsync();

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

                const string sql = @"
                    INSERT INTO maxhanna.digcraft_block_changes
                        (world_id, chunk_x, chunk_z, local_x, local_y, local_z, block_id, changed_by, changed_at)
                    VALUES (@wid, @cx, @cz, @lx, @ly, @lz, @bid, @uid, UTC_TIMESTAMP())
                    ON DUPLICATE KEY UPDATE block_id=VALUES(block_id), changed_by=VALUES(changed_by), changed_at=UTC_TIMESTAMP();";

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

                foreach (var it in req.Items)
                {
                    cmd.Parameters["@cx"].Value = it.ChunkX;
                    cmd.Parameters["@cz"].Value = it.ChunkZ;
                    cmd.Parameters["@lx"].Value = it.LocalX;
                    cmd.Parameters["@ly"].Value = it.LocalY;
                    cmd.Parameters["@lz"].Value = it.LocalZ;
                    cmd.Parameters["@bid"].Value = it.BlockId;
                    await cmd.ExecuteNonQueryAsync();
                }

                await tx.CommitAsync();
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
    }
}
