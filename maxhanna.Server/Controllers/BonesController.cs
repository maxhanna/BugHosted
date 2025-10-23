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
		// Half-size of the hitbox in pixels; used to compute +/- hit tolerance
		private const int HITBOX_HALF = 16;
		private readonly Log _log;
		private readonly IConfiguration _config;
		private readonly string _connectionString;
		private static Dictionary<string, CancellationTokenSource> activeLocks = new();
		// Track last time encounter movement was processed per map to limit updates to once per second
		private static readonly Dictionary<string, DateTime> _lastEncounterAiRun = new();
		// Track when an encounter started chasing a specific hero (key: encounter hero_id)
		private static readonly Dictionary<int, DateTime> _encounterTargetLockTimes = new();
		// Track recent positions to prevent back-and-forth oscillation: maps encounter hero_id -> (lastX,lastY,wasLastMoveReversalCount)
		private static readonly Dictionary<int, (int lastX, int lastY, int reversalCount)> _encounterRecentPositions = new();
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
				if (request != null)
				{
					await PersistNewAttacks(request, hero, connection, transaction);
				}

				hero = await UpdateHeroInDB(hero, connection, transaction);
				MetaHero[]? heroes = await GetNearbyPlayers(hero, connection, transaction);
				if (!string.IsNullOrEmpty(hero.Map))
				{
					await ProcessEncounterAI(hero.Map, connection, transaction);
				}
				MetaBot[]? enemyBots = await GetEncounters(connection, transaction, hero.Map);
				List<MetaEvent> events = await GetEventsFromDb(hero.Map, hero.Id, connection, transaction);
				// Query recent ATTACK events (last 5 seconds) excluding attacks originating from this hero.
				List<Dictionary<string, object>> recentAttacks = new();
				await CreateAttackEvents(hero, connection, transaction, recentAttacks);
				AddAttackEventsToEventsList(hero, events, recentAttacks);

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

		private static void AddAttackEventsToEventsList(MetaHero hero, List<MetaEvent> events, List<Dictionary<string, object>> recentAttacks)
		{
			foreach (var atk in recentAttacks)
			{
				// Prefer keys "heroId" or "sourceHeroId" for the attack origin
				object? srcObj = null;
				if (atk.ContainsKey("heroId")) srcObj = atk["heroId"];
				else if (atk.ContainsKey("sourceHeroId")) srcObj = atk["sourceHeroId"];

				int srcId = srcObj != null ? Convert.ToInt32(srcObj) : 0;
				var dataDict = new Dictionary<string, string>();
				foreach (var kv in atk)
				{
					dataDict[kv.Key] = kv.Value?.ToString() ?? string.Empty;
				}
				// Create a MetaEvent so client-side multiplayer event processing will handle it like other events
				var meleeEvent = new MetaEvent(0, srcId, DateTime.UtcNow, "OTHER_HERO_ATTACK", hero.Map ?? string.Empty, dataDict);
				events.Add(meleeEvent);
			}
		}

		private async Task CreateAttackEvents(MetaHero hero, MySqlConnection connection, MySqlTransaction transaction, List<Dictionary<string, object>> recentAttacks)
		{
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
				}
			}
			catch (Exception ex)
			{
				await _log.Db("Failed to read recentAttacks: " + ex.Message, hero.Id, "BONES", true);
			}
		}

		private async Task PersistNewAttacks(FetchGameDataRequest request, MetaHero hero, MySqlConnection connection, MySqlTransaction transaction)
		{
			// If client provided recentAttacks, persist them as short-lived ATTACK events so other players can pick them up in this fetch-response.
			if (request?.RecentAttacks != null && request.RecentAttacks.Count > 0)
			{
				try
				{
					foreach (var attack in request.RecentAttacks)
					{
						string insertSql = "INSERT INTO maxhanna.bones_event (hero_id, event, map, data, timestamp) VALUES (@HeroId, @Event, @Map, @Data, UTC_TIMESTAMP());";
						// Normalize attack dictionary values: handle System.Text.Json.JsonElement and JToken values
						var normalized = new Dictionary<string, object?>();
						foreach (var kv in attack)
						{
							object? v = kv.Value;
							try
							{
								if (v is System.Text.Json.JsonElement je)
								{
									switch (je.ValueKind)
									{
										case System.Text.Json.JsonValueKind.String:
											normalized[kv.Key] = je.GetString();
											break;
										case System.Text.Json.JsonValueKind.Number:
											if (je.TryGetInt64(out long l)) normalized[kv.Key] = l;
											else if (je.TryGetDouble(out double d)) normalized[kv.Key] = d;
											else normalized[kv.Key] = je.GetRawText();
											break;
										case System.Text.Json.JsonValueKind.True:
										case System.Text.Json.JsonValueKind.False:
											normalized[kv.Key] = je.GetBoolean();
											break;
										case System.Text.Json.JsonValueKind.Null:
											normalized[kv.Key] = null;
											break;
										default:
											// Object/Array -> raw JSON text
											normalized[kv.Key] = je.GetRawText();
											break;
									}
								}
								else if (v is Newtonsoft.Json.Linq.JToken jt)
								{
									// convert to primitive where possible, otherwise string
									if (jt.Type == Newtonsoft.Json.Linq.JTokenType.Integer) normalized[kv.Key] = jt.ToObject<long>();
									else if (jt.Type == Newtonsoft.Json.Linq.JTokenType.Float) normalized[kv.Key] = jt.ToObject<double>();
									else if (jt.Type == Newtonsoft.Json.Linq.JTokenType.Boolean) normalized[kv.Key] = jt.ToObject<bool>();
									else if (jt.Type == Newtonsoft.Json.Linq.JTokenType.String) normalized[kv.Key] = jt.ToObject<string?>() ?? string.Empty;
									else normalized[kv.Key] = jt.ToString(Newtonsoft.Json.Formatting.None);
								}
								else
								{
									normalized[kv.Key] = v;
								}
							}
							catch
							{
								// Fallback: stringify
								try { normalized[kv.Key] = v?.ToString(); } catch { normalized[kv.Key] = null; }
							}
						}

						var parameters = new Dictionary<string, object?>()
							{
								{ "@HeroId", normalized.ContainsKey("sourceHeroId") ? normalized["sourceHeroId"] ?? hero.Id : hero.Id },
								{ "@Event", "ATTACK" },
								{ "@Map", hero.Map ?? string.Empty },
								{ "@Data", Newtonsoft.Json.JsonConvert.SerializeObject(normalized) }
							};
						await ExecuteInsertOrUpdateOrDeleteAsync(insertSql, parameters, connection, transaction);

						// Additional behaviour: if this attack includes a facing, decrement the bones_encounter.hp
						try
						{
							// Determine source hero id and facing
							int sourceHeroId = normalized.ContainsKey("sourceHeroId") && normalized["sourceHeroId"] != null ? Convert.ToInt32(normalized["sourceHeroId"]) : hero.Id;
							int sourceX = hero.Position.x;
							int sourceY = hero.Position.y;
							int targetX = sourceX;
							int targetY = sourceY;

							if (normalized.ContainsKey("facing") && normalized["facing"] != null)
							{
								// facing can be an int (0=up,1=right,2=down,3=left) or a string
								var fVal = normalized["facing"]?.ToString();
								if (int.TryParse(fVal, out int f))
								{
									switch (f)
									{
										case 0: targetY = sourceY - 16; break; // up
										case 1: targetX = sourceX + 16; break; // right
										case 2: targetY = sourceY + 16; break; // down
										case 3: targetX = sourceX - 16; break; // left
										default: break;
									}
								}
								else
								{
									// try common string values
									var s = fVal?.ToLower() ?? string.Empty;
									if (s == "up" || s == "north") targetY = sourceY - 1;
									else if (s == "right" || s == "east") targetX = sourceX + 16;
									else if (s == "down" || s == "south") targetY = sourceY + 16;
									else if (s == "left" || s == "west") targetX = sourceX - 16;
								}
							}

							// Prefetch attacker level to avoid JOIN+LIMIT MySQL restriction
							int attackerLevel = 1;
							try
							{
								using var lvlCmd = new MySqlCommand("SELECT COALESCE(level,1) FROM maxhanna.bones_hero WHERE id=@HeroId", connection, transaction);
								lvlCmd.Parameters.AddWithValue("@HeroId", sourceHeroId);
								var lvlObj = await lvlCmd.ExecuteScalarAsync();
								if (lvlObj != null && int.TryParse(lvlObj.ToString(), out int lvlTmp)) attackerLevel = Math.Max(1, lvlTmp);
							}
							catch { attackerLevel = 1; }

							// Determine AoE half-size: allow client to send 'aoe', 'radius', 'width', or 'threshold'. Fallback to HITBOX_HALF for single-tile tolerance.
							int aoeHalf = HITBOX_HALF; // default tolerance radius
							string[] aoeKeys = new[] { "aoe", "radius", "width", "threshold" };
							foreach (var k in aoeKeys)
							{
								if (normalized.ContainsKey(k) && normalized[k] != null)
								{
									var sVal = normalized[k]?.ToString();
									if (int.TryParse(sVal, out int parsed) && parsed > 0)
									{
										// Interpret parsed as full width if key is 'width'; convert to half-size
										if (k == "width" && parsed > 1) aoeHalf = parsed / 2; else aoeHalf = parsed;
										break;
									}
								}
							}
							// Prevent absurd huge AoE (sanity cap)
							aoeHalf = Math.Min(aoeHalf, 512);

							int xMin = targetX - aoeHalf;
							int xMax = targetX + aoeHalf;
							int yMin = targetY - aoeHalf;
							int yMax = targetY + aoeHalf;

							// If facing provided, optionally elongate AoE in facing direction if client supplies 'length'
							if (normalized.ContainsKey("length") && normalized["length"] != null && int.TryParse(normalized["length"]?.ToString(), out int length) && length > 0)
							{
								// Extend rectangle in facing direction by length (convert to pixels already assumed)
								int extend = length;
								if (normalized.ContainsKey("facing") && normalized["facing"] != null)
								{
									var fVal = normalized["facing"]?.ToString();
									if (int.TryParse(fVal, out int f))
									{
										if (f == 0) yMin = targetY - extend; // up
										else if (f == 1) xMax = targetX + extend; // right
										else if (f == 2) yMax = targetY + extend; // down
										else if (f == 3) xMin = targetX - extend; // left
									}
									else
									{
										var sF = fVal?.ToLower() ?? string.Empty;
										if (sF.Contains("up") || sF.Contains("north")) yMin = targetY - extend;
										else if (sF.Contains("right") || sF.Contains("east")) xMax = targetX + extend;
										else if (sF.Contains("down") || sF.Contains("south")) yMax = targetY + extend;
										else if (sF.Contains("left") || sF.Contains("west")) xMin = targetX - extend;
									}
								}
							}

							string updateHpSql = @"
							UPDATE maxhanna.bones_encounter e
							SET e.hp = GREATEST(e.hp - @AttackerLevel, 0),
								e.target_hero_id = @HeroId,
								e.last_killed = CASE WHEN (e.hp - @AttackerLevel) <= 0 THEN UTC_TIMESTAMP() ELSE e.last_killed END
							WHERE e.map = @Map
								AND e.hp > 0
								AND e.coordsX BETWEEN @XMin AND @XMax
								AND e.coordsY BETWEEN @YMin AND @YMax;"; // allow multi-row AoE damage; no LIMIT
							var updateParams = new Dictionary<string, object?>() {
							{ "@Map", hero.Map ?? string.Empty },
							{ "@HeroId", sourceHeroId },
							{ "@AttackerLevel", attackerLevel },
							{ "@XMin", xMin },
							{ "@XMax", xMax },
							{ "@YMin", yMin },
							{ "@YMax", yMax }
						};
							int rows = Convert.ToInt32(await ExecuteInsertOrUpdateOrDeleteAsync(updateHpSql, updateParams, connection, transaction));

							// if (rows == 0)
							// {
							// // Debug log for missed attack to help diagnose coordinate/aoe mismatch
							// await _log.Db($"Attack miss heroId={sourceHeroId} map={hero.Map} src=({sourceX},{sourceY}) tgt=({targetX},{targetY}) facing={normalized.GetValueOrDefault("facing")} aoeHalf={aoeHalf} rect=({xMin},{yMin})-({xMax},{yMax})", hero.Id, "BONES", true);
							// }

							if (rows > 0)
							{
								// Emit one BOT_DAMAGE meta-event summarizing AoE (center + bounds)
								var data = new Dictionary<string, string>
							{
								{ "sourceId", sourceHeroId.ToString() },
								{ "centerX", targetX.ToString() },
								{ "centerY", targetY.ToString() },
								{ "xMin", xMin.ToString() },
								{ "xMax", xMax.ToString() },
								{ "yMin", yMin.ToString() },
								{ "yMax", yMax.ToString() },
								{ "damage", attackerLevel.ToString() }
							};
								var botDamageEvent = new MetaEvent(0, sourceHeroId, DateTime.UtcNow, "BOT_DAMAGE", hero.Map ?? string.Empty, data);
								await UpdateEventsInDB(botDamageEvent, connection, transaction);

								// Check if any encounters died (hp reached 0) and award EXP in same transaction
								try
								{
									string selectDeadSql = @"SELECT hero_id, `level`, hp FROM maxhanna.bones_encounter WHERE map = @Map AND hp = 0 AND coordsX BETWEEN @XMin AND @XMax AND coordsY BETWEEN @YMin AND @YMax;";
									using var deadCmd = new MySqlCommand(selectDeadSql, connection, transaction);
									deadCmd.Parameters.AddWithValue("@Map", hero.Map ?? string.Empty);
									deadCmd.Parameters.AddWithValue("@XMin", xMin);
									deadCmd.Parameters.AddWithValue("@XMax", xMax);
									deadCmd.Parameters.AddWithValue("@YMin", yMin);
									deadCmd.Parameters.AddWithValue("@YMax", yMax);
									using var deadRdr = await deadCmd.ExecuteReaderAsync();
									var deadEncounters = new List<(int encId, int encLevel)>();
									while (await deadRdr.ReadAsync())
									{
										int encLevel = deadRdr.IsDBNull(deadRdr.GetOrdinal("level")) ? 0 : deadRdr.GetInt32(deadRdr.GetOrdinal("level"));
										int encId = deadRdr.GetInt32(deadRdr.GetOrdinal("hero_id"));
										deadEncounters.Add((encId, encLevel));
									}
									deadRdr.Close();
									// Now award EXP after the reader is closed to avoid using the same connection with an open reader
									var awarded = new HashSet<int>();
									foreach (var d in deadEncounters)
									{
										if (!awarded.Contains(d.encId))
										{
											await AwardEncounterKillExp(sourceHeroId, d.encLevel, connection, transaction);
											awarded.Add(d.encId);
										}
									}
								}
								catch (Exception ex2)
								{
									await _log.Db("Failed awarding EXP in PersistNewAttacks: " + ex2.Message, hero.Id, "BONES", true);
								}
							}
						}
						catch (Exception ex)
						{
							await _log.Db("Failed to apply encounter damage from PersistNewAttacks: " + ex.Message, hero.Id, "BONES", true);
						}
					}
				}
				catch (Exception ex)
				{
					await _log.Db("Failed to persist recentAttacks: " + ex.Message, hero.Id, "BONES", true);
				}
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
				await transaction.CommitAsync();
				return Ok(new { inventory });
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
		public IActionResult CreateBot([FromBody] MetaBot bot) => StatusCode(410, "Metabot functionality removed. Use bones_encounter on the frontend.");

		[HttpPost("/Bones/UpdateBotParts", Name = "Bones_UpdateBotParts")]
		public IActionResult UpdateBotParts([FromBody] UpdateBotPartsRequest req) => StatusCode(410, "Metabot parts removed. Parts are constructed client-side from bones_encounter.");

		[HttpPost("/Bones/EquipPart", Name = "Bones_EquipPart")]
		public IActionResult EquipPart([FromBody] EquipPartRequest req) => StatusCode(410, "EquipPart deprecated: metabot server-side parts removed.");

		[HttpPost("/Bones/UnequipPart", Name = "Bones_UnequipPart")]
		public IActionResult UnequipPart([FromBody] EquipPartRequest req) => StatusCode(410, "UnequipPart deprecated: metabot server-side parts removed.");

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
				// Metabot data removed; return placeholder indicating no bots
				return Ok(new { hasBot = false, rank = (int?)null, level = 0, totalPlayers = 0 });
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
				// Simplified highscores: return heroes ordered by created date as placeholder. Metabot aggregation removed.
				string sql = @"SELECT
					mh.id AS heroId,
					mh.user_id AS userId,
					mh.name AS heroName,
					mh.level AS level,
					u.username as username,
					udpfl.id as display_picture_file_id
				FROM maxhanna.bones_hero mh
				LEFT JOIN maxhanna.users u ON u.id = mh.user_id
				LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
				LEFT JOIN maxhanna.file_uploads udpfl ON udp.file_id = udpfl.id
				WHERE mh.name IS NOT NULL
				ORDER BY mh.created DESC
				LIMIT @Count;";
				using var cmd = new MySqlCommand(sql, connection);
				cmd.Parameters.AddWithValue("@Count", Math.Max(1, count));
				using var rdr = await cmd.ExecuteReaderAsync();
				var results = new List<object>();
				while (await rdr.ReadAsync())
				{
					FileEntry? displayPic = !rdr.IsDBNull(rdr.GetOrdinal("display_picture_file_id")) ? new FileEntry(rdr.GetInt32(rdr.GetOrdinal("display_picture_file_id"))) : null;
					User? ownerUser = !rdr.IsDBNull(rdr.GetOrdinal("userId")) ? new User(id: rdr.GetInt32(rdr.GetOrdinal("userId")), username: rdr.IsDBNull(rdr.GetOrdinal("username")) ? "Anonymous" : SafeGetString(rdr, "username") ?? "Anonymous", displayPictureFile: displayPic) : null;
					results.Add(new
					{
						heroId = rdr.GetInt32("heroId"),
						owner = ownerUser,
						heroName = rdr.IsDBNull(rdr.GetOrdinal("heroName")) ? null : SafeGetString(rdr, "heroName"),
						level = rdr.IsDBNull(rdr.GetOrdinal("level")) ? 0 : rdr.GetInt32("level")
					});
				}
				return Ok(results);
			}
			catch (Exception ex)
			{
				await _log.Db("Error fetching bones hero highscores: " + ex.Message, null, "BONES", true);
				return StatusCode(500, "An error occurred fetching bones hero highscores.");
			}
		}

		[HttpPost("/Bones/GetHeroSelections", Name = "Bones_GetHeroSelections")]
		public async Task<IActionResult> GetHeroSelections([FromBody] int userId)
		{
			if (userId <= 0) return BadRequest("Invalid user id");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			try
			{
				string sql = @"SELECT id, bones_hero_id, name, created FROM maxhanna.bones_hero_selection WHERE user_id = @UserId ORDER BY created DESC;";
				using var cmd = new MySqlCommand(sql, connection);
				cmd.Parameters.AddWithValue("@UserId", userId);
				using var rdr = await cmd.ExecuteReaderAsync();
				var list = new List<object>();
				while (await rdr.ReadAsync())
				{
					list.Add(new { id = rdr.GetInt32(0), bonesHeroId = rdr.IsDBNull(1) ? (int?)null : rdr.GetInt32(1), name = rdr.IsDBNull(2) ? null : rdr.GetString(2), created = rdr.IsDBNull(3) ? (DateTime?)null : rdr.GetDateTime(3) });
				}
				return Ok(list);
			}
			catch (Exception ex)
			{
				await _log.Db("GetHeroSelections failure: " + ex.Message, userId, "BONES", true);
				return StatusCode(500, "Failed to fetch hero selections");
			}
		}

		[HttpPost("/Bones/CreateHeroSelection", Name = "Bones_CreateHeroSelection")]
		public async Task<IActionResult> CreateHeroSelection([FromBody] int userId)
		{
			if (userId <= 0) return BadRequest("Invalid user id");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = await connection.BeginTransactionAsync();
			try
			{
				// Copy current bones_hero for user into bones_hero_selection (snapshot)
				string insertSql = @"INSERT INTO maxhanna.bones_hero_selection (user_id, bones_hero_id, name, data, created)
				SELECT h.user_id, h.id, h.name, JSON_OBJECT('coordsX', h.coordsX, 'coordsY', h.coordsY, 'map', h.map, 'speed', h.speed, 'color', h.color, 'mask', h.mask, 'level', h.level, 'exp', h.exp, 'attack_speed', h.attack_speed), UTC_TIMESTAMP()
				FROM maxhanna.bones_hero h WHERE h.user_id = @UserId LIMIT 1;";
				using var cmd = new MySqlCommand(insertSql, connection, transaction);
				cmd.Parameters.AddWithValue("@UserId", userId);
				int rows = await cmd.ExecuteNonQueryAsync();
				await transaction.CommitAsync();
				return Ok(new { created = rows > 0 });
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				await _log.Db("CreateHeroSelection failure: " + ex.Message, userId, "BONES", true);
				return StatusCode(500, "Failed to create hero selection");
			}
		}

		[HttpPost("/Bones/PromoteHeroSelection", Name = "Bones_PromoteHeroSelection")]
		public async Task<IActionResult> PromoteHeroSelection([FromBody] int selectionId)
		{
			if (selectionId <= 0) return BadRequest("Invalid selection id");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = await connection.BeginTransactionAsync();
			try
			{
				// Read selection data
				string selSql = @"SELECT user_id, bones_hero_id, name, data FROM maxhanna.bones_hero_selection WHERE id = @SelId LIMIT 1;";
				using var selCmd = new MySqlCommand(selSql, connection, transaction);
				selCmd.Parameters.AddWithValue("@SelId", selectionId);
				using var rdr = await selCmd.ExecuteReaderAsync();
				if (!await rdr.ReadAsync()) { await transaction.RollbackAsync(); return NotFound(); }
				int userId = rdr.GetInt32(0);
				int? bonesHeroId = rdr.IsDBNull(1) ? (int?)null : rdr.GetInt32(1);
				string? name = rdr.IsDBNull(2) ? null : rdr.GetString(2);
				string? dataJson = rdr.IsDBNull(3) ? null : rdr.GetString(3);
				rdr.Close();
				// If bonesHeroId present, overwrite bones_hero row for that user; otherwise insert a new bones_hero
				if (bonesHeroId.HasValue)
				{
					// Update bones_hero using dataJson fields (coordsX, coordsY, map, speed, color, mask, level, exp, attack_speed)
					string updateSql = @"UPDATE maxhanna.bones_hero SET coordsX = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.coordsX'))+0, coordsY = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.coordsY'))+0, map = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.map')), speed = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.speed'))+0, color = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.color')), mask = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.mask'))+0, level = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.level'))+0, exp = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.exp'))+0, attack_speed = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.attack_speed'))+0 WHERE id = @HeroId LIMIT 1;";
					using var upCmd = new MySqlCommand(updateSql, connection, transaction);
					upCmd.Parameters.AddWithValue("@Data", dataJson ?? "{}" );
					upCmd.Parameters.AddWithValue("@HeroId", bonesHeroId.Value);
					await upCmd.ExecuteNonQueryAsync();
				}
				else
				{
					// Try to update an existing bones_hero for this user; if none exist, insert a new one.
					string updateByUserSql = @"UPDATE maxhanna.bones_hero SET coordsX = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.coordsX'))+0, coordsY = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.coordsY'))+0, map = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.map')), speed = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.speed'))+0, name = @Name, color = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.color')), mask = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.mask'))+0, level = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.level'))+0, exp = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.exp'))+0, attack_speed = JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.attack_speed'))+0 WHERE user_id = @UserId LIMIT 1;";
					using var upUserCmd = new MySqlCommand(updateByUserSql, connection, transaction);
					upUserCmd.Parameters.AddWithValue("@Data", dataJson ?? "{}");
					upUserCmd.Parameters.AddWithValue("@UserId", userId);
					upUserCmd.Parameters.AddWithValue("@Name", name ?? "Anon");
					int updatedRows = await upUserCmd.ExecuteNonQueryAsync();
					if (updatedRows == 0)
					{
						string insertSql = @"INSERT INTO maxhanna.bones_hero (user_id, coordsX, coordsY, map, speed, name, color, mask, level, exp, created, attack_speed) VALUES (@UserId, JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.coordsX'))+0, JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.coordsY'))+0, JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.map')), JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.speed'))+0, @Name, JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.color')), JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.mask'))+0, JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.level'))+0, JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.exp'))+0, UTC_TIMESTAMP(), JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.attack_speed'))+0);";
						using var inCmd = new MySqlCommand(insertSql, connection, transaction);
						inCmd.Parameters.AddWithValue("@UserId", userId);
						inCmd.Parameters.AddWithValue("@Data", dataJson ?? "{}");
						inCmd.Parameters.AddWithValue("@Name", name ?? "Anon");
						await inCmd.ExecuteNonQueryAsync();
					}
				}
				await transaction.CommitAsync();
				return Ok();
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				await _log.Db("PromoteHeroSelection failure: " + ex.Message, null, "BONES", true);
				return StatusCode(500, "Failed to promote selection");
			}
		}

		[HttpPost("/Bones/DeleteHeroSelection", Name = "Bones_DeleteHeroSelection")]
		public async Task<IActionResult> DeleteHeroSelection([FromBody] int selectionId)
		{
			if (selectionId <= 0) return BadRequest("Invalid selection id");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			try
			{
				string sql = @"DELETE FROM maxhanna.bones_hero_selection WHERE id = @SelId";
				using var cmd = new MySqlCommand(sql, connection);
				cmd.Parameters.AddWithValue("@SelId", selectionId);
				int rows = await cmd.ExecuteNonQueryAsync();
				return Ok(new { deleted = rows > 0 });
			}
			catch (Exception ex)
			{
				await _log.Db("DeleteHeroSelection failure: " + ex.Message, null, "BONES", true);
				return StatusCode(500, "Failed to delete selection");
			}
		}

		[HttpPost("/Bones/DeleteHero", Name = "Bones_DeleteHero")]
		public async Task<IActionResult> DeleteHero([FromBody] int userId)
		{
			if (userId <= 0) return BadRequest("Invalid user id");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = await connection.BeginTransactionAsync();
			try
			{
				// Delete the bones_hero row for this user (if any)
				string sql = @"DELETE FROM maxhanna.bones_hero WHERE user_id = @UserId LIMIT 1;";
				using var cmd = new MySqlCommand(sql, connection, transaction);
				cmd.Parameters.AddWithValue("@UserId", userId);
				int rows = await cmd.ExecuteNonQueryAsync();
				await transaction.CommitAsync();
				return Ok(new { deleted = rows > 0 });
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				await _log.Db("DeleteHero failure: " + ex.Message, userId, "BONES", true);
				return StatusCode(500, "Failed to delete hero");
			}
		}

		[HttpPost("/Bones/SellBotParts", Name = "Bones_SellBotParts")]
		public IActionResult SellBotParts([FromBody] SellBotPartsRequest req) => Ok();

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
				string sql = @"
				DELETE FROM maxhanna.bones_event WHERE timestamp < UTC_TIMESTAMP() - INTERVAL 20 SECOND; 
				INSERT INTO maxhanna.bones_event (hero_id, event, map, data, timestamp) VALUES (@HeroId, @Event, @Map, @Data, UTC_TIMESTAMP());";
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
				string sql = @"DELETE FROM maxhanna.bones_event WHERE timestamp < UTC_TIMESTAMP() - INTERVAL 20 SECOND; SELECT * FROM maxhanna.bones_event WHERE map = @Map OR (event = 'CHAT' AND hero_id IN (" + string.Join(",", partyMemberIds) + "));";
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
				// bones_bot_part table removed — don't join or select part columns
				// include attack_speed if present
				string sql = $"SELECT h.id as hero_id, h.coordsX, h.coordsY, h.map, h.speed, h.name as hero_name, h.color as hero_color, h.mask as hero_mask, h.level as hero_level, h.exp as hero_exp, h.attack_speed as attack_speed, b.id as bot_id, b.name as bot_name, b.type as bot_type, b.hp as bot_hp, b.is_deployed as bot_is_deployed, b.level as bot_level, b.exp as bot_exp FROM maxhanna.bones_hero h LEFT JOIN maxhanna.bones_bot b ON h.id = b.hero_id WHERE {(heroId == null ? "h.user_id = @UserId" : "h.id = @UserId")};";
				MySqlCommand cmd = new(sql, conn, transaction); cmd.Parameters.AddWithValue("@UserId", heroId != null ? heroId : userId);
				MetaHero? hero = null; Dictionary<int, MetaBot> metabotDict = new();
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (reader.Read())
					{
						if (hero == null)
						{
							int levelOrd = reader.GetOrdinal("hero_level");
							int expOrd = reader.GetOrdinal("hero_exp");
							int attackSpeed = reader.IsDBNull(reader.GetOrdinal("attack_speed")) ? 400 : reader.GetInt32(reader.GetOrdinal("attack_speed"));  
							hero = new MetaHero {
								Id = reader.GetInt32("hero_id"),
								Position = new Vector2(reader.GetInt32("coordsX"), reader.GetInt32("coordsY")),
								Speed = reader.GetInt32("speed"),
								Map = SafeGetString(reader, "map") ?? string.Empty,
								Name = SafeGetString(reader, "hero_name"),
								Color = SafeGetString(reader, "hero_color") ?? string.Empty,
								Mask = reader.IsDBNull(reader.GetOrdinal("hero_mask")) ? null : reader.GetInt32("hero_mask"),
								Level = reader.IsDBNull(levelOrd) ? 0 : reader.GetInt32(levelOrd),
								Exp = reader.IsDBNull(expOrd) ? 0 : reader.GetInt32(expOrd), 
								AttackSpeed = attackSpeed
							};
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
		private async Task<MetaBot[]> GetEncounters(MySqlConnection conn, MySqlTransaction transaction, string map)
		{
			try
			{
				var bots = new List<MetaBot>();
				string sql = @"
					SELECT hero_id, coordsX, coordsY, `level`, hp, `name`, last_killed, o_coordsX, o_coordsY, speed, aggro, last_moved, target_hero_id
					FROM maxhanna.bones_encounter
					WHERE map = @Map;";
				using var cmd = new MySqlCommand(sql, conn, transaction);
				cmd.Parameters.AddWithValue("@Map", map);
				using var reader = await cmd.ExecuteReaderAsync();
				while (await reader.ReadAsync())
				{
					int heroId = reader.IsDBNull(reader.GetOrdinal("hero_id")) ? 0 : reader.GetInt32("hero_id");
					int coordsX = reader.IsDBNull(reader.GetOrdinal("coordsX")) ? 0 : reader.GetInt32("coordsX");
					int coordsY = reader.IsDBNull(reader.GetOrdinal("coordsY")) ? 0 : reader.GetInt32("coordsY");
					int level = reader.IsDBNull(reader.GetOrdinal("level")) ? 1 : reader.GetInt32("level");
					int hp = reader.IsDBNull(reader.GetOrdinal("hp")) ? 0 : reader.GetInt32("hp");
					string typeVal = reader.IsDBNull(reader.GetOrdinal("name")) ? "armobot" : reader.GetString("name");
					// Construct MetaBot where Id and HeroId are the encounter hero_id
					var mb = new MetaBot
					{
						Id = heroId,
						HeroId = heroId,
						Position = new Vector2(coordsX, coordsY),
						Level = level,
						Hp = hp,
						Name = typeVal,
						IsDeployed = false,
						TargetHeroId = reader.IsDBNull(reader.GetOrdinal("target_hero_id")) ? (int?)null : reader.GetInt32(reader.GetOrdinal("target_hero_id"))
					};
					bots.Add(mb);
				}
				return bots.ToArray();
			}
			catch (Exception ex)
			{
				await _log.Db($"GetEncounterMetaBots Exception: {ex.Message}\n{ex.StackTrace}\nmap={map}", null, "BONES", true);
				throw;
			}
		}

		/// <summary>
		/// Processes encounter AI for a given map: 
		/// 1. Respawns dead encounters (hp=0 & last_killed older than 2 minutes) to 100 hp.
		/// 2. For living encounters with aggro > 0, finds closest hero within aggro * 16 (Manhattan in tiles) and moves towards them.
		///    Movement rate: up to `speed` grid cells, but only one cell per second since last_moved.
		///    Movement is axis-aligned, prioritizing the axis with greatest distance.
		/// </summary>
		private async Task ProcessEncounterAI(string map, MySqlConnection connection, MySqlTransaction transaction)
		{
			// Early rate-limit: avoid entering expensive AI processing more than once per second per map.
			DateTime nowEarly = DateTime.UtcNow;
			lock (_lastEncounterAiRun)
			{
				if (_lastEncounterAiRun.TryGetValue(map, out var lastEarly) && (nowEarly - lastEarly).TotalSeconds < 1.0)
				{
					return; // skip processing this tick
				}
				// reserve the slot immediately so concurrent callers won't all proceed
				_lastEncounterAiRun[map] = nowEarly;
			}
			try
			{
				// Respawn logic: set hp back to 100 if dead for > 120 seconds
				const string respawnSql = @"UPDATE maxhanna.bones_encounter 
					SET hp = 100, last_killed = NULL, coordsX = o_coordsX, coordsY = o_coordsY, target_hero_id = 0, last_moved = UTC_TIMESTAMP() 
					WHERE map = @Map AND hp <= 0 AND last_killed IS NOT NULL AND last_killed < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 120 SECOND);";
				await ExecuteInsertOrUpdateOrDeleteAsync(respawnSql, new Dictionary<string, object?> { { "@Map", map } }, connection, transaction);
				DateTime now = DateTime.UtcNow;

				// Fetch encounters needing AI processing (include target_hero_id for chase locking)
				const string selectSql = @"SELECT hero_id, coordsX, coordsY, o_coordsX, o_coordsY, hp, speed, aggro, last_moved, target_hero_id 
					FROM maxhanna.bones_encounter WHERE map = @Map";
				using var cmd = new MySqlCommand(selectSql, connection, transaction);
				cmd.Parameters.AddWithValue("@Map", map);
				var encounters = new List<(int heroId, int x, int y, int ox, int oy, int hp, int speed, int aggro, DateTime? lastMoved, int targetHeroId)>();
				using (var rdr = await cmd.ExecuteReaderAsync())
				{
					while (await rdr.ReadAsync())
					{
						encounters.Add((
							rdr.GetInt32("hero_id"),
							rdr.GetInt32("coordsX"),
							rdr.GetInt32("coordsY"),
							rdr.GetInt32("o_coordsX"),
							rdr.GetInt32("o_coordsY"),
							rdr.GetInt32("hp"),
							rdr.GetInt32("speed"),
							rdr.GetInt32("aggro"),
							rdr.IsDBNull(rdr.GetOrdinal("last_moved")) ? (DateTime?)null : rdr.GetDateTime("last_moved"),
							rdr.IsDBNull(rdr.GetOrdinal("target_hero_id")) ? 0 : rdr.GetInt32("target_hero_id")
						));
					}
				}

				if (encounters.Count == 0) return;

				// Get heroes on this map to determine targets. Build both list and fast lookup dictionary to avoid LINQ allocations in hot loops.
				var heroes = new List<(int heroId, int x, int y)>();
				var heroById = new Dictionary<int, (int x, int y)>();
				const string heroSql = @"SELECT id, coordsX, coordsY FROM maxhanna.bones_hero WHERE map = @Map";
				using (var hCmd = new MySqlCommand(heroSql, connection, transaction))
				{
					hCmd.Parameters.AddWithValue("@Map", map);
					using var hr = await hCmd.ExecuteReaderAsync();
					while (await hr.ReadAsync())
					{
						int id = hr.GetInt32(0);
						int hx = hr.GetInt32(1);
						int hy = hr.GetInt32(2);
						heroes.Add((id, hx, hy));
						heroById[id] = (hx, hy);
					}
				}

				if (heroes.Count == 0) return; // no targets

				var updateBuilder = new StringBuilder();
				var parameters = new Dictionary<string, object?>();
				int idx = 0;
				// Localize frequently-used values
				int tile = HITBOX_HALF; // 16
				foreach (var e in encounters)
				{
					if (e.hp <= 0) continue; // dead, wait for respawn
					if (e.aggro <= 0) continue; // no aggro range

					int aggroPixels = e.aggro * tile; // range in pixels
					(int heroId, int x, int y)? closest = null;
					int targetHeroId = e.targetHeroId;
					int curX = e.x; int curY = e.y; // working cursor for tentative movement/snapping
					bool lockValid = false;

					// If there's an existing lock, try O(1) lookup
					if (targetHeroId != 0 && heroById.TryGetValue(targetHeroId, out var lockedPos))
					{
						int distToLocked = Math.Abs(lockedPos.x - e.x) + Math.Abs(lockedPos.y - e.y);
						double graceSeconds = Math.Max(1, e.aggro) * 5.0; // 5s per aggro level
						if (_encounterTargetLockTimes.TryGetValue(e.heroId, out var lockStart))
						{
							if (distToLocked <= aggroPixels || (now - lockStart).TotalSeconds < graceSeconds)
							{
								closest = (targetHeroId, lockedPos.x, lockedPos.y);
								lockValid = true;
							}
						}
					}

					if (!lockValid)
					{
						// Find nearest hero within range (manual loop avoids LINQ allocations)
						int bestDist = int.MaxValue;
						for (int hi = 0; hi < heroes.Count; hi++)
						{
							var h = heroes[hi];
							int dist = Math.Abs(h.x - e.x) + Math.Abs(h.y - e.y);
							if (dist <= aggroPixels && dist < bestDist)
							{
								bestDist = dist;
								closest = h;
							}
						}
						if (closest != null)
						{
							// Set/refresh lock timestamp
							_encounterTargetLockTimes[e.heroId] = now;
							targetHeroId = closest.Value.heroId;
							int dx = closest.Value.x - e.x;
							int dy = closest.Value.y - e.y;
							if (Math.Abs(dx) >= Math.Abs(dy))
							{
								curX = closest.Value.x + (dx > 0 ? -tile : tile);
								curY = closest.Value.y;
							}
							else
							{
								curX = closest.Value.x;
								curY = closest.Value.y + (dy > 0 ? -tile : tile);
							}
							closest = (closest.Value.heroId, curX, curY);
						}
						else
						{
							// No hero to chase, clear lock if existed and return to origin
							_encounterTargetLockTimes.Remove(e.heroId);
							targetHeroId = 0;
							if (e.ox == e.x && e.oy == e.y) continue; // already at origin
							closest = (0, e.ox, e.oy);
						}
					}

					// If lock expired (graceSeconds) and hero out of range, transition to return-to-origin
					if (closest != null && closest.Value.heroId == targetHeroId && targetHeroId != 0 && _encounterTargetLockTimes.TryGetValue(e.heroId, out var ls))
					{
						int distCurrent = Math.Abs(closest.Value.x - e.x) + Math.Abs(closest.Value.y - e.y);
						double graceSeconds = Math.Max(1, e.aggro) * 5.0;
						if (distCurrent > aggroPixels && (now - ls).TotalSeconds >= graceSeconds)
						{
							_encounterTargetLockTimes.Remove(e.heroId);
							targetHeroId = 0;
							closest = (0, e.ox, e.oy);
						}
					}

					// Rate limit: only move if >=1 second since last_moved
					bool canMoveTime = !e.lastMoved.HasValue || (now - e.lastMoved.Value).TotalSeconds >= 1.0;
					if (!canMoveTime) continue;

					// If target is a hero and the encounter is axis-adjacent by one grid cell, don't move
					if (closest.HasValue && closest.Value.heroId != 0)
					{
						int dxAdj = Math.Abs(closest.Value.x - e.x);
						int dyAdj = Math.Abs(closest.Value.y - e.y);
						if ((dxAdj == tile && dyAdj == 0) || (dyAdj == tile && dxAdj == 0))
						{
							continue; // already adjacent
						}
					}

					int remainingSpeed = Math.Max(1, e.speed);
					var targetPos = closest.HasValue ? closest.Value : (0, e.x, e.y);
					while (closest.HasValue && remainingSpeed > 0 && (curX != targetPos.x || curY != targetPos.y))
					{
						int dx = targetPos.x - curX;
						int dy = targetPos.y - curY;
						if (Math.Abs(dx) >= Math.Abs(dy))
						{
							curX += dx == 0 ? 0 : (dx > 0 ? tile : -tile);
						}
						else
						{
							curY += dy == 0 ? 0 : (dy > 0 ? tile : -tile);
						}
						remainingSpeed--;
					}

					if (curX != e.x || curY != e.y || e.targetHeroId != targetHeroId)
					{
						// Prevent rapid back-and-forth oscillation: allow one reversal but not repeated toggles
						if (_encounterRecentPositions.TryGetValue(e.heroId, out var recent))
						{
							if (recent.lastX == curX && recent.lastY == curY && recent.reversalCount >= 1)
							{
								continue;
							}
						}
						// Update reversal tracking
						if (!_encounterRecentPositions.ContainsKey(e.heroId))
						{
							_encounterRecentPositions[e.heroId] = (e.x, e.y, 0);
						}
						var before = _encounterRecentPositions[e.heroId];
						if (before.lastX == curX && before.lastY == curY)
						{
							_encounterRecentPositions[e.heroId] = (e.x, e.y, Math.Min(2, before.reversalCount + 1));
						}
						else
						{
							_encounterRecentPositions[e.heroId] = (e.x, e.y, 0);
						}

						updateBuilder.AppendLine($@"
							UPDATE maxhanna.bones_encounter 
							SET coordsX = @nx_{idx}, 
								coordsY = @ny_{idx}, 
								target_hero_id = @thid_{idx}, 
								last_moved = UTC_TIMESTAMP() 
							WHERE hero_id = @hid_{idx};"
						);
						parameters[$"@nx_{idx}"] = curX;
						parameters[$"@ny_{idx}"] = curY;
						parameters[$"@hid_{idx}"] = e.heroId;
						parameters[$"@thid_{idx}"] = targetHeroId;
						idx++;
					}
				}

				if (updateBuilder.Length > 0)
				{
					await ExecuteInsertOrUpdateOrDeleteAsync(updateBuilder.ToString(), parameters, connection, transaction);
				}
			}
			catch (Exception ex)
			{
				await _log.Db("ProcessEncounterAI error: " + ex.Message, null, "BONES", true);
			}
		}
		private async Task<MetaHero[]?> GetNearbyPlayers(MetaHero hero, MySqlConnection conn, MySqlTransaction transaction)
		{
			try
			{
				if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
				if (transaction == null) throw new InvalidOperationException("Transaction is required for this operation.");
				Dictionary<int, MetaHero> heroesDict = new();
				// Return nearby hero records only; encounter bots are constructed client-side from bones_encounter.
				// include attack_speed column if present
				string sql = @"
				SELECT m.id as hero_id, 
					m.name as hero_name,
					m.map as hero_map,
					m.coordsX, 
					m.coordsY,
					m.speed, 
					m.color, 
					m.mask, 
					m.level as hero_level,
					m.exp as hero_exp,
					m.updated as hero_updated,
					m.created as hero_created,
					m.attack_speed as hero_attack_speed 
				FROM maxhanna.bones_hero m 
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
							var exp = reader.IsDBNull(reader.GetOrdinal("hero_exp")) ? 0 : reader.GetInt32(reader.GetOrdinal("hero_exp"));
							var color = reader.IsDBNull(reader.GetOrdinal("color")) ? string.Empty : reader.GetString(reader.GetOrdinal("color"));
							int? mask = reader.IsDBNull(reader.GetOrdinal("mask")) ? (int?)null : reader.GetInt32(reader.GetOrdinal("mask"));
							int coordsX = reader.IsDBNull(reader.GetOrdinal("coordsX")) ? 0 : reader.GetInt32(reader.GetOrdinal("coordsX"));
							int coordsY = reader.IsDBNull(reader.GetOrdinal("coordsY")) ? 0 : reader.GetInt32(reader.GetOrdinal("coordsY"));
							int speed = reader.IsDBNull(reader.GetOrdinal("speed")) ? 0 : reader.GetInt32(reader.GetOrdinal("speed"));
							var updated = reader.IsDBNull(reader.GetOrdinal("hero_updated")) ? DateTime.UtcNow : reader.GetDateTime(reader.GetOrdinal("hero_updated"));
							var created = reader.IsDBNull(reader.GetOrdinal("hero_created")) ? DateTime.UtcNow : reader.GetDateTime(reader.GetOrdinal("hero_created"));
							int attackSpeed = reader.IsDBNull(reader.GetOrdinal("hero_attack_speed")) ? 400 : reader.GetInt32(reader.GetOrdinal("hero_attack_speed"));  
							tmpHero = new MetaHero
							{
								Id = heroId,
								Name = name,
								Map = mapVal,
								Level = level,
								Exp = exp,
								Color = color,
								Mask = mask,
								Position = new Vector2(coordsX, coordsY),
								Speed = speed,
								AttackSpeed = attackSpeed,
								Updated = updated,
								Created = created,
							};
							heroesDict[heroId] = tmpHero;
						}
						// Note: metabot data removed; GetNearbyPlayers only returns hero info. Client constructs encounters from bones_encounter.
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
		
		private async Task PerformEventChecks(MetaEvent metaEvent, MySqlConnection connection, MySqlTransaction transaction)
		{
			if (metaEvent != null && metaEvent.Data != null && metaEvent.EventType == "UNPARTY")
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
		}
		private async Task UpdateEncounterPositionBatch(List<EncounterPositionUpdate> updates, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				var sql = new StringBuilder();
				var parameters = new Dictionary<string, object?>();
				int paramIndex = 0;
				foreach (var update in updates)
				{
					sql.AppendLine($"UPDATE maxhanna.bones_encounter SET coordsX = @coordsX_{paramIndex}, coordsY = @coordsY_{paramIndex} WHERE hero_id = @heroId_{paramIndex} LIMIT 1;");
					parameters.Add($"@heroId_{paramIndex}", update.HeroId);
					parameters.Add($"@coordsX_{paramIndex}", update.DestinationX);
					parameters.Add($"@coordsY_{paramIndex}", update.DestinationY);
					paramIndex++;
				}
				if (sql.Length > 0)
				{
					await ExecuteInsertOrUpdateOrDeleteAsync(sql.ToString(), parameters, connection, transaction);
				}
			}
			catch (Exception) { throw; }
		}
		private async Task AwardEncounterKillExp(int killerHeroId, int encounterLevel, MySqlConnection connection, MySqlTransaction transaction)
		{
			if (encounterLevel <= 0) encounterLevel = 1;
			try
			{
				List<int> partyIds = new();
				string partySql = @"SELECT bones_hero_id_1 AS hero_id FROM bones_hero_party WHERE bones_hero_id_2 = @HeroId
						UNION SELECT bones_hero_id_2 AS hero_id FROM bones_hero_party WHERE bones_hero_id_1 = @HeroId
						UNION SELECT @HeroId AS hero_id";
				using (var pCmd = new MySqlCommand(partySql, connection, transaction))
				{
					pCmd.Parameters.AddWithValue("@HeroId", killerHeroId);
					using var pR = await pCmd.ExecuteReaderAsync();
					while (await pR.ReadAsync()) partyIds.Add(pR.GetInt32(0));
				}
				if (partyIds.Count == 0) partyIds.Add(killerHeroId);
				// Debug: log who will receive EXP and how much
				await _log.Db($"AwardEncounterKillExp: killer={killerHeroId} encounterLevel={encounterLevel} party=[{string.Join(',', partyIds)}]", killerHeroId, "BONES", true);
				string idsCsv = string.Join(',', partyIds);
				string updateSql = $"UPDATE maxhanna.bones_hero SET exp = exp + @Exp WHERE id IN ({idsCsv})";
				using (var upCmd = new MySqlCommand(updateSql, connection, transaction))
				{
					upCmd.Parameters.AddWithValue("@Exp", encounterLevel);
					int rows = await upCmd.ExecuteNonQueryAsync();
					await _log.Db($"AwardEncounterKillExp: exp UPDATE rowsAffected={rows} for ids=[{idsCsv}] (added {encounterLevel} exp)", killerHeroId, "BONES", true);
				}
				// Read back the exp/level values for the party to verify the update took effect
				try
				{
					string selectSql = $"SELECT id, exp, level FROM maxhanna.bones_hero WHERE id IN ({idsCsv})";
					using var selCmd = new MySqlCommand(selectSql, connection, transaction);
					using var selR = await selCmd.ExecuteReaderAsync();
					while (await selR.ReadAsync())
					{
						int id = selR.GetInt32(0);
						int exp = selR.IsDBNull(1) ? 0 : selR.GetInt32(1);
						int lvl = selR.IsDBNull(2) ? 0 : selR.GetInt32(2);
						await _log.Db($"AwardEncounterKillExp: post-update heroId={id} exp={exp} level={lvl}", killerHeroId, "BONES", true);
					}
					selR.Close();
				}
				catch (Exception exSel)
				{
					await _log.Db("AwardEncounterKillExp select-after-update failed: " + exSel.Message, killerHeroId, "BONES", true);
				}
				string levelSql = $"UPDATE maxhanna.bones_hero SET level = level + 1 WHERE id IN ({idsCsv}) AND exp >= (level * 10)";
				using (var lvlCmd = new MySqlCommand(levelSql, connection, transaction))
				{
					int leveled = await lvlCmd.ExecuteNonQueryAsync();
					await _log.Db($"AwardEncounterKillExp: level UPDATE rowsAffected={leveled} for ids=[{idsCsv}]", killerHeroId, "BONES", true);
				}
			}
			catch (Exception ex)
			{
				await _log.Db("AwardEncounterKillExp failure: " + ex.Message, killerHeroId, "BONES", true);
			}
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
	// EncounterPositionUpdate moved to DataContracts/Bones/EncounterPositionUpdate.cs
}
