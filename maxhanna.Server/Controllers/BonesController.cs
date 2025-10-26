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
		private const int GRIDCELL = 16;
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
					if (string.IsNullOrEmpty(dataJson)) continue;
					try
					{
						var jo = JObject.Parse(dataJson);
						var dict = new Dictionary<string, object>();
						foreach (var prop in jo.Properties())
						{
							var token = prop.Value;
							if (token.Type == JTokenType.Integer) dict[prop.Name] = token.ToObject<long>();
							else if (token.Type == JTokenType.Float) dict[prop.Name] = token.ToObject<double>();
							else if (token.Type == JTokenType.Boolean) dict[prop.Name] = token.ToObject<bool>();
							else if (token.Type == JTokenType.String) dict[prop.Name] = token.ToObject<string?>() ?? string.Empty;
							else dict[prop.Name] = token.ToString(Newtonsoft.Json.Formatting.None);
						}
						recentAttacks.Add(dict);
					}
					catch { /* ignore malformed attack JSON */ }
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

							// Additionally, apply damage to any bones_hero rows within the AoE. Damage is at least attackerLevel.
							try
							{
								// New party schema exclusion: heroes sharing same party_id should not be damaged.
								string heroDamageSql = @"
								UPDATE maxhanna.bones_hero h
								SET h.hp = GREATEST(h.hp - @Damage, 0), h.updated = UTC_TIMESTAMP()
								WHERE h.map = @Map
									AND h.hp > 0
									AND h.coordsX BETWEEN @XMin AND @XMax
									AND h.coordsY BETWEEN @YMin AND @YMax
									AND h.id <> @AttackerId
									AND NOT EXISTS (
										SELECT 1 FROM maxhanna.bones_hero_party ap
										JOIN maxhanna.bones_hero_party tp ON tp.hero_id = h.id
										WHERE ap.hero_id = @AttackerId AND tp.party_id = ap.party_id
									);";
								var heroDamageParams = new Dictionary<string, object?>()
								{
									{ "@Map", hero.Map ?? string.Empty },
									{ "@Damage", attackerLevel },
									{ "@XMin", xMin },
									{ "@XMax", xMax },
									{ "@YMin", yMin },
									{ "@YMax", yMax },
									{ "@AttackerId", sourceHeroId }
								};
								int heroRows = Convert.ToInt32(await ExecuteInsertOrUpdateOrDeleteAsync(heroDamageSql, heroDamageParams, connection, transaction));

								if (heroRows > 0)
								{
									// Find affected hero ids so we can emit HERO_DAMAGE per victim with their damage amount
									string selectHeroesSql = @"SELECT id, hp FROM maxhanna.bones_hero h WHERE map = @Map AND coordsX BETWEEN @XMin AND @XMax AND coordsY BETWEEN @YMin AND @YMax AND h.id <> @AttackerId AND NOT EXISTS (
										SELECT 1 FROM maxhanna.bones_hero_party ap JOIN maxhanna.bones_hero_party tp ON tp.hero_id = h.id WHERE ap.hero_id = @AttackerId AND tp.party_id = ap.party_id
									);";
									using var selCmd = new MySqlCommand(selectHeroesSql, connection, transaction);
									selCmd.Parameters.AddWithValue("@Map", hero.Map ?? string.Empty);
									selCmd.Parameters.AddWithValue("@XMin", xMin);
									selCmd.Parameters.AddWithValue("@XMax", xMax);
									selCmd.Parameters.AddWithValue("@YMin", yMin);
									selCmd.Parameters.AddWithValue("@YMax", yMax);
									selCmd.Parameters.AddWithValue("@AttackerId", sourceHeroId);
									using var selR = await selCmd.ExecuteReaderAsync();
									var victims = new List<(int id, int hp)>();
									while (await selR.ReadAsync())
									{
										int id = selR.GetInt32(0);
										int hp = selR.IsDBNull(1) ? 0 : selR.GetInt32(1);
										victims.Add((id, hp));
									}
									selR.Close();

									// No per-hero immediate damage events emitted: frontend detects HP changes from FetchGameData heroes payload.
									// However, if any hero reached 0 HP, handle death server-side in the same transaction so position reset and event emission
									// are atomic with the damage update.
									foreach (var v in victims)
									{
										if (v.hp <= 0)
										{
											try
											{
												// sourceHeroId is the attacker (may be the original hero sending the attack)
												await HandleHeroDeath(v.id, sourceHeroId, "hero", hero.Map ?? string.Empty, connection, transaction);
											}
											catch (Exception exHd2)
											{
												await _log.Db("HandleHeroDeath failed: " + exHd2.Message, v.id, "BONES", true);
											}
										}
									}
								}
							}
							catch (Exception exHd)
							{
								await _log.Db("Failed to apply hero damage in PersistNewAttacks: " + exHd.Message, hero.Id, "BONES", true);
							}

						 

							if (rows > 0)
							{
						 
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
											// Placeholder hook: spawn a dropped item for this defeated encounter
											try
											{
												await SpawnDroppedItemPlaceholder(d.encId, d.encLevel, targetX, targetY, connection, transaction);
											}
											catch (Exception exSpawn)
											{
												// Log but do not fail the entire attack processing flow
												await _log.Db("SpawnDroppedItemPlaceholder failed: " + exSpawn.Message, hero.Id, "BONES", true);
											}
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

				MetaHero hero = new() { Position = new Vector2(posX, posY), Id = (int)botId!, Speed = 1, Map = "HeroRoom", Name = req.Name, Hp = 100 };
				return Ok(hero);
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				return StatusCode(500, "Internal server error: " + ex.Message);
			}
		}

		[HttpPost("/Bones/RespawnHero", Name = "Bones_RespawnHero")]
		public async Task<IActionResult> RespawnHero([FromBody] int heroId)
		{
			if (heroId <= 0) return BadRequest("heroId required");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				string sql = @"UPDATE maxhanna.bones_hero SET coordsX = 0, coordsY = 0, hp = 100, updated = UTC_TIMESTAMP() WHERE id = @HeroId LIMIT 1;";
				var parameters = new Dictionary<string, object?>() { { "@HeroId", heroId } };
				await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
				// Return updated MetaHero using existing helper
				var hero = await GetHeroData(0, heroId, connection, transaction);
				await transaction.CommitAsync();
				return Ok(hero);
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				await _log.Db("RespawnHero failed: " + ex.Message, heroId, "BONES", true);
				return StatusCode(500, "Internal server error: " + ex.Message);
			}
		} 

		[HttpPost("/Bones/GetPartyMembers", Name = "Bones_GetUserPartyMembers")]
		public async Task<IActionResult> GetUserPartyMembers([FromBody] int heroId)
		{
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			try
			{
			 
				int? partyId = null;
				using (var partyCmd = new MySqlCommand("SELECT party_id FROM bones_hero_party WHERE hero_id = @HeroId LIMIT 1", connection))
				{
					partyCmd.Parameters.AddWithValue("@HeroId", heroId);
					var pObj = await partyCmd.ExecuteScalarAsync();
					if (pObj != null && int.TryParse(pObj.ToString(), out var tmpPid)) partyId = tmpPid;
				}
				string sql;
				if (partyId.HasValue)
				{
					sql = "SELECT h.id, h.name, h.color FROM bones_hero_party p JOIN bones_hero h ON h.id = p.hero_id WHERE p.party_id = @PartyId";
				}
				else
				{
					sql = "SELECT h.id, h.name, h.color FROM bones_hero h WHERE h.id = @HeroId"; // only self
				}
				using var command = new MySqlCommand(sql, connection);
				if (partyId.HasValue)
                {
					command.Parameters.AddWithValue("@PartyId", partyId.Value);
                }
				else
                {
                    command.Parameters.AddWithValue("@HeroId", heroId);
                }
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
				await _log.Db($"Database error in Bones_GetUserPartyMembers for heroId {heroId}: {ex.Message} (Error Code: {ex.Number})", null, "BONES", true);
				return StatusCode(500, $"Database error: {ex.Message}");
			}
			catch (Exception ex)
			{
				await _log.Db($"Unexpected error in Bones_GetUserPartyMembers for heroId {heroId}: {ex.Message}", null, "BONES", true);
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
					mh.exp AS exp,
					u.username as username,
					udpfl.id as display_picture_file_id
				FROM maxhanna.bones_hero mh
				LEFT JOIN maxhanna.users u ON u.id = mh.user_id
				LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
				LEFT JOIN maxhanna.file_uploads udpfl ON udp.file_id = udpfl.id
				WHERE mh.name IS NOT NULL
				ORDER BY mh.level DESC, mh.exp DESC, mh.created ASC
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
				// Attempt to update an existing selection that references the same bones_hero for this user.
				// Ensure there is an active bones_hero for this user and capture its id.
				string findHeroSql = @"SELECT id, name, coordsX, coordsY, map, speed, color, mask, level, exp, attack_speed FROM maxhanna.bones_hero WHERE user_id = @UserId LIMIT 1;";
				using var findCmd = new MySqlCommand(findHeroSql, connection, transaction);
				findCmd.Parameters.AddWithValue("@UserId", userId);
				using var heroRdr = await findCmd.ExecuteReaderAsync();
				if (!await heroRdr.ReadAsync())
				{
					// No active hero to snapshot
					await heroRdr.CloseAsync();
					await transaction.RollbackAsync();
					return BadRequest("No active bones_hero found for user");
				}
				int heroId = heroRdr.GetInt32(0);
				string heroName = heroRdr.IsDBNull(heroRdr.GetOrdinal("name")) ? "Anon" : heroRdr.GetString(heroRdr.GetOrdinal("name"));
				int coordsX = heroRdr.IsDBNull(heroRdr.GetOrdinal("coordsX")) ? 0 : heroRdr.GetInt32(heroRdr.GetOrdinal("coordsX"));
				int coordsY = heroRdr.IsDBNull(heroRdr.GetOrdinal("coordsY")) ? 0 : heroRdr.GetInt32(heroRdr.GetOrdinal("coordsY"));
				string map = heroRdr.IsDBNull(heroRdr.GetOrdinal("map")) ? string.Empty : heroRdr.GetString(heroRdr.GetOrdinal("map"));
				int speed = heroRdr.IsDBNull(heroRdr.GetOrdinal("speed")) ? 0 : heroRdr.GetInt32(heroRdr.GetOrdinal("speed"));
				string color = heroRdr.IsDBNull(heroRdr.GetOrdinal("color")) ? string.Empty : heroRdr.GetString(heroRdr.GetOrdinal("color"));
				int mask = heroRdr.IsDBNull(heroRdr.GetOrdinal("mask")) ? 0 : heroRdr.GetInt32(heroRdr.GetOrdinal("mask"));
				int level = heroRdr.IsDBNull(heroRdr.GetOrdinal("level")) ? 0 : heroRdr.GetInt32(heroRdr.GetOrdinal("level"));
				int exp = heroRdr.IsDBNull(heroRdr.GetOrdinal("exp")) ? 0 : heroRdr.GetInt32(heroRdr.GetOrdinal("exp"));
				int attack_speed = heroRdr.IsDBNull(heroRdr.GetOrdinal("attack_speed")) ? 400 : heroRdr.GetInt32(heroRdr.GetOrdinal("attack_speed"));
				await heroRdr.CloseAsync();

				// Match existing selections by user + name (hero name) rather than bones_hero_id because IDs may differ
				string updateSql = @"UPDATE maxhanna.bones_hero_selection SET name = @Name, data = JSON_OBJECT('coordsX', @CoordsX, 'coordsY', @CoordsY, 'map', @Map, 'speed', @Speed, 'color', @Color, 'mask', @Mask, 'level', @Level, 'exp', @Exp, 'attack_speed', @AttackSpeed), created = UTC_TIMESTAMP() WHERE user_id = @UserId AND name = @Name LIMIT 1;";
				using var upCmd = new MySqlCommand(updateSql, connection, transaction);
				upCmd.Parameters.AddWithValue("@UserId", userId);
				upCmd.Parameters.AddWithValue("@HeroId", heroId);
				upCmd.Parameters.AddWithValue("@Name", heroName);
				upCmd.Parameters.AddWithValue("@CoordsX", coordsX);
				upCmd.Parameters.AddWithValue("@CoordsY", coordsY);
				upCmd.Parameters.AddWithValue("@Map", map);
				upCmd.Parameters.AddWithValue("@Speed", speed);
				upCmd.Parameters.AddWithValue("@Color", color);
				upCmd.Parameters.AddWithValue("@Mask", mask);
				upCmd.Parameters.AddWithValue("@Level", level);
				upCmd.Parameters.AddWithValue("@Exp", exp);
				upCmd.Parameters.AddWithValue("@AttackSpeed", attack_speed);
				int rows = await upCmd.ExecuteNonQueryAsync();
				if (rows == 0)
				{
					string insertSql = @"INSERT INTO maxhanna.bones_hero_selection (user_id, bones_hero_id, name, data, created) VALUES (@UserId, @HeroId, @Name, JSON_OBJECT('coordsX', @CoordsX, 'coordsY', @CoordsY, 'map', @Map, 'speed', @Speed, 'color', @Color, 'mask', @Mask, 'level', @Level, 'exp', @Exp, 'attack_speed', @AttackSpeed), UTC_TIMESTAMP());";
					using var inCmd = new MySqlCommand(insertSql, connection, transaction);
					inCmd.Parameters.AddWithValue("@UserId", userId);
					inCmd.Parameters.AddWithValue("@HeroId", heroId);
					inCmd.Parameters.AddWithValue("@Name", heroName);
					inCmd.Parameters.AddWithValue("@CoordsX", coordsX);
					inCmd.Parameters.AddWithValue("@CoordsY", coordsY);
					inCmd.Parameters.AddWithValue("@Map", map);
					inCmd.Parameters.AddWithValue("@Speed", speed);
					inCmd.Parameters.AddWithValue("@Color", color);
					inCmd.Parameters.AddWithValue("@Mask", mask);
					inCmd.Parameters.AddWithValue("@Level", level);
					inCmd.Parameters.AddWithValue("@Exp", exp);
					inCmd.Parameters.AddWithValue("@AttackSpeed", attack_speed);
					rows = await inCmd.ExecuteNonQueryAsync();
				}
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
			Console.WriteLine("BonesPromoteHeroSelection for bonesheroid: " + selectionId);
			if (selectionId <= 0) return BadRequest("Invalid selection id");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = await connection.BeginTransactionAsync();
			try
			{
				// 1) Read the selected snapshot by selection id
				string selSql = @"SELECT id, user_id, bones_hero_id, name, data FROM maxhanna.bones_hero_selection WHERE id = @SelId LIMIT 1;";
				using var selCmd = new MySqlCommand(selSql, connection, transaction);
				selCmd.Parameters.AddWithValue("@SelId", selectionId);
				using var selRdr = await selCmd.ExecuteReaderAsync();
				if (!await selRdr.ReadAsync())
				{
					await transaction.RollbackAsync();
					return NotFound();
				}
				int selId = selRdr.GetInt32(0);
				int userId = selRdr.GetInt32(1);
				int? selBonesHeroId = selRdr.IsDBNull(2) ? (int?)null : selRdr.GetInt32(2);
				string? selName = selRdr.IsDBNull(3) ? null : selRdr.GetString(3);
				string? selDataJson = selRdr.IsDBNull(4) ? null : selRdr.GetString(4);
				selRdr.Close();

				// 2) Read the current bones_hero for this user (must exist)
				string curSql = @"SELECT id, name, coordsX, coordsY, map, speed, color, mask, level, exp, attack_speed FROM maxhanna.bones_hero WHERE user_id = @UserId LIMIT 1;";
				using var curCmd = new MySqlCommand(curSql, connection, transaction);
				curCmd.Parameters.AddWithValue("@UserId", userId);
				using var curRdr = await curCmd.ExecuteReaderAsync();
				if (!await curRdr.ReadAsync())
				{
					await transaction.RollbackAsync();
					return BadRequest("No active bones_hero found for user");
				}
				int currentHeroId = curRdr.GetInt32(0);
				string currentName = curRdr.IsDBNull(1) ? "Anon" : curRdr.GetString(1);
				int curCoordsX = curRdr.IsDBNull(2) ? 0 : curRdr.GetInt32(2);
				int curCoordsY = curRdr.IsDBNull(3) ? 0 : curRdr.GetInt32(3);
				string curMap = curRdr.IsDBNull(4) ? string.Empty : curRdr.GetString(4);
				int curSpeed = curRdr.IsDBNull(5) ? 0 : curRdr.GetInt32(5);
				string curColor = curRdr.IsDBNull(6) ? string.Empty : curRdr.GetString(6);
				int curMask = curRdr.IsDBNull(7) ? 0 : curRdr.GetInt32(7);
				int curLevel = curRdr.IsDBNull(8) ? 0 : curRdr.GetInt32(8);
				int curExp = curRdr.IsDBNull(9) ? 0 : curRdr.GetInt32(9);
				int curAttackSpeed = curRdr.IsDBNull(10) ? 400 : curRdr.GetInt32(10);
				curRdr.Close();

				// 3) Store current bones_hero into bones_hero_selection: update if a selection references this hero_id, otherwise insert
				// When storing the current bones_hero into a selection, match by user + name to avoid hero id mismatches
				string updateSelSql = @"UPDATE maxhanna.bones_hero_selection SET name = @Name, data = JSON_OBJECT('coordsX', @CoordsX, 'coordsY', @CoordsY, 'map', @Map, 'speed', @Speed, 'color', @Color, 'mask', @Mask, 'level', @Level, 'exp', @Exp, 'attack_speed', @AttackSpeed), created = UTC_TIMESTAMP() WHERE user_id = @UserId AND name = @Name LIMIT 1;";
				using var updateSelCmd = new MySqlCommand(updateSelSql, connection, transaction);
				updateSelCmd.Parameters.AddWithValue("@Name", currentName);
				updateSelCmd.Parameters.AddWithValue("@CoordsX", curCoordsX);
				updateSelCmd.Parameters.AddWithValue("@CoordsY", curCoordsY);
				updateSelCmd.Parameters.AddWithValue("@Map", curMap);
				updateSelCmd.Parameters.AddWithValue("@Speed", curSpeed);
				updateSelCmd.Parameters.AddWithValue("@Color", curColor);
				updateSelCmd.Parameters.AddWithValue("@Mask", curMask);
				updateSelCmd.Parameters.AddWithValue("@Level", curLevel);
				updateSelCmd.Parameters.AddWithValue("@Exp", curExp);
				updateSelCmd.Parameters.AddWithValue("@AttackSpeed", curAttackSpeed);
				updateSelCmd.Parameters.AddWithValue("@UserId", userId);
				updateSelCmd.Parameters.AddWithValue("@HeroId", currentHeroId);
				int updatedRows = await updateSelCmd.ExecuteNonQueryAsync();
				if (updatedRows == 0)
				{
					string insertSelSql = @"INSERT INTO maxhanna.bones_hero_selection (user_id, bones_hero_id, name, data, created) VALUES (@UserId, @HeroId, @Name, JSON_OBJECT('coordsX', @CoordsX, 'coordsY', @CoordsY, 'map', @Map, 'speed', @Speed, 'color', @Color, 'mask', @Mask, 'level', @Level, 'exp', @Exp, 'attack_speed', @AttackSpeed), UTC_TIMESTAMP());";
					using var inSelCmd = new MySqlCommand(insertSelSql, connection, transaction);
					inSelCmd.Parameters.AddWithValue("@UserId", userId);
					inSelCmd.Parameters.AddWithValue("@HeroId", currentHeroId);
					inSelCmd.Parameters.AddWithValue("@Name", currentName);
					inSelCmd.Parameters.AddWithValue("@CoordsX", curCoordsX);
					inSelCmd.Parameters.AddWithValue("@CoordsY", curCoordsY);
					inSelCmd.Parameters.AddWithValue("@Map", curMap);
					inSelCmd.Parameters.AddWithValue("@Speed", curSpeed);
					inSelCmd.Parameters.AddWithValue("@Color", curColor);
					inSelCmd.Parameters.AddWithValue("@Mask", curMask);
					inSelCmd.Parameters.AddWithValue("@Level", curLevel);
					inSelCmd.Parameters.AddWithValue("@Exp", curExp);
					inSelCmd.Parameters.AddWithValue("@AttackSpeed", curAttackSpeed);
					await inSelCmd.ExecuteNonQueryAsync();
				}

				// 4) Delete the current bones_hero for this user
				string delSql = @"DELETE FROM maxhanna.bones_hero WHERE user_id = @UserId LIMIT 1;";
				using var delCmd = new MySqlCommand(delSql, connection, transaction);
				delCmd.Parameters.AddWithValue("@UserId", userId);
				await delCmd.ExecuteNonQueryAsync();

				// 5) Insert the selected snapshot into bones_hero (guard numeric JSON parsing)
				string insertSql = @"INSERT INTO maxhanna.bones_hero (user_id, coordsX, coordsY, map, speed, name, color, mask, level, exp, created, attack_speed)
					VALUES (@UserId, COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.coordsX')),'null')+0, 0), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.coordsY')),'null')+0, 0), JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.map')), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.speed')),'null')+0, 0), @Name, JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.color')), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.mask')),'null')+0, 0), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.level')),'null')+0, 0), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.exp')),'null')+0, 0), UTC_TIMESTAMP(), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.attack_speed')),'null')+0, 400));";
				using var insCmd = new MySqlCommand(insertSql, connection, transaction);
				insCmd.Parameters.AddWithValue("@Data", selDataJson ?? "{}");
				insCmd.Parameters.AddWithValue("@UserId", userId);
				insCmd.Parameters.AddWithValue("@Name", selName ?? "Anon");
				await insCmd.ExecuteNonQueryAsync();

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
 

		[HttpPost("/Bones/InviteToParty", Name = "Bones_InviteToParty")]
		public async Task<IActionResult> InviteToParty([FromBody] InviteToPartyRequest req)
		{
			if (req == null || req.HeroId <= 0 || req.TargetHeroId <= 0) return BadRequest("Invalid hero ids");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				// Ownership check: if UserId provided, ensure HeroId belongs to that user
				if (req.UserId.HasValue)
				{
					string ownerSql = "SELECT user_id FROM maxhanna.bones_hero WHERE id = @HeroId LIMIT 1";
					using var ownerCmd = new MySqlCommand(ownerSql, connection, transaction);
					ownerCmd.Parameters.AddWithValue("@HeroId", req.HeroId);
					var ownerObj = await ownerCmd.ExecuteScalarAsync();
					int ownerId = ownerObj != null && int.TryParse(ownerObj.ToString(), out var tmp) ? tmp : 0;
					if (ownerId != req.UserId.Value) return StatusCode(403, "You do not own this hero");
				}
				// New schema: bones_hero_party(hero_id, party_id, joined). If target already has a party_id, decline invite.
				int? targetPartyId = await GetPartyId(req.TargetHeroId, connection, transaction);
				if (targetPartyId.HasValue)
				{
					await transaction.RollbackAsync();
					return Ok(new { invited = false });
				}
				string inviterMap = string.Empty; 
				using var mapCmd = new MySqlCommand("SELECT map FROM maxhanna.bones_hero WHERE id = @HeroId LIMIT 1", connection, transaction);
				mapCmd.Parameters.AddWithValue("@HeroId", req.HeroId);
				var mapObj = await mapCmd.ExecuteScalarAsync();
				inviterMap = mapObj != null ? mapObj.ToString() ?? string.Empty : string.Empty;
				 
				var data = new Dictionary<string, string>();
				// data.hero_id = invited target
				data["hero_id"] = req.TargetHeroId.ToString();
				var ev = new MetaEvent(0, req.HeroId, DateTime.UtcNow, "PARTY_INVITED", inviterMap ?? string.Empty, data);
				await UpdateEventsInDB(ev, connection, transaction);
				 
				await transaction.CommitAsync();
				return Ok(new { invited = true });
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				await _log.Db("InviteToParty failed: " + ex.Message, req.HeroId, "BONES", true);
				return StatusCode(500, "Failed to invite to party");
			}
		}

		[HttpPost("/Bones/LeaveParty", Name = "Bones_LeaveParty")]
		public async Task<IActionResult> LeaveParty([FromBody] LeavePartyRequest req)
		{
			if (req == null || req.HeroId <= 0) return BadRequest("Invalid hero id");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				// Ownership: optional best-effort check if userId provided
				if (req.UserId.HasValue)
				{
					string ownerSql = "SELECT user_id FROM maxhanna.bones_hero WHERE id = @HeroId LIMIT 1";
					using var ownerCmd = new MySqlCommand(ownerSql, connection, transaction);
					ownerCmd.Parameters.AddWithValue("@HeroId", req.HeroId);
					var ownerObj = await ownerCmd.ExecuteScalarAsync();
					int ownerId = ownerObj != null && int.TryParse(ownerObj.ToString(), out var tmp) ? tmp : 0;
					if (ownerId != req.UserId.Value) return StatusCode(403, "You do not own this hero");
				}

				// Perform the unparty deletion
				await Unparty(req.HeroId, connection, transaction);

				// Persist an UNPARTY meta-event so other clients can reconcile
				try
				{
					// Attempt to fetch the hero's current map for context (non-fatal)
					string map = string.Empty;
					try
					{
						using var mapCmd = new MySqlCommand("SELECT map FROM maxhanna.bones_hero WHERE id = @HeroId LIMIT 1", connection, transaction);
						mapCmd.Parameters.AddWithValue("@HeroId", req.HeroId);
						var mapObj = await mapCmd.ExecuteScalarAsync();
						map = mapObj != null ? mapObj.ToString() ?? string.Empty : string.Empty;
					}
					catch { /* ignore map lookup failures */ }

					var data = new Dictionary<string, string>();
					data["hero_id"] = req.HeroId.ToString();
					var ev = new MetaEvent(0, req.HeroId, DateTime.UtcNow, "UNPARTY", map ?? string.Empty, data);
					await UpdateEventsInDB(ev, connection, transaction);
				}
				catch (Exception exEv)
				{
					// Log but do not fail leaving the party
					await _log.Db("Failed to persist UNPARTY event: " + exEv.Message, req.HeroId, "BONES", true);
				}

				await transaction.CommitAsync();
				return Ok(new { left = true });
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				await _log.Db("LeaveParty failed: " + ex.Message, req.HeroId, "BONES", true);
				return StatusCode(500, "Failed to leave party");
			}
		} 

		[HttpPost("/Bones/UpdateHeroStats", Name = "Bones_UpdateHeroStats")]
		public async Task<IActionResult> UpdateHeroStats([FromBody] UpdateHeroStatsRequest req)
		{
			if (req == null || req.HeroId <= 0 || req.Stats == null) return BadRequest("Invalid request");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				// Ownership check: require UserId provided and matches bones_hero.user_id
				if (!req.UserId.HasValue) return BadRequest("UserId required for stat changes");
				string ownerSql2 = "SELECT user_id FROM maxhanna.bones_hero WHERE id = @HeroId LIMIT 1";
				using var ownerCmd2 = new MySqlCommand(ownerSql2, connection, transaction);
				ownerCmd2.Parameters.AddWithValue("@HeroId", req.HeroId);
				var ownerObj2 = await ownerCmd2.ExecuteScalarAsync();
				int ownerId2 = ownerObj2 != null && int.TryParse(ownerObj2.ToString(), out var tmp2) ? tmp2 : 0;
				if (ownerId2 != req.UserId.Value) return StatusCode(403, "You do not own this hero");
				// Fetch hero map to attach to the event
				string mapSql = "SELECT map FROM maxhanna.bones_hero WHERE id = @HeroId LIMIT 1";
				using var mapCmd = new MySqlCommand(mapSql, connection, transaction);
				mapCmd.Parameters.AddWithValue("@HeroId", req.HeroId);
				var mapObj = await mapCmd.ExecuteScalarAsync();
				string map = mapObj != null ? mapObj.ToString() ?? string.Empty : string.Empty;

				// Build string dictionary for event payload
				var dataDict = new Dictionary<string, string>();
				foreach (var kv in req.Stats) dataDict[kv.Key] = kv.Value.ToString();

				// Persist stats directly to bones_hero table (STR/DEX/INT stored as JSON in a 'stats' JSON column or individual columns)
				try
				{ 
						// Build UPDATE for only provided keys
						var setParts = new List<string>();
						var updParams = new Dictionary<string, object?>();
						if (req.Stats.ContainsKey("str")) { setParts.Add("str = @str"); updParams["@str"] = req.Stats["str"]; }
						if (req.Stats.ContainsKey("dex")) { setParts.Add("dex = @dex"); updParams["@dex"] = req.Stats["dex"]; }
						if (req.Stats.ContainsKey("int")) { setParts.Add("`int` = @int"); updParams["@int"] = req.Stats["int"]; }
						if (setParts.Count > 0)
						{
							string updSql = $"UPDATE maxhanna.bones_hero SET {string.Join(", ", setParts)}, updated = UTC_TIMESTAMP() WHERE id = @HeroId LIMIT 1";
							var parameters = new Dictionary<string, object?>() { { "@HeroId", req.HeroId } };
							foreach (var kv in updParams) parameters[kv.Key] = kv.Value;
							await ExecuteInsertOrUpdateOrDeleteAsync(updSql, parameters, connection, transaction);
						}
				 
					 
				}
				catch (Exception ex)
				{
					await _log.Db("UpdateHeroStats persistence failed: " + ex.Message, req.HeroId, "BONES", true);
					return StatusCode(500, "Failed to persist stats");
				}
				await transaction.CommitAsync();
				return Ok(new { updated = true });
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				await _log.Db("UpdateHeroStats failed: " + ex.Message, req.HeroId, "BONES", true);
				return StatusCode(500, "Failed to update stats");
			}
		}

		[HttpPost("/Bones/TownPortal", Name = "Bones_TownPortal")]
		public async Task<IActionResult> TownPortal([FromBody] dynamic body)
		{
			try
			{
				int heroId = 0; int? userId = null;
				try { heroId = (int)body.HeroId; } catch { }
				try { userId = (int?)body.UserId; } catch { }
				if (heroId <= 0) return BadRequest("Invalid hero id");
				using var connection = new MySqlConnection(_connectionString);
				await connection.OpenAsync();
				using var transaction = connection.BeginTransaction();
				// Ownership check
				if (userId.HasValue)
				{
					string ownerSql = "SELECT user_id FROM maxhanna.bones_hero WHERE id = @HeroId LIMIT 1";
					using var ownerCmd = new MySqlCommand(ownerSql, connection, transaction);
					ownerCmd.Parameters.AddWithValue("@HeroId", heroId);
					var ownerObj = await ownerCmd.ExecuteScalarAsync();
					int ownerId = ownerObj != null && int.TryParse(ownerObj.ToString(), out var tmp) ? tmp : 0;
					if (ownerId != userId.Value) return StatusCode(403, "You do not own this hero");
				}
				// Move hero to Town map origin (example coordinates)
				string updSql = "UPDATE maxhanna.bones_hero SET map = @Map, coordsX = @X, coordsY = @Y, updated = UTC_TIMESTAMP() WHERE id = @HeroId LIMIT 1";
				using var upCmd = new MySqlCommand(updSql, connection, transaction);
				upCmd.Parameters.AddWithValue("@Map", "Town");
				upCmd.Parameters.AddWithValue("@X", 16);
				upCmd.Parameters.AddWithValue("@Y", 16);
				upCmd.Parameters.AddWithValue("@HeroId", heroId);
				await upCmd.ExecuteNonQueryAsync();
				var hero = await GetHeroData(0, heroId, connection, transaction);
				await transaction.CommitAsync();
				return Ok(hero);
			}
			catch (Exception ex)
			{
				await _log.Db("TownPortal failed: " + ex.Message, null, "BONES", true);
				return StatusCode(500, "Failed to teleport to town");
			}
		}

		[HttpPost("/Bones/CreateTownPortal", Name = "Bones_CreateTownPortal")]
		public async Task<IActionResult> CreateTownPortal([FromBody] dynamic body)
		{
			try
			{
				int heroId = 0; int? userId = null; string map = string.Empty; int x = 0; int y = 0;
				try { heroId = (int)body.HeroId; } catch { }
				try { userId = (int?)body.UserId; } catch { }
				try { map = (string)body.Map; } catch { }
				try { x = (int)body.X; } catch { }
				try { y = (int)body.Y; } catch { }
				if (heroId <= 0) return BadRequest("Invalid hero id");
				using var connection = new MySqlConnection(_connectionString);
				await connection.OpenAsync();
				using var transaction = connection.BeginTransaction();
				// Ownership check
				if (userId.HasValue)
				{
					string ownerSql = "SELECT user_id FROM maxhanna.bones_hero WHERE id = @HeroId LIMIT 1";
					using var ownerCmd = new MySqlCommand(ownerSql, connection, transaction);
					ownerCmd.Parameters.AddWithValue("@HeroId", heroId);
					var ownerObj = await ownerCmd.ExecuteScalarAsync();
					int ownerId = ownerObj != null && int.TryParse(ownerObj.ToString(), out var tmp) ? tmp : 0;
					if (ownerId != userId.Value) return StatusCode(403, "You do not own this hero");
				}
				var data = new Dictionary<string, string>();
				data["creatorHeroId"] = heroId.ToString();
				data["map"] = map ?? string.Empty;
				data["x"] = x.ToString();
				data["y"] = y.ToString();
				// optional radius or metadata
				if (body.Radius != null) try { data["radius"] = ((int)body.Radius).ToString(); } catch { }
				var ev = new MetaEvent(0, heroId, DateTime.UtcNow, "TOWN_PORTAL", map ?? string.Empty, data);
				await UpdateEventsInDB(ev, connection, transaction);
				await transaction.CommitAsync();
				return Ok(new { created = true });
			}
			catch (Exception ex)
			{
				await _log.Db("CreateTownPortal failed: " + ex.Message, null, "BONES", true);
				return StatusCode(500, "Failed to create town portal");
			}
		}

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
		 
		private async Task UpdateEventsInDB(MetaEvent @event, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				string sql = @"
				DELETE FROM maxhanna.bones_event WHERE timestamp < UTC_TIMESTAMP() - INTERVAL 20 SECOND; 
				INSERT INTO maxhanna.bones_event (hero_id, event, map, data, timestamp) VALUES (@HeroId, @Event, @Map, @Data, UTC_TIMESTAMP());";
				// If event.HeroId is non-positive (encounter IDs or synthetic), insert NULL to avoid FK constraint failures
				object? heroIdParam = (@event.HeroId <= 0) ? null : (object?)@event.HeroId;
				Dictionary<string, object?> parameters = new() { { "@HeroId", heroIdParam }, { "@Event", @event.EventType }, { "@Map", @event.Map }, { "@Data", Newtonsoft.Json.JsonConvert.SerializeObject(@event.Data) } };
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
				// New party membership: gather all hero_ids sharing the same party_id
				var partyMemberIds = await GetPartyMemberIds(heroId, connection, transaction);
				string sql = @"DELETE FROM maxhanna.bones_event WHERE timestamp < UTC_TIMESTAMP() - INTERVAL 10 SECOND; SELECT * FROM maxhanna.bones_event WHERE map = @Map OR (event = 'CHAT' AND hero_id IN (" + string.Join(",", partyMemberIds) + "));";
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
						int evHeroId = reader.IsDBNull(reader.GetOrdinal("hero_id")) ? 0 : reader.GetInt32("hero_id");
						MetaEvent tmpEvent = new(reader.GetInt32("id"), evHeroId, reader.GetDateTime("timestamp"), ev, mp, dataDict);
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
				// include attack_speed and hp if present
				// Include optional stat columns (str,dex,int) aliased to hero_str/hero_dex/hero_int if present in schema
				string sql = $"SELECT h.id as hero_id, h.coordsX, h.coordsY, h.map, h.speed, h.name as hero_name, h.color as hero_color, h.mask as hero_mask, h.level as hero_level, h.exp as hero_exp, h.hp as hero_hp, h.attack_speed as attack_speed, h.str AS hero_str, h.dex AS hero_dex, h.int AS hero_int FROM maxhanna.bones_hero h WHERE {(heroId == null ? "h.user_id = @UserId" : "h.id = @UserId")};";
				MySqlCommand cmd = new(sql, conn, transaction); cmd.Parameters.AddWithValue("@UserId", heroId != null ? heroId : userId);
				MetaHero? hero = null;  
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
								AttackSpeed = attackSpeed,
								Hp = reader.IsDBNull(reader.GetOrdinal("hero_hp")) ? 100 : reader.GetInt32(reader.GetOrdinal("hero_hp")),
								Str = reader.IsDBNull(reader.GetOrdinal("hero_str")) ? 0 : reader.GetInt32(reader.GetOrdinal("hero_str")),
								Dex = reader.IsDBNull(reader.GetOrdinal("hero_dex")) ? 0 : reader.GetInt32(reader.GetOrdinal("hero_dex")),
								Int = reader.IsDBNull(reader.GetOrdinal("hero_int")) ? 0 : reader.GetInt32(reader.GetOrdinal("hero_int")),
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

				// Fetch encounters needing AI processing (include target_hero_id, last_attack and attack_speed for attack timing)
				const string selectSql = @"SELECT hero_id, coordsX, coordsY, o_coordsX, o_coordsY, hp, speed, aggro, last_moved, target_hero_id, last_attack, COALESCE(attack_speed, 400) AS attack_speed, COALESCE(`level`,1) AS `level`
					FROM maxhanna.bones_encounter WHERE map = @Map";
				using var cmd = new MySqlCommand(selectSql, connection, transaction);
				cmd.Parameters.AddWithValue("@Map", map);
				var encounters = new List<(int heroId, int x, int y, int ox, int oy, int hp, int speed, int aggro, DateTime? lastMoved, int targetHeroId, DateTime? lastAttack, int attackSpeed, int level)>();
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
							rdr.IsDBNull(rdr.GetOrdinal("target_hero_id")) ? 0 : rdr.GetInt32("target_hero_id"),
							rdr.IsDBNull(rdr.GetOrdinal("last_attack")) ? (DateTime?)null : rdr.GetDateTime("last_attack"),
							rdr.IsDBNull(rdr.GetOrdinal("attack_speed")) ? 400 : rdr.GetInt32("attack_speed"),
							rdr.IsDBNull(rdr.GetOrdinal("level")) ? 1 : rdr.GetInt32("level")
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
				int tile = GRIDCELL; // 16
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
							// Axis-adjacent: attempt server-side attack emission rate-limited by encounter.attackSpeed or last_attack DB column
							try
							{
								int attSpd = e.attackSpeed <= 0 ? 400 : e.attackSpeed;
								DateTime? lastAtDb = e.lastAttack; // may be null
								bool canAttackNow = false;
								if (!lastAtDb.HasValue) canAttackNow = true;
								else
								{
									var msSince = (now - lastAtDb.Value).TotalMilliseconds;
									if (msSince >= attSpd) canAttackNow = true;
								}
								if (canAttackNow)
								{
									// Build attack data so clients will interpret as OTHER_HERO_ATTACK
									// Determine numeric facing: 0=down,1=left,2=right,3=up
									int numericFacing = 0;
									if (dxAdj == tile) {
										numericFacing = closest.Value.x > e.x ? 2 : 1; // right : left
									} else {
										numericFacing = closest.Value.y > e.y ? 0 : 3; // down : up
									}

									var data = new Dictionary<string, string>() {
										{ "sourceHeroId", e.heroId.ToString() },
										{ "targetHeroId", closest.Value.heroId.ToString() },
										{ "centerX", e.x.ToString() },
										{ "centerY", e.y.ToString() },
										// numeric facing for clients to use directly
										{ "facing", numericFacing.ToString() },
										// attack speed in milliseconds
										{ "attack_speed", (e.attackSpeed <= 0 ? 400 : e.attackSpeed).ToString() }
									};
									// Defensive: do not allow an encounter to attack itself
									if (closest.Value.heroId == e.heroId) {
										continue;
									}

									// Use the target hero's id for the bones_event.hero_id column so it satisfies FK constraints
									var attackEvent = new MetaEvent(0, closest.Value.heroId, DateTime.UtcNow, "ATTACK", map, data);
									await UpdateEventsInDB(attackEvent, connection, transaction);
									// Persist last_attack to the DB so subsequent server ticks respect the cooldown
									try
									{
										string updSql = "UPDATE maxhanna.bones_encounter SET last_attack = UTC_TIMESTAMP() WHERE hero_id = @HeroId LIMIT 1;";
										var updParams = new Dictionary<string, object?>() { { "@HeroId", e.heroId } };
										await ExecuteInsertOrUpdateOrDeleteAsync(updSql, updParams, connection, transaction);
									}
									catch { /* non-fatal */ }

									// Immediately apply damage to the targeted hero so encounters can hurt heroes even when no hero-originated attack was sent
									try
									{
										int attackerLevel = e.level <= 0 ? 1 : e.level; // use encounter level from query
										int tgtHeroId = closest.Value.heroId;
										string heroDamageSql = @"UPDATE maxhanna.bones_hero h
												SET h.hp = GREATEST(h.hp - @Damage, 0), h.updated = UTC_TIMESTAMP()
												WHERE h.id = @TargetHeroId AND h.hp > 0 LIMIT 1;";
										var heroDamageParams = new Dictionary<string, object?>()
										{
											{ "@Damage", attackerLevel },
											{ "@TargetHeroId", targetHeroId }
										};
										int affected = Convert.ToInt32(await ExecuteInsertOrUpdateOrDeleteAsync(heroDamageSql, heroDamageParams, connection, transaction));

										if (affected > 0)
										{
											// Check new HP to detect death
											string selectHpSql = "SELECT hp FROM maxhanna.bones_hero WHERE id = @TargetHeroId LIMIT 1;";
											using var selHpCmd = new MySqlCommand(selectHpSql, connection, transaction);
											selHpCmd.Parameters.AddWithValue("@TargetHeroId", tgtHeroId);
											var hpObj = await selHpCmd.ExecuteScalarAsync();
											int newHp = 0;
					    if (hpObj != null && int.TryParse(hpObj.ToString(), out int hpv)) newHp = hpv;
					    if (newHp <= 0)
											{
												try
												{
						    await HandleHeroDeath(tgtHeroId, e.heroId, "encounter", map, connection, transaction);
												}
												catch (Exception exHd)
												{
													await _log.Db("HandleHeroDeath (encounter) failed: " + exHd.Message, targetHeroId, "BONES", true);
												}
											}
										}
									}
									catch (Exception exApply)
									{
										await _log.Db("Failed to apply encounter direct hero damage: " + exApply.Message, null, "BONES", true);
									}
								}
							}
							catch (Exception exAtk)
							{
								await _log.Db("Encounter attack emission failed: " + exAtk.Message, null, "BONES", true);
							}
							continue; // don't move when attacking
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
					m.hp as hero_hp,
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
								Hp = reader.IsDBNull(reader.GetOrdinal("hero_hp")) ? 100 : reader.GetInt32(reader.GetOrdinal("hero_hp")),
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
					{
						var partyData = JsonSerializer.Deserialize<List<int>>(partyJson);
						if (partyData != null && partyData.Count > 0)
						{
							await UpdateMetaHeroParty(partyData, connection, transaction);
						}
					}
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
				var partyIds = await GetPartyMemberIds(killerHeroId, connection, transaction);
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

		// Placeholder hook called when an encounter dies so dropped item logic can be added here later.
		private async Task SpawnDroppedItemPlaceholder(int encounterId, int encounterLevel, int x, int y, MySqlConnection connection, MySqlTransaction transaction)
		{
			// Minimal non-blocking placeholder: log the spawn request so it can be implemented later.
			try
			{
				await _log.Db($"SpawnDroppedItemPlaceholder: encounterId={encounterId} level={encounterLevel} at=({x},{y})", null, "BONES", true);
			}
			catch { /* swallow logging errors to avoid impacting game flow */ }
			await Task.CompletedTask;
		}

		// Handle hero death: reset coordinates to (0,0) on the same map and emit a HERO_DIED meta-event with killer info.
		private async Task HandleHeroDeath(int victimHeroId, int killerId, string killerType, string map, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				// Reset hero position to origin (0,0) and update timestamp
				string updSql = "UPDATE maxhanna.bones_hero SET coordsX = 0, coordsY = 0, updated = UTC_TIMESTAMP() WHERE id = @HeroId LIMIT 1;";
				var updParams = new Dictionary<string, object?>() { { "@HeroId", victimHeroId } };
				await ExecuteInsertOrUpdateOrDeleteAsync(updSql, updParams, connection, transaction);

				// Emit HERO_DIED event targeted at the victim so client will display death UI and can react.
				var data = new Dictionary<string, string>() {
					{ "killerId", killerId.ToString() },
					{ "killerType", killerType }
				};
				var deathEvent = new MetaEvent(0, victimHeroId, DateTime.UtcNow, "HERO_DIED", map ?? string.Empty, data);
				await UpdateEventsInDB(deathEvent, connection, transaction);
			}
			catch (Exception ex)
			{
				await _log.Db("HandleHeroDeath failed: " + ex.Message, victimHeroId, "BONES", true);
			}
		}
		private async Task UpdateMetaHeroParty(List<int>? partyData, MySqlConnection connection, MySqlTransaction transaction)
		{
			// Accepts a list of hero IDs forming (or merging into) a single party using new party_id schema.
			try
			{
				await _log.Db("UpdateMetaHeroParty called", null, "BONES", true);
				if (partyData == null || partyData.Count < 2)
				{
					await _log.Db("UpdateMetaHeroParty: insufficient partyData", null, "BONES", true);
					return;
				}
				var heroIds = partyData.Distinct().ToList();
				await _log.Db($"UpdateMetaHeroParty heroes=[{string.Join(',', heroIds)}]", null, "BONES", true);
				if (heroIds.Count < 2)
				{
					await _log.Db("UpdateMetaHeroParty: after distinct only one hero", null, "BONES", true);
					return;
				}
				// Fetch existing party_id assignments for provided heroes
				string selectSql = $"SELECT hero_id, party_id FROM bones_hero_party WHERE hero_id IN ({string.Join(',', heroIds)})";
				await _log.Db($"UpdateMetaHeroParty running selectSql={selectSql}", null, "BONES", true);
				var existing = new Dictionary<int, int?>();
				using (var selCmd = new MySqlCommand(selectSql, connection, transaction))
				{
					using var rdr = await selCmd.ExecuteReaderAsync();
					while (await rdr.ReadAsync())
					{
						int hid = rdr.GetInt32(0);
						int? pid = rdr.IsDBNull(1) ? (int?)null : rdr.GetInt32(1);
						existing[hid] = pid;
						await _log.Db($"UpdateMetaHeroParty existing row hero={hid} party={pid}", null, "BONES", true);
					}
				}
				foreach (var hid in heroIds)
                {
                    if (!existing.ContainsKey(hid))
                    {
						existing[hid] = null; 
                    }
                }
				var partyIdsFound = existing.Values.Where(v => v.HasValue).Select(v => v!.Value).Distinct().ToList();
				await _log.Db($"UpdateMetaHeroParty partyIdsFound=[{string.Join(',', partyIdsFound)}]", null, "BONES", true);
				int targetPartyId;
				if (partyIdsFound.Count == 0)
				{
					// Allocate new party id (max + 1)
					using var newCmd = new MySqlCommand("SELECT COALESCE(MAX(party_id),0)+1 FROM bones_hero_party", connection, transaction);
					var obj = await newCmd.ExecuteScalarAsync();
					if (obj != null && int.TryParse(obj.ToString(), out var tmpPid) && tmpPid > 0) targetPartyId = tmpPid; else targetPartyId = 1;
					await _log.Db($"UpdateMetaHeroParty allocated new partyId={targetPartyId}", null, "BONES", true);
				}
				else
				{
					targetPartyId = partyIdsFound.Min();
					await _log.Db($"UpdateMetaHeroParty using existing partyId={targetPartyId}", null, "BONES", true);
					// Merge any other party_ids into targetPartyId
					if (partyIdsFound.Count > 1)
					{
						string mergeSql = $"UPDATE bones_hero_party SET party_id = @Target WHERE party_id IN ({string.Join(',', partyIdsFound.Where(id => id != targetPartyId))})";
						await _log.Db($"UpdateMetaHeroParty merging partyIds sql={mergeSql}", null, "BONES", true);
						using var mergeCmd = new MySqlCommand(mergeSql, connection, transaction);
						mergeCmd.Parameters.AddWithValue("@Target", targetPartyId);
						await mergeCmd.ExecuteNonQueryAsync();
					}
				}
				// Upsert membership for each hero
				foreach (var hid in heroIds)
				{
					int? existingPid = existing[hid];
					// Defensive check: ensure the bones_hero row actually exists to satisfy FK on bones_hero_party
					using var existsCmd = new MySqlCommand("SELECT COUNT(1) FROM bones_hero WHERE id = @HeroId", connection, transaction);
					existsCmd.Parameters.AddWithValue("@HeroId", hid);
					var existsObj = await existsCmd.ExecuteScalarAsync();
					var existsCount = 0;
					if (existsObj != null && int.TryParse(existsObj.ToString(), out var tmpExists)) existsCount = tmpExists;
					if (existsCount == 0)
					{
						await _log.Db($"UpdateMetaHeroParty skipping hero={hid} because no bones_hero row exists (to avoid FK error)", null, "BONES", true);
						continue; // Skip missing heroes
					}
					if (!existingPid.HasValue)
					{
						string insSql = "INSERT INTO bones_hero_party (hero_id, party_id, joined) VALUES (@HeroId, @PartyId, UTC_TIMESTAMP())";
						await _log.Db($"UpdateMetaHeroParty inserting hero={hid} into party={targetPartyId}", null, "BONES", true);
						using var insCmd = new MySqlCommand(insSql, connection, transaction);
						insCmd.Parameters.AddWithValue("@HeroId", hid);
						insCmd.Parameters.AddWithValue("@PartyId", targetPartyId);
						await insCmd.ExecuteNonQueryAsync();
					}
					else if (existingPid.Value != targetPartyId)
					{
						string updSql = "UPDATE bones_hero_party SET party_id = @PartyId WHERE hero_id = @HeroId LIMIT 1";
						await _log.Db($"UpdateMetaHeroParty updating hero={hid} party from {existingPid.Value} to {targetPartyId}", null, "BONES", true);
						using var updCmd = new MySqlCommand(updSql, connection, transaction);
						updCmd.Parameters.AddWithValue("@HeroId", hid);
						updCmd.Parameters.AddWithValue("@PartyId", targetPartyId);
						await updCmd.ExecuteNonQueryAsync();
					}
				}
				await _log.Db("UpdateMetaHeroParty completed", null, "BONES", true);
			}
			catch (MySqlException mex)
			{
				await _log.Db("UpdateMetaHeroParty MySqlException: " + mex.Message, null, "BONES", true);
				throw;
			}
			catch (Exception ex)
			{
				await _log.Db("UpdateMetaHeroParty Exception: " + ex.Message + "\n" + ex.StackTrace, null, "BONES", true);
				throw;
			}
		}
		private async Task Unparty(int heroId, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				const string deleteQuery = "DELETE FROM bones_hero_party WHERE hero_id = @HeroId LIMIT 1";
				using var deleteCommand = new MySqlCommand(deleteQuery, connection, transaction);
				deleteCommand.Parameters.AddWithValue("@HeroId", heroId);
				await deleteCommand.ExecuteNonQueryAsync();
			}
			catch (MySqlException) { throw; }
			catch (Exception) { throw; }
		}

		// Helpers for new party schema
		private async Task<int?> GetPartyId(int heroId, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				await _log.Db($"GetPartyId called heroId={heroId}", heroId, "BONES", true);
				using var cmd = new MySqlCommand("SELECT party_id FROM bones_hero_party WHERE hero_id = @HeroId LIMIT 1", connection, transaction);
				cmd.Parameters.AddWithValue("@HeroId", heroId);
				var obj = await cmd.ExecuteScalarAsync();
				if (obj == null || obj == DBNull.Value)
				{
					await _log.Db($"GetPartyId: no party for hero={heroId}", heroId, "BONES", true);
					return null;
				}
				if (int.TryParse(obj.ToString(), out var pid))
				{
					await _log.Db($"GetPartyId: hero={heroId} party={pid}", heroId, "BONES", true);
					return pid;
				}
				await _log.Db($"GetPartyId: unexpected scalar value for hero={heroId}: {obj}", heroId, "BONES", true);
				return null;
			}
			catch (Exception ex)
			{
				await _log.Db($"GetPartyId Exception for hero={heroId}: " + ex.Message + "\n" + ex.StackTrace, heroId, "BONES", true);
				throw;
			}
		}
		private async Task<List<int>> GetPartyMemberIds(int heroId, MySqlConnection connection, MySqlTransaction transaction)
		{
			var list = new List<int>();
			try
			{
				await _log.Db($"GetPartyMemberIds called heroId={heroId}", heroId, "BONES", true);
				int? partyId = await GetPartyId(heroId, connection, transaction);
				if (!partyId.HasValue) { list.Add(heroId); await _log.Db($"GetPartyMemberIds no party found for hero={heroId}", heroId, "BONES", true); return list; }
				await _log.Db($"GetPartyMemberIds partyId={partyId.Value} for hero={heroId}", heroId, "BONES", true);
				using var cmd = new MySqlCommand("SELECT hero_id FROM bones_hero_party WHERE party_id = @Pid", connection, transaction);
				cmd.Parameters.AddWithValue("@Pid", partyId.Value);
				using var rdr = await cmd.ExecuteReaderAsync();
				while (await rdr.ReadAsync()) { var hid = rdr.GetInt32(0); if (!list.Contains(hid)) list.Add(hid); await _log.Db($"GetPartyMemberIds found member hero={hid}", heroId, "BONES", true); }
				if (!list.Contains(heroId)) list.Add(heroId);
				await _log.Db($"GetPartyMemberIds returning [{string.Join(',', list)}] for hero={heroId}", heroId, "BONES", true);
				return list;
			}
			catch (Exception ex)
			{
				await _log.Db($"GetPartyMemberIds Exception for hero={heroId}: " + ex.Message + "\n" + ex.StackTrace, heroId, "BONES", true);
				throw;
			}
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
