using maxhanna.Server.Controllers.DataContracts.Ender;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Files;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System;
using System.Text;
using System.Text.Json;
using System.Collections.Generic;
using System.Linq;
using System.Threading;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Microsoft.AspNetCore.Components.Route("[controller]")]
    public class EnderController : ControllerBase
    {
        private readonly Log _log;
        private readonly IConfiguration _config;
        private readonly string _connectionString;
        private static Dictionary<string, CancellationTokenSource> activeLocks = new();
        private static readonly Dictionary<SkillType, SkillType> TypeEffectiveness = new()
        {
                { SkillType.SPEED, SkillType.ARMOR }, // SPEED is strong against ARMOR
                { SkillType.STRENGTH, SkillType.STEALTH }, // STRENGTH is strong against STEALTH
                { SkillType.ARMOR, SkillType.RANGED }, // ARMOR is strong against RANGED
                { SkillType.RANGED, SkillType.INTELLIGENCE }, // RANGED is strong against INTELLIGENCE
                { SkillType.STEALTH, SkillType.SPEED }, // STEALTH is strong against SPEED
                { SkillType.INTELLIGENCE, SkillType.STRENGTH } // INTELLIGENCE is strong against STRENGTH
        };

        private enum SkillType
        {
            NORMAL = 0,
            SPEED = 1,
            STRENGTH = 2,
            ARMOR = 3,
            RANGED = 4,
            STEALTH = 5,
            INTELLIGENCE = 6
        }

        public EnderController(Log log, IConfiguration config)
        {
            _log = log;
            _config = config;
            _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        }

        [HttpPost("/Ender", Name = "Ender_GetHero")]
        public async Task<IActionResult> GetHero([FromBody] int userId)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        MetaHero? hero = await GetHeroData(userId, null, connection, transaction);
                        await transaction.CommitAsync();

                        return Ok(hero);
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }

        [HttpPost("/Ender/FetchGameData", Name = "Ender_FetchGameData")]
        public async Task<IActionResult> FetchGameData([FromBody] DataContracts.Ender.FetchGameDataRequest payload)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        // payload contains strongly-typed hero and optional pendingWalls
                        MetaHero? hero = payload?.hero;

                        if (payload?.pendingWalls != null && payload.pendingWalls.Count > 0 && hero != null)
                        {
                            string insertSql = @"INSERT INTO maxhanna.ender_bike_wall (hero_id, map, x, y, level, created_at)
                                VALUES (@HeroId, @Map, @X, @Y, (SELECT level FROM maxhanna.ender_hero WHERE id = @HeroId LIMIT 1), UTC_TIMESTAMP());";
                            using (var insertCmd = new MySqlCommand(insertSql, connection, transaction))
                            {
                                insertCmd.Parameters.Add("@HeroId", MySqlDbType.Int32);
                                insertCmd.Parameters.Add("@Map", MySqlDbType.VarChar);
                                insertCmd.Parameters.Add("@X", MySqlDbType.Int32);
                                insertCmd.Parameters.Add("@Y", MySqlDbType.Int32);
                                foreach (var w in payload.pendingWalls)
                                {
                                    try
                                    {
                                        insertCmd.Parameters["@HeroId"].Value = hero.Id;
                                        insertCmd.Parameters["@Map"].Value = hero.Map ?? "";
                                        insertCmd.Parameters["@X"].Value = w.x;
                                        insertCmd.Parameters["@Y"].Value = w.y;
                                        await insertCmd.ExecuteNonQueryAsync();
                                    }
                                    catch { }
                                }
                            }
                        }

                        if (hero == null)
                        {
                            await transaction.RollbackAsync();
                            return BadRequest("Invalid hero payload");
                        }

                        hero = await UpdateHeroInDB(hero, connection, transaction);
                        MetaHero[]? heroes = await GetNearbyPlayers(hero, connection, transaction);
                        List<MetaEvent> events = await GetEventsFromDb(hero.Map, hero.Id, connection, transaction);
                        // Fetch persistent bike walls for this map and hero level
                        // Return only walls created within the last 10 seconds (recent delta)
                        List<MetaBikeWall> walls = await GetRecentBikeWalls(hero.Map, connection, transaction, hero.Level, 10);

                        // --- Tolerant bike-wall collision detection (server authoritative) ---
                        // Original implementation joined hero & wall tables on map/level causing a collation mismatch when
                        // the two tables had different collations (utf8mb4_unicode_ci vs utf8mb4_0900_ai_ci). We avoid the join
                        // entirely by using the already-fetched hero coordinates/level/map and searching walls only.
                        try
                        {
                            int tolerance = 32; // pixels; adjust as needed
                            // Single query: detect collision while excluding only the hero's most recently created wall
                            // Use MAX(id) subquery instead of LIMIT inside an IN-subquery which older MySQL versions don't support.
                            // This excludes the hero's most recently created wall by id (newest id = MAX(id)).
                            string collideSql =
                            @"SELECT bw.hero_id, bw.x, bw.y
                            FROM maxhanna.ender_bike_wall bw
                            WHERE bw.map = @Map AND bw.level = @Level
                                AND bw.id <> (SELECT IFNULL(MAX(id),0) FROM maxhanna.ender_bike_wall WHERE hero_id = @HeroId)
                                AND @HeroX BETWEEN (bw.x - @Tol) AND (bw.x + @Tol)
                                AND @HeroY BETWEEN (bw.y - @Tol) AND (bw.y + @Tol)
                            LIMIT 1;";
                            using (var colCmd = new MySqlCommand(collideSql, connection, transaction))
                            {
                                colCmd.Parameters.AddWithValue("@Map", hero.Map ?? string.Empty);
                                colCmd.Parameters.AddWithValue("@Level", hero.Level);
                                colCmd.Parameters.AddWithValue("@HeroX", hero.Position?.x ?? 0);
                                colCmd.Parameters.AddWithValue("@HeroY", hero.Position?.y ?? 0);
                                colCmd.Parameters.AddWithValue("@Tol", tolerance);
                                colCmd.Parameters.AddWithValue("@HeroId", hero.Id);
                                var collided = false;
                                using (var rdr = await colCmd.ExecuteReaderAsync())
                                {
                                    if (await rdr.ReadAsync())
                                    {
                                        collided = true;
                                    }
                                }
                                if (collided)
                                {
                                    await KillHeroById(hero.Id, connection, transaction, null);
                                    var deathEvent = new MetaEvent(0, hero.Id, DateTime.UtcNow, "HERO_DIED", hero.Map ?? string.Empty, new Dictionary<string, string>() { { "cause", "BIKE_WALL_COLLIDE" } });
                                    await UpdateEventsInDB(deathEvent, connection, transaction);
                                    heroes = await GetNearbyPlayers(hero, connection, transaction);
                                    events = await GetEventsFromDb(hero.Map ?? string.Empty, hero.Id, connection, transaction);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _ = _log.Db("Bike wall tolerant collision check failed: " + ex.Message, null, "ENDER", true);
                        }

                        await transaction.CommitAsync();
                        return Ok(new
                        {
                            map = hero.Map,
                            heroId = hero.Id,
                            heroPosition = hero.Position,
                            timeOnLevelSeconds = hero.TimeOnLevelSeconds,
                            heroKills = hero.Kills,
                            heroes,
                            events,
                            walls
                        });
                    }
                    catch (Exception ex)
                    {
                        _ = _log.Db("Error in /Ender/FetchGameData: " + ex.Message, null, "ENDER", true);
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }

        [HttpPost("/Ender/FetchInventoryData", Name = "Ender_FetchInventoryData")]
        public async Task<IActionResult> FetchInventoryData([FromBody] int heroId)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        MetaInventoryItem[]? inventory = await GetInventoryFromDB(heroId, connection, transaction);
                        await transaction.CommitAsync();
                        return Ok(new
                        {
                            inventory
                        });
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }

        [HttpPost("/Ender/UpdateEvents", Name = "Ender_UpdateEvents")]
        public async Task<IActionResult> UpdateEvents([FromBody] MetaEvent metaEvent)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = await connection.BeginTransactionAsync())
                {
                    try
                    {
                        await UpdateEventsInDB(metaEvent, connection, transaction);
                        await PerformEventChecks(metaEvent, connection, transaction);

                        await transaction.CommitAsync();
                        return Ok();
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }

        [HttpPost("/Ender/DeleteEvent", Name = "Ender_DeleteEvent")]
        public async Task<IActionResult> DeleteEvent([FromBody] DeleteEventRequest req)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        string sql = @"DELETE FROM maxhanna.ender_event WHERE id = @EventId LIMIT 1;";
                        Dictionary<string, object?> parameters = new Dictionary<string, object?>
                                                {
                                                        { "@EventId", req.EventId },
                                                };
                        await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
                        await transaction.CommitAsync();

                        return Ok();
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }

        [HttpPost("/Ender/UpdateInventory", Name = "Ender_UpdateInventory")]
        public async Task<IActionResult> UpdateInventory([FromBody] UpdateMetaHeroInventoryRequest request)
        {
            if (request.HeroId != 0)
            {
                using (var connection = new MySqlConnection(_connectionString))
                {
                    await connection.OpenAsync();
                    using (var transaction = connection.BeginTransaction())
                    {
                        try
                        {
                            await UpdateInventoryInDB(request, connection, transaction);
                            await transaction.CommitAsync();

                            return Ok();
                        }
                        catch (Exception ex)
                        {
                            await transaction.RollbackAsync();
                            return StatusCode(500, "Internal server error: " + ex.Message);
                        }
                    }
                }
            }
            else return BadRequest("Hero ID must be supplied");
        }

        [HttpPost("/Ender/HeroDied", Name = "Ender_HeroDied")]
        public async Task<IActionResult> HeroDied([FromBody] HeroDiedRequest req)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        // Validate walls server-side if RunStartMs provided; recompute authoritative score = time + walls*10
                        // Compute authoritative time-on-level from the hero's creation time (server-side) and validate walls since then
                        int validatedWalls = req.WallsPlaced;
                        int timeOnLevelSeconds = req.TimeOnLevel;
                        DateTime? heroCreatedAt = null;
                        string? heroMap = null;
                        int heroLevelFromDb = 1;
                        try
                        {
                            // Fetch hero.created_at, map and level from DB for authoritative run start
                            string heroSql = @"SELECT created, map, level FROM maxhanna.ender_hero WHERE id = @HeroId LIMIT 1;";
                            using (var getHeroCmd = new MySqlCommand(heroSql, connection, transaction))
                            {
                                getHeroCmd.Parameters.AddWithValue("@HeroId", req.HeroId);
                                using (var rdr = await getHeroCmd.ExecuteReaderAsync())
                                {
                                    if (await rdr.ReadAsync())
                                    {
                                        heroCreatedAt = rdr.IsDBNull(rdr.GetOrdinal("created")) ? (DateTime?)null : Convert.ToDateTime(rdr["created"]).ToUniversalTime();
                                        heroMap = rdr.IsDBNull(rdr.GetOrdinal("map")) ? null : Convert.ToString(rdr["map"]);
                                        heroLevelFromDb = rdr.IsDBNull(rdr.GetOrdinal("level")) ? 1 : Convert.ToInt32(rdr["level"]);
                                    }
                                }
                            }
                            if (heroCreatedAt != null)
                            {
                                // authoritative time on level = now - hero.created_at
                                timeOnLevelSeconds = Math.Max(0, (int)Math.Floor((DateTime.UtcNow - heroCreatedAt.Value).TotalSeconds));

                                // Count persisted bike walls for this hero that were created at/after heroCreatedAt and on the same level
                                string countSql = @"SELECT COUNT(*) FROM maxhanna.ender_bike_wall WHERE hero_id = @HeroId AND created_at >= @CreatedAt AND level = @Level;";
                                using (var countCmd = new MySqlCommand(countSql, connection, transaction))
                                {
                                    countCmd.Parameters.AddWithValue("@HeroId", req.HeroId);
                                    countCmd.Parameters.AddWithValue("@CreatedAt", heroCreatedAt.Value);
                                    countCmd.Parameters.AddWithValue("@Level", heroLevelFromDb);
                                    var result = await countCmd.ExecuteScalarAsync();
                                    validatedWalls = Convert.ToInt32(result);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _ = _log.Db("Failed to compute authoritative time/walls: " + ex.Message, null, "ENDER", true);
                            // fallback to client-supplied values already present in req
                            timeOnLevelSeconds = req.TimeOnLevel;
                            validatedWalls = req.WallsPlaced;
                        }

                        int authoritativeScore = timeOnLevelSeconds + (validatedWalls * 10);

                        int heroLevel = 1;
                        int kills = 0;
                        try
                        {
                            // attempt to read hero level and kills from DB so we can record them with the score
                            string heroLevelSql = @"SELECT level, kills FROM maxhanna.ender_hero WHERE id = @HeroId LIMIT 1;";
                            using (var lvlCmd = new MySqlCommand(heroLevelSql, connection, transaction))
                            {
                                lvlCmd.Parameters.AddWithValue("@HeroId", req.HeroId);
                                using (var rdr = await lvlCmd.ExecuteReaderAsync())
                                {
                                    if (await rdr.ReadAsync())
                                    {
                                        heroLevel = rdr.IsDBNull(rdr.GetOrdinal("level")) ? 1 : Convert.ToInt32(rdr["level"]);
                                        kills = rdr.IsDBNull(rdr.GetOrdinal("kills")) ? 0 : Convert.ToInt32(rdr["kills"]);
                                    }
                                }
                            }
                        }
                        catch { /* ignore and default to 1/0 */ }

                        // Insert into top scores table (include time on level, walls placed, hero level and kills)
                        // NOTE: ensure your DB has a `kills` INT NOT NULL DEFAULT 0 column on maxhanna.ender_top_scores
                        string insertScoreSql = @"INSERT INTO maxhanna.ender_top_scores (hero_id, user_id, score, time_on_level_seconds, walls_placed, level, kills, created_at) VALUES (@HeroId, @UserId, @Score, @TimeOnLevel, @WallsPlaced, @Level, @Kills, UTC_TIMESTAMP());";
                        Dictionary<string, object?> scoreParams = new Dictionary<string, object?>()
                        {
                            { "@HeroId", req.HeroId },
                            { "@UserId", req.UserId },
                            { "@Score", authoritativeScore },
                            { "@TimeOnLevel", timeOnLevelSeconds },
                            { "@WallsPlaced", validatedWalls },
                            { "@Level", heroLevel },
                            { "@Kills", kills }
                        };
                        await ExecuteInsertOrUpdateOrDeleteAsync(insertScoreSql, scoreParams, connection, transaction);

                        // Delete hero and related rows (inventory, bots, events)
                        string deleteInventory = "DELETE FROM maxhanna.ender_hero_inventory WHERE ender_hero_id = @HeroId;";
                        await ExecuteInsertOrUpdateOrDeleteAsync(deleteInventory, new Dictionary<string, object?>() { { "@HeroId", req.HeroId } }, connection, transaction);

                        string deleteBots = "DELETE FROM maxhanna.ender_bot WHERE hero_id = @HeroId;";
                        await ExecuteInsertOrUpdateOrDeleteAsync(deleteBots, new Dictionary<string, object?>() { { "@HeroId", req.HeroId } }, connection, transaction);

                        string deleteEvents = "DELETE FROM maxhanna.ender_event WHERE hero_id = @HeroId;";
                        string deleteWalls = "DELETE FROM maxhanna.ender_bike_wall WHERE hero_id = @HeroId;";
                        await ExecuteInsertOrUpdateOrDeleteAsync(deleteEvents, new Dictionary<string, object?>() { { "@HeroId", req.HeroId } }, connection, transaction);
                        await ExecuteInsertOrUpdateOrDeleteAsync(deleteWalls, new Dictionary<string, object?>() { { "@HeroId", req.HeroId } }, connection, transaction);

                        string deleteHero = "DELETE FROM maxhanna.ender_hero WHERE id = @HeroId LIMIT 1;";
                        await ExecuteInsertOrUpdateOrDeleteAsync(deleteHero, new Dictionary<string, object?>() { { "@HeroId", req.HeroId } }, connection, transaction);

                        // After removing the dead hero, check remaining heroes on the same map & level
                        try
                        {
                            if (!string.IsNullOrEmpty(heroMap))
                            {
                                string countSql = @"SELECT COUNT(*) FROM maxhanna.ender_hero WHERE map = @Map AND level = @Level;";
                                int remaining = 0;
                                using (var countCmd = new MySqlCommand(countSql, connection, transaction))
                                {
                                    countCmd.Parameters.AddWithValue("@Map", heroMap);
                                    countCmd.Parameters.AddWithValue("@Level", heroLevelFromDb);
                                    var cnt = await countCmd.ExecuteScalarAsync();
                                    remaining = Convert.ToInt32(cnt);
                                }

                                if (remaining == 1)
                                {
                                    // find the surviving hero and increment their level
                                    int survivorId = 0;
                                    string findSql = @"SELECT id, level FROM maxhanna.ender_hero WHERE map = @Map AND level = @Level LIMIT 1;";
                                    using (var findCmd = new MySqlCommand(findSql, connection, transaction))
                                    {
                                        findCmd.Parameters.AddWithValue("@Map", heroMap);
                                        findCmd.Parameters.AddWithValue("@Level", heroLevelFromDb);
                                        using (var rdr = await findCmd.ExecuteReaderAsync())
                                        {
                                            if (await rdr.ReadAsync())
                                            {
                                                survivorId = Convert.ToInt32(rdr["id"]);
                                                // level value read below
                                            }
                                        }
                                    }

                                    if (survivorId != 0)
                                    {
                                        string updSql = @"UPDATE maxhanna.ender_hero SET level = level + 1 WHERE id = @SurvivorId LIMIT 1; DELETE FROM maxhanna.ender_bike_wall WHERE level = @Level;";
                                        var parms = new Dictionary<string, object?>() {
                                            { "@SurvivorId", survivorId },
                                            { "@Level", heroLevelFromDb },
                                        };
                                        await ExecuteInsertOrUpdateOrDeleteAsync(updSql, parms, connection, transaction);

                                        // read new level
                                        int newLevel = heroLevelFromDb + 1;
                                        try
                                        {
                                            var metaEvent = new DataContracts.Ender.MetaEvent(0, survivorId, DateTime.UtcNow, "LEVEL_UP", heroMap ?? "", new Dictionary<string, string>() { { "level", newLevel.ToString() } });
                                            await UpdateEventsInDB(metaEvent, connection, transaction);
                                        }
                                        catch { }
                                    }
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _ = _log.Db("Error checking/incrementing survivor level: " + ex.Message, null, "ENDER", true);
                        }

                        await transaction.CommitAsync();
                        return Ok();
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }

        [HttpPost("/Ender/Create", Name = "Ender_CreateHero")]
        public async Task<IActionResult> CreateHero([FromBody] CreateMetaHeroRequest req)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        string sql = @"INSERT INTO maxhanna.ender_hero (name, user_id, coordsX, coordsY, speed, level, color)
                                                    SELECT @Name, @UserId, @CoordsX, @CoordsY, @Speed, @Level, @Color
                                                    WHERE NOT EXISTS (
                                                            SELECT 1 FROM maxhanna.ender_hero WHERE user_id = @UserId OR name = @Name
                                                    );";
                        // Choose a random starting location that doesn't collide with other heroes or bike walls
                        int mapSize = 100; // grid size used for random spawn

                        // occupied hero spots
                        var occupiedSpots = new HashSet<(int X, int Y)>();
                        string occSql = "SELECT coordsX AS cx, coordsY AS cy FROM maxhanna.ender_hero;";
                        using (var occCmd = new MySqlCommand(occSql, connection, transaction))
                        {
                            using var occReader = await occCmd.ExecuteReaderAsync();
                            while (await occReader.ReadAsync())
                            {
                                occupiedSpots.Add((occReader.IsDBNull(occReader.GetOrdinal("cx")) ? 0 : occReader.GetInt32("cx"),
                                                   occReader.IsDBNull(occReader.GetOrdinal("cy")) ? 0 : occReader.GetInt32("cy")));
                            }
                        }

                        // bike wall spots (only for starting map/level)
                        var bikeWallSpots = new HashSet<(int X, int Y)>();
                        string bikeSql = "SELECT x AS bx, y AS byy FROM maxhanna.ender_bike_wall WHERE map = @Map AND level = @Level;";
                        using (var bikeCmd = new MySqlCommand(bikeSql, connection, transaction))
                        {
                            bikeCmd.Parameters.AddWithValue("@Map", "HeroRoom");
                            bikeCmd.Parameters.AddWithValue("@Level", 1);
                            using var bikeReader = await bikeCmd.ExecuteReaderAsync();
                            while (await bikeReader.ReadAsync())
                            {
                                bikeWallSpots.Add((bikeReader.IsDBNull(bikeReader.GetOrdinal("bx")) ? 0 : bikeReader.GetInt32("bx"),
                                           bikeReader.IsDBNull(bikeReader.GetOrdinal("byy")) ? 0 : bikeReader.GetInt32("byy")));
                            }
                        }

                        var allSpots = Enumerable.Range(0, mapSize).SelectMany(x => Enumerable.Range(0, mapSize).Select(y => (X: x, Y: y))).ToList();
                        var availableSpots = allSpots.Where(s => !occupiedSpots.Contains((s.X, s.Y)) && !bikeWallSpots.Contains((s.X, s.Y))).ToList();

                        int posX = 1 * 16;
                        int posY = 11 * 16;
                        if (availableSpots.Any())
                        {
                            var rand = new Random();
                            var sel = availableSpots[rand.Next(availableSpots.Count)];
                            posX = sel.X;
                            posY = sel.Y;
                        }

                        Dictionary<string, object?> parameters = new Dictionary<string, object?>
                                                {
                                                        { "@CoordsX", posX },
                                                        { "@CoordsY", posY },
                                                        { "@Speed", 1 },
                                                        { "@Name", req.Name ?? "Anonymous"},
                                                        { "@UserId", req.UserId},
                                                        { "@Level", 1 },
                                                        { "@Color", req.Color ?? "#00a0c8" }
                                                };
                        long? botId = await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);

                        // Persist last character name to user_settings
                        try
                        {
                            string upsertNameSql = @"INSERT INTO maxhanna.user_settings (user_id, last_character_name, last_character_color) VALUES (@UserId, @Name, @Color)
                                                      ON DUPLICATE KEY UPDATE last_character_name = VALUES(last_character_name), last_character_color = VALUES(last_character_color);";
                            await ExecuteInsertOrUpdateOrDeleteAsync(upsertNameSql, new Dictionary<string, object?>() {
                                { "@UserId", req.UserId },
                                { "@Name", req.Name ?? "" },
                                { "@Color", req.Color ?? "#00a0c8" }
                            }, connection, transaction);
                        }
                        catch { }
                        await transaction.CommitAsync();

                        MetaHero hero = new MetaHero();
                        hero.Position = new Vector2(posX, posY);
                        hero.Id = (int)botId;
                        hero.Speed = 1;
                        hero.Map = "HeroRoom";
                        hero.Name = req.Name;
                        return Ok(hero);
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        } 

        [HttpPost("/Ender/TopScores", Name = "Ender_TopScores")]
        public async Task<IActionResult> TopScores([FromBody] int limit)
        {
            if (limit <= 0) limit = 50;
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        string sql = @"SELECT t.id, t.hero_id, t.user_id, t.score, t.time_on_level_seconds, t.walls_placed, t.level, IFNULL(t.kills,0) AS kills, t.created_at,
                                       u.id as user_id_fk, u.username, u.created as user_created, udp.file_id as display_picture_file_id
                                       FROM maxhanna.ender_top_scores t
                                       LEFT JOIN users u ON u.id = t.user_id
                                       LEFT JOIN user_display_pictures udp ON u.id = udp.user_id
                                       ORDER BY t.score DESC LIMIT @Limit;";
                        var result = new List<Dictionary<string, object?>>();
                        using (var command = new MySqlCommand(sql, connection, transaction))
                        {
                            command.Parameters.AddWithValue("@Limit", limit);
                            using (var reader = await command.ExecuteReaderAsync())
                            {
                                while (await reader.ReadAsync())
                                {
                                    var row = new Dictionary<string, object?>();
                                    row["id"] = reader.GetInt32("id");
                                    row["hero_id"] = reader.GetInt32("hero_id");
                                    row["user_id"] = reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32("user_id");
                                    row["score"] = reader.GetInt32("score");
                                    row["time_on_level_seconds"] = reader.IsDBNull(reader.GetOrdinal("time_on_level_seconds")) ? 0 : reader.GetInt32("time_on_level_seconds");
                                    row["walls_placed"] = reader.IsDBNull(reader.GetOrdinal("walls_placed")) ? 0 : reader.GetInt32("walls_placed");
                                    row["kills"] = reader.IsDBNull(reader.GetOrdinal("kills")) ? 0 : reader.GetInt32("kills");
                                    row["created_at"] = reader.GetDateTime("created_at");
                                    row["level"] = reader.IsDBNull(reader.GetOrdinal("level")) ? 1 : reader.GetInt32("level");

                                    if (!reader.IsDBNull(reader.GetOrdinal("user_id_fk")))
                                    {
                                        // Construct a typed User object like WordlerController does
                                        var tmpUser = new User();
                                        tmpUser.Id = reader.GetInt32("user_id_fk");
                                        tmpUser.Username = reader.IsDBNull(reader.GetOrdinal("username")) ? null : reader.GetString("username");
                                        tmpUser.Created = reader.IsDBNull(reader.GetOrdinal("user_created")) ? (DateTime?)null : reader.GetDateTime("user_created");
                                        try
                                        {
                                            if (!reader.IsDBNull(reader.GetOrdinal("display_picture_file_id")))
                                            {
                                                var fileId = reader.GetInt32("display_picture_file_id");
                                                tmpUser.DisplayPictureFile = new FileEntry(fileId);
                                            }
                                        }
                                        catch { }
                                        row["user"] = tmpUser;
                                    }

                                    result.Add(row);
                                }
                            }
                        }
                        await transaction.CommitAsync();
                        return Ok(result);
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }

        [HttpPost("/Ender/TopScoresToday", Name = "Ender_TopScoresToday")]
        public async Task<IActionResult> TopScoresToday([FromBody] int limit)
        {
            if (limit <= 0) limit = 50;
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        // Use UTC dates to match stored created_at
                        string sql = @"SELECT t.id, t.hero_id, t.user_id, t.score, t.time_on_level_seconds, t.walls_placed, t.level, IFNULL(t.kills,0) AS kills, t.created_at,
                                       u.id as user_id_fk, u.username, u.created as user_created, udp.file_id as display_picture_file_id
                                       FROM maxhanna.ender_top_scores t
                                       LEFT JOIN users u ON u.id = t.user_id
                                       LEFT JOIN user_display_pictures udp ON u.id = udp.user_id
                                       WHERE DATE(t.created_at) = DATE(UTC_TIMESTAMP())
                                       ORDER BY t.score DESC LIMIT @Limit;";
                        var result = new List<Dictionary<string, object?>>();
                        using (var command = new MySqlCommand(sql, connection, transaction))
                        {
                            command.Parameters.AddWithValue("@Limit", limit);
                            using (var reader = await command.ExecuteReaderAsync())
                            {
                                while (await reader.ReadAsync())
                                {
                                    var row = new Dictionary<string, object?>();
                                    row["id"] = reader.GetInt32("id");
                                    row["hero_id"] = reader.GetInt32("hero_id");
                                    row["user_id"] = reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32("user_id");
                                    row["score"] = reader.GetInt32("score");
                                    row["time_on_level_seconds"] = reader.IsDBNull(reader.GetOrdinal("time_on_level_seconds")) ? 0 : reader.GetInt32("time_on_level_seconds");
                                    row["walls_placed"] = reader.IsDBNull(reader.GetOrdinal("walls_placed")) ? 0 : reader.GetInt32("walls_placed");
                                    row["kills"] = reader.IsDBNull(reader.GetOrdinal("kills")) ? 0 : reader.GetInt32("kills");
                                    row["created_at"] = reader.GetDateTime("created_at");
                                    row["level"] = reader.IsDBNull(reader.GetOrdinal("level")) ? 1 : reader.GetInt32("level");

                                    if (!reader.IsDBNull(reader.GetOrdinal("user_id_fk")))
                                    {
                                        var userObj = new Dictionary<string, object?>();
                                        userObj["id"] = reader.GetInt32("user_id_fk");
                                        userObj["username"] = reader.IsDBNull(reader.GetOrdinal("username")) ? null : reader.GetString("username");
                                        userObj["created"] = reader.IsDBNull(reader.GetOrdinal("user_created")) ? null : reader.GetDateTime("user_created");
                                        try
                                        {
                                            if (!reader.IsDBNull(reader.GetOrdinal("display_picture_file_id")))
                                            {
                                                var fileId = reader.GetInt32("display_picture_file_id");
                                                userObj["displayPictureFile"] = new FileEntry(fileId);
                                            }
                                        }
                                        catch { }
                                        row["user"] = userObj;
                                    }

                                    result.Add(row);
                                }
                            }
                        }
                        await transaction.CommitAsync();
                        return Ok(result);
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }

        [HttpPost("/Ender/TopScoresForUser", Name = "Ender_TopScoresForUser")]
        public async Task<IActionResult> TopScoresForUser([FromBody] int userId)
        {
            if (userId <= 0) return BadRequest("Invalid user id");
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        string sql = @"SELECT t.id, t.hero_id, t.user_id, t.score, t.time_on_level_seconds, t.walls_placed, t.level, IFNULL(t.kills,0) AS kills, t.created_at,
                                       u.id as user_id_fk, u.username, u.created as user_created, udp.file_id as display_picture_file_id
                                       FROM maxhanna.ender_top_scores t
                                       LEFT JOIN users u ON u.id = t.user_id
                                       LEFT JOIN user_display_pictures udp ON u.id = udp.user_id
                                       WHERE t.user_id = @UserId
                                       ORDER BY t.score DESC LIMIT 200;";
                        var result = new List<Dictionary<string, object?>>();
                        using (var command = new MySqlCommand(sql, connection, transaction))
                        {
                            command.Parameters.AddWithValue("@UserId", userId);
                            using (var reader = await command.ExecuteReaderAsync())
                            {
                                while (await reader.ReadAsync())
                                {
                                    var row = new Dictionary<string, object?>();
                                    row["id"] = reader.GetInt32("id");
                                    row["hero_id"] = reader.GetInt32("hero_id");
                                    row["user_id"] = reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32("user_id");
                                    row["score"] = reader.GetInt32("score");
                                    row["time_on_level_seconds"] = reader.IsDBNull(reader.GetOrdinal("time_on_level_seconds")) ? 0 : reader.GetInt32("time_on_level_seconds");
                                    row["walls_placed"] = reader.IsDBNull(reader.GetOrdinal("walls_placed")) ? 0 : reader.GetInt32("walls_placed");
                                    row["created_at"] = reader.GetDateTime("created_at");
                                    row["level"] = reader.IsDBNull(reader.GetOrdinal("level")) ? 1 : reader.GetInt32("level");

                                    if (!reader.IsDBNull(reader.GetOrdinal("user_id_fk")))
                                    {
                                        var userObj = new Dictionary<string, object?>();
                                        userObj["id"] = reader.GetInt32("user_id_fk");
                                        userObj["username"] = reader.IsDBNull(reader.GetOrdinal("username")) ? null : reader.GetString("username");
                                        userObj["created"] = reader.IsDBNull(reader.GetOrdinal("user_created")) ? null : reader.GetDateTime("user_created");
                                        try
                                        {
                                            if (!reader.IsDBNull(reader.GetOrdinal("display_picture_file_id")))
                                            {
                                                var fileId = reader.GetInt32("display_picture_file_id");
                                                userObj["displayPictureFile"] = new FileEntry(fileId);
                                            }
                                        }
                                        catch { }
                                        row["user"] = userObj;
                                    }

                                    result.Add(row);
                                }
                            }
                        }
                        await transaction.CommitAsync();
                        return Ok(result);
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }

        [HttpPost("/Ender/BestForUser", Name = "Ender_BestForUser")]
        public async Task<IActionResult> BestForUser([FromBody] int userId)
        {
            if (userId <= 0) return BadRequest("Invalid user id");
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        // Select the best score for this user. Join to users table to provide basic user info if available.
                        string sql = @"SELECT t.id, t.hero_id, t.user_id, t.score, t.time_on_level_seconds, t.walls_placed, t.level, IFNULL(t.kills,0) AS kills, t.created_at,
                                       u.id as user_id_fk, u.username, u.created as user_created, udp.file_id as display_picture_file_id
                                       FROM maxhanna.ender_top_scores t
                                       LEFT JOIN users u ON u.id = t.user_id
                                       LEFT JOIN user_display_pictures udp ON u.id = udp.user_id
                                       WHERE t.user_id = @UserId
                                       ORDER BY t.score DESC, t.created_at ASC
                                       LIMIT 1;";

                        Dictionary<string, object?> result = new Dictionary<string, object?>();
                        using (var command = new MySqlCommand(sql, connection, transaction))
                        {
                            command.Parameters.AddWithValue("@UserId", userId);
                            using (var reader = await command.ExecuteReaderAsync())
                            {
                                if (await reader.ReadAsync())
                                {
                                    result["id"] = reader.GetInt32("id");
                                    result["hero_id"] = reader.GetInt32("hero_id");
                                    result["user_id"] = reader.GetInt32("user_id");
                                    result["score"] = reader.GetInt32("score");
                                    result["time_on_level_seconds"] = reader.IsDBNull(reader.GetOrdinal("time_on_level_seconds")) ? 0 : reader.GetInt32("time_on_level_seconds");
                                    result["walls_placed"] = reader.IsDBNull(reader.GetOrdinal("walls_placed")) ? 0 : reader.GetInt32("walls_placed");
                                    result["kills"] = reader.IsDBNull(reader.GetOrdinal("kills")) ? 0 : reader.GetInt32("kills");
                                    result["created_at"] = reader.GetDateTime("created_at");
                                    result["level"] = reader.IsDBNull(reader.GetOrdinal("level")) ? 1 : reader.GetInt32("level");

                                    if (!reader.IsDBNull(reader.GetOrdinal("user_id_fk")))
                                    {
                                        var userObj = new Dictionary<string, object?>();
                                        userObj["id"] = reader.GetInt32("user_id_fk");
                                        userObj["username"] = reader.IsDBNull(reader.GetOrdinal("username")) ? null : reader.GetString("username");
                                        userObj["created"] = reader.IsDBNull(reader.GetOrdinal("user_created")) ? null : reader.GetDateTime("user_created");
                                        try
                                        {
                                            if (!reader.IsDBNull(reader.GetOrdinal("display_picture_file_id")))
                                            {
                                                var fileId = reader.GetInt32("display_picture_file_id");
                                                userObj["displayPictureFile"] = new FileEntry(fileId);
                                            }
                                        }
                                        catch { }
                                        result["user"] = userObj;
                                    }
                                }
                            }
                        }

                        await transaction.CommitAsync();
                        return Ok(result);
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }

 

        [HttpPost("/Ender/GetUserPartyMembers", Name = "Ender_GetUserPartyMembers")]
        public async Task<IActionResult> GetUserPartyMembers([FromBody] int userId)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                try
                {
                    // Query to find all hero IDs and names in the party
                    const string sql = @"
                SELECT DISTINCT h.id, h.name, h.color
                FROM (
                    SELECT ender_hero_id_1 AS hero_id
                    FROM ender_hero_party
                    WHERE ender_hero_id_2 = @UserId
                    UNION
                    SELECT ender_hero_id_2 AS hero_id
                    FROM ender_hero_party
                    WHERE ender_hero_id_1 = @UserId
                    UNION
                    SELECT @UserId AS hero_id
                ) AS party_members
                JOIN ender_hero h ON party_members.hero_id = h.id";

                    using (var command = new MySqlCommand(sql, connection))
                    {
                        command.Parameters.AddWithValue("@UserId", userId);
                        var partyMembers = new List<object>();

                        using (var reader = await command.ExecuteReaderAsync())
                        {
                            while (await reader.ReadAsync())
                            {
                                partyMembers.Add(new
                                {
                                    heroId = reader.GetInt32("id"),
                                    name = reader.GetString("name"),
                                    color = reader.IsDBNull(reader.GetOrdinal("color")) ? null : reader.GetString("color")
                                });
                            }
                        }

                        // Return the list of party members with heroId and name
                        return Ok(partyMembers);
                    }
                }
                catch (MySqlException ex)
                {
                    // Log the error (assuming _log.Db exists from previous context)
                    await _log.Db($"Database error in GetUserPartyMembers for userId {userId}: {ex.Message} (Error Code: {ex.Number})", null, "ENDER", true);
                    return StatusCode(500, $"Database error: {ex.Message}");
                }
                catch (Exception ex)
                {
                    // Log unexpected errors
                    await _log.Db($"Unexpected error in GetUserPartyMembers for userId {userId}: {ex.Message}", null, "ENDER", true);
                    return StatusCode(500, $"Internal server error: {ex.Message}");
                }
            }
        }
 
        private async Task<MetaHero> UpdateHeroInDB(MetaHero hero, MySqlConnection connection, MySqlTransaction transaction)
        {
            string sql = @"UPDATE maxhanna.ender_hero 
                            SET coordsX = @CoordsX, 
                                coordsY = @CoordsY, 
                                color = @Color,  
                                mask = @Mask,  
                                map = @Map,
                                speed = @Speed,
                                level = @Level
                            WHERE 
                                id = @HeroId";
            Dictionary<string, object?> parameters = new Dictionary<string, object?>
                        {
                                { "@CoordsX", hero.Position.x },
                                { "@CoordsY", hero.Position.y },
                                { "@Color", hero.Color },
                                { "@Mask", hero.Mask },
                                { "@Map", hero.Map },
                                { "@Speed", hero.Speed },
                                { "@Level", hero.Level },
                                { "@HeroId", hero.Id }
                        };
            await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);

            try
            {
                // attempt to read hero.created timestamp to compute elapsed seconds on level
                string createdSql = @"SELECT created FROM maxhanna.ender_hero WHERE id = @HeroId LIMIT 1;";
                using (var cmd = new MySqlCommand(createdSql, connection, transaction))
                {
                    cmd.Parameters.AddWithValue("@HeroId", hero.Id);
                    var obj = await cmd.ExecuteScalarAsync();
                    if (obj != null && obj != DBNull.Value)
                    {
                        DateTime created = Convert.ToDateTime(obj).ToUniversalTime();
                        hero.TimeOnLevelSeconds = Math.Max(0, (int)Math.Floor((DateTime.UtcNow - created).TotalSeconds));
                    }
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db("Failed to compute TimeOnLevelSeconds: " + ex.Message, null, "ENDER", true);
            }

            // Read current kills for this hero so the client HUD is up-to-date
            try
            {
                string killsSql = @"SELECT IFNULL(kills,0) FROM maxhanna.ender_hero WHERE id = @HeroId LIMIT 1;";
                using (var cmd = new MySqlCommand(killsSql, connection, transaction))
                {
                    cmd.Parameters.AddWithValue("@HeroId", hero.Id);
                    var obj = await cmd.ExecuteScalarAsync();
                    if (obj != null && obj != DBNull.Value)
                    {
                        hero.Kills = Convert.ToInt32(obj);
                    }
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db("Failed to read hero kills: " + ex.Message, null, "ENDER", true);
            }

            return hero;
        }
         
        private async Task UpdateEventsInDB(MetaEvent @event, MySqlConnection connection, MySqlTransaction transaction)
        {
            try
            {
                string sql = @"DELETE FROM maxhanna.ender_event WHERE timestamp < UTC_TIMESTAMP() - INTERVAL 20 SECOND;
                            INSERT INTO maxhanna.ender_event (hero_id, event, map, data)
                            VALUES (@HeroId, @Event, @Map, @Data);";
                Dictionary<string, object?> parameters = new Dictionary<string, object?>
                        {
                                { "@HeroId", @event.HeroId },
                                { "@Event", @event.EventType },
                                { "@Map", @event.Map },
                                { "@Data", Newtonsoft.Json.JsonConvert.SerializeObject(@event.Data) }
                        };
                await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
            }
            catch (Exception ex)
            {
                _ = _log.Db("UpdateEventsInDb failed : " + ex.ToString(), null, "ENDER", true);
            }
        }

        private async Task UpdateInventoryInDB(UpdateMetaHeroInventoryRequest request, MySqlConnection connection, MySqlTransaction transaction)
        {
            if (request.HeroId != 0)
            {
                string sql = @"
                    INSERT INTO ender_hero_inventory (ender_hero_id, name, image, category, quantity) 
                    VALUES (@HeroId, @Name, @Image, @Category, @Quantity)
                    ON DUPLICATE KEY UPDATE 
                        quantity = quantity + @Quantity;";

                Dictionary<string, object?> parameters = new Dictionary<string, object?>
                {
                    { "@HeroId", request.HeroId },
                    { "@Name", request.Name },
                    { "@Image", request.Image },
                    { "@Category", request.Category },
                    { "@Quantity", 1 } // assuming each addition increases quantity by 1
                };

                await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
            }
        }

        private async Task<List<MetaEvent>> GetEventsFromDb(string map, int heroId, MySqlConnection connection, MySqlTransaction transaction)
        {
            if (connection.State != System.Data.ConnectionState.Open)
            {
                await connection.OpenAsync();
            }

            if (transaction == null)
            {
                _ = _log.Db("Exception: GetEventsFromDB Transaction is null.", null, "ENDER", true);
                throw new InvalidOperationException("Transaction is required for this operation.");
            }

            // First, get all party members for the current hero
            List<int> partyMemberIds = new List<int> { heroId }; // Include self
            string partyQuery = @"
        SELECT ender_hero_id_1 AS hero_id FROM ender_hero_party WHERE ender_hero_id_2 = @HeroId
        UNION
        SELECT ender_hero_id_2 AS hero_id FROM ender_hero_party WHERE ender_hero_id_1 = @HeroId";

            using (var partyCmd = new MySqlCommand(partyQuery, connection, transaction))
            {
                partyCmd.Parameters.AddWithValue("@HeroId", heroId);
                using (var partyReader = await partyCmd.ExecuteReaderAsync())
                {
                    while (await partyReader.ReadAsync())
                    {
                        partyMemberIds.Add(Convert.ToInt32(partyReader["hero_id"]));
                    }
                }
            }

            // Now fetch events:
            // 1. All events from current map
            // 2. All CHAT events from party members (regardless of map)
            string sql = @"
    DELETE FROM maxhanna.ender_event WHERE timestamp < UTC_TIMESTAMP() - INTERVAL 20 SECOND;
        
        SELECT *
        FROM maxhanna.ender_event 
        WHERE map = @Map
        OR (event = 'CHAT' AND hero_id IN (" + string.Join(",", partyMemberIds) + "));";

            MySqlCommand cmd = new MySqlCommand(sql, connection, transaction);
            cmd.Parameters.AddWithValue("@Map", map);

            List<MetaEvent> events = new List<MetaEvent>();
            using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (reader.Read())
                {
                    MetaEvent tmpEvent = new MetaEvent(
                            Convert.ToInt32(reader["id"]),
                            Convert.ToInt32(reader["hero_id"]),
                            Convert.ToDateTime(reader["timestamp"]),
                            Convert.ToString(reader["event"]) ?? "",
                            Convert.ToString(reader["map"]) ?? "",
                            Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, string>>(reader.GetString("data")) ?? new Dictionary<string, string>()
                    );
                    events.Add(tmpEvent);
                }
            }

            return events;
        }
        private async Task<MetaHero?> GetHeroData(int userId, int? heroId, MySqlConnection conn, MySqlTransaction transaction)
        {
            // Ensure the connection is open
            if (conn.State != System.Data.ConnectionState.Open)
            {
                await conn.OpenAsync();
            }

            if (transaction == null)
            {
                _ = _log.Db("Exception: GetHeroData Transaction is null.", null, "ENDER", true);
                throw new InvalidOperationException("Transaction is required for this operation.");
            }

            if (userId == 0 && heroId == null)
            {
                return null;
            }

            // Fetch hero, associated metabots, and metabot parts
            string sql = $@"
        SELECT 
            h.id as hero_id, h.coordsX, h.coordsY, h.map, h.speed, h.name as hero_name, h.color as hero_color, h.mask as hero_mask,
                h.level as hero_level, h.kills as hero_kills
        FROM 
            maxhanna.ender_hero h
        WHERE 
            {(heroId == null ? "h.user_id = @UserId" : "h.id = @UserId")}
        ;";

            MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
            cmd.Parameters.AddWithValue("@UserId", heroId != null ? heroId : userId);

            MetaHero? hero = null;

            using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (reader.Read())
                {
                    // Initialize hero if it hasn't been done yet
                    if (hero == null)
                    {
                        hero = new MetaHero
                        {
                            Id = Convert.ToInt32(reader["hero_id"]),
                            Position = new Vector2(Convert.ToInt32(reader["coordsX"]), Convert.ToInt32(reader["coordsY"])),
                            Speed = Convert.ToInt32(reader["speed"]),
                            Map = Convert.ToString(reader["map"]) ?? "",
                            Name = Convert.ToString(reader["hero_name"]),
                            Color = Convert.ToString(reader["hero_color"]) ?? "",
                            Mask = reader.IsDBNull(reader.GetOrdinal("hero_mask")) ? null : Convert.ToInt32(reader["hero_mask"]),
                            Level = reader.IsDBNull(reader.GetOrdinal("hero_level")) ? 1 : Convert.ToInt32(reader["hero_level"]),
                            Kills = reader.IsDBNull(reader.GetOrdinal("hero_kills")) ? 0 : Convert.ToInt32(reader["hero_kills"]),
                        };
                    }
                }
            }

            return hero;
        }

        private async Task<MetaHero[]> GetMetaHeroes(MySqlConnection conn, MySqlTransaction transaction, string heroMapId)
        {
            Dictionary<int, MetaHero> heroesDict = new Dictionary<int, MetaHero>();

            string sql = @"
        SELECT 
            m.id as hero_id, 
            m.name as hero_name,
            m.map as hero_map,
            m.level as hero_level,
            m.coordsX, 
            m.coordsY,
            m.speed, 
            m.color, 
            m.mask
        FROM 
            maxhanna.ender_hero m
        WHERE m.map = @HeroMapId
        ORDER BY m.coordsY ASC;";

            MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
            cmd.Parameters.AddWithValue("@HeroMapId", heroMapId);

            using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    int heroId = Convert.ToInt32(reader["hero_id"]);

                    // Create a new hero if not already in the dictionary
                    if (!heroesDict.TryGetValue(heroId, out MetaHero? tmpHero))
                    {
                        tmpHero = new MetaHero
                        {
                            Id = heroId,
                            Name = Convert.ToString(reader["hero_name"]),
                            Map = Convert.ToString(reader["hero_map"]) ?? "",
                            Color = Convert.ToString(reader["color"]) ?? "",
                            Mask = reader.IsDBNull(reader.GetOrdinal("mask")) ? null : Convert.ToInt32(reader["mask"]),
                            Level = reader.IsDBNull(reader.GetOrdinal("hero_level")) ? 1 : Convert.ToInt32(reader["hero_level"]),
                            Position = new Vector2(Convert.ToInt32(reader["coordsX"]), Convert.ToInt32(reader["coordsY"])),
                            Speed = Convert.ToInt32(reader["speed"]),
                        };
                        heroesDict[heroId] = tmpHero;
                    }
                }
            }

            return heroesDict.Values.ToArray();
        }

        private async Task<MetaHero[]?> GetNearbyPlayers(MetaHero hero, MySqlConnection conn, MySqlTransaction transaction)
        {
            // Ensure the connection is open
            if (conn.State != System.Data.ConnectionState.Open)
            {
                await conn.OpenAsync();
            }
            if (transaction == null)
            {
                _ = _log.Db("Exception: GetNearbyPlayers Transaction is null.", null, "ENDER", true);
                throw new InvalidOperationException("Transaction is required for this operation.");
            }

            Dictionary<int, MetaHero> heroesDict = new Dictionary<int, MetaHero>();
            string sql = @"
        SELECT 
            m.id as hero_id, 
            m.name as hero_name,
            m.map as hero_map,
            m.coordsX, 
            m.coordsY,
            m.speed, 
            m.color, 
            m.mask,
            m.kills as hero_kills
        FROM 
            maxhanna.ender_hero m  
        WHERE m.map = @HeroMapId
        ORDER BY m.coordsY ASC;";

            MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
            cmd.Parameters.AddWithValue("@HeroMapId", hero.Map);

            using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    int heroId = Convert.ToInt32(reader["hero_id"]);

                    // Check if the hero already exists in the dictionary
                    if (!heroesDict.TryGetValue(heroId, out MetaHero? tmpHero))
                    {
                        // Create a new hero if not already in the dictionary
                        tmpHero = new MetaHero
                        {
                            Id = heroId,
                            Name = Convert.ToString(reader["hero_name"]),
                            Map = Convert.ToString(reader["hero_map"]) ?? "",
                            Color = Convert.ToString(reader["color"]) ?? "",
                            Mask = reader.IsDBNull(reader.GetOrdinal("mask")) ? null : Convert.ToInt32(reader["mask"]),
                            Position = new Vector2(Convert.ToInt32(reader["coordsX"]), Convert.ToInt32(reader["coordsY"])),
                            Speed = Convert.ToInt32(reader["speed"]),
                            Kills = reader.IsDBNull(reader.GetOrdinal("hero_kills")) ? 0 : Convert.ToInt32(reader["hero_kills"]),
                        };
                        heroesDict[heroId] = tmpHero;
                    }
                }
            }

            return heroesDict.Values.ToArray();
        }
        private async Task<MetaInventoryItem[]?> GetInventoryFromDB(int heroId, MySqlConnection conn, MySqlTransaction transaction)
        {
            // Ensure the connection is open
            if (conn.State != System.Data.ConnectionState.Open)
            {
                await conn.OpenAsync();
            }
            if (transaction == null)
            {
                _ = _log.Db("Exception: GetInventoryFromDB Transaction is null.", null, "ENDER", true);
                throw new InvalidOperationException("Transaction is required for this operation.");
            }
            List<MetaInventoryItem> inventory = new List<MetaInventoryItem>();
            string sql = @"
                    SELECT *
                    FROM 
                        maxhanna.ender_hero_inventory 
                    WHERE ender_hero_id = @HeroId;";

            MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
            cmd.Parameters.AddWithValue("@HeroId", heroId);

            using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (reader.Read())
                {
                    MetaInventoryItem tmpInventoryItem = new MetaInventoryItem(
                    id: Convert.ToInt32(reader["id"]),
                    heroId: Convert.ToInt32(reader["ender_hero_id"]),
                    created: Convert.ToDateTime(reader["created"]),
                    name: Convert.ToString(reader["name"]),
                    image: Convert.ToString(reader["image"]),
                    category: Convert.ToString(reader["category"]),
                    quantity: reader.IsDBNull(reader.GetOrdinal("quantity")) ? null : Convert.ToInt32(reader["quantity"])
                );

                    inventory.Add(tmpInventoryItem);
                }
            }
            return inventory.ToArray();
        }


        private async Task PerformEventChecks(MetaEvent metaEvent, MySqlConnection connection, MySqlTransaction transaction)
        {
            if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "PARTY_INVITE_ACCEPTED")
            {
                if (metaEvent.Data.TryGetValue("party_members", out var partyJson))
                {
                    try
                    {
                        // Parse the batch JSON string into a list of position updates
                        var partyData = JsonSerializer.Deserialize<List<int>>(partyJson);
                        if (partyData != null && partyData.Count > 0)
                        {
                            await UpdateMetaHeroParty(partyData, connection, transaction);
                        }
                        else
                        {
                            _ = _log.Db("Empty or invalid party data for UPDATE_ENCOPARTY_INVITE_ACCEPTEDUNTER_POSITION", null, "ENDER", true);
                        }
                    }
                    catch (JsonException ex)
                    {
                        _ = _log.Db($"Failed to parse party data for PARTY_INVITE_ACCEPTED: {ex.Message}", null, "ENDER", true);
                    }
                }
                else
                {
                    _ = _log.Db("No batch data found for UPDATE_ENCOUNTER_POSITION", null, "ENDER", true);
                }
            }
            else if (metaEvent != null && metaEvent.EventType == "SPAWN_BIKE_WALL" && metaEvent.Data != null)
            {
                await PersistBikeWallsAndKillNearbyVictims(metaEvent, connection, transaction);
            }
        }

        private async Task PersistBikeWallsAndKillNearbyVictims(MetaEvent? metaEvent, MySqlConnection connection, MySqlTransaction transaction)
        {
            if (metaEvent?.Data?.TryGetValue("x", out var xStr) == true && metaEvent.Data.TryGetValue("y", out var yStr))
            {
                int x = Convert.ToInt32(xStr);
                int y = Convert.ToInt32(yStr);
                try
                {
                    var toKill = await PersistWallAndGetNearby(metaEvent.HeroId, metaEvent.Map ?? "", x, y, connection, transaction);
                    foreach (var victimId in toKill)
                    {
                        try
                        {
                            await KillHeroById(victimId, connection, transaction, metaEvent.HeroId);
                            var deathEvent = new MetaEvent(0, victimId, DateTime.UtcNow, "HERO_DIED", metaEvent.Map ?? "", new Dictionary<string, string>() { { "cause", "BIKE_WALL" }, { "x", x.ToString() }, { "y", y.ToString() } });
                            await UpdateEventsInDB(deathEvent, connection, transaction);
                        }
                        catch (Exception ex)
                        {
                            _ = _log.Db("Failed to kill hero " + victimId + ": " + ex.Message, null, "ENDER", true);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _ = _log.Db("Error checking nearby heroes for SPAWN_BIKE_WALL: " + ex.Message, null, "ENDER", true);
                }
            }
        }

        private async Task<List<int>> PersistWallAndGetNearby(int heroId, string map, int x, int y, MySqlConnection connection, MySqlTransaction transaction)
        {
            int proximity = 64; // pixels (2 grid cells)
            int xmin = x - proximity;
            int xmax = x + proximity;
            int ymin = y - proximity;
            int ymax = y + proximity;

            string combinedSql = @"
            UPDATE maxhanna.ender_hero
            SET coordsX = @X, coordsY = @Y, map = @Map
            WHERE id = @HeroId LIMIT 1;

            INSERT INTO maxhanna.ender_bike_wall (hero_id, map, x, y, level)
            VALUES (@HeroId, @Map, @X, @Y, (SELECT level FROM maxhanna.ender_hero WHERE id = @HeroId LIMIT 1));

            SELECT id FROM maxhanna.ender_hero
            WHERE level = (SELECT level FROM maxhanna.ender_hero WHERE id = @HeroId LIMIT 1)
                AND coordsX BETWEEN @Xmin AND @Xmax
                AND coordsY BETWEEN @Ymin AND @Ymax;";

            using (var cmd = new MySqlCommand(combinedSql, connection, transaction))
            {
                cmd.Parameters.AddWithValue("@HeroId", heroId);
                cmd.Parameters.AddWithValue("@Map", map);
                cmd.Parameters.AddWithValue("@X", x);
                cmd.Parameters.AddWithValue("@Y", y);
                cmd.Parameters.AddWithValue("@Xmin", xmin);
                cmd.Parameters.AddWithValue("@Xmax", xmax);
                cmd.Parameters.AddWithValue("@Ymin", ymin);
                cmd.Parameters.AddWithValue("@Ymax", ymax);

                var nearby = new List<int>();
                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    // iterate through result sets until we hit the SELECT that returns rows
                    do
                    {
                        if (reader.HasRows)
                        {
                            while (await reader.ReadAsync())
                            {
                                nearby.Add(Convert.ToInt32(reader[0]));
                            }
                        }
                    } while (await reader.NextResultAsync());
                }

                return nearby;
            }
        }

        private async Task<List<MetaBikeWall>> GetBikeWalls(string map, MySqlConnection connection, MySqlTransaction transaction, int level = 1, int lastKnownWallId = 0)
        {
            var walls = new List<MetaBikeWall>();
            string sql = @"SELECT id, hero_id, map, x, y, level 
                           FROM maxhanna.ender_bike_wall 
                           WHERE map = @Map AND level = @Level AND id > @LastKnownWallId 
                           ORDER BY id ASC";
            using (var cmd = new MySqlCommand(sql, connection, transaction))
            {
                cmd.Parameters.AddWithValue("@Map", map);
                cmd.Parameters.AddWithValue("@Level", level);
                cmd.Parameters.AddWithValue("@LastKnownWallId", lastKnownWallId);
                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        walls.Add(new MetaBikeWall
                        {
                            Id = reader.GetInt32("id"),
                            HeroId = reader.GetInt32("hero_id"),
                            Map = reader.GetString("map"),
                            X = reader.GetInt32("x"),
                            Y = reader.GetInt32("y"),
                            Level = reader.IsDBNull(reader.GetOrdinal("level")) ? 1 : reader.GetInt32("level")
                        });
                    }
                }
            }
            return walls;
        }

        // Recent walls within a rolling time window (seconds)
        private async Task<List<MetaBikeWall>> GetRecentBikeWalls(string map, MySqlConnection connection, MySqlTransaction transaction, int level = 1, int seconds = 10)
        {
            var walls = new List<MetaBikeWall>();
            // Prefer created_at if exists; fall back to last 500 newest IDs as approximation
            string sql = @"SELECT id, hero_id, map, x, y, level 
                           FROM maxhanna.ender_bike_wall 
                           WHERE map = @Map AND level = @Level AND (created_at >= (UTC_TIMESTAMP() - INTERVAL @Seconds SECOND) OR created_at IS NULL)
                           ORDER BY id ASC";
            using (var cmd = new MySqlCommand(sql, connection, transaction))
            {
                cmd.Parameters.AddWithValue("@Map", map);
                cmd.Parameters.AddWithValue("@Level", level);
                cmd.Parameters.AddWithValue("@Seconds", seconds);
                try
                {
                    using (var reader = await cmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            walls.Add(new MetaBikeWall
                            {
                                Id = reader.GetInt32("id"),
                                HeroId = reader.GetInt32("hero_id"),
                                Map = reader.GetString("map"),
                                X = reader.GetInt32("x"),
                                Y = reader.GetInt32("y"),
                                Level = reader.IsDBNull(reader.GetOrdinal("level")) ? 1 : reader.GetInt32("level")
                            });
                        }
                    }
                }
                catch
                {
                    // Fallback if created_at column doesn't exist
                    return await GetBikeWalls(map, connection, transaction, level, 0);
                }
            }
            return walls;
        }

        [HttpPost("/Ender/AllBikeWalls", Name = "Ender_AllBikeWalls")]
        public async Task<IActionResult> AllBikeWalls([FromBody] int heroId)
        {
            if (heroId <= 0) return BadRequest("Invalid hero id");
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        var hero = await GetHeroData(0, heroId, connection, transaction);
                        if (hero == null)
                        {
                            await transaction.RollbackAsync();
                            return NotFound("Hero not found");
                        }
                        var walls = await GetBikeWalls(hero.Map, connection, transaction, hero.Level, 0);
                        await transaction.CommitAsync();
                        return Ok(walls);
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }

        // Authoritative kill helper used by server-side checks (does not rely on client-supplied time/walls)
        private async Task KillHeroById(int heroId, MySqlConnection connection, MySqlTransaction transaction, int? killerHeroId = null)
        {
            try
            {
                // fetch hero info for score & map
                string selSql = @"SELECT user_id, created, map, level, kills FROM maxhanna.ender_hero WHERE id = @HeroId LIMIT 1;";
                int userId = 0;
                DateTime? createdAt = null;
                string map = "";
                int heroLevel = 1;
                int heroKills = 0;
                using (var cmd = new MySqlCommand(selSql, connection, transaction))
                {
                    cmd.Parameters.AddWithValue("@HeroId", heroId);
                    using (var rdr = await cmd.ExecuteReaderAsync())
                    {
                        if (await rdr.ReadAsync())
                        {
                            userId = rdr.IsDBNull(rdr.GetOrdinal("user_id")) ? 0 : rdr.GetInt32("user_id");
                            createdAt = rdr.IsDBNull(rdr.GetOrdinal("created")) ? (DateTime?)null : Convert.ToDateTime(rdr["created"]).ToUniversalTime();
                            map = rdr.IsDBNull(rdr.GetOrdinal("map")) ? "" : rdr.GetString("map");
                            heroLevel = rdr.IsDBNull(rdr.GetOrdinal("level")) ? 1 : rdr.GetInt32("level");
                            heroKills = rdr.IsDBNull(rdr.GetOrdinal("kills")) ? 0 : rdr.GetInt32("kills");
                        }
                    }
                }

                // compute time on level from createdAt
                int timeOnLevelSeconds = 0;
                if (createdAt != null)
                {
                    timeOnLevelSeconds = Math.Max(0, (int)Math.Floor((DateTime.UtcNow - createdAt.Value).TotalSeconds));
                }

                // count walls persisted for this hero
                int wallsPlaced = 0;

                // count only walls for the hero at the same level
                string countSql = @"SELECT COUNT(*) FROM maxhanna.ender_bike_wall WHERE hero_id = @HeroId AND level = @Level";
                using (var countCmd = new MySqlCommand(countSql, connection, transaction))
                {
                    countCmd.Parameters.AddWithValue("@HeroId", heroId);
                    countCmd.Parameters.AddWithValue("@Level", heroLevel);
                    var cnt = await countCmd.ExecuteScalarAsync();
                    wallsPlaced = Convert.ToInt32(cnt);
                }

                int score = timeOnLevelSeconds + (wallsPlaced * heroKills);

                // record top score (include kills column; default 0)
                string insertScoreSql = @"INSERT INTO maxhanna.ender_top_scores (hero_id, user_id, score, time_on_level_seconds, walls_placed, level, kills, created_at) VALUES (@HeroId, @UserId, @Score, @TimeOnLevel, @WallsPlaced, @Level, @Kills, UTC_TIMESTAMP());";
                await ExecuteInsertOrUpdateOrDeleteAsync(insertScoreSql, new Dictionary<string, object?>() {
                    { "@HeroId", heroId },
                    { "@UserId", userId },
                    { "@Score", score },
                    { "@TimeOnLevel", timeOnLevelSeconds },
                    { "@WallsPlaced", wallsPlaced },
                    { "@Level", heroLevel },
                    { "@Kills", heroKills }
                }, connection, transaction);

                // if a killer is provided, increment their kills counter on their active hero row
                if (killerHeroId != null)
                {
                    try
                    {
                        string updateKillsSql = "UPDATE maxhanna.ender_hero SET kills = IFNULL(kills,0) + 1 WHERE id = @KillerId LIMIT 1;";
                        await ExecuteInsertOrUpdateOrDeleteAsync(updateKillsSql, new Dictionary<string, object?>() { { "@KillerId", killerHeroId } }, connection, transaction);
                    }
                    catch { /* non-fatal */ }
                }

                // remove hero data
                await ExecuteInsertOrUpdateOrDeleteAsync("DELETE FROM maxhanna.ender_hero_inventory WHERE ender_hero_id = @HeroId;", new Dictionary<string, object?>() { { "@HeroId", heroId } }, connection, transaction);
                await ExecuteInsertOrUpdateOrDeleteAsync("DELETE FROM maxhanna.ender_bot WHERE hero_id = @HeroId;", new Dictionary<string, object?>() { { "@HeroId", heroId } }, connection, transaction);
                await ExecuteInsertOrUpdateOrDeleteAsync("DELETE FROM maxhanna.ender_event WHERE hero_id = @HeroId;", new Dictionary<string, object?>() { { "@HeroId", heroId } }, connection, transaction);
                await ExecuteInsertOrUpdateOrDeleteAsync("DELETE FROM maxhanna.ender_bike_wall WHERE hero_id = @HeroId;", new Dictionary<string, object?>() { { "@HeroId", heroId } }, connection, transaction);
                await ExecuteInsertOrUpdateOrDeleteAsync("DELETE FROM maxhanna.ender_hero WHERE id = @HeroId LIMIT 1;", new Dictionary<string, object?>() { { "@HeroId", heroId } }, connection, transaction);
            }
            catch (Exception ex)
            {
                _ = _log.Db("KillHeroById failed: " + ex.Message, null, "ENDER", true);
                throw;
            }
        }

        private async Task UpdateEncounterPositionBatch(List<EncounterPositionUpdate> updates, MySqlConnection connection, MySqlTransaction transaction)
        {
            try
            {
                var sql = new StringBuilder();
                var parameters = new Dictionary<string, object?>();
                int paramIndex = 0;

                foreach (var update in updates)
                {
                    sql.AppendLine($@"
                        UPDATE maxhanna.ender_encounter
                        SET coordsX = @coordsX_{paramIndex}, coordsY = @coordsY_{paramIndex}
                        WHERE hero_id = @heroId_{paramIndex} LIMIT 1;
                    ");

                    parameters.Add($"@heroId_{paramIndex}", update.HeroId);
                    parameters.Add($"@coordsX_{paramIndex}", update.DestinationX);
                    parameters.Add($"@coordsY_{paramIndex}", update.DestinationY);
                    paramIndex++;
                }

                if (sql.Length > 0)
                {
                    try
                    {
                        await ExecuteInsertOrUpdateOrDeleteAsync(sql.ToString(), parameters, connection, transaction);
                        //_ = _log.Db($"Updated {updates.Count} encounter positions in batch", null, "META", true);
                    }
                    catch (Exception ex)
                    {
                        // If you want to debug individual updates, do it here:
                        _ = _log.Db("Batch update failed. Attempting individual updates for debugging... " + ex.Message, null, "ENDER", true);

                        foreach (var update in updates)
                        {
                            try
                            {
                                const string singleUpdateSql = @"
                                    UPDATE maxhanna.ender_encounter
                                    SET coordsX = @coordsX, coordsY = @coordsY
                                    WHERE hero_id = @heroId LIMIT 1;
                                ";

                                var singleParams = new Dictionary<string, object?>
                                {
                                    { "@heroId", update.HeroId },
                                    { "@coordsX", update.DestinationX },
                                    { "@coordsY", update.DestinationY }
                                };

                                await ExecuteInsertOrUpdateOrDeleteAsync(singleUpdateSql, singleParams, connection, transaction);
                                _ = _log.Db($"Successfully updated hero_id {update.HeroId}", null, "ENDER", true);
                            }
                            catch (Exception innerEx)
                            {
                                _ = _log.Db($"Failed to update hero_id {update.HeroId}: {innerEx.Message}", null, "ENDER", true);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error updating batch encounter positions: {ex.Message}", null, "ENDER", true);
                throw;
            }
        }
        private async Task UpdateMetaHeroParty(List<int>? partyData, MySqlConnection connection, MySqlTransaction transaction)
        {
            try
            {
                // Validate input
                if (partyData == null || partyData.Count < 2)
                {
                    await _log.Db("Party data is null or has fewer than 2 members for PARTY_INVITE_ACCEPTED", null, "ENDER", true);
                    return;
                }

                // Extract hero IDs (assuming MetaHero has an Id property)
                var heroIds = partyData.Distinct().ToList();
                if (heroIds.Count < 2)
                {
                    await _log.Db("Fewer than 2 unique hero IDs in party data for PARTY_INVITE_ACCEPTED", null, "ENDER", true);
                    return;
                }

                // Step 1: Delete existing party records for these heroes to avoid duplicates
                const string deleteQuery = @"
            DELETE FROM ender_hero_party 
            WHERE ender_hero_id_1 IN (@heroId1) OR ender_hero_id_2 IN (@heroId2)";

                using (var deleteCommand = new MySqlCommand(deleteQuery, connection, transaction))
                {
                    // Create a comma-separated list of hero IDs for the IN clause
                    var heroIdParams = string.Join(",", heroIds.Select((_, index) => $"@hero{index}"));
                    deleteCommand.CommandText = deleteQuery.Replace("@heroId1", heroIdParams).Replace("@heroId2", heroIdParams);

                    // Add parameters for each hero ID
                    for (int i = 0; i < heroIds.Count; i++)
                    {
                        deleteCommand.Parameters.AddWithValue($"@hero{i}", heroIds[i]);
                    }

                    await deleteCommand.ExecuteNonQueryAsync();
                }

                // Step 2: Insert new party records (all pairwise combinations of heroes)
                const string insertQuery = @"
            INSERT INTO ender_hero_party (ender_hero_id_1, ender_hero_id_2)
            VALUES (@heroId1, @heroId2)";

                using (var insertCommand = new MySqlCommand(insertQuery, connection, transaction))
                {
                    // Insert each pair of heroes (avoiding self-pairs and duplicates)
                    for (int i = 0; i < heroIds.Count; i++)
                    {
                        for (int j = i + 1; j < heroIds.Count; j++)
                        {
                            insertCommand.Parameters.Clear();
                            insertCommand.Parameters.AddWithValue("@heroId1", heroIds[i]);
                            insertCommand.Parameters.AddWithValue("@heroId2", heroIds[j]);

                            await insertCommand.ExecuteNonQueryAsync();
                        }
                    }
                }

                // Log success
                await _log.Db($"Successfully updated party with {heroIds.Count} heroes for PARTY_INVITE_ACCEPTED", null, "ENDER", false);
            }
            catch (MySqlException ex)
            {
                await _log.Db($"Database error while updating party for PARTY_INVITE_ACCEPTED: {ex.Message}", null, "ENDER", true);
                throw; // Re-throw to allow transaction rollback
            }
            catch (Exception ex)
            {
                await _log.Db($"Unexpected error while updating party for PARTY_INVITE_ACCEPTED: {ex.Message}", null, "ENDER", true);
                throw; // Re-throw to allow transaction rollback
            }
        }

        private async Task Unparty(int heroId, MySqlConnection connection, MySqlTransaction transaction)
        {
            try
            {
                const string deleteQuery = @"
                    DELETE FROM ender_hero_party 
                    WHERE ender_hero_id_1 IN (@heroId) OR ender_hero_id_2 IN (@heroId)";

                using (var deleteCommand = new MySqlCommand(deleteQuery, connection, transaction))
                {
                    deleteCommand.Parameters.AddWithValue("@heroId", heroId);
                    await deleteCommand.ExecuteNonQueryAsync();
                }

                // Log success
                await _log.Db($"Successfully updated party with {heroId}", null, "ENDER", false);
            }
            catch (MySqlException ex)
            {
                await _log.Db($"Database error while updating party for heroId {heroId}: {ex.Message}", null, "ENDER", true);
                throw; // Re-throw to allow transaction rollback
            }
            catch (Exception ex)
            {
                await _log.Db($"Unexpected error while updating party for heroId {heroId}: {ex.Message}", null, "ENDER", true);
                throw; // Re-throw to allow transaction rollback
            }
        }

        private async Task<long?> ExecuteInsertOrUpdateOrDeleteAsync(string sql, Dictionary<string, object?> parameters, MySqlConnection? connection = null, MySqlTransaction? transaction = null)
        {
            string cmdText = "";
            bool createdConnection = false;
            long? insertedId = null;
            int rowsAffected = 0;
            try
            {
                if (connection == null)
                {
                    connection = new MySqlConnection(_connectionString);
                    await connection.OpenAsync();
                    createdConnection = true;
                }

                if (connection.State != System.Data.ConnectionState.Open)
                {
                    throw new Exception("Connection failed to open.");
                }

                using (MySqlCommand cmdUpdate = new MySqlCommand(sql, connection, transaction))
                {
                    if (cmdUpdate == null)
                    {
                        throw new Exception("MySqlCommand object initialization failed.");
                    }

                    foreach (var param in parameters)
                    {
                        if (param.Value == null)
                        {
                            cmdUpdate.Parameters.AddWithValue(param.Key, DBNull.Value);
                        }
                        else
                        {
                            cmdUpdate.Parameters.AddWithValue(param.Key, param.Value);
                        }
                    }

                    cmdText = cmdUpdate.CommandText;
                    rowsAffected = await cmdUpdate.ExecuteNonQueryAsync();

                    if (sql.Trim().StartsWith("INSERT", StringComparison.OrdinalIgnoreCase))
                    {
                        insertedId = cmdUpdate.LastInsertedId;
                    }
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db("Update ERROR: " + ex.Message, null, "ENDER", true);
                _ = _log.Db(cmdText, null, "ENDER", true);
                foreach (var param in parameters)
                {
                    _ = _log.Db("Param: " + param.Key + ": " + param.Value, null, "ENDER", true);
                }
            }
            finally
            {
                if (createdConnection && connection != null)
                {
                    await connection.CloseAsync();
                }
            }

            return insertedId ?? rowsAffected;
        }
    }
}