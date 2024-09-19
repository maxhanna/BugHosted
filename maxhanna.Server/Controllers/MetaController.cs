using maxhanna.Server.Controllers.DataContracts.Meta; 
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector; 

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
                        MetaHero? hero = await GetHeroData(user, null, connection, transaction);
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

        [HttpPost("/Meta/FetchGameData", Name = "FetchGameData")]
        public async Task<IActionResult> FetchGameData([FromBody] MetaHero hero)
        {
            Console.WriteLine($"POST /Meta/FetchGameData (HeroId: {hero.Id})");


            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        await UpdateHeroInDB(hero, connection, transaction);
                        MetaHero[]? heroes = await GetNearbyPlayers(hero, connection, transaction);
                        List<MetaChat> chat = await GetChatFromDB(connection, transaction);

                        await transaction.CommitAsync(); 
                        return Ok(new { 
                            heroes,
                            chat, 
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
                        await UpdateHeroInDB(hero, connection, transaction); 
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
            Console.WriteLine($"POST /Meta/Create (UserId: {req.User?.Id ?? 0}, Hero Name: {req.Name})");
            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        string sql = @"
                            INSERT INTO maxhanna.meta_hero (name, user_id, coordsX, coordsY, speed)
                            VALUES (@Name, @UserId, @CoordsX, @CoordsY, @Speed);";
                        Dictionary<string, object?> parameters = new Dictionary<string, object?>
                        {
                            { "@CoordsX", 15 },
                            { "@CoordsY", 15 },
                            { "@Speed", 5 },
                            { "@Name", req.Name ?? "Anonymous"},
                            { "@UserId", req.User?.Id ?? 0}
                        };
                        long? botId = await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
                        await transaction.CommitAsync();
                        if (botId != null) {
                            MetaHero hero = new MetaHero();
                            hero.CoordsX = 15;
                            hero.CoordsY = 15;
                            hero.Id = (int)botId;
                            hero.Speed = 5;
                            hero.Name = req.Name;
                            hero.User = req.User;
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

        [HttpPost("/Meta/Chat", Name = "Chat")]
        public async Task<IActionResult> Chat([FromBody] MetaHeroChatRequest request)
        {
            Console.WriteLine($"POST /Meta/Chat (HeroId: {request.Hero.Id})"); 

            using (var connection = new MySqlConnection(_connectionString))
            {
                await connection.OpenAsync();
                using (var transaction = connection.BeginTransaction())
                {
                    try
                    {
                        await InsertChatInDB(request.Hero, request.Content, connection, transaction); 
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
        private async Task UpdateHeroInDB(MetaHero hero, MySqlConnection connection, MySqlTransaction transaction)
        {
            string sql = @"
                            UPDATE maxhanna.meta_hero 
                            SET coordsX = @CoordsX, 
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
        }

        private async Task InsertChatInDB(MetaHero hero, string? content, MySqlConnection connection, MySqlTransaction transaction)
        {
            string sql = @"
                            INSERT INTO maxhanna.meta_chat (hero_id, content)
                            VALUES (@HeroId, @Content)";
            Dictionary<string, object?> parameters = new Dictionary<string, object?>
                        {
                            { "@HeroId", hero.Id },
                            { "@Content", string.IsNullOrEmpty(content) ? DBNull.Value : content},
                        };
            await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
        }

        private async Task<List<MetaChat>> GetChatFromDB(MySqlConnection connection, MySqlTransaction transaction)
        {
            // Ensure the connection is open
            if (connection.State != System.Data.ConnectionState.Open)
            {
                await connection.OpenAsync();
            }
            if (transaction == null)
            {
                _logger.LogError("Transaction is null.");
                throw new InvalidOperationException("Transaction is required for this operation.");
            }
            string sql = @"SELECT * FROM maxhanna.meta_chat ORDER BY timestamp DESC LIMIT 100"; 
            MySqlCommand cmd = new MySqlCommand(sql, connection, transaction);
            List<MetaChat> chat = new List<MetaChat>();
            using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (reader.Read())
                {
                    MetaChat tmpChat = new MetaChat(); 
                    MetaHero? tmpHero = new MetaHero();
                    tmpHero.Id = Convert.ToInt32(reader["hero_id"]);

                    tmpChat.Hero = tmpHero;
                    tmpChat.Content = Convert.ToString(reader["content"]); 
                    tmpChat.Timestamp = Convert.ToDateTime(reader["timestamp"]); 
                    chat.Add(tmpChat);
                }
            }

            for(int x = 0; x < chat.Count; x++)
            {
                int heroId = chat[x].Hero.Id;
                MetaHero? tmpHero = await GetHeroData(null, heroId, connection, transaction);
                chat[x].Hero = tmpHero;
            }

            return chat;
        }
        private async Task<MetaHero?> GetHeroData(User? user, int? heroId, MySqlConnection conn, MySqlTransaction transaction)
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
            if (user == null && heroId == null) { return null; }

            string sql = $@"
                    SELECT 
                        *
                    FROM 
                        maxhanna.meta_hero 
                    WHERE 
                        {(heroId == null ? "user_id = @UserId" : "id = @UserId")} 
                    LIMIT 1";

            MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
            cmd.Parameters.AddWithValue("@UserId", heroId != null ? heroId : (user?.Id ?? 0));

            using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (reader.Read())
                {
                    if (user != null)
                    { 
                        user.Pass = null;
                    }
                    MetaHero hero = new MetaHero();
                    hero.CoordsX = Convert.ToInt32(reader["coordsX"]);
                    hero.CoordsY = Convert.ToInt32(reader["coordsY"]);
                    hero.Speed = Convert.ToInt32(reader["speed"]);
                    hero.Id = Convert.ToInt32(reader["id"]);
                    hero.Name = Convert.ToString(reader["name"]);
                    hero.User = user;
                    return hero;
                }
            }
            return null;
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
                _logger.LogError("Transaction is null.");
                throw new InvalidOperationException("Transaction is required for this operation.");
            }
            List<MetaHero> heroes = new List<MetaHero>();
            string sql = @"
                    SELECT 
                        m.*, u.username
                    FROM 
                        maxhanna.meta_hero m
                    LEFT JOIN
                        maxhanna.users u ON u.id = m.user_id
                    WHERE 
                        m.id != @HeroId;";

            MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
            cmd.Parameters.AddWithValue("@HeroId", hero.Id);

            using (var reader = await cmd.ExecuteReaderAsync())
            {
                while (reader.Read())
                {
                    User tmpUser = new User(Convert.ToInt32(reader["user_id"]), Convert.ToString(reader["username"]) ?? "Anonymous");
                    MetaHero tmpHero = new MetaHero();
                    tmpHero.CoordsX = Convert.ToInt32(reader["coordsX"]);
                    tmpHero.CoordsY = Convert.ToInt32(reader["coordsY"]);
                    tmpHero.Speed = Convert.ToInt32(reader["speed"]);
                    tmpHero.Id = Convert.ToInt32(reader["id"]);
                    tmpHero.Name = Convert.ToString(reader["name"]);
                    tmpHero.User = tmpUser;
                    heroes.Add(tmpHero);
                }
            }
            return heroes.ToArray();
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
