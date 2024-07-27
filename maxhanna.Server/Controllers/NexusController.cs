using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using SixLabors.ImageSharp.Formats;

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

            if (req.Nexus == null)
            {
                req.Nexus = await GetUserFirstBase(req.User);
            }
            await UpdateNexus(req.Nexus);
            NexusBase? nexusBase = await GetNexusBase(req.Nexus?.CoordsX, req.Nexus?.CoordsY); 
            NexusBaseUpgrades? nexusBaseUpgrades = await GetNexusBaseUpgrades(nexusBase);
            NexusUnits? nexusUnits = await GetNexusUnits(nexusBase, false);
            List<NexusUnitsPurchased>? nexusUnitPurchasesList = await GetNexusUnitPurchases(nexusBase);
            List<NexusAttackSent>? nexusAttacksSent = await GetNexusAttacksSent(nexusBase);
            List<NexusAttackSent>? nexusAttacksIncoming = await GetNexusAttacksIncoming(nexusBase, false);
            decimal miningSpeed = await GetMiningSpeedForNexus(nexusBase);
            var availableUpgrades = await GetBuildingUpgradeList(nexusBase);

            NexusBattleOutcomeReports? battleReports = null;
            if (nexusBase != null && nexusBase.User != null)
            {
                battleReports = await GetAllBattleReports(nexusBase.User.Id, null, 1, 5);
            } 


            return Ok(
                new
                {
                    nexusBase = nexusBase ?? new NexusBase(),
                    nexusBaseUpgrades = nexusBaseUpgrades ?? new NexusBaseUpgrades(),
                    nexusUnits = nexusUnits ?? new NexusUnits(),
                    nexusUnitsPurchasedList = nexusUnitPurchasesList ?? new List<NexusUnitsPurchased>(),
                    nexusAttacksSent,
                    nexusAttacksIncoming,
                    miningSpeed,
                    availableUpgrades,
                    battleReports,
                });
        }

        private async Task UpdateNexus(NexusBase? nexusBase)
        { 
            nexusBase = await GetNexusBase(nexusBase?.CoordsX, nexusBase?.CoordsY);
            Console.WriteLine($"Got nexusBase: {nexusBase?.CoordsX ?? 0}:{nexusBase?.CoordsY ?? 0}");
            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                try
                {
                    await conn.OpenAsync();
                    if (nexusBase == null)
                    {
                        return;
                    }

                    MySqlTransaction transaction = await conn.BeginTransactionAsync();

                    try
                    {
                        if (nexusBase != null && nexusBase.Gold < (5000 * (nexusBase.WarehouseLevel + 1)))
                        {
                            await UpdateNexusGold(conn, nexusBase, transaction);
                        }
                        if (nexusBase != null)
                        {
                            await UpdateNexusBuildings(conn, nexusBase, transaction);
                            await UpdateNexusUnitTrainingCompletes(nexusBase, conn, transaction);
                            await UpdateNexusAttacks(nexusBase);
                        }
                        // Commit the transaction
                        await transaction.CommitAsync();
                    }
                    catch (Exception)
                    {
                        await transaction.RollbackAsync();
                        throw;
                    }

                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "An error occurred while processing the GET request."); 
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
                        n.user_id, u.username, n.coords_x, n.coords_y, udp.file_id
                    FROM 
                        maxhanna.nexus_bases n
                    LEFT JOIN 
                        maxhanna.users u on u.id = n.user_id
                    LEFT JOIN 
                        maxhanna.user_display_pictures udp on udp.user_id = n.user_id;";


                MySqlCommand cmd = new MySqlCommand(sql, conn);

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
                        tmpBase.User =
                            new User(reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32(reader.GetOrdinal("user_id")),
                                reader.IsDBNull(reader.GetOrdinal("username")) ? "Anonymous" : reader.GetString(reader.GetOrdinal("username")),
                                null,
                                dp,
                                null);
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


        [HttpPost("/Nexus/GetBattleReports", Name = "GetBattleReports")]
        public async Task<IActionResult> GetBattleReportsByUser([FromBody] BattleReportRequest request)
        {
            Console.WriteLine($"POST /Nexus/GetBattleReports for player {request.User.Id} targetBase: {request.TargetBase?.CoordsX},{request.TargetBase?.CoordsY} ");
            var paginatedReports = await GetAllBattleReports(request.User.Id, request.TargetBase, request.PageNumber, request.PageSize);
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
            return Ok(await GetMiningSpeedForNexus(request.Nexus));
        }

        private async Task<decimal> GetMiningSpeedForNexus(NexusBase? nexusBase)
        {
            if (nexusBase  == null)
            {
                return 0;
            }
            decimal speed = Decimal.One;
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
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"An error occurred while GetMinesInfo");
            }
            finally
            {
                await conn.CloseAsync();
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
                            int currentSupplyUsed = await CalculateUsedNexusSupply(request, conn, transaction);
                            Console.WriteLine("Got Nexus's Supply Used: " + currentSupplyUsed);

                            // Fetch Nexus's current gold and supply capacity
                            var (currentGold, supplyCapacity) = await GetNexusGoldAndSupply(request, conn, transaction);

                            // Fetch unit cost and type
                            List<UnitStats> unitStats = await GetUnitStatsFromDB(request.UnitId, null);
                            if (unitStats == null || unitStats.Count <= 0)
                            {
                                return NotFound("Unit base not found.");
                            }
                            UnitStats unit = unitStats.First(x => x.UnitId == request.UnitId);

                            int unitCost = unit.Cost;
                            int unitSupply = unit.Supply;
                            string unitType = unit.UnitType ?? "";

                            Console.WriteLine($"Unit purchased: {unitType}, unitSupply: {unitSupply}, unitCost: {unitCost}, goldBefore : {currentGold} totalCost: {unitCost * request.PurchaseAmount}");

                            // Calculate new gold and supply after purchase
                            currentGold -= (unitCost * request.PurchaseAmount);
                            var supplyCost = (unitSupply * request.PurchaseAmount);
                            supplyCapacity -= (supplyCost + currentSupplyUsed);

                            Console.WriteLine($"After Unit purchased: {unitType}, supplyCapacity: {supplyCapacity}, currentGold: {currentGold}, supplyCost: {supplyCost}");

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
            var availableUpgrades = await GetBuildingUpgradeList(request.Nexus);

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

        [HttpPost("/Nexus/Engage", Name = "Engage")]
        public async Task<IActionResult> Engage([FromBody] NexusEngagementRequest req)
        {
            Console.WriteLine($"POST /Nexus/Engage for player ({req.User.Id}, distance: {req.DistanceTimeInSeconds})");
            if (req.DistanceTimeInSeconds == 0) { return BadRequest("Distance time must be greater then 0!"); }
            if (req.OriginNexus == null) { return BadRequest("Origin must be defined!"); }
            if (req.DestinationNexus == null) { return BadRequest("Destination must be defined!"); }
            //first check if units being sent are valid
            NexusUnits? originNexusUnits = await GetNexusUnits(req.OriginNexus, true);
            if (originNexusUnits == null)
            {
                Console.WriteLine("No player units found?");
                return BadRequest("Player units not found!");
            }
            Console.WriteLine($@"Checking if base has enough units to send the attack.");
            bool canSend = await DoesBaseHaveEnoughUnitsToSendAttack(req.OriginNexus, originNexusUnits, null, true);
            if (canSend)
            {
                Console.WriteLine("Sending the attack...");
                await SendAttack(req.OriginNexus, req.DestinationNexus, req.UnitList, req.DistanceTimeInSeconds);
            } else
            {
                Console.WriteLine("Not enough units.");
                return BadRequest("Not enough units.");
            }
            
            return Ok($"Attack sent to { "{" + req.DestinationNexus.CoordsX + "," + req.DestinationNexus.CoordsY + "}" }");
        }

        private async Task<List<Object>> GetBuildingUpgradeList(NexusBase? nexusBase)
        {
            var availableUpgrades = new List<Object>();

            if (nexusBase == null) return availableUpgrades;
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
                MySqlCommand cmdUpgradeTimestamps = new MySqlCommand(sqlUpgradeTimestamps, conn);
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
            finally
            {
                await conn.CloseAsync();
            }

            return availableUpgrades;
        }
        private async Task SendAttack(NexusBase OriginNexus, NexusBase DestinationNexus, UnitStats[] UnitList, int DistanceTimeInSeconds)
        {
            Console.WriteLine("SendAttack...");
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
                    (origin_coords_x, origin_coords_y, destination_coords_x, destination_coords_y, marine_total, goliath_total, siege_tank_total, scout_total, wraith_total, battlecruiser_total, glitcher_total, duration)
                VALUES
                    (@OriginX, @OriginY, @DestinationX, @DestinationY, @Marine, @Goliath, @SiegeTank, @Scout, @Wraith, @Battlecruiser, @Glitcher, @Duration);";

            var parameters = new Dictionary<string, object?>
            {
                { "@OriginX", OriginNexus.CoordsX },
                { "@OriginY", OriginNexus.CoordsY },
                { "@DestinationX", DestinationNexus.CoordsX },
                { "@DestinationY", DestinationNexus.CoordsY },
                { "@Duration", DistanceTimeInSeconds },
                { "@Marine", marinesSent },
                { "@Goliath", goliathSent },
                { "@SiegeTank", siegeTankSent },
                { "@Scout", scoutSent },
                { "@Wraith", wraithSent },
                { "@Battlecruiser", battlecruiserSent },
                { "@Glitcher", glitcherSent },
            };

            await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters);
            Console.WriteLine("Attack sent");
        }

        private async Task DeleteAttack(NexusBase OriginNexus, NexusBase DestinationNexus, DateTime timestamp, int DistanceTimeInSeconds)
        {
            Console.WriteLine($"Deleting NexusAttack from {OriginNexus.CoordsX},{OriginNexus.CoordsY} sent on {DestinationNexus.CoordsX},{DestinationNexus.CoordsY}; Timestamp: {timestamp}, DistanceInSeconds: {DistanceTimeInSeconds}");

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

            await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters);
            Console.WriteLine("NexusAttack deleted");
        } 
        private async Task<List<NexusAttackSent>?> GetNexusAttacksSent(NexusBase? nexusBase)
        {
            List<NexusAttackSent>? attacks = null;
            if (nexusBase == null) return attacks;

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                try
                {
                    await conn.OpenAsync();

                    string sql = "SELECT * FROM maxhanna.nexus_attacks_sent WHERE origin_coords_x = @OriginX AND origin_coords_y = @OriginY;";

                    MySqlCommand sqlCmd = new MySqlCommand(sql, conn);
                    sqlCmd.Parameters.AddWithValue("@OriginX", nexusBase.CoordsX);
                    sqlCmd.Parameters.AddWithValue("@OriginY", nexusBase.CoordsY);
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
                                OriginCoordsX = reader.GetInt32(reader.GetOrdinal("origin_coords_x")),
                                OriginCoordsY = reader.GetInt32(reader.GetOrdinal("origin_coords_y")),
                                DestinationCoordsX = reader.GetInt32(reader.GetOrdinal("destination_coords_x")),
                                DestinationCoordsY = reader.GetInt32(reader.GetOrdinal("destination_coords_y")),
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
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"An error occurred while GetNexusAttacksSent");
                }
                finally
                {
                    await conn.CloseAsync();
                }
            }

            return attacks;
        }

        private async Task<List<NexusAttackSent>?> GetNexusAttacksIncoming(NexusBase? nexusBase, bool withUnits)
        {
            List<NexusAttackSent>? attacks = null;
            if (nexusBase == null) return attacks;
            Console.WriteLine($"GetNexusAttacksIncoming {nexusBase.CoordsX}, {nexusBase.CoordsY}");
            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                try
                {
                    await conn.OpenAsync();

                    string sql = "SELECT * FROM maxhanna.nexus_attacks_sent WHERE destination_coords_x = @OriginX AND destination_coords_x = @OriginY;";

                    MySqlCommand sqlCmd = new MySqlCommand(sql, conn);
                    sqlCmd.Parameters.AddWithValue("@OriginX", nexusBase.CoordsX);
                    sqlCmd.Parameters.AddWithValue("@OriginY", nexusBase.CoordsY);
                    using (var reader = await sqlCmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            if (attacks == null)
                            {
                                attacks = new List<NexusAttackSent>();
                            }
                            if (withUnits)
                            {
                                attacks.Add(new NexusAttackSent
                                {
                                    OriginCoordsX = reader.GetInt32(reader.GetOrdinal("origin_coords_x")),
                                    OriginCoordsY = reader.GetInt32(reader.GetOrdinal("origin_coords_y")),
                                    DestinationCoordsX = reader.GetInt32(reader.GetOrdinal("destination_coords_x")),
                                    DestinationCoordsY = reader.GetInt32(reader.GetOrdinal("destination_coords_y")),
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
                            else
                            {
                                attacks.Add(new NexusAttackSent
                                {
                                    OriginCoordsX = reader.GetInt32(reader.GetOrdinal("origin_coords_x")),
                                    OriginCoordsY = reader.GetInt32(reader.GetOrdinal("origin_coords_y")),
                                    DestinationCoordsX = reader.GetInt32(reader.GetOrdinal("destination_coords_x")),
                                    DestinationCoordsY = reader.GetInt32(reader.GetOrdinal("destination_coords_y")), 
                                    Duration = reader.IsDBNull(reader.GetOrdinal("duration")) ? 0 : reader.GetInt32("duration"),
                                    Timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp")) ? DateTime.Now : reader.GetDateTime("timestamp"),
                                });
                            }
                            
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"An error occurred while GetNexusAttacksIncoming");
                }
                finally
                {
                    await conn.CloseAsync();
                }
            }

            return attacks;
        }

        private async Task UpdateNexusUnits(NexusBase nexusBase, int marinesTotal, int goliathTotal, int siegeTankTotal, int scoutTotal, int wraithTotal, int battlecruiserTotal, int glitcherTotal)
        {
            Console.WriteLine("UpdateNexusUnits...");
           
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
                { "@Marine", marinesTotal },
                { "@Goliath", goliathTotal },
                { "@SiegeTank", siegeTankTotal },
                { "@Scout", scoutTotal },
                { "@Wraith", wraithTotal },
                { "@Battlecruiser", battlecruiserTotal },
                { "@Glitcher", glitcherTotal }
            };

            await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters);
            Console.WriteLine($"Updated Nexus Units!");

        }
        private async Task UpdateNexusSupply(NexusBase nexusBase, int? supply)
        {
            Console.WriteLine("UpdateNexusSupply...");

            if (supply != null)
            {
                string sql = @"
                UPDATE maxhanna.nexus_bases
                SET 
                    supply = @Supply 
                WHERE 
                    coords_x = @CoordsX 
                AND coords_y = @CoordsY
                LIMIT 1;";

                var parameters = new Dictionary<string, object?>
                {
                    { "@CoordsX", nexusBase.CoordsX },
                    { "@CoordsY", nexusBase.CoordsY },
                    { "@Supply", supply }
                };

                await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters);
                Console.WriteLine("Nexus Supply updated.");
            } else
            {
                Console.WriteLine("Supply passed was null... skipping!"); 
            }
            return;
        }


        private async Task<bool> DoesBaseHaveEnoughUnitsToSendAttack(NexusBase originNexus, NexusUnits? playerUnits, UnitStats[]? unitsSent, bool skipAttackingUnits)
        {
            List<NexusAttackSent>? attackingUnits = null;
            if (!skipAttackingUnits)
            {
                attackingUnits = await GetNexusAttacksSent(originNexus);
            }
            if (playerUnits == null || !DoesBaseContainUnits(playerUnits))
            {
                Console.WriteLine("Determined an empty base");
                return false;
            }
            else
            { 
                CalculateUnitsAvailableAtBase(playerUnits, unitsSent, attackingUnits, out int marinesTotal, out int goliathTotal, out int siegeTankTotal, out int scoutTotal, out int wraithTotal, out int battlecruiserTotal, out int glitcherTotal);
                return (marinesTotal >= 0 && goliathTotal >= 0 && siegeTankTotal >= 0 && scoutTotal >= 0 && wraithTotal >= 0 && battlecruiserTotal >= 0 && glitcherTotal >= 0);
            }
        }

        private static void CalculateUnitsAvailableAtBase(NexusUnits playerUnits, UnitStats[]? unitsSent, List<NexusAttackSent>? attackingUnits, 
            out int marinesTotal, out int goliathTotal, out int siegeTankTotal, out int scoutTotal, out int wraithTotal, out int battlecruiserTotal, out int glitcherTotal)
        { 
            marinesTotal = (playerUnits.MarineTotal ?? 0);
            goliathTotal = (playerUnits.GoliathTotal ?? 0);
            siegeTankTotal = (playerUnits.SiegeTankTotal ?? 0);
            scoutTotal = (playerUnits.ScoutTotal ?? 0);
            wraithTotal = (playerUnits.WraithTotal ?? 0);
            battlecruiserTotal = (playerUnits.BattlecruiserTotal ?? 0);
            glitcherTotal = (playerUnits.GlitcherTotal ?? 0);
            if (playerUnits == null) {
                Console.WriteLine("No player units, returning");
                return;
            };
            Console.WriteLine($"Got these units at base : m:{marinesTotal} g:{goliathTotal} st:{siegeTankTotal} s:{scoutTotal} w:{wraithTotal} b:{battlecruiserTotal} gl:{glitcherTotal}");



            if (unitsSent != null)
            {
                marinesTotal -= (unitsSent?.First(x => x.UnitType == "marine").SentValue ?? 0);
                goliathTotal -= (unitsSent?.First(x => x.UnitType == "goliath").SentValue ?? 0);
                siegeTankTotal -= (unitsSent?.First(x => x.UnitType == "siege_tank").SentValue ?? 0);
                scoutTotal -= (unitsSent?.First(x => x.UnitType == "scout").SentValue ?? 0);
                wraithTotal -= (unitsSent?.First(x => x.UnitType == "wraith").SentValue ?? 0);
                battlecruiserTotal -= (unitsSent?.First(x => x.UnitType == "battlecruiser").SentValue ?? 0);
                glitcherTotal -= (unitsSent?.First(x => x.UnitType == "glitcher").SentValue ?? 0);
                Console.WriteLine($"Got these units at base after substracting sent units: m:{marinesTotal} g:{goliathTotal} st:{siegeTankTotal} s:{scoutTotal} w:{wraithTotal} b:{battlecruiserTotal} gl:{glitcherTotal}");
            }


            if (attackingUnits != null)
            {
                foreach (var attackingUnit in attackingUnits)
                {
                    if (attackingUnit.MarineTotal.HasValue)
                    {
                        marinesTotal -= attackingUnit.MarineTotal.Value;
                    }
                    if (attackingUnit.GoliathTotal.HasValue)
                    {
                        goliathTotal -= attackingUnit.GoliathTotal.Value;
                    }
                    if (attackingUnit.SiegeTankTotal.HasValue)
                    {
                        siegeTankTotal -= attackingUnit.SiegeTankTotal.Value;
                    }
                    if (attackingUnit.ScoutTotal.HasValue)
                    {
                        scoutTotal -= attackingUnit.ScoutTotal.Value;
                    }
                    if (attackingUnit.WraithTotal.HasValue)
                    {
                        wraithTotal -= attackingUnit.WraithTotal.Value;
                    }
                    if (attackingUnit.BattlecruiserTotal.HasValue)
                    {
                        battlecruiserTotal -= attackingUnit.BattlecruiserTotal.Value;
                    }
                    if (attackingUnit.GlitcherTotal.HasValue)
                    {
                        glitcherTotal -= attackingUnit.GlitcherTotal.Value;
                    }
                }
                Console.WriteLine($"Got these units at base after substracting attacking units: m:{marinesTotal} g:{goliathTotal} st:{siegeTankTotal} s:{scoutTotal} w:{wraithTotal} b:{battlecruiserTotal} gl:{glitcherTotal}");
            }

        }

        private static bool DoesBaseContainUnits(NexusUnits playerUnits)
        {
            return !(playerUnits.MarineTotal == 0 && playerUnits.GoliathTotal == 0 && playerUnits.SiegeTankTotal == 0 
                && playerUnits.ScoutTotal == 0 && playerUnits.WraithTotal == 0 && playerUnits.BattlecruiserTotal == 0 && playerUnits.GlitcherTotal == 0);
        }

        private async Task<List<UnitStats>> GetUnitStatsFromDB(int? unitId, string? unitType)
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

                    using (MySqlCommand cmd = new MySqlCommand(sql, conn))
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
                    await conn.CloseAsync();
                }
            }
            return unitStats;
        }

        private async Task<NexusBase?> GetNexusBase(int? coordsX, int? coordsY)
        {
            Console.WriteLine($"GetNexusBase {coordsX}:{coordsY}");
            NexusBase? nexusBase = null;

            if (coordsX == null || coordsY == null) return nexusBase;

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                try
                {
                    await conn.OpenAsync();
                    string sqlBase = "SELECT * FROM nexus_bases WHERE coords_x = @CoordsX AND coords_y = @CoordsY";
                    MySqlCommand cmdBase = new MySqlCommand(sqlBase, conn);
                    cmdBase.Parameters.AddWithValue("@CoordsX", coordsX);
                    cmdBase.Parameters.AddWithValue("@CoordsY", coordsY);

                    using (var readerBase = await cmdBase.ExecuteReaderAsync())
                    {
                        if (await readerBase.ReadAsync())
                        {
                            nexusBase = new NexusBase
                            {
                                User = new User(readerBase.GetInt32("user_id"), "Anonymous"),
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
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"An error occurred while GetNexusBase");
                }
                finally
                {
                    await conn.CloseAsync();
                }
            }


            return nexusBase;
        }

        private async Task<NexusBaseUpgrades?> GetNexusBaseUpgrades(NexusBase? nexusBase)
        {
            NexusBaseUpgrades? nexusBaseUpgrades = null;
            if (nexusBase == null) { return nexusBaseUpgrades; }

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                try
                {
                    await conn.OpenAsync();
                    string sqlUpgrades = @"
                            SELECT * 
                            FROM nexus_base_upgrades 
                            WHERE 
                                coords_x = @CoordsX 
                            AND coords_y = @CoordsY";
                    MySqlCommand cmdUpgrades = new MySqlCommand(sqlUpgrades, conn);
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
                finally
                {
                    await conn.CloseAsync();
                }
            }

            return nexusBaseUpgrades;
        }

        private async Task<NexusUnits?> GetNexusUnits(NexusBase? nexusBase, bool currentlyInBase)
        {
            NexusUnits? nexusUnits = null;
            if (nexusBase == null) return nexusUnits; 

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                try
                {
                    await conn.OpenAsync();
                    string sqlUnits = @"
                            SELECT * 
                            FROM nexus_units 
                            WHERE 
                                coords_x = @CoordsX 
                            AND coords_y = @CoordsY";
                    MySqlCommand cmdUnits = new MySqlCommand(sqlUnits, conn);
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
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"An error occurred while GetNexusUnits");
                }
                finally
                {
                    await conn.CloseAsync();
                }

                if (currentlyInBase && nexusUnits != null)
                {
                    List<NexusAttackSent>? nexusAttackSents = await GetNexusAttacksSent(nexusBase);
                    
                    CalculateUnitsAvailableAtBase(nexusUnits, null, nexusAttackSents, out int marinesTotal, out int goliathTotal, 
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
            return nexusUnits;
        } 

        private async Task<List<NexusUnitsPurchased>?> GetNexusUnitPurchases(NexusBase? nexusBase)
        {
            if (nexusBase == null)
            {
                return new List<NexusUnitsPurchased>();
            }
            var res = new List<NexusUnitsPurchased>();

            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                try
                {
                    await conn.OpenAsync();
                    string sqlUnitPurchases = @"
                            SELECT * 
                            FROM nexus_unit_purchases 
                            WHERE 
                                coords_x = @CoordsX 
                            AND coords_y = @CoordsY";
                    MySqlCommand cmdUnitPurchases = new MySqlCommand(sqlUnitPurchases, conn);
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
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"An error occurred while GetNexusUnitPurchases");
                }
                finally
                {
                    await conn.CloseAsync();
                }
            }
            return res;
        }

        private async Task<NexusBase?> GetUserFirstBase(User user)
        {
            Console.WriteLine($"Get User first base for user id {user.Id}");
            NexusBase? tmpBase = null;
            MySqlConnection conn1 = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                await conn1.OpenAsync();

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
            finally
            {
                await conn1.CloseAsync();
            }
            return tmpBase;
        }

        private async Task UpdateNexusGold(MySqlConnection conn, NexusBase nexusBase, MySqlTransaction transaction)
        {
            decimal newGoldAmount = 0;
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

                    newGoldAmount = nexusBase.Gold + Math.Abs(goldEarned);
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
                                    int duration = Convert.ToInt32(durationResult);
                                    TimeSpan timeElapsed = DateTime.Now - upgradeStart.Value;
                                    Console.WriteLine($"duration result: {duration}, timeELapsed in seconds: {timeElapsed.TotalSeconds} : ({duration - timeElapsed.TotalSeconds})");
                                    if ((duration - timeElapsed.TotalSeconds) <= 3)
                                    {
                                        Console.WriteLine($"Time elapsed expired on {buildingName}");
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
                                        string resetUpgradeSql = $@"
                                            UPDATE nexus_base_upgrades 
                                            SET {upgradeStartColumn} = NULL 
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

        private async Task UpdateNexusAttacks(NexusBase nexus)
        {
            Console.WriteLine("Update Nexus Attacks");

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

                List<NexusAttackSent>? attacks = (await GetNexusAttacksIncoming(nexus, true)) ?? new List<NexusAttackSent>();
                List<NexusAttackSent>? attacks2 = (await GetNexusAttacksSent(nexus)) ?? new List<NexusAttackSent>();
                attacks = attacks.Concat(attacks2).ToList();

                if (attacks != null && attacks.Count > 0)
                {
                    for (var attackIndex = 0; attackIndex < attacks.Count; attackIndex++)
                    {
                        TimeSpan timeElapsed = DateTime.Now - attacks[attackIndex].Timestamp;
                        Console.WriteLine($"Checking timeElapsed: {timeElapsed.TotalSeconds}, duration: {attacks[attackIndex].Duration} : {timeElapsed.TotalSeconds - attacks[attackIndex].Duration}");

                        if ((timeElapsed.TotalSeconds - attacks[attackIndex].Duration) >= -3)
                        {
                            Console.WriteLine($"{attacks[attackIndex].OriginCoordsX}, {attacks[attackIndex].OriginCoordsY} Attack has landed on {attacks[attackIndex].DestinationCoordsX},{attacks[attackIndex].DestinationCoordsY}!");
                            NexusBase origin = await GetNexusBase(attacks[attackIndex].OriginCoordsX, attacks[attackIndex].OriginCoordsY)
                                ?? new NexusBase() { CoordsX = attacks[attackIndex].OriginCoordsX, CoordsY = attacks[attackIndex].OriginCoordsY };
                            NexusBase destination = await GetNexusBase(attacks[attackIndex].DestinationCoordsX, attacks[attackIndex].DestinationCoordsY)
                                ?? new NexusBase() { CoordsX = attacks[attackIndex].DestinationCoordsX, CoordsY = attacks[attackIndex].DestinationCoordsY };

                            await DeleteAttack(origin, destination, attacks[attackIndex].Timestamp, attacks[attackIndex].Duration);

                            Console.WriteLine($"Getting attack results for {origin.CoordsX},{origin.CoordsY} attack on {destination.CoordsX},{destination.CoordsY}");

                            if (origin.CoordsX != destination.CoordsX || origin.CoordsY != destination.CoordsY)
                            {
                                List<UnitStats> attackingUnits = new List<UnitStats>();
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
                                    }
                                }
                                bool scoutAttack = attackingUnits.Any(u => u.UnitType == "scout") && attackingUnits.Count == 1;
                                NexusUnits? defendingUnits = await GetNexusUnits(destination, true);
                                if (scoutAttack && defendingUnits != null)
                                {
                                    defendingUnits.MarineTotal = 0;
                                    defendingUnits.GoliathTotal = 0;
                                    defendingUnits.SiegeTankTotal = 0;
                                    defendingUnits.WraithTotal = 0;
                                    defendingUnits.BattlecruiserTotal = 0;
                                    defendingUnits.GlitcherTotal = 0;
                                }

                                //CALCULATE DAMAGE  
                                var unitStats = new Dictionary<string, (int GroundDamage, int AirDamage, int Supply)>
                                {
                                    { "marine", (marineStats.GroundDamage, marineStats.AirDamage, marineStats.Supply) },
                                    { "goliath", (goliathStats.GroundDamage, goliathStats.AirDamage, goliathStats.Supply) },
                                    { "siege_tank", (siegeTankStats.GroundDamage, siegeTankStats.AirDamage, siegeTankStats.Supply) },
                                    { "scout", (scoutStats.GroundDamage, scoutStats.AirDamage, scoutStats.Supply) },
                                    { "wraith", (wraithStats.GroundDamage, wraithStats.AirDamage, wraithStats.Supply) },
                                    { "battlecruiser", (battlecruiserStats.GroundDamage, battlecruiserStats.AirDamage, battlecruiserStats.Supply) },
                                    { "glitcher", (glitcherStats.GroundDamage, glitcherStats.AirDamage, glitcherStats.Supply) },
                                };

                                int attackingGroundDamage = attackingUnits.Sum(x => x.GroundDamage);
                                int attackingAirDamage = attackingUnits.Sum(x => x.AirDamage);

                                double defendingGroundDamage = (defendingUnits?.ScoutTotal * unitStats["scout"].GroundDamage) ?? 0.0001;
                                double defendingAirDamage = (defendingUnits?.ScoutTotal * unitStats["scout"].AirDamage) ?? 0.0001;
                                foreach (var unitType in unitStats.Keys)
                                {
                                    if (!scoutAttack && unitType != "scout") // Skip scout since it's already calculated
                                    {
                                        defendingGroundDamage += (defendingUnits?.GetType().GetProperty($"{unitType}Total")?.GetValue(defendingUnits, null) as int? ?? 0) * unitStats[unitType].GroundDamage;
                                        defendingAirDamage += (defendingUnits?.GetType().GetProperty($"{unitType}Total")?.GetValue(defendingUnits, null) as int? ?? 0) * unitStats[unitType].AirDamage;
                                    }
                                }



                                var attackingLosses = new Dictionary<string, int?>();
                                var defendingLosses = new Dictionary<string, int?>();

                                // CALCULATE LOSSES
                                if (defendingGroundDamage != 0)
                                {
                                    Console.WriteLine("Calculating losses...");
                                    double groundCoeff = attackingGroundDamage / defendingGroundDamage;
                                    double airCoeff = attackingAirDamage / defendingAirDamage;
                                    double groundAttackDmgLossCoeff = groundCoeff * Math.Sqrt((double)groundCoeff);
                                    double airAttackDmgLossCoeff = airCoeff * Math.Sqrt((double)airCoeff);


                                    foreach (var unitType in unitStats.Keys)
                                    {
                                        var attackingUnit = attackingUnits.FirstOrDefault(x => x.UnitType == unitType);
                                        var defendingUnitProperty = defendingUnits?.GetType().GetProperty($"{unitType}Total");
                                        var defendingUnitValue = defendingUnitProperty?.GetValue(defendingUnits, null) as int? ?? 0;

                                        if (attackingUnit != null)
                                        {
                                            var sentValue = attackingUnit.SentValue ?? 0;
                                            var attackLossCoeff = (unitType == "scout" || unitType == "wraith" || unitType == "battlecruiser" || unitType == "glitcher")
                                                ? airAttackDmgLossCoeff
                                                : groundAttackDmgLossCoeff;

                                            attackingLosses[unitType] = Math.Min(sentValue, (int)(sentValue / attackLossCoeff));
                                            defendingLosses[unitType] = Math.Min(defendingUnitValue, (int)(defendingUnitValue * attackLossCoeff));
                                        }
                                        else
                                        {
                                            attackingLosses[unitType] = 0;
                                            defendingLosses[unitType] = 0;
                                        }
                                    }

                                    // RECORD LOSSES
                                    int attackerSupplyRecovered = attackingLosses.Sum(loss => loss.Value * unitStats[loss.Key].Supply) ?? 0;
                                    int defenderSupplyRecovered = defendingLosses.Sum(loss => loss.Value * unitStats[loss.Key].Supply) ?? 0;

                                    NexusUnits? attackerHomeBaseUnits = await GetNexusUnits(origin, false);
                                    if (attackerHomeBaseUnits != null)
                                    {
                                        foreach (var unitType in unitStats.Keys)
                                        {
                                            var prop = attackerHomeBaseUnits.GetType().GetProperty($"{unitType}Total");
                                            if (prop != null)
                                            {
                                                prop.SetValue(attackerHomeBaseUnits, (int)prop.GetValue(attackerHomeBaseUnits, null)! - attackingLosses[unitType]);
                                            }
                                        }
                                        await UpdateNexusUnits(origin, attackerHomeBaseUnits.MarineTotal ?? 0,
                                            attackerHomeBaseUnits.GoliathTotal ?? 0,
                                            attackerHomeBaseUnits.SiegeTankTotal ?? 0,
                                            attackerHomeBaseUnits.ScoutTotal ?? 0,
                                            attackerHomeBaseUnits.WraithTotal ?? 0,
                                            attackerHomeBaseUnits.BattlecruiserTotal ?? 0,
                                            attackerHomeBaseUnits.GlitcherTotal ?? 0);
                                    }
                                    await UpdateNexusSupply(origin, origin.Supply + attackerSupplyRecovered);

                                    NexusUnits? defenderHomeBaseUnits = await GetNexusUnits(destination, false);
                                    if (defenderHomeBaseUnits != null)
                                    {
                                        foreach (var unitType in unitStats.Keys)
                                        {
                                            var prop = defenderHomeBaseUnits.GetType().GetProperty($"{unitType}Total");
                                            if (prop != null)
                                            {
                                                prop.SetValue(defenderHomeBaseUnits, (int)prop.GetValue(defenderHomeBaseUnits, null)! - defendingLosses[unitType]);
                                            }
                                        }
                                        await UpdateNexusUnits(destination,
                                            defenderHomeBaseUnits.MarineTotal ?? 0,
                                            defenderHomeBaseUnits.GoliathTotal ?? 0,
                                            defenderHomeBaseUnits.SiegeTankTotal ?? 0,
                                            defenderHomeBaseUnits.ScoutTotal ?? 0,
                                            defenderHomeBaseUnits.WraithTotal ?? 0,
                                            defenderHomeBaseUnits.BattlecruiserTotal ?? 0,
                                            defenderHomeBaseUnits.GlitcherTotal ?? 0);
                                    }
                                    await UpdateNexusSupply(destination, destination.Supply + defenderSupplyRecovered);

                                }

                                var expectedKeys = new List<string> { "marine", "goliath", "siege_tank", "scout", "wraith", "battlecruiser", "glitcher" };
                                foreach (var key in expectedKeys)
                                {
                                    if (!attackingLosses.ContainsKey(key))
                                    {
                                        attackingLosses[key] = 0; // Initialize missing keys with a default value
                                    }
                                }


                                Console.WriteLine("Sending survivors back home...");
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

                                NexusBattleOutcome battleOutcome = CreateBattleOutcome(attacks, attackIndex, origin, destination, defendingUnits, attackingLosses, defendingLosses);
                                await InsertBattleOutcome(battleOutcome);
                                destination = new NexusBase() { CoordsX = origin.CoordsX, CoordsY = origin.CoordsY };
                                if (attackingUnits.First(x => x.SentValue > 0) != null)
                                {
                                    await SendAttack(origin, destination, attackingUnits.ToArray(), attacks[attackIndex].Duration);
                                }
                            }
                            else
                            {
                                Console.WriteLine($"Survivors made it back home...");
                            }

                        }
                    }
                }
            } catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
            }
            
        }
        private async Task DeleteReport(int UserId, int BattleId)
        {
            Console.WriteLine($"Deleting Report from {UserId},{BattleId}");
            string sql = @"
                INSERT INTO
                    maxhanna.nexus_reports_deleted (user_id, battle_id) 
                VALUES (@UserId, @BattleId);";

            var parameters = new Dictionary<string, object?>
             {
                 { "@UserId", UserId },
                 { "@BattleId", BattleId } 
             };

            await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters);
            Console.WriteLine($"Deleted Report from {UserId},{BattleId}"); 
        }
        private static NexusBattleOutcome CreateBattleOutcome(List<NexusAttackSent> attacks, int attackIndex, NexusBase origin, NexusBase destination, NexusUnits? defendingUnits, Dictionary<string, int?>? attackingLosses, Dictionary<string, int?> defendingLosses)
        {
            return new NexusBattleOutcome()
            {
                OriginUserId = origin.User?.Id,
                OriginCoordsX = origin.CoordsX,
                OriginCoordsY = origin.CoordsY,
                DestinationUserId = destination.User?.Id,
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
                DefendingLosses = defendingLosses
            };
        }

        private async Task<NexusBattleOutcomeReports> GetAllBattleReports(int? userId, NexusBase? targetBase, int pageNumber, int pageSize)
        {
            var battleReports = new List<NexusBattleOutcome>();
            int offset = (pageNumber - 1) * pageSize;

            string query = @"
            SELECT SQL_CALC_FOUND_ROWS *
            FROM nexus_battles b
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

            using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await connection.OpenAsync();

                using (var command = new MySqlCommand(query, connection))
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
                    //Console.WriteLine(command.CommandText);
                    //Console.WriteLine($"with offset {offset} and pageSize: {pageSize}");

                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            var battleOutcome = new NexusBattleOutcome
                            {
                                BattleId = reader.GetInt32("battle_id"),
                                OriginUserId = reader.IsDBNull(reader.GetOrdinal("origin_user_id")) ? (int?)null : reader.GetInt32("origin_user_id"),
                                OriginCoordsX = reader.IsDBNull(reader.GetOrdinal("origin_coords_x")) ? 0 : reader.GetInt32("origin_coords_x"),
                                OriginCoordsY = reader.IsDBNull(reader.GetOrdinal("origin_coords_y")) ? 0 : reader.GetInt32("origin_coords_y"),
                                DestinationUserId = reader.IsDBNull(reader.GetOrdinal("destination_user_id")) ? (int?)null : reader.GetInt32("destination_user_id"),
                                DestinationCoordsX = reader.IsDBNull(reader.GetOrdinal("destination_coords_x")) ? 0 : reader.GetInt32("destination_coords_x"),
                                DestinationCoordsY = reader.IsDBNull(reader.GetOrdinal("destination_coords_y")) ? 0 : reader.GetInt32("destination_coords_y"),
                                Timestamp = reader.GetDateTime("timestamp"),
                                AttackingUnits = JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("attacking_units")) ?? new Dictionary<string, int?>(),
                                DefendingUnits = JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("defending_units")) ?? new Dictionary<string, int?>(),
                                AttackingLosses = JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("attacking_losses")) ?? new Dictionary<string, int?>(),
                                DefendingLosses = JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("defending_losses")) ?? new Dictionary<string, int?>()
                            };

                            bool isScoutAttack = false;
                            int attackingScouts = battleOutcome.AttackingUnits.GetValueOrDefault("scout") ?? 0;
                            int defendingScouts = battleOutcome.DefendingUnits.GetValueOrDefault("scout") ?? 0;

                            if (attackingScouts > 0 &&
                                (attackingScouts == battleOutcome.AttackingUnits.Sum(kv => kv.Value ?? 0) ||
                                attackingScouts >= 4 * defendingScouts))
                            {
                                isScoutAttack = true;
                            }

                            bool hasAttackingScoutLosses = battleOutcome.AttackingLosses.GetValueOrDefault("scout") > 0;

                            if (isScoutAttack)
                            {
                                if (hasAttackingScoutLosses)
                                {
                                    // Show defending units
                                    battleOutcome.DefendingUnits = new Dictionary<string, int?>(battleOutcome.DefendingUnits);
                                }
                                else
                                {
                                    // Hide defending units
                                    battleOutcome.DefendingUnits = new Dictionary<string, int?>();
                                }
                            }
                            else
                            {
                                // Hide defending units
                                battleOutcome.DefendingUnits = new Dictionary<string, int?>();
                            }

                            battleReports.Add(battleOutcome);
                        }
                    }
                }

                using (var command = new MySqlCommand("SELECT FOUND_ROWS()", connection))
                {
                    int totalReports = Convert.ToInt32(await command.ExecuteScalarAsync());
                    return new NexusBattleOutcomeReports
                    {
                        BattleOutcomes = battleReports,
                        CurrentPage = pageNumber,
                        PageSize = pageSize,
                        TotalReports = totalReports
                    };
                }
            }
        }

        private async Task InsertBattleOutcome(NexusBattleOutcome battleOutcome)
        {
            Console.WriteLine("Creating a report");
            string sql = @"
                INSERT INTO nexus_battles 
                    (origin_user_id, origin_coords_x, origin_coords_y, destination_user_id, destination_coords_x, destination_coords_y, attacking_units, defending_units, attacking_losses, defending_losses) 
                VALUES 
                    (@origin_user_id, @origin_coords_x, @origin_coords_y, @destination_user_id, @destination_coords_x, @destination_coords_y, @attacking_units, @defending_units, @attacking_losses, @defending_losses);";

            var parameters = new Dictionary<string, object?>
            {
                { "@origin_user_id", battleOutcome.OriginUserId },
                { "@origin_coords_x", battleOutcome.OriginCoordsX },
                { "@origin_coords_y", battleOutcome.OriginCoordsY },
                { "@destination_user_id", battleOutcome.DestinationUserId },
                { "@destination_coords_x", battleOutcome.DestinationCoordsX },
                { "@destination_coords_y", battleOutcome.DestinationCoordsY },
                { "@attacking_units", JsonConvert.SerializeObject(battleOutcome.AttackingUnits) },
                { "@defending_units", JsonConvert.SerializeObject(battleOutcome.DefendingUnits) },
                { "@attacking_losses", JsonConvert.SerializeObject(battleOutcome.AttackingLosses) },
                { "@defending_losses", JsonConvert.SerializeObject(battleOutcome.DefendingLosses) },

            };

            await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters);
            Console.WriteLine($"Report created");
        }
        private async Task UpdateNexusUnitTrainingCompletes(NexusBase nexus, MySqlConnection conn, MySqlTransaction transaction)
        {
            Console.WriteLine("Update Nexus Units");
            List<UnitStats> stats = await GetUnitStatsFromDB(null, null);

            List<NexusUnitsPurchased>? purchased = await GetNexusUnitPurchases(nexus);
            if (purchased != null && stats.Count > 0)
            {
                for (var x = 0; x < purchased.Count; x++)
                {
                    UnitStats stat = stats.First(stat => stat.UnitId == purchased[x].UnitIdPurchased);
                    int duration = stat.Duration * purchased[x].QuantityPurchased;
                    string unitType = stat.UnitType ?? "";
                    TimeSpan timeElapsed = DateTime.Now - purchased[x].Timestamp;
                    Console.WriteLine($"Verifying {unitType} with timeElapsed: {timeElapsed} and duration : {duration}... timeElapsed.TotalSeconds{timeElapsed.TotalSeconds} - duration : {timeElapsed.TotalSeconds - duration}");
                    if ((timeElapsed.TotalSeconds - duration) >= -3)
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
            Console.WriteLine($"UpdateNexusGoldAndSupply...");
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
            var res = (0, 0);
            try
            {
                string sqlCurrentLevels = @"
                        SELECT 
                            supply_depot_level, gold, supply
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
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reading current levels: {ex.Message}");
                throw;
            }

            return res;
        }

        private async Task<int> CalculateUsedNexusSupply(NexusPurchaseUnitRequest request, MySqlConnection conn, MySqlTransaction transaction)
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
                u.scout_total,
                u.battlecruiser_total,
                u.glitcher_total,
                COALESCE(marines.supply, 0) AS marines_supply,
                COALESCE(goliaths.supply, 0) AS goliaths_supply,
                COALESCE(siege_tanks.supply, 0) AS siege_tanks_supply,
                COALESCE(scouts.supply, 0) AS scouts_supply,
                COALESCE(wraiths.supply, 0) AS wraiths_supply,
                COALESCE(battlecruisers.supply, 0) AS battlecruisers_supply,
                COALESCE(glitchers.supply, 0) AS glitchers_supply
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
                     unit_id = 11) AS scouts ON scouts.unit_level = 0
            LEFT JOIN 
                (SELECT 
                     unit_id, unit_level, supply
                 FROM 
                     nexus_unit_stats
                 WHERE 
                     unit_id = 10) AS siege_tanks ON siege_tanks.unit_level = 0 
            LEFT JOIN 
                (SELECT 
                     unit_id, unit_level, supply
                 FROM 
                     nexus_unit_stats
                 WHERE 
                     unit_id = 12) AS glitchers ON glitchers.unit_level = 0
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
                        int scoutTotal = readerCurrentSupply.GetInt32("scout_total");
                        int scoutSupply = readerCurrentSupply.GetInt32("scouts_supply");
                        int wraithTotal = readerCurrentSupply.GetInt32("wraith_total");
                        int wraithSupply = readerCurrentSupply.GetInt32("wraiths_supply");
                        int battleCruiserTotal = readerCurrentSupply.GetInt32("battlecruiser_total");
                        int battleCruiserSupply = readerCurrentSupply.GetInt32("battlecruisers_supply");
                        int glitcherTotal = readerCurrentSupply.GetInt32("glitcher_total");
                        int glitcherSupply = readerCurrentSupply.GetInt32("glitchers_supply");

                        marinesTotal *= marinesSupply;
                        goliathTotal *= goliathSupply;
                        siegeTankTotal *= siegeTankSupply;
                        wraithTotal *= wraithSupply;
                        scoutTotal *= scoutSupply;
                        battleCruiserTotal *= battleCruiserSupply;
                        glitcherTotal *= glitcherSupply;

                        res = marinesTotal + goliathTotal + siegeTankTotal + scoutTotal + wraithTotal + battleCruiserTotal + glitcherTotal;
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

        private async Task<IActionResult> UpgradeComponent(User user, string component, NexusBase? nexus)
        {
            Console.WriteLine($"UpgradeComponent - Upgrade{component} ({user.Id})");
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
        private async Task ExecuteInsertOrUpdateOrDeleteAsync(string sql, Dictionary<string, object?> parameters)
        {
            var cmdText = "";
            using (MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                try
                {
                    Console.WriteLine("Executing Insert/Update/Delete!");
                    await conn.OpenAsync();

                    using (MySqlCommand cmdUpdate = new MySqlCommand(sql, conn))
                    {
                        // Add parameters to the command
                        foreach (var param in parameters)
                        {
                            cmdUpdate.Parameters.AddWithValue(param.Key, param.Value);
                        }
                        cmdText = cmdUpdate.CommandText;
                        await cmdUpdate.ExecuteNonQueryAsync();
                        Console.WriteLine("Update executed successfully!");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"An error occurred while executing update");
                    Console.WriteLine("Update ERROR : " + ex.Message);
                    Console.WriteLine(cmdText);
                    foreach (var param in parameters)
                    {
                        Console.WriteLine("Param:" + param.Key + ": " + param.Value);
                    }
                }
                finally
                {
                    await conn.CloseAsync();
                }
            }
        }

    }
}
