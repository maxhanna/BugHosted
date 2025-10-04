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
        public async Task<IActionResult> FetchGameData([FromBody] MetaHero hero)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        hero = await UpdateHeroInDB(hero, connection, transaction);
                        MetaHero[]? heroes = await GetNearbyPlayers(hero, connection, transaction);
                        MetaBot[]? enemyBots = await GetEncounterMetaBots(connection, transaction, hero.Map);
                        List<MetaEvent> events = await GetEventsFromDb(hero.Map, hero.Id, connection, transaction);
                        // Fetch persistent bike walls for this map
                        List<MetaBikeWall> walls = await GetBikeWalls(hero.Map, connection, transaction);
                        await transaction.CommitAsync();
                        return Ok(new
                        {
                            map = hero.Map,
                            hero.Position,
                            heroes,
                            events,
                            enemyBots,
                            walls
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
                        MetaBotPart[]? parts = await GetMetabotPartsFromDB(heroId, connection, transaction);
                        await transaction.CommitAsync();
                        return Ok(new
                        {
                            inventory,
                            parts
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
                            string heroSql = @"SELECT created_at, map, level FROM maxhanna.ender_hero WHERE id = @HeroId LIMIT 1;";
                            using (var getHeroCmd = new MySqlCommand(heroSql, connection, transaction))
                            {
                                getHeroCmd.Parameters.AddWithValue("@HeroId", req.HeroId);
                                using (var rdr = await getHeroCmd.ExecuteReaderAsync())
                                {
                                    if (await rdr.ReadAsync())
                                    {
                                        heroCreatedAt = rdr.IsDBNull(rdr.GetOrdinal("created_at")) ? (DateTime?)null : Convert.ToDateTime(rdr["created_at"]).ToUniversalTime();
                                        heroMap = rdr.IsDBNull(rdr.GetOrdinal("map")) ? null : Convert.ToString(rdr["map"]);
                                        heroLevelFromDb = rdr.IsDBNull(rdr.GetOrdinal("level")) ? 1 : Convert.ToInt32(rdr["level"]);
                                    }
                                }
                            }
                            if (heroCreatedAt != null)
                            {
                                // authoritative time on level = now - hero.created_at
                                timeOnLevelSeconds = Math.Max(0, (int)Math.Floor((DateTime.UtcNow - heroCreatedAt.Value).TotalSeconds));

                                // Count persisted bike walls for this hero that were created at/after heroCreatedAt
                                string countSql = @"SELECT COUNT(*) FROM maxhanna.ender_bike_wall WHERE hero_id = @HeroId AND created_at >= @CreatedAt;";
                                using (var countCmd = new MySqlCommand(countSql, connection, transaction))
                                {
                                    countCmd.Parameters.AddWithValue("@HeroId", req.HeroId);
                                    countCmd.Parameters.AddWithValue("@CreatedAt", heroCreatedAt.Value);
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
                        try
                        {
                            // attempt to read hero level from DB so we can record it with the score
                            string heroLevelSql = @"SELECT level FROM maxhanna.ender_hero WHERE id = @HeroId LIMIT 1;";
                            using (var lvlCmd = new MySqlCommand(heroLevelSql, connection, transaction))
                            {
                                lvlCmd.Parameters.AddWithValue("@HeroId", req.HeroId);
                                var lvlObj = await lvlCmd.ExecuteScalarAsync();
                                if (lvlObj != null && lvlObj != DBNull.Value) heroLevel = Convert.ToInt32(lvlObj);
                            }
                        }
                        catch { /* ignore and default to 1 */ }

                        // Insert into top scores table (include time on level, walls placed and hero level)
                        string insertScoreSql = @"INSERT INTO maxhanna.ender_top_scores (hero_id, user_id, score, time_on_level_seconds, walls_placed, level, created_at) VALUES (@HeroId, @UserId, @Score, @TimeOnLevel, @WallsPlaced, @Level, NOW());";
                        Dictionary<string, object?> scoreParams = new Dictionary<string, object?>()
                                    {
                                        { "@HeroId", req.HeroId },
                                        { "@UserId", req.UserId },
                                        { "@Score", authoritativeScore },
                                        { "@TimeOnLevel", timeOnLevelSeconds },
                                        { "@WallsPlaced", validatedWalls },
                                        { "@Level", heroLevel }
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
                                        string updSql = @"UPDATE maxhanna.ender_hero SET level = level + 1 WHERE id = @SurvivorId LIMIT 1;";
                                        await ExecuteInsertOrUpdateOrDeleteAsync(updSql, new Dictionary<string, object?>() { { "@SurvivorId", survivorId } }, connection, transaction);

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
                        string sql = @"INSERT INTO maxhanna.ender_hero (name, user_id, coordsX, coordsY, speed, level)
                                                    SELECT @Name, @UserId, @CoordsX, @CoordsY, @Speed, @Level
                                                    WHERE NOT EXISTS (
                                                            SELECT 1 FROM maxhanna.ender_hero WHERE user_id = @UserId OR name = @Name
                                                    );";
                        int posX = 1 * 16;
                        int posY = 11 * 16;
                        Dictionary<string, object?> parameters = new Dictionary<string, object?>
                                                {
                                                        { "@CoordsX", posX },
                                                        { "@CoordsY", posY },
                                                        { "@Speed", 1 },
                                                                                                                { "@Name", req.Name ?? "Anonymous"},
                                                        { "@UserId", req.UserId}
                                                                                                                ,{ "@Level", 1 }
                                                };
                        long? botId = await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
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


        [HttpPost("/Ender/CreateBot", Name = "Ender_CreateBot")]
        public async Task<IActionResult> CreateBot([FromBody] MetaBot bot)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        if (bot.HeroId < 0)
                        {
                            string checkSql = "SELECT COUNT(*) FROM maxhanna.ender_bot WHERE hero_id = @HeroId;";
                            int existingBotCount = 0;

                            using (var command = new MySqlCommand(checkSql, connection, transaction))
                            {
                                command.Parameters.AddWithValue("@HeroId", bot.HeroId);

                                existingBotCount = Convert.ToInt32(await command.ExecuteScalarAsync());
                            }
                            if (Convert.ToInt32(existingBotCount) > 0)
                            {
                                await transaction.CommitAsync();
                                _ = _log.Db("A bot with the same hero_id already exists.", null, "ENDER", true);
                                return BadRequest("A bot with the same hero_id already exists.");
                            }
                        }

                        // Proceed with the bot creation if no existing bot is found, or after deleting extra bots
                        string sql = @"INSERT INTO maxhanna.ender_bot (hero_id, name, type, hp, exp, level, is_deployed) 
                           VALUES (@HeroId, @Name, @Type, @Hp, @Exp, @Level, @IsDeployed);";

                        var parametersForInsert = new Dictionary<string, object?>()
                        {
                                { "@HeroId", bot.HeroId },
                                { "@Name", bot.Name },
                                { "@Type", bot.Type },
                                { "@Hp", bot.Hp },
                                { "@Exp", bot.Exp },
                                { "@Level", bot.Level },
                                { "@IsDeployed", bot.IsDeployed }
                        };

                        long? botId = await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parametersForInsert, connection, transaction);
                        if (botId == null)
                        {
                            _ = _log.Db("Exception: Failed to create metabot, BotId IS NULL.", null, "ENDER", true);
                            throw new Exception("Failed to create MetaBot");
                        }
                        await transaction.CommitAsync();

                        MetaBot heroBot = new MetaBot
                        {
                            Id = (int)botId,
                            HeroId = bot.HeroId,
                            Level = bot.Level,
                            Name = bot.Name,
                            Hp = bot.Hp,
                            Type = bot.Type,
                            IsDeployed = bot.IsDeployed,
                            Head = bot.Head,
                            Legs = bot.Legs,
                            LeftArm = bot.LeftArm,
                            RightArm = bot.RightArm
                        };

                        return Ok(heroBot);
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        _ = _log.Db("CreateBot exception: " + ex.ToString(), null, "ENDER", true);
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
                        string sql = @"SELECT t.id, t.hero_id, t.user_id, t.score, t.time_on_level_seconds, t.walls_placed, t.level, t.created_at,
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
                        string sql = @"SELECT t.id, t.hero_id, t.user_id, t.score, t.time_on_level_seconds, t.walls_placed, t.level, t.created_at,
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
                        string sql = @"SELECT t.id, t.hero_id, t.user_id, t.score, t.time_on_level_seconds, t.walls_placed, t.level, t.created_at,
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
                        string sql = @"SELECT t.id, t.hero_id, t.user_id, t.score, t.time_on_level_seconds, t.walls_placed, t.level, t.created_at,
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


        [HttpPost("/Ender/UpdateBotParts", Name = "Ender_UpdateBotParts")]
        public async Task<IActionResult> UpdateBotParts([FromBody] UpdateBotPartsRequest req)
        {
            if (req.Parts == null || req.Parts.Length == 0)
            {
                return BadRequest("No parts to update.");
            }

            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = await connection.BeginTransactionAsync())
                {
                    try
                    {
                        string sql = @"INSERT INTO maxhanna.ender_bot_part 
                               (hero_id, part_name, type, damage_mod, skill) 
                               VALUES (@HeroId, @PartName, @Type, @DamageMod, @Skill);";

                        foreach (var part in req.Parts)
                        {
                            var parameters = new Dictionary<string, object?>
                                        {
                                                { "@HeroId", req.HeroId },
                                                { "@PartName", part.PartName },
                                                { "@Type", part.Type },
                                                { "@DamageMod", part.DamageMod },
                                                { "@Skill", part.Skill?.Name ?? "Headbutt" }
                                        };

                            await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
                        }

                        await transaction.CommitAsync();
                        return Ok(new { Message = "Bot parts updated successfully." });
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }

        [HttpPost("/Ender/EquipPart", Name = "Ender_EquipPart")]
        public async Task<IActionResult> EquipPart([FromBody] EquipPartRequest req)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        string sql = @"UPDATE maxhanna.ender_bot_part SET metabot_id = @MetabotId WHERE id = @PartId LIMIT 1;";
                        Dictionary<string, object?> parameters = new Dictionary<string, object?> {
                                { "@MetabotId", req.MetabotId },
                                { "@PartId", req.PartId },
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


        [HttpPost("/Ender/UnequipPart", Name = "Ender_UnequipPart")]
        public async Task<IActionResult> UnequipPart([FromBody] EquipPartRequest req)
        {
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        string sql = @"UPDATE maxhanna.ender_bot_part SET metabot_id = NULL WHERE id = @PartId LIMIT 1;";
                        Dictionary<string, object?> parameters = new Dictionary<string, object?>
                        {
                                { "@PartId", req.PartId },
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


        [HttpPost("/Ender/SellBotParts", Name = "Ender_SellBotParts")]
        public async Task<IActionResult> SellBotParts([FromBody] SellBotPartsRequest req)
        {
            if (req.PartIds == null || req.PartIds?.Length == 0)
            {
                return BadRequest("No Metabot Parts to sell.");
            }
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        // Convert PartIds to a comma-separated string of IDs for direct inclusion in SQL
                        var partIds = req.PartIds ?? Array.Empty<int>();
                        var partIdsString = string.Join(",", partIds);

                        // Dynamic SQL with PartIds injected directly
                        string singleSql = $@" 
                            INSERT INTO maxhanna.ender_hero_crypto (hero_id, crypto_balance)
                            SELECT hero_id, SUM(damage_mod * 10)
                            FROM maxhanna.ender_bot_part
                            WHERE id IN ({partIdsString})
                            GROUP BY hero_id
                            ON DUPLICATE KEY UPDATE crypto_balance = crypto_balance + VALUES(crypto_balance);
 
                            DELETE FROM maxhanna.ender_bot_part
                            WHERE id IN ({partIdsString});";

                        using (var command = new MySqlCommand(singleSql, connection, transaction))
                        {
                            await command.ExecuteNonQueryAsync();
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

            return hero;
        }
        private async Task UpdateMetabotInDB(MetaBot metabot, MySqlConnection connection, MySqlTransaction transaction)
        {
            try
            {
                string sql =
                    @"UPDATE maxhanna.ender_bot 
                        SET hp = @HP,  
                                exp = @Exp,
                                level = @Level,
                                is_deployed = @IsDeployed
                        WHERE 
                                id = @MetabotId 
                        LIMIT 1;";

                Dictionary<string, object?> parameters = new Dictionary<string, object?>
        {
            { "@HP", metabot.Hp },
            { "@Exp", metabot.Exp },
            { "@Level", metabot.Level },
            { "@IsDeployed", metabot.IsDeployed ? 1 : 0 } // Convert boolean to bit
        };
                await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
            }
            catch (Exception ex)
            {
                _ = _log.Db("UpdateEventsInDb failed : " + ex.ToString(), null, "ENDER", true);
            }
        }

        private async Task UpdateEventsInDB(MetaEvent @event, MySqlConnection connection, MySqlTransaction transaction)
        {
            try
            {
                string sql = @"DELETE FROM maxhanna.ender_event WHERE timestamp < NOW() - INTERVAL 20 SECOND;
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
        DELETE FROM maxhanna.ender_event WHERE timestamp < NOW() - INTERVAL 20 SECOND;
        
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
                h.level as hero_level,
            b.id as bot_id, b.name as bot_name, b.type as bot_type, b.hp as bot_hp, b.is_deployed as bot_is_deployed,
            b.level as bot_level, b.exp as bot_exp,
            p.id as part_id, p.part_name, p.type as part_type, p.damage_mod, p.skill
        FROM 
            maxhanna.ender_hero h
        LEFT JOIN 
            maxhanna.ender_bot b ON h.id = b.hero_id
        LEFT JOIN
            maxhanna.ender_bot_part p ON b.id = p.metabot_id
        WHERE 
            {(heroId == null ? "h.user_id = @UserId" : "h.id = @UserId")}
        ;";

            MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
            cmd.Parameters.AddWithValue("@UserId", heroId != null ? heroId : userId);

            MetaHero? hero = null;
            Dictionary<int, MetaBot> metabotDict = new Dictionary<int, MetaBot>();

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
                            Metabots = new List<MetaBot>()
                        };
                    }

                    // Check if there's a MetaBot associated with this hero
                    if (!reader.IsDBNull(reader.GetOrdinal("bot_id")))
                    {
                        int botId = Convert.ToInt32(reader["bot_id"]);

                        if (!metabotDict.TryGetValue(botId, out MetaBot? bot))
                        {
                            bot = new MetaBot
                            {
                                Id = botId,
                                Name = Convert.ToString(reader["bot_name"]),
                                Type = Convert.ToInt32(reader["bot_type"]),
                                Hp = Convert.ToInt32(reader["bot_hp"]),
                                Level = Convert.ToInt32(reader["bot_level"]),
                                Exp = Convert.ToInt32(reader["bot_exp"]),
                                IsDeployed = Convert.ToBoolean(reader["bot_is_deployed"]),
                                HeroId = hero.Id
                            };
                            metabotDict[botId] = bot;
                            if (hero.Metabots == null)
                            {
                                hero.Metabots = new List<MetaBot>();
                            }
                            hero.Metabots.Add(bot);
                        }

                        // Check if there's a MetaBotPart associated with this MetaBot
                        if (!reader.IsDBNull(reader.GetOrdinal("part_id")))
                        {
                            MetaBotPart part = new MetaBotPart
                            {
                                HeroId = hero.Id,
                                Id = Convert.ToInt32(reader["part_id"]),
                                PartName = Convert.ToString(reader["part_name"]),
                                Type = Convert.ToInt32(reader["part_type"]),
                                DamageMod = Convert.ToInt32(reader["damage_mod"]),
                                Skill = Convert.ToString(reader["skill"]) == null ? null : new Skill(Convert.ToString(reader["skill"]) ?? "Headbutt", 0),
                            };

                            // Assign the part to the correct property based on its name
                            switch (part.PartName?.ToLower())
                            {
                                case "head":
                                    bot.Head = part;
                                    break;
                                case "legs":
                                    bot.Legs = part;
                                    break;
                                case "left_arm":
                                    bot.LeftArm = part;
                                    break;
                                case "right_arm":
                                    bot.RightArm = part;
                                    break;
                            }
                        }
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
                            Metabots = new List<MetaBot>()
                        };
                        heroesDict[heroId] = tmpHero;
                    }
                }
            }

            return heroesDict.Values.ToArray();
        }

        private async Task<MetaBot[]> GetEncounterMetaBots(MySqlConnection conn, MySqlTransaction transaction, string map)
        {
            var bots = new List<MetaBot>();

            // Step 1: Retrieve hero_ids from ender_encounter table
            string heroIdQuery = "SELECT hero_id FROM maxhanna.ender_encounter WHERE map = @Map;";
            MySqlCommand heroIdCmd = new MySqlCommand(heroIdQuery, conn, transaction);
            heroIdCmd.Parameters.AddWithValue("@Map", map);

            var heroIds = new List<int>();
            using (var heroReader = await heroIdCmd.ExecuteReaderAsync())
            {
                while (await heroReader.ReadAsync())
                {
                    heroIds.Add(Convert.ToInt32(heroReader["hero_id"]));
                }
            }

            // If no hero_ids found, return empty
            if (!heroIds.Any())
                return Array.Empty<MetaBot>();

            // Step 2: Fetch MetaBots and their parts for the found hero_ids
            string sql = @"
    SELECT  
        b.id as metabot_id, 
        b.hero_id as metabot_hero_id, 
        b.name as metabot_name, 
        b.type as metabot_type, 
        b.hp as metabot_hp, 
        b.level as metabot_level, 
        b.exp as metabot_exp,
        b.is_deployed as metabot_is_deployed,
        p.id as part_id, p.part_name, p.type as part_type, p.damage_mod, p.skill,
        e.coordsX, e.coordsY
    FROM
        maxhanna.ender_bot b
    LEFT JOIN
        maxhanna.ender_encounter_bot_part p ON b.hero_id = p.hero_id
    LEFT JOIN
        maxhanna.ender_encounter e ON e.hero_id = b.hero_id
    WHERE b.hero_id IN (" + string.Join(",", heroIds) + ");"; // Inject IDs safely

            MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
            //_ = _log.Db(cmd.CommandText);
            using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    int heroId = Convert.ToInt32(reader["metabot_hero_id"]);

                    // Check if the bot already exists in our list
                    MetaBot? metabot = bots.FirstOrDefault(m => m.Id == Convert.ToInt32(reader["metabot_id"]));
                    if (metabot == null)
                    {
                        metabot = new MetaBot
                        {
                            Id = Convert.ToInt32(reader["metabot_id"]),
                            Name = Convert.ToString(reader["metabot_name"]),
                            HeroId = heroId,
                            Type = Convert.ToInt32(reader["metabot_type"]),
                            Hp = Convert.ToInt32(reader["metabot_hp"]),
                            Exp = Convert.ToInt32(reader["metabot_exp"]),
                            Level = Convert.ToInt32(reader["metabot_level"]),
                            IsDeployed = Convert.ToBoolean(reader["metabot_is_deployed"]),
                            Position = new Vector2(Convert.ToInt32(reader["coordsX"]), Convert.ToInt32(reader["coordsY"]))
                        };
                        bots.Add(metabot);
                    }

                    // If there's a MetaBotPart in this row, assign it
                    if (!reader.IsDBNull(reader.GetOrdinal("part_id")))
                    {
                        MetaBotPart part = new MetaBotPart
                        {
                            HeroId = heroId,
                            Id = Convert.ToInt32(reader["part_id"]),
                            PartName = Convert.ToString(reader["part_name"]),
                            Type = Convert.ToInt32(reader["part_type"]),
                            DamageMod = Convert.ToInt32(reader["damage_mod"]),
                            Skill = !reader.IsDBNull(reader.GetOrdinal("skill")) ? new Skill(reader["skill"].ToString() ?? "Headbutt", 0) : null,
                        };

                        switch (part.PartName?.ToLower())
                        {
                            case "head":
                                metabot.Head = part;
                                break;
                            case "legs":
                                metabot.Legs = part;
                                break;
                            case "left_arm":
                                metabot.LeftArm = part;
                                break;
                            case "right_arm":
                                metabot.RightArm = part;
                                break;
                        }
                    }
                }
            }

            return bots.ToArray();
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
            b.id as metabot_id, 
            b.name as metabot_name, 
            b.type as metabot_type, 
            b.hp as metabot_hp, 
            b.level as metabot_level, 
            b.exp as metabot_exp,
            b.is_deployed as metabot_is_deployed,
            p.id as part_id, p.part_name, p.type as part_type, p.damage_mod, p.skill
        FROM 
            maxhanna.ender_hero m 
        LEFT JOIN
            maxhanna.ender_bot b on b.hero_id = m.id
        LEFT JOIN
            maxhanna.ender_bot_part p ON b.id = p.metabot_id
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
                            Metabots = new List<MetaBot>()
                        };
                        heroesDict[heroId] = tmpHero;
                    }

                    // If there's a MetaBot in this row, add it to the MetaHero's MetaBots list
                    if (!reader.IsDBNull(reader.GetOrdinal("metabot_id")))
                    {
                        int metabotId = Convert.ToInt32(reader["metabot_id"]);

                        MetaBot? metabot = tmpHero.Metabots?.FirstOrDefault(m => m.Id == metabotId);
                        if (metabot == null)
                        {
                            metabot = new MetaBot
                            {
                                Id = metabotId,
                                Name = Convert.ToString(reader["metabot_name"]),
                                HeroId = heroId,
                                Type = Convert.ToInt32(reader["metabot_type"]),
                                Hp = Convert.ToInt32(reader["metabot_hp"]),
                                Exp = Convert.ToInt32(reader["metabot_exp"]),
                                Level = Convert.ToInt32(reader["metabot_level"]),
                                IsDeployed = Convert.ToBoolean(reader["metabot_is_deployed"]),
                            };
                            if (tmpHero.Metabots == null) { tmpHero.Metabots = new List<MetaBot>(); }
                            tmpHero.Metabots.Add(metabot);
                        }

                        // If there's a MetaBotPart in this row, assign it to the correct property
                        if (!reader.IsDBNull(reader.GetOrdinal("part_id")))
                        {
                            MetaBotPart part = new MetaBotPart
                            {
                                HeroId = heroId,
                                Id = Convert.ToInt32(reader["part_id"]),
                                PartName = Convert.ToString(reader["part_name"]),
                                Type = Convert.ToInt32(reader["part_type"]),
                                DamageMod = Convert.ToInt32(reader["damage_mod"]),
                                Skill = Convert.ToString(reader["skill"]) == null ? null : new Skill(Convert.ToString(reader["skill"]) ?? "Headbutt", 0),
                            };

                            // Assign the part to the correct property based on its name
                            switch (part.PartName?.ToLower())
                            {
                                case "head":
                                    metabot.Head = part;
                                    break;
                                case "legs":
                                    metabot.Legs = part;
                                    break;
                                case "left_arm":
                                    metabot.LeftArm = part;
                                    break;
                                case "right_arm":
                                    metabot.RightArm = part;
                                    break;
                            }
                        }
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


        private async Task<MetaBotPart[]?> GetMetabotPartsFromDB(int heroId, MySqlConnection conn, MySqlTransaction transaction)
        {
            // Ensure the connection is open
            if (conn.State != System.Data.ConnectionState.Open)
            {
                await conn.OpenAsync();
            }
            if (transaction == null)
            {
                _ = _log.Db("Transaction is null.", null, "ENDER", true);
                throw new InvalidOperationException("Transaction is required for this operation.");
            }
            List<MetaBotPart> partInv = new List<MetaBotPart>();
            string sql = @"
                    SELECT *
                    FROM 
                        maxhanna.ender_bot_part 
                    WHERE hero_id = @HeroId;";

            MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
            cmd.Parameters.AddWithValue("@HeroId", heroId);

            using (var reader = await cmd.ExecuteReaderAsync())
            {

                while (reader.Read())
                {
                    MetaBotPart tmpPart = new MetaBotPart
                    {
                        Id = Convert.ToInt32(reader["id"]),
                        HeroId = Convert.ToInt32(reader["hero_id"]),
                        MetabotId = reader.IsDBNull(reader.GetOrdinal("metabot_id")) ? null : Convert.ToInt32(reader["metabot_id"]),
                        Created = Convert.ToDateTime(reader["created"]),
                        PartName = Convert.ToString(reader["part_name"]),
                        Skill = new Skill(name: Convert.ToString(reader["skill"]) ?? "Headbutt", type: Convert.ToInt32(reader["type"])),
                        DamageMod = Convert.ToInt32(reader["damage_mod"]),
                    };
                    partInv.Add(tmpPart);
                }
            }
            return partInv.ToArray();
        }

        private async Task RepairAllMetabots(int heroId, MySqlConnection connection, MySqlTransaction transaction)
        {
            string sql = @"UPDATE maxhanna.ender_bot SET hp = 100 WHERE hero_id = @heroId;";

            Dictionary<string, object?> parameters = new Dictionary<string, object?>
            {
                    { "@heroId", heroId },
            };

            await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
        }

        private async Task UpdateEncounterPosition(int encounterId, int destinationX, int destionationY, MySqlConnection connection, MySqlTransaction transaction)
        {
            string sql = @"UPDATE maxhanna.ender_encounter SET coordsX = @coordsX, coordsY = @coordsY WHERE hero_id = @heroId;";

            Dictionary<string, object?> parameters = new Dictionary<string, object?>
            {
                    { "@heroId", encounterId },
                    { "@coordsX", destinationX },
                    { "@coordsY", destionationY },
            };

            await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
        }

        private async Task DeployMetabot(int metabotId, MySqlConnection connection, MySqlTransaction transaction)
        {
            try
            {
                string sql = @"UPDATE maxhanna.ender_bot SET is_deployed = 1 WHERE id = @botId AND hp > 0 LIMIT 1;";

                Dictionary<string, object?> parameters = new Dictionary<string, object?>
                {
                        { "@botId", metabotId },
                };

                await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
            }
            catch (Exception ex)
            {
                _ = _log.Db("Exception DeployMetabot: " + ex.Message, null, "ENDER", true);
            }
        }
        private async Task CallBackMetabot(int heroId, int? metabotId, MySqlConnection connection, MySqlTransaction transaction)
        {
            try
            {
                string sql = @"
        UPDATE maxhanna.ender_bot 
        SET is_deployed = 0 
        WHERE hero_id = @heroId"
                    + (metabotId.HasValue ? " AND id = @botId" : "");

                Dictionary<string, object?> parameters = new Dictionary<string, object?>
                {
                        { "@heroId", heroId },
                };
                if (metabotId.HasValue)
                {
                    parameters.Add("@botId", metabotId.Value);
                }
                await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
            }
            catch (Exception ex)
            {
                _ = _log.Db("Exception DeployMetabot: " + ex.Message, null, "ENDER", true);
            }
        }

        private async Task DestroyMetabot(int heroId, int? metabotId, MySqlConnection connection, MySqlTransaction transaction)
        {
            try
            {
                string sql;
                Dictionary<string, object?> parameters = new Dictionary<string, object?>
                {
                        { "@heroId", heroId },
                };

                // If heroId is negative, perform a DELETE instead of UPDATE
                if (heroId < 0)
                {
                    sql =
                    $@"DELETE FROM maxhanna.ender_bot WHERE hero_id = @heroId {(metabotId.HasValue ? " AND id = @botId" : "")};
                    DELETE FROM maxhanna.ender_encounter_bot_part WHERE hero_id = @heroId;
                    UPDATE maxhanna.ender_encounter SET coordsX = -1, coordsY = -1, last_killed = UTC_TIMESTAMP WHERE hero_id = @heroId;";
                    if (metabotId.HasValue)
                    {
                        parameters.Add("@botId", metabotId.Value);
                    }
                }
                else
                {
                    sql = @$"
                        UPDATE maxhanna.ender_bot 
                        SET is_deployed = 0, hp = 0 
                        WHERE hero_id = @heroId {(metabotId.HasValue ? " AND id = @botId" : "")};";

                    if (metabotId.HasValue)
                    {
                        parameters.Add("@botId", metabotId.Value);
                    }
                }

                await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
            }
            catch (Exception ex)
            {
                _ = _log.Db("Exception DestroyMetabot: " + ex.Message, null, "ENDER", true);
            }
        }

        private async Task PerformEventChecks(MetaEvent metaEvent, MySqlConnection connection, MySqlTransaction transaction)
        {
            if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "TARGET_LOCKED")
            {
                string lockKey = $"{metaEvent.Data["sourceId"]}:{metaEvent.Data["targetId"]}";

                if (!activeLocks.ContainsKey(lockKey))
                {
                    _ = _log.Db($"Starting DPS for {lockKey}", null, "ENDER", true);
                    var sourceId = metaEvent.Data["sourceId"];
                    var targetId = metaEvent.Data["targetId"];
                    var ctsSource = new CancellationTokenSource();
                    activeLocks[lockKey] = ctsSource;

                    _ = StartDamageOverTimeForBot(sourceId, targetId, ctsSource.Token);
                }
            }
            else if (metaEvent != null && metaEvent.EventType == "TARGET_UNLOCK" && metaEvent.Data != null && metaEvent.Data.TryGetValue("sourceId", out var sourceId))
            {
                StopAttackDamageOverTimeForBot(Convert.ToInt32(sourceId), Convert.ToInt32(metaEvent.Data["targetId"]));
            }
            else if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "REPAIR_ALL_METABOTS")
            {
                int heroId = Convert.ToInt32(metaEvent.Data["heroId"]);
                await RepairAllMetabots(heroId, connection, transaction);
            }
            else if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "UNPARTY")
            {
                int heroId = metaEvent.HeroId;
                await Unparty(heroId, connection, transaction);
            }
            else if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "PARTY_INVITE_ACCEPTED")
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
            else if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "UPDATE_ENCOUNTER_POSITION")
            {
                if (metaEvent.Data.TryGetValue("batch", out var batchJson))
                {
                    try
                    {
                        // Parse the batch JSON string into a list of position updates
                        var batchData = JsonSerializer.Deserialize<List<EncounterPositionUpdate>>(batchJson);
                        if (batchData != null && batchData.Count > 0)
                        {
                            await UpdateEncounterPositionBatch(batchData, connection, transaction);
                        }
                        else
                        {
                            _ = _log.Db("Empty or invalid batch data for UPDATE_ENCOUNTER_POSITION", null, "ENDER", true);
                        }
                    }
                    catch (JsonException ex)
                    {
                        _ = _log.Db($"Failed to parse batch data for UPDATE_ENCOUNTER_POSITION: {ex.Message}", null, "ENDER", true);
                    }
                }
                else
                {
                    _ = _log.Db("No batch data found for UPDATE_ENCOUNTER_POSITION", null, "ENDER", true);
                }
            }
            else if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "DEPLOY")
            {
                if (metaEvent.Data.TryGetValue("metaBot", out var metaBotJsonElement))
                {
                    // Parse the metaBot JSON string
                    var metaBotJson = JsonDocument.Parse(metaBotJsonElement.ToString()).RootElement;

                    if (metaBotJson.TryGetProperty("id", out var idElement))
                    {
                        int metabotId = idElement.GetInt32();
                        await DeployMetabot(metabotId, connection, transaction);
                    }
                }
            }
            else if (metaEvent != null && metaEvent.EventType == "CALL_BOT_BACK")
            {
                int heroId = metaEvent.HeroId;
                await CallBackMetabot(heroId, null, connection, transaction);
            }
            else if (metaEvent != null && metaEvent.EventType == "BOT_DESTROYED")
            {
                int heroId = metaEvent.HeroId;
                await DestroyMetabot(heroId, null, connection, transaction);
            }
            else if (metaEvent != null && metaEvent.EventType == "SPAWN_BIKE_WALL" && metaEvent.Data != null)
            {
                // Persist bike wall
                if (metaEvent.Data.TryGetValue("x", out var xStr) && metaEvent.Data.TryGetValue("y", out var yStr))
                {
                    int x = Convert.ToInt32(xStr);
                    int y = Convert.ToInt32(yStr);
                    string sql = @"INSERT INTO maxhanna.ender_bike_wall (hero_id, map, x, y) VALUES (@HeroId, @Map, @X, @Y);";
                    var parameters = new Dictionary<string, object?>
                    {
                        {"@HeroId", metaEvent.HeroId },
                        {"@Map", metaEvent.Map },
                        {"@X", x },
                        {"@Y", y }
                    };
                    await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
                }
            }
        }

        private async Task<List<MetaBikeWall>> GetBikeWalls(string map, MySqlConnection connection, MySqlTransaction transaction)
        {
            var walls = new List<MetaBikeWall>();
            string sql = "SELECT id, hero_id, map, x, y FROM maxhanna.ender_bike_wall WHERE map = @Map";
            using (var cmd = new MySqlCommand(sql, connection, transaction))
            {
                cmd.Parameters.AddWithValue("@Map", map);
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
                            Y = reader.GetInt32("y")
                        });
                    }
                }
            }
            return walls;
        }

        private static void StopAttackDamageOverTimeForBot(int? sourceId, int? targetId)
        {
            string lockKey = $"{sourceId}:{targetId}";
            //_ = _log.Db($"Stopping DPS for {lockKey}");
            if (activeLocks.ContainsKey(lockKey))
            {
                // Cancel DPS for both source and target
                activeLocks[lockKey].Cancel();
                activeLocks.Remove(lockKey);
            }
        }

        private async Task StartDamageOverTimeForBot(string sourceId, string targetId, CancellationToken cancellationToken)
        {
            bool attackerStopped = false;
            while (!cancellationToken.IsCancellationRequested)
            {
                _ = _log.Db($"Applying DPS from {sourceId} to {targetId}", null, "ENDER", true);
                MetaBot? attackingBot = null, defendingBot = null;
                string? attackingBotMap = null;
                string? defendingBotMap = null;

                try
                {
                    using (var connection = new MySqlConnection(_connectionString))
                    {
                        await connection.OpenAsync();
                        using (MySqlTransaction transaction = await connection.BeginTransactionAsync())
                        {
                            // 1. Fetch attacker & defender in a single query with their maps
                            string fetchBotsSql = @"
                                SELECT 
                                    mb.id, 
                                    mb.type, 
                                    mb.exp, 
                                    mb.level, 
                                    mb.hp,
                                    mb.hero_id,
                                    mb.is_deployed,
                                    IF(mb.hero_id > 0, 
                                        (SELECT mh.map FROM maxhanna.ender_hero mh WHERE mh.id = mb.hero_id),
                                        (SELECT me.map FROM maxhanna.ender_encounter me WHERE me.hero_id = mb.hero_id)
                                    ) AS map
                                FROM maxhanna.ender_bot AS mb
                                WHERE mb.id = @SourceId 
                                    OR mb.id = @TargetId;";

                            using (var command = new MySqlCommand(fetchBotsSql, connection, transaction))
                            {
                                command.Parameters.AddWithValue("@SourceId", sourceId);
                                command.Parameters.AddWithValue("@TargetId", targetId);

                                using (var reader = await command.ExecuteReaderAsync())
                                {
                                    while (await reader.ReadAsync())
                                    {
                                        int botId = reader.GetInt32(reader.GetOrdinal("id"));
                                        int botType = reader.GetInt32(reader.GetOrdinal("type"));
                                        int botExp = reader.GetInt32(reader.GetOrdinal("exp"));
                                        int botLevel = reader.GetInt32(reader.GetOrdinal("level"));
                                        int botHp = reader.GetInt32(reader.GetOrdinal("hp"));
                                        int botHeroId = reader.IsDBNull(reader.GetOrdinal("hero_id")) ? 0 : reader.GetInt32(reader.GetOrdinal("hero_id"));
                                        bool botIsDeployed = reader.GetBoolean(reader.GetOrdinal("is_deployed"));
                                        string? botMap = reader.IsDBNull(reader.GetOrdinal("map")) ? null : reader.GetString(reader.GetOrdinal("map"));

                                        var bot = new MetaBot
                                        {
                                            Id = botId,
                                            Type = botType,
                                            Exp = botExp,
                                            Level = botLevel,
                                            Hp = botHp,
                                            HeroId = botHeroId,
                                            IsDeployed = botIsDeployed
                                        };

                                        if (botId == Convert.ToInt32(sourceId))
                                        {
                                            attackingBot = bot;
                                            attackingBotMap = botMap;
                                        }
                                        else
                                        {
                                            defendingBot = bot;
                                            defendingBotMap = botMap;
                                        }
                                    }
                                }
                            }

                            if (attackingBot == null || defendingBot == null)
                            {
                                _ = _log.Db("One or both bots are missing, stopping DPS.", null, "ENDER", true);
                                attackerStopped = true;
                            }

                            // Check if bots are on the same map
                            if (!attackerStopped && (string.IsNullOrEmpty(attackingBotMap) || string.IsNullOrEmpty(defendingBotMap) || attackingBotMap != defendingBotMap))
                            {
                                _ = _log.Db($"Bots are on different maps ({attackingBotMap} vs {defendingBotMap}). Stopping DPS.", null, "ENDER", true);
                                attackerStopped = true;
                            }

                            if (!attackerStopped && attackingBot?.Hp <= 0)
                            {
                                _ = _log.Db($"Attacking bot {sourceId} has died. Stopping DPS.", null, "ENDER", true);
                                attackerStopped = true;
                                await HandleDeadMetabot(attackingBotMap ?? "", defendingBot, attackingBot, connection, transaction);
                            }

                            if (!attackerStopped && defendingBot?.Hp <= 0)
                            {
                                _ = _log.Db($"Defending bot {targetId} has died. Stopping DPS.", null, "ENDER", true);
                                attackerStopped = true;
                                await HandleDeadMetabot(defendingBotMap ?? "", attackingBot, defendingBot, connection, transaction);
                            }

                            if (!attackerStopped)
                            {
                                // 2. Check if a TARGET_UNLOCKED event has occurred for bot
                                string checkEventSql = @"
                            SELECT COUNT(*) 
                            FROM maxhanna.ender_event 
                            WHERE event = 'TARGET_UNLOCKED' 
                                AND (JSON_EXTRACT(data, '$.sourceId') = @SourceId AND JSON_EXTRACT(data, '$.targetId') = @TargetId) 
                                AND timestamp > NOW() - INTERVAL 5 SECOND"; // 5 second window (adjust as needed)

                                int eventCount = 0;

                                using (var command = new MySqlCommand(checkEventSql, connection, transaction))
                                {
                                    command.Parameters.AddWithValue("@SourceId", sourceId);
                                    command.Parameters.AddWithValue("@TargetId", targetId);

                                    eventCount = Convert.ToInt32(await command.ExecuteScalarAsync());
                                }

                                if (eventCount > 0)
                                {
                                    _ = _log.Db("TARGET_UNLOCKED event detected. Stopping DPS for both bots.", null, "ENDER", true);
                                    attackerStopped = true;
                                }

                                if (!attackerStopped && attackingBot != null && defendingBot != null)
                                {
                                    MetaBotPart? attackingPart =
                                        GetLastUsedPart(attackingBot.HeroId > 0 ? "ender_bot_part" : "ender_encounter_bot_part",
                                        attackingBot.HeroId > 0 ? "metabot_id" : "hero_id",
                                        attackingBot.HeroId > 0 ? attackingBot.Id : attackingBot.HeroId,
                                        connection,
                                        transaction);
                                    MetaBotPart? defendingPart =
                                        GetLastUsedPart(defendingBot.HeroId > 0 ? "ender_bot_part" : "ender_encounter_bot_part",
                                        defendingBot.HeroId > 0 ? "metabot_id" : "hero_id",
                                        defendingBot.HeroId > 0 ? defendingBot.Id : defendingBot.HeroId,
                                        connection,
                                        transaction);

                                    // 4. Apply damage to both bots every second
                                    ApplyDamageToBot(attackingBot, defendingBot, attackingPart, defendingPart, connection, transaction);

                                    // Check if either bot's HP is 0 or below, if so, stop DPS  
                                    if (defendingBot.Hp <= 0)
                                    {
                                        attackerStopped = true;
                                        await HandleDeadMetabot(defendingBotMap ?? "", attackingBot, defendingBot, connection, transaction);
                                    }
                                }
                            }

                            await transaction.CommitAsync();
                        }
                    }
                }
                catch (Exception ex)
                {
                    _ = _log.Db($"DPS Error: {ex.Message}", null, "ENDER", true);
                    attackerStopped = true;
                }

                if (attackerStopped)
                {
                    StopAttackDamageOverTimeForBot(attackingBot?.Id, defendingBot?.Id);
                    return;
                }

                await Task.Delay(1000); // Apply damage every 1 second
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

        private async Task HandleDeadMetabot(string map, MetaBot? winnerBot, MetaBot? deadBot, MySqlConnection connection, MySqlTransaction transaction)
        {
            if (deadBot == null) return;
            MetaEvent tmpEvent = new MetaEvent(0,
                deadBot.HeroId,
                DateTime.Now,
                "BOT_DESTROYED",
                map,
                new Dictionary<string, string> { { "winnerBotId", (winnerBot?.Id ?? 0).ToString() } }
            );
            await UpdateEventsInDB(tmpEvent, connection, transaction);
            await DestroyMetabot(deadBot.HeroId, deadBot.Id, connection, transaction);
            if (winnerBot?.HeroId > 0)
            {
                await AwardExpToPlayer(winnerBot, deadBot, connection, transaction);
            }
        }

        private async Task AwardExpToPlayer(MetaBot player, MetaBot enemy, MySqlConnection connection, MySqlTransaction transaction)
        {
            player.Exp += enemy.Level;
            int expForNextLevel = CalculateExpForNextLevel(player);

            while (player.Exp >= expForNextLevel)
            {
                player.Exp -= expForNextLevel; // Subtract the required experience for leveling up
                player.Level++;
                expForNextLevel = CalculateExpForNextLevel(player);
            }
            await UpdateMetabotInDB(player, connection, transaction);
        }

        private int CalculateExpForNextLevel(MetaBot player)
        {
            return (player.Level + 1) * 15;
        }
        private MetaBotPart GetLastUsedPart(string tableName, string idColumn, int id, MySqlConnection connection, MySqlTransaction? transaction)
        {
            string fetchPartSql = $@"
        SELECT part_name, damage_mod, skill, type 
        FROM maxhanna.{tableName} 
        WHERE {idColumn} = @Id 
        ORDER BY last_used DESC 
        LIMIT 1";

            string updateLastUsedSql = $@"
        UPDATE maxhanna.{tableName} 
        SET last_used = UTC_TIMESTAMP() 
        WHERE {idColumn} = @Id 
        ORDER BY last_used DESC 
        LIMIT 1";

            MetaBotPart part = new()
            {
                PartName = "DEFAULT",
                DamageMod = 1,
                Skill = new Skill("NORMAL", 0)
            };

            using (var command = new MySqlCommand(fetchPartSql, connection, transaction))
            {
                command.Parameters.AddWithValue("@Id", id);

                using (var reader = command.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        part = new MetaBotPart
                        {
                            PartName = reader.GetString(0),
                            DamageMod = reader.GetInt32(1),
                            Skill = new Skill(reader.GetString(2), reader.GetInt32(3))
                        };
                    }
                }
            }

            using (var command = new MySqlCommand(updateLastUsedSql, connection, transaction))
            {
                command.Parameters.AddWithValue("@Id", id);
                command.ExecuteNonQuery();
            }

            return part;
        }


        private void ApplyDamageToBot(MetaBot attackingBot, MetaBot defendingBot, MetaBotPart attackingPart, MetaBotPart defendingPart, MySqlConnection connection, MySqlTransaction transaction)
        {
            // 1. Calculate damage for both bots using the same formula
            int appliedDamageToDefender = CalculateDamage(attackingBot, defendingBot, attackingPart);

            // 2. Apply damage to both bots in the database
            string updateSql = @"
                UPDATE maxhanna.ender_bot_part SET last_used = NOW() WHERE metabot_id = @SourceId AND part_name = @PartName;
                UPDATE maxhanna.ender_bot AS bot 
                SET 
                    bot.hp = GREATEST(bot.hp - @Damage, 0), 
                    bot.is_deployed = CASE 
                        WHEN GREATEST(bot.hp - @Damage, 0) = 0 THEN 0
                        ELSE bot.is_deployed 
                    END
                WHERE bot.id = @TargetId";

            // Apply damage to the defender
            using (var command = new MySqlCommand(updateSql, connection, transaction))
            {
                command.Parameters.AddWithValue("@Damage", appliedDamageToDefender);
                command.Parameters.AddWithValue("@TargetId", defendingBot.Id);
                command.Parameters.AddWithValue("@SourceId", attackingBot.Id);
                command.Parameters.AddWithValue("@PartName", attackingPart.PartName);
                command.ExecuteNonQuery();
            }
            _ = _log.Db($"{attackingBot.Id}({attackingBot.Hp}) dealt {appliedDamageToDefender} damage to {defendingBot.Id}({defendingBot.Hp})! {DateTime.Now.ToString()} part: {attackingPart.PartName}", null, "ENDER", true);
        }

        private int CalculateDamage(MetaBot attacker, MetaBot defender, MetaBotPart attackingPart)
        {
            // Determine type effectiveness
            float typeMultiplier = 1.0f;
            if (attackingPart.Skill != null && TypeEffectiveness.TryGetValue((SkillType)attackingPart.Skill.Type, out SkillType effectiveAgainst)
                                                 && (int)effectiveAgainst == defender.Type)
            {
                typeMultiplier = 2.0f; // Super Effective
            }
            else if (attackingPart.Skill != null && TypeEffectiveness.TryGetValue((SkillType)defender.Type, out SkillType strongAgainst)
                                                 && (int)strongAgainst == attackingPart.Skill.Type)
            {
                typeMultiplier = 0.5f; // Not Effective
            }

            // 2. Base Damage Calculation
            int baseDamage = (int)(attacker.Level * attackingPart.DamageMod * typeMultiplier);

            // 3. Defense Calculation (defense equals defender's level, mitigating level% of damage)
            float defenseMultiplier = defender.Level / 100f; // e.g., level 298 = 2.98
            float defenseFactor = 1f / (1f + defenseMultiplier); // e.g., 1 / (1 + 2.98) ≈ 0.2513

            // 4. Final Damage Calculation
            int finalDamage = (int)(baseDamage * defenseFactor);

            // 5. Critical Hit Chance (10% chance)
            if (new Random().NextDouble() < 0.1)
            {
                finalDamage = (int)(finalDamage * 1.5f);
                _ = _log.Db($"{attacker.Name} scored a critical hit!", null, "ENDER", true);
            }

            // Ensure minimum damage of 1
            return Math.Max(1, finalDamage);
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


