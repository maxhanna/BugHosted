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
		private const int ATTACK_BUFFER_MS = 50;
		private const int HITBOX_HALF = 16;
		private const int GRIDCELL = 20;
		private readonly Log _log;
		private readonly IConfiguration _config;
		private readonly string _connectionString;
		// Track last time encounter movement was processed per map to limit updates to once per second
		private static readonly Dictionary<string, DateTime> _lastEncounterAiRun = new();
		// Track when an encounter started chasing a specific hero (key: encounter hero_id)
		private static readonly Dictionary<int, DateTime> _encounterTargetLockTimes = new();
		// Track recent positions to prevent back-and-forth oscillation: maps encounter hero_id -> (lastX,lastY,wasLastMoveReversalCount)
		private static readonly Dictionary<int, (int lastX, int lastY, int reversalCount)> _encounterRecentPositions = new();
		private static string[] orderedMaps = new[] {
			"HeroRoom",
			"RoadToCitadelOfVesper",
			"CitadelOfVesper",
			"RoadToRiftedBastion",
			"RiftedBastion",
			"RoadToFortPenumbra",
			"FortPenumbra",
			"RoadToGatesOfHell",
			"GatesOfHell"
		};
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
			//_ = _log.Db("Fetch game data for hero " + hero.Id, hero.Id, "BONES", true);
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
				List<object> droppedItems = await FetchDroppedItems(hero, connection, transaction);
				List<object> townPortals = await FetchTownPortals(hero, connection, transaction);

				await transaction.CommitAsync();
				var resp = new FetchGameDataResponse { Map = hero.Map, Position = hero.Position, Heroes = heroes, Events = events, EnemyBots = enemyBots, DroppedItems = droppedItems, TownPortals = townPortals, RecentAttacks = recentAttacks };
				return Ok(resp);
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				return StatusCode(500, "Internal server error: " + ex.Message);
			}
		}

		private async Task<List<object>> FetchDroppedItems(MetaHero hero, MySqlConnection connection, MySqlTransaction transaction)
		{
			List<object> droppedItems = new();
			try
			{
				int radiusTiles = 8;
				int tile = GRIDCELL;
				int xMin = hero.Position.x - radiusTiles * tile;
				int xMax = hero.Position.x + radiusTiles * tile;
				int yMin = hero.Position.y - radiusTiles * tile;
				int yMax = hero.Position.y + radiusTiles * tile;
				string selSql = "SELECT id, map, coordsX, coordsY, data, created FROM maxhanna.bones_items_dropped WHERE map = @Map AND coordsX BETWEEN @XMin AND @XMax AND coordsY BETWEEN @YMin AND @YMax ORDER BY created DESC;";
				using var selCmd = new MySqlCommand(selSql, connection, transaction);
				selCmd.Parameters.AddWithValue("@Map", hero.Map ?? string.Empty);
				selCmd.Parameters.AddWithValue("@XMin", xMin);
				selCmd.Parameters.AddWithValue("@XMax", xMax);
				selCmd.Parameters.AddWithValue("@YMin", yMin);
				selCmd.Parameters.AddWithValue("@YMax", yMax);
				using var rdr = await selCmd.ExecuteReaderAsync();
				while (await rdr.ReadAsync())
				{
					int id = rdr.GetInt32(0);
					string map = rdr.IsDBNull(1) ? string.Empty : rdr.GetString(1);
					int cx = rdr.IsDBNull(2) ? 0 : rdr.GetInt32(2);
					int cy = rdr.IsDBNull(3) ? 0 : rdr.GetInt32(3);
					string dataJson = rdr.IsDBNull(4) ? "{}" : rdr.GetString(4);
					DateTime created = rdr.IsDBNull(5) ? DateTime.UtcNow : rdr.GetDateTime(5);
					object? parsed = null;
					try { parsed = Newtonsoft.Json.JsonConvert.DeserializeObject<object>(dataJson); } catch { parsed = dataJson; }
					droppedItems.Add(new { id = id, map = map, coordsX = cx, coordsY = cy, data = parsed, created = created });
				}
				rdr.Close();
			}
			catch (Exception ex)
			{
				await _log.Db("Failed to read nearby dropped items: " + ex.Message, hero.Id, "BONES", true);
			}

			return droppedItems;
		}

		private async Task<List<object>> FetchTownPortals(MetaHero hero, MySqlConnection connection, MySqlTransaction transaction)
		{
			List<object> portals = new();
			try
			{
				int radiusTiles = 8;
				int tile = GRIDCELL;
				int xMin = hero.Position.x - radiusTiles * tile;
				int xMax = hero.Position.x + radiusTiles * tile;
				int yMin = hero.Position.y - radiusTiles * tile;
				int yMax = hero.Position.y + radiusTiles * tile;
				string selSql = @"SELECT p.id, p.creator_hero_id, p.map, p.coordsX, p.coordsY, p.data, p.created,
  (SELECT o.id FROM maxhanna.bones_town_portal o WHERE o.creator_hero_id = p.creator_hero_id AND o.id <> p.id ORDER BY o.created DESC LIMIT 1) AS otherId,
  (SELECT o.map FROM maxhanna.bones_town_portal o WHERE o.creator_hero_id = p.creator_hero_id AND o.id <> p.id ORDER BY o.created DESC LIMIT 1) AS otherMap,
  (SELECT o.coordsX FROM maxhanna.bones_town_portal o WHERE o.creator_hero_id = p.creator_hero_id AND o.id <> p.id ORDER BY o.created DESC LIMIT 1) AS otherCx,
  (SELECT o.coordsY FROM maxhanna.bones_town_portal o WHERE o.creator_hero_id = p.creator_hero_id AND o.id <> p.id ORDER BY o.created DESC LIMIT 1) AS otherCy,
  (SELECT o.creator_hero_id FROM maxhanna.bones_town_portal o WHERE o.creator_hero_id = p.creator_hero_id AND o.id <> p.id ORDER BY o.created DESC LIMIT 1) AS otherCreator
FROM maxhanna.bones_town_portal p
WHERE p.map = @Map AND p.coordsX BETWEEN @XMin AND @XMax AND p.coordsY BETWEEN @YMin AND @YMax
ORDER BY p.created DESC;";
				using var selCmd = new MySqlCommand(selSql, connection, transaction);
				selCmd.Parameters.AddWithValue("@Map", hero.Map ?? string.Empty);
				selCmd.Parameters.AddWithValue("@XMin", xMin);
				selCmd.Parameters.AddWithValue("@XMax", xMax);
				selCmd.Parameters.AddWithValue("@YMin", yMin);
				selCmd.Parameters.AddWithValue("@YMax", yMax);
				using var rdr = await selCmd.ExecuteReaderAsync();
				while (await rdr.ReadAsync())
				{
					int id = rdr.GetInt32(0);
					int creatorId = rdr.IsDBNull(1) ? 0 : rdr.GetInt32(1);
					string map = rdr.IsDBNull(2) ? string.Empty : rdr.GetString(2);
					int cx = rdr.IsDBNull(3) ? 0 : rdr.GetInt32(3);
					int cy = rdr.IsDBNull(4) ? 0 : rdr.GetInt32(4);
					string dataJson = rdr.IsDBNull(5) ? "{}" : rdr.GetString(5);
					DateTime created = rdr.IsDBNull(6) ? DateTime.UtcNow : rdr.GetDateTime(6);

					// paired columns (from correlated subselects)
					int otherId = rdr.IsDBNull(7) ? 0 : rdr.GetInt32(7);
					string otherMap = rdr.IsDBNull(8) ? string.Empty : rdr.GetString(8);
					int otherCx = rdr.IsDBNull(9) ? 0 : rdr.GetInt32(9);
					int otherCy = rdr.IsDBNull(10) ? 0 : rdr.GetInt32(10);
					int otherCreator = rdr.IsDBNull(11) ? 0 : rdr.GetInt32(11);

					var dataDict = new Dictionary<string, string>();
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
						catch
						{
							try
							{
								var tmp = Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, string>>(dataJson);
								if (tmp != null) dataDict = tmp;
							}
							catch { /* ignore malformed data */ }
						}
					}

					if (!string.IsNullOrEmpty(otherMap) || otherId != 0)
					{
						var pairedData = new Dictionary<string, string>
						{
							{ "x", otherCx.ToString() },
							{ "y", otherCy.ToString() },
							{ "map", otherMap },
							{ "creatorHeroId", otherCreator.ToString() }
						};
						portals.Add(new { id = id, creatorHeroId = creatorId, map = map, coordsX = cx, coordsY = cy, data = pairedData, created = created });
					}
					else
					{
						portals.Add(new { id = id, creatorHeroId = creatorId, map = map, coordsX = cx, coordsY = cy, data = dataDict, created = created });
					}
				}
				rdr.Close();
			}
			catch (Exception ex)
			{
				await _log.Db("Failed to read nearby town portals: " + ex.Message, hero.Id, "BONES", true);
			}

			return portals;
		}

		[HttpPost("/Bones/DeleteTownPortal", Name = "Bones_DeleteTownPortal")]
		public async Task<IActionResult> DeleteTownPortal([FromBody] DeleteTownPortalRequest req)
		{
			try
			{
				int portalId = req?.PortalId ?? 0;
				int heroId = req?.HeroId ?? 0;

				if (portalId <= 0 && heroId <= 0) return BadRequest("Invalid hero id or portal id");

				using var connection = new MySqlConnection(_connectionString);
				await connection.OpenAsync();
				using var transaction = connection.BeginTransaction();
				try
				{
					int rows = 0;
					if (portalId > 0)
					{
						// Delete single portal by id
						string delSql = "DELETE FROM maxhanna.bones_town_portal WHERE id = @Id LIMIT 1;";
						using var delCmd = new MySqlCommand(delSql, connection, transaction);
						delCmd.Parameters.AddWithValue("@Id", portalId);
						rows = await delCmd.ExecuteNonQueryAsync();
					}
					else if (heroId > 0)
					{
						// Delete all portals created by this hero
						string delSql = "DELETE FROM maxhanna.bones_town_portal WHERE creator_hero_id = @Id;";
						using var delCmd = new MySqlCommand(delSql, connection, transaction);
						delCmd.Parameters.AddWithValue("@Id", heroId);
						rows = await delCmd.ExecuteNonQueryAsync();
					}

					await transaction.CommitAsync();
					return Ok(new { deleted = rows > 0, rowsDeleted = rows });
				}
				catch (Exception ex)
				{
					await transaction.RollbackAsync();
					await _log.Db("DeleteTownPortal failed: " + ex.Message, null, "BONES", true);
					return StatusCode(500, "Failed to delete town portal");
				}
			}
			catch (Exception ex)
			{
				await _log.Db("DeleteTownPortal failure: " + ex.Message, null, "BONES", true);
				return StatusCode(500, "Failed to delete town portal");
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
							{ "@HeroId", normalized.ContainsKey("sourceHeroId") ? normalized["sourceHeroId"] ?? (hero?.Id ?? 0) : (hero?.Id ?? 0) },
							{ "@Event", "ATTACK" },
							{ "@Map", hero?.Map ?? string.Empty },
							{ "@Data", Newtonsoft.Json.JsonConvert.SerializeObject(normalized) }
						};
					await ExecuteInsertOrUpdateOrDeleteAsync(insertSql, parameters, connection, transaction);

					// Determine source hero id and facing
					int sourceHeroId = normalized.ContainsKey("sourceHeroId") && normalized["sourceHeroId"] != null ? Convert.ToInt32(normalized["sourceHeroId"]) : (hero?.Id ?? 0);
					int sourceX = hero?.Position.x ?? 0;
					int sourceY = hero?.Position.y ?? 0;
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
								case 0: targetY = sourceY - GRIDCELL; break; // up
								case 1: targetX = sourceX + GRIDCELL; break; // right
								case 2: targetY = sourceY + GRIDCELL; break; // down
								case 3: targetX = sourceX - GRIDCELL; break; // left
								default: break;
							}
						}
						else
						{
							// try common string values
							var s = fVal?.ToLower() ?? string.Empty;
							if (s == "up" || s == "north") targetY = sourceY - 1;
							else if (s == "right" || s == "east") targetX = sourceX + GRIDCELL;
							else if (s == "down" || s == "south") targetY = sourceY + GRIDCELL;
							else if (s == "left" || s == "west") targetX = sourceX - GRIDCELL;
						}
					}

					// Prefetch attacker level/stats to avoid JOIN+LIMIT MySQL restriction
					int attackerLevel = 1;
					int dbAttackDmg = 0;
					double dbCritRate = 0.0;
					double dbCritDmg = 2.0;
					try
					{
						using var lvlCmd = new MySqlCommand("SELECT COALESCE(level,1) AS lvl, COALESCE(attack_dmg,0) AS attack_dmg, COALESCE(crit_rate,0) AS crit_rate, COALESCE(crit_dmg,2.0) AS crit_dmg FROM maxhanna.bones_hero WHERE id=@HeroId", connection, transaction);
						lvlCmd.Parameters.AddWithValue("@HeroId", sourceHeroId);
						using var rdrStats = await lvlCmd.ExecuteReaderAsync();
						if (await rdrStats.ReadAsync())
						{
							// Read numeric columns defensively: underlying DB type may be DOUBLE or INT.
							var lvlObj = rdrStats.IsDBNull(rdrStats.GetOrdinal("lvl")) ? null : rdrStats.GetValue(rdrStats.GetOrdinal("lvl"));
							attackerLevel = lvlObj == null ? 1 : Convert.ToInt32(Convert.ToDouble(lvlObj));

							var dmgObj = rdrStats.IsDBNull(rdrStats.GetOrdinal("attack_dmg")) ? null : rdrStats.GetValue(rdrStats.GetOrdinal("attack_dmg"));
							dbAttackDmg = dmgObj == null ? 0 : Convert.ToInt32(Convert.ToDouble(dmgObj));

							dbCritRate = rdrStats.IsDBNull(rdrStats.GetOrdinal("crit_rate")) ? 0.0 : rdrStats.GetDouble(rdrStats.GetOrdinal("crit_rate"));
							dbCritDmg = rdrStats.IsDBNull(rdrStats.GetOrdinal("crit_dmg")) ? 2.0 : rdrStats.GetDouble(rdrStats.GetOrdinal("crit_dmg"));
						}
						rdrStats.Close();
					}
					catch { attackerLevel = 1; dbAttackDmg = 0; dbCritRate = 0.0; dbCritDmg = 2.0; }

					// Determine AoE half-size: allow client to send 'aoe', 'radius', 'width', or 'threshold'. Fallback to HITBOX_HALF for single-tile tolerance.
					int aoeHalf = GRIDCELL; // default tolerance radius
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

					// Prepare shared variables for damage application. 'rows' reused by multiple branches.
					int rows = 0;

					// Decide whether this is an AoE attack or a regular single-target attack.
					// If aoeHalf is <= GRIDCELL and the client did not explicitly provide a length extension,
					// treat it as a regular attack and limit damage to a single encounter (LIMIT 1).
					string limitClause = "";
					bool isRegularSingleTarget = aoeHalf <= GRIDCELL && !(normalized.ContainsKey("length") && normalized["length"] != null);
					if (isRegularSingleTarget) limitClause = " LIMIT 1";


					// For regular single-target attacks prefer the encounter in the player's facing direction
					if (isRegularSingleTarget)
					{
						// Attempt to parse facing from the normalized payload; if missing/invalid we fallback to a LIMIT 1 UPDATE
						int? facingInt = null;
						try
						{
							if (normalized.ContainsKey("facing") && normalized["facing"] != null)
							{
								var fVal = normalized["facing"]?.ToString();
								if (int.TryParse(fVal, out int fParsed)) facingInt = fParsed;
							}
						}
						catch { facingInt = null; }

						if (facingInt.HasValue)
						{
							// Read candidate encounters in the AoE and prefer those that lie in the facing direction
							string selEncSql = @"SELECT hero_id, coordsX, coordsY FROM maxhanna.bones_encounter WHERE map = @Map AND hp > 0 AND coordsX BETWEEN @XMin AND @XMax AND coordsY BETWEEN @YMin AND @YMax;";
							using var selEncCmd = new MySqlCommand(selEncSql, connection, transaction);
							selEncCmd.Parameters.AddWithValue("@Map", hero?.Map ?? string.Empty);
							selEncCmd.Parameters.AddWithValue("@XMin", xMin);
							selEncCmd.Parameters.AddWithValue("@XMax", xMax);
							selEncCmd.Parameters.AddWithValue("@YMin", yMin);
							selEncCmd.Parameters.AddWithValue("@YMax", yMax);
							using var encRdr = await selEncCmd.ExecuteReaderAsync();
							int? chosenEncId = null;
							int bestDist = int.MaxValue;
							var candidatesInFacing = new List<(int id, int x, int y)>();
							while (await encRdr.ReadAsync())
							{
								int eid = encRdr.GetInt32(0);
								int ex = encRdr.IsDBNull(1) ? 0 : encRdr.GetInt32(1);
								int ey = encRdr.IsDBNull(2) ? 0 : encRdr.GetInt32(2);
								candidatesInFacing.Add((eid, ex, ey));
							}
							encRdr.Close();

							// Filter by facing
							foreach (var c in candidatesInFacing)
							{
								int dxEnc = c.x - sourceX;
								int dyEnc = c.y - sourceY;
								bool inFacing = false;
								switch (facingInt.Value)
								{
									case 0: // up
										inFacing = dyEnc < 0; break;
									case 1: // right
										inFacing = dxEnc > 0; break;
									case 2: // down
										inFacing = dyEnc > 0; break;
									case 3: // left
										inFacing = dxEnc < 0; break;
									default: inFacing = false; break;
								}
								if (inFacing)
								{
									int dist = Math.Abs(dxEnc) + Math.Abs(dyEnc);
									if (dist < bestDist)
									{
										bestDist = dist;
										chosenEncId = c.id;
									}
								}
							}

							if (chosenEncId.HasValue)
							{
								// Update the chosen encounter only (centralized helper)
								try
								{
									Console.WriteLine($"Facing attack: attacker={sourceHeroId}, attackerLevel={attackerLevel}, chosenEnc={chosenEncId.Value}");
									rows = Convert.ToInt32(await ApplyDamageToEncounter(chosenEncId.Value, attackerLevel, sourceHeroId, connection, transaction));
								}
								catch (Exception exUpd)
								{
									await _log.Db("ApplyDamageToEncounter failed: " + exUpd.Message, hero?.Id ?? 0, "BONES", true);
									rows = 0;
								}
							}
						}
						// If no rows were updated by facing-specific logic (either no facing or no matching encounter), fallback
						if (rows == 0)
						{
							string updateHpSql = $@"
								UPDATE maxhanna.bones_encounter e
								SET e.hp = GREATEST(e.hp - @AttackerLevel, 0),
									e.target_hero_id = CASE WHEN (e.target_hero_id IS NULL OR e.target_hero_id = 0) THEN @HeroId ELSE e.target_hero_id END,
									e.last_killed = CASE WHEN (e.hp - @AttackerLevel) <= 0 THEN UTC_TIMESTAMP() ELSE e.last_killed END
								WHERE e.map = @Map
									AND e.hp > 0
									AND e.coordsX BETWEEN @XMin AND @XMax
									AND e.coordsY BETWEEN @YMin AND @YMax{limitClause};";
							var updateParams = new Dictionary<string, object?>() {
									{ "@Map", hero?.Map ?? string.Empty },
									{ "@HeroId", sourceHeroId },
									{ "@AttackerLevel", attackerLevel },
									{ "@XMin", xMin },
									{ "@XMax", xMax },
									{ "@YMin", yMin },
									{ "@YMax", yMax }
								};
							rows = Convert.ToInt32(await ExecuteInsertOrUpdateOrDeleteAsync(updateHpSql, updateParams, connection, transaction));
						}
					}
					else
					{
						// Non-regular AoE: keep previous behaviour (may update multiple rows)
						string updateHpSql = $@"
							UPDATE maxhanna.bones_encounter e
							SET e.hp = GREATEST(e.hp - @AttackerLevel, 0),
								e.target_hero_id = CASE WHEN (e.target_hero_id IS NULL OR e.target_hero_id = 0) THEN @HeroId ELSE e.target_hero_id END,
								e.last_killed = CASE WHEN (e.hp - @AttackerLevel) <= 0 THEN UTC_TIMESTAMP() ELSE e.last_killed END
							WHERE e.map = @Map
								AND e.hp > 0
								AND e.coordsX BETWEEN @XMin AND @XMax
								AND e.coordsY BETWEEN @YMin AND @YMax;";
						var updateParams = new Dictionary<string, object?>() {
									{ "@Map", hero?.Map ?? string.Empty },
								{ "@HeroId", sourceHeroId },
								{ "@AttackerLevel", attackerLevel },
								{ "@XMin", xMin },
								{ "@XMax", xMax },
								{ "@YMin", yMin },
								{ "@YMax", yMax }
							};
						rows = Convert.ToInt32(await ExecuteInsertOrUpdateOrDeleteAsync(updateHpSql, updateParams, connection, transaction));
					}

					// Select victims within AoE (respect party exclusion) and apply damage per-victim using centralized helper
					string selectHeroesSql = $@"SELECT id FROM maxhanna.bones_hero h WHERE map = @Map AND coordsX BETWEEN @XMin AND @XMax AND coordsY BETWEEN @YMin AND @YMax AND h.id <> @AttackerId AND NOT EXISTS (
							SELECT 1 FROM maxhanna.bones_hero_party ap JOIN maxhanna.bones_hero_party tp ON tp.hero_id = h.id WHERE ap.hero_id = @AttackerId AND tp.party_id = ap.party_id
						){(isRegularSingleTarget ? " LIMIT 1" : "")};";
					using var selCmd = new MySqlCommand(selectHeroesSql, connection, transaction);
					selCmd.Parameters.AddWithValue("@Map", hero?.Map ?? string.Empty);
					selCmd.Parameters.AddWithValue("@XMin", xMin);
					selCmd.Parameters.AddWithValue("@XMax", xMax);
					selCmd.Parameters.AddWithValue("@YMin", yMin);
					selCmd.Parameters.AddWithValue("@YMax", yMax);
					selCmd.Parameters.AddWithValue("@AttackerId", sourceHeroId);
					using var selR = await selCmd.ExecuteReaderAsync();
					var victims = new List<int>();
					while (await selR.ReadAsync())
					{
						victims.Add(selR.GetInt32(0));
					}
					selR.Close();

					// Compute attacker damage once: baseDamage now equals attack_dmg + attacker level
					// Normalize critRate to a 0..1 probability (support values stored as percentages >1)
					int baseDamage = dbAttackDmg + attackerLevel;
					double critRate = dbCritRate > 1.0 ? (dbCritRate / 100.0) : dbCritRate;
					// Clamp critRate between 0 and 1 defensively
					if (critRate < 0.0) critRate = 0.0;
					if (critRate > 1.0) critRate = 1.0;
					double critMultiplier = dbCritDmg;
					Console.WriteLine($"Applying hero->hero damage: attacker={sourceHeroId}, baseDamage={baseDamage}, critRate={critRate}, critMultiplier={critMultiplier}, victims={string.Join(',', victims)}");
					foreach (var victimId in victims)
					{
						try
						{
							await ApplyDamageToHero(victimId, sourceHeroId, "hero", baseDamage, critRate, critMultiplier, hero?.Map ?? string.Empty, connection, transaction);
						}
						catch (Exception exVict)
						{
							await _log.Db("ApplyDamageToHero failed for victim " + victimId + ": " + exVict.Message, victimId, "BONES", true);
						}
					}

					if (rows > 0)
					{
						string selectDeadSql = @"SELECT hero_id, `level`, hp FROM maxhanna.bones_encounter WHERE map = @Map AND hp = 0 AND (awarded IS NULL OR awarded = 0) AND last_killed IS NOT NULL AND last_killed >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 SECOND) AND coordsX BETWEEN @XMin AND @XMax AND coordsY BETWEEN @YMin AND @YMax;";
						using var deadCmd = new MySqlCommand(selectDeadSql, connection, transaction);
						deadCmd.Parameters.AddWithValue("@Map", hero?.Map ?? string.Empty);
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

								int dropX = targetX;
								int dropY = targetY;
								string selEncCoords = "SELECT coordsX, coordsY FROM maxhanna.bones_encounter WHERE hero_id = @EncId LIMIT 1;";
								using var coordCmd = new MySqlCommand(selEncCoords, connection, transaction);
								coordCmd.Parameters.AddWithValue("@EncId", d.encId);
								using var coordR = await coordCmd.ExecuteReaderAsync();
								if (await coordR.ReadAsync())
								{
									dropX = coordR.IsDBNull(0) ? dropX : coordR.GetInt32(0);
									dropY = coordR.IsDBNull(1) ? dropY : coordR.GetInt32(1);
								}
								coordR.Close();

								await SpawnDroppedItem(d.encId, d.encLevel, dropX, dropY, hero?.Map ?? string.Empty, connection, transaction);

								string finalizeSql = @"UPDATE maxhanna.bones_encounter SET awarded = 1, coordsX = -1000, coordsY = -1000, target_hero_id = 0 WHERE hero_id = @EncId LIMIT 1;";
								var finalizeParams = new Dictionary<string, object?>() { { "@EncId", d.encId } };
								await ExecuteInsertOrUpdateOrDeleteAsync(finalizeSql, finalizeParams, connection, transaction);

								awarded.Add(d.encId);
							}
						}

					}
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
				string sql = @"
						INSERT INTO maxhanna.bones_hero (name, type, user_id, coordsX, coordsY, speed, color, created, updated)
                              SELECT @Name, @Type, @UserId, @CoordsX, @CoordsY, @Speed,
                                COALESCE((SELECT last_character_color FROM maxhanna.user_settings WHERE user_id = @UserId LIMIT 1), ''),
                                UTC_TIMESTAMP(), UTC_TIMESTAMP()
						WHERE NOT EXISTS (
							SELECT 1 FROM maxhanna.bones_hero WHERE user_id = @UserId AND name = @Name
							)
						AND NOT EXISTS (
							SELECT 1 FROM maxhanna.bones_hero_selection WHERE user_id = @UserId AND name = @Name
							);";
				int posX = GRIDCELL;
				int posY = 11 * GRIDCELL;
				Dictionary<string, object?> parameters = new()
				{
					{ "@CoordsX", posX },
					{ "@CoordsY", posY },
					{ "@Speed", 1 },
					{ "@Name", req.Name ?? "Anonymous"},
					{ "@Type", req.Type ?? "Unknown"},
					{ "@UserId", req.UserId }
				};
				long? botId = await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);

				// Read the user's preferred character color so we can return it with the created MetaHero
				string returnedColor = string.Empty;
				try
				{
					using var colorCmd = new MySqlCommand("SELECT last_character_color FROM maxhanna.user_settings WHERE user_id = @UserId LIMIT 1", connection, transaction);
					colorCmd.Parameters.AddWithValue("@UserId", req.UserId);
					var colorObj = await colorCmd.ExecuteScalarAsync();
					if (colorObj != null && colorObj != DBNull.Value)
					{
						returnedColor = colorObj.ToString() ?? string.Empty;
					}
				}
				catch { /* non-fatal: ignore color lookup failures */ }

				await transaction.CommitAsync();

				string upsertNameSql = @"INSERT INTO maxhanna.user_settings (user_id, last_character_name) VALUES (@UserId, @Name) ON DUPLICATE KEY UPDATE last_character_name = VALUES(last_character_name);";
				using var upCmd = new MySqlCommand(upsertNameSql, connection, transaction);
				upCmd.Parameters.AddWithValue("@UserId", req.UserId);
				upCmd.Parameters.AddWithValue("@Name", req.Name ?? "");
				await upCmd.ExecuteNonQueryAsync();

				MetaHero hero = new()
				{
					Position = new Vector2(posX, posY),
					Id = (int)botId!,
					Speed = 1,
					Map = "HeroRoom",
					Name = req.Name,
					Type = req.Type,
					Color = returnedColor ?? string.Empty,
					Hp = 100
				};
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
				// |dx| >= GRIDCELL OR |dy| >= GRIDCELL (i.e. not overlapping within a GRIDCELL box).
				int spawnX = 0;
				int spawnY = 0;
				string map = string.Empty;
				using (var mapCmd = new MySqlCommand("SELECT map FROM maxhanna.bones_hero WHERE id = @HeroId LIMIT 1", connection, transaction))
				{
					mapCmd.Parameters.AddWithValue("@HeroId", heroId);
					var mapObj = await mapCmd.ExecuteScalarAsync();
					map = mapObj != null ? mapObj.ToString() ?? string.Empty : string.Empty;
				}
				var others = new List<(int x, int y)>();
				using (var selCmd = new MySqlCommand("SELECT coordsX, coordsY FROM maxhanna.bones_hero WHERE map = @Map AND id <> @HeroId", connection, transaction))
				{
					selCmd.Parameters.AddWithValue("@Map", map ?? string.Empty);
					selCmd.Parameters.AddWithValue("@HeroId", heroId);
					using var rdr = await selCmd.ExecuteReaderAsync();
					while (await rdr.ReadAsync())
					{
						int ox = rdr.IsDBNull(0) ? 0 : rdr.GetInt32(0);
						int oy = rdr.IsDBNull(1) ? 0 : rdr.GetInt32(1);
						others.Add((ox, oy));
					}
				}

				bool found = false;
				int maxRadius = 20; // search range in tiles (multiplied by GRIDCELL)
				for (int r = 0; r <= maxRadius && !found; r++)
				{
					// iterate the square ring at radius r (in tile units)
					for (int dx = -r; dx <= r && !found; dx++)
					{
						for (int dy = -r; dy <= r && !found; dy++)
						{
							// Only consider the ring/perimeter for this radius to keep ordering by distance
							if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != r) continue;
							int candidateX = dx * GRIDCELL;
							int candidateY = dy * GRIDCELL;
							bool conflict = false;
							foreach (var o in others)
							{
								int diffX = Math.Abs(candidateX - o.x);
								int diffY = Math.Abs(candidateY - o.y);
								// conflict if both x and y are within a GRIDCELL (i.e., too close)
								if (diffX < GRIDCELL && diffY < GRIDCELL) { conflict = true; break; }
							}
							if (!conflict)
							{
								spawnX = candidateX;
								spawnY = candidateY;
								found = true;
								break;
							}
						}
					}
				}
				if (!found)
				{
					// Fallback: keep 0,0 (last resort)
					spawnX = 0; spawnY = 0;
				}

				// Determine the town that precedes the hero's current map using orderedMaps.
				var townSet = new HashSet<string>(new[] { "HeroRoom", "CitadelOfVesper", "RiftedBastion", "FortPenumbra", "GatesOfHell" });
				string currentMapRaw = map ?? string.Empty;
				string NormalizeMap(string s)
				{
					if (string.IsNullOrEmpty(s)) return string.Empty;
					var sb = new System.Text.StringBuilder();
					foreach (var ch in s.ToUpperInvariant()) { if (char.IsLetterOrDigit(ch)) sb.Append(ch); }
					return sb.ToString();
				}
				string normCurrent = NormalizeMap(currentMapRaw);
				int idx = -1;
				for (int i = 0; i < orderedMaps.Length; i++)
				{
					if (NormalizeMap(orderedMaps[i]) == normCurrent) { idx = i; break; }
				}
				string targetMap = "HeroRoom";
				if (idx == -1)
				{
					targetMap = "HeroRoom";
				}
				else
				{
					for (int i = idx - 1; i >= 0; i--)
					{
						if (townSet.Contains(orderedMaps[i])) { targetMap = orderedMaps[i]; break; }
					}
				}

				string updateSql = @"UPDATE maxhanna.bones_hero SET coordsX = @X, coordsY = @Y, map = @Map, hp = 100, updated = UTC_TIMESTAMP() WHERE id = @HeroId LIMIT 1;";
				var parameters = new Dictionary<string, object?>() { { "@HeroId", heroId }, { "@X", spawnX }, { "@Y", spawnY }, { "@Map", targetMap } };
				await ExecuteInsertOrUpdateOrDeleteAsync(updateSql, parameters, connection, transaction);
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

		[HttpPost("/Bones/HealHero", Name = "Bones_HealHero")]
		public async Task<IActionResult> HealHero([FromBody] int heroId)
		{
			if (heroId <= 0) return BadRequest("Invalid hero id");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			using var transaction = connection.BeginTransaction();
			try
			{
				string sql = "UPDATE maxhanna.bones_hero SET hp = 100, updated = UTC_TIMESTAMP() WHERE id = @HeroId LIMIT 1;";
				var parameters = new Dictionary<string, object?>() { { "@HeroId", heroId } };
				await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
				var hero = await GetHeroData(0, heroId, connection, transaction);
				await transaction.CommitAsync();
				return Ok(hero);
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				await _log.Db("HealHero failed: " + ex.Message, heroId, "BONES", true);
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
					sql = "SELECT h.id, h.name, h.color, h.type FROM bones_hero_party p JOIN bones_hero h ON h.id = p.hero_id WHERE p.party_id = @PartyId";
				}
				else
				{
					sql = "SELECT h.id, h.name, h.color, h.type FROM bones_hero h WHERE h.id = @HeroId"; // only self
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
					int typeOrdinal = reader.GetOrdinal("type");
					partyMembers.Add(
						new
						{
							heroId = reader.GetInt32(idOrdinal),
							name = reader.IsDBNull(nameOrdinal) ? null : reader.GetString(nameOrdinal),
							color = reader.IsDBNull(colorOrdinal) ? null : reader.GetString(colorOrdinal),
							type = reader.IsDBNull(typeOrdinal) ? null : reader.GetString(typeOrdinal)
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
				// Highscores: include both live heroes and saved hero selections.
				// bones_hero_selection.data stores a JSON object that may include level/exp; extract those values.
				// Combine live heroes and saved selections, default missing/empty type to 'knight',
				// then pick the top row per heroName (highest level, then exp) to ensure distinct names.
				string sql = @"
				WITH combined AS (
					SELECT mh.id AS heroId, mh.user_id AS userId, mh.name COLLATE utf8mb4_general_ci AS heroName,
						COALESCE(NULLIF(mh.type,''),'knight') AS type,
						mh.level AS level, mh.exp AS exp
					FROM maxhanna.bones_hero mh
					WHERE mh.name IS NOT NULL
					UNION ALL
					SELECT COALESCE(bhs.bones_hero_id, 0) AS heroId, bhs.user_id AS userId, bhs.name COLLATE utf8mb4_general_ci AS heroName,
						COALESCE(NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(bhs.data, '$.type')),'null'),'') ,'knight') AS type,
						CAST(JSON_UNQUOTE(JSON_EXTRACT(bhs.data, '$.level')) AS UNSIGNED) AS level,
						CAST(JSON_UNQUOTE(JSON_EXTRACT(bhs.data, '$.exp')) AS UNSIGNED) AS exp
					FROM maxhanna.bones_hero_selection bhs
					WHERE bhs.name IS NOT NULL
				), ranked AS (
					SELECT *, ROW_NUMBER() OVER (PARTITION BY heroName ORDER BY level DESC, exp DESC) AS rn FROM combined
				)
				SELECT
					src.heroId AS heroId,
					src.userId AS userId,
					src.heroName AS heroName,
					src.type AS type,
					src.level AS level,
					src.exp AS exp,
					u.username AS username,
					udpfl.id AS display_picture_file_id
				FROM ranked src
				LEFT JOIN maxhanna.users u ON u.id = src.userId
				LEFT JOIN maxhanna.user_display_pictures udp ON udp.user_id = u.id
				LEFT JOIN maxhanna.file_uploads udpfl ON udp.file_id = udpfl.id
				WHERE src.rn = 1
				ORDER BY src.level DESC, src.exp DESC, src.heroName ASC
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
						type = rdr.IsDBNull(rdr.GetOrdinal("type")) ? null : SafeGetString(rdr, "type"),
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

		[HttpPost("/Bones/GetHeroNames", Name = "Bones_GetHeroNames")]
		public async Task<IActionResult> GetHeroNames([FromBody] int userId)
		{
			if (userId <= 0) return BadRequest("Invalid user id");
			using var connection = new MySqlConnection(_connectionString);
			await connection.OpenAsync();
			try
			{
				// Force a common collation on both sides of the UNION to avoid 'Illegal mix of collations' errors
				string sql = @"
					SELECT DISTINCT name COLLATE utf8mb4_general_ci AS name FROM maxhanna.bones_hero WHERE user_id = @UserId AND name IS NOT NULL
					UNION
					SELECT DISTINCT name COLLATE utf8mb4_general_ci FROM maxhanna.bones_hero_selection WHERE user_id = @UserId AND name IS NOT NULL
					ORDER BY name;";
				using var cmd = new MySqlCommand(sql, connection);
				cmd.Parameters.AddWithValue("@UserId", userId);
				using var rdr = await cmd.ExecuteReaderAsync();
				var names = new List<string>();
				while (await rdr.ReadAsync())
				{
					if (!rdr.IsDBNull(0)) names.Add(rdr.GetString(0));
				}
				return Ok(names);
			}
			catch (MySqlException ex)
			{
				await _log.Db($"Database error in Bones_GetHeroNames for userId {userId}: {ex.Message} (Error Code: {ex.Number})", userId, "BONES", true);
				return StatusCode(500, $"Database error: {ex.Message}");
			}
			catch (Exception ex)
			{
				await _log.Db($"Unexpected error in Bones_GetHeroNames for userId {userId}: {ex.Message}", userId, "BONES", true);
				return StatusCode(500, $"Internal server error: {ex.Message}");
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
				string findHeroSql = @"SELECT id, name, `type`, coordsX, coordsY, map, speed, color, mask, level, exp, attack_speed, attack_dmg, crit_rate, crit_dmg, health, regen FROM maxhanna.bones_hero WHERE user_id = @UserId LIMIT 1;";
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
				string heroType = heroRdr.IsDBNull(heroRdr.GetOrdinal("type")) ? string.Empty : heroRdr.GetString(heroRdr.GetOrdinal("type"));
				int coordsX = heroRdr.IsDBNull(heroRdr.GetOrdinal("coordsX")) ? 0 : heroRdr.GetInt32(heroRdr.GetOrdinal("coordsX"));
				int coordsY = heroRdr.IsDBNull(heroRdr.GetOrdinal("coordsY")) ? 0 : heroRdr.GetInt32(heroRdr.GetOrdinal("coordsY"));
				string map = heroRdr.IsDBNull(heroRdr.GetOrdinal("map")) ? string.Empty : heroRdr.GetString(heroRdr.GetOrdinal("map"));
				int speed = heroRdr.IsDBNull(heroRdr.GetOrdinal("speed")) ? 0 : heroRdr.GetInt32(heroRdr.GetOrdinal("speed"));
				string color = heroRdr.IsDBNull(heroRdr.GetOrdinal("color")) ? string.Empty : heroRdr.GetString(heroRdr.GetOrdinal("color"));
				int mask = heroRdr.IsDBNull(heroRdr.GetOrdinal("mask")) ? 0 : heroRdr.GetInt32(heroRdr.GetOrdinal("mask"));
				int level = heroRdr.IsDBNull(heroRdr.GetOrdinal("level")) ? 0 : heroRdr.GetInt32(heroRdr.GetOrdinal("level"));
				int exp = heroRdr.IsDBNull(heroRdr.GetOrdinal("exp")) ? 0 : heroRdr.GetInt32(heroRdr.GetOrdinal("exp"));
				int attack_speed = heroRdr.IsDBNull(heroRdr.GetOrdinal("attack_speed")) ? 400 : heroRdr.GetInt32(heroRdr.GetOrdinal("attack_speed"));
				var attackDmgObj = heroRdr.IsDBNull(heroRdr.GetOrdinal("attack_dmg")) ? null : heroRdr.GetValue(heroRdr.GetOrdinal("attack_dmg"));
				int attack_dmg = attackDmgObj == null ? 1 : Convert.ToInt32(Convert.ToDouble(attackDmgObj));
				double crit_rate = heroRdr.IsDBNull(heroRdr.GetOrdinal("crit_rate")) ? 0.0 : heroRdr.GetDouble(heroRdr.GetOrdinal("crit_rate"));
				double crit_dmg = heroRdr.IsDBNull(heroRdr.GetOrdinal("crit_dmg")) ? 2.0 : heroRdr.GetDouble(heroRdr.GetOrdinal("crit_dmg"));
				int health = heroRdr.IsDBNull(heroRdr.GetOrdinal("health")) ? 100 : heroRdr.GetInt32(heroRdr.GetOrdinal("health"));
				double regen = heroRdr.IsDBNull(heroRdr.GetOrdinal("regen")) ? 0.0 : heroRdr.GetDouble(heroRdr.GetOrdinal("regen"));
				await heroRdr.CloseAsync();

				// Match existing selections by user + name (hero name) rather than bones_hero_id because IDs may differ
				string updateSql = @"UPDATE maxhanna.bones_hero_selection SET name = @Name, data = JSON_OBJECT('coordsX', @CoordsX, 'coordsY', @CoordsY, 'map', @Map, 'speed', @Speed, 'color', @Color, 'mask', @Mask, 'level', @Level, 'exp', @Exp, 'attack_speed', @AttackSpeed, 'attack_dmg', @AttackDmg, 'crit_rate', @CritRate, 'crit_dmg', @CritDmg, 'health', @Health, 'regen', @Regen, 'type', @Type), created = UTC_TIMESTAMP() WHERE user_id = @UserId AND name = @Name LIMIT 1;";
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
				upCmd.Parameters.AddWithValue("@AttackDmg", attack_dmg);
				upCmd.Parameters.AddWithValue("@CritRate", crit_rate);
				upCmd.Parameters.AddWithValue("@CritDmg", crit_dmg);
				upCmd.Parameters.AddWithValue("@Health", health);
				upCmd.Parameters.AddWithValue("@Regen", regen);
				upCmd.Parameters.AddWithValue("@Type", heroType ?? string.Empty);
				int rows = await upCmd.ExecuteNonQueryAsync();
				if (rows == 0)
				{
					string insertSql = @"INSERT INTO maxhanna.bones_hero_selection (user_id, bones_hero_id, name, data, created) VALUES (@UserId, @HeroId, @Name, JSON_OBJECT('coordsX', @CoordsX, 'coordsY', @CoordsY, 'map', @Map, 'speed', @Speed, 'color', @Color, 'mask', @Mask, 'level', @Level, 'exp', @Exp, 'attack_speed', @AttackSpeed, 'attack_dmg', @AttackDmg, 'crit_rate', @CritRate, 'crit_dmg', @CritDmg, 'health', @Health, 'regen', @Regen, 'type', @Type), UTC_TIMESTAMP());";
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
					inCmd.Parameters.AddWithValue("@AttackDmg", attack_dmg);
					inCmd.Parameters.AddWithValue("@CritRate", crit_rate);
					inCmd.Parameters.AddWithValue("@CritDmg", crit_dmg);
					inCmd.Parameters.AddWithValue("@Health", health);
					inCmd.Parameters.AddWithValue("@Regen", regen);
					inCmd.Parameters.AddWithValue("@Type", heroType ?? string.Empty);
					rows = await inCmd.ExecuteNonQueryAsync();
				}
				string delHeroSql = @"
				DELETE FROM maxhanna.bones_hero
				WHERE id = @HeroId
				LIMIT 1;";
				using var delHeroCmd = new MySqlCommand(delHeroSql, connection, transaction);
				delHeroCmd.Parameters.AddWithValue("@HeroId", heroId);
				await delHeroCmd.ExecuteNonQueryAsync();

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
				using var selRdr = await selCmd.ExecuteReaderAsync(System.Data.CommandBehavior.SingleRow);
				if (!await selRdr.ReadAsync())
				{
					await selRdr.DisposeAsync();
					await transaction.RollbackAsync();
					return NotFound();
				}
				int selId = selRdr.GetInt32(0);
				int userId = selRdr.GetInt32(1);
				int? selBonesHeroId = selRdr.IsDBNull(2) ? (int?)null : selRdr.GetInt32(2);
				string? selName = selRdr.IsDBNull(3) ? null : selRdr.GetString(3);
				string? selDataJson = selRdr.IsDBNull(4) ? null : selRdr.GetString(4);
				selRdr.Close();

				// 2) Read the current bones_hero for this user (if any)
				string curSql = @"SELECT id, name, `type`, coordsX, coordsY, map, speed, color, mask, level, exp, attack_speed, attack_dmg, crit_rate, crit_dmg, health, regen FROM maxhanna.bones_hero WHERE user_id = @UserId LIMIT 1;";
				using var curCmd = new MySqlCommand(curSql, connection, transaction);
				curCmd.Parameters.AddWithValue("@UserId", userId);
				using var curRdr = await curCmd.ExecuteReaderAsync(System.Data.CommandBehavior.SingleRow);
				bool hasCurrentHero = await curRdr.ReadAsync();

				int currentHeroId = 0;
				string currentName = "Anon";
				// note: SELECT includes `type` as the 3rd column, so ordinals shift compared to older code
				string curType = string.Empty;
				int curCoordsX = 0, curCoordsY = 0, curSpeed = 0, curMask = 0, curLevel = 0, curExp = 0, curAttackSpeed = 400;
				string curMap = string.Empty, curColor = string.Empty;

				if (hasCurrentHero)
				{
					currentHeroId = curRdr.GetInt32(0);
					currentName = curRdr.IsDBNull(1) ? "Anon" : curRdr.GetString(1);
					curType = curRdr.IsDBNull(2) ? string.Empty : curRdr.GetString(2);
					curCoordsX = curRdr.IsDBNull(3) ? 0 : curRdr.GetInt32(3);
					curCoordsY = curRdr.IsDBNull(4) ? 0 : curRdr.GetInt32(4);
					curMap = curRdr.IsDBNull(5) ? string.Empty : curRdr.GetString(5);
					curSpeed = curRdr.IsDBNull(6) ? 0 : curRdr.GetInt32(6);
					curColor = curRdr.IsDBNull(7) ? string.Empty : curRdr.GetString(7);
					curMask = curRdr.IsDBNull(8) ? 0 : curRdr.GetInt32(8);
					curLevel = curRdr.IsDBNull(9) ? 0 : curRdr.GetInt32(9);
					curExp = curRdr.IsDBNull(10) ? 0 : curRdr.GetInt32(10);
					curAttackSpeed = curRdr.IsDBNull(11) ? 400 : curRdr.GetInt32(11);
					var curAttackDmgObj = curRdr.IsDBNull(curRdr.GetOrdinal("attack_dmg")) ? null : curRdr.GetValue(curRdr.GetOrdinal("attack_dmg"));
					int curAttackDmg = curAttackDmgObj == null ? 1 : Convert.ToInt32(Convert.ToDouble(curAttackDmgObj));
					double curCritRate = curRdr.IsDBNull(curRdr.GetOrdinal("crit_rate")) ? 0.0 : curRdr.GetDouble(curRdr.GetOrdinal("crit_rate"));
					double curCritDmg = curRdr.IsDBNull(curRdr.GetOrdinal("crit_dmg")) ? 2.0 : curRdr.GetDouble(curRdr.GetOrdinal("crit_dmg"));
					int curHealth = curRdr.IsDBNull(curRdr.GetOrdinal("health")) ? 100 : curRdr.GetInt32(curRdr.GetOrdinal("health"));
					double curRegen = curRdr.IsDBNull(curRdr.GetOrdinal("regen")) ? 0.0 : curRdr.GetDouble(curRdr.GetOrdinal("regen"));
					curRdr.Close();

					// 3) Store current bones_hero into bones_hero_selection: update if a selection references this hero_id, otherwise insert
					// When storing the current bones_hero into a selection, match by user + name to avoid hero id mismatches
					string updateSelSql = @"UPDATE maxhanna.bones_hero_selection SET name = @Name, data = JSON_OBJECT('coordsX', @CoordsX, 'coordsY', @CoordsY, 'map', @Map, 'speed', @Speed, 'color', @Color, 'mask', @Mask, 'level', @Level, 'exp', @Exp, 'attack_speed', @AttackSpeed, 'attack_dmg', @AttackDmg, 'crit_rate', @CritRate, 'crit_dmg', @CritDmg, 'health', @Health, 'regen', @Regen, 'type', @Type), created = UTC_TIMESTAMP() WHERE user_id = @UserId AND name = @Name LIMIT 1;";
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
					updateSelCmd.Parameters.AddWithValue("@AttackDmg", curAttackDmg);
					updateSelCmd.Parameters.AddWithValue("@CritRate", curCritRate);
					updateSelCmd.Parameters.AddWithValue("@CritDmg", curCritDmg);
					updateSelCmd.Parameters.AddWithValue("@Health", curHealth);
					updateSelCmd.Parameters.AddWithValue("@Regen", curRegen);
					updateSelCmd.Parameters.AddWithValue("@Type", curType ?? string.Empty);
					updateSelCmd.Parameters.AddWithValue("@UserId", userId);
					updateSelCmd.Parameters.AddWithValue("@HeroId", currentHeroId);
					int updatedRows = await updateSelCmd.ExecuteNonQueryAsync();
					if (updatedRows == 0)
					{
						string insertSelSql = @"INSERT INTO maxhanna.bones_hero_selection (user_id, bones_hero_id, name, data, created) VALUES (@UserId, @HeroId, @Name, JSON_OBJECT('coordsX', @CoordsX, 'coordsY', @CoordsY, 'map', @Map, 'speed', @Speed, 'color', @Color, 'mask', @Mask, 'level', @Level, 'exp', @Exp, 'attack_speed', @AttackSpeed, 'attack_dmg', @AttackDmg, 'crit_rate', @CritRate, 'crit_dmg', @CritDmg, 'health', @Health, 'regen', @Regen, 'type', @Type), UTC_TIMESTAMP());";
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
						inSelCmd.Parameters.AddWithValue("@AttackDmg", curAttackDmg);
						inSelCmd.Parameters.AddWithValue("@CritRate", curCritRate);
						inSelCmd.Parameters.AddWithValue("@CritDmg", curCritDmg);
						inSelCmd.Parameters.AddWithValue("@Health", curHealth);
						inSelCmd.Parameters.AddWithValue("@Regen", curRegen);
						inSelCmd.Parameters.AddWithValue("@Type", curType ?? string.Empty);
						await inSelCmd.ExecuteNonQueryAsync();
					}

					// 4) Delete the current bones_hero for this user
					string delSql = @"DELETE FROM maxhanna.bones_hero WHERE user_id = @UserId LIMIT 1;";
					using var delCmd = new MySqlCommand(delSql, connection, transaction);
					delCmd.Parameters.AddWithValue("@UserId", userId);
					await delCmd.ExecuteNonQueryAsync();
				}
				else
				{
					// No current bones_hero exists for this user: dispose reader and proceed to insert the selection directly.
					await curRdr.DisposeAsync();
				}

				// 5) Insert the selected snapshot into bones_hero (guard numeric JSON parsing)
				string insertSql = @"INSERT INTO maxhanna.bones_hero (user_id, coordsX, coordsY, map, speed, name, color, mask, level, exp, created, attack_speed, attack_dmg, crit_rate, crit_dmg, health, regen, type)
					VALUES (@UserId, COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.coordsX')),'null')+0, 0), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.coordsY')),'null')+0, 0), JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.map')), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.speed')),'null')+0, 0), @Name, JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.color')), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.mask')),'null')+0, 0), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.level')),'null')+0, 0), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.exp')),'null')+0, 0), UTC_TIMESTAMP(), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.attack_speed')),'null')+0, 400), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.attack_dmg')),'null')+0, 1), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.crit_rate')),'null')+0, 0.0), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.crit_dmg')),'null')+0, 2.0), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.health')),'null')+0, 100), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.regen')),'null')+0, 0.0), COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(@Data,'$.type')),'null'), 'knight') );";
				using var insCmd = new MySqlCommand(insertSql, connection, transaction);
				insCmd.Parameters.AddWithValue("@Data", selDataJson ?? "{}");
				insCmd.Parameters.AddWithValue("@UserId", userId);
				insCmd.Parameters.AddWithValue("@Name", selName ?? "Anon");
				await insCmd.ExecuteNonQueryAsync();

				// After inserting the promoted hero, remove any town portals created by this user's heroes
				try
				{
					// Delete portals where creator_hero_id belongs to any hero owned by this user
					string delPortalsSql = @"DELETE p FROM maxhanna.bones_town_portal p WHERE p.creator_hero_id IN (SELECT id FROM maxhanna.bones_hero WHERE user_id = @UserId)";
					using var delPortalsCmd = new MySqlCommand(delPortalsSql, connection, transaction);
					delPortalsCmd.Parameters.AddWithValue("@UserId", userId);
					await delPortalsCmd.ExecuteNonQueryAsync();
				}
				catch (Exception exDel)
				{
					// Non-fatal: log and continue promotion
					await _log.Db("Failed to delete town portals on PromoteHeroSelection: " + exDel.Message, userId, "BONES", true);
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

				// Build string dictionary for event payload and persist only new stat keys
				var dataDict = new Dictionary<string, string>();
				foreach (var kv in req.Stats) dataDict[kv.Key] = kv.Value?.ToString() ?? string.Empty;

				// Persist new stat fields only. Legacy fields removed from schema and codebase.
				try
				{
					var setParts = new List<string>();
					var updParams = new Dictionary<string, object?>();
					if (req.Stats.ContainsKey("attackDmg")) { setParts.Add("attack_dmg = @attackDmg"); updParams["@attackDmg"] = req.Stats["attackDmg"]; }
					if (req.Stats.ContainsKey("attackSpeed")) { setParts.Add("attack_speed = @attackSpeed"); updParams["@attackSpeed"] = req.Stats["attackSpeed"]; }
					if (req.Stats.ContainsKey("critRate")) { setParts.Add("crit_rate = @critRate"); updParams["@critRate"] = req.Stats["critRate"]; }
					if (req.Stats.ContainsKey("critDmg")) { setParts.Add("crit_dmg = @critDmg"); updParams["@critDmg"] = req.Stats["critDmg"]; }
					if (req.Stats.ContainsKey("health")) { setParts.Add("health = @health"); updParams["@health"] = req.Stats["health"]; }
					if (req.Stats.ContainsKey("regen")) { setParts.Add("regen = @regen"); updParams["@regen"] = req.Stats["regen"]; }

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
				upCmd.Parameters.AddWithValue("@X", GRIDCELL);
				upCmd.Parameters.AddWithValue("@Y", GRIDCELL);
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
		public async Task<IActionResult> CreateTownPortal([FromBody] CreateTownPortalRequest? request)
		{
			try
			{
				if (request == null) return BadRequest("Invalid request");
				int heroId = request.HeroId;
				int? userId = request.UserId;
				string map = request.Map ?? string.Empty;
				int x = request.X;
				int y = request.Y;
				if (heroId <= 0) return BadRequest("Invalid hero id");
				using var connection = new MySqlConnection(_connectionString);
				await connection.OpenAsync();
				using var transaction = connection.BeginTransaction();
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
				if (request.Radius.HasValue) try { data["radius"] = request.Radius.Value.ToString(); } catch { }
				// Ensure the hero only has one portal: remove any existing portals created by this hero, and emit delete events
				try
				{
					var removedIds = new List<int>();
					string selExistingSql = "SELECT id FROM maxhanna.bones_town_portal WHERE creator_hero_id = @CreatorHeroId;";
					using (var selCmd = new MySqlCommand(selExistingSql, connection, transaction))
					{
						selCmd.Parameters.AddWithValue("@CreatorHeroId", heroId);
						using var rdr = await selCmd.ExecuteReaderAsync();
						while (await rdr.ReadAsync())
						{
							removedIds.Add(rdr.GetInt32(0));
						}
						rdr.Close();
					}
					if (removedIds.Count > 0)
					{
						string delSql = "DELETE FROM maxhanna.bones_town_portal WHERE creator_hero_id = @CreatorHeroId;";
						using var delCmd = new MySqlCommand(delSql, connection, transaction);
						delCmd.Parameters.AddWithValue("@CreatorHeroId", heroId);
						await delCmd.ExecuteNonQueryAsync();
						// Emit delete events for each removed portal so clients remove them immediately
						foreach (var rid in removedIds)
						{
							var evDelData = new Dictionary<string, string>() { { "portalId", rid.ToString() } };
							var evDel = new MetaEvent(0, 0, DateTime.UtcNow, "TOWN_PORTAL_DELETED", map ?? string.Empty, evDelData);
							await UpdateEventsInDB(evDel, connection, transaction);
						}
					}

					string insertPortalSql = @"INSERT INTO maxhanna.bones_town_portal (creator_hero_id, map, coordsX, coordsY, data, created) VALUES (@CreatorHeroId, @Map, @X, @Y, @Data, UTC_TIMESTAMP()); SELECT LAST_INSERT_ID();";
					using var insertCmd = new MySqlCommand(insertPortalSql, connection, transaction);
					insertCmd.Parameters.AddWithValue("@CreatorHeroId", heroId);
					insertCmd.Parameters.AddWithValue("@Map", map ?? string.Empty);
					insertCmd.Parameters.AddWithValue("@X", x);
					insertCmd.Parameters.AddWithValue("@Y", y);
					insertCmd.Parameters.AddWithValue("@Data", Newtonsoft.Json.JsonConvert.SerializeObject(data));
					var insertedObj = await insertCmd.ExecuteScalarAsync();
					int insertedId = 0;
					if (insertedObj != null && int.TryParse(insertedObj.ToString(), out var tmpId)) insertedId = tmpId;
					// include portal id in event data so clients can reference it
					if (insertedId > 0) data["portalId"] = insertedId.ToString();

					// Also create a paired portal in Town so other players can enter the town portal and be sent back.
					// Compute a deterministic position on a circle around (GRIDCELL*4, GRIDCELL*4)
					try
					{
						int townCenter = GRIDCELL * 4; // center point in town
						int radius = GRIDCELL * 4; // place portals on a circle of 4 grid cells
						double angleDeg = (heroId * 97) % 360; // pseudo-random but deterministic by heroId
						double angleRad = angleDeg * Math.PI / 180.0;
						int tx = townCenter + (int)Math.Round(Math.Cos(angleRad) * radius);
						int ty = townCenter + (int)Math.Round(Math.Sin(angleRad) * radius);
						var townData = new Dictionary<string, string>();
						// Include backlink information so using the town portal returns you to the original map+coords
						townData["originMap"] = map ?? string.Empty;
						townData["originX"] = x.ToString();
						townData["originY"] = y.ToString();
						// Reference the canonical portalId (insertedId). We'll insert the town-side portal and then add both ids to events.
						string insertTownSql = @"INSERT INTO maxhanna.bones_town_portal (creator_hero_id, map, coordsX, coordsY, data, created) VALUES (@CreatorHeroId, @Map, @X, @Y, @Data, UTC_TIMESTAMP()); SELECT LAST_INSERT_ID();";
						using var insertTownCmd = new MySqlCommand(insertTownSql, connection, transaction);
						insertTownCmd.Parameters.AddWithValue("@CreatorHeroId", heroId);
						// Determine paired town map as the previous town relative to the hero's current map.
						// Use an ordered list and walk backwards to find the preceding town.

						var townSet = new HashSet<string>(new[] { "HeroRoom", "CitadelOfVesper", "RiftedBastion", "FortPenumbra", "GatesOfHell" });
						string currentMapRaw = map ?? string.Empty;
						string NormalizeMap(string s)
						{
							if (string.IsNullOrEmpty(s)) return string.Empty;
							var sb = new System.Text.StringBuilder();
							foreach (var ch in s.ToUpperInvariant()) { if (char.IsLetterOrDigit(ch)) sb.Append(ch); }
							return sb.ToString();
						}
						string normCurrent = NormalizeMap(currentMapRaw);
						int idx = -1;
						for (int i = 0; i < orderedMaps.Length; i++)
						{
							if (NormalizeMap(orderedMaps[i]) == normCurrent) { idx = i; break; }
						}
						string targetMap = "HeroRoom";
						if (idx == -1)
						{
							targetMap = "HeroRoom";
						}
						else
						{
							for (int i = idx - 1; i >= 0; i--)
							{
								if (townSet.Contains(orderedMaps[i])) { targetMap = orderedMaps[i]; break; }
							}
						}
						insertTownCmd.Parameters.AddWithValue("@Map", targetMap ?? "HeroRoom");
						insertTownCmd.Parameters.AddWithValue("@X", tx);
						insertTownCmd.Parameters.AddWithValue("@Y", ty);
						insertTownCmd.Parameters.AddWithValue("@Data", Newtonsoft.Json.JsonConvert.SerializeObject(townData));
						var townInsertedObj = await insertTownCmd.ExecuteScalarAsync();
						int townInsertedId = 0;
						if (townInsertedObj != null && int.TryParse(townInsertedObj.ToString(), out var tmpTownId)) townInsertedId = tmpTownId;
						// If both inserted, include town portal id in original event data to help clients correlate
						if (townInsertedId > 0 && insertedId > 0)
						{
							data["pairedTownPortalId"] = townInsertedId.ToString();
						}
					}
					catch (Exception exPair)
					{
						await _log.Db("Create paired town portal failed: " + exPair.Message, heroId, "BONES", true);
					}
				}
				catch (Exception exIns)
				{
					await _log.Db("Persist town portal failed: " + exIns.Message, heroId, "BONES", true);
				}
				var ev = new MetaEvent(0, heroId, DateTime.UtcNow, "TOWN_PORTAL", map ?? string.Empty, data);
				await UpdateEventsInDB(ev, connection, transaction);
				await transaction.CommitAsync();
				return Ok(new { created = true, portalId = data.ContainsKey("portalId") ? data["portalId"] : (object?)null });
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
				string sql = @"
				UPDATE maxhanna.bones_hero h
				SET h.hp = LEAST(100, h.hp + GREATEST(FLOOR(h.regen * FLOOR(TIMESTAMPDIFF(SECOND, COALESCE(h.last_regen, UTC_TIMESTAMP() - INTERVAL 1 SECOND), UTC_TIMESTAMP()))),0)),
					h.last_regen = UTC_TIMESTAMP(),
					h.updated = UTC_TIMESTAMP()
				WHERE h.hp > 0 AND h.regen > 0 AND h.hp < 100
					AND (h.last_regen IS NULL OR h.last_regen < UTC_TIMESTAMP() - INTERVAL 1 SECOND);

				UPDATE maxhanna.bones_hero SET coordsX = @CoordsX, coordsY = @CoordsY, mask = @Mask, map = @Map, speed = @Speed, updated = UTC_TIMESTAMP() WHERE id = @HeroId;";
				Dictionary<string, object?> parameters = new() {
					{ "@CoordsX", hero.Position.x },
					 { "@CoordsY", hero.Position.y },
					 { "@Mask", hero.Mask },
					 { "@Map", hero.Map },
					 { "@Speed", hero.Speed },
					 { "@HeroId", hero.Id } };
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

				// NOTE: ITEM_DROPPED persistence is handled in SpawnDroppedItemPlaceholder to avoid creating spawn events.
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
				
				string sql = $@"
				SELECT 
					h.id as hero_id, 
					h.coordsX, h.coordsY,
					h.map, h.speed, 
					h.name as hero_name, 
					h.type as hero_type, 
					h.color as hero_color, 
					h.mask as hero_mask, 
					h.level as hero_level,
					h.exp as hero_exp, 
					h.hp as hero_hp, 
					h.attack_speed as attack_speed,  
					h.attack_dmg AS hero_attack_dmg,
					h.crit_rate AS hero_crit_rate,
					h.crit_dmg AS hero_crit_dmg,
					h.health AS hero_health,
					h.regen AS hero_regen 
				FROM maxhanna.bones_hero h 
				WHERE {(heroId == null ? "h.user_id = @UserId" : "h.id = @UserId")};";
				MySqlCommand cmd = new(sql, conn, transaction); cmd.Parameters.AddWithValue("@UserId", heroId != null ? heroId : userId);
				MetaHero? hero = null;
				// Read the hero row(s) into memory first. Do not execute other commands on the same connection
				// while a DataReader is active because MySqlConnector disallows concurrent command usage.
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (reader.Read())
					{
						if (hero == null)
						{
							int levelOrd = reader.GetOrdinal("hero_level");
							int expOrd = reader.GetOrdinal("hero_exp");
							int attackSpeed = reader.IsDBNull(reader.GetOrdinal("attack_speed")) ? 400 : reader.GetInt32(reader.GetOrdinal("attack_speed"));
							hero = new MetaHero
							{
								Id = reader.GetInt32("hero_id"),
								Position = new Vector2(reader.GetInt32("coordsX"), reader.GetInt32("coordsY")),
								Speed = reader.GetInt32("speed"),
								Map = SafeGetString(reader, "map") ?? string.Empty,
								Name = SafeGetString(reader, "hero_name"),
								Type = SafeGetString(reader, "hero_type"),
								Color = SafeGetString(reader, "hero_color") ?? string.Empty,
								Mask = reader.IsDBNull(reader.GetOrdinal("hero_mask")) ? null : reader.GetInt32("hero_mask"),
								Level = reader.IsDBNull(levelOrd) ? 0 : reader.GetInt32(levelOrd),
								Exp = reader.IsDBNull(expOrd) ? 0 : reader.GetInt32(expOrd),
								AttackSpeed = attackSpeed,
								Hp = reader.IsDBNull(reader.GetOrdinal("hero_hp")) ? 100 : reader.GetInt32(reader.GetOrdinal("hero_hp")),
								// Legacy stats removed; not included in MetaHero mapping
								AttackDmg = reader.IsDBNull(reader.GetOrdinal("hero_attack_dmg")) ? 1 : Convert.ToInt32(Convert.ToDouble(reader.GetValue(reader.GetOrdinal("hero_attack_dmg")))),
								CritRate = reader.IsDBNull(reader.GetOrdinal("hero_crit_rate")) ? 0.0 : reader.GetDouble(reader.GetOrdinal("hero_crit_rate")),
								CritDmg = reader.IsDBNull(reader.GetOrdinal("hero_crit_dmg")) ? 2.0 : reader.GetDouble(reader.GetOrdinal("hero_crit_dmg")),
								Health = reader.IsDBNull(reader.GetOrdinal("hero_health")) ? 1 : reader.GetInt32(reader.GetOrdinal("hero_health")),
								Regen = reader.IsDBNull(reader.GetOrdinal("hero_regen")) ? 0.0 : reader.GetDouble(reader.GetOrdinal("hero_regen")),
							};
						}
					}
				}

				// After the reader is closed, it's safe to execute additional commands on the same connection.
				if (userId != 0 && hero != null)
				{
					 
						using var colorCmd = new MySqlCommand("SELECT last_character_color FROM maxhanna.user_settings WHERE user_id = @UserId LIMIT 1", conn, transaction);
						colorCmd.Parameters.AddWithValue("@UserId", userId);
						var colorObj = await colorCmd.ExecuteScalarAsync();
						if (colorObj != null && colorObj != DBNull.Value)
						{
							var colorStr = colorObj.ToString();
							if (!string.IsNullOrEmpty(colorStr)) hero.Color = colorStr;
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
					SET hp = 100, awarded = 0, last_killed = NULL, coordsX = o_coordsX, coordsY = o_coordsY, target_hero_id = 0, last_moved = UTC_TIMESTAMP() 
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

				// If there are no encounters on this map, prune any stale entries from the
				// static per-encounter dictionaries so they don't grow unbounded over time.
				if (encounters.Count == 0)
				{
					lock (_encounterRecentPositions)
					{
						_encounterRecentPositions.Clear();
					}
					lock (_encounterTargetLockTimes)
					{
						_encounterTargetLockTimes.Clear();
					}
					return;
				}

				// Prune any entries that refer to encounters which are no longer present
				var currentEncounterIds = new HashSet<int>();
				foreach (var ce in encounters) currentEncounterIds.Add(ce.heroId);
				lock (_encounterRecentPositions)
				{
					var keys = _encounterRecentPositions.Keys.ToList();
					foreach (var k in keys)
					{
						if (!currentEncounterIds.Contains(k)) _encounterRecentPositions.Remove(k);
					}
				}
				lock (_encounterTargetLockTimes)
				{
					var keys2 = _encounterTargetLockTimes.Keys.ToList();
					foreach (var k in keys2)
					{
						if (!currentEncounterIds.Contains(k)) _encounterTargetLockTimes.Remove(k);
					}
				}

				// Get heroes on this map to determine targets. Build both list and fast lookup dictionary to avoid LINQ allocations in hot loops.
				var heroes = new List<(int heroId, int x, int y)>();
				var heroById = new Dictionary<int, (int x, int y)>();
				const string heroSql = @"SELECT id, coordsX, coordsY FROM maxhanna.bones_hero WHERE map = @Map AND hp > 0";
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
				int tile = GRIDCELL;
				// Build occupied/reserved position sets so encounters can spread and avoid stacking
				var occupiedPositions = new HashSet<(int x, int y)>();
				foreach (var ce in encounters) occupiedPositions.Add((ce.x, ce.y));
				foreach (var h in heroes) occupiedPositions.Add((h.x, h.y));
				var reservedPositions = new HashSet<(int x, int y)>();
				var rng = new Random();
				(int nx, int ny) PickApproachTile(int centerX, int centerY, int fallbackX, int fallbackY)
				{
					// Prefer the caller-provided intended tile (fallback) if available. This helps encounters
					// stop at the intended adjacent tile (one GRIDCELL away) instead of circling.
					var fb = (fallbackX, fallbackY);
					if (!occupiedPositions.Contains(fb) && !reservedPositions.Contains(fb))
					{
						return fb;
					}
					var candidates = new List<(int, int)>
					{
						(centerX - tile, centerY),
						(centerX + tile, centerY),
						(centerX, centerY - tile),
						(centerX, centerY + tile),
						(centerX - tile, centerY - tile),
						(centerX + tile, centerY - tile),
						(centerX - tile, centerY + tile),
						(centerX + tile, centerY + tile)
					};
					for (int i = candidates.Count - 1; i > 0; i--)
					{
						int j = rng.Next(i + 1);
						var tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
					}
					foreach (var c in candidates)
					{
						if (!occupiedPositions.Contains(c) && !reservedPositions.Contains(c)) return c;
					}
					var ring = new List<(int, int)>();
					for (int dx = -2; dx <= 2; dx++)
					{
						for (int dy = -2; dy <= 2; dy++)
						{
							if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != 2) continue;
							ring.Add((centerX + dx * tile, centerY + dy * tile));
						}
					}
					for (int i = ring.Count - 1; i > 0; i--)
					{
						int j = rng.Next(i + 1);
						var tmp = ring[i]; ring[i] = ring[j]; ring[j] = tmp;
					}
					foreach (var c in ring)
					{
						if (!occupiedPositions.Contains(c) && !reservedPositions.Contains(c)) return c;
					}
					// As a last resort return the intended fallback
					return fb;
				}
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
								// Preserve one-grid-cell gap when resuming a locked target: compute adjacent tile
								int dxLocked = lockedPos.x - e.x;
								int dyLocked = lockedPos.y - e.y;
								int intendedX, intendedY;
								if (Math.Abs(dxLocked) >= Math.Abs(dyLocked))
								{
									intendedX = lockedPos.x + (dxLocked > 0 ? -tile : tile);
									intendedY = lockedPos.y;
								}
								else
								{
									intendedX = lockedPos.x;
									intendedY = lockedPos.y + (dyLocked > 0 ? -tile : tile);
								}
								(curX, curY) = PickApproachTile(lockedPos.x, lockedPos.y, intendedX, intendedY);
								closest = (targetHeroId, curX, curY);
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
							int intendedX, intendedY;
							if (Math.Abs(dx) >= Math.Abs(dy))
							{
								intendedX = closest.Value.x + (dx > 0 ? -tile : tile);
								intendedY = closest.Value.y;
							}
							else
							{
								intendedX = closest.Value.x;
								intendedY = closest.Value.y + (dy > 0 ? -tile : tile);
							}
							(curX, curY) = PickApproachTile(closest.Value.x, closest.Value.y, intendedX, intendedY);
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
						// Use the actual hero coordinates for distance checks (closest may contain the adjacent tile)
						int distCurrent;
						if (heroById.TryGetValue(targetHeroId, out var actualHeroPos))
						{
							distCurrent = Math.Abs(actualHeroPos.x - e.x) + Math.Abs(actualHeroPos.y - e.y);
						}
						else
						{
							distCurrent = Math.Abs(closest.Value.x - e.x) + Math.Abs(closest.Value.y - e.y);
						}
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
						// Prefer using the hero's actual coordinates for adjacency checks because `closest` may contain
						// an approach/movement tile rather than the hero's true position.
						int dxAdj, dyAdj;
						if (heroById.TryGetValue(closest.Value.heroId, out var actualHeroPos))
						{
							dxAdj = Math.Abs(actualHeroPos.x - e.x);
							dyAdj = Math.Abs(actualHeroPos.y - e.y);
						}
						else
						{
							dxAdj = Math.Abs(closest.Value.x - e.x);
							dyAdj = Math.Abs(closest.Value.y - e.y);
						}

						if ((dxAdj == tile && dyAdj == 0) || (dyAdj == tile && dxAdj == 0))
						{
							// Axis-adjacent: attempt server-side attack emission rate-limited by encounter.attackSpeed or last_attack DB column
							try
							{
								int attSpd = (e.attackSpeed <= 0 ? 400 : e.attackSpeed) + ATTACK_BUFFER_MS;
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
									if (heroById.TryGetValue(closest.Value.heroId, out var facingHeroPos))
									{
										if (dxAdj == tile)
										{
											numericFacing = facingHeroPos.x > e.x ? 2 : 1; // right : left
										}
										else
										{
											numericFacing = facingHeroPos.y > e.y ? 0 : 3; // down : up
										}
									}
									else
									{
										// Fallback: infer facing from the closest/movement tile
										if (dxAdj == tile)
										{
											numericFacing = closest.Value.x > e.x ? 2 : 1;
										}
										else
										{
											numericFacing = closest.Value.y > e.y ? 0 : 3;
										}
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
									if (closest.Value.heroId == e.heroId)
									{
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
										// Use ApplyDamageToHero so crits and death handling are centralized
										await ApplyDamageToHero(tgtHeroId, e.heroId, "encounter", attackerLevel, 0.0, 1.0, map, connection, transaction);
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
						// Ensure movement coordinates are grid-aligned (multiples of GRIDCELL)
						try
						{
							int snappedX = (int)Math.Round(curX / (double)tile) * tile;
							int snappedY = (int)Math.Round(curY / (double)tile) * tile;
							curX = snappedX;
							curY = snappedY;
						}
						catch { /* no-op: keep original values if rounding fails */ }

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
						// Reserve this destination so other encounters won't pick the same tile this tick
						try { reservedPositions.Add((curX, curY)); } catch { }
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
					m.type as hero_type,
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
							var type = reader.IsDBNull(reader.GetOrdinal("hero_type")) ? null : reader.GetString(reader.GetOrdinal("hero_type"));
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
								Type = type,
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
			else if (metaEvent != null && metaEvent.Data != null && string.Equals(metaEvent.EventType, "ITEM_DESTROYED", StringComparison.OrdinalIgnoreCase))
			{
				// A player picked up/destroyed an item. If a matching dropped-item exists at the specified position,
				// delete it from bones_items_dropped and apply its power to the picking hero's 'power' column.
				try
				{
					int heroId = metaEvent.HeroId;
					string map = metaEvent.Map ?? string.Empty;
					int x = 0, y = 0;
					if (metaEvent.Data.TryGetValue("position", out var posObj) && posObj != null)
					{
						try
						{
							var posStr = posObj.ToString() ?? string.Empty;
							if (!string.IsNullOrEmpty(posStr))
							{
								var jo = Newtonsoft.Json.Linq.JObject.Parse(posStr);
								x = jo.Value<int?>("x") ?? 0;
								y = jo.Value<int?>("y") ?? 0;
							}
						}
						catch { }
					}

					if (x == 0 && y == 0)
					{
						// No precise coords; nothing to do.
						return;
					}

					// Find the most recent dropped item at this location
					string selectSql = "SELECT id, data FROM maxhanna.bones_items_dropped WHERE map = @Map AND coordsX = @X AND coordsY = @Y ORDER BY created DESC LIMIT 1;";
					using var selCmd = new MySqlCommand(selectSql, connection, transaction);
					selCmd.Parameters.AddWithValue("@Map", map);
					selCmd.Parameters.AddWithValue("@X", x);
					selCmd.Parameters.AddWithValue("@Y", y);
					using var rdr = await selCmd.ExecuteReaderAsync();
					if (!await rdr.ReadAsync())
					{
						rdr.Close();
						return; // nothing to pick up
					}
					int droppedId = rdr.GetInt32(0);
					string dataJson = rdr.IsDBNull(1) ? "{}" : rdr.GetString(1);
					rdr.Close();

					int power = 0;
					try
					{
						var parsed = Newtonsoft.Json.JsonConvert.DeserializeObject<Newtonsoft.Json.Linq.JObject>(dataJson);
						if (parsed != null)
						{
							power = parsed.Value<int?>("power") ?? 0;
						}
					}
					catch { }

					// Delete the dropped item row and add power to bones_hero.power
					try
					{
						string deleteSql = "DELETE FROM maxhanna.bones_items_dropped WHERE id = @Id LIMIT 1;";
						using var delCmd = new MySqlCommand(deleteSql, connection, transaction);
						delCmd.Parameters.AddWithValue("@Id", droppedId);
						await delCmd.ExecuteNonQueryAsync();

						if (power != 0 && heroId > 0)
						{
							string updHeroSql = "UPDATE maxhanna.bones_hero SET power = COALESCE(power,0) + @Power WHERE id = @HeroId LIMIT 1;";
							using var upCmd = new MySqlCommand(updHeroSql, connection, transaction);
							upCmd.Parameters.AddWithValue("@Power", power);
							upCmd.Parameters.AddWithValue("@HeroId", heroId);
							await upCmd.ExecuteNonQueryAsync();
						}
					}
					catch (Exception ex)
					{
						await _log.Db("Failed to delete dropped item or update hero power: " + ex.Message, heroId, "BONES", true);
					}
				}
				catch (Exception ex)
				{
					await _log.Db("ITEM_DESTROYED handling error: " + ex.Message, metaEvent.HeroId, "BONES", true);
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
				//await _log.Db($"AwardEncounterKillExp: killer={killerHeroId} encounterLevel={encounterLevel} party=[{string.Join(',', partyIds)}]", killerHeroId, "BONES", true);
				string idsCsv = string.Join(',', partyIds);
				string updateSql = $"UPDATE maxhanna.bones_hero SET exp = exp + @Exp WHERE id IN ({idsCsv})";
				using (var upCmd = new MySqlCommand(updateSql, connection, transaction))
				{
					upCmd.Parameters.AddWithValue("@Exp", encounterLevel);
					int rows = await upCmd.ExecuteNonQueryAsync();
					//	await _log.Db($"AwardEncounterKillExp: exp UPDATE rowsAffected={rows} for ids=[{idsCsv}] (added {encounterLevel} exp)", killerHeroId, "BONES", true);
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
						//	await _log.Db($"AwardEncounterKillExp: post-update heroId={id} exp={exp} level={lvl}", killerHeroId, "BONES", true);
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
					//	await _log.Db($"AwardEncounterKillExp: level UPDATE rowsAffected={leveled} for ids=[{idsCsv}]", killerHeroId, "BONES", true);
				}
			}
			catch (Exception ex)
			{
				await _log.Db("AwardEncounterKillExp failure: " + ex.Message, killerHeroId, "BONES", true);
			}
		}

		// Placeholder hook called when an encounter dies so dropped item logic can be added here later.
		private async Task SpawnDroppedItem(int encounterId, int encounterLevel, int x, int y, string map, MySqlConnection connection, MySqlTransaction transaction)
		{
			// Create a dropped item row in bones_items_dropped and prune older entries (>2 minutes)
			try
			{
				// Construct a simple data payload; include a random power relative to the encounterLevel
				int heroLevel = Math.Max(1, encounterLevel);
				var rng = new Random();
				int powerLower = -15 + heroLevel;
				int powerUpper = 10 + heroLevel;
				int power = rng.Next(powerLower, powerUpper + 1);

				var itemData = new Dictionary<string, object?>() { { "power", power }, { "sourceEncounterId", encounterId } };

				// Choose drop coordinates: prefer the encounter location but probe nearby tiles (multiples of GRIDCELL)
				int chosenX = x;
				int chosenY = y;
				var offsets = new List<(int dx, int dy)>() {
				(0,0), (GRIDCELL,0), (-GRIDCELL,0), (0,GRIDCELL), (0,-GRIDCELL),
				(GRIDCELL,GRIDCELL), (-GRIDCELL,GRIDCELL), (GRIDCELL,-GRIDCELL), (-GRIDCELL,-GRIDCELL),
				(2*GRIDCELL,0), (-2*GRIDCELL,0), (0,2*GRIDCELL), (0,-2*GRIDCELL)
			};

				try
				{
					foreach (var off in offsets)
					{
						int tryX = x + off.dx;
						int tryY = y + off.dy;
						string selOcc = "SELECT COUNT(1) FROM maxhanna.bones_items_dropped WHERE map = @Map AND coordsX = @X AND coordsY = @Y AND created >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE);";
						using var occCmd = new MySqlCommand(selOcc, connection, transaction);
						occCmd.Parameters.AddWithValue("@Map", map ?? string.Empty);
						occCmd.Parameters.AddWithValue("@X", tryX);
						occCmd.Parameters.AddWithValue("@Y", tryY);
						var occObj = await occCmd.ExecuteScalarAsync();
						int occCount = 0;
						if (occObj != null && int.TryParse(occObj.ToString(), out var tmp)) occCount = tmp;
						if (occCount == 0)
						{
							chosenX = tryX;
							chosenY = tryY;
							break;
						}
					}
				}
				catch { /* non-fatal: fall back to provided x/y */ }

				string insertSql = @"DELETE FROM maxhanna.bones_items_dropped WHERE created < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE); INSERT INTO maxhanna.bones_items_dropped (map, coordsX, coordsY, data, created) VALUES (@Map, @X, @Y, @Data, UTC_TIMESTAMP());";
				var parameters = new Dictionary<string, object?>()
			{
				{"@Map", map ?? string.Empty},
				{"@X", chosenX},
				{"@Y", chosenY},
				{"@Data", Newtonsoft.Json.JsonConvert.SerializeObject(itemData)}
			};
				// Attempt insert (non-fatal). Use ExecuteInsertOrUpdateOrDeleteAsync to respect transaction
				await ExecuteInsertOrUpdateOrDeleteAsync(insertSql, parameters, connection, transaction);
				await _log.Db($"SpawnDroppedItemPlaceholder created dropped item at=({chosenX},{chosenY}) power={power}", null, "BONES", true);
			}
			catch (Exception ex)
			{
				await _log.Db("SpawnDroppedItemPlaceholder failed: " + ex.Message, null, "BONES", true);
			}
			return;
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

		/// <summary>
		/// Compute final integer damage given baseDamage, critRate (0..1) and critMultiplier (e.g. 2.0)
		/// Returns (damage, wasCrit)
		/// </summary>
		private (int damage, bool crit) ComputeDamage(int baseDamage, double critRate, double critMultiplier)
		{
			var rng = new Random();
			bool isCrit = false;
			try
			{
				double roll = rng.NextDouble();
				if (critRate > 0 && roll <= critRate) isCrit = true;
			}
			catch { }
			int dmg = baseDamage;
			if (isCrit)
			{
				dmg = (int)Math.Max(1, Math.Round(baseDamage * critMultiplier));
			}
			return (dmg, isCrit);
		}

		/// <summary>
		/// Apply damage to an encounter (monster) row, update HP and set last_killed/target_hero_id when appropriate.
		/// Returns number of rows affected.
		/// </summary>
		private async Task<long> ApplyDamageToEncounter(int encounterHeroId, int damage, int attackerHeroId, MySqlConnection connection, MySqlTransaction transaction)
		{
			long rows = 0;
			try
			{
				Console.WriteLine($"ApplyDamageToEncounter called: enc={encounterHeroId}, damage={damage}, attacker={attackerHeroId}");
				string upd = @"UPDATE maxhanna.bones_encounter e
					SET e.hp = GREATEST(e.hp - @Damage, 0),
						e.target_hero_id = CASE WHEN (e.target_hero_id IS NULL OR e.target_hero_id = 0) THEN @HeroId ELSE e.target_hero_id END,
						e.last_killed = CASE WHEN (e.hp - @Damage) <= 0 THEN UTC_TIMESTAMP() ELSE e.last_killed END
					WHERE e.hero_id = @EncId LIMIT 1;";
				var parameters = new Dictionary<string, object?>() {
					{"@Damage", damage},
					{"@HeroId", attackerHeroId},
					{"@EncId", encounterHeroId}
				};
				rows = Convert.ToInt32(await ExecuteInsertOrUpdateOrDeleteAsync(upd, parameters, connection, transaction));
				Console.WriteLine($"ApplyDamageToEncounter result: enc={encounterHeroId}, damage={damage}, attacker={attackerHeroId}, rowsAffected={rows}");
			}
			catch (Exception ex)
			{
				Console.WriteLine($"ApplyDamageToEncounter exception: enc={encounterHeroId}, attacker={attackerHeroId}, ex={ex.Message}");
				await _log.Db("ApplyDamageToEncounter failed: " + ex.Message, attackerHeroId, "BONES", true);
			}
			return rows;
		}
		/// <summary>
		/// Apply damage to a hero row, update HP and emit death handling if HP reaches 0.
		/// Uses an UPDATE followed by SELECT to determine new hp, and then calls HandleHeroDeath when needed.
		/// </summary>
		private async Task ApplyDamageToHero(int targetHeroId, int attackerId, string attackerType, int baseDamage, double critRate, double critMultiplier, string map, MySqlConnection connection, MySqlTransaction transaction)
		{
			if (targetHeroId <= 0) return;
			// Compute final damage (before target's health reduction)
			var (damage, wasCrit) = ComputeDamage(baseDamage, critRate, critMultiplier);
			try
			{
				// Read target hero 'health' stat which represents percentage damage reduction (0..100)
				int targetHealthPercent = 1; 
				string selHealth = "SELECT health FROM maxhanna.bones_hero WHERE id = @TargetHeroId LIMIT 1;";
				using var hCmd = new MySqlCommand(selHealth, connection, transaction);
				hCmd.Parameters.AddWithValue("@TargetHeroId", targetHeroId);
				var hObj = await hCmd.ExecuteScalarAsync();
				if (hObj != null && int.TryParse(hObj.ToString(), out var parsedH))
				{
					targetHealthPercent = parsedH;
				}
				 
				// Clamp health percent and compute reduction factor
				if (targetHealthPercent < 0) targetHealthPercent = 0;
				if (targetHealthPercent > 100) targetHealthPercent = 100;
				double factor = 1.0 - (targetHealthPercent / 100.0);
				// Apply reduction and round to integer damage
				int finalDamage = (int)Math.Round(damage * factor);
				if (finalDamage < 0) finalDamage = 0;

				string upd = "UPDATE maxhanna.bones_hero SET hp = GREATEST(hp - @Damage, 0), updated = UTC_TIMESTAMP() WHERE id = @TargetHeroId AND hp > 0 LIMIT 1;";
				var parameters = new Dictionary<string, object?>() { { "@Damage", finalDamage }, { "@TargetHeroId", targetHeroId } };
				int affected = Convert.ToInt32(await ExecuteInsertOrUpdateOrDeleteAsync(upd, parameters, connection, transaction));
				if (affected > 0)
				{
					// read new hp
					string sel = "SELECT hp FROM maxhanna.bones_hero WHERE id = @TargetHeroId LIMIT 1;";
					using var selCmd = new MySqlCommand(sel, connection, transaction);
					selCmd.Parameters.AddWithValue("@TargetHeroId", targetHeroId);
					var obj = await selCmd.ExecuteScalarAsync();
					int newHp = 0;
					if (obj != null && int.TryParse(obj.ToString(), out var parsed)) newHp = parsed;
					if (newHp <= 0)
					{
						await HandleHeroDeath(targetHeroId, attackerId, attackerType, map, connection, transaction);
					}
				}
			}
			catch (Exception ex)
			{
				await _log.Db("ApplyDamageToHero failed: " + ex.Message, targetHeroId, "BONES", true);
			}
		}
		private async Task UpdateMetaHeroParty(List<int>? partyData, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				if (partyData == null || partyData.Count < 2)
				{
					await _log.Db("UpdateMetaHeroParty: insufficient partyData", null, "BONES", true);
					return;
				}
				var heroIds = partyData.Distinct().ToList();
				if (heroIds.Count < 2)
				{
					await _log.Db("UpdateMetaHeroParty: after distinct only one hero", null, "BONES", true);
					return;
				}
				string selectSql = $"SELECT hero_id, party_id FROM bones_hero_party WHERE hero_id IN ({string.Join(',', heroIds)})";
				var existing = new Dictionary<int, int?>();
				using (var selCmd = new MySqlCommand(selectSql, connection, transaction))
				{
					using var rdr = await selCmd.ExecuteReaderAsync();
					while (await rdr.ReadAsync())
					{
						int hid = rdr.GetInt32(0);
						int? pid = rdr.IsDBNull(1) ? (int?)null : rdr.GetInt32(1);
						existing[hid] = pid;
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
				int targetPartyId;
				if (partyIdsFound.Count == 0)
				{
					string existingHeroSql = $"SELECT id FROM bones_hero WHERE id IN ({string.Join(',', heroIds)}) LIMIT 1";
					using var existHeroCmd = new MySqlCommand(existingHeroSql, connection, transaction);
					var existObj = await existHeroCmd.ExecuteScalarAsync();
					if (existObj != null && int.TryParse(existObj.ToString(), out var foundHeroId) && foundHeroId > 0)
					{
						targetPartyId = foundHeroId;
					}
					else
					{
						await _log.Db($"UpdateMetaHeroParty: none of the supplied heroIds exist in bones_hero, aborting party creation heroes=[{string.Join(',', heroIds)}]", null, "BONES", true);
						return;
					}
				}
				else
				{
					targetPartyId = partyIdsFound.Min();
					//await _log.Db($"UpdateMetaHeroParty using existing partyId={targetPartyId}", null, "BONES", true);
					// Merge any other party_ids into targetPartyId
					if (partyIdsFound.Count > 1)
					{
						string mergeSql = $"UPDATE bones_hero_party SET party_id = @Target WHERE party_id IN ({string.Join(',', partyIdsFound.Where(id => id != targetPartyId))})";
						//await _log.Db($"UpdateMetaHeroParty merging partyIds sql={mergeSql}", null, "BONES", true);
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
				int? partyId = null;
				using (var pidCmd = new MySqlCommand("SELECT party_id FROM bones_hero_party WHERE hero_id = @HeroId LIMIT 1", connection, transaction))
				{
					pidCmd.Parameters.AddWithValue("@HeroId", heroId);
					var pidObj = await pidCmd.ExecuteScalarAsync();
					if (pidObj != null && int.TryParse(pidObj.ToString(), out var tmpPid)) partyId = tmpPid;
				}
				const string deleteQuery = "DELETE FROM bones_hero_party WHERE hero_id = @HeroId LIMIT 1";
				using var deleteCommand = new MySqlCommand(deleteQuery, connection, transaction);
				deleteCommand.Parameters.AddWithValue("@HeroId", heroId);
				await deleteCommand.ExecuteNonQueryAsync();
				if (partyId.HasValue)
				{
					using var countCmd = new MySqlCommand("SELECT COUNT(1) FROM bones_hero_party WHERE party_id = @Pid", connection, transaction);
					countCmd.Parameters.AddWithValue("@Pid", partyId.Value);
					var cntObj = await countCmd.ExecuteScalarAsync();
					int cnt = 0;
					if (cntObj != null && int.TryParse(cntObj.ToString(), out var tmpCnt))
					{
						cnt = tmpCnt;
					}
					if (cnt == 1)
					{
						// find the remaining hero id and delete that row as well
						using var remCmd = new MySqlCommand("SELECT hero_id FROM bones_hero_party WHERE party_id = @Pid LIMIT 1", connection, transaction);
						remCmd.Parameters.AddWithValue("@Pid", partyId.Value);
						var remObj = await remCmd.ExecuteScalarAsync();
						if (remObj != null && int.TryParse(remObj.ToString(), out var lastHeroId))
						{
							using var delLast = new MySqlCommand("DELETE FROM bones_hero_party WHERE hero_id = @HeroId LIMIT 1", connection, transaction);
							delLast.Parameters.AddWithValue("@HeroId", lastHeroId);
							await delLast.ExecuteNonQueryAsync();
						}
					}
				}
			}
			catch (MySqlException) { throw; }
			catch (Exception) { throw; }
		}

		private async Task<int?> GetPartyId(int heroId, MySqlConnection connection, MySqlTransaction transaction)
		{
			try
			{
				using var cmd = new MySqlCommand("SELECT party_id FROM bones_hero_party WHERE hero_id = @HeroId LIMIT 1", connection, transaction);
				cmd.Parameters.AddWithValue("@HeroId", heroId);
				var obj = await cmd.ExecuteScalarAsync();
				if (obj == null || obj == DBNull.Value)
				{
					return null;
				}
				if (int.TryParse(obj.ToString(), out var pid))
				{
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
				int? partyId = await GetPartyId(heroId, connection, transaction);
				if (!partyId.HasValue)
				{
					list.Add(heroId);
					return list;
				}
				using var cmd = new MySqlCommand("SELECT hero_id FROM bones_hero_party WHERE party_id = @Pid", connection, transaction);
				cmd.Parameters.AddWithValue("@Pid", partyId.Value);
				using var rdr = await cmd.ExecuteReaderAsync();
				while (await rdr.ReadAsync())
				{
					var hid = rdr.GetInt32(0);
					if (!list.Contains(hid))
					{
						list.Add(hid);
					}
				}
				if (!list.Contains(heroId))
				{
					list.Add(heroId);
				}
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
				// Log the error and parameters for debugging
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
