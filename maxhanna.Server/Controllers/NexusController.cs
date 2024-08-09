using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using System;
using System.Transactions;

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
            Console.WriteLine($"POST /Nexus ({req.User.Id}, {req.Nexus?.CoordsX}:{req.Nexus?.CoordsY}), current base gold : {req.Nexus?.Gold}");

            if (req.User == null || req.User.Id == 0)
            {
                return BadRequest("Invalid user data.");
            }

            using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        if (req.Nexus == null)
                        {
                            req.Nexus = await GetUserFirstBase(req.User, connection, transaction);
                            req.Nexus = await GetNexusBase(req.Nexus?.CoordsX, req.Nexus?.CoordsY, connection, transaction);
                        } 
                        await RecalculateNexusGold(connection, req.Nexus, transaction); 

                        NexusBase? nexusBase = await GetNexusBase(req.Nexus?.CoordsX, req.Nexus?.CoordsY, connection, transaction);
                        NexusBaseUpgrades? nexusBaseUpgrades = await GetNexusBaseUpgrades(nexusBase, connection, transaction);
                        NexusUnits? nexusUnits = await GetNexusUnits(nexusBase, false, connection, transaction);
                        List<NexusUnitsPurchased>? nexusUnitPurchasesList = await GetNexusUnitPurchases(nexusBase, connection, transaction);
                        List<NexusAttackSent>? nexusAttacksSent = await GetNexusAttacksSent(nexusBase, false, connection, transaction);
                        List<NexusAttackSent>? nexusAttacksIncoming = await GetNexusAttacksIncoming(nexusBase, false, false, connection, transaction);
                        List<NexusAttackSent>? nexusDefencesSent = await GetNexusDefencesSent(nexusBase, false, connection, transaction);
                        List<NexusAttackSent>? nexusDefencesIncoming = await GetNexusDefencesIncoming(nexusBase, false, true, connection, transaction); 
                        List<NexusUnitUpgrades>? nexusUnitUpgrades = await GetNexusUnitUpgrades(nexusBase, connection, transaction);                        
                        await transaction.CommitAsync();

                        return Ok(
                            new
                            {
                                nexusBase = nexusBase ?? new NexusBase(),
                                nexusBaseUpgrades = nexusBaseUpgrades ?? new NexusBaseUpgrades(),
                                nexusUnits = nexusUnits ?? new NexusUnits(),
                                nexusUnitsPurchasedList = nexusUnitPurchasesList ?? new List<NexusUnitsPurchased>(),
                                nexusAttacksSent,
                                nexusDefencesSent,
                                nexusAttacksIncoming,
                                nexusDefencesIncoming,
                                nexusUnitUpgrades,
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


        [HttpPost("/Nexus/GetAllBuildingUpgradesList", Name = "GetAllBuildingUpgradesList")]
        public async Task<IActionResult> GetAllBuildingUpgradesList()
        {
            Console.WriteLine($"POST /Nexus/GetAllBuildingUpgradesList");


            using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {

                        var availableUpgrades = await GetAllBuildingUpgradeList(connection, transaction);

                        await transaction.CommitAsync();
                        return Ok(availableUpgrades);
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }


        [HttpPost("/Nexus/GetAllMiningSpeeds", Name = "GetAllMiningSpeeds")]
        public async Task<IActionResult> GetAllMiningSpeeds()
        {
            Console.WriteLine($"POST /Nexus/GetAllMiningSpeeds"); 
            List<NexusMiningSpeed> speeds = new List<NexusMiningSpeed>();
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));

            await conn.OpenAsync();
            MySqlTransaction transaction = await conn.BeginTransactionAsync();

            try
            {

                // Insert new base at the available location
                string sql = @"
                    SELECT id, mines_level, speed 
                    FROM 
                        maxhanna.nexus_mining_speed;";


                MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                         
                        NexusMiningSpeed tmpMiningSpeed = new NexusMiningSpeed();
                        tmpMiningSpeed.Id = reader.IsDBNull(reader.GetOrdinal("id")) ? 0 : reader.GetInt32(reader.GetOrdinal("id")); 
                        tmpMiningSpeed.MinesLevel = reader.IsDBNull(reader.GetOrdinal("mines_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("mines_level")); 
                        tmpMiningSpeed.Speed = reader.IsDBNull(reader.GetOrdinal("speed")) ? 0 : reader.GetDecimal(reader.GetOrdinal("speed")); 
                        speeds.Add(tmpMiningSpeed);
                        //await RecalculateNexusGold(conn, tmpBase, transaction);
                    }
                }

                await transaction.CommitAsync();
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "An error occurred getting mining speeds");
                return StatusCode(500, "Internal server error");
            }
            finally
            {
                await conn.CloseAsync();
            }

            return Ok(speeds);
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

            await conn.OpenAsync();
            MySqlTransaction transaction = await conn.BeginTransactionAsync();

            try
            {

                // Insert new base at the available location
                string sql = @"
                    SELECT 
                        n.user_id, u.username, n.coords_x, n.coords_y, n.gold, n.command_center_level, n.engineering_bay_level, n.mines_level, n.factory_level, n.starport_level, warehouse_level, udp.file_id
                    FROM 
                        maxhanna.nexus_bases n
                    LEFT JOIN 
                        maxhanna.users u on u.id = n.user_id
                    LEFT JOIN 
                        maxhanna.user_display_pictures udp on udp.user_id = n.user_id;";


                MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        FileEntry? dp = null;
                        if (!reader.IsDBNull(reader.GetOrdinal("file_id")))
                        {
                            dp = new FileEntry();
                            dp.Id = reader.GetInt32(reader.GetOrdinal("file_id"));
                        }
                        NexusBase tmpBase = new NexusBase();
                        tmpBase.CoordsX = reader.IsDBNull(reader.GetOrdinal("coords_x")) ? 0 : reader.GetInt32(reader.GetOrdinal("coords_x"));
                        tmpBase.CoordsY = reader.IsDBNull(reader.GetOrdinal("coords_y")) ? 0 : reader.GetInt32(reader.GetOrdinal("coords_y"));
                        tmpBase.CommandCenterLevel = reader.IsDBNull(reader.GetOrdinal("command_center_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("command_center_level"));
                        tmpBase.MinesLevel = reader.IsDBNull(reader.GetOrdinal("mines_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("mines_level"));
                        tmpBase.EngineeringBayLevel = reader.IsDBNull(reader.GetOrdinal("engineering_bay_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("engineering_bay_level"));
                        tmpBase.FactoryLevel = reader.IsDBNull(reader.GetOrdinal("factory_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("factory_level"));
                        tmpBase.StarportLevel = reader.IsDBNull(reader.GetOrdinal("starport_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("starport_level"));
                        tmpBase.WarehouseLevel = reader.IsDBNull(reader.GetOrdinal("warehouse_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("warehouse_level"));
                        tmpBase.Gold = reader.IsDBNull(reader.GetOrdinal("gold")) ? 0 : reader.GetDecimal(reader.GetOrdinal("gold"));
                        tmpBase.User =
                            new User(reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32(reader.GetOrdinal("user_id")),
                                reader.IsDBNull(reader.GetOrdinal("username")) ? "Anonymous" : reader.GetString(reader.GetOrdinal("username")),
                                null,
                                dp,
                                null);
                        bases.Add(tmpBase);
                        //await RecalculateNexusGold(conn, tmpBase, transaction);
                    }
                }

                await transaction.CommitAsync();
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "An error occurred while starting the game for player {UserId}", user.Id);
                return StatusCode(500, "Internal server error");
            }
            finally
            {
                await conn.CloseAsync();
            }

            return Ok(bases);
        }


        [HttpPost("/Nexus/GetBattleReports", Name = "GetBattleReports")]
        public async Task<IActionResult> GetBattleReportsByUser([FromBody] BattleReportRequest request)
        {
            Console.WriteLine($"POST /Nexus/GetBattleReports for player {request.User.Id} targetBase: {request.TargetBase?.CoordsX},{request.TargetBase?.CoordsY} ");
            var paginatedReports = await GetAllBattleReports(request.User.Id, request.TargetBase, request.PageNumber, request.PageSize, null, null);
            return Ok(paginatedReports);
        }

        [HttpPost("/Nexus/GetMinesInfo", Name = "GetMinesInfo")]
        public async Task<IActionResult> GetMinesInfo([FromBody] NexusRequest request)
        {
            Console.WriteLine($"POST /Nexus/GetMinesInfo for player {request.User.Id}");
            if (request.Nexus == null)
            {
                return Ok(0);
            }
            return Ok(await GetMiningSpeedForNexus(request.Nexus, null, null));
        }

        private async Task<decimal> GetMiningSpeedForNexus(NexusBase? nexusBase, MySqlConnection? connection, MySqlTransaction? transaction)
        {
            if (nexusBase == null)
            {
                return 0;
            }
            decimal speed = Decimal.One;

            bool ownConnection = false;
            bool ownTransaction = false;

            try
            {
                if (connection == null)
                {
                    connection = new MySqlConnection("your-connection-string-here");
                    await connection.OpenAsync();
                    ownConnection = true;
                }

                if (transaction == null)
                {
                    transaction = await connection.BeginTransactionAsync();
                    ownTransaction = true;
                }

                string sql = @"
                    SELECT 
                        speed
                    FROM 
                        maxhanna.nexus_mining_speed s
                    LEFT JOIN 
                        maxhanna.nexus_bases n ON s.mines_level = n.mines_level 
                    WHERE 
                        n.coords_x = @CoordsX 
                    AND n.coords_y = @CoordsY";

                MySqlCommand cmd = new MySqlCommand(sql, connection, transaction);
                cmd.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                cmd.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        speed = reader.IsDBNull(reader.GetOrdinal("speed")) ? 0 : reader.GetDecimal(reader.GetOrdinal("speed"));
                        break;
                    }
                }

                if (ownTransaction)
                {
                    await transaction.CommitAsync();
                }
            }
            catch (Exception ex)
            {
                if (ownTransaction && transaction != null)
                {
                    await transaction.RollbackAsync();
                }

                _logger.LogError(ex, $"An error occurred while GetMinesInfo");
            }
            finally
            {
                if (ownConnection && connection != null)
                {
                    await connection.CloseAsync();
                    await connection.DisposeAsync();
                }

                if (ownTransaction && transaction != null)
                {
                    await transaction.DisposeAsync();
                }
            }
            return speed;
        }

        [HttpPost("/Nexus/GetUnitStats", Name = "GetUnitStats")]
        public async Task<IActionResult> GetUnitStats([FromBody] NexusRequest request)
        {
            Console.WriteLine($"POST /Nexus/GetUnitStats for player {request.User.Id}");
            List<UnitStats> unitStats = await GetUnitStatsFromDB(null, null);

            return Ok(unitStats);
        }

        [HttpPost("/Nexus/GetUnitUpgradeStats", Name = "GetUnitUpgradeStats")]
        public async Task<IActionResult> GetUnitUpgradeStats([FromBody] User user)
        {
            Console.WriteLine($"POST /Nexus/GetUnitUpgradeStats for player {user.Id}");
            List<UnitUpgradeStats> unitStats = await GetUnitUpgradeStatsFromDB(null, null);

            return Ok(unitStats);
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
                            await RecalculateNexusGold(conn, request.Nexus, transaction);
                            //Console.WriteLine("Updated Gold");
                            List<UnitStats> unitStats = await GetUnitStatsFromDB(request.UnitId, null);
                            if (unitStats == null || unitStats.Count <= 0)
                            {
                                return NotFound("Unit not found.");
                            }

                            if (unitStats.First().UnitType == "glitcher")
                            {
                                NexusUnits? currentUnits = await GetNexusUnits(request.Nexus, false, conn, transaction);
                                if (currentUnits != null && currentUnits.GlitcherTotal > 0)
                                {
                                    return BadRequest("Only one glitcher allowed per base.");
                                }
                            }

                            UnitStats unit = unitStats.First(x => x.UnitId == request.UnitId);
                            int unitCost = unit.Cost;
                            int unitSupply = unit.Supply;
                            string unitType = unit.UnitType ?? "";

                            Console.WriteLine($"Unit purchased: {unitType}, unitSupply: {unitSupply}, unitCost: {unitCost}, totalCost: {unitCost * request.PurchaseAmount}");
                            var (currentGold, totalSupplyUsed) = await GetNexusGoldAndSupply(request.Nexus, conn, transaction);
                            int currentSupplyUsed = await CalculateUsedNexusSupply(request.Nexus, conn, transaction);
                            Console.WriteLine($"before purchase : {unitType}, currentGold: {currentGold}, currentSupplyUsed: {currentSupplyUsed}");

                            currentGold -= (unitCost * request.PurchaseAmount);
                            var supplyCost = (unitSupply * request.PurchaseAmount);
                            totalSupplyUsed = (supplyCost + currentSupplyUsed);

                            Console.WriteLine($"After Unit purchased: {unitType}, totalSupplyUsed: {totalSupplyUsed}, currentGold: {currentGold}, supplyCost: {supplyCost}, currentSupplyUsed: {currentSupplyUsed}");

                            if (currentGold < 0)
                            {
                                return BadRequest("Not Enough Gold");
                            }
                            if (totalSupplyUsed < 0)
                            {
                                return BadRequest("Not Enough Supply");
                            }
                            await UpdateNexusGoldAndSupply(request.Nexus.CoordsX, request.Nexus.CoordsY, currentGold, totalSupplyUsed, conn, transaction);
                            Console.WriteLine("current gold : after the update: " + currentGold);
                            await UpdateNexusUnitPurchases(request.Nexus.CoordsX, request.Nexus.CoordsY, request.UnitId, request.PurchaseAmount, conn, transaction);

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
            var availableUpgrades = await GetBuildingUpgradeList(request.Nexus, null, null);

            return Ok(new { Upgrades = availableUpgrades });
        }

        [HttpPost("/Nexus/DeleteReport", Name = "DeleteReport")]
        public async Task<IActionResult> DeleteReport([FromBody] NexusDeleteReportRequest request)
        {
            Console.WriteLine($"POST /Nexus/DeleteReport for player ({request.User.Id})");

            if (request.User == null || request.User.Id == 0)
            {
                return BadRequest("Invalid user data.");
            }
            await DeleteReport(request.User.Id, request.BattleId);

            return Ok($"Report {request.BattleId} deleted.");
        }


        [HttpPost("/Nexus/Research", Name = "Research")]
        public async Task<IActionResult> Research([FromBody] NexusResearchRequest request)
        {
            Console.WriteLine($"POST /Nexus/Research for player ({request.User.Id})");

            if (request.User == null || request.User.Id == 0)
            {
                return BadRequest("Invalid user data.");
            }
            Console.WriteLine($"Rearch info -> unitId: {request.Unit.UnitId}");

            try
            {
                using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
                    {
                        try
                        {
                            await RecalculateNexusGold(conn, request.NexusBase, transaction);
                            NexusBase? nexus = await GetNexusBase(request.NexusBase.CoordsX, request.NexusBase.CoordsY, conn, transaction);

                            // Check if Nexus base is null before proceeding
                            if (nexus == null)
                            {
                                return NotFound("Nexus base not found.");
                            }

                            // Retrieve unit upgrade stats and unit stats in parallel
                            List<UnitUpgradeStats> unitUpgradeStats = await GetUnitUpgradeStatsFromDB(conn, transaction);
                            List<UnitStats> unitStats = await GetUnitStatsFromDB(request.Unit.UnitId, null);
                             
                            // Check if upgrade stats and unit stats are found
                            if (unitUpgradeStats == null || unitUpgradeStats.Count == 0)
                            {
                                return NotFound("Unit upgrades not found.");
                            }
                            Console.WriteLine($"unitUpgradeStats length : {unitUpgradeStats.Count} unitstats length : {unitStats.Count}");
                            // Find the upgrade unit using LINQ
                            UnitStats upgradeUnit = unitStats[0];
                            Console.WriteLine("Upgrade unit : " + upgradeUnit?.UnitType ?? "");

                            if (unitStats == null || unitStats.Count == 0 || upgradeUnit == null)
                            {
                                return NotFound("Unit stats not found.");
                            }

                            // Get the unit level based on the unit type
                            int unitLevel = upgradeUnit?.UnitType switch
                            {
                                "marine" => nexus.MarineLevel,
                                "goliath" => nexus.GoliathLevel,
                                "siege_tank" => nexus.SiegeTankLevel,
                                "scout" => nexus.ScoutLevel,
                                "wraith" => nexus.WraithLevel,
                                "battlecruiser" => nexus.BattlecruiserLevel,
                                "glitcher" => nexus.GlitcherLevel,
                                _ => 0 // Default if the unit type does not match
                            };


                            //unit.cost * 10 * ((unit.unitLevel ? unit.unitLevel : 0) + 1
                            nexus.Gold -= (upgradeUnit.Cost * 10 * (unitLevel + 1));

                            if (nexus.Gold < 0)
                            {
                                return BadRequest("Not Enough Gold");
                            }
                            await UpdateNexusGoldAndSupply(nexus.CoordsX, nexus.CoordsY, nexus.Gold, null, conn, transaction);
                            await ResearchUnit(nexus, upgradeUnit, conn, transaction);
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
                return BadRequest("Something went wrong: " + ex.Message);
            }
            //substract money from unit.cost * 10 * ((unit.unitLevel ? unit.unitLevel : 0) + 1
             
            return Ok($"Research started.");
        }

        [HttpPost("/Nexus/UpgradeMines", Name = "UpgradeMines")]
        public Task<IActionResult> UpgradeMines([FromBody] NexusRequest req)
        {
            return UpgradeBuilding(req.User, "mines", req.Nexus);
        }

        [HttpPost("/Nexus/UpgradeFactory", Name = "UpgradeFactory")]
        public Task<IActionResult> UpgradeFactory([FromBody] NexusRequest req)
        {
            return UpgradeBuilding(req.User, "factory", req.Nexus);
        }

        [HttpPost("/Nexus/UpgradeStarport", Name = "UpgradeStarport")]
        public Task<IActionResult> UpgradeStarport([FromBody] NexusRequest req)
        {
            return UpgradeBuilding(req.User, "starport", req.Nexus);
        }


        [HttpPost("/Nexus/UpgradeEngineeringBay", Name = "UpgradeEngineeringBay")]
        public Task<IActionResult> UpgradeEngineeringBay([FromBody] NexusRequest req)
        {
            return UpgradeBuilding(req.User, "engineering_bay", req.Nexus);
        }


        [HttpPost("/Nexus/UpgradeWarehouse", Name = "UpgradeWarehouse")]
        public Task<IActionResult> UpgradeWarehouse([FromBody] NexusRequest req)
        {
            return UpgradeBuilding(req.User, "warehouse", req.Nexus);
        }

        [HttpPost("/Nexus/UpgradeNexus", Name = "UpgradeNexus")]
        public Task<IActionResult> UpgradeNexus([FromBody] NexusRequest req)
        {
            return UpgradeBuilding(req.User, "command_center", req.Nexus);
        }

        [HttpPost("/Nexus/UpgradeSupplyDepot", Name = "UpgradeSupplyDepot")]
        public Task<IActionResult> UpgradeSupplyDepot([FromBody] NexusRequest req)
        {
            return UpgradeBuilding(req.User, "supply_depot", req.Nexus);
        }

        [HttpPost("/Nexus/Engage", Name = "Engage")]
        public async Task<IActionResult> Engage([FromBody] NexusEngagementRequest req)
        {
            Console.WriteLine($"POST /Nexus/Engage for player ({req.User.Id}, distance: {req.DistanceTimeInSeconds})");
            if (req.DistanceTimeInSeconds == 0) { return BadRequest("Distance time must be greater then 0!"); }
            if (req.OriginNexus == null) { return BadRequest("Origin must be defined!"); }
            if (req.DestinationNexus == null) { return BadRequest("Destination must be defined!"); }

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await conn.OpenAsync();

                using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
                {
                    try
                    {
                        Console.WriteLine($@"Checking if base has enough units to send the attack.");
                        bool canSend = await DoesBaseHaveEnoughUnitsToSendAttack(req.OriginNexus, req.UnitList, true, null, null);
                        if (canSend)
                        {
                            Console.WriteLine("Sending the attack...");
                            await SendAttack(req.OriginNexus, req.DestinationNexus, req.OriginNexus.User, req.OriginNexus.User, req.UnitList, req.DistanceTimeInSeconds, conn, transaction);
                        }
                        else
                        {
                            Console.WriteLine("Not enough units.");
                            return BadRequest("Not enough units.");
                        }
                        await transaction.CommitAsync();
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("ERROR: " + ex.Message);
                        await transaction.RollbackAsync();
                    }
                }
            } 
            return Ok($"Attack sent to {"{" + req.DestinationNexus.CoordsX + "," + req.DestinationNexus.CoordsY + "}"}");
        }

        [HttpPost("/Nexus/Defend", Name = "Defend")]
        public async Task<IActionResult> Defend([FromBody] NexusEngagementRequest req)
        {
            Console.WriteLine($"POST /Nexus/Defend for player ({req.User.Id}, distance: {req.DistanceTimeInSeconds})");
            if (req.DistanceTimeInSeconds == 0) { return BadRequest("Distance time must be greater then 0!"); }
            if (req.OriginNexus == null) { return BadRequest("Origin must be defined!"); }
            if (req.DestinationNexus == null) { return BadRequest("Destination must be defined!"); }

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await conn.OpenAsync();

                using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
                {
                    try
                    {
                        Console.WriteLine($@"Checking if base has enough units to send the defence.");
                        bool canSend = await DoesBaseHaveEnoughUnitsToSendAttack(req.OriginNexus, req.UnitList, true, null, null);
                        if (canSend)
                        {
                            Console.WriteLine("Sending the defence...");
                            await SendDefence(req.OriginNexus, req.DestinationNexus, req.UnitList, req.DistanceTimeInSeconds, conn, transaction);
                        }
                        else
                        {
                            Console.WriteLine("Not enough units.");
                            return BadRequest("Not enough units.");
                        }
                        await transaction.CommitAsync();
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("ERROR: " + ex.Message);
                        await transaction.RollbackAsync();
                    }
                }
            }


            //first check if units being sent are valid


            return Ok($"Defence sent to {"{" + req.DestinationNexus.CoordsX + "," + req.DestinationNexus.CoordsY + "}"}");
        }


        [HttpPost("/Nexus/ReturnDefence", Name = "ReturnDefence")]
        public async Task<IActionResult> ReturnDefence([FromBody] NexusReturnDefenceRequest req)
        {
            Console.WriteLine($"POST /Nexus/ReturnDefence for player ({req.User.Id}, DefenceId: {req.DefenceId})");
           if (req.DefenceId == 0)
            {
                return BadRequest("Invalid Defence Id");
            }

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await conn.OpenAsync();

                using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
                {
                    try
                    {

                        //Console.WriteLine("SendDefence...");
                       

                        string sql = @"
                        UPDATE
                            maxhanna.nexus_defences_sent 
                        SET  
                            destination_coords_x = origin_coords_x, 
                            destination_coords_y = origin_coords_y, 
                            destination_user_id = origin_user_id, 
                            timestamp = CURRENT_TIMESTAMP(), 
                            arrived = 0
                        WHERE id = @DefenceId";

                        var parameters = new Dictionary<string, object?>
                        {
                            { "@DefenceId", req.DefenceId }, 
                        };

                        var insertedId = await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);

                        await transaction.CommitAsync();
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("ERROR: " + ex.Message);
                        await transaction.RollbackAsync();
                    }
                }
            }


            //first check if units being sent are valid


            return Ok($"Defence returned");
        }

        private async Task<List<Object>> GetBuildingUpgradeList(NexusBase? nexusBase, MySqlConnection connection, MySqlTransaction transaction)
        {
            var availableUpgrades = new List<Object>();

            if (nexusBase == null) return availableUpgrades;
            try
            {

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
                MySqlCommand cmdCurrentLevels = new MySqlCommand(sqlCurrentLevels, connection, transaction);
                cmdCurrentLevels.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                cmdCurrentLevels.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

                var readerCurrentLevels = await cmdCurrentLevels.ExecuteReaderAsync();
                if (!await readerCurrentLevels.ReadAsync())
                {
                    await readerCurrentLevels.CloseAsync();
                    return availableUpgrades;
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
                MySqlCommand cmdUpgradeTimestamps = new MySqlCommand(sqlUpgradeTimestamps, connection, transaction);
                cmdUpgradeTimestamps.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                cmdUpgradeTimestamps.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

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
                MySqlCommand cmdDurations = new MySqlCommand(sqlDurations, connection, transaction);
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
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"An error occurred while retrieving building upgrades for {nexusBase.CoordsX},{nexusBase.CoordsY}");
            }

            return availableUpgrades;
        }


        private async Task<List<Object>> GetAllBuildingUpgradeList(MySqlConnection connection, MySqlTransaction transaction)
        {
            var availableUpgrades = new List<Object>();

            try
            { 
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
                MySqlCommand cmdDurations = new MySqlCommand(sqlDurations, connection, transaction);
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

                var buildings = new List<string>
                {
                    "command_center",
                    "mines",
                    "supply_depot",
                    "warehouse",
                    "engineering_bay",
                    "factory",
                    "starport"
                };

                foreach (string buildingName in buildings)
                {
                    foreach(int buildingLevel in durations[buildingName].Keys)
                    {
                        int duration = durations[buildingName][buildingLevel];
                        int cost = costs[buildingName][buildingLevel];
                        availableUpgrades.Add(new
                        {
                            Building = buildingName,
                            NextLevel = buildingLevel,
                            Duration = duration,
                            Cost = cost
                        });
                    } 
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"An error occurred while retrieving building upgrades");
            }

            return availableUpgrades;
        }
        private async Task SendAttack(NexusBase OriginNexus, NexusBase DestinationNexus, User? from, User? to, UnitStats[] UnitList, int DistanceTimeInSeconds, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            //Console.WriteLine("SendAttack...");
            if (OriginNexus == null || DestinationNexus == null) return;

            int marinesSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "marine")?.SentValue ?? 0;
            int goliathSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "goliath")?.SentValue ?? 0;
            int siegeTankSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "siege_tank")?.SentValue ?? 0;
            int scoutSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "scout")?.SentValue ?? 0;
            int wraithSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "wraith")?.SentValue ?? 0;
            int battlecruiserSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "battlecruiser")?.SentValue ?? 0;
            int glitcherSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "glitcher")?.SentValue ?? 0;


            string sql = @"
                INSERT INTO 
                    maxhanna.nexus_attacks_sent 
                    (origin_coords_x, origin_coords_y, origin_user_id, destination_coords_x, destination_coords_y, destination_user_id, marine_total, goliath_total, siege_tank_total, scout_total, wraith_total, battlecruiser_total, glitcher_total, duration)
                VALUES
                    (@OriginX, @OriginY, @OriginUserId, @DestinationX, @DestinationY, @DestinationUserId, @Marine, @Goliath, @SiegeTank, @Scout, @Wraith, @Battlecruiser, @Glitcher, @Duration);";

            var parameters = new Dictionary<string, object?>
            {
                { "@OriginX", OriginNexus.CoordsX },
                { "@OriginY", OriginNexus.CoordsY },
                { "@OriginUserId", from?.Id },
                { "@DestinationX", DestinationNexus.CoordsX },
                { "@DestinationY", DestinationNexus.CoordsY },
                { "@DestinationUserId", to?.Id },
                { "@Duration", DistanceTimeInSeconds },
                { "@Marine", marinesSent },
                { "@Goliath", goliathSent },
                { "@SiegeTank", siegeTankSent },
                { "@Scout", scoutSent },
                { "@Wraith", wraithSent },
                { "@Battlecruiser", battlecruiserSent },
                { "@Glitcher", glitcherSent },
            };

            var insertedId = await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);


            //Console.WriteLine("Attack sent");
        }


        private async Task SendDefence(NexusBase OriginNexus, NexusBase DestinationNexus, UnitStats[] UnitList, int DistanceTimeInSeconds, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            //Console.WriteLine("SendDefence...");
            if (OriginNexus == null || DestinationNexus == null) return;

            int marinesSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "marine")?.SentValue ?? 0;
            int goliathSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "goliath")?.SentValue ?? 0;
            int siegeTankSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "siege_tank")?.SentValue ?? 0;
            int scoutSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "scout")?.SentValue ?? 0;
            int wraithSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "wraith")?.SentValue ?? 0;
            int battlecruiserSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "battlecruiser")?.SentValue ?? 0;
            int glitcherSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "glitcher")?.SentValue ?? 0;


            string sql = @"
                INSERT INTO 
                    maxhanna.nexus_defences_sent 
                    (origin_coords_x, origin_coords_y, origin_user_id, destination_coords_x, destination_coords_y, destination_user_id, marine_total, goliath_total, siege_tank_total, scout_total, wraith_total, battlecruiser_total, glitcher_total, duration)
                VALUES
                    (@OriginX, @OriginY, @OriginUserId, @DestinationX, @DestinationY, @DestinationUserId, @Marine, @Goliath, @SiegeTank, @Scout, @Wraith, @Battlecruiser, @Glitcher, @Duration);";

            var parameters = new Dictionary<string, object?>
            {
                { "@OriginX", OriginNexus.CoordsX },
                { "@OriginY", OriginNexus.CoordsY },
                { "@OriginUserId", OriginNexus.User?.Id },
                { "@DestinationX", DestinationNexus.CoordsX },
                { "@DestinationY", DestinationNexus.CoordsY },
                { "@DestinationUserId", DestinationNexus.User?.Id },
                { "@Duration", DistanceTimeInSeconds },
                { "@Marine", marinesSent },
                { "@Goliath", goliathSent },
                { "@SiegeTank", siegeTankSent },
                { "@Scout", scoutSent },
                { "@Wraith", wraithSent },
                { "@Battlecruiser", battlecruiserSent },
                { "@Glitcher", glitcherSent },
            };

            var insertedId = await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);


            //Console.WriteLine("Attack sent");
        }

        private async Task DeleteAttack(NexusBase OriginNexus, NexusBase DestinationNexus, DateTime timestamp, int DistanceTimeInSeconds, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            //Console.WriteLine($"Deleting NexusAttack from {OriginNexus.CoordsX},{OriginNexus.CoordsY} sent on {DestinationNexus.CoordsX},{DestinationNexus.CoordsY}; Timestamp: {timestamp}, DistanceInSeconds: {DistanceTimeInSeconds}");

            string sql = @"
                DELETE FROM
                    maxhanna.nexus_attacks_sent 
                WHERE 
                    origin_coords_x = @OriginX
                AND origin_coords_y = @OriginY
                AND destination_coords_x = @DestinationX
                AND destination_coords_y = @DestinationY
                AND timestamp = @Timestamp
                AND duration = @Duration
                LIMIT 1;";

            var parameters = new Dictionary<string, object?>
            {
                { "@OriginX", OriginNexus.CoordsX },
                { "@OriginY", OriginNexus.CoordsY },
                { "@DestinationX", DestinationNexus.CoordsX },
                { "@DestinationY", DestinationNexus.CoordsY },
                { "@Duration", DistanceTimeInSeconds },
                { "@Timestamp", timestamp },
            };

            await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
            //Console.WriteLine("NexusAttack deleted");
        }

        private async Task DeleteDefence(NexusBase OriginNexus, NexusBase DestinationNexus, DateTime timestamp, int DistanceTimeInSeconds, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            //Console.WriteLine($"Deleting NexusAttack from {OriginNexus.CoordsX},{OriginNexus.CoordsY} sent on {DestinationNexus.CoordsX},{DestinationNexus.CoordsY}; Timestamp: {timestamp}, DistanceInSeconds: {DistanceTimeInSeconds}");

            string sql = @"
                DELETE FROM
                    maxhanna.nexus_defences_sent 
                WHERE 
                    origin_coords_x = @OriginX
                AND origin_coords_y = @OriginY
                AND destination_coords_x = @DestinationX
                AND destination_coords_y = @DestinationY
                AND timestamp = @Timestamp
                AND duration = @Duration
                LIMIT 1;";

            var parameters = new Dictionary<string, object?>
            {
                { "@OriginX", OriginNexus.CoordsX },
                { "@OriginY", OriginNexus.CoordsY },
                { "@DestinationX", DestinationNexus.CoordsX },
                { "@DestinationY", DestinationNexus.CoordsY },
                { "@Duration", DistanceTimeInSeconds },
                { "@Timestamp", timestamp },
            };

            await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
            //Console.WriteLine("NexusAttack deleted");
        }


        private async Task DefenceArrived(NexusBase OriginNexus, NexusBase DestinationNexus, DateTime timestamp, int DistanceTimeInSeconds, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            //Console.WriteLine($"Deleting NexusAttack from {OriginNexus.CoordsX},{OriginNexus.CoordsY} sent on {DestinationNexus.CoordsX},{DestinationNexus.CoordsY}; Timestamp: {timestamp}, DistanceInSeconds: {DistanceTimeInSeconds}");

            string sql = @"
                UPDATE
                    maxhanna.nexus_defences_sent 
                SET arrived = 1 
                WHERE 
                    origin_coords_x = @OriginX
                AND origin_coords_y = @OriginY
                AND destination_coords_x = @DestinationX
                AND destination_coords_y = @DestinationY
                AND timestamp = @Timestamp
                AND duration = @Duration
                LIMIT 1;";

            var parameters = new Dictionary<string, object?>
            {
                { "@OriginX", OriginNexus.CoordsX },
                { "@OriginY", OriginNexus.CoordsY },
                { "@DestinationX", DestinationNexus.CoordsX },
                { "@DestinationY", DestinationNexus.CoordsY },
                { "@Duration", DistanceTimeInSeconds },
                { "@Timestamp", timestamp },
            };

            await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
            //Console.WriteLine("NexusAttack deleted");
        }
        private async Task<List<NexusAttackSent>?> GetNexusAttacksSent(NexusBase? nexusBase, bool onlyCurrentBase, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            //Console.WriteLine($"Get nexus attacks sent. onlyCurrentBase: {onlyCurrentBase}");
            List<NexusAttackSent>? attacks = null;
            if (nexusBase == null) return attacks;

            bool passedInConn = conn != null;

            try
            {
                if (!passedInConn)
                {
                    conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                    await conn.OpenAsync();
                }

                string sql = "";
                if (onlyCurrentBase)
                {
                    sql = "SELECT * FROM maxhanna.nexus_attacks_sent WHERE origin_coords_x = @OriginX AND origin_coords_y = @OriginY;";
                }
                else
                {
                    sql = @"
                        SELECT * FROM maxhanna.nexus_attacks_sent a 
                        WHERE origin_user_id = @UserId;";
                }
                using (MySqlCommand sqlCmd = new MySqlCommand(sql, conn))
                {
                    if (transaction != null)
                    {
                        sqlCmd.Transaction = transaction;
                    }
                    if (onlyCurrentBase)
                    {
                        sqlCmd.Parameters.AddWithValue("@OriginX", nexusBase.CoordsX);
                        sqlCmd.Parameters.AddWithValue("@OriginY", nexusBase.CoordsY);
                    }
                    else
                    {
                        sqlCmd.Parameters.AddWithValue("@UserId", nexusBase.User?.Id ?? 0);
                    }
                    //Console.WriteLine("attack sent sql : " + sqlCmd.CommandText);
                    using (var reader = await sqlCmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            if (attacks == null)
                            {
                                attacks = new List<NexusAttackSent>();
                            }

                            attacks.Add(new NexusAttackSent
                            {
                                Id = reader.GetInt32(reader.GetOrdinal("id")),
                                OriginCoordsX = reader.GetInt32(reader.GetOrdinal("origin_coords_x")),
                                OriginCoordsY = reader.GetInt32(reader.GetOrdinal("origin_coords_y")),
                                OriginUserId = reader.IsDBNull(reader.GetOrdinal("origin_user_id")) ? null : reader.GetInt32("origin_user_id"),
                                DestinationCoordsX = reader.GetInt32(reader.GetOrdinal("destination_coords_x")),
                                DestinationCoordsY = reader.GetInt32(reader.GetOrdinal("destination_coords_y")),
                                DestinationUserId = reader.IsDBNull(reader.GetOrdinal("destination_user_id")) ? null : reader.GetInt32("destination_user_id"),
                                MarineTotal = reader.IsDBNull(reader.GetOrdinal("marine_total")) ? null : reader.GetInt32("marine_total"),
                                GoliathTotal = reader.IsDBNull(reader.GetOrdinal("goliath_total")) ? null : reader.GetInt32("goliath_total"),
                                SiegeTankTotal = reader.IsDBNull(reader.GetOrdinal("siege_tank_total")) ? null : reader.GetInt32("siege_tank_total"),
                                ScoutTotal = reader.IsDBNull(reader.GetOrdinal("scout_total")) ? null : reader.GetInt32("scout_total"),
                                WraithTotal = reader.IsDBNull(reader.GetOrdinal("wraith_total")) ? null : reader.GetInt32("wraith_total"),
                                BattlecruiserTotal = reader.IsDBNull(reader.GetOrdinal("battlecruiser_total")) ? null : reader.GetInt32("battlecruiser_total"),
                                GlitcherTotal = reader.IsDBNull(reader.GetOrdinal("glitcher_total")) ? null : reader.GetInt32("glitcher_total"),
                                Duration = reader.IsDBNull(reader.GetOrdinal("duration")) ? 0 : reader.GetInt32("duration"),
                                Timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp")) ? DateTime.Now : reader.GetDateTime("timestamp"),
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while GetNexusAttacksSent");
            }
            finally
            {
                if (!passedInConn && conn != null)
                {
                    await conn.CloseAsync();
                }
            }

            return attacks;
        }

        private async Task<List<NexusAttackSent>?> GetNexusDefencesSent(NexusBase? nexusBase, bool onlyCurrentBase, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            //Console.WriteLine($"Get nexus defences sent. onlyCurrentBase: {onlyCurrentBase}");
            List<NexusAttackSent>? attacks = null;
            if (nexusBase == null) return attacks;

            bool passedInConn = conn != null;

            try
            {
                if (!passedInConn)
                {
                    conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                    await conn.OpenAsync();
                }

                string sql = "";
                if (onlyCurrentBase)
                {
                    sql = "SELECT * FROM maxhanna.nexus_defences_sent WHERE origin_coords_x = @OriginX AND origin_coords_y = @OriginY;";
                }
                else
                {
                    sql = @"
                        SELECT * FROM maxhanna.nexus_defences_sent WHERE origin_user_id = @UserId;";
                }
                using (MySqlCommand sqlCmd = new MySqlCommand(sql, conn))
                {
                    if (transaction != null)
                    {
                        sqlCmd.Transaction = transaction;
                    }
                    if (onlyCurrentBase)
                    {
                        sqlCmd.Parameters.AddWithValue("@OriginX", nexusBase.CoordsX);
                        sqlCmd.Parameters.AddWithValue("@OriginY", nexusBase.CoordsY);
                    }
                    else
                    {
                        sqlCmd.Parameters.AddWithValue("@UserId", nexusBase.User?.Id ?? 0);
                    }
                    //Console.WriteLine("attack sent sql : " + sqlCmd.CommandText);
                    using (var reader = await sqlCmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            if (attacks == null)
                            {
                                attacks = new List<NexusAttackSent>();
                            }

                            attacks.Add(new NexusAttackSent
                            {
                                Id = reader.GetInt32(reader.GetOrdinal("id")),
                                OriginCoordsX = reader.GetInt32(reader.GetOrdinal("origin_coords_x")),
                                OriginCoordsY = reader.GetInt32(reader.GetOrdinal("origin_coords_y")),
                                OriginUserId = reader.IsDBNull(reader.GetOrdinal("origin_user_id")) ? null : reader.GetInt32("origin_user_id"),
                                DestinationCoordsX = reader.GetInt32(reader.GetOrdinal("destination_coords_x")),
                                DestinationCoordsY = reader.GetInt32(reader.GetOrdinal("destination_coords_y")),
                                DestinationUserId = reader.IsDBNull(reader.GetOrdinal("destination_user_id")) ? null : reader.GetInt32("destination_user_id"),
                                MarineTotal = reader.IsDBNull(reader.GetOrdinal("marine_total")) ? null : reader.GetInt32("marine_total"),
                                GoliathTotal = reader.IsDBNull(reader.GetOrdinal("goliath_total")) ? null : reader.GetInt32("goliath_total"),
                                SiegeTankTotal = reader.IsDBNull(reader.GetOrdinal("siege_tank_total")) ? null : reader.GetInt32("siege_tank_total"),
                                ScoutTotal = reader.IsDBNull(reader.GetOrdinal("scout_total")) ? null : reader.GetInt32("scout_total"),
                                WraithTotal = reader.IsDBNull(reader.GetOrdinal("wraith_total")) ? null : reader.GetInt32("wraith_total"),
                                BattlecruiserTotal = reader.IsDBNull(reader.GetOrdinal("battlecruiser_total")) ? null : reader.GetInt32("battlecruiser_total"),
                                GlitcherTotal = reader.IsDBNull(reader.GetOrdinal("glitcher_total")) ? null : reader.GetInt32("glitcher_total"),
                                Duration = reader.IsDBNull(reader.GetOrdinal("duration")) ? 0 : reader.GetInt32("duration"),
                                Timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp")) ? DateTime.Now : reader.GetDateTime("timestamp"),
                                Arrived = reader.IsDBNull(reader.GetOrdinal("arrived")) ? false : reader.GetBoolean("arrived"),
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while GetNexusDefencesSent");
            }
            finally
            {
                if (!passedInConn && conn != null)
                {
                    await conn.CloseAsync();
                }
            }

            return attacks;
        }
        private async Task<List<NexusAttackSent>?> GetNexusAttacksIncoming(NexusBase? nexusBase, bool onlyCurrentBase, bool withUnits, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
        {
            List<NexusAttackSent>? attacks = null;
            if (nexusBase == null) return attacks;

            Console.WriteLine($"GetNexusAttacksIncoming {nexusBase.CoordsX}, {nexusBase.CoordsY}");

            bool passedInConn = conn != null;

            try
            {
                if (!passedInConn)
                {
                    conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                    await conn.OpenAsync();
                }

                string sql = "";
                if (onlyCurrentBase)
                {
                    sql = "SELECT * FROM maxhanna.nexus_attacks_sent WHERE destination_coords_x = @DestX AND destination_coords_y = @DestY;";
                }
                else
                {
                    sql = @"SELECT *  
                        FROM maxhanna.nexus_attacks_sent a 
                        WHERE destination_user_id = @UserId"; 
                }
                using (MySqlCommand sqlCmd = new MySqlCommand(sql, conn))
                {
                    if (transaction != null)
                    {
                        sqlCmd.Transaction = transaction;
                    }

                    if (onlyCurrentBase)
                    {
                        sqlCmd.Parameters.AddWithValue("@DestX", nexusBase.CoordsX);
                        sqlCmd.Parameters.AddWithValue("@DestY", nexusBase.CoordsY);
                    }
                    else
                    {
                        sqlCmd.Parameters.AddWithValue("@UserId", nexusBase.User?.Id ?? 0);
                    }

                    //Console.WriteLine("attacks received sql " + sqlCmd.CommandText);

                    using (var reader = await sqlCmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            if (attacks == null)
                            {
                                attacks = new List<NexusAttackSent>();
                            }

                            var attack = new NexusAttackSent
                            {
                                Id = reader.GetInt32(reader.GetOrdinal("id")),
                                OriginCoordsX = reader.GetInt32(reader.GetOrdinal("origin_coords_x")),
                                OriginCoordsY = reader.GetInt32(reader.GetOrdinal("origin_coords_y")),
                                OriginUserId = reader.IsDBNull(reader.GetOrdinal("origin_user_id")) ? null : reader.GetInt32("origin_user_id"),
                                DestinationCoordsX = reader.GetInt32(reader.GetOrdinal("destination_coords_x")),
                                DestinationCoordsY = reader.GetInt32(reader.GetOrdinal("destination_coords_y")),
                                DestinationUserId = reader.IsDBNull(reader.GetOrdinal("destination_user_id")) ? null : reader.GetInt32("destination_user_id"),
                                Duration = reader.IsDBNull(reader.GetOrdinal("duration")) ? 0 : reader.GetInt32("duration"),
                                Timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp")) ? DateTime.Now : reader.GetDateTime("timestamp"),
                            };

                            if (withUnits)
                            {
                                attack.MarineTotal = reader.IsDBNull(reader.GetOrdinal("marine_total")) ? null : reader.GetInt32("marine_total");
                                attack.GoliathTotal = reader.IsDBNull(reader.GetOrdinal("goliath_total")) ? null : reader.GetInt32("goliath_total");
                                attack.SiegeTankTotal = reader.IsDBNull(reader.GetOrdinal("siege_tank_total")) ? null : reader.GetInt32("siege_tank_total");
                                attack.ScoutTotal = reader.IsDBNull(reader.GetOrdinal("scout_total")) ? null : reader.GetInt32("scout_total");
                                attack.WraithTotal = reader.IsDBNull(reader.GetOrdinal("wraith_total")) ? null : reader.GetInt32("wraith_total");
                                attack.BattlecruiserTotal = reader.IsDBNull(reader.GetOrdinal("battlecruiser_total")) ? null : reader.GetInt32("battlecruiser_total");
                                attack.GlitcherTotal = reader.IsDBNull(reader.GetOrdinal("glitcher_total")) ? null : reader.GetInt32("glitcher_total");
                            }

                            attacks.Add(attack);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while GetNexusAttacksIncoming");
            }
            finally
            {
                if (!passedInConn && conn != null)
                {
                    await conn.CloseAsync();
                }
            }

            return attacks;
        }


        private async Task<List<NexusAttackSent>?> GetNexusDefencesIncoming(NexusBase? nexusBase, bool onlyCurrentBase, bool withUnits, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
        {
            List<NexusAttackSent>? attacks = null;
            if (nexusBase == null) return attacks;

            Console.WriteLine($"GetNexusDefencesIncoming {nexusBase.CoordsX}, {nexusBase.CoordsY}");

            bool passedInConn = conn != null;

            try
            {
                if (!passedInConn)
                {
                    conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                    await conn.OpenAsync();
                }

                string sql = "";
                if (onlyCurrentBase)
                {
                    sql = "SELECT * FROM maxhanna.nexus_defences_sent WHERE destination_coords_x = @DestX AND destination_coords_y = @DestY;";
                }
                else
                {
                    sql = @"SELECT *
                        FROM maxhanna.nexus_defences_sent  
                        WHERE destination_user_id = @UserId";

                }
                using (MySqlCommand sqlCmd = new MySqlCommand(sql, conn))
                {
                    if (transaction != null)
                    {
                        sqlCmd.Transaction = transaction;
                    }

                    if (onlyCurrentBase)
                    {
                        sqlCmd.Parameters.AddWithValue("@DestX", nexusBase.CoordsX);
                        sqlCmd.Parameters.AddWithValue("@DestY", nexusBase.CoordsY);
                    }
                    else
                    {
                        sqlCmd.Parameters.AddWithValue("@UserId", nexusBase.User?.Id ?? 0);
                    }

                    //Console.WriteLine("attacks received sql " + sqlCmd.CommandText);

                    using (var reader = await sqlCmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            if (attacks == null)
                            {
                                attacks = new List<NexusAttackSent>();
                            }

                            var attack = new NexusAttackSent
                            {
                                Id = reader.GetInt32(reader.GetOrdinal("id")),
                                OriginCoordsX = reader.GetInt32(reader.GetOrdinal("origin_coords_x")),
                                OriginCoordsY = reader.GetInt32(reader.GetOrdinal("origin_coords_y")),
                                OriginUserId = reader.IsDBNull(reader.GetOrdinal("origin_user_id")) ? null : reader.GetInt32("origin_user_id"),
                                DestinationCoordsX = reader.GetInt32(reader.GetOrdinal("destination_coords_x")),
                                DestinationCoordsY = reader.GetInt32(reader.GetOrdinal("destination_coords_y")),
                                DestinationUserId = reader.IsDBNull(reader.GetOrdinal("destination_user_id")) ? null : reader.GetInt32("destination_user_id"), 
                                Duration = reader.IsDBNull(reader.GetOrdinal("duration")) ? 0 : reader.GetInt32("duration"),
                                Timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp")) ? DateTime.Now : reader.GetDateTime("timestamp"),
                                Arrived = reader.IsDBNull(reader.GetOrdinal("arrived")) ? false : reader.GetBoolean("arrived"), 
                            };

                            if (withUnits)
                            {
                                attack.MarineTotal = reader.IsDBNull(reader.GetOrdinal("marine_total")) ? null : reader.GetInt32("marine_total");
                                attack.GoliathTotal = reader.IsDBNull(reader.GetOrdinal("goliath_total")) ? null : reader.GetInt32("goliath_total");
                                attack.SiegeTankTotal = reader.IsDBNull(reader.GetOrdinal("siege_tank_total")) ? null : reader.GetInt32("siege_tank_total");
                                attack.ScoutTotal = reader.IsDBNull(reader.GetOrdinal("scout_total")) ? null : reader.GetInt32("scout_total");
                                attack.WraithTotal = reader.IsDBNull(reader.GetOrdinal("wraith_total")) ? null : reader.GetInt32("wraith_total");
                                attack.BattlecruiserTotal = reader.IsDBNull(reader.GetOrdinal("battlecruiser_total")) ? null : reader.GetInt32("battlecruiser_total");
                                attack.GlitcherTotal = reader.IsDBNull(reader.GetOrdinal("glitcher_total")) ? null : reader.GetInt32("glitcher_total");
                            }

                            attacks.Add(attack);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while GetNexusDefencesIncoming");
            }
            finally
            {
                if (!passedInConn && conn != null)
                {
                    await conn.CloseAsync();
                }
            }

            return attacks;
        }


        private async Task UpdateNexusUnits(NexusBase nexusBase, int marinesTotal, int goliathTotal, int siegeTankTotal, int scoutTotal, int wraithTotal, int battlecruiserTotal, int glitcherTotal, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            //Console.WriteLine("UpdateNexusUnits...");

            string sql = @"
                UPDATE maxhanna.nexus_units 
                SET 
                    marine_total = @Marine, 
                    goliath_total = @Goliath, 
                    siege_tank_total = @SiegeTank, 
                    scout_total = @Scout, 
                    wraith_total = @Wraith, 
                    battlecruiser_total = @Battlecruiser,
                    glitcher_total = @Glitcher
                WHERE 
                    coords_x = @CoordsX 
                AND coords_y = @CoordsY;";

            var parameters = new Dictionary<string, object?>
            {
                { "@CoordsX", nexusBase.CoordsX },
                { "@CoordsY", nexusBase.CoordsY },
                { "@Marine", Math.Max(0, marinesTotal) },
                { "@Goliath", Math.Max(0, goliathTotal) },
                { "@SiegeTank", Math.Max(0, siegeTankTotal) },
                { "@Scout", Math.Max(0, scoutTotal) },
                { "@Wraith", Math.Max(0, wraithTotal) },
                { "@Battlecruiser", Math.Max(0, battlecruiserTotal) },
                { "@Glitcher", Math.Max(0, glitcherTotal) }
            };

            await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
            //Console.WriteLine($"Updated Nexus Units!");

        }
        private async Task UpdateNexusSupply(NexusBase nexusBase, int? supply, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            //Console.WriteLine("UpdateNexusSupply...");

            if (supply != null)
            {
                string sql = @"UPDATE maxhanna.nexus_bases SET supply = @Supply WHERE coords_x = @CoordsX AND coords_y = @CoordsY LIMIT 1;";

                var parameters = new Dictionary<string, object?>
                {
                    { "@CoordsX", nexusBase.CoordsX },
                    { "@CoordsY", nexusBase.CoordsY },
                    { "@Supply", Math.Max(0, (int)supply) }
                };

                await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
                //Console.WriteLine("Nexus Supply updated.");
            }
            else
            {
                Console.WriteLine("Supply passed was null... skipping!");
            }
            return;
        }


        private async Task<bool> DoesBaseHaveEnoughUnitsToSendAttack(NexusBase originNexus, UnitStats[]? unitsSent, bool skipAttackingUnits, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            NexusUnits? units = await GetNexusUnits(originNexus, true, conn, transaction);
            Console.WriteLine($"Got these units at base : m:{units?.MarineTotal} g:{units?.GoliathTotal} st:{units?.SiegeTankTotal} s:{units?.ScoutTotal} w:{units?.WraithTotal} b:{units?.BattlecruiserTotal} gl:{units?.GlitcherTotal}");
            if (units == null || units.MarineTotal < 0 || units.GoliathTotal < 0 || units.SiegeTankTotal < 0 || units.ScoutTotal < 0 || units.WraithTotal < 0 || units.BattlecruiserTotal < 0 || units.GlitcherTotal < 0)
            {
                Console.WriteLine($"Units sent less than zero!"); 
                return false;
            }
            CalculateUnitsAvailableAfterSendingUnits(units, unitsSent, out int marinesTotal, out int goliathTotal, out int siegeTankTotal,
                out int scoutTotal, out int wraithTotal, out int battlecruiserTotal, out int glitcherTotal);
            Console.WriteLine($"Got these units after sending units : m:{marinesTotal} g:{goliathTotal} st:{siegeTankTotal} s:{scoutTotal} w:{wraithTotal} b:{battlecruiserTotal} gl:{glitcherTotal}");
            if (units == null || marinesTotal < 0 || goliathTotal < 0 || siegeTankTotal < 0 || scoutTotal < 0 || wraithTotal < 0 || battlecruiserTotal  < 0 || glitcherTotal < 0)
            {
                Console.WriteLine($"Units sent less than zero!");
                return false;
            }

            return (marinesTotal >= 0 && goliathTotal >= 0 && siegeTankTotal >= 0 && scoutTotal >= 0 && wraithTotal >= 0 && battlecruiserTotal >= 0 && glitcherTotal >= 0);

        }

        private static void CalculateUnitsAvailableAfterSendingUnits(NexusUnits? playerUnits, UnitStats[]? unitsSent,
            out int marinesTotal, out int goliathTotal, out int siegeTankTotal, out int scoutTotal, out int wraithTotal, out int battlecruiserTotal, out int glitcherTotal)
        {
            marinesTotal = (playerUnits?.MarineTotal ?? 0);
            goliathTotal = (playerUnits?.GoliathTotal ?? 0);
            siegeTankTotal = (playerUnits?.SiegeTankTotal ?? 0);
            scoutTotal = (playerUnits?.ScoutTotal ?? 0);
            wraithTotal = (playerUnits?.WraithTotal ?? 0);
            battlecruiserTotal = (playerUnits?.BattlecruiserTotal ?? 0);
            glitcherTotal = (playerUnits?.GlitcherTotal ?? 0);
            if (playerUnits == null)
            {
                Console.WriteLine("No player units, returning");
                return;
            };

            if (unitsSent != null)
            {
                //for (var x = 0; x < unitsSent.Length; x++)
                //{
                //    Console.WriteLine(unitsSent[x].SentValue + " " + unitsSent[x].UnitType);
                //}
                marinesTotal -= (unitsSent?.First(x => x.UnitType == "marine").SentValue ?? 0);
                goliathTotal -= (unitsSent?.First(x => x.UnitType == "goliath").SentValue ?? 0);
                siegeTankTotal -= (unitsSent?.First(x => x.UnitType == "siege_tank").SentValue ?? 0);
                scoutTotal -= (unitsSent?.First(x => x.UnitType == "scout").SentValue ?? 0);
                wraithTotal -= (unitsSent?.First(x => x.UnitType == "wraith").SentValue ?? 0);
                battlecruiserTotal -= (unitsSent?.First(x => x.UnitType == "battlecruiser").SentValue ?? 0);
                glitcherTotal -= (unitsSent?.First(x => x.UnitType == "glitcher").SentValue ?? 0);
            }

        }

        private static bool DoesBaseContainUnits(NexusUnits playerUnits)
        {
            return !(playerUnits.MarineTotal == 0 && playerUnits.GoliathTotal == 0 && playerUnits.SiegeTankTotal == 0
                && playerUnits.ScoutTotal == 0 && playerUnits.WraithTotal == 0 && playerUnits.BattlecruiserTotal == 0 && playerUnits.GlitcherTotal == 0);
        }

        private async Task<List<UnitStats>> GetUnitStatsFromDB(int? unitId, string? unitType, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
        {
            List<UnitStats> unitStats = new List<UnitStats>();
            bool createdConnection = false;

            try
            {
                if (conn == null)
                {
                    conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                    await conn.OpenAsync();
                    createdConnection = true;
                }

                string sql = $@"
                    SELECT 
                        nut.id as unit_id, 
                        nut.type as unit_type, 
                        n.unit_level, 
                        n.duration, 
                        n.cost,
                        n.supply,
                        n.speed,
                        n.gold_carrying_capacity,
                        n.ground_damage,
                        n.air_damage,
                        n.building_damage,
                        n.starport_level,
                        n.factory_level,
                        n.engineering_bay_level
                    FROM 
                        maxhanna.nexus_unit_stats n
                    LEFT JOIN
                        maxhanna.nexus_unit_types nut ON nut.id = n.unit_id
                    WHERE 1=1
                    {(unitId != null ? " AND nut.id = @UnitId" : "")}
                    {(unitType != null ? " AND nut.type = @UnitType" : "")};";

                using (MySqlCommand cmd = new MySqlCommand(sql, conn, transaction))
                {
                    if (unitId != null)
                    {
                        cmd.Parameters.AddWithValue("@UnitId", unitId);
                    }
                    if (unitType != null)
                    {
                        cmd.Parameters.AddWithValue("@UnitType", unitType);
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
                                Speed = reader.GetDecimal(reader.GetOrdinal("speed")),
                                Supply = reader.GetInt32(reader.GetOrdinal("supply")),
                                GoldCarryingCapacity = reader.GetInt32(reader.GetOrdinal("gold_carrying_capacity")),
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
                if (createdConnection && conn != null)
                {
                    await conn.CloseAsync();
                }
            }

            return unitStats;
        }



        private async Task<List<UnitUpgradeStats>> GetUnitUpgradeStatsFromDB(MySqlConnection? conn = null, MySqlTransaction? transaction = null)
        {
            List<UnitUpgradeStats> upgradeStats = new List<UnitUpgradeStats>();
            bool createdConnection = false;

            try
            {
                if (conn == null)
                {
                    conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                    await conn.OpenAsync();
                    createdConnection = true;
                }

                string sql = $@"
                    SELECT 
                        unit_level, 
                        damage_multiplier, 
                        duration
                    FROM 
                        maxhanna.nexus_unit_upgrade_stats
                    WHERE 1=1;";
                using (MySqlCommand cmd = new MySqlCommand(sql, conn, transaction))
                {

                    using (var reader = await cmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            var upgradeStat = new UnitUpgradeStats
                            {
                                UnitLevel = reader.GetInt32(reader.GetOrdinal("unit_level")),
                                DamageMultiplier = reader.GetDecimal(reader.GetOrdinal("damage_multiplier")),
                                Duration = reader.GetInt32(reader.GetOrdinal("duration"))
                            };
                            upgradeStats.Add(upgradeStat);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"An error occurred while GetUpgradeUnitStatsFromDB");
            }
            finally
            {
                if (createdConnection && conn != null)
                {
                    await conn.CloseAsync();
                }
            }

            return upgradeStats;
        }

        private async Task<NexusBase?> GetNexusBase(int? coordsX, int? coordsY, MySqlConnection? connection = null, MySqlTransaction? transaction = null)
        {
            NexusBase? nexusBase = null;

            if (coordsX == null || coordsY == null) return nexusBase;

            bool shouldCloseConnection = false;
            MySqlConnection? conn = connection;

            try
            {
                if (conn == null)
                {
                    conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                    await conn.OpenAsync();
                    shouldCloseConnection = true;
                }

                string sqlBase = "SELECT * FROM nexus_bases WHERE coords_x = @CoordsX AND coords_y = @CoordsY";
                MySqlCommand cmdBase = new MySqlCommand(sqlBase, conn, transaction);
                cmdBase.Parameters.AddWithValue("@CoordsX", coordsX);
                cmdBase.Parameters.AddWithValue("@CoordsY", coordsY);

                using (var readerBase = await cmdBase.ExecuteReaderAsync())
                {
                    if (await readerBase.ReadAsync())
                    {
                        nexusBase = new NexusBase
                        {
                            User = new User(readerBase.IsDBNull(readerBase.GetOrdinal("user_id")) ? 0 : readerBase.GetInt32("user_id"), "Anonymous"),
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
                            MarineLevel = readerBase.IsDBNull(readerBase.GetOrdinal("marine_level")) ? 0 : readerBase.GetInt32("marine_level"),
                            GoliathLevel = readerBase.IsDBNull(readerBase.GetOrdinal("goliath_level")) ? 0 : readerBase.GetInt32("goliath_level"),
                            SiegeTankLevel = readerBase.IsDBNull(readerBase.GetOrdinal("siege_tank_level")) ? 0 : readerBase.GetInt32("siege_tank_level"),
                            ScoutLevel = readerBase.IsDBNull(readerBase.GetOrdinal("scout_level")) ? 0 : readerBase.GetInt32("scout_level"),
                            WraithLevel = readerBase.IsDBNull(readerBase.GetOrdinal("wraith_level")) ? 0 : readerBase.GetInt32("wraith_level"),
                            BattlecruiserLevel = readerBase.IsDBNull(readerBase.GetOrdinal("battlecruiser_level")) ? 0 : readerBase.GetInt32("battlecruiser_level"),
                            GlitcherLevel = readerBase.IsDBNull(readerBase.GetOrdinal("glitcher_level")) ? 0 : readerBase.GetInt32("glitcher_level"),
                            Conquered = readerBase.IsDBNull(readerBase.GetOrdinal("conquered")) ? DateTime.MinValue : readerBase.GetDateTime("conquered"),
                            Updated = readerBase.IsDBNull(readerBase.GetOrdinal("updated")) ? DateTime.MinValue : readerBase.GetDateTime("updated"),
                        };
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while GetNexusBase");
            }
            finally
            {
                if (shouldCloseConnection && conn != null)
                {
                    await conn.CloseAsync();
                }
            }

            return nexusBase;
        }



        private async Task<NexusBaseUpgrades?> GetNexusBaseUpgrades(NexusBase? nexusBase, MySqlConnection connection, MySqlTransaction transaction)
        {
            NexusBaseUpgrades? nexusBaseUpgrades = null;
            if (nexusBase == null) { return nexusBaseUpgrades; }
            {
                try
                {
                    string sqlUpgrades = @"
                            SELECT * 
                            FROM nexus_base_upgrades 
                            WHERE 
                                coords_x = @CoordsX 
                            AND coords_y = @CoordsY";
                    MySqlCommand cmdUpgrades = new MySqlCommand(sqlUpgrades, connection, transaction);
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
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"An error occurred while GetNexusBaseUpgrades");
                }
            }

            return nexusBaseUpgrades;
        }
        private async Task<NexusUnits?> GetNexusUnits(NexusBase? nexusBase, bool currentlyInBase, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            bool passedInConn = conn != null;
            NexusUnits? nexusUnits = null;
            if (nexusBase == null) return nexusUnits;

            if (!passedInConn)
            {
                conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            }

            try
            {
                if (!passedInConn)
                {
                    await conn.OpenAsync();
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
                            ScoutTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("scout_total")) ? null : readerUnits.GetInt32("scout_total"),
                            WraithTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("wraith_total")) ? null : readerUnits.GetInt32("wraith_total"),
                            BattlecruiserTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("battlecruiser_total")) ? null : readerUnits.GetInt32("battlecruiser_total"),
                            GlitcherTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("glitcher_total")) ? null : readerUnits.GetInt32("glitcher_total")
                        };
                    }
                }
                if (currentlyInBase && nexusUnits != null)
                {
                    List<NexusAttackSent>? nexusAttacksSent = await GetNexusAttacksSent(nexusBase, true, conn, transaction);
                    List<NexusAttackSent>? nexusDefencesSent = await GetNexusDefencesSent(nexusBase, true, conn, transaction);
                    if (nexusDefencesSent != null)
                    {
                        if (nexusAttacksSent == null)
                        {
                            nexusAttacksSent = new List<NexusAttackSent>();
                        }
                        nexusAttacksSent = nexusAttacksSent.Concat(nexusDefencesSent).ToList(); 
                    }
                    List<UnitStats> unitsSent = await GetUnitStatsFromDB(null, null, conn, transaction);
                    unitsSent = AggregateUnitsSentIntoUnitStats(nexusAttacksSent, unitsSent);

                    CalculateUnitsAvailableAfterSendingUnits(nexusUnits, unitsSent.ToArray(), out int marinesTotal, out int goliathTotal,
                        out int siegeTankTotal, out int scoutTotal, out int wraithTotal, out int battlecruiserTotal, out int glitcherTotal);
                    nexusUnits = new NexusUnits
                    {
                        CoordsX = nexusUnits.CoordsX,
                        CoordsY = nexusUnits.CoordsY,
                        MarineTotal = marinesTotal,
                        GoliathTotal = goliathTotal,
                        SiegeTankTotal = siegeTankTotal,
                        ScoutTotal = scoutTotal,
                        WraithTotal = wraithTotal,
                        BattlecruiserTotal = battlecruiserTotal,
                        GlitcherTotal = glitcherTotal
                    };
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while GetNexusUnits");
            }
            finally
            {
                if (!passedInConn && conn != null)
                {
                    await conn.CloseAsync();
                }
            }

            return nexusUnits;
        }
        private List<UnitStats> AggregateUnitsSentIntoUnitStats(List<NexusAttackSent>? nexusAttackSents, List<UnitStats> unitsSent)
        {
            unitsSent.ForEach(x => x.SentValue = 0);
            if (nexusAttackSents == null) return unitsSent;

            foreach (var attack in nexusAttackSents)
            {
                if (attack.MarineTotal.HasValue)
                {
                    var marineStats = unitsSent.FirstOrDefault(x => x.UnitType == "marine");
                    if (marineStats != null) marineStats.SentValue += attack.MarineTotal.Value;
                }
                if (attack.GoliathTotal.HasValue)
                {
                    var goliathStats = unitsSent.FirstOrDefault(x => x.UnitType == "goliath");
                    if (goliathStats != null) goliathStats.SentValue += attack.GoliathTotal.Value;
                }
                if (attack.SiegeTankTotal.HasValue)
                {
                    var siegeTankStats = unitsSent.FirstOrDefault(x => x.UnitType == "siege_tank");
                    if (siegeTankStats != null) siegeTankStats.SentValue += attack.SiegeTankTotal.Value;
                }
                if (attack.ScoutTotal.HasValue)
                {
                    var scoutStats = unitsSent.FirstOrDefault(x => x.UnitType == "scout");
                    if (scoutStats != null) scoutStats.SentValue += attack.ScoutTotal.Value;
                }
                if (attack.WraithTotal.HasValue)
                {
                    var wraithStats = unitsSent.FirstOrDefault(x => x.UnitType == "wraith");
                    if (wraithStats != null) wraithStats.SentValue += attack.WraithTotal.Value;
                }
                if (attack.BattlecruiserTotal.HasValue)
                {
                    var battlecruiserStats = unitsSent.FirstOrDefault(x => x.UnitType == "battlecruiser");
                    if (battlecruiserStats != null) battlecruiserStats.SentValue += attack.BattlecruiserTotal.Value;
                }
                if (attack.GlitcherTotal.HasValue)
                {
                    var glitcherStats = unitsSent.FirstOrDefault(x => x.UnitType == "glitcher");
                    if (glitcherStats != null) glitcherStats.SentValue += attack.GlitcherTotal.Value;
                }
            }

            return unitsSent;
        }

        private async Task<NexusUnits?> GetNexusAttackingUnits(NexusBase? nexusBase, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            List<NexusAttackSent>? nexusAttacksSent = await GetNexusAttacksSent(nexusBase, true, conn, transaction);

            int marinesTotal = nexusAttacksSent?.Sum(x => x.MarineTotal) ?? 0;
            int goliathTotal = nexusAttacksSent?.Sum(x => x.GoliathTotal) ?? 0;
            int siegeTankTotal = nexusAttacksSent?.Sum(x => x.SiegeTankTotal) ?? 0;
            int scoutTotal = nexusAttacksSent?.Sum(x => x.ScoutTotal) ?? 0;
            int wraithTotal = nexusAttacksSent?.Sum(x => x.WraithTotal) ?? 0;
            int battlecruiserTotal = nexusAttacksSent?.Sum(x => x.BattlecruiserTotal) ?? 0;
            int glitcherTotal = nexusAttacksSent?.Sum(x => x.GlitcherTotal) ?? 0;
            return new NexusUnits
            {
                CoordsX = nexusBase.CoordsX,
                CoordsY = nexusBase.CoordsY,
                MarineTotal = marinesTotal,
                GoliathTotal = goliathTotal,
                SiegeTankTotal = siegeTankTotal,
                ScoutTotal = scoutTotal,
                WraithTotal = wraithTotal,
                BattlecruiserTotal = battlecruiserTotal,
                GlitcherTotal = glitcherTotal
            };
        }


        private async Task<List<NexusUnitsPurchased>?> GetNexusUnitPurchases(NexusBase? nexusBase, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
        {
            //Console.WriteLine("GetNexusUnitPurchases...");
            if (nexusBase == null)
            {
                return new List<NexusUnitsPurchased>();
            }

            var res = new List<NexusUnitsPurchased>();
            bool createdConnection = false;

            try
            {
                if (conn == null)
                {
                    conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                    await conn.OpenAsync();
                    createdConnection = true;
                }

                string sqlUnitPurchases = @"
                    SELECT * 
                    FROM nexus_unit_purchases 
                    WHERE 
                        coords_x = @CoordsX 
                    AND coords_y = @CoordsY";

                using (MySqlCommand cmdUnitPurchases = new MySqlCommand(sqlUnitPurchases, conn, transaction))
                {
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
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"An error occurred while GetNexusUnitPurchases");
            }
            finally
            {
                if (createdConnection && conn != null)
                {
                    await conn.CloseAsync();
                }
            }
            return res;
        }


        private async Task<NexusBase?> GetUserFirstBase(User user, MySqlConnection connection, MySqlTransaction transaction)
        {
            //Console.WriteLine($"Get User first base for user id {user.Id}");
            NexusBase? tmpBase = null;

            try
            {

                string sql = @"
                SELECT 
                    user_id, coords_x, coords_y 
                FROM 
                    maxhanna.nexus_bases n
                WHERE user_id = @UserId
                LIMIT 1;";


                MySqlCommand cmd = new MySqlCommand(sql, connection, transaction);
                cmd.Parameters.AddWithValue("@UserId", user.Id);

                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        tmpBase = new NexusBase();
                        tmpBase.CoordsX = reader.IsDBNull(reader.GetOrdinal("coords_x")) ? 0 : reader.GetInt32(reader.GetOrdinal("coords_x"));
                        tmpBase.CoordsY = reader.IsDBNull(reader.GetOrdinal("coords_y")) ? 0 : reader.GetInt32(reader.GetOrdinal("coords_y"));
                        tmpBase.User = new User(reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32(reader.GetOrdinal("user_id")), "Anonymous");
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"An error occurred getting first base for player {user.Id}");
            }
            return tmpBase;
        }

        private async Task RecalculateNexusGold(MySqlConnection conn, NexusBase? nexusBase, MySqlTransaction transaction)
        {
            if (nexusBase == null || (nexusBase.CoordsX == 0 && nexusBase.CoordsY == 0))
            {
                return;
            }
            Console.WriteLine($"Update nexus gold : {nexusBase.CoordsX},{nexusBase.CoordsY}");
            decimal newGoldAmount = 0;
            decimal miningSpeed = 0;
            if (nexusBase != null)
            {
                // Retrieve mining speed based on mines level
                string sqlMiningSpeed = @"
                    SELECT s.speed, n.gold, n.updated FROM nexus_mining_speed s
                    LEFT JOIN nexus_bases n ON n.mines_level = s.mines_level
                    WHERE s.mines_level = n.mines_level
                    AND coords_x = @CoordsX 
                    AND coords_y = @CoordsY;";
                MySqlCommand cmdMiningSpeed = new MySqlCommand(sqlMiningSpeed, conn, transaction);
                cmdMiningSpeed.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                cmdMiningSpeed.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);
                decimal? miningSpeedResult = 0;
                decimal currentGold = 0;
                DateTime updated = DateTime.Now;
                using (var reader = await cmdMiningSpeed.ExecuteReaderAsync())
                {
                    if (await reader.ReadAsync())
                    {
                        miningSpeedResult = reader.IsDBNull(reader.GetOrdinal("speed")) ? null : reader.GetDecimal("speed");
                        currentGold = reader.IsDBNull(reader.GetOrdinal("gold")) ? 0 : reader.GetDecimal("gold");
                        updated = reader.IsDBNull(reader.GetOrdinal("updated")) ? DateTime.Now : reader.GetDateTime("updated");
                        Console.WriteLine($"miningSpeedResult: {miningSpeedResult}, currentGold: {currentGold}. updated: {updated}");
                    }
                }
                if (miningSpeedResult != null)
                {
                    miningSpeed = Convert.ToDecimal(miningSpeedResult);
                    if (miningSpeed != 0)
                    {
                        Console.WriteLine($"Mining speed {miningSpeed}. Base Last Updated : {updated}");
                        TimeSpan timeElapsed = DateTime.Now - updated;
                        decimal goldEarned = (decimal)(timeElapsed.TotalSeconds / (double)miningSpeed);
                        Console.WriteLine("goldEarned " + goldEarned + "; since time elapsed: " + timeElapsed.TotalSeconds);

                        newGoldAmount = currentGold + Math.Abs(goldEarned);
                        if (newGoldAmount > (5000 * (nexusBase.WarehouseLevel + 1)))
                        {
                            newGoldAmount = (5000 * (nexusBase.WarehouseLevel + 1));
                        }
                        nexusBase.Gold = newGoldAmount;
                    }
                }
                if (miningSpeed != 0)
                {
                    string updateGoldSql = @"
                        UPDATE nexus_bases 
                        SET gold = @GoldEarned, updated = @Updated 
                        WHERE coords_x = @CoordsX AND coords_y = @CoordsY";
                    var parameters = new Dictionary<string, object?>
                    {
                        { "@GoldEarned", newGoldAmount },
                        { "@Updated", DateTime.Now },
                        { "@CoordsX", nexusBase.CoordsX },
                        { "@CoordsY", nexusBase.CoordsY },
                    };
                    await ExecuteInsertOrUpdateOrDeleteAsync(updateGoldSql, parameters, conn, transaction);
                }
            }
        }


        [HttpPost("UpdateNexusGold")]
        public async Task UpdateNexusGold(NexusBase nexusBase)
        {
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            await conn.OpenAsync();
            MySqlTransaction transaction = await conn.BeginTransactionAsync();

            if (nexusBase != null)
            {
                try
                {
                    await RecalculateNexusGold(conn, nexusBase, transaction);
                    await transaction.CommitAsync();

                }
                catch (Exception ex)
                {

                    await transaction.RollbackAsync();

                    _logger.LogError(ex, "An error occurred while updating Nexus gold.");
                    throw;
                }
                finally
                {

                    await conn.CloseAsync();

                }
            }
        }

        [HttpPost("UpdateNexusBuildings")]
        public async Task UpdateNexusBuildings(NexusBase nexusBase)
        {
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            await conn.OpenAsync();
            MySqlTransaction transaction = await conn.BeginTransactionAsync();

            if (nexusBase != null)
            {
                try
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

                            foreach (var (buildingName, upgradeStart, upgradeStartColumn, levelColumn) in buildings)
                            {
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
                                        int duration = Convert.ToInt32(durationResult);
                                        TimeSpan timeElapsed = DateTime.Now - upgradeStart.Value;
                                        if ((duration - timeElapsed.TotalSeconds) <= 3)
                                        {
                                            Console.WriteLine($"Time elapsed expired on {buildingName}; duration result: {duration}, timeELapsed in seconds: {timeElapsed.TotalSeconds} : ({duration - timeElapsed.TotalSeconds})");

                                            // Update the building level
                                            string updateLevelSql = $@"
                                            UPDATE nexus_bases 
                                            SET {levelColumn} = {levelColumn} + 1, updated = @Updated
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
                                            string resetUpgradeSql = $@"
                                            UPDATE nexus_base_upgrades 
                                            SET {upgradeStartColumn} = NULL 
                                            WHERE coords_x = @CoordsX AND coords_y = @CoordsY";
                                            MySqlCommand resetUpgradeCmd = new MySqlCommand(resetUpgradeSql, conn, transaction);
                                            resetUpgradeCmd.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
                                            resetUpgradeCmd.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);
                                            await resetUpgradeCmd.ExecuteNonQueryAsync();

                                            Console.WriteLine($"{buildingName} upgraded for nexus {nexusBase.CoordsX}:{nexusBase.CoordsY}");
                                        }
                                    }
                                }
                            }
                        }
                    }
                    await transaction.CommitAsync();

                }
                catch (Exception ex)
                {

                    await transaction.RollbackAsync();

                    _logger.LogError(ex, "An error occurred while updating Nexus buildings.");
                    throw;
                }
                finally
                {

                    await conn.CloseAsync();

                }
            }
        }

        [HttpPost("UpdateNexusAttacks")]
        public async Task UpdateNexusAttacks([FromBody] NexusBase nexus)
        {
            Console.WriteLine($"Update Nexus Attacks for {nexus.CoordsX},{nexus.CoordsY}");

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            await conn.OpenAsync();

            MySqlTransaction transaction = await conn.BeginTransactionAsync();

            try
            {

                List<UnitStats> stats = await GetUnitStatsFromDB(null, null);
                UnitStats marineStats = stats.Find(x => x.UnitType == "marine")!;
                UnitStats goliathStats = stats.Find(x => x.UnitType == "goliath")!;
                UnitStats siegeTankStats = stats.Find(x => x.UnitType == "siege_tank")!;
                UnitStats scoutStats = stats.Find(x => x.UnitType == "scout")!;
                UnitStats wraithStats = stats.Find(x => x.UnitType == "wraith")!;
                UnitStats battlecruiserStats = stats.Find(x => x.UnitType == "battlecruiser")!;
                UnitStats glitcherStats = stats.Find(x => x.UnitType == "glitcher")!;

                List<NexusAttackSent>? attacks = (await GetNexusAttacksIncoming(nexus, true, true, null, null)) ?? new List<NexusAttackSent>();
                List<NexusAttackSent>? attacks2 = (await GetNexusAttacksSent(nexus, true, null, null)) ?? new List<NexusAttackSent>();
                if (attacks == null)
                {
                    attacks = new List<NexusAttackSent>();
                }
                attacks = attacks.Concat(attacks2).ToList();

                Console.WriteLine(" Attacks Count: " + attacks.Count);


                if (attacks != null && attacks.Count > 0)
                {
                    List<UnitUpgradeStats> upgradeStats = await GetUnitUpgradeStatsFromDB(conn, transaction);
                    for (var attackIndex = 0; attackIndex < attacks.Count; attackIndex++)
                    {
                        await PerformAttackOrDefenceIfTimeElapsed(conn, transaction, marineStats, goliathStats, siegeTankStats, scoutStats, wraithStats, battlecruiserStats, glitcherStats, attacks, attackIndex, upgradeStats);
                    }
                    await transaction.CommitAsync();

                    await conn.CloseAsync();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error while updating attacks:" + ex.Message);

                await transaction.RollbackAsync();

            }
        }

        [HttpPost("UpdateNexusDefences")]
        public async Task UpdateNexusDefences([FromBody] NexusBase nexus)
        {
            Console.WriteLine($"Update Nexus Defences for {nexus.CoordsX},{nexus.CoordsY}");

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            await conn.OpenAsync();

            MySqlTransaction transaction = await conn.BeginTransactionAsync();

            try
            {
                List<NexusAttackSent>? defences = (await GetNexusDefencesIncoming(nexus, true, true, null, null)) ?? new List<NexusAttackSent>();
                List<NexusAttackSent>? defences2 = (await GetNexusDefencesSent(nexus, true, null, null)) ?? new List<NexusAttackSent>();
                if (defences == null)
                {
                    defences = new List<NexusAttackSent>();
                }
                defences = defences.Concat(defences2).ToList();

                Console.WriteLine(" Defences Count: " + defences.Count);


                if (defences != null && defences.Count > 0)
                { 
                    for (var defenceIndex = 0; defenceIndex < defences.Count; defenceIndex++)
                    {
                        if (defences[defenceIndex] != null && defences[defenceIndex].Arrived == false)
                        { 
                            await PerformDefenceIfTimeElapsed(conn, transaction, defences, defenceIndex);
                        }
                    }
                    await transaction.CommitAsync();

                    await conn.CloseAsync();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error while updating attacks:" + ex.Message);

                await transaction.RollbackAsync();

            }
        }

        private async Task PerformAttackOrDefenceIfTimeElapsed(MySqlConnection conn, MySqlTransaction transaction,
            UnitStats marineStats, UnitStats goliathStats, UnitStats siegeTankStats, UnitStats scoutStats, UnitStats wraithStats, UnitStats battlecruiserStats, UnitStats glitcherStats,
            List<NexusAttackSent> attacks, int attackIndex, List<UnitUpgradeStats> unitUpgradeStats)
        {
            TimeSpan timeElapsed = (DateTime.Now - attacks?[attackIndex].Timestamp) ?? TimeSpan.Zero;
            Console.WriteLine($"Checking timeElapsed: {timeElapsed.TotalSeconds}, duration: {attacks[attackIndex].Duration} : {timeElapsed.TotalSeconds - attacks[attackIndex].Duration}");
            if (attacks == null) { attacks = new List<NexusAttackSent>(); }
            if ((timeElapsed.TotalSeconds - attacks[attackIndex].Duration) >= 0)
            {
                Console.WriteLine($"{attacks[attackIndex].OriginCoordsX}, {attacks[attackIndex].OriginCoordsY} Attack has landed on {attacks[attackIndex].DestinationCoordsX},{attacks[attackIndex].DestinationCoordsY}!");

                NexusBase origin = await GetNexusBase(attacks[attackIndex].OriginCoordsX, attacks[attackIndex].OriginCoordsY, conn, transaction)
                    ?? new NexusBase() { CoordsX = attacks[attackIndex].OriginCoordsX, CoordsY = attacks[attackIndex].OriginCoordsY };

                NexusBase destination = await GetNexusBase(attacks[attackIndex].DestinationCoordsX, attacks[attackIndex].DestinationCoordsY, conn, transaction)
                    ?? new NexusBase() { CoordsX = attacks[attackIndex].DestinationCoordsX, CoordsY = attacks[attackIndex].DestinationCoordsY };

                await DeleteAttack(origin, destination, attacks[attackIndex].Timestamp, attacks[attackIndex].Duration, conn, transaction);

                Console.WriteLine($"Getting attack results for {origin.CoordsX},{origin.CoordsY} attack on {destination.CoordsX},{destination.CoordsY}");

                List<UnitStats> attackingUnits = new List<UnitStats>();
                List<UnitStats> attackingUnitsBeforeAttack = new List<UnitStats>();
                var units = new (UnitStats us, int? total)[]
                {
                                    (marineStats, attacks[attackIndex].MarineTotal),
                                    (goliathStats, attacks[attackIndex].GoliathTotal),
                                    (siegeTankStats, attacks[attackIndex].SiegeTankTotal),
                                    (scoutStats, attacks[attackIndex].ScoutTotal),
                                    (wraithStats, attacks[attackIndex].WraithTotal),
                                    (battlecruiserStats, attacks[attackIndex].BattlecruiserTotal),
                                    (glitcherStats, attacks[attackIndex].GlitcherTotal),
                };
                foreach (var (us, total) in units)
                {
                    if (total != null && total > 0)
                    {
                        UnitStats tmp = us;
                        tmp.SentValue = total;
                        attackingUnits.Add(tmp);
                        //Console.WriteLine($"added {tmp.SentValue} {tmp.UnitType} in attackingUnits");
                    }
                }
                attackingUnits.ForEach(x =>
                {
                    UnitStats tmp = x;
                    tmp.SentValue = x.SentValue;
                    attackingUnitsBeforeAttack.Add(tmp);
                }
                );
                bool scoutAttack = attackingUnits.Any(u => u.UnitType == "scout") && attackingUnits.Count == 1;

                var res = await GetNexusUnits(destination, true, conn, transaction);
                NexusUnits? defendingUnits = res;
                NexusUnits defendingUnitsPreScout = new NexusUnits()
                {
                    MarineTotal = defendingUnits?.MarineTotal,
                    GoliathTotal = defendingUnits?.GoliathTotal,
                    SiegeTankTotal = defendingUnits?.SiegeTankTotal,
                    ScoutTotal = defendingUnits?.ScoutTotal,
                    WraithTotal = defendingUnits?.WraithTotal,
                    BattlecruiserTotal = defendingUnits?.BattlecruiserTotal,
                    GlitcherTotal = defendingUnits?.GlitcherTotal
                };
                //Console.WriteLine("got sent scouts: " + sentScouts);
                if (scoutAttack && defendingUnits != null)
                {
                    defendingUnits.MarineTotal = 0;
                    defendingUnits.GoliathTotal = 0;
                    defendingUnits.SiegeTankTotal = 0;
                    defendingUnits.WraithTotal = 0;
                    defendingUnits.BattlecruiserTotal = 0;
                    defendingUnits.GlitcherTotal = 0;
                }
                if (defendingUnits != null)
                {
                    Console.WriteLine($"defence units : m:{defendingUnits.MarineTotal} g:{defendingUnits.GoliathTotal} st:{defendingUnits.SiegeTankTotal} s:{defendingUnits.ScoutTotal} w:{defendingUnits.WraithTotal} b:{defendingUnits.BattlecruiserTotal} gl:{defendingUnits.GlitcherTotal}");
                }


                if (origin.CoordsX != destination.CoordsX || origin.CoordsY != destination.CoordsY || origin.User?.Id != destination.User?.Id)
                {
                    var unitTypeToPropertyMap = new Dictionary<string, string>
                    {
                        { "marine", "MarineTotal" },
                        { "goliath", "GoliathTotal" },
                        { "siege_tank", "SiegeTankTotal" },
                        { "scout", "ScoutTotal" },
                        { "wraith", "WraithTotal" },
                        { "battlecruiser", "BattlecruiserTotal" },
                        { "glitcher", "GlitcherTotal" }
                    };
                    var attackerUnitTypeToLevelMap = new Dictionary<string, Func<int>>
                    {
                        { "marine", () => origin.MarineLevel },
                        { "goliath", () => origin.GoliathLevel },
                        { "siege_tank", () => origin.SiegeTankLevel },
                        { "scout", () => origin.ScoutLevel },
                        { "wraith", () => origin.WraithLevel },
                        { "battlecruiser", () => origin.BattlecruiserLevel },
                        { "glitcher", () => origin.GlitcherLevel }
                    };
                    var defenderUnitTypeToLevelMap = new Dictionary<string, Func<int>>
                    {
                        { "marine", () => destination.MarineLevel },
                        { "goliath", () => destination.GoliathLevel },
                        { "siege_tank", () => destination.SiegeTankLevel },
                        { "scout", () => destination.ScoutLevel },
                        { "wraith", () => destination.WraithLevel },
                        { "battlecruiser", () => destination.BattlecruiserLevel },
                        { "glitcher", () => destination.GlitcherLevel }
                    };
                    //CALCULATE DAMAGE  
                    var unitStats = new Dictionary<string, UnitStats>
                                {
                                    { "marine", marineStats },
                                    { "goliath", goliathStats },
                                    { "siege_tank", siegeTankStats },
                                    { "scout", scoutStats },
                                    { "wraith", wraithStats },
                                    { "battlecruiser", battlecruiserStats },
                                    { "glitcher", glitcherStats },
                                };

                    int CalculateDamage(Func<UnitStats, decimal> damageSelector, Dictionary<string, Func<int>> unitTypeToLevelMap)
                    {
                        return attackingUnits.Sum(x =>
                        {
                            var sentValue = x.SentValue ?? 0; // Default to 0 if SentValue is null
                            var unitStat = unitStats.FirstOrDefault(y => x.UnitType == y.Key).Value;
                            int unitLevel = unitTypeToLevelMap.TryGetValue(x.UnitType ?? "", out var getLevel) ? getLevel() : 0;

                            decimal damageMultiplier = unitUpgradeStats.FirstOrDefault(u => u.UnitLevel == unitLevel)?.DamageMultiplier ?? 1;
                            decimal selectedDamage = damageSelector(unitStat);
                            decimal totalDamage = (decimal)sentValue * (selectedDamage * damageMultiplier);

                            if (totalDamage > int.MaxValue || totalDamage < int.MinValue)
                            {
                                Console.WriteLine($"Overflow detected for unit {x.UnitType}. Calculated damage: {totalDamage}");
                                return 0;
                            }

                            Console.WriteLine($"Detected sent attacking unit: {sentValue} {x.UnitType}. Regular damage: {selectedDamage}; Total added damage: {totalDamage}");
                            return (int)totalDamage;
                        });
                    }

                    int attackingGroundDamage = CalculateDamage(unitStat => unitStat.GroundDamage, attackerUnitTypeToLevelMap);
                    int attackingAirDamage = CalculateDamage(unitStat => unitStat.AirDamage, attackerUnitTypeToLevelMap);

                    double defendingGroundDamage = (defendingUnits?.ScoutTotal * unitStats["scout"].GroundDamage) ?? 0.0001;
                    double defendingAirDamage = (defendingUnits?.ScoutTotal * unitStats["scout"].AirDamage) ?? 0.0001;
                    foreach (var unitType in unitStats.Keys)
                    {
                        if (!scoutAttack && unitType != "scout") // Skip scout since it's already calculated
                        {
                            if (unitTypeToPropertyMap.TryGetValue(unitType, out var propertyName) &&
                                defenderUnitTypeToLevelMap.TryGetValue(unitType, out var getLevel))
                            {
                                var totalUnits = defendingUnits?.GetType().GetProperty(propertyName)?.GetValue(defendingUnits, null) as int? ?? 0;
                                int unitLevel = getLevel();
                                decimal damageMultiplier = unitUpgradeStats.FirstOrDefault(u => u.UnitLevel == unitLevel)?.DamageMultiplier ?? 1;

                                defendingGroundDamage += totalUnits * (unitStats[unitType].GroundDamage * (double)damageMultiplier);
                                defendingAirDamage += totalUnits * (unitStats[unitType].AirDamage * (double)damageMultiplier);

                                Console.WriteLine($"Calculating added {unitType} defending damage: {defendingGroundDamage} {defendingAirDamage} ... ground: {unitStats[unitType].GroundDamage}, air: {unitStats[unitType].AirDamage}, multiplier: {damageMultiplier}");
                            }
                        }
                    }


                    Console.WriteLine("Attacking ground damage: " + attackingGroundDamage);
                    Console.WriteLine("Attacking air damage: " + attackingAirDamage);

                    Console.WriteLine("Defending ground damage: " + defendingGroundDamage);
                    Console.WriteLine("Defending air damage: " + defendingAirDamage);

                    var attackingLosses = new Dictionary<string, int?>();
                    var defendingLosses = new Dictionary<string, int?>();
                    bool attackerSupplyRecovered = false;
                    bool defenderSupplyRecovered = false;

                    // CALCULATE LOSSES
                    if ((attackingGroundDamage != 0 || attackingAirDamage != 0) && (defendingGroundDamage != 0 || defendingAirDamage != 0))
                    {
                        Console.WriteLine("Calculating losses...");
                        double groundCoeff = attackingGroundDamage / defendingGroundDamage;
                        double airCoeff = attackingAirDamage / defendingAirDamage;
                        double groundAttackDmgLossCoeff = groundCoeff * Math.Sqrt((double)groundCoeff);
                        double airAttackDmgLossCoeff = airCoeff * Math.Sqrt((double)airCoeff);

                        Console.WriteLine($"groundCoeff: {groundCoeff}, airCoeff: {airCoeff}, groundAttackDmgLossCoeff: {groundAttackDmgLossCoeff}, airAttackDmgLossCoeff: {airAttackDmgLossCoeff} ");


                        foreach (var unitType in unitStats.Keys)
                        {
                            //Console.WriteLine($"Processing unit type: {unitType}");

                            var attackingUnit = attackingUnits.FirstOrDefault(x => x.UnitType == unitType);
                            //Console.WriteLine("got attackingUnit: " + attackingUnit);
                            //Console.WriteLine($"Attacking unit: {attackingUnit?.UnitType}");

                            string bigType = unitType;
                            bigType = (unitType == "siege_tank" ? "SiegeTank"
                                : unitType == "marine" ? "Marine"
                                : unitType == "goliath" ? "Goliath"
                                : unitType == "scout" ? "Scout"
                                : unitType == "wraith" ? "Wraith"
                                : unitType == "battlecruiser" ? "Battlecruiser"
                                : "Glitcher");

                            var defendingUnitProperty = defendingUnits?.GetType().GetProperty($"{bigType}Total");
                            //Console.WriteLine($"Defending unit property: {defendingUnitProperty?.Name}");

                            var defendingUnitValue = defendingUnitProperty?.GetValue(defendingUnits, null) as int? ?? 0;
                            //Console.WriteLine($"Defending unit value: {defendingUnitValue}");

                            var sentValue = attackingUnit?.SentValue ?? 0;
                            //Console.WriteLine($"Sent value: {sentValue}");

                            var attackLossCoeff = (unitType == "scout" || unitType == "wraith" || unitType == "battlecruiser" || unitType == "glitcher")
                                ? airAttackDmgLossCoeff
                                : groundAttackDmgLossCoeff;
                            //Console.WriteLine($"Attack loss coeff: {attackLossCoeff}");
                            int aLoss = Math.Min(sentValue, (int)(sentValue / attackLossCoeff));
                            int dLoss = Math.Min(defendingUnitValue, (int)(defendingUnitValue * attackLossCoeff));
                            attackingLosses[unitType] = aLoss;
                            defendingLosses[unitType] = dLoss;
                            //Console.WriteLine($"Attacking losses: {attackingLosses[unitType]}"); 
                            //Console.WriteLine($"Defending losses: {defendingLosses[unitType]}");\
                            if (aLoss > 0) { attackerSupplyRecovered = true; }
                            if (dLoss > 0) { defenderSupplyRecovered = true; }
                            Console.WriteLine($"Attacking unit: {unitType}: {sentValue}");
                            Console.WriteLine($"Defending unit: {unitType}: {defendingUnitValue}");
                        }
                        Console.WriteLine($"attackerSupplyRecovered: {attackerSupplyRecovered}, defenderSupplyRecovered: {defenderSupplyRecovered}");
                    }
                    if (defenderSupplyRecovered)
                    {
                        await UpdateNexusUnitsAfterAttack(conn, transaction, destination, unitStats, defendingLosses);
                        int currentSupplyUsed = await CalculateUsedNexusSupply(destination, conn, transaction);
                        await UpdateNexusSupply(destination, currentSupplyUsed, conn, transaction);
                    }

                    var expectedKeys = new List<string> { "marine", "goliath", "siege_tank", "scout", "wraith", "battlecruiser", "glitcher" };
                    foreach (var key in expectedKeys)
                    {
                        if (!attackingLosses.ContainsKey(key))
                        {
                            attackingLosses[key] = 0; // Initialize missing keys with a default value
                        }
                    }
                    //Console.WriteLine("Sending survivors back home...");
                    //SEND SURVIVORS BACK
                    if (attackingLosses != null && attackingLosses.Count > 0)
                    {
                        var losses = new Dictionary<string, int?>
                                    {
                                        { "marine", attackingLosses["marine"] },
                                        { "goliath", attackingLosses["goliath"] },
                                        { "siege_tank", attackingLosses["siege_tank"] },
                                        { "scout", attackingLosses["scout"] },
                                        { "wraith", attackingLosses["wraith"] },
                                        { "battlecruiser", attackingLosses["battlecruiser"] },
                                        { "glitcher", attackingLosses["glitcher"] },
                                    };
                        attackingUnits.ForEach(x =>
                        {
                            if (!string.IsNullOrEmpty(x.UnitType) && losses.ContainsKey(x.UnitType))
                            {
                                x.SentValue = (x.SentValue ?? 0) - (losses[x.UnitType] ?? 0);
                            }
                        });
                    }

                    decimal goldPlundered = await GetGoldPlundered(conn, transaction, destination, attackingUnits, defendingUnits, unitStats);

                    NexusBattleOutcome battleOutcome = await CreateBattleOutcome(attacks, attackIndex, origin, destination, defendingUnits, attackingLosses, defendingLosses, goldPlundered, conn, transaction);
                    await InsertBattleOutcome(battleOutcome, conn, transaction);
                    Console.WriteLine("Inserted report, now find glitchers");
                    var foundGlitchers = attackingUnits.FirstOrDefault(x => x.UnitType == "glitcher" && x.SentValue > 0);
                    Console.WriteLine("Fouind glitchers or not ");

                    if (attackingUnits != null && foundGlitchers != null)
                    {
                        // Glitcher was sent, and it survived. Take over the nexus and make sure the units remain there;
                        // Since support is not implemented yet, just send the units back to base for now.
                        await ChangeOwnership((origin.User?.Id ?? 0), destination, conn, transaction);

                        attackerSupplyRecovered = true;
                        if (attackingLosses != null && !attackingLosses.ContainsKey("glitcher"))
                        {
                            attackingLosses["glitcher"] = 1;
                        }
                        else if (attackingLosses != null)
                        {
                            attackingLosses["glitcher"] += 1;
                        }
                        else if (attackingLosses == null)
                        {
                            attackingLosses = new Dictionary<string, int?>();
                            attackingLosses["glitcher"] = 1;
                        }
                    }

                    if (attackerSupplyRecovered)
                    {
                        await UpdateNexusUnitsAfterAttack(conn, transaction, origin, unitStats, attackingLosses!);
                        int currentSupplyUsed = await CalculateUsedNexusSupply(origin, conn, transaction);
                        await UpdateNexusSupply(origin, currentSupplyUsed, conn, transaction);
                    }
                    Console.WriteLine("all done, sending attack");
                    if (attackingUnits != null && attackingUnits.FirstOrDefault(x => x.SentValue > 0) != null)
                    {
                        if (origin.CoordsX != destination.CoordsX || origin.CoordsY != destination.CoordsY)
                        {
                            Console.WriteLine("Sent surviving units back home.");
                            await SendAttack(origin, origin, origin.User, origin.User, attackingUnits.ToArray(), attacks[attackIndex].Duration, conn, transaction);
                        }
                        else
                        { 
                            Console.WriteLine("Returning units were ousted from their home. Units disbanded.");
                        }
                    }
                    else
                    {
                        Console.WriteLine($"No survivors made it...");
                    }
                }
                else
                {
                    Console.WriteLine($"Survivors made it back home...");


                }
            }
        }


        private async Task PerformDefenceIfTimeElapsed(MySqlConnection conn, MySqlTransaction transaction, List<NexusAttackSent> defences, int defenceIndex)
        {
            TimeSpan timeElapsed = (DateTime.Now - defences?[defenceIndex].Timestamp) ?? TimeSpan.Zero;
            Console.WriteLine($"Checking timeElapsed: {timeElapsed.TotalSeconds}, duration: {defences[defenceIndex].Duration} : {timeElapsed.TotalSeconds - defences[defenceIndex].Duration}");

            if (defences == null) { 
                defences = new List<NexusAttackSent>(); 
            }

            if ((timeElapsed.TotalSeconds - defences[defenceIndex].Duration) >= 0)
            {
                Console.WriteLine($"{defences[defenceIndex].OriginCoordsX}, {defences[defenceIndex].OriginCoordsY} Defence has landed on {defences[defenceIndex].DestinationCoordsX},{defences[defenceIndex].DestinationCoordsY}!");

                NexusBase origin = await GetNexusBase(defences[defenceIndex].OriginCoordsX, defences[defenceIndex].OriginCoordsY, conn, transaction)
                    ?? new NexusBase() { CoordsX = defences[defenceIndex].OriginCoordsX, CoordsY = defences[defenceIndex].OriginCoordsY };

                NexusBase destination = await GetNexusBase(defences[defenceIndex].DestinationCoordsX, defences[defenceIndex].DestinationCoordsY, conn, transaction)
                    ?? new NexusBase() { CoordsX = defences[defenceIndex].DestinationCoordsX, CoordsY = defences[defenceIndex].DestinationCoordsY };
                
                if (origin.CoordsX == destination.CoordsX && origin.CoordsY == destination.CoordsY)
                {
                    Console.WriteLine("Deleting support as it has arrived back home");
                    await DeleteDefence(origin, destination, defences[defenceIndex].Timestamp, defences[defenceIndex].Duration, conn, transaction);
                }
                else 
                {
                    Console.WriteLine("Defence has arrived");
                    await DefenceArrived(origin, destination, defences[defenceIndex].Timestamp, defences[defenceIndex].Duration, conn, transaction); 
                }

                Console.WriteLine($"Getting defence results for {origin.CoordsX},{origin.CoordsY} support on {destination.CoordsX},{destination.CoordsY}");
            }
        }


        private async Task UpdateBaseAfterNoSurvivorsAttack(MySqlConnection conn, MySqlTransaction transaction, List<NexusAttackSent>? attacks, int attackIndex, NexusBase origin, List<UnitStats> attackingUnitsBeforeAttack)
        {
            NexusUnits? attackerHomeBaseUnits = await GetNexusUnits(origin, false, conn, transaction);

            int marinesTotal = (attackerHomeBaseUnits?.MarineTotal ?? 0) - (attacks[attackIndex].MarineTotal ?? 0);
            int goliathTotal = (attackerHomeBaseUnits?.GoliathTotal ?? 0) - (attacks[attackIndex].GoliathTotal ?? 0);
            int siegeTankTotal = (attackerHomeBaseUnits?.SiegeTankTotal ?? 0) - (attacks[attackIndex].SiegeTankTotal ?? 0);
            int scoutTotal = (attackerHomeBaseUnits?.ScoutTotal ?? 0) - (attacks[attackIndex].ScoutTotal ?? 0);
            int wraithTotal = (attackerHomeBaseUnits?.WraithTotal ?? 0) - (attacks[attackIndex].WraithTotal ?? 0);
            int battlecruiserTotal = (attackerHomeBaseUnits?.BattlecruiserTotal ?? 0) - (attacks[attackIndex].BattlecruiserTotal ?? 0);
            int glitcherTotal = (attackerHomeBaseUnits?.GlitcherTotal ?? 0) - (attacks[attackIndex].GlitcherTotal ?? 0);
            Console.WriteLine("vs these attacking units:");
            attackingUnitsBeforeAttack.ForEach(x => Console.WriteLine(x.UnitType + " " + x.SentValue));
            //AddNexusUnits attackingUnits, get units in base and add attackingunits to it.
            await UpdateNexusUnits(origin, marinesTotal, goliathTotal, siegeTankTotal, scoutTotal, wraithTotal, battlecruiserTotal, glitcherTotal, conn, transaction);
        }

        private async Task UpdateNexusUnitsAfterAttack(MySqlConnection conn, MySqlTransaction transaction, NexusBase nexusBase, Dictionary<string, UnitStats> unitStats, Dictionary<string, int?> losses)
        {
            NexusUnits? homeBaseUnits = await GetNexusUnits(nexusBase, true, conn, transaction);
            if (homeBaseUnits != null)
            {
                foreach (var unitType in unitStats.Keys)
                {
                    string bigType = (unitType == "siege_tank" ? "SiegeTank"
                        : unitType == "marine" ? "Marine"
                        : unitType == "goliath" ? "Goliath"
                        : unitType == "scout" ? "Scout"
                        : unitType == "wraith" ? "Wraith"
                        : unitType == "battlecruiser" ? "Battlecruiser"
                        : "Glitcher");
                    var prop = homeBaseUnits.GetType().GetProperty($"{bigType}Total");
                    if (prop != null)
                    {
                        prop.SetValue(homeBaseUnits, (int)prop.GetValue(homeBaseUnits, null)! - losses[unitType]);
                    }
                }
                await UpdateNexusUnits(nexusBase,
                    homeBaseUnits.MarineTotal ?? 0,
                    homeBaseUnits.GoliathTotal ?? 0,
                    homeBaseUnits.SiegeTankTotal ?? 0,
                    homeBaseUnits.ScoutTotal ?? 0,
                    homeBaseUnits.WraithTotal ?? 0,
                    homeBaseUnits.BattlecruiserTotal ?? 0,
                    homeBaseUnits.GlitcherTotal ?? 0, conn, transaction);
            }
        }

        private async Task<decimal> GetGoldPlundered(MySqlConnection conn, MySqlTransaction transaction, NexusBase destination, List<UnitStats> attackingUnits, NexusUnits? defendingUnits, Dictionary<string, UnitStats> unitStats)
        {
            await RecalculateNexusGold(conn, destination, transaction);
            decimal goldForGrabs = destination.Gold;
            if (destination.MinesLevel == 0)
            {
                goldForGrabs = new Random().Next(0, 666);
            }
            Console.WriteLine("destination gold : " + goldForGrabs);
            decimal goldCarryingCapacity = attackingUnits.Sum(x => x.GoldCarryingCapacity);

            Console.WriteLine("gold carrying capacity: " + goldCarryingCapacity);
            decimal goldPlundered;
            if (defendingUnits != null)
            {
                // Step 1: Calculate total attacking and defending units
                int totalAttackingUnits = attackingUnits.Sum(x => x.SentValue ?? 0);
                int totalDefendingUnits = unitStats.Keys.Sum(unitType =>
                {
                    string bigType = (unitType == "siege_tank" ? "SiegeTank"
                        : unitType == "marine" ? "Marine"
                        : unitType == "goliath" ? "Goliath"
                        : unitType == "scout" ? "Scout"
                        : unitType == "wraith" ? "Wraith"
                        : unitType == "battlecruiser" ? "Battlecruiser"
                        : "Glitcher");
                    return defendingUnits.GetType().GetProperty($"{bigType}Total")?.GetValue(defendingUnits, null) as int? ?? 0;
                });
                Console.WriteLine($"totalAttackingUnits: {totalAttackingUnits}, totalDefendingUnits: {totalDefendingUnits}");
                // Step 2: Determine the ratio
                decimal ratio = totalAttackingUnits == 0 || totalDefendingUnits == 0
                    ? (totalAttackingUnits > totalDefendingUnits ? 1.0m : 0.0m)
                    : Math.Min((decimal)totalAttackingUnits / totalDefendingUnits, 1.0m);
                Console.WriteLine("ratio : " + ratio);
                // Step 3: Adjust goldPlundered based on the ratio
                goldPlundered = ratio * Math.Min(goldForGrabs, goldCarryingCapacity);
            }
            else
            {
                // If there are no defending units
                goldPlundered = Math.Min(goldForGrabs, goldCarryingCapacity);
            }

            return goldPlundered;
        }

        private async Task ChangeOwnership(int UserId, NexusBase deadBase, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            //Console.WriteLine($"Deleting Report from {UserId},{BattleId}");
            string sql = @"
                INSERT INTO maxhanna.nexus_bases (user_id, coords_x, coords_y, gold)
                VALUES (@UserId, @CoordsX, @CoordsY, @Gold)
                ON DUPLICATE KEY UPDATE user_id = @UserId;";

            var parameters = new Dictionary<string, object?>
             {
                 { "@UserId", UserId },
                 { "@CoordsX", deadBase.CoordsX },
                 { "@CoordsY", deadBase.CoordsY },
                 { "@Gold", 200 }
             };

            await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
            //Console.WriteLine($"Deleted Report from {UserId},{BattleId}");
        }

        private async Task DeleteReport(int userId, int battleId)
        {
            string sql = @"
                INSERT INTO nexus_reports_deleted (user_id, battle_id) 
                VALUES (@UserId, @BattleId);

                DELETE b
                FROM nexus_battles b
                LEFT JOIN nexus_reports_deleted d1 ON b.battle_id = d1.battle_id AND b.origin_user_id = d1.user_id
                LEFT JOIN nexus_reports_deleted d2 ON b.battle_id = d2.battle_id AND b.destination_user_id = d2.user_id
                WHERE b.battle_id = @BattleId
                    AND ((b.origin_user_id IS NULL OR b.origin_user_id = 0 OR d1.user_id IS NOT NULL)
                    AND  (b.destination_user_id IS NULL OR b.destination_user_id = 0 OR d2.user_id IS NOT NULL));

                DELETE FROM nexus_reports_deleted
                WHERE battle_id = @BattleId;";

            var parameters = new Dictionary<string, object?>
            {
                { "@UserId", userId },
                { "@BattleId", battleId },
            };
            await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters);
        }

        private async Task ResearchUnit(NexusBase nexusBase, UnitStats unit, MySqlConnection? connection = null, MySqlTransaction? transaction = null)
        {
            string sql = @"
                INSERT INTO nexus_unit_upgrades (coords_x, coords_y, unit_id_upgraded) 
                VALUES (@CoordsX, @CoordsY, @UnitId);";

            var parameters = new Dictionary<string, object?>
            {
                { "@CoordsX", nexusBase.CoordsX },
                { "@CoordsY", nexusBase.CoordsY },
                { "@UnitId", unit.UnitId },
            };
            await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
        }


        private async Task<NexusBattleOutcome> CreateBattleOutcome(List<NexusAttackSent> attacks, int attackIndex, NexusBase origin, NexusBase destination,
            NexusUnits? defendingUnits, Dictionary<string, int?>? attackingLosses, Dictionary<string, int?> defendingLosses, decimal goldPlundered, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            Console.WriteLine("Create battle outcome");
            NexusUnits? dunoi = await GetNexusAttackingUnits(destination, conn, transaction);
            return new NexusBattleOutcome()
            {
                OriginUser = origin.User,
                OriginCoordsX = origin.CoordsX,
                OriginCoordsY = origin.CoordsY,
                DestinationUser = destination.User,
                DestinationCoordsX = destination.CoordsX,
                DestinationCoordsY = destination.CoordsY,
                AttackingUnits = new Dictionary<string, int?>
                {
                    { "marine", attacks[attackIndex].MarineTotal },
                    { "goliath", attacks[attackIndex].GoliathTotal },
                    { "siege_tank", attacks[attackIndex].SiegeTankTotal },
                    { "scout", attacks[attackIndex].ScoutTotal },
                    { "wraith", attacks[attackIndex].WraithTotal },
                    { "battlecruiser", attacks[attackIndex].BattlecruiserTotal },
                    { "glitcher", attacks[attackIndex].GlitcherTotal },
                },
                DefendingUnits = new Dictionary<string, int?>
                {
                    { "marine", defendingUnits?.MarineTotal },
                    { "goliath", defendingUnits?.GoliathTotal },
                    { "siege_tank", defendingUnits?.SiegeTankTotal },
                    { "scout", defendingUnits?.ScoutTotal },
                    { "wraith", defendingUnits?.WraithTotal },
                    { "battlecruiser", defendingUnits?.BattlecruiserTotal },
                    { "glitcher", defendingUnits?.GlitcherTotal },
                },
                AttackingLosses = attackingLosses ?? new Dictionary<string, int?>(),
                DefendingLosses = defendingLosses,
                DefenderGold = destination.Gold,
                DefenderGoldStolen = goldPlundered,
                DefenderBuildingLevels = new Dictionary<string, int?>
                {
                    { "command_center", destination.CommandCenterLevel },
                    { "mines", destination.MinesLevel },
                    { "supply_depot", destination.SupplyDepotLevel },
                    { "warehouse", destination.WarehouseLevel },
                    { "factory", destination.FactoryLevel },
                    { "starport", destination.StarportLevel },
                    { "engineering_bay", destination.EngineeringBayLevel },
                },
                DefenderUnitsNotInVillage = new Dictionary<string, int?>
                {

                    { "marine", dunoi?.MarineTotal },
                    { "goliath", dunoi?.GoliathTotal },
                    { "siege_tank", dunoi?.SiegeTankTotal },
                    { "scout", dunoi?.ScoutTotal },
                    { "wraith", dunoi?.WraithTotal },
                    { "battlecruiser", dunoi?.BattlecruiserTotal },
                    { "glitcher", dunoi?.GlitcherTotal },
                }
            };
        }
        private async Task<NexusBattleOutcomeReports> GetAllBattleReports(
            int? userId,
            NexusBase? targetBase,
            int pageNumber,
            int pageSize,
            MySqlConnection? externalConnection = null,
            MySqlTransaction? externalTransaction = null)
        {
            var battleReports = new List<NexusBattleOutcome>();
            int offset = (pageNumber - 1) * pageSize;
            int totalReports = 0;
            string query = @"
                SELECT SQL_CALC_FOUND_ROWS b.*, au.username as attackerUsername, du.username as defenderUsername, audp.file_id as attackerDp, dudp.file_id as defenderDp
                FROM nexus_battles b
                LEFT JOIN maxhanna.users au ON au.id = b.origin_user_id
                LEFT JOIN maxhanna.user_display_pictures audp ON au.id = audp.user_id
                LEFT JOIN maxhanna.users du ON du.id = b.destination_user_id
                LEFT JOIN maxhanna.user_display_pictures dudp ON du.id = dudp.user_id
                WHERE 1=1";

            if (userId != null)
            {
                query += @"
                    AND (b.origin_user_id = @UserId OR b.destination_user_id = @UserId)
                    AND NOT EXISTS (
                        SELECT 1
                        FROM nexus_reports_deleted d
                        WHERE d.user_id = @UserId
                        AND d.battle_id = b.battle_id
                    )";
            }

            if (targetBase != null)
            {
                query += @"
                    AND (b.destination_coords_x = @BaseCoordsX AND b.destination_coords_y = @BaseCoordsY)";
            }
            query += @"
                ORDER BY b.timestamp DESC, b.battle_id DESC
                LIMIT @PageSize OFFSET @Offset";

            MySqlConnection connection = externalConnection ?? new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            MySqlTransaction transaction = externalTransaction;
            bool needToCloseConnection = externalConnection == null;
            bool needToCommitTransaction = externalTransaction == null;
            //Console.WriteLine(query);
            //Console.WriteLine(offset);
            //Console.WriteLine(pageSize);
            try
            {
                if (needToCloseConnection)
                {
                    await connection.OpenAsync();
                }

                if (needToCommitTransaction)
                {
                    transaction = await connection.BeginTransactionAsync();
                }

                using (var command = new MySqlCommand(query, connection, transaction))
                {
                    if (userId != null)
                    {
                        command.Parameters.AddWithValue("@UserId", userId);
                    }
                    if (targetBase != null)
                    {
                        command.Parameters.AddWithValue("@BaseCoordsX", targetBase.CoordsX);
                        command.Parameters.AddWithValue("@BaseCoordsY", targetBase.CoordsY);
                    }
                    command.Parameters.AddWithValue("@PageSize", pageSize);
                    command.Parameters.AddWithValue("@Offset", offset);

                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            int? aDisplayPicId = reader.IsDBNull(reader.GetOrdinal("attackerDp")) ? null : reader.GetInt32("attackerDp");
                            FileEntry? adpFileEntry = aDisplayPicId != null ? new FileEntry() { Id = (Int32)(aDisplayPicId) } : null;
                            int? originUserId = reader.IsDBNull(reader.GetOrdinal("origin_user_id")) ? (int?)null : reader.GetInt32("origin_user_id");
                            string? originUserName = reader.IsDBNull(reader.GetOrdinal("attackerUsername")) ? "Anonymous" : reader.GetString("attackerUsername");

                            int? dDisplayPicId = reader.IsDBNull(reader.GetOrdinal("defenderDp")) ? null : reader.GetInt32("defenderDp");
                            FileEntry? ddpFileEntry = dDisplayPicId != null ? new FileEntry() { Id = (Int32)(dDisplayPicId) } : null;
                            int? defenderUserId = reader.IsDBNull(reader.GetOrdinal("destination_user_id")) ? (int?)null : reader.GetInt32("destination_user_id");
                            string? defenderUserName = reader.IsDBNull(reader.GetOrdinal("defenderUsername")) ? "Anonymous" : reader.GetString("defenderUsername");

                            var battleOutcome = new NexusBattleOutcome
                            {
                                BattleId = reader.GetInt32("battle_id"),
                                OriginUser = new User(originUserId ?? 0, originUserName, null, adpFileEntry, null),
                                OriginCoordsX = reader.IsDBNull(reader.GetOrdinal("origin_coords_x")) ? 0 : reader.GetInt32("origin_coords_x"),
                                OriginCoordsY = reader.IsDBNull(reader.GetOrdinal("origin_coords_y")) ? 0 : reader.GetInt32("origin_coords_y"),
                                DestinationUser = new User(defenderUserId ?? 0, defenderUserName, null, ddpFileEntry, null),
                                DestinationCoordsX = reader.IsDBNull(reader.GetOrdinal("destination_coords_x")) ? 0 : reader.GetInt32("destination_coords_x"),
                                DestinationCoordsY = reader.IsDBNull(reader.GetOrdinal("destination_coords_y")) ? 0 : reader.GetInt32("destination_coords_y"),
                                Timestamp = reader.GetDateTime("timestamp"),
                                AttackingUnits = JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("attacking_units")) ?? new Dictionary<string, int?>(),
                                DefendingUnits = JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("defending_units")) ?? new Dictionary<string, int?>(),
                                AttackingLosses = JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("attacking_losses")) ?? new Dictionary<string, int?>(),
                                DefendingLosses = JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("defending_losses")) ?? new Dictionary<string, int?>(),
                                DefenderUnitsNotInVillage = reader.IsDBNull(reader.GetOrdinal("defender_units_not_in_village")) ? new Dictionary<string, int?>() : JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("defender_units_not_in_village")),
                                DefenderBuildingLevels = reader.IsDBNull(reader.GetOrdinal("defender_building_levels")) ? new Dictionary<string, int?>() : JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("defender_building_levels")),
                                DefenderGold = reader.IsDBNull(reader.GetOrdinal("defender_gold")) ? 0 : reader.GetDecimal("defender_gold"),
                                DefenderGoldStolen = reader.IsDBNull(reader.GetOrdinal("defender_gold_stolen")) ? 0 : reader.GetDecimal("defender_gold_stolen"),
                            };

                            battleReports.Add(battleOutcome);
                        }
                    }
                }

                foreach (var battleOutcome in battleReports)
                {
                    int attackingScouts = battleOutcome.AttackingUnits.GetValueOrDefault("scout") ?? 0;
                    int scoutLosses = battleOutcome.AttackingLosses.GetValueOrDefault("scout") ?? 0;
                    int scoutsSurvived = attackingScouts - scoutLosses;
                    double scoutsSurvivedPercentage = attackingScouts > 0 ? (double)scoutsSurvived / attackingScouts : 0;

                    // Fetch the scout level for the attacking base
                    int scoutLevel = 0;
                    if (battleOutcome.OriginCoordsX != 0 && battleOutcome.OriginCoordsY != 0)
                    {
                        string scoutLevelQuery = @"
                            SELECT scout_level
                            FROM nexus_bases
                            WHERE coords_x = @OriginCoordsX AND coords_y = @OriginCoordsY";

                        using (var scoutLevelCommand = new MySqlCommand(scoutLevelQuery, connection, transaction))
                        {
                            scoutLevelCommand.Parameters.AddWithValue("@OriginCoordsX", battleOutcome.OriginCoordsX);
                            scoutLevelCommand.Parameters.AddWithValue("@OriginCoordsY", battleOutcome.OriginCoordsY);

                            scoutLevel = Convert.ToInt32(await scoutLevelCommand.ExecuteScalarAsync());
                        }
                    }

                    if (scoutsSurvivedPercentage < 0.5 || (battleOutcome.DestinationUser?.Id != userId && battleOutcome.OriginUser?.Id != userId))
                    {
                        // Hide defending units
                        battleOutcome.DefendingUnits = new Dictionary<string, int?>();
                    }
                    else
                    {
                        if (!(scoutsSurvivedPercentage >= 0.5))
                        {
                            // Show defending units that are currently in the village
                            battleOutcome.DefendingUnits = new Dictionary<string, int?>();
                        }

                        if (!(scoutsSurvivedPercentage > 0.5 && scoutLevel >= 1))
                        {
                            // Add resources to the battle outcome
                            battleOutcome.DefenderGold = null; // Assuming you have a Resources property in NexusBattleOutcome
                        }

                        if (!(scoutsSurvivedPercentage > 0.7 && scoutLevel >= 2))
                        {
                            // Add building levels to the battle outcome
                            battleOutcome.DefenderBuildingLevels = new Dictionary<string, int?>(); // Assuming you have a BuildingLevels property in NexusBattleOutcome
                        }

                        if (!(scoutsSurvivedPercentage > 0.9 && scoutLevel >= 3))
                        {
                            // Add units not currently in the village to the battle outcome
                            battleOutcome.DefenderUnitsNotInVillage = new Dictionary<string, int?>(); // Assuming you have a UnitsNotInVillage property in NexusBattleOutcome
                        }
                    }
                }
                using (var totalReportsCommand = new MySqlCommand("SELECT FOUND_ROWS()", connection, transaction))
                {
                    totalReports = Convert.ToInt32(await totalReportsCommand.ExecuteScalarAsync());

                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception!:" + ex.Message);
                if (externalTransaction == null && transaction != null)
                {
                    await transaction.RollbackAsync();
                }
            }
            finally
            {

                if (externalTransaction == null && transaction != null)
                {
                    await transaction.CommitAsync();
                }
                if (externalConnection == null && connection != null)
                {
                    await connection.CloseAsync();
                }
            }
            return new NexusBattleOutcomeReports
            {
                BattleOutcomes = battleReports,
                CurrentPage = pageNumber,
                PageSize = pageSize,
                TotalReports = totalReports
            };
        }



        private async Task InsertBattleOutcome(NexusBattleOutcome battleOutcome, MySqlConnection? conn, MySqlTransaction? transaction)
        {
            Console.WriteLine("Creating a report");
            string sql = @"
                INSERT INTO nexus_battles 
                    (origin_user_id, origin_coords_x, origin_coords_y, destination_user_id, destination_coords_x, destination_coords_y, 
                    attacking_units, defending_units, attacking_losses, defending_losses, defender_units_not_in_village, defender_building_levels, defender_gold, defender_gold_stolen) 
                VALUES 
                    (@origin_user_id, @origin_coords_x, @origin_coords_y, @destination_user_id, @destination_coords_x, @destination_coords_y, 
                    @attacking_units, @defending_units, @attacking_losses, @defending_losses, @defender_units_not_in_village, @defender_building_levels, @defender_gold, @defender_gold_stolen);";

            var parameters = new Dictionary<string, object?>
            {
                { "@origin_user_id", battleOutcome.OriginUser != null ? battleOutcome.OriginUser.Id : DBNull.Value },
                { "@origin_coords_x", battleOutcome.OriginCoordsX },
                { "@origin_coords_y", battleOutcome.OriginCoordsY },
                { "@destination_user_id",  battleOutcome.DestinationUser != null ? battleOutcome.DestinationUser.Id : DBNull.Value },
                { "@destination_coords_x", battleOutcome.DestinationCoordsX },
                { "@destination_coords_y", battleOutcome.DestinationCoordsY },
                { "@attacking_units", JsonConvert.SerializeObject(battleOutcome.AttackingUnits) },
                { "@defending_units", JsonConvert.SerializeObject(battleOutcome.DefendingUnits) },
                { "@attacking_losses", JsonConvert.SerializeObject(battleOutcome.AttackingLosses) },
                { "@defending_losses", JsonConvert.SerializeObject(battleOutcome.DefendingLosses) },
                { "@defender_units_not_in_village", JsonConvert.SerializeObject(battleOutcome.DefenderUnitsNotInVillage) },
                { "@defender_building_levels", JsonConvert.SerializeObject(battleOutcome.DefenderBuildingLevels) },
                { "@defender_gold", battleOutcome.DefenderGold },
                { "@defender_gold_stolen", battleOutcome.DefenderGoldStolen },
            };

            await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
            //Console.WriteLine($"Report created");
        }
        [HttpPost("UpdateNexusUnitUpgradesCompletes")]
        public async Task UpdateNexusUnitUpgradesCompletes([FromBody] NexusBase nexus)
        {
            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            await conn.OpenAsync();
            MySqlTransaction transaction = await conn.BeginTransactionAsync();

            try
            {
                List<UnitStats> stats = await GetUnitStatsFromDB(null, null, conn, transaction);
                List<NexusUnitUpgrades>? upgrades = await GetNexusUnitUpgrades(nexus, conn, transaction);

                if (upgrades != null && stats.Count > 0)
                {
                    for (var x = 0; x < upgrades.Count; x++)
                    {
                        UnitStats stat = stats.First(stat => stat.UnitId == upgrades[x].UnitIdUpgraded);
                        int duration = stat.Duration;
                        int unitId = upgrades[x].UnitIdUpgraded;
                        int unitLevel = GetUnitLevelForUnit(nexus, unitId);
                        int upgradeDuration = await GetUpgradeDurationForUnit(unitLevel, unitId, conn, transaction);

                        string unitType = stat.UnitType ?? "";
                        TimeSpan timeElapsed = DateTime.Now - upgrades[x].Timestamp;
                        Console.WriteLine($"Checking {nexus.CoordsX}{nexus.CoordsX} unit upgrades. timeElapsed.TotalSeconds: {timeElapsed.TotalSeconds} Duration : {duration} ({timeElapsed.TotalSeconds - duration})");
                        if ((timeElapsed.TotalSeconds - duration) >= -3)
                        {
                            // Update unit level in nexus_bases table
                            string sqlUpdate = $@"
                                UPDATE nexus_bases 
                                SET {unitType}_level = {unitType}_level + 1 
                                WHERE coords_x = @CoordsX AND coords_y = @CoordsY;";

                            MySqlCommand cmdUpdate = new MySqlCommand(sqlUpdate, conn, transaction);
                            cmdUpdate.Parameters.AddWithValue("@CoordsX", upgrades[x].CoordsX);
                            cmdUpdate.Parameters.AddWithValue("@CoordsY", upgrades[x].CoordsY);
                            await cmdUpdate.ExecuteNonQueryAsync();

                            // Delete the completed upgrade from nexus_unit_upgrades
                            string sqlDelete = $@"
                                DELETE FROM nexus_unit_upgrades 
                                WHERE id = @Id;";

                            MySqlCommand cmdDelete = new MySqlCommand(sqlDelete, conn, transaction);
                            cmdDelete.Parameters.AddWithValue("@Id", upgrades[x].Id);
                            await cmdDelete.ExecuteNonQueryAsync();
                        }
                    }
                }
                await transaction.CommitAsync();
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "An error occurred while updating Nexus unit upgrades.");
                throw;
            }
            finally
            {
                await conn.CloseAsync();
            }
        }


        [HttpPost("UpdateNexusUnitTrainingCompletes")]
        public async Task UpdateNexusUnitTrainingCompletes([FromBody] NexusBase nexus)
        {
            //Console.WriteLine("Update Nexus Units Training Completed");

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            await conn.OpenAsync();
            MySqlTransaction transaction = await conn.BeginTransactionAsync();

            try
            {
                List<UnitStats> stats = await GetUnitStatsFromDB(null, null, conn, transaction);

                List<NexusUnitsPurchased>? purchased = await GetNexusUnitPurchases(nexus, conn, transaction);
                if (purchased != null && stats.Count > 0)
                {
                    for (var x = 0; x < purchased.Count; x++)
                    {
                        UnitStats stat = stats.First(stat => stat.UnitId == purchased[x].UnitIdPurchased);
                        int duration = stat.Duration * purchased[x].QuantityPurchased;
                        string unitType = stat.UnitType ?? "";
                        TimeSpan timeElapsed = DateTime.Now - purchased[x].Timestamp;
                        if ((timeElapsed.TotalSeconds - duration) >= -3)
                        {
                            //Console.WriteLine($"Inserting {unitType} with timeElapsed: {timeElapsed} and duration : {duration}... timeElapsed.TotalSeconds{timeElapsed.TotalSeconds} - duration : {timeElapsed.TotalSeconds - duration}");

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
                            //Console.WriteLine($"Updated Nexus Units {unitType}: {purchased[x].QuantityPurchased}");
                            await cmdDelete.ExecuteNonQueryAsync();
                        }

                    }
                }
                await transaction.CommitAsync();

            }
            catch (Exception ex)
            {

                await transaction.RollbackAsync();

                _logger.LogError(ex, "An error occurred while updating Nexus buildings.");
                throw;
            }
            finally
            {

                await conn.CloseAsync();

            }
        }

        private int GetUnitLevelForUnit(NexusBase nexus, int unitId)
        {
            switch (unitId)
            {
                case 6:
                    return nexus.MarineLevel;
                case 7:
                    return nexus.GoliathLevel;
                case 8:
                    return nexus.BattlecruiserLevel;
                case 9:
                    return nexus.WraithLevel;
                case 10:
                    return nexus.SiegeTankLevel;
                case 11:
                    return nexus.ScoutLevel;
                case 12:
                    return nexus.GlitcherLevel;
                default:
                    throw new ArgumentException($"Unknown unitId: {unitId}");
            }
        }

        private async Task<int> GetUpgradeDurationForUnit(int unitLevel, int unitId, MySqlConnection conn, MySqlTransaction transaction)
        {
            string sql = @"
                SELECT us.duration
                FROM nexus_unit_upgrade_stats us
                JOIN nexus_unit_stats s ON s.unit_level = us.unit_level
                WHERE s.unit_id = @UnitId AND us.unit_level = @UnitLevel;";

            MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
            cmd.Parameters.AddWithValue("@UnitId", unitId);
            cmd.Parameters.AddWithValue("@UnitLevel", unitLevel);

            object result = await cmd.ExecuteScalarAsync();
            if (result != null && int.TryParse(result.ToString(), out int duration))
            {
                return duration;
            }
            return 1; // Default duration if not found
        }

        private async Task<List<NexusUnitUpgrades>> GetNexusUnitUpgrades(NexusBase? nexus, MySqlConnection conn, MySqlTransaction transaction)
        {
            if (nexus == null) { return new List<NexusUnitUpgrades>(); }
            string query = @"
                SELECT 
                    id, 
                    coords_x, 
                    coords_y, 
                    unit_id_upgraded, 
                    timestamp 
                FROM 
                    nexus_unit_upgrades 
                WHERE 
                    coords_x = @CoordsX AND coords_y = @CoordsY;";

            MySqlCommand cmd = new MySqlCommand(query, conn, transaction);
            cmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
            cmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);

            List<NexusUnitUpgrades> upgrades = new List<NexusUnitUpgrades>();
            using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    NexusUnitUpgrades upgrade = new NexusUnitUpgrades
                    {
                        Id = reader.GetInt32("id"),
                        CoordsX = reader.GetInt32("coords_x"),
                        CoordsY = reader.GetInt32("coords_y"),
                        UnitIdUpgraded = reader.GetInt32("unit_id_upgraded"),
                        Timestamp = reader.GetDateTime("timestamp")
                    };
                    upgrades.Add(upgrade);
                }
            }
            return upgrades;
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
            //Console.WriteLine($"Updated Nexus Unit Purchases {unitId}: {unitsToAdd}");
            await cmdUpdate.ExecuteNonQueryAsync();
        }

        private async Task UpdateNexusGoldAndSupply(
            int coordsX,
            int coordsY,
            decimal? newGoldAmount,
            int? newSupplyAmount,
            MySqlConnection conn,
            MySqlTransaction transaction)
        {
            // Ensure either gold or supply is provided, but not both
            if (newGoldAmount == null && newSupplyAmount == null)
            {
                throw new ArgumentException("At least one of newGoldAmount or newSupplyAmount must be provided.");
            } 

            try
            {
                // Prepare the SQL update statement based on which parameters are provided
                string sqlUpdate = "UPDATE nexus_bases SET ";
                var parameters = new List<MySqlParameter>();

                if (newGoldAmount != null)
                {
                    sqlUpdate += "gold = @Gold ";
                    parameters.Add(new MySqlParameter("@Gold", newGoldAmount));
                }

                if (newSupplyAmount != null)
                {
                    if (sqlUpdate.Contains("@Gold"))
                    {
                        sqlUpdate += ", ";
                    }
                    sqlUpdate += "supply = @Supply ";
                    parameters.Add(new MySqlParameter("@Supply", newSupplyAmount));
                }

                sqlUpdate += "WHERE coords_x = @CoordsX AND coords_y = @CoordsY;";
                parameters.Add(new MySqlParameter("@CoordsX", coordsX));
                parameters.Add(new MySqlParameter("@CoordsY", coordsY));

                using (var cmdUpdate = new MySqlCommand(sqlUpdate, conn, transaction))
                {
                    // Add parameters to the command
                    cmdUpdate.Parameters.AddRange(parameters.ToArray());
                    Console.WriteLine(sqlUpdate);
                    Console.WriteLine($"Updated nexus at ({coordsX}, {coordsY}) - Gold: {newGoldAmount}, Supply: {newSupplyAmount}");
                    await cmdUpdate.ExecuteNonQueryAsync();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Exception : " + ex.Message);
            }
        }


        private async Task<(decimal currentGold, int supplyCapacity)> GetNexusGoldAndSupply(NexusBase request, MySqlConnection conn, MySqlTransaction transaction)
        {
            var res = ((decimal)0.0, 0);
            try
            {
                string sqlCurrentLevels = @"
                        SELECT 
                            n.supply_depot_level, n.gold, n.supply 
                        FROM 
                            nexus_bases n
                        WHERE 
                            coords_x = @CoordsX
                            AND coords_y = @CoordsY";

                using (MySqlCommand cmdLvl = new MySqlCommand(sqlCurrentLevels, conn, transaction))
                {
                    //Console.WriteLine("creating command for levels");
                    cmdLvl.Parameters.AddWithValue("@CoordsX", request.CoordsX);
                    cmdLvl.Parameters.AddWithValue("@CoordsY", request.CoordsY);
                    using (var readerCurrentLevels = await cmdLvl.ExecuteReaderAsync())
                    {
                        if (await readerCurrentLevels.ReadAsync())
                        {
                            int supplyCapacity = readerCurrentLevels.GetInt32("supply_depot_level") * 2500;
                            decimal currentGold = readerCurrentLevels.GetDecimal("gold");
                            //Console.WriteLine($"Got current supplyCapacity {supplyCapacity} and currentGold: {currentGold}");
                            res = (currentGold, supplyCapacity);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reading current levels: {ex.Message}");
                throw;
            }

            return res;
        }


        private async Task<int> CalculateUsedNexusSupply(NexusBase? nexus, MySqlConnection conn, MySqlTransaction transaction)
        {
            int res = 0;
            if (nexus == null || nexus.User == null ||nexus.User?.Id == 0) return res;
            try
            {
                string sqlCurrentSupply = @"
            SELECT 
                u.marine_total,
                u.goliath_total,
                u.siege_tank_total,
                u.wraith_total,
                u.scout_total,
                u.battlecruiser_total,
                u.glitcher_total,
                COALESCE(marines.supply, 0) AS marines_supply,
                COALESCE(goliaths.supply, 0) AS goliaths_supply,
                COALESCE(siege_tanks.supply, 0) AS siege_tanks_supply,
                COALESCE(scouts.supply, 0) AS scouts_supply,
                COALESCE(wraiths.supply, 0) AS wraiths_supply,
                COALESCE(battlecruisers.supply, 0) AS battlecruisers_supply,
                COALESCE(glitchers.supply, 0) AS glitchers_supply,
                COALESCE(marine_purchased.total, 0) AS marine_purchased,
                COALESCE(goliath_purchased.total, 0) AS goliath_purchased,
                COALESCE(siege_tank_purchased.total, 0) AS siege_tank_purchased,
                COALESCE(scout_purchased.total, 0) AS scout_purchased,
                COALESCE(wraith_purchased.total, 0) AS wraith_purchased,
                COALESCE(battlecruiser_purchased.total, 0) AS battlecruiser_purchased,
                COALESCE(glitcher_purchased.total, 0) AS glitcher_purchased
            FROM 
                nexus_units u
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 6
                ) AS marines ON 1=1
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 7
                ) AS goliaths ON 1=1
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 8
                ) AS battlecruisers ON 1=1
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 9
                ) AS wraiths ON 1=1
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 11
                ) AS scouts ON 1=1
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 10
                ) AS siege_tanks ON 1=1 
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 12
                ) AS glitchers ON 1=1
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS marine_purchased ON marine_purchased.unit_id_purchased = 6
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS goliath_purchased ON goliath_purchased.unit_id_purchased = 7
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS siege_tank_purchased ON siege_tank_purchased.unit_id_purchased = 10
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS scout_purchased ON scout_purchased.unit_id_purchased = 11
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS wraith_purchased ON wraith_purchased.unit_id_purchased = 9
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS battlecruiser_purchased ON battlecruiser_purchased.unit_id_purchased = 8
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS glitcher_purchased ON glitcher_purchased.unit_id_purchased = 12
            WHERE 
                u.coords_x = @CoordsX 
            AND u.coords_y = @CoordsY;
        ";

                using (MySqlCommand cmdCurrentSupply = new MySqlCommand(sqlCurrentSupply, conn, transaction))
                {
                    cmdCurrentSupply.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
                    cmdCurrentSupply.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);

                    using (var readerCurrentSupply = await cmdCurrentSupply.ExecuteReaderAsync())
                    {
                        if (!await readerCurrentSupply.ReadAsync())
                        { 
                            await readerCurrentSupply.CloseAsync();
                            return 0;
                        }

                        int marinesTotal = readerCurrentSupply.GetInt32("marine_total");
                        int goliathTotal = readerCurrentSupply.GetInt32("goliath_total");
                        int siegeTankTotal = readerCurrentSupply.GetInt32("siege_tank_total");
                        int scoutTotal = readerCurrentSupply.GetInt32("scout_total");
                        int wraithTotal = readerCurrentSupply.GetInt32("wraith_total");
                        int battleCruiserTotal = readerCurrentSupply.GetInt32("battlecruiser_total");
                        int glitcherTotal = readerCurrentSupply.GetInt32("glitcher_total");

                        // Get the supply for each unit type
                        int marinesSupply = readerCurrentSupply.GetInt32("marines_supply");
                        int goliathSupply = readerCurrentSupply.GetInt32("goliaths_supply");
                        int siegeTankSupply = readerCurrentSupply.GetInt32("siege_tanks_supply");
                        int scoutSupply = readerCurrentSupply.GetInt32("scouts_supply");
                        int wraithSupply = readerCurrentSupply.GetInt32("wraiths_supply");
                        int battleCruiserSupply = readerCurrentSupply.GetInt32("battlecruisers_supply");
                        int glitcherSupply = readerCurrentSupply.GetInt32("glitchers_supply");

                        // Calculate the total supply usage
                        res = (marinesTotal + readerCurrentSupply.GetInt32("marine_purchased")) * marinesSupply +
                              (goliathTotal + readerCurrentSupply.GetInt32("goliath_purchased")) * goliathSupply +
                              (siegeTankTotal + readerCurrentSupply.GetInt32("siege_tank_purchased")) * siegeTankSupply +
                              (scoutTotal + readerCurrentSupply.GetInt32("scout_purchased")) * scoutSupply +
                              (wraithTotal + readerCurrentSupply.GetInt32("wraith_purchased")) * wraithSupply +
                              (battleCruiserTotal + readerCurrentSupply.GetInt32("battlecruiser_purchased")) * battleCruiserSupply +
                              (glitcherTotal + readerCurrentSupply.GetInt32("glitcher_purchased")) * glitcherSupply;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
            }
            return res;
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

        private async Task<IActionResult> UpgradeBuilding(User user, string component, NexusBase? nexus)
        {
            Console.WriteLine($"UpgradeBuilding -> Upgrading: {component} ({user.Id})");
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
                    // first check if the upgrade was already started, if it has then return an error.
                    NexusBaseUpgrades? currentUpgrades = await GetNexusBaseUpgrades(nexus, conn, transaction);
                    if (((component == "command_center") && (currentUpgrades != null) && (currentUpgrades.CommandCenterUpgraded != null))
                        || ((component == "supply_depot") && (currentUpgrades != null) && (currentUpgrades.SupplyDepotUpgraded != null))
                        || ((component == "engineering_bay") && (currentUpgrades != null) && (currentUpgrades.EngineeringBayUpgraded != null))
                        || ((component == "warehouse") && (currentUpgrades != null) && (currentUpgrades.WarehouseUpgraded != null))
                        || ((component == "mines") && (currentUpgrades != null) && (currentUpgrades.MinesUpgraded != null))
                        || ((component == "factory") && (currentUpgrades != null) && (currentUpgrades.FactoryUpgraded != null))
                        || ((component == "starport") && (currentUpgrades != null) && (currentUpgrades.StarportUpgraded != null))
                        )
                    {
                        await transaction.RollbackAsync();
                        return BadRequest("Component upgrade is already queued."); 
                    }
                    await RecalculateNexusGold(conn, nexus, transaction);
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
                        WHERE coords_x = @CoordsX AND coords_y = @CoordsY AND user_id = @UserId
                        LIMIT 1;";
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
                    Console.WriteLine("Got current gold : " + currentGold);
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
                        AND coords_y = @CoordsY
                        LIMIT 1;";
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
                            AND user_id = @UserId
                        LIMIT 1;";
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

        private async Task<long?> ExecuteInsertOrUpdateOrDeleteAsync(string sql, Dictionary<string, object?> parameters, MySqlConnection? connection = null, MySqlTransaction? transaction = null)
        {
            string cmdText = "";
            bool createdConnection = false;
            long? insertedId = null;

            try
            {
                //Console.Write("... Executing Insert/Update/Delete!");

                if (connection == null)
                {
                    connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                    await connection.OpenAsync();
                    createdConnection = true;
                }

                using (MySqlCommand cmdUpdate = new MySqlCommand(sql, connection, transaction))
                {
                    // Add parameters to the command
                    foreach (var param in parameters)
                    {
                        cmdUpdate.Parameters.AddWithValue(param.Key, param.Value);
                    }
                    cmdText = cmdUpdate.CommandText;
                    await cmdUpdate.ExecuteNonQueryAsync();

                    // Get the last inserted ID if it's an insert command
                    if (sql.Trim().StartsWith("INSERT", StringComparison.OrdinalIgnoreCase))
                    {
                        insertedId = cmdUpdate.LastInsertedId;
                    }

                    //Console.Write(" ...Update executed successfully!");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while executing update");
                Console.WriteLine("Update ERROR: " + ex.Message);
                Console.WriteLine(cmdText);
                foreach (var param in parameters)
                {
                    Console.WriteLine("Param: " + param.Key + ": " + param.Value);
                }
            }
            finally
            {
                if (createdConnection && connection != null)
                {
                    await connection.CloseAsync();
                }
            }
            return insertedId;
        }

    }
}
