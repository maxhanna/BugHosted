using maxhanna.Server.Controllers.DataContracts.Array;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class NexusController : ControllerBase
    {
        private readonly ILogger<NexusController> _logger;
        private readonly IConfiguration _config;
        private readonly int _mapSizeX = 100;
        private readonly int _mapSizeY = 100;

        public NexusController(ILogger<NexusController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost("/Nexus", Name = "GetBaseData")]
        public async Task<IActionResult> GetBaseData([FromBody] User user)
        {
            _logger.LogInformation($"POST /Nexus ({user.Id})");

            if (user == null || user.Id == 0)
            {
                return BadRequest("Invalid user data.");
            }

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                try
                {
                    await conn.OpenAsync();

                    NexusBase nexusBase = null;
                    NexusBaseUpgrades nexusBaseUpgrades = null;

                    // Start a transaction
                    MySqlTransaction transaction = await conn.BeginTransactionAsync();

                    try
                    {
                        // Retrieve data from nexus_bases
                        string sqlBase = "SELECT * FROM nexus_bases WHERE user_id = @UserId";
                        MySqlCommand cmdBase = new MySqlCommand(sqlBase, conn, transaction);
                        cmdBase.Parameters.AddWithValue("@UserId", user.Id);

                        using (var readerBase = await cmdBase.ExecuteReaderAsync())
                        {
                            if (await readerBase.ReadAsync())
                            {
                                nexusBase = new NexusBase
                                {
                                    UserId = readerBase.GetInt32("user_id"),
                                    Gold = readerBase.IsDBNull(readerBase.GetOrdinal("gold")) ? 0 : readerBase.GetDecimal("gold"),
                                    CoordsX = readerBase.IsDBNull(readerBase.GetOrdinal("coords_x")) ? 0 : readerBase.GetInt32("coords_x"),
                                    CoordsY = readerBase.IsDBNull(readerBase.GetOrdinal("coords_y")) ? 0 : readerBase.GetInt32("coords_y"),
                                    CommandCenterLevel = readerBase.IsDBNull(readerBase.GetOrdinal("command_center_level")) ? 0 : readerBase.GetInt32("command_center_level"),
                                    MinesLevel = readerBase.IsDBNull(readerBase.GetOrdinal("mines_level")) ? 0 : readerBase.GetInt32("mines_level"),
                                    SupplyDepotLevel = readerBase.IsDBNull(readerBase.GetOrdinal("supply_depot_level")) ? 0 : readerBase.GetInt32("supply_depot_level"),
                                    FactoryLevel = readerBase.IsDBNull(readerBase.GetOrdinal("factory_level")) ? 0 : readerBase.GetInt32("factory_level"),
                                    StarportLevel = readerBase.IsDBNull(readerBase.GetOrdinal("starport_level")) ? 0 : readerBase.GetInt32("starport_level"),
                                    Conquered = readerBase.IsDBNull(readerBase.GetOrdinal("conquered")) ? DateTime.MinValue : readerBase.GetDateTime("conquered"),
                                    Updated = readerBase.IsDBNull(readerBase.GetOrdinal("updated")) ? DateTime.MinValue : readerBase.GetDateTime("updated"),
                                };
                            }
                        }

                        if (nexusBase != null && nexusBase.Gold < 5000)
                        {
                            await UpdateNexusGold(user, conn, nexusBase, transaction);
                        }
                        if (nexusBase != null)
                        {
                            await UpdateNexusBuildings(user, conn, nexusBase, transaction);

                        }

                        // Retrieve data from nexus_base_upgrades
                        string sqlUpgrades = "SELECT * FROM nexus_base_upgrades WHERE user_id = @UserId";
                        MySqlCommand cmdUpgrades = new MySqlCommand(sqlUpgrades, conn, transaction);
                        cmdUpgrades.Parameters.AddWithValue("@UserId", user.Id);

                        using (var readerUpgrades = await cmdUpgrades.ExecuteReaderAsync())
                        {
                            if (await readerUpgrades.ReadAsync())
                            {
                                nexusBaseUpgrades = new NexusBaseUpgrades
                                {
                                    UserId = readerUpgrades.GetInt32("user_id"),
                                    CoordsX = readerUpgrades.GetInt32("coords_x"),
                                    CoordsY = readerUpgrades.GetInt32("coords_y"),
                                    CommandCenterUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("command_center_upgraded")) ? null : readerUpgrades.GetDateTime("command_center_upgraded"),
                                    MinesUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("mines_upgraded")) ? null : readerUpgrades.GetDateTime("mines_upgraded"),
                                    SupplyDepotUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("supply_depot_upgraded")) ? null : readerUpgrades.GetDateTime("supply_depot_upgraded"),
                                    FactoryUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("factory_upgraded")) ? null : readerUpgrades.GetDateTime("factory_upgraded"),
                                    StarportUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("starport_upgraded")) ? null : readerUpgrades.GetDateTime("starport_upgraded"),
                                };
                            }
                        }

                        // Commit the transaction
                        await transaction.CommitAsync();
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        throw;
                    }

                    return Ok(new { nexusBase = nexusBase ?? new NexusBase(), nexusBaseUpgrades = nexusBaseUpgrades ?? new NexusBaseUpgrades() });
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "An error occurred while processing the GET request.");
                    return StatusCode(500, "An error occurred while processing the request.");
                }
            }
        }


        private async Task UpdateNexusGold(User user, MySqlConnection conn, NexusBase nexusBase, MySqlTransaction transaction)
        {
            if (nexusBase != null)
            {
                // Retrieve mining speed based on mines level
                string sqlMiningSpeed = "SELECT speed FROM nexus_mining_speed WHERE mines_level = @MinesLevel";
                MySqlCommand cmdMiningSpeed = new MySqlCommand(sqlMiningSpeed, conn, transaction);
                cmdMiningSpeed.Parameters.AddWithValue("@MinesLevel", nexusBase.MinesLevel);

                var miningSpeedResult = await cmdMiningSpeed.ExecuteScalarAsync();
                if (miningSpeedResult != null)
                {
                    decimal miningSpeed = Convert.ToDecimal(miningSpeedResult);
                    if (miningSpeed == 0) return;

                    _logger.LogInformation("Mining speed " + miningSpeed);
                    TimeSpan timeElapsed = DateTime.UtcNow - nexusBase.Updated;
                    decimal goldEarned = (decimal)(timeElapsed.TotalSeconds / (double)miningSpeed);
                    _logger.LogInformation("goldEarned " + goldEarned + "; since time elapsed: " + timeElapsed.TotalSeconds);

                    decimal newGoldAmount = nexusBase.Gold + goldEarned;
                    if (newGoldAmount > 5000)
                    {
                        newGoldAmount = 5000;
                    }

                    // Update gold in nexus_bases
                    string updateGoldSql = @"
                        UPDATE nexus_bases 
                        SET gold = @GoldEarned, updated = @Updated 
                        WHERE user_id = @UserId AND coords_x = @CoordsX AND coords_y = @CoordsY";
                    MySqlCommand updateGoldCmd = new MySqlCommand(updateGoldSql, conn, transaction);
                    updateGoldCmd.Parameters.AddWithValue("@GoldEarned", newGoldAmount);
                    updateGoldCmd.Parameters.AddWithValue("@Updated", DateTime.UtcNow);
                    updateGoldCmd.Parameters.AddWithValue("@UserId", user.Id);
                    updateGoldCmd.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                    updateGoldCmd.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

                    await updateGoldCmd.ExecuteNonQueryAsync();

                    // Update nexusBase object with new gold and conquered timestamp
                    nexusBase.Gold = newGoldAmount;
                }
            }
        }


        private async Task UpdateNexusBuildings(User user, MySqlConnection conn, NexusBase nexusBase, MySqlTransaction transaction)
        {
            if (nexusBase != null)
            {
                // Retrieve upgrade start times
                string sqlUpgrades = @"
                SELECT 
                    command_center_upgraded, 
                    mines_upgraded, 
                    supply_depot_upgraded, 
                    factory_upgraded, 
                    starport_upgraded 
                FROM 
                    nexus_base_upgrades 
                WHERE 
                    user_id = @UserId AND coords_x = @CoordsX AND coords_y = @CoordsY";
                MySqlCommand cmdUpgrades = new MySqlCommand(sqlUpgrades, conn, transaction);
                cmdUpgrades.Parameters.AddWithValue("@UserId", user.Id);
                cmdUpgrades.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                cmdUpgrades.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

                using (var readerUpgrades = await cmdUpgrades.ExecuteReaderAsync())
                {
                    if (await readerUpgrades.ReadAsync())
                    {
                        var buildings = new List<(string BuildingName, DateTime? UpgradeStart, string UpgradeStartColumn, string LevelColumn)>
                {
                    ("command_center", readerUpgrades.IsDBNull(0) ? (DateTime?)null : readerUpgrades.GetDateTime(0), "command_center_upgraded", "command_center_level"),
                    ("mines", readerUpgrades.IsDBNull(1) ? (DateTime?)null : readerUpgrades.GetDateTime(1), "mines_upgraded", "mines_level"),
                    ("supply_depot", readerUpgrades.IsDBNull(2) ? (DateTime?)null : readerUpgrades.GetDateTime(2), "supply_depot_upgraded", "supply_depot_level"),
                    ("factory", readerUpgrades.IsDBNull(3) ? (DateTime?)null : readerUpgrades.GetDateTime(3), "factory_upgraded", "factory_level"),
                    ("starport", readerUpgrades.IsDBNull(4) ? (DateTime?)null : readerUpgrades.GetDateTime(4), "starport_upgraded", "starport_level")
                };

                        await readerUpgrades.CloseAsync();

                        foreach (var (buildingName, upgradeStart, upgradeStartColumn, levelColumn) in buildings)
                        {
                            _logger.LogInformation("checking building: " + buildingName + " ; upgradeStart: " + upgradeStart);

                            if (upgradeStart.HasValue)
                            {
                                // Retrieve the duration for the current building level
                                string sqlUpgradeStats = @"
                                    SELECT duration 
                                    FROM nexus_base_upgrade_stats 
                                    WHERE building_type = (SELECT id FROM nexus_building_types WHERE type = @BuildingName) 
                                    AND building_level = (SELECT " + levelColumn + @" FROM nexus_bases WHERE user_id = @UserId AND coords_x = @CoordsX AND coords_y = @CoordsY)";
                                MySqlCommand cmdUpgradeStats = new MySqlCommand(sqlUpgradeStats, conn, transaction);
                                cmdUpgradeStats.Parameters.AddWithValue("@BuildingName", buildingName);
                                cmdUpgradeStats.Parameters.AddWithValue("@UserId", user.Id);
                                cmdUpgradeStats.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                                cmdUpgradeStats.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

                                var durationResult = await cmdUpgradeStats.ExecuteScalarAsync();
                                if (durationResult != null)
                                {
                                    _logger.LogInformation("duration result: " + durationResult);
                                    int duration = Convert.ToInt32(durationResult);
                                    TimeSpan timeElapsed = DateTime.UtcNow - upgradeStart.Value;
                                    if (timeElapsed.TotalSeconds >= duration)
                                    {
                                        // Update the building level
                                        string updateLevelSql = @"
                                            UPDATE nexus_bases 
                                            SET " + levelColumn + @" = " + levelColumn + @" + 1 
                                            WHERE user_id = @UserId AND coords_x = @CoordsX AND coords_y = @CoordsY";
                                        MySqlCommand updateLevelCmd = new MySqlCommand(updateLevelSql, conn, transaction);
                                        updateLevelCmd.Parameters.AddWithValue("@UserId", user.Id);
                                        updateLevelCmd.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                                        updateLevelCmd.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);
                                        await updateLevelCmd.ExecuteNonQueryAsync();

                                        // Reset the upgrade start time
                                        string resetUpgradeSql = @"
                                            UPDATE nexus_base_upgrades 
                                            SET " + upgradeStartColumn + @" = NULL 
                                            WHERE user_id = @UserId AND coords_x = @CoordsX AND coords_y = @CoordsY";
                                        MySqlCommand resetUpgradeCmd = new MySqlCommand(resetUpgradeSql, conn, transaction);
                                        resetUpgradeCmd.Parameters.AddWithValue("@UserId", user.Id);
                                        resetUpgradeCmd.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                                        resetUpgradeCmd.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);
                                        await resetUpgradeCmd.ExecuteNonQueryAsync();

                                        _logger.LogInformation($"{buildingName} upgraded to level {levelColumn + 1} for user {user.Id}");
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        [HttpPost("/Nexus/Start", Name = "Start")]
        public async Task<IActionResult> Start([FromBody] User user)
        {
            _logger.LogInformation($"POST /Nexus/Start Starting the game for player {user.Id}");

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                await conn.OpenAsync();

                // Insert new base at the available location
                string insertSql = @"
                    INSERT INTO maxhanna.nexus_bases (user_id, gold, coords_x, coords_y)
                    SELECT 
                        @UserId, 
                        200, 
                        new_coords.coords_x, 
                        new_coords.coords_y
                    FROM (
                        SELECT 
                            FLOOR(1 + RAND() * @MapSizeX) AS coords_x, 
                            FLOOR(1 + RAND() * @MapSizeY) AS coords_y
                        FROM dual
                        WHERE NOT EXISTS (
                            SELECT 1 
                            FROM maxhanna.nexus_bases 
                            WHERE coords_x = FLOOR(1 + RAND() * @MapSizeX) 
                                AND coords_y = FLOOR(1 + RAND() * @MapSizeY)
                        )
                        LIMIT 1
                    ) AS new_coords;
                    SELECT coords_x, coords_y FROM maxhanna.nexus_bases WHERE user_id = @UserId LIMIT 1;";


                MySqlCommand insertCmd = new MySqlCommand(insertSql, conn);
                insertCmd.Parameters.AddWithValue("@UserId", user.Id);
                insertCmd.Parameters.AddWithValue("@MapSizeX", _mapSizeX);
                insertCmd.Parameters.AddWithValue("@MapSizeY", _mapSizeY);
                using (var reader = await insertCmd.ExecuteReaderAsync())
                {
                    if (await reader.ReadAsync())
                    {
                        int coordsX = reader.GetInt32("coords_x");
                        int coordsY = reader.GetInt32("coords_y");
                        return Ok(new { X = coordsX, Y = coordsY });
                    }
                    else
                    {
                        return StatusCode(500, "Failed to insert new base. Try again.");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while starting the game for player {UserId}", user.Id);
                return StatusCode(500, "Internal server error");
            }
            finally
            {
                await conn.CloseAsync();
            }
        }

        [HttpPost("/Nexus/GetMap", Name = "GetMap")]
        public async Task<IActionResult> GetMap([FromBody] User user)
        {
            _logger.LogInformation($"POST /Nexus/GetMap for player {user.Id}");
            List<NexusBase> bases = new List<NexusBase>();
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                await conn.OpenAsync();

                // Insert new base at the available location
                string sql = @"
                    SELECT 
                        user_id, coords_x, coords_y
                    FROM 
                        maxhanna.nexus_bases n;";


                MySqlCommand cmd = new MySqlCommand(sql, conn);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        NexusBase tmpBase = new NexusBase();
                        tmpBase.CoordsX = reader.IsDBNull(reader.GetOrdinal("coords_x")) ? 0 : reader.GetInt32(reader.GetOrdinal("coords_x"));
                        tmpBase.CoordsY = reader.IsDBNull(reader.GetOrdinal("coords_y")) ? 0 : reader.GetInt32(reader.GetOrdinal("coords_y"));
                        tmpBase.UserId = reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32(reader.GetOrdinal("user_id"));
                        bases.Add(tmpBase);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while starting the game for player {UserId}", user.Id);
                return StatusCode(500, "Internal server error");
            }
            finally
            {
                await conn.CloseAsync();
            }
            return Ok(bases);
        }


        [HttpPost("/Nexus/GetMinesInfo", Name = "GetMinesInfo")]
        public async Task<IActionResult> GetMinesInfo([FromBody] NexusRequest request)
        {
            _logger.LogInformation($"POST /Nexus/GetMinesInfo for player {request.user.Id}");
            var speed = 0;

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                await conn.OpenAsync();

                // Insert new base at the available location
                string sql = @"
                    SELECT 
                        s.*
                    FROM 
                        maxhanna.nexus_mining_speed s
                    LEFT JOIN 
                        maxhanna.nexus_bases n ON s.mines_level = n.mines_level 
                    WHERE 
                        n.coords_x = @CoordsX 
                    AND n.coords_y = @CoordsY 
                    AND n.user_id = @UserId";


                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@CoordsX", request.nexus.CoordsX);
                cmd.Parameters.AddWithValue("@CoordsY", request.nexus.CoordsY);
                cmd.Parameters.AddWithValue("@UserId", request.user.Id);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        speed = reader.IsDBNull(reader.GetOrdinal("speed")) ? 0 : reader.GetInt32(reader.GetOrdinal("speed"));
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"An error occurred while GetMinesInfo for player {request.user.Id}");
                return StatusCode(500, "Internal server error");
            }
            finally
            {
                await conn.CloseAsync();
            }
            return Ok(new { speed });
        }

        [HttpPost("/Nexus/GetBuildingUpgrades", Name = "GetBuildingUpgrades")]
        public async Task<IActionResult> GetBuildingUpgrades([FromBody] NexusRequest request)
        {
            _logger.LogInformation($"POST /Nexus/GetBuildingUpgrades for player ({request.user.Id})");

            if (request.user == null || request.user.Id == 0)
            {
                return BadRequest("Invalid user data.");
            }

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                await conn.OpenAsync();

                string sqlCurrentLevels = @"
                    SELECT command_center_level, mines_level, supply_depot_level, factory_level, starport_level
                    FROM nexus_bases
                    WHERE user_id = @UserId";
                MySqlCommand cmdCurrentLevels = new MySqlCommand(sqlCurrentLevels, conn);
                cmdCurrentLevels.Parameters.AddWithValue("@UserId", request.user.Id);

                var readerCurrentLevels = await cmdCurrentLevels.ExecuteReaderAsync();
                if (!await readerCurrentLevels.ReadAsync())
                {
                    await readerCurrentLevels.CloseAsync();
                    return NotFound("User base not found.");
                }

                int currentCommandCenterLevel = readerCurrentLevels.GetInt32("command_center_level");
                int currentMinesLevel = readerCurrentLevels.GetInt32("mines_level");
                int currentSupplyDepotLevel = readerCurrentLevels.GetInt32("supply_depot_level");
                int currentFactoryLevel = readerCurrentLevels.GetInt32("factory_level");
                int currentStarportLevel = readerCurrentLevels.GetInt32("starport_level");
                await readerCurrentLevels.CloseAsync();

                string sqlUpgradeTimestamps = @"
                    SELECT command_center_upgraded, mines_upgraded, supply_depot_upgraded, factory_upgraded, starport_upgraded
                    FROM nexus_base_upgrades
                    WHERE user_id = @UserId AND coords_x = @CoordsX AND coords_y = @CoordsY";
                MySqlCommand cmdUpgradeTimestamps = new MySqlCommand(sqlUpgradeTimestamps, conn);
                cmdUpgradeTimestamps.Parameters.AddWithValue("@UserId", request.user.Id);
                cmdUpgradeTimestamps.Parameters.AddWithValue("@CoordsX", request.nexus.CoordsX);
                cmdUpgradeTimestamps.Parameters.AddWithValue("@CoordsY", request.nexus.CoordsY);

                var readerUpgradeTimestamps = await cmdUpgradeTimestamps.ExecuteReaderAsync();
                DateTime? commandCenterUpgraded = null;
                DateTime? minesUpgraded = null;
                DateTime? supplyDepotUpgraded = null;
                DateTime? factoryUpgraded = null;
                DateTime? starportUpgraded = null;

                if (await readerUpgradeTimestamps.ReadAsync())
                {
                    commandCenterUpgraded = readerUpgradeTimestamps.IsDBNull(readerUpgradeTimestamps.GetOrdinal("command_center_upgraded")) ?
                                    null : (DateTime?)readerUpgradeTimestamps.GetDateTime("command_center_upgraded");
                    minesUpgraded = readerUpgradeTimestamps.IsDBNull(readerUpgradeTimestamps.GetOrdinal("mines_upgraded")) ?
                                    null : (DateTime?)readerUpgradeTimestamps.GetDateTime("mines_upgraded");
                    supplyDepotUpgraded = readerUpgradeTimestamps.IsDBNull(readerUpgradeTimestamps.GetOrdinal("supply_depot_upgraded")) ?
                                    null : (DateTime?)readerUpgradeTimestamps.GetDateTime("supply_depot_upgraded");
                    factoryUpgraded = readerUpgradeTimestamps.IsDBNull(readerUpgradeTimestamps.GetOrdinal("factory_upgraded")) ?
                                    null : (DateTime?)readerUpgradeTimestamps.GetDateTime("factory_upgraded");
                    starportUpgraded = readerUpgradeTimestamps.IsDBNull(readerUpgradeTimestamps.GetOrdinal("starport_upgraded")) ?
                                    null : (DateTime?)readerUpgradeTimestamps.GetDateTime("starport_upgraded");
                }
                await readerUpgradeTimestamps.CloseAsync();

                var durations = new Dictionary<string, int>();
                var costs = new Dictionary<string, int>();
                string sqlDurations = @"
                    SELECT building_type, duration, cost
                    FROM nexus_base_upgrade_stats
                    WHERE building_type IN (SELECT id FROM nexus_building_types WHERE type IN ('command_center', 'mines', 'supply_depot', 'factory', 'starport'))";
                MySqlCommand cmdDurations = new MySqlCommand(sqlDurations, conn);
                var readerDurations = await cmdDurations.ExecuteReaderAsync();
                while (await readerDurations.ReadAsync())
                {
                    int buildingType = readerDurations.GetInt32("building_type");
                    int duration = readerDurations.GetInt32("duration");
                    int cost = readerDurations.GetInt32("cost");

                    string buildingName = GetBuildingNameFromTypeId(buildingType); // Function to map building_type to building name
                    if (!string.IsNullOrEmpty(buildingName))
                    {
                        durations[buildingName] = duration;
                        costs[buildingName] = cost;
                    }
                }
                await readerDurations.CloseAsync();

                var availableUpgrades = new List<object>();
                var buildings = new List<(string BuildingName, int CurrentLevel, DateTime? LastUpgraded)>
                {
                    ("command_center", currentCommandCenterLevel, commandCenterUpgraded),
                    ("mines", currentMinesLevel, minesUpgraded),
                    ("supply_depot", currentSupplyDepotLevel, supplyDepotUpgraded),
                    ("factory", currentFactoryLevel, factoryUpgraded),
                    ("starport", currentStarportLevel, starportUpgraded)
                };

                foreach (var (buildingName, currentLevel, lastUpgraded) in buildings)
                {
                    if (!lastUpgraded.HasValue)  
                    {
                        int duration = durations.ContainsKey(buildingName) ? durations[buildingName] : 0;
                        int cost = costs.ContainsKey(buildingName) ? costs[buildingName] : 0;
                        availableUpgrades.Add(new
                        {
                            Building = buildingName,
                            NextLevel = currentLevel + 1,
                            Duration = duration,
                            Cost = cost
                        });
                    }
                }
                return Ok(new { Upgrades = availableUpgrades });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"An error occurred while retrieving building upgrades for user {request.user.Id}");
                return StatusCode(500, "Internal server error");
            }
            finally
            {
                await conn.CloseAsync();
            }
        }


        private string GetBuildingNameFromTypeId(int typeId)
        {
            string buildingName = "";

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                conn.Open();

                string sql = "SELECT type FROM nexus_building_types WHERE id = @TypeId";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@TypeId", typeId);

                object result = cmd.ExecuteScalar();
                if (result != null)
                {
                    buildingName = result.ToString();
                }

                conn.Close();
            }

            return buildingName;
        }


        [HttpPost("/Nexus/UpgradeMines", Name = "UpgradeMines")]
        public Task<IActionResult> UpgradeMines([FromBody] NexusRequest req)
        {
            return UpgradeComponent(req.user, "mines", req.nexus);
        }

        [HttpPost("/Nexus/UpgradeFactory", Name = "UpgradeFactory")]
        public Task<IActionResult> UpgradeFactory([FromBody] NexusRequest req)
        {
            return UpgradeComponent(req.user, "factory", req.nexus);
        }

        [HttpPost("/Nexus/UpgradeStarport", Name = "UpgradeStarport")]
        public Task<IActionResult> UpgradeStarport([FromBody] NexusRequest req)
        {
            return UpgradeComponent(req.user, "starport", req.nexus);
        }

        [HttpPost("/Nexus/UpgradeNexus", Name = "UpgradeNexus")]
        public Task<IActionResult> UpgradeNexus([FromBody] NexusRequest req)
        {
            return UpgradeComponent(req.user, "command_center", req.nexus);
        }

        [HttpPost("/Nexus/UpgradeSupplyDepot", Name = "UpgradeSupplyDepot")]
        public Task<IActionResult> UpgradeSupplyDepot([FromBody] NexusRequest req)
        {
            return UpgradeComponent(req.user, "supply_depot", req.nexus);
        }
        private async Task<IActionResult> UpgradeComponent(User user, string component, NexusBase nexus)
        {
            _logger.LogInformation($"POST /Nexus/Upgrade{component} ({user.Id})");

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                try
                {
                    await conn.OpenAsync();

                    // Start a transaction
                    MySqlTransaction transaction = await conn.BeginTransactionAsync();

                    // Retrieve the upgrade cost
                    string getCostSql = $@"
                        SELECT cost 
                        FROM nexus_base_upgrade_stats 
                        WHERE building_type = (SELECT id FROM nexus_building_types WHERE LOWER(type) = @Component)
                          AND building_level = (SELECT {component}_level FROM nexus_bases WHERE coords_x = @CoordsX AND coords_y = @CoordsY AND user_id = @UserId)
                        LIMIT 1;";
                    MySqlCommand getCostCmd = new MySqlCommand(getCostSql, conn, transaction);
                    getCostCmd.Parameters.AddWithValue("@Component", component);
                    getCostCmd.Parameters.AddWithValue("@UserId", user.Id);
                    getCostCmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
                    getCostCmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);

                    var costResult = await getCostCmd.ExecuteScalarAsync();
                    if (costResult == null)
                    {
                        await transaction.RollbackAsync();
                        return BadRequest("Invalid component or upgrade level.");
                    }
                    int upgradeCost = Convert.ToInt32(costResult);

                    // Retrieve the current gold amount
                    string getGoldSql = @"
                        SELECT gold 
                        FROM nexus_bases 
                        WHERE coords_x = @CoordsX AND coords_y = @CoordsY AND user_id = @UserId";
                    MySqlCommand getGoldCmd = new MySqlCommand(getGoldSql, conn, transaction);
                    getGoldCmd.Parameters.AddWithValue("@UserId", user.Id);
                    getGoldCmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
                    getGoldCmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);

                    var goldResult = await getGoldCmd.ExecuteScalarAsync();
                    if (goldResult == null)
                    {
                        await transaction.RollbackAsync();
                        return NotFound("Base not found.");
                    }
                    int currentGold = Convert.ToInt32(goldResult);

                    if (currentGold < upgradeCost)
                    {
                        await transaction.RollbackAsync();
                        return BadRequest("Not enough gold to upgrade.");
                    }

                    // Update the nexus_base_upgrades table
                    string insertUpgradeSql = $@"
                        INSERT INTO nexus_base_upgrades (user_id, coords_x, coords_y, {component}_upgraded)
                        VALUES (@UserId, @CoordsX, @CoordsY, @Timestamp)
                        ON DUPLICATE KEY UPDATE {component}_upgraded = @Timestamp";
                    MySqlCommand insertUpgradeCmd = new MySqlCommand(insertUpgradeSql, conn, transaction);
                    insertUpgradeCmd.Parameters.AddWithValue("@UserId", user.Id);
                    insertUpgradeCmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
                    insertUpgradeCmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);
                    insertUpgradeCmd.Parameters.AddWithValue("@Timestamp", DateTime.UtcNow);
                    await insertUpgradeCmd.ExecuteNonQueryAsync();

                    // Update the nexus_bases table (subtract gold and increment level)
                    string updateBaseSql = $@"
                        UPDATE maxhanna.nexus_bases
                        SET 
                            gold = gold - @UpgradeCost,
                            {component}_level = {component}_level + 1
                        WHERE 
                            coords_x = @CoordsX
                            AND coords_y = @CoordsY
                            AND user_id = @UserId";
                    MySqlCommand updateBaseCmd = new MySqlCommand(updateBaseSql, conn, transaction);
                    updateBaseCmd.Parameters.AddWithValue("@UserId", user.Id);
                    updateBaseCmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
                    updateBaseCmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);
                    updateBaseCmd.Parameters.AddWithValue("@UpgradeCost", upgradeCost);

                    await updateBaseCmd.ExecuteNonQueryAsync();

                    // Commit the transaction
                    await transaction.CommitAsync();

                    return Ok($"Upgrading {component}");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"An error occurred while processing the POST request to upgrade {component}.");
                    return StatusCode(500, "An error occurred while processing the request.");
                }
            }
        }

    }
}
