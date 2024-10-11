using maxhanna.Server.Controllers.DataContracts.Meta;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
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
			//Console.WriteLine("hero coords X " + hero.CoordsX + " hero coordsY" + hero.CoordsY);
			string sql = @"UPDATE maxhanna.meta_hero 
                            SET coordsX = @CoordsX, 
                                coordsY = @CoordsY,  
                                map = @Map 
                            WHERE 
                                id = @HeroId";
			Dictionary<string, object?> parameters = new Dictionary<string, object?>
						{
								{ "@CoordsX", hero.Position.x },
								{ "@CoordsY", hero.Position.y },
								{ "@Map", hero.Map },
								{ "@HeroId", hero.Id }
						};
			await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
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
				string sql = @"INSERT INTO meta_hero_inventory (meta_hero_id, name, image) VALUES (@HeroId, @Name, @Image);";
				Dictionary<string, object?> parameters = new Dictionary<string, object?>
						{
								{ "@HeroId", request.Hero.Id },
								{ "@Name", request.Name },
								{ "@Image", request.Image != null ? request.Image : DBNull.Value }
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
			if (user == null && heroId == null) { return null; }

			string sql = $@"
                    SELECT 
                        *
                    FROM 
                        maxhanna.meta_hero 
                    WHERE 
                        {(heroId == null ? "user_id = @UserId" : "id = @UserId")} 
                    LIMIT 1;";

			MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
			cmd.Parameters.AddWithValue("@UserId", heroId != null ? heroId : (user?.Id ?? 0));

			using (var reader = await cmd.ExecuteReaderAsync())
			{
				while (reader.Read())
				{
					MetaHero hero = new MetaHero();
					hero.Position = new Vector2(Convert.ToInt32(reader["coordsX"]), Convert.ToInt32(reader["coordsY"]));
					hero.Speed = Convert.ToInt32(reader["speed"]);
					hero.Id = Convert.ToInt32(reader["id"]);
					hero.Map = Convert.ToString(reader["map"]);
					hero.Name = Convert.ToString(reader["name"]);
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
                        m.* 
                    FROM 
                        maxhanna.meta_hero m 
                    WHERE m.map = @HeroMapId
                    ORDER BY m.coordsY asc;";

			MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
			cmd.Parameters.AddWithValue("@HeroMapId", hero.Map);

			using (var reader = await cmd.ExecuteReaderAsync())
			{
				while (reader.Read())
				{
					MetaHero tmpHero = new MetaHero();
					tmpHero.Position = new Vector2(Convert.ToInt32(reader["coordsX"]), Convert.ToInt32(reader["coordsY"]));
					tmpHero.Speed = Convert.ToInt32(reader["speed"]);
					tmpHero.Id = Convert.ToInt32(reader["id"]);
					tmpHero.Name = Convert.ToString(reader["name"]);
					tmpHero.Map = Convert.ToString(reader["map"]);
					heroes.Add(tmpHero);
				}
			}
			return heroes.ToArray();
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
						Convert.ToInt32(reader["id"]),
						Convert.ToInt32(reader["meta_hero_id"]), 
						Convert.ToDateTime(reader["created"]),
						Convert.ToString(reader["name"]),
						reader.IsDBNull(reader.GetOrdinal("image")) ? null : Convert.ToString(reader["image"])
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
