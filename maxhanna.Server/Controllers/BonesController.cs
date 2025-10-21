using maxhanna.Server.Controllers.DataContracts.Bones;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.DataContracts.Files;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Text;
using System.Text.Json;
using Newtonsoft.Json.Linq;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Microsoft.AspNetCore.Components.Route("[controller]")]
	public class BonesController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;
		private readonly string _connectionString;
		private static Dictionary<string, CancellationTokenSource> activeLocks = new();
		private static readonly Dictionary<SkillType, SkillType> TypeEffectiveness = new()
		{
				{ SkillType.SPEED, SkillType.ARMOR },
				{ SkillType.STRENGTH, SkillType.STEALTH },
				{ SkillType.ARMOR, SkillType.RANGED },
				{ SkillType.RANGED, SkillType.INTELLIGENCE },
				{ SkillType.STEALTH, SkillType.SPEED },
				{ SkillType.INTELLIGENCE, SkillType.STRENGTH }
		};

		private enum SkillType { NORMAL = 0, SPEED = 1, STRENGTH = 2, ARMOR = 3, RANGED = 4, STEALTH = 5, INTELLIGENCE = 6 }

		public BonesController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
		}

		// NOTE: All endpoint names prefixed with Bones_ and routes changed to /Bones...

		[HttpPost("/Bones", Name = "Bones_GetHero")]
		public async Task<IActionResult> GetHero([FromBody] int userId)
		{
			_ = _log.Db("Get hero " + userId, userId, "BONES", true);
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				MetaHero? hero = await GetHeroData(userId, null, connection, transaction);
				await transaction.CommitAsync();
				return Ok(hero);
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				return StatusCode(500, "Internal server error: " + ex.Message);
			}
		}

		[HttpPost("/Bones/FetchGameData", Name = "Bones_FetchGameData")]
		public async Task<IActionResult> FetchGameData([FromBody] FetchGameDataRequest request)
		{
			var hero = request?.Hero ?? new MetaHero();
			_ = _log.Db("Fetch game data for hero " + hero.Id, hero.Id, "BONES", true);
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				// If client provided recentAttacks, persist them as short-lived ATTACK events so other players can pick them up in this fetch-response.
				if (request?.RecentAttacks != null && request.RecentAttacks.Count > 0)
				{
					try
					{
						foreach (var attack in request.RecentAttacks)
						{
							string insertSql = "INSERT INTO maxhanna.bones_event (hero_id, event, map, data, timestamp) VALUES (@HeroId, @Event, @Map, @Data, UTC_TIMESTAMP());";
							var parameters = new Dictionary<string, object?>()
							{
								{ "@HeroId", attack.ContainsKey("sourceHeroId") ? attack["sourceHeroId"] : hero.Id },
								{ "@Event", "ATTACK" },
								{ "@Map", hero.Map ?? string.Empty },
								{ "@Data", Newtonsoft.Json.JsonConvert.SerializeObject(attack) }
							};
							await ExecuteInsertOrUpdateOrDeleteAsync(insertSql, parameters, connection, transaction);
						}
					}
					catch (Exception ex)
					{
						await _log.Db("Failed to persist recentAttacks: " + ex.Message, hero.Id, "BONES", true);
					}
				}

				hero = await UpdateHeroInDB(hero, connection, transaction);
				MetaHero[]? heroes = await GetNearbyPlayers(hero, connection, transaction);
				MetaBot[]? enemyBots = await GetEncounterMetaBots(connection, transaction, hero.Map);
				List<MetaEvent> events = await GetEventsFromDb(hero.Map, hero.Id, connection, transaction);
				// Query recent ATTACK events (last 5 seconds) excluding attacks originating from this hero.
				List<Dictionary<string, object>> recentAttacks = new();
				try
				{
					string q = "SELECT data FROM maxhanna.bones_event WHERE event = 'ATTACK' AND timestamp >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 SECOND) AND hero_id <> @HeroId ORDER BY timestamp DESC LIMIT 50;";
					using var cmd = new MySqlCommand(q, connection, transaction);
					cmd.Parameters.AddWithValue("@HeroId", hero.Id);
					using var rdr = await cmd.ExecuteReaderAsync();
					while (await rdr.ReadAsync())
					{
						var dataJson = rdr.IsDBNull(rdr.GetOrdinal("data")) ? null : rdr.GetString(rdr.GetOrdinal("data"));
						if (!string.IsNullOrEmpty(dataJson))
						{
							try
							{
								var jo = JObject.Parse(dataJson);
								var dict = new Dictionary<string, object>();
								foreach (var prop in jo.Properties())
								{
									var token = prop.Value;
									if (token.Type == JTokenType.Integer)
									{
										dict[prop.Name] = token.ToObject<long>();
									}
									else if (token.Type == JTokenType.Float)
									{
										dict[prop.Name] = token.ToObject<double>();
									}
									else if (token.Type == JTokenType.Boolean)
									{
										dict[prop.Name] = token.ToObject<bool>();
									}
									else if (token.Type == JTokenType.String)
									{
										dict[prop.Name] = token.ToObject<string?>() ?? string.Empty;
									}
									else
									{
										// For arrays/objects/other token types, stringify them so client sees usable data
										dict[prop.Name] = token.ToString(Newtonsoft.Json.Formatting.None);
									}
								}
								recentAttacks.Add(dict);
							}
							catch { }
						}
					}
				}
				catch (Exception ex)
				{
					await _log.Db("Failed to read recentAttacks: " + ex.Message, hero.Id, "BONES", true);
				}

				await transaction.CommitAsync();
				var resp = new FetchGameDataResponse { Map = hero.Map, Position = hero.Position, Heroes = heroes, Events = events, EnemyBots = enemyBots, RecentAttacks = recentAttacks };
				return Ok(resp);
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				return StatusCode(500, "Internal server error: " + ex.Message);
			}
		}

		[HttpPost("/Bones/FetchInventoryData", Name = "Bones_FetchInventoryData")]
		public async Task<IActionResult> FetchInventoryData([FromBody] int heroId)
		{
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				MetaInventoryItem[]? inventory = await GetInventoryFromDB(heroId, connection, transaction);
				MetaBotPart[]? parts = await GetMetabotPartsFromDB(heroId, connection, transaction);
				await transaction.CommitAsync();
				return Ok(new { inventory, parts });
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				return StatusCode(500, "Internal server error: " + ex.Message);
			}
		}

		[HttpPost("/Bones/UpdateEvents", Name = "Bones_UpdateEvents")]
		public async Task<IActionResult> UpdateEvents([FromBody] MetaEvent metaEvent)
		{
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = await connection.BeginTransactionAsync();
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

		[HttpPost("/Bones/DeleteEvent", Name = "Bones_DeleteEvent")]
		public async Task<IActionResult> DeleteEvent([FromBody] DeleteEventRequest req)
		{
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				string sql = @"DELETE FROM maxhanna.bones_event WHERE id = @EventId LIMIT 1;";
				Dictionary<string, object?> parameters = new() { { "@EventId", req.EventId } };
				await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
				await transaction.CommitAsync();
				return Ok();
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				return StatusCode(500, "Internal server error: " + ex.Message);
			}
		}

		[HttpPost("/Bones/UpdateInventory", Name = "Bones_UpdateInventory")]
		public async Task<IActionResult> UpdateInventory([FromBody] UpdateMetaHeroInventoryRequest request)
		{
			if (request.HeroId == 0) return BadRequest("Hero ID must be supplied");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
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

		[HttpPost("/Bones/Create", Name = "Bones_CreateHero")]
		public async Task<IActionResult> CreateHero([FromBody] CreateMetaHeroRequest req)
		{
			_ = _log.Db("Create hero " + req.UserId, req.UserId, "BONES", true);
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				string sql = @"INSERT INTO maxhanna.bones_hero (name, user_id, coordsX, coordsY, speed, created, updated)
                          SELECT @Name, @UserId, @CoordsX, @CoordsY, @Speed, UTC_TIMESTAMP(), UTC_TIMESTAMP
								WHERE NOT EXISTS (
									SELECT 1 FROM maxhanna.bones_hero WHERE user_id = @UserId OR name = @Name
								);";
				int posX = 16;
				int posY = 11 * 16;
				Dictionary<string, object?> parameters = new()
				{
					{ "@CoordsX", posX }, { "@CoordsY", posY }, { "@Speed", 1 }, { "@Name", req.Name ?? "Anonymous"}, { "@UserId", req.UserId }
				};
				long? botId = await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
				await transaction.CommitAsync();

				try
				{
					string upsertNameSql = @"INSERT INTO maxhanna.user_settings (user_id, last_character_name) VALUES (@UserId, @Name) ON DUPLICATE KEY UPDATE last_character_name = VALUES(last_character_name);";
					using var upCmd = new MySqlCommand(upsertNameSql, connection, transaction);
					upCmd.Parameters.AddWithValue("@UserId", req.UserId);
					upCmd.Parameters.AddWithValue("@Name", req.Name ?? "");
					await upCmd.ExecuteNonQueryAsync();
				}
				catch { }

				MetaHero hero = new() { Position = new Vector2(posX, posY), Id = (int)botId!, Speed = 1, Map = "HeroRoom", Name = req.Name };
				return Ok(hero);
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				return StatusCode(500, "Internal server error: " + ex.Message);
			}
		}

		[HttpPost("/Bones/CreateBot", Name = "Bones_CreateBot")]
		public async Task<IActionResult> CreateBot([FromBody] MetaBot bot)
		{
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				if (bot.HeroId < 0)
				{
					string checkSql = "SELECT COUNT(*) FROM maxhanna.bones_bot WHERE hero_id = @HeroId;";
					using var command = new MySqlCommand(checkSql, connection, transaction);
					command.Parameters.AddWithValue("@HeroId", bot.HeroId);
					int existingBotCount = Convert.ToInt32(await command.ExecuteScalarAsync());
					if (existingBotCount > 0)
					{
						await transaction.CommitAsync();
						return BadRequest("A bot with the same hero_id already exists.");
					}
				}

				string sql = @"INSERT INTO maxhanna.bones_bot (hero_id, name, type, hp, exp, level, is_deployed) 
                           VALUES (@HeroId, @Name, @Type, @Hp, @Exp, @Level, @IsDeployed);";
				var parametersForInsert = new Dictionary<string, object?>
				{
					{ "@HeroId", bot.HeroId }, { "@Name", bot.Name }, { "@Type", bot.Type }, { "@Hp", bot.Hp }, { "@Exp", bot.Exp }, { "@Level", bot.Level }, { "@IsDeployed", bot.IsDeployed }
				};
				long? botId = await ExecuteInsertOrUpdateOrDeleteAsync(sql, parametersForInsert, connection, transaction);
				if (botId == null) throw new Exception("Failed to create MetaBot");
				await transaction.CommitAsync();

				MetaBot heroBot = new()
				{
					Id = (int)botId,
					HeroId = bot.HeroId,
					Level = bot.Level,
					Name = bot.Name,
					Hp = bot.Hp,
					Type = bot.Type,
					IsDeployed = bot.IsDeployed,
					Head = bot.Head,
					Legs = bot.Legs,
					LeftArm = bot.LeftArm,
					RightArm = bot.RightArm
				};

				return Ok(heroBot);
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				return StatusCode(500, "Internal server error: " + ex.Message);
			}
		}

		[HttpPost("/Bones/UpdateBotParts", Name = "Bones_UpdateBotParts")]
		public async Task<IActionResult> UpdateBotParts([FromBody] UpdateBotPartsRequest req)
		{
			if (req.Parts == null || req.Parts.Length == 0) return BadRequest("No parts to update.");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = await connection.BeginTransactionAsync();
			try
			{
				string sql = @"INSERT INTO maxhanna.bones_bot_part (hero_id, part_name, type, damage_mod, skill) VALUES (@HeroId, @PartName, @Type, @DamageMod, @Skill);";
				foreach (var part in req.Parts)
				{
					var parameters = new Dictionary<string, object?>
					{
						{ "@HeroId", req.HeroId }, { "@PartName", part.PartName }, { "@Type", part.Type }, { "@DamageMod", part.DamageMod }, { "@Skill", part.Skill?.Name ?? "Headbutt" }
					};
					await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
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

		[HttpPost("/Bones/EquipPart", Name = "Bones_EquipPart")]
		public async Task<IActionResult> EquipPart([FromBody] EquipPartRequest req)
		{
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				string sql = @"UPDATE maxhanna.bones_bot_part SET metabot_id = @MetabotId WHERE id = @PartId LIMIT 1;";
				Dictionary<string, object?> parameters = new() { { "@MetabotId", req.MetabotId }, { "@PartId", req.PartId } };
				await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
				await transaction.CommitAsync();
				return Ok();
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				return StatusCode(500, "Internal server error: " + ex.Message);
			}
		}

		[HttpPost("/Bones/UnequipPart", Name = "Bones_UnequipPart")]
		public async Task<IActionResult> UnequipPart([FromBody] EquipPartRequest req)
		{
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				string sql = @"UPDATE maxhanna.bones_bot_part SET metabot_id = NULL WHERE id = @PartId LIMIT 1;";
				Dictionary<string, object?> parameters = new() { { "@PartId", req.PartId } };
				await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
				await transaction.CommitAsync();
				return Ok();
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				return StatusCode(500, "Internal server error: " + ex.Message);
			}
		}

		[HttpPost("/Bones/GetUserPartyMembers", Name = "Bones_GetUserPartyMembers")]
		public async Task<IActionResult> GetUserPartyMembers([FromBody] int userId)
		{
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			try
			{
				const string sql = @"SELECT DISTINCT h.id, h.name, h.color FROM (SELECT bones_hero_id_1 AS hero_id FROM bones_hero_party WHERE bones_hero_id_2 = @UserId UNION SELECT bones_hero_id_2 AS hero_id FROM bones_hero_party WHERE bones_hero_id_1 = @UserId UNION SELECT @UserId AS hero_id) AS party_members JOIN bones_hero h ON party_members.hero_id = h.id";
				using var command = new MySqlCommand(sql, connection);
				command.Parameters.AddWithValue("@UserId", userId);
				var partyMembers = new List<object>();
				using var reader = await command.ExecuteReaderAsync();
				while (await reader.ReadAsync())
				{
					int idOrdinal = reader.GetOrdinal("id");
					int nameOrdinal = reader.GetOrdinal("name");
					int colorOrdinal = reader.GetOrdinal("color");
					partyMembers.Add(
						new
						{
							heroId = reader.GetInt32(idOrdinal),
							name = reader.IsDBNull(nameOrdinal) ? null : reader.GetString(nameOrdinal),
							color = reader.IsDBNull(colorOrdinal) ? null : reader.GetString(colorOrdinal)
						});
				}
				return Ok(partyMembers);
			}
			catch (MySqlException ex)
			{
				await _log.Db($"Database error in Bones_GetUserPartyMembers for userId {userId}: {ex.Message} (Error Code: {ex.Number})", null, "BONES", true);
				return StatusCode(500, $"Database error: {ex.Message}");
			}
			catch (Exception ex)
			{
				await _log.Db($"Unexpected error in Bones_GetUserPartyMembers for userId {userId}: {ex.Message}", null, "BONES", true);
				return StatusCode(500, $"Internal server error: {ex.Message}");
			}
		}

		[HttpPost("/Bones/GetMetabotHighscores", Name = "Bones_GetMetabotHighscores")]
		public async Task<IActionResult> GetMetabotHighscores([FromBody] int count)
		{
			try
			{
				using var connection = new MySqlConnection(_connectionString);
				await connection.OpenAsync();
				string sql = @"SELECT mb.id as botId, mb.hero_id as heroId, mb.level, mb.exp, mh.user_id as ownerUserId, mh.name as heroName, u.id as user_id, u.username as username, udpfl.id as display_picture_file_id FROM maxhanna.bones_bot mb LEFT JOIN maxhanna.bones_hero mh ON mh.id = mb.hero_id LEFT JOIN maxhanna.users u ON u.id = mh.user_id LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id LEFT JOIN maxhanna.file_uploads udpfl ON udp.file_id = udpfl.id WHERE mh.name IS NOT NULL ORDER BY mb.level DESC, mb.exp DESC LIMIT @Count;";
				using var cmd = new MySqlCommand(sql, connection);
				cmd.Parameters.AddWithValue("@Count", Math.Max(1, count));
				using var rdr = await cmd.ExecuteReaderAsync();
				var results = new List<object>();
				while (await rdr.ReadAsync())
				{
					FileEntry? displayPic = !rdr.IsDBNull(rdr.GetOrdinal("display_picture_file_id")) ? new FileEntry(rdr.GetInt32(rdr.GetOrdinal("display_picture_file_id"))) : null;
					User? ownerUser = !rdr.IsDBNull(rdr.GetOrdinal("user_id")) ? new User(id: rdr.GetInt32(rdr.GetOrdinal("user_id")), username: rdr.IsDBNull(rdr.GetOrdinal("username")) ? "Anonymous" : SafeGetString(rdr, "username") ?? "Anonymous", displayPictureFile: displayPic) : null;
					results.Add(new { botId = rdr.GetInt32("botId"), heroId = rdr.IsDBNull(rdr.GetOrdinal("heroId")) ? (int?)null : rdr.GetInt32("heroId"), level = rdr.IsDBNull(rdr.GetOrdinal("level")) ? 0 : rdr.GetInt32("level"), exp = rdr.IsDBNull(rdr.GetOrdinal("exp")) ? 0 : rdr.GetInt32("exp"), owner = ownerUser, heroName = rdr.IsDBNull(rdr.GetOrdinal("heroName")) ? null : SafeGetString(rdr, "heroName") });
				}
				return Ok(results);
			}
			catch (Exception ex)
			{
				await _log.Db("Error fetching bones metabot highscores: " + ex.Message, null, "BONES", true);
				return StatusCode(500, "An error occurred fetching bones metabot highscores.");
			}
		}

		[HttpPost("/Bones/ActivePlayers", Name = "Bones_GetActivePlayers")]
		public async Task<IActionResult> GetBonesActivePlayers([FromBody] int? minutes)
		{
			int windowMinutes = minutes ?? 2;
			if (windowMinutes < 0) windowMinutes = 0;
			if (windowMinutes > 60 * 24) windowMinutes = 60 * 24;
			try
			{
				await using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();
				string sql = $"SELECT COUNT(DISTINCT user_id) AS activeCount FROM maxhanna.bones_hero h WHERE h.updated >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL {windowMinutes} MINUTE) AND h.user_id IS NOT NULL AND h.user_id > 0;";
				await using var cmd = new MySqlCommand(sql, conn);
				int activeCount = Convert.ToInt32(await cmd.ExecuteScalarAsync());
				return Ok(new { count = activeCount });
			}
			catch (Exception ex)
			{
				await _log.Db("Bones_GetActivePlayers Exception: " + ex.Message, null, "BONES", true);
				return StatusCode(500, "Internal server error");
			}
		}

		[HttpPost("/Bones/GetUserRank", Name = "Bones_GetUserRank")]
		public async Task<IActionResult> GetBonesUserRank([FromBody] int userId)
		{
			if (userId <= 0) return BadRequest("Invalid user id");
			try
			{
				await using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();
				const string userLevelSql = @"SELECT COALESCE(MAX(mb.level),0) FROM maxhanna.bones_bot mb JOIN maxhanna.bones_hero mh ON mh.id = mb.hero_id WHERE mh.user_id = @UserId;";
				await using (var userLevelCmd = new MySqlCommand(userLevelSql, conn))
				{
					userLevelCmd.Parameters.AddWithValue("@UserId", userId);
					int userLevel = Convert.ToInt32(await userLevelCmd.ExecuteScalarAsync());
					const string totalPlayersSql = @"SELECT COUNT(DISTINCT mh.user_id) FROM maxhanna.bones_bot mb JOIN maxhanna.bones_hero mh ON mh.id = mb.hero_id;";
					int totalPlayers = 0;
					await using (var totalCmd = new MySqlCommand(totalPlayersSql, conn))
					{
						totalPlayers = Convert.ToInt32(await totalCmd.ExecuteScalarAsync());
					}
					if (userLevel == 0) return Ok(new { hasBot = false, totalPlayers });
					const string higherSql = @"SELECT COUNT(*) FROM (SELECT mh.user_id, MAX(mb.level) AS lvl FROM maxhanna.bones_bot mb JOIN maxhanna.bones_hero mh ON mh.id = mb.hero_id GROUP BY mh.user_id) x WHERE x.lvl > @Lvl;";
					int higherCount = 0;
					await using (var higherCmd = new MySqlCommand(higherSql, conn))
					{
						higherCmd.Parameters.AddWithValue("@Lvl", userLevel);
						higherCount = Convert.ToInt32(await higherCmd.ExecuteScalarAsync());
					}
					int rank = higherCount + 1;
					return Ok(new { hasBot = true, rank, level = userLevel, totalPlayers });
				}
			}
			catch (Exception ex)
			{
				await _log.Db("Bones_GetUserRank Exception: " + ex.Message, userId, "BONES", true);
				return StatusCode(500, "Internal server error");
			}
		}

		[HttpPost("/Bones/GetHeroHighscores", Name = "Bones_GetHeroHighscores")]
		public async Task<IActionResult> GetHeroHighscores([FromBody] int count)
		{
			try
			{
				using var connection = new MySqlConnection(_connectionString);
				await connection.OpenAsync();
				string sql = @"SELECT mh.id AS heroId, mh.user_id AS userId, mh.name AS heroName, COALESCE(SUM(mb.level),0) AS totalMetabotLevels, COALESCE(COUNT(mb.id),0) AS botCount, u.username as username, udpfl.id as display_picture_file_id FROM maxhanna.bones_hero mh LEFT JOIN maxhanna.bones_bot mb ON mb.hero_id = mh.id LEFT JOIN maxhanna.users u ON u.id = mh.user_id LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id LEFT JOIN maxhanna.file_uploads udpfl ON udp.file_id = udpfl.id WHERE mh.name IS NOT NULL GROUP BY mh.id, mh.user_id, mh.name, u.username, udpfl.id ORDER BY totalMetabotLevels DESC LIMIT @Count;";
				using var cmd = new MySqlCommand(sql, connection);
				cmd.Parameters.AddWithValue("@Count", Math.Max(1, count));
				using var rdr = await cmd.ExecuteReaderAsync();
				var results = new List<object>();
				while (await rdr.ReadAsync())
				{
					FileEntry? displayPic = !rdr.IsDBNull(rdr.GetOrdinal("display_picture_file_id")) ? new FileEntry(rdr.GetInt32(rdr.GetOrdinal("display_picture_file_id"))) : null;
					User? ownerUser = !rdr.IsDBNull(rdr.GetOrdinal("userId")) ? new User(id: rdr.GetInt32(rdr.GetOrdinal("userId")), username: rdr.IsDBNull(rdr.GetOrdinal("username")) ? "Anonymous" : SafeGetString(rdr, "username") ?? "Anonymous", displayPictureFile: displayPic) : null;
					results.Add(new { heroId = rdr.GetInt32("heroId"), owner = ownerUser, heroName = rdr.IsDBNull(rdr.GetOrdinal("heroName")) ? null : SafeGetString(rdr, "heroName"), totalMetabotLevels = rdr.IsDBNull(rdr.GetOrdinal("totalMetabotLevels")) ? 0 : rdr.GetInt32("totalMetabotLevels"), botCount = rdr.IsDBNull(rdr.GetOrdinal("botCount")) ? 0 : rdr.GetInt32("botCount") });
				}
				return Ok(results);
			}
			catch (Exception ex)
			{
				await _log.Db("Error fetching bones hero highscores: " + ex.Message, null, "BONES", true);
				return StatusCode(500, "An error occurred fetching bones hero highscores.");
			}
		}

		[HttpPost("/Bones/SellBotParts", Name = "Bones_SellBotParts")]
		public async Task<IActionResult> SellBotParts([FromBody] SellBotPartsRequest req)
		{
			if (req.PartIds == null || req.PartIds.Length == 0) return BadRequest("No Metabot Parts to sell.");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				var partIdsString = string.Join(",", req.PartIds);
				string singleSql = $"INSERT INTO maxhanna.bones_hero_crypto (hero_id, crypto_balance) SELECT hero_id, SUM(damage_mod * 10) FROM maxhanna.bones_bot_part WHERE id IN ({partIdsString}) GROUP BY hero_id ON DUPLICATE KEY UPDATE crypto_balance = crypto_balance + VALUES(crypto_balance); DELETE FROM maxhanna.bones_bot_part WHERE id IN ({partIdsString});";
				using var command = new MySqlCommand(singleSql, connection, transaction);
				await command.ExecuteNonQueryAsync();
				await transaction.CommitAsync();
				return Ok();
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				return StatusCode(500, "Internal server error: " + ex.Message);
			}
		}

		// Helper methods copied from MetaController with log category updated to BONES
		private async Task<MetaHero> UpdateHeroInDB(MetaHero hero, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				string sql = @"UPDATE maxhanna.bones_hero SET coordsX = @CoordsX, coordsY = @CoordsY, color = @Color, mask = @Mask, map = @Map, speed = @Speed, updated = UTC_TIMESTAMP() WHERE id = @HeroId";
				Dictionary<string, object?> parameters = new() { { "@CoordsX", hero.Position.x }, { "@CoordsY", hero.Position.y }, { "@Color", hero.Color }, { "@Mask", hero.Mask }, { "@Map", hero.Map }, { "@Speed", hero.Speed }, { "@HeroId", hero.Id } };
				await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
				return hero;
			}
			catch (Exception ex)
			{
				await _log.Db($"UpdateHeroInDB Exception: {ex.Message}\n{ex.StackTrace}", hero?.Id, "BONES", true);
				throw;
			}
		}
		private async Task UpdateMetabotInDB(MetaBot metabot, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				string sql = @"UPDATE maxhanna.bones_bot SET hp = @HP, exp = @Exp, level = @Level, is_deployed = @IsDeployed WHERE id = @MetabotId LIMIT 1;";
				Dictionary<string, object?> parameters = new() { { "@HP", metabot.Hp }, { "@Exp", metabot.Exp }, { "@Level", metabot.Level }, { "@IsDeployed", metabot.IsDeployed ? 1 : 0 }, { "@MetabotId", metabot.Id } };
				await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
			}
			catch (Exception ex) { await _log.Db("UpdateMetabotInDb failure: " + ex.ToString(), null, "BONES", true); }
		}
		private async Task UpdateEventsInDB(MetaEvent @event, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				string sql = @"DELETE FROM maxhanna.bones_event WHERE timestamp < NOW() - INTERVAL 20 SECOND; INSERT INTO maxhanna.bones_event (hero_id, event, map, data) VALUES (@HeroId, @Event, @Map, @Data);";
				Dictionary<string, object?> parameters = new() { { "@HeroId", @event.HeroId }, { "@Event", @event.EventType }, { "@Map", @event.Map }, { "@Data", Newtonsoft.Json.JsonConvert.SerializeObject(@event.Data) } };
				await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
			}
			catch (Exception ex) { await _log.Db("UpdateEventsInDb failed : " + ex.ToString(), null, "BONES", true); }
		}
		private async Task UpdateInventoryInDB(UpdateMetaHeroInventoryRequest request, MySqlConnection connection, MySqlTransaction transaction)
		{
			if (request.HeroId == 0) return;
			string sql = @"INSERT INTO bones_hero_inventory (bones_hero_id, name, image, category, quantity) VALUES (@HeroId, @Name, @Image, @Category, @Quantity) ON DUPLICATE KEY UPDATE quantity = quantity + @Quantity;";
			Dictionary<string, object?> parameters = new() { { "@HeroId", request.HeroId }, { "@Name", request.Name }, { "@Image", request.Image }, { "@Category", request.Category }, { "@Quantity", 1 } };
			await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
		}
		private async Task<List<MetaEvent>> GetEventsFromDb(string map, int heroId, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
				if (transaction == null) throw new InvalidOperationException("Transaction is required for this operation.");
				List<int> partyMemberIds = new() { heroId };
				string partyQuery = @"SELECT bones_hero_id_1 AS hero_id FROM bones_hero_party WHERE bones_hero_id_2 = @HeroId UNION SELECT bones_hero_id_2 AS hero_id FROM bones_hero_party WHERE bones_hero_id_1 = @HeroId";
				using (var partyCmd = new MySqlCommand(partyQuery, connection, transaction))
				{
					partyCmd.Parameters.AddWithValue("@HeroId", heroId);
					using var partyReader = await partyCmd.ExecuteReaderAsync();
					while (await partyReader.ReadAsync()) partyMemberIds.Add(Convert.ToInt32(partyReader["hero_id"]));
				}
				string sql = @"DELETE FROM maxhanna.bones_event WHERE timestamp < NOW() - INTERVAL 20 SECOND; SELECT * FROM maxhanna.bones_event WHERE map = @Map OR (event = 'CHAT' AND hero_id IN (" + string.Join(",", partyMemberIds) + "));";
				MySqlCommand cmd = new(sql, connection, transaction); cmd.Parameters.AddWithValue("@Map", map);
				List<MetaEvent> events = new();
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (reader.Read())
					{
						var ev = SafeGetString(reader, "event") ?? string.Empty;
						var mp = SafeGetString(reader, "map") ?? string.Empty;
						var dataJson = SafeGetString(reader, "data") ?? string.Empty;
						Dictionary<string, string> dataDict = new Dictionary<string, string>();
						if (!string.IsNullOrEmpty(dataJson))
						{
							try
							{
								var jo = JObject.Parse(dataJson);
								foreach (var prop in jo.Properties())
								{
									dataDict[prop.Name] = prop.Value?.ToString() ?? string.Empty;
								}
							}
							catch (Exception)
							{
								// Fallback: attempt to deserialize dictionary of strings
								try
								{
									var tmp = Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, string>>(dataJson);
									if (tmp != null) dataDict = tmp;
								}
								catch { /* ignore malformed data */ }
							}
						}
						MetaEvent tmpEvent = new(reader.GetInt32("id"), reader.GetInt32("hero_id"), reader.GetDateTime("timestamp"), ev, mp, dataDict);
						events.Add(tmpEvent);
					}
				}
				return events;
			}
			catch (Exception ex)
			{
				await _log.Db($"GetEventsFromDb Exception: {ex.Message}\n{ex.StackTrace}\nmap={map}, heroId={heroId}", heroId, "BONES", true);
				throw;
			}
		}
		private async Task<MetaHero?> GetHeroData(int userId, int? heroId, MySqlConnection conn, MySqlTransaction transaction)
		{
			try
			{
				if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
				if (transaction == null) throw new InvalidOperationException("Transaction is required for this operation.");
				if (userId == 0 && heroId == null) return null;
				string sql = $"SELECT h.id as hero_id, h.coordsX, h.coordsY, h.map, h.speed, h.name as hero_name, h.color as hero_color, h.mask as hero_mask, b.id as bot_id, b.name as bot_name, b.type as bot_type, b.hp as bot_hp, b.is_deployed as bot_is_deployed, b.level as bot_level, b.exp as bot_exp, p.id as part_id, p.part_name, p.type as part_type, p.damage_mod, p.skill FROM maxhanna.bones_hero h LEFT JOIN maxhanna.bones_bot b ON h.id = b.hero_id LEFT JOIN maxhanna.bones_bot_part p ON b.id = p.metabot_id WHERE {(heroId == null ? "h.user_id = @UserId" : "h.id = @UserId")};";
				MySqlCommand cmd = new(sql, conn, transaction); cmd.Parameters.AddWithValue("@UserId", heroId != null ? heroId : userId);
				MetaHero? hero = null; Dictionary<int, MetaBot> metabotDict = new();
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (reader.Read())
					{
						if (hero == null)
						{
							hero = new MetaHero { Id = reader.GetInt32("hero_id"), Position = new Vector2(reader.GetInt32("coordsX"), reader.GetInt32("coordsY")), Speed = reader.GetInt32("speed"), Map = SafeGetString(reader, "map") ?? string.Empty, Name = SafeGetString(reader, "hero_name"), Color = SafeGetString(reader, "hero_color") ?? string.Empty, Mask = reader.IsDBNull(reader.GetOrdinal("hero_mask")) ? null : reader.GetInt32("hero_mask"), Metabots = new List<MetaBot>() };
						}
						if (!reader.IsDBNull(reader.GetOrdinal("bot_id")))
						{
							int botId = reader.GetInt32("bot_id");
							if (!metabotDict.TryGetValue(botId, out MetaBot? bot))
							{
								int botNameOrd = reader.GetOrdinal("bot_name");
								bot = new MetaBot { Id = botId, Name = reader.IsDBNull(botNameOrd) ? null : reader.GetString(botNameOrd), Type = reader.GetInt32("bot_type"), Hp = reader.GetInt32("bot_hp"), Level = reader.GetInt32("bot_level"), Exp = reader.GetInt32("bot_exp"), IsDeployed = reader.GetBoolean("bot_is_deployed"), HeroId = hero.Id };
								metabotDict[botId] = bot; hero.Metabots ??= new List<MetaBot>(); hero.Metabots.Add(bot);
							}
							if (!reader.IsDBNull(reader.GetOrdinal("part_id")))
							{
								int partNameOrd = reader.GetOrdinal("part_name");
								int skillOrd = reader.GetOrdinal("skill");
								MetaBotPart part = new() { HeroId = hero.Id, Id = reader.GetInt32("part_id"), PartName = reader.IsDBNull(partNameOrd) ? null : reader.GetString(partNameOrd), Type = reader.GetInt32("part_type"), DamageMod = reader.GetInt32("damage_mod"), Skill = reader.IsDBNull(skillOrd) ? null : new Skill(reader.GetString(skillOrd), 0) };
								switch (part.PartName?.ToLower()) { case "head": bot.Head = part; break; case "legs": bot.Legs = part; break; case "left_arm": bot.LeftArm = part; break; case "right_arm": bot.RightArm = part; break; }
							}
						}
					}
				}
				return hero;
			}
			catch (Exception ex)
			{
				await _log.Db($"GetHeroData Exception: {ex.Message}\n{ex.StackTrace}\nuserId={userId}, heroId={heroId}", userId == 0 ? heroId : userId, "BONES", true);
				throw;
			}
		}
		private async Task<MetaBot[]> GetEncounterMetaBots(MySqlConnection conn, MySqlTransaction transaction, string map)
		{
			try
			{
				var bots = new List<MetaBot>();
				string heroIdQuery = "SELECT hero_id FROM maxhanna.bones_encounter WHERE map = @Map;";
				MySqlCommand heroIdCmd = new(heroIdQuery, conn, transaction); heroIdCmd.Parameters.AddWithValue("@Map", map);
				var heroIds = new List<int>();
				using (var heroReader = await heroIdCmd.ExecuteReaderAsync()) while (await heroReader.ReadAsync()) heroIds.Add(Convert.ToInt32(heroReader["hero_id"]));
				if (!heroIds.Any()) return Array.Empty<MetaBot>();
				string sql = "SELECT b.id as metabot_id, b.hero_id as metabot_hero_id, b.name as metabot_name, b.type as metabot_type, b.hp as metabot_hp, b.level as metabot_level, b.exp as metabot_exp, b.is_deployed as metabot_is_deployed, p.id as part_id, p.part_name, p.type as part_type, p.damage_mod, p.skill, e.coordsX, e.coordsY FROM maxhanna.bones_bot b LEFT JOIN maxhanna.bones_encounter_bot_part p ON b.hero_id = p.hero_id LEFT JOIN maxhanna.bones_encounter e ON e.hero_id = b.hero_id WHERE b.hero_id IN (" + string.Join(",", heroIds) + ");";
				MySqlCommand cmd = new(sql, conn, transaction);
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						int heroId = Convert.ToInt32(reader["metabot_hero_id"]);
						MetaBot? metabot = bots.FirstOrDefault(m => m.Id == Convert.ToInt32(reader["metabot_id"]));
						if (metabot == null)
						{
							int metabotNameOrd = reader.GetOrdinal("metabot_name");
							metabot = new MetaBot { Id = Convert.ToInt32(reader["metabot_id"]), Name = reader.IsDBNull(metabotNameOrd) ? null : reader.GetString(metabotNameOrd), HeroId = heroId, Type = Convert.ToInt32(reader["metabot_type"]), Hp = Convert.ToInt32(reader["metabot_hp"]), Exp = Convert.ToInt32(reader["metabot_exp"]), Level = Convert.ToInt32(reader["metabot_level"]), IsDeployed = Convert.ToBoolean(reader["metabot_is_deployed"]), Position = new Vector2(Convert.ToInt32(reader["coordsX"]), Convert.ToInt32(reader["coordsY"])) };
							bots.Add(metabot);
						}
						if (!reader.IsDBNull(reader.GetOrdinal("part_id")))
						{
							int pNameOrd = reader.GetOrdinal("part_name");
							int pSkillOrd = reader.GetOrdinal("skill");
							MetaBotPart part = new() { HeroId = heroId, Id = Convert.ToInt32(reader["part_id"]), PartName = reader.IsDBNull(pNameOrd) ? null : reader.GetString(pNameOrd), Type = Convert.ToInt32(reader["part_type"]), DamageMod = Convert.ToInt32(reader["damage_mod"]), Skill = !reader.IsDBNull(pSkillOrd) ? new Skill(reader.GetString(pSkillOrd), 0) : null };
							switch (part.PartName?.ToLower()) { case "head": metabot.Head = part; break; case "legs": metabot.Legs = part; break; case "left_arm": metabot.LeftArm = part; break; case "right_arm": metabot.RightArm = part; break; }
						}
					}
				}
				return bots.ToArray();
			}
			catch (Exception ex)
			{
				await _log.Db($"GetEncounterMetaBots Exception: {ex.Message}\n{ex.StackTrace}\nmap={map}", null, "BONES", true);
				throw;
			}
		}
		private async Task<MetaHero[]?> GetNearbyPlayers(MetaHero hero, MySqlConnection conn, MySqlTransaction transaction)
		{
			try
			{
				if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
				if (transaction == null) throw new InvalidOperationException("Transaction is required for this operation.");
				Dictionary<int, MetaHero> heroesDict = new();
				string sql = @"SELECT m.id as hero_id, 
					m.name as hero_name,
					m.map as hero_map, 
					m.coordsX, m.coordsY, 
					m.speed, 
					m.color,
					m.mask, 
					m.level as hero_level,
					m.updated as hero_updated,
					m.created as hero_created,
					b.id as metabot_id,
					b.name as metabot_name,
					b.type as metabot_type,
					b.hp as metabot_hp,
					b.level as metabot_level,
					b.exp as metabot_exp, 
					b.is_deployed as metabot_is_deployed, 
					p.id as part_id, 
					p.part_name,
					p.type as part_type,
					p.damage_mod, 
					p.skill FROM maxhanna.bones_hero m 
					LEFT JOIN maxhanna.bones_bot b on b.hero_id = m.id 
					LEFT JOIN maxhanna.bones_bot_part p ON b.id = p.metabot_id 
					WHERE m.map = @HeroMapId 
					ORDER BY m.coordsY ASC;";
				MySqlCommand cmd = new(sql, conn, transaction); cmd.Parameters.AddWithValue("@HeroMapId", hero.Map);
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					// read ordinals and values inline with DBNull checks (one-line assignments)
					while (await reader.ReadAsync())
					{
						if (reader.IsDBNull(reader.GetOrdinal("hero_id"))) continue; // essential primary value
						int heroId = reader.GetInt32(reader.GetOrdinal("hero_id"));
						if (!heroesDict.TryGetValue(heroId, out MetaHero? tmpHero))
						{
							var name = reader.IsDBNull(reader.GetOrdinal("hero_name")) ? null : reader.GetString(reader.GetOrdinal("hero_name"));
							var mapVal = reader.IsDBNull(reader.GetOrdinal("hero_map")) ? string.Empty : reader.GetString(reader.GetOrdinal("hero_map"));
							var level = reader.IsDBNull(reader.GetOrdinal("hero_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("hero_level"));
							var color = reader.IsDBNull(reader.GetOrdinal("color")) ? string.Empty : reader.GetString(reader.GetOrdinal("color"));
							int? mask = reader.IsDBNull(reader.GetOrdinal("mask")) ? (int?)null : reader.GetInt32(reader.GetOrdinal("mask"));
							int coordsX = reader.IsDBNull(reader.GetOrdinal("coordsX")) ? 0 : reader.GetInt32(reader.GetOrdinal("coordsX"));
							int coordsY = reader.IsDBNull(reader.GetOrdinal("coordsY")) ? 0 : reader.GetInt32(reader.GetOrdinal("coordsY"));
							int speed = reader.IsDBNull(reader.GetOrdinal("speed")) ? 0 : reader.GetInt32(reader.GetOrdinal("speed"));
							var updated = reader.IsDBNull(reader.GetOrdinal("hero_updated")) ? DateTime.UtcNow : reader.GetDateTime(reader.GetOrdinal("hero_updated"));
							var created = reader.IsDBNull(reader.GetOrdinal("hero_created")) ? DateTime.UtcNow : reader.GetDateTime(reader.GetOrdinal("hero_created"));
							tmpHero = new MetaHero {
								Id = heroId,
								Name = name,
								Map = mapVal,
								Level = level,
								Color = color,
								Mask = mask,
								Position = new Vector2(coordsX, coordsY),
								Speed = speed,
								Updated = updated,
								Created = created,
								Metabots = new List<MetaBot>()
							};
							heroesDict[heroId] = tmpHero;
						}
						// metabot block
						if (!reader.IsDBNull(reader.GetOrdinal("metabot_id")))
						{
							int metabotId = reader.GetInt32(reader.GetOrdinal("metabot_id"));
							MetaBot? metabot = tmpHero.Metabots?.FirstOrDefault(m => m.Id == metabotId);
							if (metabot == null)
							{
								var mName = reader.IsDBNull(reader.GetOrdinal("metabot_name")) ? null : reader.GetString(reader.GetOrdinal("metabot_name"));
								var mType = reader.IsDBNull(reader.GetOrdinal("metabot_type")) ? 0 : reader.GetInt32(reader.GetOrdinal("metabot_type"));
								var mHp = reader.IsDBNull(reader.GetOrdinal("metabot_hp")) ? 0 : reader.GetInt32(reader.GetOrdinal("metabot_hp"));
								var mExp = reader.IsDBNull(reader.GetOrdinal("metabot_exp")) ? 0 : reader.GetInt32(reader.GetOrdinal("metabot_exp"));
								var mLevel = reader.IsDBNull(reader.GetOrdinal("metabot_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("metabot_level"));
								var mIsDeployed = reader.IsDBNull(reader.GetOrdinal("metabot_is_deployed")) ? false : reader.GetBoolean(reader.GetOrdinal("metabot_is_deployed"));
								metabot = new MetaBot {
									Id = metabotId,
									Name = mName,
									HeroId = heroId,
									Type = mType,
									Hp = mHp,
									Exp = mExp,
									Level = mLevel,
									IsDeployed = mIsDeployed
								};
								if (tmpHero.Metabots == null) tmpHero.Metabots = new List<MetaBot>();
								tmpHero.Metabots.Add(metabot);
							}
							// part block
							if (!reader.IsDBNull(reader.GetOrdinal("part_id")))
							{
								int partId = reader.GetInt32(reader.GetOrdinal("part_id"));
								var partName = reader.IsDBNull(reader.GetOrdinal("part_name")) ? null : reader.GetString(reader.GetOrdinal("part_name"));
								var partType = reader.IsDBNull(reader.GetOrdinal("part_type")) ? 0 : reader.GetInt32(reader.GetOrdinal("part_type"));
								var damageMod = reader.IsDBNull(reader.GetOrdinal("damage_mod")) ? 0 : reader.GetInt32(reader.GetOrdinal("damage_mod"));
								var skill = reader.IsDBNull(reader.GetOrdinal("skill")) ? null : new Skill(reader.GetString(reader.GetOrdinal("skill")), 0);
								MetaBotPart part = new() { HeroId = heroId, Id = partId, PartName = partName, Type = partType, DamageMod = damageMod, Skill = skill };
								switch (part.PartName?.ToLower()) { case "head": metabot.Head = part; break; case "legs": metabot.Legs = part; break; case "left_arm": metabot.LeftArm = part; break; case "right_arm": metabot.RightArm = part; break; }
							}
						}
					}
				}
				return heroesDict.Values.ToArray();
			}
			catch (Exception ex)
			{
				await _log.Db($"GetNearbyPlayers Exception: {ex.Message}\n{ex.StackTrace}\nheroId={hero?.Id}, map={hero?.Map}", hero?.Id, "BONES", true);
				throw;
			}
		}
		private async Task<MetaInventoryItem[]?> GetInventoryFromDB(int heroId, MySqlConnection conn, MySqlTransaction transaction)
		{
			try
			{
				if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
				if (transaction == null) throw new InvalidOperationException("Transaction is required for this operation.");
				List<MetaInventoryItem> inventory = new();
				string sql = @"SELECT * FROM maxhanna.bones_hero_inventory WHERE bones_hero_id = @HeroId;";
				MySqlCommand cmd = new(sql, conn, transaction); cmd.Parameters.AddWithValue("@HeroId", heroId);
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (reader.Read())
					{
						MetaInventoryItem tmpInventoryItem = new(reader.GetInt32("id"), reader.GetInt32("bones_hero_id"), reader.GetDateTime("created"), SafeGetString(reader, "name"), SafeGetString(reader, "image"), SafeGetString(reader, "category"), reader.IsDBNull(reader.GetOrdinal("quantity")) ? null : reader.GetInt32("quantity"));
						inventory.Add(tmpInventoryItem);
					}
				}
				return inventory.ToArray();
			}
			catch (Exception ex)
			{
				await _log.Db($"GetInventoryFromDB Exception: {ex.Message}\n{ex.StackTrace}\nheroId={heroId}", heroId, "BONES", true);
				throw;
			}
		}
		private async Task<MetaBotPart[]?> GetMetabotPartsFromDB(int heroId, MySqlConnection conn, MySqlTransaction transaction)
		{
			try
			{
				if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
				if (transaction == null) throw new InvalidOperationException("Transaction is required for this operation.");
				List<MetaBotPart> partInv = new();
				string sql = @"SELECT * FROM maxhanna.bones_bot_part WHERE hero_id = @HeroId;";
				MySqlCommand cmd = new(sql, conn, transaction); cmd.Parameters.AddWithValue("@HeroId", heroId);
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (reader.Read())
					{
						int partNameOrd3 = reader.GetOrdinal("part_name");
						int skillOrd3 = reader.GetOrdinal("skill");
						MetaBotPart tmpPart = new() { Id = reader.GetInt32("id"), HeroId = reader.GetInt32("hero_id"), MetabotId = reader.IsDBNull(reader.GetOrdinal("metabot_id")) ? null : reader.GetInt32("metabot_id"), Created = reader.GetDateTime("created"), PartName = reader.IsDBNull(partNameOrd3) ? null : reader.GetString(partNameOrd3), Skill = reader.IsDBNull(skillOrd3) ? null : new Skill(reader.GetString(skillOrd3), reader.GetInt32("type")), DamageMod = reader.GetInt32("damage_mod") };
						partInv.Add(tmpPart);
					}
				}
				return partInv.ToArray();
			}
			catch (Exception ex)
			{
				await _log.Db($"GetMetabotPartsFromDB Exception: {ex.Message}\n{ex.StackTrace}\nheroId={heroId}", heroId, "BONES", true);
				throw;
			}
		}
		private async Task RepairAllMetabots(int heroId, MySqlConnection connection, MySqlTransaction transaction)
		{
			string sql = @"UPDATE maxhanna.bones_bot SET hp = 100 WHERE hero_id = @heroId;";
			Dictionary<string, object?> parameters = new() { { "@heroId", heroId } };
			await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
		}
		private async Task UpdateEncounterPosition(int encounterId, int destinationX, int destionationY, MySqlConnection connection, MySqlTransaction transaction)
		{
			string sql = @"UPDATE maxhanna.bones_encounter SET coordsX = @coordsX, coordsY = @coordsY WHERE hero_id = @heroId;";
			Dictionary<string, object?> parameters = new() { { "@heroId", encounterId }, { "@coordsX", destinationX }, { "@coordsY", destionationY } };
			await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
		}
		private async Task DeployMetabot(int metabotId, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				string sql = @"UPDATE maxhanna.bones_bot SET is_deployed = 1 WHERE id = @botId AND hp > 0 LIMIT 1;";
				Dictionary<string, object?> parameters = new() { { "@botId", metabotId } };
				await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
			}
			catch (Exception ex) { await _log.Db("Exception DeployMetabot: " + ex.Message, null, "BONES", true); }
		}
		private async Task CallBackMetabot(int heroId, int? metabotId, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				string sql = "UPDATE maxhanna.bones_bot SET is_deployed = 0 WHERE hero_id = @heroId" + (metabotId.HasValue ? " AND id = @botId" : "");
				Dictionary<string, object?> parameters = new() { { "@heroId", heroId } };
				if (metabotId.HasValue) parameters.Add("@botId", metabotId.Value);
				await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
			}
			catch (Exception ex) { await _log.Db("Exception CallBackMetabot: " + ex.Message, null, "BONES", true); }
		}
		private async Task DestroyMetabot(int heroId, int? metabotId, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				string sql;
				Dictionary<string, object?> parameters = new() { { "@heroId", heroId } };
				if (heroId < 0)
				{
					sql = $"DELETE FROM maxhanna.bones_bot WHERE hero_id = @heroId {(metabotId.HasValue ? " AND id = @botId" : "")}; DELETE FROM maxhanna.bones_encounter_bot_part WHERE hero_id = @heroId; UPDATE maxhanna.bones_encounter SET coordsX = -1, coordsY = -1, last_killed = UTC_TIMESTAMP WHERE hero_id = @heroId;";
					if (metabotId.HasValue) parameters.Add("@botId", metabotId.Value);
				}
				else
				{
					sql = $"UPDATE maxhanna.bones_bot SET is_deployed = 0, hp = 0 WHERE hero_id = @heroId {(metabotId.HasValue ? " AND id = @botId" : "")};";
					if (metabotId.HasValue) parameters.Add("@botId", metabotId.Value);
				}
				await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
			}
			catch (Exception ex) { await _log.Db("Exception DestroyMetabot: " + ex.Message, null, "BONES", true); }
		}
		private async Task PerformEventChecks(MetaEvent metaEvent, MySqlConnection connection, MySqlTransaction transaction)
		{
			if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "TARGET_LOCKED")
			{
				string lockKey = $"{metaEvent.Data["sourceId"]}:{metaEvent.Data["targetId"]}";
				if (!activeLocks.ContainsKey(lockKey))
				{
					var sourceId = metaEvent.Data["sourceId"]; var targetId = metaEvent.Data["targetId"]; var ctsSource = new CancellationTokenSource(); activeLocks[lockKey] = ctsSource; _ = StartDamageOverTimeForBot(sourceId, targetId, ctsSource.Token);
				}
			}
			else if (metaEvent != null && metaEvent.EventType == "TARGET_UNLOCK" && metaEvent.Data != null && metaEvent.Data.TryGetValue("sourceId", out var sourceId))
			{
				StopAttackDamageOverTimeForBot(Convert.ToInt32(sourceId), Convert.ToInt32(metaEvent.Data["targetId"]));
			}
			else if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "REPAIR_ALL_METABOTS")
			{
				int heroId = Convert.ToInt32(metaEvent.Data["heroId"]); await RepairAllMetabots(heroId, connection, transaction);
			}
			else if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "UNPARTY")
			{
				int heroId = metaEvent.HeroId; await Unparty(heroId, connection, transaction);
			}
			else if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "PARTY_INVITE_ACCEPTED")
			{
				if (metaEvent.Data.TryGetValue("party_members", out var partyJson))
				{
					try
					{ var partyData = JsonSerializer.Deserialize<List<int>>(partyJson); if (partyData != null && partyData.Count > 0) await UpdateMetaHeroParty(partyData, connection, transaction); }
					catch (JsonException) { }
				}
			}
			else if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "UPDATE_ENCOUNTER_POSITION")
			{
				if (metaEvent.Data.TryGetValue("batch", out var batchJson))
				{
					try { var batchData = JsonSerializer.Deserialize<List<EncounterPositionUpdate>>(batchJson); if (batchData != null && batchData.Count > 0) await UpdateEncounterPositionBatch(batchData, connection, transaction); } catch (JsonException) { }
				}
			}
			else if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "DEPLOY")
			{
				if (metaEvent.Data.TryGetValue("metaBot", out var metaBotJsonElement)) { var metaBotJson = JsonDocument.Parse(metaBotJsonElement.ToString()).RootElement; if (metaBotJson.TryGetProperty("id", out var idElement)) { int metabotId = idElement.GetInt32(); await DeployMetabot(metabotId, connection, transaction); } }
			}
			else if (metaEvent != null && metaEvent.EventType == "CALL_BOT_BACK") { int heroId = metaEvent.HeroId; await CallBackMetabot(heroId, null, connection, transaction); }
			else if (metaEvent != null && metaEvent.EventType == "BOT_DESTROYED") { int heroId = metaEvent.HeroId; await DestroyMetabot(heroId, null, connection, transaction); }
		}
		private static void StopAttackDamageOverTimeForBot(int? sourceId, int? targetId)
		{
			string lockKey = $"{sourceId}:{targetId}"; if (activeLocks.ContainsKey(lockKey)) { activeLocks[lockKey].Cancel(); activeLocks.Remove(lockKey); }
		}
		private async Task StartDamageOverTimeForBot(string sourceId, string targetId, CancellationToken cancellationToken)
		{
			bool attackerStopped = false; while (!cancellationToken.IsCancellationRequested)
			{
				MetaBot? attackingBot = null, defendingBot = null; string? attackingBotMap = null; string? defendingBotMap = null;
				try
				{
					using var connection = new MySqlConnection(_connectionString); await connection.OpenAsync(); using (MySqlTransaction transaction = await connection.BeginTransactionAsync())
					{
						string fetchBotsSql = @"SELECT mb.id, mb.type, mb.exp, mb.level, mb.hp, mb.hero_id, mb.is_deployed, IF(mb.hero_id > 0,(SELECT mh.map FROM maxhanna.bones_hero mh WHERE mh.id = mb.hero_id),(SELECT me.map FROM maxhanna.bones_encounter me WHERE me.hero_id = mb.hero_id)) AS map FROM maxhanna.bones_bot AS mb WHERE mb.id = @SourceId OR mb.id = @TargetId;";
						using var command = new MySqlCommand(fetchBotsSql, connection, transaction); command.Parameters.AddWithValue("@SourceId", sourceId); command.Parameters.AddWithValue("@TargetId", targetId); using (var reader = await command.ExecuteReaderAsync())
						{
							while (await reader.ReadAsync())
							{
								int botId = reader.GetInt32(reader.GetOrdinal("id")); var bot = new MetaBot { Id = botId, Type = reader.GetInt32("type"), Exp = reader.GetInt32("exp"), Level = reader.GetInt32("level"), Hp = reader.GetInt32("hp"), HeroId = reader.IsDBNull(reader.GetOrdinal("hero_id")) ? 0 : reader.GetInt32("hero_id"), IsDeployed = reader.GetBoolean("is_deployed") };
								string? botMap = reader.IsDBNull(reader.GetOrdinal("map")) ? null : reader.GetString(reader.GetOrdinal("map")); if (botId == Convert.ToInt32(sourceId)) { attackingBot = bot; attackingBotMap = botMap; } else { defendingBot = bot; defendingBotMap = botMap; }
							}
						}
						if (attackingBot == null || defendingBot == null) attackerStopped = true;
						if (!attackerStopped && (string.IsNullOrEmpty(attackingBotMap) || string.IsNullOrEmpty(defendingBotMap) || attackingBotMap != defendingBotMap)) attackerStopped = true;
						if (!attackerStopped && attackingBot?.Hp <= 0) { attackerStopped = true; await HandleDeadMetabot(attackingBotMap ?? "", defendingBot, attackingBot, connection, transaction); }
						if (!attackerStopped && defendingBot?.Hp <= 0) { attackerStopped = true; await HandleDeadMetabot(defendingBotMap ?? "", attackingBot, defendingBot, connection, transaction); }
						if (!attackerStopped)
						{
							string checkEventSql = @"SELECT COUNT(*) FROM maxhanna.bones_event WHERE event = 'TARGET_UNLOCKED' AND (JSON_EXTRACT(data, '$.sourceId') = @SourceId AND JSON_EXTRACT(data, '$.targetId') = @TargetId) AND timestamp > NOW() - INTERVAL 5 SECOND";
							int eventCount = 0; using (var command2 = new MySqlCommand(checkEventSql, connection, transaction)) { command2.Parameters.AddWithValue("@SourceId", sourceId); command2.Parameters.AddWithValue("@TargetId", targetId); eventCount = Convert.ToInt32(await command2.ExecuteScalarAsync()); }
							if (eventCount > 0) attackerStopped = true;
							if (!attackerStopped && attackingBot != null && defendingBot != null)
							{
								MetaBotPart? attackingPart = GetLastUsedPart(attackingBot.HeroId > 0 ? "bones_bot_part" : "bones_encounter_bot_part", attackingBot.HeroId > 0 ? "metabot_id" : "hero_id", attackingBot.HeroId > 0 ? attackingBot.Id : attackingBot.HeroId, connection, transaction);
								MetaBotPart? defendingPart = GetLastUsedPart(defendingBot.HeroId > 0 ? "bones_bot_part" : "bones_encounter_bot_part", defendingBot.HeroId > 0 ? "metabot_id" : "hero_id", defendingBot.HeroId > 0 ? defendingBot.Id : defendingBot.HeroId, connection, transaction);
								ApplyDamageToBot(attackingBot, defendingBot, attackingPart!, defendingPart!, connection, transaction);
								if (defendingBot.Hp <= 0) { attackerStopped = true; await HandleDeadMetabot(defendingBotMap ?? "", attackingBot, defendingBot, connection, transaction); }
							}
						}
						await transaction.CommitAsync();
					}
				}
				catch (Exception) { attackerStopped = true; }
				if (attackerStopped) { StopAttackDamageOverTimeForBot(attackingBot?.Id, defendingBot?.Id); return; }
				await Task.Delay(1000);
			}
		}
		private async Task UpdateEncounterPositionBatch(List<EncounterPositionUpdate> updates, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				var sql = new StringBuilder(); var parameters = new Dictionary<string, object?>(); int paramIndex = 0;
				foreach (var update in updates)
				{
					sql.AppendLine($"UPDATE maxhanna.bones_encounter SET coordsX = @coordsX_{paramIndex}, coordsY = @coordsY_{paramIndex} WHERE hero_id = @heroId_{paramIndex} LIMIT 1;");
					parameters.Add($"@heroId_{paramIndex}", update.HeroId); parameters.Add($"@coordsX_{paramIndex}", update.DestinationX); parameters.Add($"@coordsY_{paramIndex}", update.DestinationY); paramIndex++;
				}
				if (sql.Length > 0) await ExecuteInsertOrUpdateOrDeleteAsync(sql.ToString(), parameters, connection, transaction);
			}
			catch (Exception) { throw; }
		}
		private async Task UpdateMetaHeroParty(List<int>? partyData, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				if (partyData == null || partyData.Count < 2) return; var heroIds = partyData.Distinct().ToList(); if (heroIds.Count < 2) return;
				const string deleteQuery = @"DELETE FROM bones_hero_party WHERE bones_hero_id_1 IN (@heroId1) OR bones_hero_id_2 IN (@heroId2)";
				using (var deleteCommand = new MySqlCommand(deleteQuery, connection, transaction))
				{
					var heroIdParams = string.Join(",", heroIds.Select((_, index) => $"@hero{index}")); deleteCommand.CommandText = deleteQuery.Replace("@heroId1", heroIdParams).Replace("@heroId2", heroIdParams); for (int i = 0; i < heroIds.Count; i++) deleteCommand.Parameters.AddWithValue($"@hero{i}", heroIds[i]); await deleteCommand.ExecuteNonQueryAsync();
				}
				const string insertQuery = @"INSERT INTO bones_hero_party (bones_hero_id_1, bones_hero_id_2) VALUES (@heroId1, @heroId2)";
				using (var insertCommand = new MySqlCommand(insertQuery, connection, transaction))
				{
					for (int i = 0; i < heroIds.Count; i++) for (int j = i + 1; j < heroIds.Count; j++) { insertCommand.Parameters.Clear(); insertCommand.Parameters.AddWithValue("@heroId1", heroIds[i]); insertCommand.Parameters.AddWithValue("@heroId2", heroIds[j]); await insertCommand.ExecuteNonQueryAsync(); }
				}
			}
			catch (MySqlException) { throw; }
			catch (Exception) { throw; }
		}
		private async Task Unparty(int heroId, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				const string deleteQuery = @"DELETE FROM bones_hero_party WHERE bones_hero_id_1 IN (@heroId) OR bones_hero_id_2 IN (@heroId)";
				using var deleteCommand = new MySqlCommand(deleteQuery, connection, transaction); deleteCommand.Parameters.AddWithValue("@heroId", heroId); await deleteCommand.ExecuteNonQueryAsync();
			}
			catch (MySqlException) { throw; }
			catch (Exception) { throw; }
		}
		private async Task HandleDeadMetabot(string map, MetaBot? winnerBot, MetaBot? deadBot, MySqlConnection connection, MySqlTransaction transaction)
		{
			if (deadBot == null) return; MetaEvent tmpEvent = new(0, deadBot.HeroId, DateTime.Now, "BOT_DESTROYED", map, new Dictionary<string, string> { { "winnerBotId", (winnerBot?.Id ?? 0).ToString() } }); await UpdateEventsInDB(tmpEvent, connection, transaction); await DestroyMetabot(deadBot.HeroId, deadBot.Id, connection, transaction); if (winnerBot?.HeroId > 0) await AwardExpToPlayer(winnerBot, deadBot, connection, transaction);
		}
		private async Task AwardExpToPlayer(MetaBot player, MetaBot enemy, MySqlConnection connection, MySqlTransaction transaction)
		{
			player.Exp += enemy.Level; int expForNextLevel = CalculateExpForNextLevel(player); while (player.Exp >= expForNextLevel) { player.Exp -= expForNextLevel; player.Level++; expForNextLevel = CalculateExpForNextLevel(player); }
			await UpdateMetabotInDB(player, connection, transaction);
		}
		private int CalculateExpForNextLevel(MetaBot player) => (player.Level + 1) * 15;
		private MetaBotPart GetLastUsedPart(string tableName, string idColumn, int id, MySqlConnection connection, MySqlTransaction? transaction)
		{
			string fetchPartSql = $"SELECT part_name, damage_mod, skill, type FROM maxhanna.{tableName} WHERE {idColumn} = @Id ORDER BY last_used DESC LIMIT 1"; string updateLastUsedSql = $"UPDATE maxhanna.{tableName} SET last_used = UTC_TIMESTAMP() WHERE {idColumn} = @Id ORDER BY last_used DESC LIMIT 1"; MetaBotPart part = new() { PartName = "DEFAULT", DamageMod = 1, Skill = new Skill("NORMAL", 0) };
			using (var command = new MySqlCommand(fetchPartSql, connection, transaction)) { command.Parameters.AddWithValue("@Id", id); using var reader = command.ExecuteReader(); if (reader.Read()) { part = new MetaBotPart { PartName = reader.GetString(0), DamageMod = reader.GetInt32(1), Skill = new Skill(reader.GetString(2), reader.GetInt32(3)) }; } }
			using (var command = new MySqlCommand(updateLastUsedSql, connection, transaction)) { command.Parameters.AddWithValue("@Id", id); command.ExecuteNonQuery(); }
			return part;
		}
		private void ApplyDamageToBot(MetaBot attackingBot, MetaBot defendingBot, MetaBotPart attackingPart, MetaBotPart defendingPart, MySqlConnection connection, MySqlTransaction transaction)
		{
			int appliedDamageToDefender = CalculateDamage(attackingBot, defendingBot, attackingPart); string updateSql = @"UPDATE maxhanna.bones_bot_part SET last_used = NOW() WHERE metabot_id = @SourceId AND part_name = @PartName; UPDATE maxhanna.bones_bot AS bot SET bot.hp = GREATEST(bot.hp - @Damage, 0), bot.is_deployed = CASE WHEN GREATEST(bot.hp - @Damage, 0) = 0 THEN 0 ELSE bot.is_deployed END WHERE bot.id = @TargetId"; using var command = new MySqlCommand(updateSql, connection, transaction); command.Parameters.AddWithValue("@Damage", appliedDamageToDefender); command.Parameters.AddWithValue("@TargetId", defendingBot.Id); command.Parameters.AddWithValue("@SourceId", attackingBot.Id); command.Parameters.AddWithValue("@PartName", attackingPart.PartName); command.ExecuteNonQuery();
		}
		private int CalculateDamage(MetaBot attacker, MetaBot defender, MetaBotPart attackingPart)
		{
			float typeMultiplier = 1.0f; if (attackingPart.Skill != null && TypeEffectiveness.TryGetValue((SkillType)attackingPart.Skill.Type, out SkillType effectiveAgainst) && (int)effectiveAgainst == defender.Type) typeMultiplier = 2.0f; else if (attackingPart.Skill != null && TypeEffectiveness.TryGetValue((SkillType)defender.Type, out SkillType strongAgainst) && (int)strongAgainst == attackingPart.Skill.Type) typeMultiplier = 0.5f; int baseDamage = (int)(attacker.Level * attackingPart.DamageMod * typeMultiplier); float defenseMultiplier = defender.Level / 100f; float defenseFactor = 1f / (1f + defenseMultiplier); int finalDamage = (int)(baseDamage * defenseFactor); if (new Random().NextDouble() < 0.1) finalDamage = (int)(finalDamage * 1.5f); return Math.Max(1, finalDamage);
		}

		// Helper to safely read nullable string columns from a data reader
		private static string? SafeGetString(System.Data.Common.DbDataReader reader, string columnName)
		{
			int ord = reader.GetOrdinal(columnName);
			return reader.IsDBNull(ord) ? null : reader.GetString(ord);
		}

		private async Task<long?> ExecuteInsertOrUpdateOrDeleteAsync(string sql, Dictionary<string, object?> parameters, MySqlConnection? connection = null, MySqlTransaction? transaction = null)
		{
			string cmdText = ""; bool createdConnection = false; long? insertedId = null; int rowsAffected = 0;
			try
			{
				if (connection == null) { connection = new MySqlConnection(_connectionString); await connection.OpenAsync(); createdConnection = true; }
				if (connection.State != System.Data.ConnectionState.Open) throw new Exception("Connection failed to open.");
				using (MySqlCommand cmdUpdate = new(sql, connection, transaction)) { foreach (var param in parameters) cmdUpdate.Parameters.AddWithValue(param.Key, param.Value ?? DBNull.Value); cmdText = cmdUpdate.CommandText; rowsAffected = await cmdUpdate.ExecuteNonQueryAsync(); if (sql.Trim().StartsWith("INSERT", StringComparison.OrdinalIgnoreCase)) insertedId = cmdUpdate.LastInsertedId; }
			}
			catch (Exception ex)
			{
				await _log.Db("ExecuteInsertOrUpdateOrDeleteAsync ERROR: " + ex.Message + "\n" + ex.StackTrace, null, "BONES", true);
				await _log.Db(cmdText, null, "BONES", true);
				foreach (var param in parameters) await _log.Db("Param: " + param.Key + ": " + param.Value, null, "BONES", true);
				throw;
			}
			finally { if (createdConnection && connection != null) await connection.CloseAsync(); }
			return insertedId ?? rowsAffected;
		}
	}
	class EncounterPositionUpdate
	{
		[System.Text.Json.Serialization.JsonPropertyName("botId")] public int BotId { get; set; }
		[System.Text.Json.Serialization.JsonPropertyName("heroId")] public int HeroId { get; set; }
		[System.Text.Json.Serialization.JsonPropertyName("destinationX")] public int DestinationX { get; set; }
		[System.Text.Json.Serialization.JsonPropertyName("destinationY")] public int DestinationY { get; set; }
	}
}
