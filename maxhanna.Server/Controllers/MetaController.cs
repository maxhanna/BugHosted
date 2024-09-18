using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Meta;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using System.Data.Common;
using System.Transactions;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Microsoft.AspNetCore.Components.Route("[controller]")]
    public class MetaController : ControllerBase
    {
        private readonly ILogger<MetaController> _logger;
        private readonly IConfiguration _config;
        private readonly string _connectionString; 

        public MetaController(ILogger<MetaController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
            _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        }

        [HttpPost("/Meta", Name = "GetHero")]
        public async Task<IActionResult> GetHero([FromBody] User user)
        {
            Console.WriteLine($"POST /Meta ({user.Id})");


            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        MetaHero? hero = await GetHeroData(user, connection, transaction);
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

        [HttpPost("/Meta/Update", Name = "UpdateHero")]
        public async Task<IActionResult> UpdateHero([FromBody] MetaHero hero)
        {
            Console.WriteLine($"POST /Meta/Update (UserId: {hero.User?.Id ?? 0}, Hero Id: {hero.Id}");
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        string sql = @"
                            UPDATE maxhanna.meta_hero 
3                           SET coordsX = @CoordsX, 
                                coordsY = @CoordsY, 
                                speed = @Speed, 
                                name = @Name 
                            WHERE 
                                id = @HeroId";
                        Dictionary<string, object?> parameters = new Dictionary<string, object?>
                        {
                            { "@CoordsX", hero.CoordsX },
                            { "@CoordsY", hero.CoordsY },
                            { "@Speed", hero.Speed },
                            { "@Name", hero.Name },
                            { "@HeroId", hero.Id }
                        };
                        await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);

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

        [HttpPost("/Meta/Create", Name = "CreateHero")]
        public async Task<IActionResult> CreateHero([FromBody] CreateMetaHeroRequest req)
        {
            Console.WriteLine($"POST /Meta/Create (UserId: {req.User?.Id ?? 0}, Hero Name: {req.Name}");
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        string sql = @"
                            INSERT INTO maxhanna.meta_hero (name, user_id, coordsX, coordsY)
3                           VALUES (@Name, @UserId, @CoordsX, @CoordsY);";
                        Dictionary<string, object?> parameters = new Dictionary<string, object?>
                        {
                            { "@CoordsX", 0 },
                            { "@CoordsY", 0 },
                            { "@Name", req.Name ?? "Anonymous"},
                            { "@UserId", req.User?.Id ?? 0}
                        };
                        long? botId = await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
                        if (botId != null) {
                            MetaHero hero = new MetaHero();
                            hero.CoordsX = 0;
                            hero.CoordsY = 0;
                            hero.Id = (int)botId;
                            hero.Name = req.Name;
                            return Ok(hero);
                        }
                        
                        return BadRequest("Error, cannot retrieve added hero!");
                    }
                    catch (Exception ex)
                    {
                        await transaction.RollbackAsync();
                        return StatusCode(500, "Internal server error: " + ex.Message);
                    }
                }
            }
        }

        private async Task<MetaHero?> GetHeroData(User user, MySqlConnection conn, MySqlTransaction transaction)
        {
            // Ensure the connection is open
            if (conn.State != System.Data.ConnectionState.Open)
            {
                await conn.OpenAsync();
            }
            if (transaction == null)
            {
                _logger.LogError("Transaction is null.");
                throw new InvalidOperationException("Transaction is required for this operation.");
            }

            string sql = @"
                    SELECT 
                        *
                    FROM 
                        maxhanna.meta_hero
                    WHERE 
                        user_id = @UserId 
                    LIMIT 1";

            MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
            cmd.Parameters.AddWithValue("@userId", user.Id);

            using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (reader.Read())
                {
                    MetaHero hero = new MetaHero();
                    hero.CoordsX = Convert.ToInt32(reader["coordsX"]);
                    hero.CoordsY = Convert.ToInt32(reader["coordsY"]);
                    hero.Speed = Convert.ToInt32(reader["speed"]);
                    hero.Id = Convert.ToInt32(reader["id"]);
                    hero.Name = Convert.ToString(reader["name"]);
                    return hero;
                }
            }
            return null;
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

            return insertedId ?? rowsAffected;
        }
    }
}
