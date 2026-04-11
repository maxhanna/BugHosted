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

        public DigCraftController(Log log, IConfiguration config)
        {
            _log = log;
            _config = config;
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
                object player = null;
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
                    world = new { id = req.WorldId, seed, spawnX, spawnY, spawnZ }
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
    }
}
