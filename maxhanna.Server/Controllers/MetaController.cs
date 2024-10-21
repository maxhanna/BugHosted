using maxhanna.Server.Controllers.DataContracts.Meta;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using MySqlConnector;
using System.Text;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Microsoft.AspNetCore.Components.Route("[controller]")]
	public class MetaController : ControllerBase
	{
		private readonly ILogger<MetaController> _logger;
		private readonly IConfiguration _config;
		private readonly string _connectionString;

		private List<Vector2> map0Boundaries = new List<Vector2>();
		private List<Vector2> map1Boundaries = new List<Vector2>();

		public MetaController(ILogger<MetaController> logger, IConfiguration config)
		{
			_logger = logger;
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
			SetMapBoundaries();
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
			// Console.WriteLine($"POST /Meta/FetchGameData (HeroId: {hero.Id})"); 
			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();
				using (var transaction = connection.BeginTransaction())
				{
					try
					{
						hero = await UpdateHeroInDB(hero, connection, transaction);
						MetaHero[]? heroes = await GetNearbyPlayers(hero, connection, transaction);
						List<MetaChat> chat = await GetChatFromDB(connection, transaction);
						List<MetaEvent> events = await GetEventsFromDb(hero.Map, connection, transaction);
						await transaction.CommitAsync();
						return Ok(new
						{
							map = hero.Map,
							hero.Position,
							heroes,
							chat,
							events
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

		[HttpPost("/Meta/FetchInventoryData", Name = "FetchInventoryData")]
		public async Task<IActionResult> FetchInventoryData([FromBody] MetaHero hero)
		{
			Console.WriteLine($"POST /Meta/FetchInventoryData (HeroId: {hero.Id})"); 
			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();
				using (var transaction = connection.BeginTransaction())
				{
					try
					{ 
						MetaInventoryItem[]? inventory = await GetInventoryFromDB(hero, connection, transaction);
						await transaction.CommitAsync();
						return Ok(inventory);
					}
					catch (Exception ex)
					{
						await transaction.RollbackAsync();
						return StatusCode(500, "Internal server error: " + ex.Message);
					}
				}
			}
		}

		[HttpPost("/Meta/UpdateEvents", Name = "UpdateEvents")]
		public async Task<IActionResult> UpdateEvents([FromBody] MetaEvent @event)
		{
			Console.WriteLine($"POST /Meta/UpdateEvents (Hero Id: {@event.HeroId})");
			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();
				using (var transaction = connection.BeginTransaction())
				{
					try
					{
						await UpdateEventsInDB(@event, connection, transaction);
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

		[HttpPost("/Meta/UpdateInventory", Name = "UpdateInventory")]
		public async Task<IActionResult> UpdateInventory([FromBody] UpdateMetaHeroInventoryRequest request)
		{
			Console.WriteLine($"POST /Meta/UpdateInventory (Hero Id: {request.Hero?.Id})");
			if (request.Hero != null)
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
                            SELECT @Name, @UserId, @CoordsX, @CoordsY, @Speed
                            WHERE NOT EXISTS (
                                SELECT 1 FROM maxhanna.meta_hero WHERE user_id = @UserId
                            );";
						int posX = 1 * 16;
						int posY = 11 * 16;
						Dictionary<string, object?> parameters = new Dictionary<string, object?>
												{
														{ "@CoordsX", posX },
														{ "@CoordsY", posY },
														{ "@Speed", 5 },
														{ "@Name", req.Name ?? "Anonymous"},
														{ "@UserId", req.User?.Id ?? 0}
												};
						long? botId = await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
						await transaction.CommitAsync();

						MetaHero hero = new MetaHero();
						hero.Position = new Vector2(posX, posY);
						hero.Id = (int)botId;
						hero.Speed = 5;
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


		[HttpPost("/Meta/CreateBot", Name = "CreateBot")]
		public async Task<IActionResult> CreateBot([FromBody] MetaBot bot)
		{
			Console.WriteLine($"POST /Meta/CreateBot (UserId: {bot.HeroId}, Bot Name: {bot.Name})");
			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();
				using (var transaction = connection.BeginTransaction())
				{
					try
					{
						string sql = @"INSERT INTO maxhanna.meta_bot (hero_id, name, type, hp, exp, level) VALUES (@HeroId, @Name, @Type, @Hp, @Exp, @Level);"; 
						Dictionary<string, object?> parameters = new Dictionary<string, object?>
												{
														{ "@HeroId", bot.HeroId },
														{ "@Name", bot.Name },
														{ "@Type", bot.Type },
														{ "@Hp", bot.Hp},
														{ "@Exp", bot.Exp},
														{ "@Level", bot.Level}
												};
						long? botId = await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
						await transaction.CommitAsync();

						MetaBot heroBot = new MetaBot();
						heroBot.Id = (int)botId;
						heroBot.HeroId = bot.HeroId;
						heroBot.Name = bot.Name;
						heroBot.Hp = bot.Hp;
						heroBot.Type = bot.Type;
						return Ok(heroBot);
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
		private async Task<MetaHero> UpdateHeroInDB(MetaHero hero, MySqlConnection connection, MySqlTransaction transaction)
		{
			//Console.WriteLine("hero coords X " + hero.Position.x + " hero coordsY" + hero.Position.y  + " bots: " + hero.Metabots);
			string sql = @"UPDATE maxhanna.meta_hero 
                            SET coordsX = @CoordsX, 
                                coordsY = @CoordsY, 
                                color = @Color,  
                                map = @Map 
                            WHERE 
                                id = @HeroId";
			Dictionary<string, object?> parameters = new Dictionary<string, object?>
						{
								{ "@CoordsX", hero.Position.x },
								{ "@CoordsY", hero.Position.y },
								{ "@Color", hero.Color },
								{ "@Map", hero.Map },
								{ "@HeroId", hero.Id }
						};
			await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);

			if (hero.Metabots != null && hero.Metabots.Count > 0)
			{
				StringBuilder botSqlBuilder = new StringBuilder();
				Dictionary<string, object?> botParameters = new Dictionary<string, object?>();

				int botIndex = 0;
				foreach (MetaBot bot in hero.Metabots)
				{
					// Building SQL for both insert and update
					string botSql = $@"
						INSERT INTO maxhanna.meta_bot (id, name, type, hp, level, exp, hero_id) 
						VALUES (@BotId{botIndex}, @Name{botIndex}, @Type{botIndex}, @Hp{botIndex}, @Level{botIndex}, @Exp{botIndex}, @HeroId{botIndex})
						ON DUPLICATE KEY UPDATE 
								name = VALUES(name),
								type = VALUES(type),
								hp = VALUES(hp),
								level = VALUES(level),
								exp = VALUES(exp);";

					// Append each bot's insert or update statement to the query builder
					botSqlBuilder.Append(botSql);

					// Add parameters for each bot
					botParameters.Add($"@BotId{botIndex}", bot.Id);
					botParameters.Add($"@Name{botIndex}", bot.Name);
					botParameters.Add($"@Type{botIndex}", bot.Type);
					botParameters.Add($"@Hp{botIndex}", bot.Hp);
					botParameters.Add($"@Level{botIndex}", bot.Level);
					botParameters.Add($"@Exp{botIndex}", bot.Exp); 
					botParameters.Add($"@HeroId{botIndex}", bot.HeroId);

					botIndex++;
				}

				// Execute the combined MetaBot update queries
				await ExecuteInsertOrUpdateOrDeleteAsync(botSqlBuilder.ToString(), botParameters, connection, transaction);
			}

			return hero; 
		}
		private async Task UpdateEventsInDB(MetaEvent @event, MySqlConnection connection, MySqlTransaction transaction)
		{
			string sql = @"DELETE FROM maxhanna.meta_event WHERE timestamp < NOW() - INTERVAL 20 SECOND;
                            INSERT INTO maxhanna.meta_event (hero_id, event, map, data)
                            VALUES (@HeroId, @Event, @Map, @Data);";
			Dictionary<string, object?> parameters = new Dictionary<string, object?>
						{
								{ "@HeroId", @event.HeroId },
								{ "@Event", @event.Event },
								{ "@Map", @event.Map },
								{ "@Data", Newtonsoft.Json.JsonConvert.SerializeObject(@event.Data) }
						};
			await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
			return;
		}

		private async Task UpdateInventoryInDB(UpdateMetaHeroInventoryRequest request, MySqlConnection connection, MySqlTransaction transaction)
		{
			if (request.Hero != null)
			{
				string sql = @"INSERT INTO meta_hero_inventory (meta_hero_id, name, image, category) VALUES (@HeroId, @Name, @Image, @Category);";
				Dictionary<string, object?> parameters = new Dictionary<string, object?>
						{
								{ "@HeroId", request.Hero.Id },
								{ "@Name", request.Name },
								{ "@Image", request.Image  },
								{ "@Category", request.Category },
						};
				await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
			}
			return;
		}


		private async Task InsertChatInDB(MetaHero hero, string? content, MySqlConnection connection, MySqlTransaction transaction)
		{
			string sql = @"INSERT INTO maxhanna.meta_chat (hero_id, content)
                           VALUES (@HeroId, @Content)";
			Dictionary<string, object?> parameters = new Dictionary<string, object?> {
								{ "@HeroId", hero.Id },
								{ "@Content", string.IsNullOrEmpty(content) ? DBNull.Value : content},
						};
			await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
		}

		private async Task<List<MetaChat>> GetChatFromDB(MySqlConnection connection, MySqlTransaction transaction)
		{
			if (connection.State != System.Data.ConnectionState.Open)
			{
				await connection.OpenAsync();
			}
			if (transaction == null)
			{
				_logger.LogError("Transaction is null.");
				throw new InvalidOperationException("Transaction is required for this operation.");
			}
			string sql = @"
                SELECT m.*, h.name as hero_name
                FROM maxhanna.meta_chat m
                LEFT JOIN maxhanna.meta_hero h on h.id = m.hero_id
                ORDER BY timestamp DESC 
                LIMIT 100;";
			MySqlCommand cmd = new MySqlCommand(sql, connection, transaction);
			List<MetaChat> chat = new List<MetaChat>();
			using (var reader = await cmd.ExecuteReaderAsync())
			{
				while (reader.Read())
				{
					MetaHero? tmpHero = new MetaHero() { Id = Convert.ToInt32(reader["hero_id"]), Name = Convert.ToString(reader["hero_name"]) };
					MetaChat tmpChat = new MetaChat() { Hero = tmpHero, Content = Convert.ToString(reader["content"]), Timestamp = Convert.ToDateTime(reader["timestamp"]) };
					chat.Add(tmpChat);
				}
			}
			return chat;
		}

		private async Task<List<MetaEvent>> GetEventsFromDb(string map, MySqlConnection connection, MySqlTransaction transaction)
		{
			if (connection.State != System.Data.ConnectionState.Open)
			{
				await connection.OpenAsync();
			}
			if (transaction == null)
			{
				_logger.LogError("Transaction is null.");
				throw new InvalidOperationException("Transaction is required for this operation.");
			}
			string sql = @"
                DELETE FROM maxhanna.meta_event WHERE timestamp < NOW() - INTERVAL 20 SECOND;
                SELECT *
                FROM maxhanna.meta_event 
                WHERE map = @Map;";
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

			if (user == null && heroId == null)
			{
				return null;
			}

			// Fetch hero and associated metabots
			string sql = $@"
        SELECT 
            h.id as hero_id, h.coordsX, h.coordsY, h.map, h.speed, h.name as hero_name, h.color as hero_color,
            b.id as bot_id, b.name as bot_name, b.type as bot_type, b.hp as bot_hp, 
            b.level as bot_level, b.exp as bot_exp 
        FROM 
            maxhanna.meta_hero h
        LEFT JOIN 
            maxhanna.meta_bot b ON h.id = b.hero_id
        WHERE 
            {(heroId == null ? "h.user_id = @UserId" : "h.id = @UserId")}
        ;";

			MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
			cmd.Parameters.AddWithValue("@UserId", heroId != null ? heroId : (user?.Id ?? 0));

			MetaHero? hero = null;
			List<MetaBot> metabots = new List<MetaBot>();

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
							Map = Convert.ToString(reader["map"]),
							Name = Convert.ToString(reader["hero_name"]),
							Color = Convert.ToString(reader["hero_color"]),
							Metabots = new List<MetaBot>()
						};
					}

					// Check if there's a MetaBot associated with this hero
					if (!reader.IsDBNull(reader.GetOrdinal("bot_id")))
					{
						MetaBot bot = new MetaBot
						{
							Id = Convert.ToInt32(reader["bot_id"]),
							Name = Convert.ToString(reader["bot_name"]),
							Type = Convert.ToInt32(reader["bot_type"]),
							Hp = Convert.ToInt32(reader["bot_hp"]),
							Level = Convert.ToInt32(reader["bot_level"]),
							Exp = Convert.ToInt32(reader["bot_exp"]), 
							HeroId = hero.Id
						};
						metabots.Add(bot);
					}
				}
			}

			if (hero != null)
			{
				hero.Metabots = metabots; // Attach metabots to the hero
			}

			return hero;
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

			Dictionary<int, MetaHero> heroesDict = new Dictionary<int, MetaHero>();
			string sql = @"
        SELECT 
            m.id as hero_id, m.name as hero_name, m.map as hero_map, m.coordsX, m.coordsY, m.speed, m.color,
            b.id as metabot_id, b.name as metabot_name, b.type as metabot_type, b.hp as metabot_hp, b.level as metabot_level, b.exp as metabot_exp 
        FROM 
            maxhanna.meta_hero m 
        LEFT JOIN
            maxhanna.meta_bot b on b.hero_id = m.id
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
							Map = Convert.ToString(reader["hero_map"]),
							Color = Convert.ToString(reader["color"]),
							Position = new Vector2(Convert.ToInt32(reader["coordsX"]), Convert.ToInt32(reader["coordsY"])),
							Speed = Convert.ToInt32(reader["speed"]),
							Metabots = []
						};
						heroesDict[heroId] = tmpHero;
					}

					// If there's a MetaBot in this row, add it to the MetaHero's MetaBots list
					if (!reader.IsDBNull(reader.GetOrdinal("metabot_id")))
					{
						MetaBot metaBot = new MetaBot
						{
							Id = Convert.ToInt32(reader["metabot_id"]),
							Name = Convert.ToString(reader["metabot_name"]),
							HeroId = heroId,
							Type = Convert.ToInt32(reader["metabot_type"]),
							Hp = Convert.ToInt32(reader["metabot_hp"]),
							Exp = Convert.ToInt32(reader["metabot_exp"]),
							Level = Convert.ToInt32(reader["metabot_level"]), 
						};

						tmpHero.Metabots.Add(metaBot);
					}
				}
			}

			return heroesDict.Values.ToArray();
		}
		private async Task<MetaInventoryItem[]?> GetInventoryFromDB(MetaHero hero, MySqlConnection conn, MySqlTransaction transaction)
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
			List<MetaInventoryItem> inventory = new List<MetaInventoryItem>();
			string sql = @"
                    SELECT *
                    FROM 
                        maxhanna.meta_hero_inventory 
                    WHERE meta_hero_id = @HeroId;";

			MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
			cmd.Parameters.AddWithValue("@HeroId", hero.Id);

			using (var reader = await cmd.ExecuteReaderAsync())
			{
				while (reader.Read())
				{
					MetaInventoryItem tmpInventoryItem = new MetaInventoryItem(
						id: Convert.ToInt32(reader["id"]),
						heroId: Convert.ToInt32(reader["meta_hero_id"]),
						created: Convert.ToDateTime(reader["created"]),
						name: Convert.ToString(reader["name"]),
						image: Convert.ToString(reader["image"]),
						category: Convert.ToString(reader["category"])
					);
	 
					inventory.Add(tmpInventoryItem);
				}
			}
			return inventory.ToArray();
		}

		private void SetMapBoundaries()
		{
			for (int i = 0; i < 4; i++)
			{
				map0Boundaries.Add(new Vector2(210 + (i * 5), 45));
			}
			for (int i = 0; i < 4; i++)
			{
				map1Boundaries.Add(new Vector2(210 + (i * 5), 35));
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
