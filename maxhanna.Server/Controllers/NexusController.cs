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

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                await conn.OpenAsync();

                NexusBase nexusBase = null;
                NexusBaseUpgrades nexusBaseUpgrades = null;

                // Retrieve data from nexus_bases
                string sqlBase = "SELECT * FROM nexus_bases WHERE user_id = @UserId";
                MySqlCommand cmdBase = new MySqlCommand(sqlBase, conn);
                cmdBase.Parameters.AddWithValue("@UserId", user.Id);

                var readerBase = await cmdBase.ExecuteReaderAsync();
                if (await readerBase.ReadAsync())
                {
                    nexusBase = new NexusBase
                    {
                        UserId = readerBase.GetInt32("user_id"),
                        Gold = readerBase.IsDBNull(readerBase.GetOrdinal("gold")) ? 0 : readerBase.GetInt32("gold"),
                        CoordsX = readerBase.IsDBNull(readerBase.GetOrdinal("coords_x")) ? 0 : readerBase.GetInt32("coords_x"),
                        CoordsY = readerBase.IsDBNull(readerBase.GetOrdinal("coords_y")) ? 0 : readerBase.GetInt32("coords_y"),
                        NexusLevel = readerBase.IsDBNull(readerBase.GetOrdinal("nexus_level")) ? 0 : readerBase.GetInt32("nexus_level"),
                        MineLevel = readerBase.IsDBNull(readerBase.GetOrdinal("mine_level")) ? 0 : readerBase.GetInt32("mine_level"),
                        SupplyDepotLevel = readerBase.IsDBNull(readerBase.GetOrdinal("supply_depot_level")) ? 0 : readerBase.GetInt32("supply_depot_level"),
                        FactoryLevel = readerBase.IsDBNull(readerBase.GetOrdinal("factory_level")) ? 0 : readerBase.GetInt32("factory_level"),
                        StarportLevel = readerBase.IsDBNull(readerBase.GetOrdinal("starport_level")) ? 0 : readerBase.GetInt32("starport_level"),
                        Conquered = readerBase.IsDBNull(readerBase.GetOrdinal("conquered")) ? DateTime.MinValue : readerBase.GetDateTime("conquered"),
                    };
                }
                await readerBase.CloseAsync();

                // Retrieve data from nexus_base_upgrades
                string sqlUpgrades = "SELECT * FROM nexus_base_upgrades WHERE user_id = @UserId";
                MySqlCommand cmdUpgrades = new MySqlCommand(sqlUpgrades, conn);
                cmdUpgrades.Parameters.AddWithValue("@UserId", user.Id);

                var readerUpgrades = await cmdUpgrades.ExecuteReaderAsync();
                if (await readerUpgrades.ReadAsync())
                {
                    nexusBaseUpgrades = new NexusBaseUpgrades
                    {
                        UserId = readerUpgrades.GetInt32("user_id"),
                        NexusUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("nexus_upgraded")) ? DateTime.MinValue : readerUpgrades.GetDateTime("nexus_upgraded"),
                        MinesUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("mines_upgraded")) ? DateTime.MinValue : readerUpgrades.GetDateTime("mines_upgraded"),
                        SupplyDepotUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("supply_depot_upgraded")) ? DateTime.MinValue : readerUpgrades.GetDateTime("supply_depot_upgraded"),
                        FactoryUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("factory_upgraded")) ? DateTime.MinValue : readerUpgrades.GetDateTime("factory_upgraded"),
                        StarportUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("starport_upgraded")) ? DateTime.MinValue : readerUpgrades.GetDateTime("starport_upgraded"),
                    };
                }
                await readerUpgrades.CloseAsync();

                return Ok(new { nexusBase = nexusBase ?? new NexusBase(), nexusBaseUpgrades = nexusBaseUpgrades ?? new NexusBaseUpgrades() });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while processing the GET request.");
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                await conn.CloseAsync();
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
                        return Ok(new { X = coordsX, Y = coordsY } );
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


        [HttpPost("/Nexus/UpgradeMine", Name = "UpgradeMine")]
        public Task<IActionResult> UpgradeMine([FromBody] User user)
        {
            return UpgradeComponent(user, "mines");
        }

        [HttpPost("/Nexus/UpgradeFactory", Name = "UpgradeFactory")]
        public Task<IActionResult> UpgradeFactory([FromBody] User user)
        {
            return UpgradeComponent(user, "factory");
        }

        [HttpPost("/Nexus/UpgradeStarport", Name = "UpgradeStarport")]
        public Task<IActionResult> UpgradeStarport([FromBody] User user)
        {
            return UpgradeComponent(user, "starport");
        }

        [HttpPost("/Nexus/UpgradeNexus", Name = "UpgradeNexus")]
        public Task<IActionResult> UpgradeNexus([FromBody] User user)
        {
            return UpgradeComponent(user, "nexus");
        }

        [HttpPost("/Nexus/UpgradeSupplyDepot", Name = "UpgradeSupplyDepot")]
        public Task<IActionResult> UpgradeSupplyDepot([FromBody] User user)
        {
            return UpgradeComponent(user, "supply_depot");
        }
        private async Task<IActionResult> UpgradeComponent(User user, string component)
        {
            _logger.LogInformation($"POST /Nexus/Upgrade{component} ({user?.Id ?? 0})");

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                await conn.OpenAsync();

                string sql = $@"
                    INSERT INTO nexus_base_upgrades (user_id, {component}_upgraded)
                    VALUES (@UserId, CURRENT_TIMESTAMP)
                    ON DUPLICATE KEY UPDATE {component}_upgraded = CURRENT_TIMESTAMP";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@UserId", user.Id);

                await cmd.ExecuteNonQueryAsync();

                return Ok();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"An error occurred while processing the POST request to upgrade {component}.");
                return StatusCode(500, "An error occurred while processing the request.");
            }
            finally
            {
                await conn.CloseAsync();
            }
        } 
    }
}
