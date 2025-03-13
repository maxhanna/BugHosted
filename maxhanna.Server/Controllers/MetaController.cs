using maxhanna.Server.Controllers.DataContracts.Meta;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System;
using System.Text;
using System.Text.Json;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Microsoft.AspNetCore.Components.Route("[controller]")]
	public class MetaController : ControllerBase
	{
		private readonly ILogger<MetaController> _logger;
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
						//List<MetaChat> chat = await GetChatFromDB(connection, transaction);
						List<MetaEvent> events = await GetEventsFromDb(hero.Map, connection, transaction);
						await transaction.CommitAsync();
						return Ok(new
						{
							map = hero.Map,
							hero.Position,
							heroes,
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
						MetaBotPart[]? parts = await GetMetabotPartsFromDB(hero, connection, transaction);
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

		[HttpPost("/Meta/UpdateEvents", Name = "UpdateEvents")]
		public async Task<IActionResult> UpdateEvents([FromBody] MetaEvent metaEvent)
		{
			Console.WriteLine($"POST /Meta/UpdateEvents (Hero Id: {metaEvent.HeroId}, Event: {metaEvent.EventType})");

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

		[HttpPost("/Meta/DeleteEvent", Name = "DeleteEvent")]
		public async Task<IActionResult> DeleteEvent([FromBody] DeleteEventRequest req)
		{
			Console.WriteLine($"POST /Meta/DeleteEvent");
			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();
				using (var transaction = connection.BeginTransaction())
				{
					try
					{
						string sql = @"DELETE FROM maxhanna.meta_event WHERE id = @EventId LIMIT 1;";
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
						string sql = @"INSERT INTO maxhanna.meta_hero (name, user_id, coordsX, coordsY, speed)
                          SELECT @Name, @UserId, @CoordsX, @CoordsY, @Speed
													WHERE NOT EXISTS (
															SELECT 1 FROM maxhanna.meta_hero WHERE user_id = @UserId OR name = @Name
													);";
						int posX = 1 * 16;
						int posY = 11 * 16;
						Dictionary<string, object?> parameters = new Dictionary<string, object?>
												{
														{ "@CoordsX", posX },
														{ "@CoordsY", posY },
														{ "@Speed", 1 },
														{ "@Name", req.Name ?? "Anonymous"},
														{ "@UserId", req.User?.Id ?? 0}
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
						heroBot.Level = bot.Level;
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



		[HttpPost("/Meta/UpdateBotParts", Name = "UpdateBotParts")]
		public async Task<IActionResult> UpdateBotParts([FromBody] UpdateBotPartsRequest req)
		{
			Console.WriteLine($"POST /Meta/UpdateBotParts (UserId: {req.Hero.Id}, Parts: {req.Parts?.Length})");

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
						string sql = @"INSERT INTO maxhanna.meta_bot_part 
                               (hero_id, part_name, type, damage_mod, skill) 
                               VALUES (@HeroId, @PartName, @Type, @DamageMod, @Skill);";

						foreach (var part in req.Parts)
						{
							var parameters = new Dictionary<string, object?>
										{
												{ "@HeroId", req.Hero.Id },
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

		[HttpPost("/Meta/EquipPart", Name = "EquipPart")]
		public async Task<IActionResult> EquipPart([FromBody] EquipPartRequest req)
		{
			Console.WriteLine($"POST /Meta/EquipPart");
			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();
				using (var transaction = connection.BeginTransaction())
				{
					try
					{
						string sql = @"UPDATE maxhanna.meta_bot_part SET metabot_id = @MetabotId WHERE id = @PartId LIMIT 1;";
						Dictionary<string, object?> parameters = new Dictionary<string, object?>
												{
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


		[HttpPost("/Meta/UnequipPart", Name = "UnequipPart")]
		public async Task<IActionResult> UnequipPart([FromBody] EquipPartRequest req)
		{
			Console.WriteLine($"POST /Meta/UnequipPart");
			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();
				using (var transaction = connection.BeginTransaction())
				{
					try
					{
						string sql = @"UPDATE maxhanna.meta_bot_part SET metabot_id = NULL WHERE id = @PartId LIMIT 1;";
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


		[HttpPost("/Meta/SellBotParts", Name = "SellBotParts")]
		public async Task<IActionResult> SellBotParts([FromBody] SellBotPartsRequest req)
		{
			Console.WriteLine($"POST /Meta/SellBotParts");
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
							INSERT INTO maxhanna.meta_hero_crypto (hero_id, crypto_balance)
							SELECT hero_id, SUM(damage_mod * 10)
							FROM maxhanna.meta_bot_part
							WHERE id IN ({partIdsString})
							GROUP BY hero_id
							ON DUPLICATE KEY UPDATE crypto_balance = crypto_balance + VALUES(crypto_balance);
 
							DELETE FROM maxhanna.meta_bot_part
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
			//Console.WriteLine("hero coords X " + hero.Position.x + " hero coordsY" + hero.Position.y  + " bots: " + hero.Metabots);
			string sql = @"UPDATE maxhanna.meta_hero 
                            SET coordsX = @CoordsX, 
                                coordsY = @CoordsY, 
                                color = @Color,  
                                mask = @Mask,  
                                map = @Map,
																speed = @Speed
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
					@"UPDATE maxhanna.meta_bot 
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
						{ "@IsDeployed", metabot.IsDeployed ? 1 : 0 }, // Convert boolean to bit
						{ "@MetabotId", metabot.Id }
				};

				await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
			}
			catch (Exception ex)
			{
				Console.WriteLine(ex.ToString());
			} 
		}

		private async Task UpdateEventsInDB(MetaEvent @event, MySqlConnection connection, MySqlTransaction transaction)
		{
			Console.WriteLine("inserting event in db : " + @event.EventType);
			try
			{
				string sql = @"DELETE FROM maxhanna.meta_event WHERE timestamp < NOW() - INTERVAL 20 SECOND;
                            INSERT INTO maxhanna.meta_event (hero_id, event, map, data)
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
				Console.WriteLine(ex.ToString());
			} 
		}

		private async Task UpdateInventoryInDB(UpdateMetaHeroInventoryRequest request, MySqlConnection connection, MySqlTransaction transaction)
		{
			if (request.Hero != null)
			{
				string sql = @"
					INSERT INTO meta_hero_inventory (meta_hero_id, name, image, category, quantity) 
					VALUES (@HeroId, @Name, @Image, @Category, @Quantity)
					ON DUPLICATE KEY UPDATE 
						quantity = quantity + @Quantity;";

				Dictionary<string, object?> parameters = new Dictionary<string, object?>
				{
					{ "@HeroId", request.Hero.Id },
					{ "@Name", request.Name },
					{ "@Image", request.Image },
					{ "@Category", request.Category },
					{ "@Quantity", 1 } // assuming each addition increases quantity by 1
				};

				await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
			} 
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

			// Fetch hero, associated metabots, and metabot parts
			string sql = $@"
        SELECT 
            h.id as hero_id, h.coordsX, h.coordsY, h.map, h.speed, h.name as hero_name, h.color as hero_color, h.mask as hero_mask,
            b.id as bot_id, b.name as bot_name, b.type as bot_type, b.hp as bot_hp, b.is_deployed as bot_is_deployed,
            b.level as bot_level, b.exp as bot_exp,
            p.id as part_id, p.part_name, p.type as part_type, p.damage_mod, p.skill
        FROM 
            maxhanna.meta_hero h
        LEFT JOIN 
            maxhanna.meta_bot b ON h.id = b.hero_id
        LEFT JOIN
            maxhanna.meta_bot_part p ON b.id = p.metabot_id
        WHERE 
            {(heroId == null ? "h.user_id = @UserId" : "h.id = @UserId")}
        ;";

			MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
			cmd.Parameters.AddWithValue("@UserId", heroId != null ? heroId : (user?.Id ?? 0));

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
								hero.Metabots = [];
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
							switch (part.PartName.ToLower())
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
            maxhanna.meta_hero m 
        LEFT JOIN
            maxhanna.meta_bot b on b.hero_id = m.id
        LEFT JOIN
            maxhanna.meta_bot_part p ON b.id = p.metabot_id
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

						MetaBot? metabot = tmpHero.Metabots.FirstOrDefault(m => m.Id == metabotId);
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
							switch (part.PartName.ToLower())
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
						category: Convert.ToString(reader["category"]),
						quantity: reader.IsDBNull(reader.GetOrdinal("quantity")) ? null : Convert.ToInt32(reader["quantity"])
					);

					inventory.Add(tmpInventoryItem);
				}
			}
			return inventory.ToArray();
		}


		private async Task<MetaBotPart[]?> GetMetabotPartsFromDB(MetaHero hero, MySqlConnection conn, MySqlTransaction transaction)
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
			List<MetaBotPart> partInv = new List<MetaBotPart>();
			string sql = @"
                    SELECT *
                    FROM 
                        maxhanna.meta_bot_part 
                    WHERE hero_id = @HeroId;";

			MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
			cmd.Parameters.AddWithValue("@HeroId", hero.Id);

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
			string sql = @"UPDATE maxhanna.meta_bot SET hp = 100 WHERE hero_id = @heroId;";

			Dictionary<string, object?> parameters = new Dictionary<string, object?>
			{
					{ "@heroId", heroId },
			};

			await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction); 
		} 

		private async Task DeployMetabot(int metabotId, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				string sql = @"UPDATE maxhanna.meta_bot SET is_deployed = 1 WHERE id = @botId AND hp > 0 LIMIT 1;";

				Dictionary<string, object?> parameters = new Dictionary<string, object?>
				{
						{ "@botId", metabotId },
				};
			 
				await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction); 
			}
			catch (Exception ex)
			{
				Console.WriteLine("Exception DeployMetabot: " + ex.Message);
			}
		}
		private async Task CallBackMetabot(int heroId, int? metabotId, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				string sql = @"
        UPDATE maxhanna.meta_bot 
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
				Console.WriteLine("Exception DeployMetabot: " + ex.Message);
			}
		}

		private async Task DestroyMetabot(int heroId, int? metabotId, MySqlConnection connection, MySqlTransaction transaction)
		{
			Console.WriteLine($"Destroying bot {metabotId} from user {heroId}.");
			try
			{
				string sql = @"
					UPDATE maxhanna.meta_bot 
					SET is_deployed = 0, hp = 0 
					WHERE hero_id = @heroId"
						+ (metabotId.HasValue ? " AND id = @botId" : "");

				Dictionary<string, object?> parameters = new Dictionary<string, object?>
				{
						{ "@heroId", heroId },
				};
				if (metabotId.HasValue) {
					parameters.Add("@botId", metabotId.Value);
				} 
				await this.ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
			}
			catch (Exception ex)
			{
				Console.WriteLine("Exception DeployMetabot: " + ex.Message);
			}
		}

		private async Task PerformEventChecks(MetaEvent metaEvent, MySqlConnection connection, MySqlTransaction transaction)
		{
			Console.WriteLine("Performing event checks on " + metaEvent.EventType);
			// Handle target locking logic
			if (metaEvent.EventType == "TARGET_LOCKED")
			{
				Console.WriteLine("target_locked event, this is data: ");
				Console.WriteLine("sourceId: " + metaEvent.Data["sourceId"]);
				Console.WriteLine("targetId: " + metaEvent.Data["targetId"]);
				string lockKey = $"{metaEvent.Data["sourceId"]}:{metaEvent.Data["targetId"]}";

				if (!activeLocks.ContainsKey(lockKey))
				{
					Console.WriteLine($"Starting DPS for {lockKey}");

					// Create cancellation token sources for both bots
					var sourceId = metaEvent.Data["sourceId"];
					var targetId = metaEvent.Data["targetId"];
					var ctsSource = new CancellationTokenSource();
					var ctsTarget = new CancellationTokenSource();

					// Add both locks for each bot to start DPS on both sides
					activeLocks[lockKey] = ctsSource;
					activeLocks[$"{targetId}:{sourceId}"] = ctsTarget; // Reverse lock for the target's attack

					// Start DPS for both bots attacking each other
					StartDamageOverTimeForBothBots(sourceId, targetId, ctsSource.Token);
				}
			}
			else if (metaEvent.EventType == "TARGET_UNLOCK")
			{
				StopAttackDamageOverTimeForBothBots(Convert.ToInt32(metaEvent.Data["sourceId"]), Convert.ToInt32(metaEvent.Data["targetId"]));
			}
			else if (metaEvent.EventType == "REPAIR_ALL_METABOTS")
			{
				int heroId = Convert.ToInt32(metaEvent.Data["heroId"]);

				Console.WriteLine($"Repairing all bots for {heroId}");
				await RepairAllMetabots(heroId, connection, transaction);
			}
			else if (metaEvent.EventType == "DEPLOY")
			{
				if (metaEvent.Data.TryGetValue("metaBot", out var metaBotJsonElement))
				{
					// Parse the metaBot JSON string
					var metaBotJson = JsonDocument.Parse(metaBotJsonElement.ToString()).RootElement;

					if (metaBotJson.TryGetProperty("id", out var idElement))
					{
						int metabotId = idElement.GetInt32();
						await DeployMetabot(metabotId, connection, transaction);
						Console.WriteLine($"Deployed MetaBot ID: {metabotId}");
					}
				}
			}
			else if (metaEvent.EventType == "CALL_BOT_BACK")
			{
				int heroId = metaEvent.HeroId;
				await CallBackMetabot(heroId, null, connection, transaction);
				Console.WriteLine($"Called Back MetaBots with HeroID: {heroId}");
			}
			else if (metaEvent.EventType == "BOT_DESTROYED")
			{
				int heroId = metaEvent.HeroId;
				await DestroyMetabot(heroId, null, connection, transaction);
				Console.WriteLine($"Called Back MetaBots with HeroID: {heroId}");
			}
			else if (metaEvent.EventType == "CREATE_ENEMY")
			{
				MetaBot? bot = null;
				if (metaEvent.Data.TryGetValue("bot", out var metaBotJsonElement))
				{
					// Parse the metaBot JSON string
					var metaBotJson = JsonDocument.Parse(metaBotJsonElement.ToString()).RootElement; 
					Console.WriteLine($"CREATED ENEMY with this json: " + metaBotJson);
					if (metaBotJson.TryGetProperty("id", out var idElement))
					{
						int metabotId = idElement.GetInt32(); 
					}
				} 
			}
		}

		private static void StopAttackDamageOverTimeForBothBots(int? sourceId, int? targetId)
		{
			string lockKey = $"{sourceId}:{targetId}";
			Console.WriteLine($"Stopping DPS for {lockKey}");
			if (activeLocks.ContainsKey(lockKey))
			{
				// Cancel DPS for both source and target
				activeLocks[lockKey].Cancel();
				activeLocks.Remove(lockKey);
			} 
			// Remove the reverse lock as well
			string reverseLockKey = $"{targetId}:{sourceId}";
			if (activeLocks.ContainsKey(reverseLockKey))
			{
				activeLocks[reverseLockKey].Cancel();
				activeLocks.Remove(reverseLockKey);
			}
		}

		private async Task StartDamageOverTimeForBothBots(string sourceId, string targetId, CancellationToken cancellationToken)
		{
			// Add the logic of handling damage over time to both bots here (not calling StartDamageOverTime twice).
			bool attackerStopped = false, defenderStopped = false;
			string map = "";
			while (!cancellationToken.IsCancellationRequested)
			{
				Console.WriteLine($"Applying DPS from {sourceId} to {targetId}"); 
				MetaBot? attackingBot = null, defendingBot = null;
				try
				{
					using (var connection = new MySqlConnection(_connectionString))
					{
						await connection.OpenAsync();
						using (MySqlTransaction transaction = await connection.BeginTransactionAsync())
						{
							// 1. Fetch attacker & defender in a single query
							string fetchBotsSql = @"
							SELECT 
								mb.id, 
								mb.type, 
								mb.exp, 
								mb.level, 
								mb.hp,
								mb.hero_id,
								mb.is_deployed,
								mh.map
							FROM maxhanna.meta_bot AS mb
							LEFT JOIN maxhanna.meta_hero AS mh on mh.id = mb.hero_id 
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
										var bot = new MetaBot
										{
											Id = reader.GetInt32(0),
											Type = reader.GetInt32(1),
											Exp = reader.GetInt32(2),
											Level = reader.GetInt32(3),
											Hp = reader.GetInt32(4),
											HeroId = reader.GetInt32(5),
											IsDeployed = reader.GetBoolean(6),
										};
										map = reader.GetString(7);
										if (bot.Id.ToString() == sourceId) attackingBot = bot;
										else defendingBot = bot;
									}
								}
							}

							if (attackingBot == null || defendingBot == null)
							{
								Console.WriteLine("One or both bots are missing, stopping DPS.");
								attackerStopped = true;
								defenderStopped = true;
							}
							if (!attackerStopped && !defenderStopped && attackingBot?.Hp <= 0)
							{
								Console.WriteLine($"Attacking bot {sourceId} has died. Stopping DPS.");
								attackerStopped = true; 
								await HandleDeadMetabot(map, defendingBot, attackingBot, connection, transaction);

							}

							if (!attackerStopped && !defenderStopped && defendingBot?.Hp <= 0)
							{
								Console.WriteLine($"Defending bot {targetId} has died. Stopping DPS.");
								defenderStopped = true;
								await HandleDeadMetabot(map, attackingBot, defendingBot, connection, transaction); 
							}


							if (!attackerStopped && !defenderStopped)
							{
								// 2. Check if a TARGET_UNLOCKED event has occurred for either bot
								string checkEventSql = @"
                    SELECT COUNT(*) 
                    FROM maxhanna.meta_event 
                    WHERE event = 'TARGET_UNLOCKED' 
                        AND (JSON_EXTRACT(data, '$.sourceId') = @SourceId AND JSON_EXTRACT(data, '$.targetId') = @TargetId)
                        OR (JSON_EXTRACT(data, '$.sourceId') = @TargetId AND JSON_EXTRACT(data, '$.targetId') = @SourceId)
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
									Console.WriteLine("TARGET_UNLOCKED event detected. Stopping DPS for both bots.");
									attackerStopped = true;
									defenderStopped = true;
								}

								if (!attackerStopped && !defenderStopped)
								{
									// 3. Fetch last used bot part for both bots
									MetaBotPart attackingPart = GetLastUsedPart(attackingBot.Id, connection, transaction);
									MetaBotPart defendingPart = GetLastUsedPart(defendingBot.Id, connection, transaction);

									// 4. Apply damage to both bots every second
									ApplyDamageToBothBots(attackingBot, defendingBot, attackingPart, defendingPart, connection, transaction);

									// Check if either bot's HP is 0 or below, if so, stop DPS
									if (attackingBot.Hp <= 0)
									{
										Console.WriteLine($"Attacking bot {attackingBot.Id} has died. Stopping DPS.");
										attackerStopped = true;
										await HandleDeadMetabot(map, defendingBot, attackingBot, connection, transaction); 
									}

									if (defendingBot.Hp <= 0)
									{
										defenderStopped = true;
										await HandleDeadMetabot(map, attackingBot, defendingBot, connection, transaction);
									}
								}
							}

							await transaction.CommitAsync();
						}
					}
				}
				catch (Exception ex)
				{
					Console.WriteLine($"DPS Error: {ex.Message}");
				}

				// Exit the loop if both bots are stopped

				if (attackerStopped || defenderStopped)
				{
					StopAttackDamageOverTimeForBothBots(attackingBot?.Id, defendingBot?.Id);
					return;
				}

				await Task.Delay(1000); // Apply damage every 1 second
			}
		}

		private async Task HandleDeadMetabot(string map, MetaBot? winnerBot, MetaBot? deadBot, MySqlConnection connection, MySqlTransaction transaction)
		{ 
			Console.WriteLine($"Bot {deadBot.Id} has died. Stopping DPS."); 
			MetaEvent tmpEvent = new MetaEvent(0, deadBot.HeroId, DateTime.Now, "BOT_DESTROYED", map, null);
			await UpdateEventsInDB(tmpEvent, connection, transaction);
			await DestroyMetabot(deadBot.HeroId, deadBot.Id, connection, transaction);
			await AwardExpToPlayer(winnerBot, deadBot, connection, transaction); 
		}

		private async Task AwardExpToPlayer(MetaBot player, MetaBot enemy, MySqlConnection connection, MySqlTransaction transaction)
		{
			Console.WriteLine("before awarding exp, current exp : " + player.Exp);
			player.Exp += enemy.Level;
			int expForNextLevel = CalculateExpForNextLevel(player);
		 
			// Check if the bot's experience exceeds the experience needed for the next level
			while (player.Exp >= expForNextLevel)
			{
				player.Exp -= expForNextLevel; // Subtract the required experience for leveling up
				player.Level++;
				expForNextLevel = CalculateExpForNextLevel(player);
			}
			Console.WriteLine($"Bot {player.Id} awarded {enemy.Level} exp. Current exp : {player.Exp}"); 
			await UpdateMetabotInDB(player, connection, transaction);
		}

		private int CalculateExpForNextLevel(MetaBot player)
		{ 
			return (player.Level + 1) * 15;
		}

		private MetaBotPart GetLastUsedPart(int botId, MySqlConnection connection, MySqlTransaction? transaction)
		{
			string fetchPartSql = @"
        SELECT part_name, damage_mod, skill, type 
        FROM maxhanna.meta_bot_part 
        WHERE metabot_id = @BotId 
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
				command.Parameters.AddWithValue("@BotId", botId);

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

			return part;
		}

		private void ApplyDamageToBothBots(MetaBot attackingBot, MetaBot defendingBot, MetaBotPart attackingPart, MetaBotPart defendingPart, MySqlConnection connection, MySqlTransaction transaction)
		{
			// 1. Calculate damage for both bots using the same formula
			int appliedDamageToDefender = CalculateDamage(attackingBot, defendingBot, attackingPart);
			int appliedDamageToAttacker = CalculateDamage(defendingBot, attackingBot, defendingPart);

			// 2. Apply damage to both bots in the database
			string updateSql = @"
        UPDATE maxhanna.meta_bot AS bot
        LEFT JOIN maxhanna.meta_bot_part AS part ON part.metabot_id = bot.id AND part.part_name = @PartName
        SET 
            bot.hp = GREATEST(bot.hp - @Damage, 0), 
            bot.is_deployed = CASE 
                WHEN GREATEST(bot.hp - @Damage, 0) = 0 THEN 0
                ELSE bot.is_deployed 
            END,
            part.last_used = NOW() 
        WHERE bot.id = @TargetId";

			// Apply damage to the defender
			using (var command = new MySqlCommand(updateSql, connection, transaction))
			{
				command.Parameters.AddWithValue("@Damage", appliedDamageToDefender);
				command.Parameters.AddWithValue("@TargetId", defendingBot.Id);
				command.Parameters.AddWithValue("@PartName", attackingPart.PartName);
				command.ExecuteNonQuery();
			}

			// Apply damage to the attacker
			using (var command = new MySqlCommand(updateSql, connection, transaction))
			{
				command.Parameters.AddWithValue("@Damage", appliedDamageToAttacker);
				command.Parameters.AddWithValue("@TargetId", attackingBot.Id);
				command.Parameters.AddWithValue("@PartName", defendingPart.PartName);
				command.ExecuteNonQuery();
			}

			Console.WriteLine($"{attackingBot.Id}({attackingBot.Hp}) dealt {appliedDamageToDefender} damage to {defendingBot.Id}({defendingBot.Hp})! {DateTime.Now.ToString()}");
			Console.WriteLine($"{defendingBot.Id}({defendingBot.Hp}) dealt {appliedDamageToAttacker} damage to {attackingBot.Id}({attackingBot.Hp})! {DateTime.Now.ToString()}");
		}

		private int CalculateDamage(MetaBot attacker, MetaBot defender, MetaBotPart attackingPart)
		{
			// Determine type effectiveness
			float typeMultiplier = 1.0f;
			if (TypeEffectiveness.TryGetValue((SkillType)attackingPart.Skill.Type, out SkillType effectiveAgainst)
											 && (int)effectiveAgainst == defender.Type)
			{
				typeMultiplier = 2.0f; // Super Effective
			}
			else if (TypeEffectiveness.TryGetValue((SkillType)defender.Type, out SkillType strongAgainst)
											 && (int)strongAgainst == attackingPart.Skill.Type)
			{
				typeMultiplier = 0.5f; // Not Effective
			}

			// Calculate base damage and apply the multiplier
			int baseDamage = attacker.Level * attackingPart.DamageMod;
			int appliedDamage = (int)(baseDamage * typeMultiplier);

			return appliedDamage > 0 ? appliedDamage : 0;
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
