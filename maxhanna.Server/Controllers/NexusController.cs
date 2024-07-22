using maxhanna.Server.Controllers.DataContracts.Array;
using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Threading.Tasks;

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
        public async Task<IActionResult> GetBaseData([FromBody] NexusRequest req)
        {
            Console.WriteLine($"POST /Nexus ({req.User.Id}, {req.Nexus?.CoordsX}:{req.Nexus?.CoordsY})");

            if (req.User == null || req.User.Id == 0)
            {
                return BadRequest("Invalid user data.");
            }

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                try
                {
                    await conn.OpenAsync();

                    NexusBase? nexusBase = null;
                    NexusBaseUpgrades? nexusBaseUpgrades = null;
                    NexusUnits? nexusUnits = null;
                    List<NexusUnitsPurchased>? nexusUnitPurchasesList = null;
                    if (req.Nexus == null)
                    {
                        req.Nexus = await GetUserFirstBase(req.User);
                    }
                    if (req.Nexus == null)
                    {
                        return BadRequest($"Base not found with user_id : {req.User.Id}");
                    }

                    MySqlTransaction transaction = await conn.BeginTransactionAsync();

                    try
                    {
                        // Retrieve data from nexus_bases
                        string sqlBase = "SELECT * FROM nexus_bases WHERE coords_x = @CoordsX AND coords_y = @CoordsY";
                        MySqlCommand cmdBase = new MySqlCommand(sqlBase, conn, transaction);
                        cmdBase.Parameters.AddWithValue("@CoordsX", req.Nexus.CoordsX);
                        cmdBase.Parameters.AddWithValue("@CoordsY", req.Nexus.CoordsY);

                        using (var readerBase = await cmdBase.ExecuteReaderAsync())
                        {
                            if (await readerBase.ReadAsync())
                            {
                                nexusBase = new NexusBase
                                {
                                    UserId = readerBase.GetInt32("user_id"),
                                    Gold = readerBase.IsDBNull(readerBase.GetOrdinal("gold")) ? 0 : readerBase.GetDecimal("gold"),
                                    Supply = readerBase.IsDBNull(readerBase.GetOrdinal("supply")) ? 0 : readerBase.GetInt32("supply"),
                                    CoordsX = readerBase.IsDBNull(readerBase.GetOrdinal("coords_x")) ? 0 : readerBase.GetInt32("coords_x"),
                                    CoordsY = readerBase.IsDBNull(readerBase.GetOrdinal("coords_y")) ? 0 : readerBase.GetInt32("coords_y"),
                                    CommandCenterLevel = readerBase.IsDBNull(readerBase.GetOrdinal("command_center_level")) ? 0 : readerBase.GetInt32("command_center_level"),
                                    MinesLevel = readerBase.IsDBNull(readerBase.GetOrdinal("mines_level")) ? 0 : readerBase.GetInt32("mines_level"),
                                    SupplyDepotLevel = readerBase.IsDBNull(readerBase.GetOrdinal("supply_depot_level")) ? 0 : readerBase.GetInt32("supply_depot_level"),
                                    EngineeringBayLevel = readerBase.IsDBNull(readerBase.GetOrdinal("engineering_bay_level")) ? 0 : readerBase.GetInt32("engineering_bay_level"),
                                    WarehouseLevel = readerBase.IsDBNull(readerBase.GetOrdinal("warehouse_level")) ? 0 : readerBase.GetInt32("warehouse_level"),
                                    FactoryLevel = readerBase.IsDBNull(readerBase.GetOrdinal("factory_level")) ? 0 : readerBase.GetInt32("factory_level"),
                                    StarportLevel = readerBase.IsDBNull(readerBase.GetOrdinal("starport_level")) ? 0 : readerBase.GetInt32("starport_level"),
                                    Conquered = readerBase.IsDBNull(readerBase.GetOrdinal("conquered")) ? DateTime.MinValue : readerBase.GetDateTime("conquered"),
                                    Updated = readerBase.IsDBNull(readerBase.GetOrdinal("updated")) ? DateTime.MinValue : readerBase.GetDateTime("updated"),
                                };
                            }
                        }

                        if (nexusBase != null && nexusBase.Gold < (5000 * (nexusBase.WarehouseLevel + 1)))
                        {
                            await UpdateNexusGold(conn, nexusBase, transaction);
                        }
                        if (nexusBase != null)
                        {
                            await UpdateNexusBuildings(conn, nexusBase, transaction);
                            await UpdateNexusUnits(nexusBase, conn, transaction);
                        }


                        if (nexusBase != null)
                        {
                            // Retrieve data from nexus_base_upgrades
                            string sqlUpgrades = @"
                            SELECT * 
                            FROM nexus_base_upgrades 
                            WHERE 
                                coords_x = @CoordsX 
                            AND coords_y = @CoordsY";
                            MySqlCommand cmdUpgrades = new MySqlCommand(sqlUpgrades, conn, transaction);
                            cmdUpgrades.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                            cmdUpgrades.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

                            using (var readerUpgrades = await cmdUpgrades.ExecuteReaderAsync())
                            {
                                if (await readerUpgrades.ReadAsync())
                                {
                                    nexusBaseUpgrades = new NexusBaseUpgrades
                                    {
                                        CoordsX = readerUpgrades.GetInt32("coords_x"),
                                        CoordsY = readerUpgrades.GetInt32("coords_y"),
                                        CommandCenterUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("command_center_upgraded")) ? null : readerUpgrades.GetDateTime("command_center_upgraded"),
                                        MinesUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("mines_upgraded")) ? null : readerUpgrades.GetDateTime("mines_upgraded"),
                                        SupplyDepotUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("supply_depot_upgraded")) ? null : readerUpgrades.GetDateTime("supply_depot_upgraded"),
                                        EngineeringBayUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("engineering_bay_upgraded")) ? null : readerUpgrades.GetDateTime("engineering_bay_upgraded"),
                                        WarehouseUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("warehouse_upgraded")) ? null : readerUpgrades.GetDateTime("warehouse_upgraded"),
                                        FactoryUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("factory_upgraded")) ? null : readerUpgrades.GetDateTime("factory_upgraded"),
                                        StarportUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("starport_upgraded")) ? null : readerUpgrades.GetDateTime("starport_upgraded"),
                                    };
                                }
                            }


                            string sqlUnits = @"
                            SELECT * 
                            FROM nexus_units 
                            WHERE 
                                coords_x = @CoordsX 
                            AND coords_y = @CoordsY";
                            MySqlCommand cmdUnits = new MySqlCommand(sqlUnits, conn, transaction);
                            cmdUnits.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                            cmdUnits.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

                            using (var readerUnits = await cmdUnits.ExecuteReaderAsync())
                            {
                                if (await readerUnits.ReadAsync())
                                {
                                    nexusUnits = new NexusUnits
                                    {
                                        CoordsX = readerUnits.GetInt32("coords_x"),
                                        CoordsY = readerUnits.GetInt32("coords_y"),
                                        MarineTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("marine_total")) ? null : readerUnits.GetInt32("marine_total"),
                                        GoliathTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("goliath_total")) ? null : readerUnits.GetInt32("goliath_total"),
                                        SiegeTankTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("siege_tank_total")) ? null : readerUnits.GetInt32("siege_tank_total"),
                                        WraithTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("wraith_total")) ? null : readerUnits.GetInt32("wraith_total"),
                                        BattlecruiserTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("battlecruiser_total")) ? null : readerUnits.GetInt32("battlecruiser_total")
                                    };
                                }
                            }
                        }
                        nexusUnitPurchasesList = await GetNexusUnitPurchases(conn, nexusBase, transaction);


                        // Commit the transaction
                        await transaction.CommitAsync();
                    }
                    catch (Exception)
                    {
                        await transaction.RollbackAsync();
                        throw;
                    }

                    return Ok(
                        new
                        {
                            nexusBase = nexusBase ?? new NexusBase(),
                            nexusBaseUpgrades = nexusBaseUpgrades ?? new NexusBaseUpgrades(),
                            nexusUnits = nexusUnits ?? new NexusUnits(),
                            nexusUnitsPurchasedList = nexusUnitPurchasesList ?? new List<NexusUnitsPurchased>(),
                        });
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "An error occurred while processing the GET request.");
                    return StatusCode(500, "An error occurred while processing the request.");
                }
            }
        }

        private static async Task<List<NexusUnitsPurchased>?> GetNexusUnitPurchases(MySqlConnection conn, NexusBase? nexusBase, MySqlTransaction transaction)
        {
            if (nexusBase == null)
            {
                return new List<NexusUnitsPurchased>();
            }
            var res = new List<NexusUnitsPurchased>();
            string sqlUnitPurchases = @"
                            SELECT * 
                            FROM nexus_unit_purchases 
                            WHERE 
                                coords_x = @CoordsX 
                            AND coords_y = @CoordsY";
            MySqlCommand cmdUnitPurchases = new MySqlCommand(sqlUnitPurchases, conn, transaction);
            cmdUnitPurchases.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
            cmdUnitPurchases.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

            using (var readerUnitPurchases = await cmdUnitPurchases.ExecuteReaderAsync())
            {
                while (await readerUnitPurchases.ReadAsync())
                {
                    NexusUnitsPurchased nexusUnitPurchases = new NexusUnitsPurchased
                    {
                        CoordsX = readerUnitPurchases.GetInt32("coords_x"),
                        CoordsY = readerUnitPurchases.GetInt32("coords_y"),
                        UnitIdPurchased = readerUnitPurchases.GetInt32("unit_id_purchased"),
                        QuantityPurchased = readerUnitPurchases.GetInt32("quantity_purchased"),
                        Timestamp = readerUnitPurchases.GetDateTime("timestamp"),
                    };

                    res.Add(nexusUnitPurchases);
                }
            }

            return res;
        }

        private async Task<NexusBase?> GetUserFirstBase(User user)
        {
            MySqlConnection conn1 = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                await conn1.OpenAsync();

                // Insert new base at the available location
                string sql = @"
                            SELECT 
                                user_id, coords_x, coords_y
                            FROM 
                                maxhanna.nexus_bases n
                            WHERE user_id = @UserId
                            LIMIT 1;";


                MySqlCommand cmd = new MySqlCommand(sql, conn1);
                cmd.Parameters.AddWithValue("@UserId", user.Id);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        NexusBase tmpBase = new NexusBase();
                        tmpBase.CoordsX = reader.IsDBNull(reader.GetOrdinal("coords_x")) ? 0 : reader.GetInt32(reader.GetOrdinal("coords_x"));
                        tmpBase.CoordsY = reader.IsDBNull(reader.GetOrdinal("coords_y")) ? 0 : reader.GetInt32(reader.GetOrdinal("coords_y"));
                        tmpBase.UserId = reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32(reader.GetOrdinal("user_id"));
                        return tmpBase;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"An error occurred getting first base for player {user.Id}");
            }
            finally
            {
                await conn1.CloseAsync();
            }
            return null;
        }

        private async Task UpdateNexusGold(MySqlConnection conn, NexusBase nexusBase, MySqlTransaction transaction)
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

                    Console.WriteLine($"Mining speed {miningSpeed}. Base Last Updated : {nexusBase.Updated}");
                    TimeSpan timeElapsed = DateTime.Now - nexusBase.Updated;
                    decimal goldEarned = (decimal)(timeElapsed.TotalSeconds / (double)miningSpeed);
                    Console.WriteLine("goldEarned " + goldEarned + "; since time elapsed: " + timeElapsed.TotalSeconds);

                    decimal newGoldAmount = nexusBase.Gold + Math.Abs(goldEarned);
                    if (newGoldAmount > (5000 * (nexusBase.WarehouseLevel + 1)))
                    {
                        newGoldAmount = (5000 * (nexusBase.WarehouseLevel + 1));
                    }

                    // Update gold in nexus_bases
                    string updateGoldSql = @"
                        UPDATE nexus_bases 
                        SET gold = @GoldEarned, updated = @Updated 
                        WHERE coords_x = @CoordsX AND coords_y = @CoordsY";
                    MySqlCommand updateGoldCmd = new MySqlCommand(updateGoldSql, conn, transaction);
                    updateGoldCmd.Parameters.AddWithValue("@GoldEarned", newGoldAmount);
                    updateGoldCmd.Parameters.AddWithValue("@Updated", DateTime.Now);
                    updateGoldCmd.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                    updateGoldCmd.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

                    await updateGoldCmd.ExecuteNonQueryAsync();

                    // Update nexusBase object with new gold and conquered timestamp
                    nexusBase.Gold = newGoldAmount;
                }
            }
        }


        private async Task UpdateNexusBuildings(MySqlConnection conn, NexusBase nexusBase, MySqlTransaction transaction)
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
                    starport_upgraded,
                    engineering_bay_upgraded,
                    warehouse_upgraded
                FROM 
                    nexus_base_upgrades 
                WHERE 
                    coords_x = @CoordsX AND coords_y = @CoordsY";
                MySqlCommand cmdUpgrades = new MySqlCommand(sqlUpgrades, conn, transaction);
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
                    ("starport", readerUpgrades.IsDBNull(4) ? (DateTime?)null : readerUpgrades.GetDateTime(4), "starport_upgraded", "starport_level"),
                    ("engineering_bay", readerUpgrades.IsDBNull(5) ? (DateTime?)null : readerUpgrades.GetDateTime(5), "engineering_bay_upgraded", "engineering_bay_level"),
                    ("warehouse", readerUpgrades.IsDBNull(6) ? (DateTime?)null : readerUpgrades.GetDateTime(6), "warehouse_upgraded", "warehouse_level"),
                };

                        await readerUpgrades.CloseAsync();
                        Console.WriteLine($"current time: {DateTime.Now}");

                        foreach (var (buildingName, upgradeStart, upgradeStartColumn, levelColumn) in buildings)
                        {
                            Console.WriteLine($"checking building: {buildingName} ; upgradeStart: {upgradeStart}");

                            if (upgradeStart.HasValue)
                            {
                                // Retrieve the duration for the current building level
                                string sqlUpgradeStats = @"
                                    SELECT duration 
                                    FROM nexus_base_upgrade_stats 
                                    WHERE building_type = (SELECT id FROM nexus_building_types WHERE type = @BuildingName) 
                                    AND building_level = (SELECT " + levelColumn + @" FROM nexus_bases WHERE coords_x = @CoordsX AND coords_y = @CoordsY)";
                                MySqlCommand cmdUpgradeStats = new MySqlCommand(sqlUpgradeStats, conn, transaction);
                                cmdUpgradeStats.Parameters.AddWithValue("@BuildingName", buildingName);
                                cmdUpgradeStats.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                                cmdUpgradeStats.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

                                var durationResult = await cmdUpgradeStats.ExecuteScalarAsync();
                                if (durationResult != null)
                                {
                                    Console.WriteLine("duration result: " + durationResult);
                                    int duration = Convert.ToInt32(durationResult);
                                    TimeSpan timeElapsed = DateTime.Now - upgradeStart.Value;
                                    if (Math.Abs(timeElapsed.TotalSeconds - duration) <= 3)
                                    {
                                        // Update the building level
                                        string updateLevelSql = @"
                                            UPDATE nexus_bases 
                                            SET " + levelColumn + @" = " + levelColumn + @" + 1, updated = @Updated
                                            WHERE coords_x = @CoordsX AND coords_y = @CoordsY";
                                        MySqlCommand updateLevelCmd = new MySqlCommand(updateLevelSql, conn, transaction);
                                        updateLevelCmd.Parameters.AddWithValue("@Updated", DateTime.Now);
                                        updateLevelCmd.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                                        updateLevelCmd.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);
                                        await updateLevelCmd.ExecuteNonQueryAsync();

                                        if (buildingName == "mines") { nexusBase.MinesLevel++; }
                                        else if (buildingName == "command_center") { nexusBase.CommandCenterLevel++; }
                                        else if (buildingName == "supply_depot") { nexusBase.SupplyDepotLevel++; }
                                        else if (buildingName == "warehouse") { nexusBase.WarehouseLevel++; }
                                        else if (buildingName == "engineering_bay") { nexusBase.EngineeringBayLevel++; }
                                        else if (buildingName == "factory") { nexusBase.FactoryLevel++; }
                                        else if (buildingName == "starport") { nexusBase.StarportLevel++; }

                                        // Reset the upgrade start time
                                        string resetUpgradeSql = @"
                                            UPDATE nexus_base_upgrades 
                                            SET " + upgradeStartColumn + @" = NULL 
                                            WHERE coords_x = @CoordsX AND coords_y = @CoordsY";
                                        MySqlCommand resetUpgradeCmd = new MySqlCommand(resetUpgradeSql, conn, transaction);
                                        resetUpgradeCmd.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                                        resetUpgradeCmd.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);
                                        await resetUpgradeCmd.ExecuteNonQueryAsync();

                                        Console.WriteLine($"{buildingName} upgraded to level {levelColumn + 1} for nexus {nexusBase.CoordsX}:{nexusBase.CoordsY}");
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
            Console.WriteLine($"POST /Nexus/Start Starting the game for player {user.Id}");

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
            Console.WriteLine($"POST /Nexus/GetMap for player {user.Id}");
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
            Console.WriteLine($"POST /Nexus/GetMinesInfo for player {request.User.Id}");
            if (request.Nexus == null )
            {
                return Ok(0);
            }
            Decimal speed = Decimal.One;

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
                    AND n.coords_y = @CoordsY";


                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@CoordsX", request.Nexus.CoordsX);
                cmd.Parameters.AddWithValue("@CoordsY", request.Nexus.CoordsY);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        speed = reader.IsDBNull(reader.GetOrdinal("speed")) ? 0 : reader.GetDecimal(reader.GetOrdinal("speed"));
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"An error occurred while GetMinesInfo for player {request.User.Id}");
                return StatusCode(500, "Internal server error");
            }
            finally
            {
                await conn.CloseAsync();
            }
            return Ok(new { speed });
        }

        [HttpPost("/Nexus/GetUnitStats", Name = "GetUnitStats")]
        public async Task<IActionResult> GetUnitStats([FromBody] NexusRequest request)
        {
            Console.WriteLine($"POST /Nexus/GetUnitStats for player {request.User.Id}");
            List<UnitStats> unitStats = await GetUnitStatsFromDB(null);

            return Ok(unitStats);
        }

        private async Task<List<UnitStats>> GetUnitStatsFromDB(int? unitId)
        {
            List<UnitStats> unitStats = new List<UnitStats>();
            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                try
                {
                    await conn.OpenAsync();

                    string sql = $@"
                    SELECT 
                        nut.id as unit_id, 
                        nut.type as unit_type, 
                        n.unit_level, 
                        n.duration, 
                        n.cost,
                        n.supply,
                        n.ground_damage,
                        n.air_damage,
                        n.building_damage,
                        n.starport_level,
                        n.factory_level,
                        n.engineering_bay_level
                    FROM 
                        maxhanna.nexus_unit_stats n
                    LEFT JOIN
                        maxhanna.nexus_unit_types nut ON nut.id = n.unit_id;
                    {(unitId != null ? " WHERE nut.id = @UnitId" : "")}";
                    
                    using (MySqlCommand cmd = new MySqlCommand(sql, conn))
                    {
                        if (unitId != null)
                        {
                            cmd.Parameters.AddWithValue("@UnitId", unitId);
                        }
                        using (var reader = await cmd.ExecuteReaderAsync())
                        {
                            while (await reader.ReadAsync())
                            {
                                var unitStat = new UnitStats
                                {
                                    UnitId = reader.GetInt32(reader.GetOrdinal("unit_id")),
                                    UnitType = reader.GetString(reader.GetOrdinal("unit_type")),
                                    UnitLevel = reader.GetInt32(reader.GetOrdinal("unit_level")),
                                    Duration = reader.GetInt32(reader.GetOrdinal("duration")),
                                    Cost = reader.GetInt32(reader.GetOrdinal("cost")),
                                    Supply = reader.GetInt32(reader.GetOrdinal("supply")),
                                    GroundDamage = reader.GetInt32(reader.GetOrdinal("ground_damage")),
                                    AirDamage = reader.GetInt32(reader.GetOrdinal("air_damage")),
                                    BuildingDamage = reader.GetInt32(reader.GetOrdinal("building_damage")),
                                    StarportLevel = reader.GetInt32(reader.GetOrdinal("starport_level")),
                                    EngineeringBayLevel = reader.GetInt32(reader.GetOrdinal("engineering_bay_level")),
                                    FactoryLevel = reader.GetInt32(reader.GetOrdinal("factory_level")),
                                };
                                unitStats.Add(unitStat);
                            }
                        }
                    } 
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"An error occurred while GetUnitStatsFromDB"); 
                }
                finally
                {
                    await conn.CloseAsync();
                }
            }
            return unitStats;
        } 

        [HttpPost("/Nexus/PurchaseUnit", Name = "PurchaseUnit")]
        public async Task<IActionResult> PurchaseUnit([FromBody] NexusPurchaseUnitRequest request)
        {
            Console.WriteLine($"POST /Nexus/PurchaseUnit for player ({request.User.Id})");

            if (request.User == null || request.User.Id == 0 || request.PurchaseAmount == 0)
            {
                return BadRequest("Invalid purchase request.");
            }

            try
            {
                using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
                    {
                        try
                        {
                            await UpdateNexusGold(conn, request.Nexus, transaction);
                            Console.WriteLine("Updated Gold");

                            // Fetch Nexus's current supply
                            int currentSupply = await GetNexusSupply(request, conn, transaction);
                            Console.WriteLine("Got Nexus's Supply : " + currentSupply);

                            // Fetch Nexus's current gold and supply capacity
                            var (currentGold, supplyCapacity) = await GetNexusGoldAndSupply(request, conn, transaction);

                            // Fetch unit cost and type
                            List<UnitStats> unitStats = await GetUnitStatsFromDB(request.UnitId);
                            if (unitStats == null || unitStats.Count <= 0)
                            {
                                return NotFound("Unit base not found.");
                            }

                            int unitCost = unitStats[0].Cost;
                            int unitSupply = unitStats[0].Supply;
                            string unitType = unitStats[0].UnitType ?? "";

                            // Calculate new gold and supply after purchase
                            currentGold -= unitCost * request.PurchaseAmount;
                            var supplyCost = unitSupply * request.PurchaseAmount;
                            supplyCapacity -= supplyCost;

                            if (currentGold < 0)
                            {
                                return BadRequest("Not Enough Gold");
                            }
                            if (supplyCapacity < 0)
                            {
                                return BadRequest("Not Enough Supply");
                            }

                            // Update Nexus's gold and supply
                            await UpdateNexusGoldAndSupply(request.Nexus.CoordsX, request.Nexus.CoordsY, currentGold, supplyCost, conn, transaction);

                            // Update Nexus's units
                           // await UpdateNexusUnits(request.Nexus.CoordsX, request.Nexus.CoordsY, unitType, request.PurchaseAmount, conn, transaction);
                            await UpdateNexusUnitPurchases(request.Nexus.CoordsX, request.Nexus.CoordsY, request.UnitId, request.PurchaseAmount, conn, transaction);

                            // Commit transaction if all operations succeed
                            await transaction.CommitAsync();
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError($"Error while purchasing units: {ex.Message}");
                            await transaction.RollbackAsync();
                            return BadRequest(ex.Message);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError($"Error with database connection: {ex.Message}");
                return StatusCode(500, "Database error");
            }

            return Ok();
        }
         

        private async Task UpdateNexusUnits(NexusBase nexus, MySqlConnection conn, MySqlTransaction transaction)
        {
            Console.WriteLine("Update Nexus Units");
            List<UnitStats> stats = await GetUnitStatsFromDB(null);

            List<NexusUnitsPurchased>? purchased = await GetNexusUnitPurchases(conn, nexus, transaction);
            if (purchased != null && stats.Count > 0)
            {
                for (var x = 0; x < purchased.Count; x++)
                {
                    UnitStats stat = stats.First(stat => stat.UnitId == purchased[x].UnitIdPurchased);
                    int duration = stat.Duration * purchased[x].QuantityPurchased;
                    string unitType = stat.UnitType ?? "";
                    TimeSpan timeElapsed = DateTime.Now - purchased[x].Timestamp;
                    Console.WriteLine($"Verifying {unitType} with timeElapsed: {timeElapsed} and duration : {duration}... timeElapsed.TotalSeconds{timeElapsed.TotalSeconds} - duration : {timeElapsed.TotalSeconds - duration}");
                    if (Math.Abs(timeElapsed.TotalSeconds - duration) >= 3)
                    {
                        string sqlUpdate = $@"
                            INSERT INTO nexus_units (coords_x, coords_y, {unitType}_total)
                            VALUES (@CoordsX, @CoordsY, @UnitsTotal)
                            ON DUPLICATE KEY UPDATE
                            {unitType}_total = {unitType}_total + @UnitsTotal;";

                        MySqlCommand cmdUpdate = new MySqlCommand(sqlUpdate, conn, transaction);
                        cmdUpdate.Parameters.AddWithValue("@UnitsTotal", purchased[x].QuantityPurchased);
                        cmdUpdate.Parameters.AddWithValue("@CoordsX", purchased[x].CoordsX);
                        cmdUpdate.Parameters.AddWithValue("@CoordsY", purchased[x].CoordsY);
                        await cmdUpdate.ExecuteNonQueryAsync();

                        string sqlDelete = $@"
                            DELETE FROM nexus_unit_purchases 
                            WHERE coords_x = @CoordsX 
                            AND coords_y = @CoordsY 
                            AND unit_id_purchased = @UnitId 
                            AND quantity_purchased = @UnitsTotal 
                            AND timestamp = @Timestamp;";

                        MySqlCommand cmdDelete = new MySqlCommand(sqlDelete, conn, transaction);
                        cmdDelete.Parameters.AddWithValue("@UnitsTotal", purchased[x].QuantityPurchased);
                        cmdDelete.Parameters.AddWithValue("@Timestamp", purchased[x].Timestamp);
                        cmdDelete.Parameters.AddWithValue("@UnitId", purchased[x].UnitIdPurchased);
                        cmdDelete.Parameters.AddWithValue("@CoordsX", purchased[x].CoordsX);
                        cmdDelete.Parameters.AddWithValue("@CoordsY", purchased[x].CoordsY);
                        Console.WriteLine($"Updated Nexus Units {unitType}: {purchased[x].QuantityPurchased}");
                        await cmdDelete.ExecuteNonQueryAsync();
                    }

                }
            } 
        }

        private async Task UpdateNexusUnitPurchases(int coordsX, int coordsY, int unitId, int unitsToAdd, MySqlConnection conn, MySqlTransaction transaction)
        {
            string sqlUpdate = $@"
        INSERT INTO nexus_unit_purchases (coords_x, coords_y, unit_id_purchased, quantity_purchased)
        VALUES (@CoordsX, @CoordsY, @UnitId, @UnitsTotal);";

            MySqlCommand cmdUpdate = new MySqlCommand(sqlUpdate, conn, transaction);
            cmdUpdate.Parameters.AddWithValue("@UnitsTotal", unitsToAdd);
            cmdUpdate.Parameters.AddWithValue("@UnitId", unitId);
            cmdUpdate.Parameters.AddWithValue("@CoordsX", coordsX);
            cmdUpdate.Parameters.AddWithValue("@CoordsY", coordsY);
            Console.WriteLine($"Updated Nexus Unit Purchases {unitId}: {unitsToAdd}");
            await cmdUpdate.ExecuteNonQueryAsync();
        }

        private async Task UpdateNexusGoldAndSupply(int coordsX, int coordsY, int newGoldAmount, int newSupplyAmount, MySqlConnection conn, MySqlTransaction transaction)
        {
            string sqlUpdate = @"
        UPDATE nexus_bases
        SET gold = @Gold, supply = supply + @Supply
        WHERE coords_x = @CoordsX AND coords_y = @CoordsY;";

            MySqlCommand cmdUpdate = new MySqlCommand(sqlUpdate, conn, transaction);
            cmdUpdate.Parameters.AddWithValue("@Gold", newGoldAmount);
            cmdUpdate.Parameters.AddWithValue("@Supply", newSupplyAmount);
            cmdUpdate.Parameters.AddWithValue("@CoordsX", coordsX);
            cmdUpdate.Parameters.AddWithValue("@CoordsY", coordsY);
            Console.WriteLine($"Updated nexus gold {newGoldAmount} and supply {newSupplyAmount}");
            await cmdUpdate.ExecuteNonQueryAsync();
        }

        private async Task<(int currentGold, int supplyCapacity)> GetNexusGoldAndSupply(NexusPurchaseUnitRequest request, MySqlConnection conn, MySqlTransaction transaction)
        {
            var res = (0,0);
            try
            {
                string sqlCurrentLevels = @"
                        SELECT 
                            supply_depot_level, gold
                        FROM 
                            nexus_bases
                        WHERE 
                            coords_x = @CoordsX
                            AND coords_y = @CoordsY";

                using (MySqlCommand cmdLvl = new MySqlCommand(sqlCurrentLevels, conn, transaction))
                {
                    Console.WriteLine("creating command for levels");
                    cmdLvl.Parameters.AddWithValue("@CoordsX", request.Nexus.CoordsX);
                    cmdLvl.Parameters.AddWithValue("@CoordsY", request.Nexus.CoordsY);
                    using (var readerCurrentLevels = await cmdLvl.ExecuteReaderAsync())
                    {
                        if (await readerCurrentLevels.ReadAsync())
                        {
                            int supplyCapacity = readerCurrentLevels.GetInt32("supply_depot_level") * 2500;
                            int currentGold = readerCurrentLevels.GetInt32("gold");
                            Console.WriteLine($"Got current supplyCapacity {supplyCapacity} and currentGold: {currentGold}");
                            res = (currentGold, supplyCapacity);
                        }
                    }
                }
            } catch (Exception ex)
            { 
                Console.WriteLine($"Error reading current levels: {ex.Message}");
                throw;
            }
            
            return res;
        }
        private async Task<int> GetNexusSupply(NexusPurchaseUnitRequest request, MySqlConnection conn, MySqlTransaction transaction)
        {
            int res = 0;
            try
            {
                string sqlCurrentSupply = @"
            SELECT 
                u.marine_total,
                u.goliath_total,
                u.siege_tank_total,
                u.wraith_total,
                u.battlecruiser_total,
                COALESCE(marines.supply, 0) AS marines_supply,
                COALESCE(goliaths.supply, 0) AS goliaths_supply,
                COALESCE(siege_tanks.supply, 0) AS siege_tanks_supply,
                COALESCE(wraiths.supply, 0) AS wraiths_supply,
                COALESCE(battlecruisers.supply, 0) AS battlecruisers_supply
            FROM 
                nexus_units u
            LEFT JOIN 
                (SELECT 
                     unit_id, unit_level, supply
                 FROM 
                     nexus_unit_stats
                 WHERE 
                     unit_id = 6) AS marines ON marines.unit_level = 0
            LEFT JOIN 
                (SELECT 
                     unit_id, unit_level, supply
                 FROM 
                     nexus_unit_stats
                 WHERE 
                     unit_id = 7) AS goliaths ON goliaths.unit_level = 0
            LEFT JOIN 
                (SELECT 
                     unit_id, unit_level, supply
                 FROM 
                     nexus_unit_stats
                 WHERE 
                     unit_id = 8) AS battlecruisers ON battlecruisers.unit_level = 0
            LEFT JOIN 
                (SELECT 
                     unit_id, unit_level, supply
                 FROM 
                     nexus_unit_stats
                 WHERE 
                     unit_id = 9) AS wraiths ON wraiths.unit_level = 0
            LEFT JOIN 
                (SELECT 
                     unit_id, unit_level, supply
                 FROM 
                     nexus_unit_stats
                 WHERE 
                     unit_id = 10) AS siege_tanks ON siege_tanks.unit_level = 0
            WHERE 
                u.coords_x = @CoordsX
            AND u.coords_y = @CoordsY";

                using (MySqlCommand cmdCurrentSupply = new MySqlCommand(sqlCurrentSupply, conn, transaction))
                {
                    cmdCurrentSupply.Parameters.AddWithValue("@CoordsX", request.Nexus.CoordsX);
                    cmdCurrentSupply.Parameters.AddWithValue("@CoordsY", request.Nexus.CoordsY);

                    using (var readerCurrentSupply = await cmdCurrentSupply.ExecuteReaderAsync())
                    {
                        if (!await readerCurrentSupply.ReadAsync())
                        {
                            await readerCurrentSupply.CloseAsync();
                            return 0;
                        }

                        int marinesTotal = readerCurrentSupply.GetInt32("marine_total");
                        int marinesSupply = readerCurrentSupply.GetInt32("marines_supply");
                        int goliathTotal = readerCurrentSupply.GetInt32("goliath_total");
                        int goliathSupply = readerCurrentSupply.GetInt32("goliaths_supply");
                        int siegeTankTotal = readerCurrentSupply.GetInt32("siege_tank_total");
                        int siegeTankSupply = readerCurrentSupply.GetInt32("siege_tanks_supply");
                        int wraithTotal = readerCurrentSupply.GetInt32("wraith_total");
                        int wraithSupply = readerCurrentSupply.GetInt32("wraiths_supply");
                        int battleCruiserTotal = readerCurrentSupply.GetInt32("battlecruiser_total");
                        int battleCruiserSupply = readerCurrentSupply.GetInt32("battlecruisers_supply");

                        marinesTotal *= marinesSupply;
                        goliathTotal *= goliathSupply;
                        siegeTankTotal *= siegeTankSupply;
                        wraithTotal *= wraithSupply;
                        battleCruiserTotal *= battleCruiserSupply;

                        res = marinesTotal + goliathTotal + siegeTankTotal + wraithTotal + battleCruiserTotal;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
                throw; // Rethrow or handle the exception appropriately
            }
            return res;
        }


        [HttpPost("/Nexus/GetBuildingUpgrades", Name = "GetBuildingUpgrades")]
        public async Task<IActionResult> GetBuildingUpgrades([FromBody] NexusRequest request)
        {
            Console.WriteLine($"POST /Nexus/GetBuildingUpgrades for player ({request.User.Id})");

            if (request.User == null || request.User.Id == 0)
            {
                return BadRequest("Invalid user data.");
            }
            if (request.Nexus == null)
            {
                return NotFound("User base not found.");
            }

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                await conn.OpenAsync();

                string sqlCurrentLevels = @"
                    SELECT 
                        command_center_level, 
                        mines_level, 
                        supply_depot_level, 
                        warehouse_level, 
                        engineering_bay_level, 
                        factory_level, 
                        starport_level
                    FROM 
                        nexus_bases
                    WHERE 
                        coords_x = @CoordsX
                    AND coords_y = @CoordsY";
                MySqlCommand cmdCurrentLevels = new MySqlCommand(sqlCurrentLevels, conn);
                cmdCurrentLevels.Parameters.AddWithValue("@CoordsX", request.Nexus.CoordsX);
                cmdCurrentLevels.Parameters.AddWithValue("@CoordsY", request.Nexus.CoordsY);

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
                int currentEngineeringBayLevel = readerCurrentLevels.GetInt32("engineering_bay_level");
                int currentWarehouseLevel = readerCurrentLevels.GetInt32("warehouse_level");
                int currentStarportLevel = readerCurrentLevels.GetInt32("starport_level");
                await readerCurrentLevels.CloseAsync();

                string sqlUpgradeTimestamps = @"
                    SELECT 
                        command_center_upgraded, 
                        mines_upgraded, 
                        supply_depot_upgraded, 
                        warehouse_upgraded, 
                        engineering_bay_upgraded, 
                        factory_upgraded, 
                        starport_upgraded
                    FROM nexus_base_upgrades
                    WHERE coords_x = @CoordsX AND coords_y = @CoordsY";
                MySqlCommand cmdUpgradeTimestamps = new MySqlCommand(sqlUpgradeTimestamps, conn);
                cmdUpgradeTimestamps.Parameters.AddWithValue("@CoordsX", request.Nexus.CoordsX);
                cmdUpgradeTimestamps.Parameters.AddWithValue("@CoordsY", request.Nexus.CoordsY);

                var readerUpgradeTimestamps = await cmdUpgradeTimestamps.ExecuteReaderAsync();
                DateTime? commandCenterUpgraded = null;
                DateTime? minesUpgraded = null;
                DateTime? supplyDepotUpgraded = null;
                DateTime? warehouseUpgraded = null;
                DateTime? engineeringBayUpgraded = null;
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
                    engineeringBayUpgraded = readerUpgradeTimestamps.IsDBNull(readerUpgradeTimestamps.GetOrdinal("engineering_bay_upgraded")) ?
                                    null : (DateTime?)readerUpgradeTimestamps.GetDateTime("engineering_bay_upgraded");
                    warehouseUpgraded = readerUpgradeTimestamps.IsDBNull(readerUpgradeTimestamps.GetOrdinal("warehouse_upgraded")) ?
                                    null : (DateTime?)readerUpgradeTimestamps.GetDateTime("warehouse_upgraded");
                    factoryUpgraded = readerUpgradeTimestamps.IsDBNull(readerUpgradeTimestamps.GetOrdinal("factory_upgraded")) ?
                                    null : (DateTime?)readerUpgradeTimestamps.GetDateTime("factory_upgraded");
                    starportUpgraded = readerUpgradeTimestamps.IsDBNull(readerUpgradeTimestamps.GetOrdinal("starport_upgraded")) ?
                                    null : (DateTime?)readerUpgradeTimestamps.GetDateTime("starport_upgraded");
                }
                await readerUpgradeTimestamps.CloseAsync();

                var durations = new Dictionary<string, Dictionary<int, int>>();
                var costs = new Dictionary<string, Dictionary<int, int>>();
                string sqlDurations = @"
                    SELECT 
                        building_type, building_level, duration, cost
                    FROM 
                        nexus_base_upgrade_stats
                    WHERE 
                        building_type 
                        IN (
                            SELECT id 
                            FROM nexus_building_types 
                            WHERE type IN ('command_center', 'mines', 'supply_depot', 'warehouse', 'engineering_bay', 'factory', 'starport')
                        )";
                MySqlCommand cmdDurations = new MySqlCommand(sqlDurations, conn);
                var readerDurations = await cmdDurations.ExecuteReaderAsync();
                while (await readerDurations.ReadAsync())
                {
                    int buildingType = readerDurations.GetInt32("building_type");
                    int level = readerDurations.GetInt32("building_level");
                    int duration = readerDurations.GetInt32("duration");
                    int cost = readerDurations.GetInt32("cost");

                    string buildingTypeEnum = GetBuildingTypeFromTypeId(buildingType);
                    if (!string.IsNullOrEmpty(buildingTypeEnum))
                    {
                        if (!durations.ContainsKey(buildingTypeEnum))
                        {
                            durations[buildingTypeEnum] = new Dictionary<int, int>();
                        }
                        if (!costs.ContainsKey(buildingTypeEnum))
                        {
                            costs[buildingTypeEnum] = new Dictionary<int, int>();
                        }
                        durations[buildingTypeEnum][level] = duration;
                        costs[buildingTypeEnum][level] = cost;
                    }
                }
                await readerDurations.CloseAsync();

                var availableUpgrades = new List<object>();
                var buildings = new List<(string BuildingName, int CurrentLevel, DateTime? LastUpgraded)>
                {
                    ("command_center", currentCommandCenterLevel, commandCenterUpgraded),
                    ("mines", currentMinesLevel, minesUpgraded),
                    ("supply_depot", currentSupplyDepotLevel, supplyDepotUpgraded),
                    ("warehouse", currentWarehouseLevel, warehouseUpgraded),
                    ("engineering_bay", currentEngineeringBayLevel, engineeringBayUpgraded),
                    ("factory", currentFactoryLevel, factoryUpgraded),
                    ("starport", currentStarportLevel, starportUpgraded)
                };

                foreach (var (buildingName, currentLevel, lastUpgraded) in buildings)
                {
                    int duration = durations.ContainsKey(buildingName) && durations[buildingName].ContainsKey(currentLevel) ? durations[buildingName][currentLevel] : 0;
                    int cost = costs.ContainsKey(buildingName) && costs[buildingName].ContainsKey(currentLevel) ? costs[buildingName][currentLevel] : 0;
                    availableUpgrades.Add(new
                    {
                        Building = buildingName,
                        NextLevel = currentLevel,
                        Duration = duration,
                        Cost = cost
                    });

                }
                return Ok(new { Upgrades = availableUpgrades });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"An error occurred while retrieving building upgrades for user {request.User.Id}");
                return StatusCode(500, "Internal server error");
            }
            finally
            {
                await conn.CloseAsync();
            }
        }


        private string GetBuildingTypeFromTypeId(int typeId)
        {
            string buildingType = "";

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                conn.Open();

                string sql = "SELECT type FROM nexus_building_types WHERE id = @TypeId";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@TypeId", typeId);

                object? result = cmd.ExecuteScalar();
                if (result != null)
                {
                    buildingType = result.ToString() ?? "";
                }

                conn.Close();
            }

            return buildingType;
        }


        [HttpPost("/Nexus/UpgradeMines", Name = "UpgradeMines")]
        public Task<IActionResult> UpgradeMines([FromBody] NexusRequest req)
        {
            return UpgradeComponent(req.User, "mines", req.Nexus);
        }

        [HttpPost("/Nexus/UpgradeFactory", Name = "UpgradeFactory")]
        public Task<IActionResult> UpgradeFactory([FromBody] NexusRequest req)
        {
            return UpgradeComponent(req.User, "factory", req.Nexus);
        }

        [HttpPost("/Nexus/UpgradeStarport", Name = "UpgradeStarport")]
        public Task<IActionResult> UpgradeStarport([FromBody] NexusRequest req)
        {
            return UpgradeComponent(req.User, "starport", req.Nexus);
        }


        [HttpPost("/Nexus/UpgradeEngineeringBay", Name = "UpgradeEngineeringBay")]
        public Task<IActionResult> UpgradeEngineeringBay([FromBody] NexusRequest req)
        {
            return UpgradeComponent(req.User, "engineering_bay", req.Nexus);
        }


        [HttpPost("/Nexus/UpgradeWarehouse", Name = "UpgradeWarehouse")]
        public Task<IActionResult> UpgradeWarehouse([FromBody] NexusRequest req)
        {
            return UpgradeComponent(req.User, "warehouse", req.Nexus);
        }

        [HttpPost("/Nexus/UpgradeNexus", Name = "UpgradeNexus")]
        public Task<IActionResult> UpgradeNexus([FromBody] NexusRequest req)
        {
            return UpgradeComponent(req.User, "command_center", req.Nexus);
        }

        [HttpPost("/Nexus/UpgradeSupplyDepot", Name = "UpgradeSupplyDepot")]
        public Task<IActionResult> UpgradeSupplyDepot([FromBody] NexusRequest req)
        {
            return UpgradeComponent(req.User, "supply_depot", req.Nexus);
        }

        private async Task<IActionResult> UpgradeComponent(User user, string component, NexusBase? nexus)
        {
            Console.WriteLine($"POST /Nexus/Upgrade{component} ({user.Id})");
            if (nexus == null)
            {
                return NotFound("Base not found.");
            }

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

                    // Check if a record exists in nexus_base_upgrades
                    string selectSql = @"
                        SELECT COUNT(*) 
                        FROM nexus_base_upgrades 
                        WHERE coords_x = @CoordsX AND coords_y = @CoordsY";
                    MySqlCommand selectCmd = new MySqlCommand(selectSql, conn, transaction);
                    selectCmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
                    selectCmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);

                    var res = await selectCmd.ExecuteScalarAsync();
                    if (res != null && (long)res > 0)
                    { 
                        // Update the existing record
                        string updateUpgradeSql = $@"
                        UPDATE 
                            nexus_base_upgrades 
                        SET {component}_upgraded = @Timestamp 
                        WHERE 
                            coords_x = @CoordsX 
                        AND coords_y = @CoordsY";
                        MySqlCommand updateUpgradeCmd = new MySqlCommand(updateUpgradeSql, conn, transaction);
                        updateUpgradeCmd.Parameters.AddWithValue("@Timestamp", DateTime.Now.AddSeconds(-1));
                        updateUpgradeCmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
                        updateUpgradeCmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);

                        await updateUpgradeCmd.ExecuteNonQueryAsync(); 
                    }
                    else
                    {
                        // Insert a new record
                        string insertUpgradeSql = $@"
                            INSERT INTO nexus_base_upgrades (coords_x, coords_y, {component}_upgraded)
                            VALUES (@CoordsX, @CoordsY, @Timestamp)";
                        MySqlCommand insertUpgradeCmd = new MySqlCommand(insertUpgradeSql, conn, transaction);
                        insertUpgradeCmd.Parameters.AddWithValue("@Timestamp", DateTime.Now.AddSeconds(-1));
                        insertUpgradeCmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
                        insertUpgradeCmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);

                        await insertUpgradeCmd.ExecuteNonQueryAsync();
                    }

                    // Update the nexus_bases table (subtract gold and increment level)
                    string updateBaseSql = $@"
                        UPDATE maxhanna.nexus_bases
                        SET 
                            gold = gold - @UpgradeCost
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
