using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Nexus;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json; 

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Microsoft.AspNetCore.Components.Route("[controller]")]
	public class NexusController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;
		private readonly string _connectionString;
		private readonly int MapSizeX = 100;

		public NexusController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
			_connectionString = config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
		}

		[HttpPost("/Nexus", Name = "GetBaseData")]
		public async Task<IActionResult> GetBaseData([FromBody] NexusRequest req)
		{
			_ = _log.Db($"POST /Nexus ({req.UserId}, {req.Nexus?.CoordsX}:{req.Nexus?.CoordsY}), current base gold : {req.Nexus?.Gold}", req.UserId, "NEXUS");

			if (req.UserId == 0)
			{
				return BadRequest("Invalid user data.");
			}

			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();
				using (var transaction = connection.BeginTransaction())
				{
					try
					{
						if (req.Nexus == null)
						{
							req.Nexus = await GetUserFirstBase(req.UserId, connection, transaction);
						}

						if (req.Nexus == null)
						{
							return NotFound();
						}
						await RecalculateNexusGold(connection, transaction);

						NexusBase? nexusBase = await GetNexusBase(req.Nexus?.CoordsX, req.Nexus?.CoordsY, connection, transaction);
						NexusBaseUpgrades? nexusBaseUpgrades = await GetNexusBaseUpgrades(nexusBase, connection, transaction);
						//NexusUnits? nexusUnits = await GetNexusUnits(nexusBase, false, connection, transaction);
						List<NexusUnitsPurchased>? nexusUnitPurchasesList = await GetNexusUnitPurchases(nexusBase, connection, transaction);
						List<NexusAttackSent>? nexusAttacksSent = await GetNexusAttacksSent(nexusBase, false, connection, transaction);
						List<NexusAttackSent>? nexusAttacksIncoming = await GetNexusAttacksIncoming(nexusBase, false, false, connection, transaction);
						List<NexusAttackSent>? nexusDefencesSent = await GetNexusDefencesSent(nexusBase, false, connection, transaction);
						List<NexusAttackSent>? nexusDefencesIncoming = await GetNexusDefencesIncoming(nexusBase, false, true, connection, transaction);
						NexusUnits? nexusUnits = await GetNexusUnits(nexusBase, false, connection, transaction);
						List<NexusUnitUpgrades>? nexusUnitUpgrades = await GetNexusUnitUpgrades(nexusBase, connection, transaction);
						await transaction.CommitAsync();

						return Ok(
								new
								{
									nexusBase = nexusBase ?? new NexusBase(),
									nexusBaseUpgrades = nexusBaseUpgrades ?? new NexusBaseUpgrades(),
									//nexusUnits = nexusUnits ?? new NexusUnits(),
									nexusUnitsPurchasedList = nexusUnitPurchasesList ?? new List<NexusUnitsPurchased>(),
									nexusAttacksSent,
									nexusDefencesSent,
									nexusAttacksIncoming,
									nexusDefencesIncoming,
									nexusUnitUpgrades,
									nexusUnits,
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


		[HttpPost("/Nexus/SetBaseName", Name = "SetBaseName")]
		public async Task<IActionResult> SetBaseName([FromBody] NexusBaseNameRequest request)
		{ 
			using (MySqlConnection conn = new MySqlConnection(_connectionString))
			{
				await conn.OpenAsync();

				using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
				{
					try
					{
						// Calculate the remaining duration and update the defense details
						string updateSql = @"
                        UPDATE 
                            maxhanna.nexus_bases
                        SET
                            base_name = @BaseName
                        WHERE 
                            coords_x = @CoordsX
                        AND coords_y = @CoordsY
                        LIMIT 1;";

						var parameters = new Dictionary<string, object?>
												{
														{ "@BaseName", request.BaseName },
														{ "@CoordsX", request.Nexus.CoordsX },
														{ "@CoordsY",request.Nexus.CoordsY }
												};

						await ExecuteInsertOrUpdateOrDeleteAsync(updateSql, parameters, conn, transaction);

						await transaction.CommitAsync();
						return Ok($"Base successfully renamed {request.BaseName}.");
					}
					catch (Exception ex)
					{ 
						await transaction.RollbackAsync();
						return StatusCode(500, "An error occurred while processing your request. " + ex.Message);
					}
				}
			}
		} 


		[HttpPost("/Nexus/GetNumberOfBases", Name = "GetNumberOfBases")]
		public async Task<IActionResult> GetNumberOfBases([FromBody] int? userId)
		{ 
			MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
			try
			{
				conn.Open();

				string sql = $"SELECT COUNT(*) as count FROM maxhanna.nexus_bases {(userId != null ? "WHERE user_id = @UserId" : "")};";

				MySqlCommand cmd = new MySqlCommand(sql, conn);
				if (userId != null)
				{ 
					cmd.Parameters.AddWithValue("@UserId", userId);
				}

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (reader.Read())
					{
						return Ok(Convert.ToInt32(reader["count"]));
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while processing the POST request for message history." + ex.Message, userId, "NEXUS", true);
			}
			finally
			{
				conn.Close();
			}
			return StatusCode(500, "An error occurred while processing the request.");
		}

		[HttpPost("/Nexus/GetAllBuildingUpgradesList", Name = "GetAllBuildingUpgradesList")]
		public async Task<IActionResult> GetAllBuildingUpgradesList()
		{ 
			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();
				using (var transaction = connection.BeginTransaction())
				{
					try
					{

						var availableUpgrades = await GetAllBuildingUpgradeList(connection, transaction);

						await transaction.CommitAsync();
						return Ok(availableUpgrades);
					}
					catch (Exception ex)
					{
						await transaction.RollbackAsync();
						return StatusCode(500, "Internal server error: " + ex.Message);
					}
				}
			}
		}

		[HttpPost("/Nexus/GetAllBasesUnits", Name = "GetAllBasesUnits")]
		public async Task<IActionResult> GetAllBasesUnits([FromBody] int userId)
		{
			//_ = _log.Db($"POST /Nexus/GetAllBasesUnits for user: {user?.Id ?? 0}");


			using (var connection = new MySqlConnection(_connectionString))
			{
				await connection.OpenAsync();
				using (var transaction = connection.BeginTransaction())
				{
					try
					{
						var availableUnits = await GetAllBasesUnitsList(userId, connection, transaction);

						await transaction.CommitAsync();
						return Ok(availableUnits);
					}
					catch (Exception ex)
					{
						await transaction.RollbackAsync();
						return StatusCode(500, "Internal server error: " + ex.Message);
					}
				}
			}
		}

		[HttpPost("/Nexus/UpdatePlayerColor", Name = "UpdatePlayerColor")]
		public async Task<IActionResult> UpdatePlayerColor([FromBody] NexusColorRequest req)
		{
			try
			{
				string sql = @"
					INSERT INTO nexus_colors (user_id, color)
					VALUES (@userId, @color)
					ON DUPLICATE KEY UPDATE color = @color;";

				using (var connection = new MySqlConnection(_connectionString))
				{
					await connection.OpenAsync();

					using (var command = new MySqlCommand(sql, connection))
					{
						command.Parameters.AddWithValue("@userId", req.UserId);
						command.Parameters.AddWithValue("@color", req.Color);

						await command.ExecuteNonQueryAsync();
					}
				}

				return Ok("Color updated successfully.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("Exception in UpdatePlayerColor: " + ex.Message, req.UserId, "NEXUS", true);
				return StatusCode(500, "Internal server error.");
			}
		}

		[HttpPost("/Nexus/GetPlayerColor", Name = "GetPlayerColor")]
		public async Task<IActionResult> GetPlayerColor([FromBody] int? userId)
		{
			try
			{
				string sql;
				bool getAll = !userId.HasValue;

				if (getAll)
				{
					sql = "SELECT user_id, color FROM nexus_colors;";
				}
				else
				{
					sql = "SELECT user_id, color FROM nexus_colors WHERE user_id = @userId LIMIT 1;";
				}

				using (var connection = new MySqlConnection(_connectionString))
				{
					await connection.OpenAsync();

					using (var command = new MySqlCommand(sql, connection))
					{
						if (!getAll)
						{
							command.Parameters.AddWithValue("@userId", userId);
						}

						using (var reader = await command.ExecuteReaderAsync())
						{
							var colorData = new Dictionary<int, string>();

							while (await reader.ReadAsync())
							{
								int id = reader.GetInt32(0);
								string color = reader.GetString(1);
								colorData[id] = color;
							}

							if (colorData.Count == 0)
							{
								return NotFound(new { error = getAll ? "No colors found." : "Color not found for this user." });
							}

							return Ok(colorData);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Exception in GetPlayerColor: " + ex.Message, userId, "NEXUS", true);
				return StatusCode(500, new { error = "Internal server error." });
			}
		}


		[HttpPost("/Nexus/GetAllMiningSpeeds", Name = "GetAllMiningSpeeds")]
		public async Task<IActionResult> GetAllMiningSpeeds()
		{ 
			List<NexusMiningSpeed> speeds = new List<NexusMiningSpeed>();
			MySqlConnection conn = new MySqlConnection(_connectionString);

			await conn.OpenAsync();
			MySqlTransaction transaction = await conn.BeginTransactionAsync();

			try
			{

				// Insert new base at the available location
				string sql = @"
                    SELECT id, mines_level, speed 
                    FROM 
                        maxhanna.nexus_mining_speed;";


				MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{

						NexusMiningSpeed tmpMiningSpeed = new NexusMiningSpeed();
						tmpMiningSpeed.Id = reader.IsDBNull(reader.GetOrdinal("id")) ? 0 : reader.GetInt32(reader.GetOrdinal("id"));
						tmpMiningSpeed.MinesLevel = reader.IsDBNull(reader.GetOrdinal("mines_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("mines_level"));
						tmpMiningSpeed.Speed = reader.IsDBNull(reader.GetOrdinal("speed")) ? 0 : reader.GetDecimal(reader.GetOrdinal("speed"));
						speeds.Add(tmpMiningSpeed);
					}
				}

				await transaction.CommitAsync();
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				_ = _log.Db("An error occurred getting mining speeds." + ex.Message , null, "NEXUS", true);
				return StatusCode(500, "Internal server error");
			}
			finally
			{
				await conn.CloseAsync();
			}

			return Ok(speeds);
		}

		[HttpPost("/Nexus/RefreshGold", Name = "RefreshGold")]
		public async Task<IActionResult> RefreshGold()
		{
			//_ = _log.Db($"POST /Nexus/RefreshGold"); 
			MySqlConnection conn = new MySqlConnection(_connectionString);

			await conn.OpenAsync();
			MySqlTransaction transaction = await conn.BeginTransactionAsync();

			try
			{
				await RecalculateNexusGold(conn, transaction);
				await transaction.CommitAsync();
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				_ = _log.Db("An error occurred updating nexus gold for all bases. " + ex.Message, null, "NEXUS", true);
				return StatusCode(500, "An error occurred updating nexus gold for all bases");
			}
			finally
			{
				await conn.CloseAsync();
			}

			return Ok();
		}

		[HttpPost("/Nexus/Start", Name = "Start")]
		public async Task<IActionResult> Start([FromBody] int userId)
		{
			using MySqlConnection conn = new MySqlConnection(_connectionString);
			try
			{
				await conn.OpenAsync();

				// Check if the user already has a base
				string checkSql = "SELECT COUNT(*) FROM nexus_bases WHERE user_id = @UserId;";
				using (var checkCmd = new MySqlCommand(checkSql, conn))
				{
					checkCmd.Parameters.AddWithValue("@UserId", userId);
					var result = await checkCmd.ExecuteScalarAsync();
					if (Convert.ToInt32(result) > 0)
					{
						return new ConflictObjectResult("User already has a base.");
					}
				}

				// Get occupied spots
				string occupiedSpotsSql = "SELECT coords_x, coords_y FROM nexus_bases;";
				var occupiedSpots = new HashSet<(int X, int Y)>();
				using (var occupiedCmd = new MySqlCommand(occupiedSpotsSql, conn))
				{
					using var reader = await occupiedCmd.ExecuteReaderAsync();
					while (await reader.ReadAsync())
					{
						occupiedSpots.Add((reader.GetInt32("coords_x"), reader.GetInt32("coords_y")));
					}
				}

				// Generate all possible coordinates and find available spots
				var allSpots = Enumerable.Range(0, MapSizeX)
					.SelectMany(x => Enumerable.Range(0, MapSizeX).Select(y => (X: x, Y: y)));
				var availableSpots = allSpots
					.Where(spot => !occupiedSpots.Contains((spot.X, spot.Y)))
					.ToList();

				if (!availableSpots.Any())
				{
					await _log.Db("No available spots to place the base.", userId);
					return StatusCode(500, "No available spots to place the base.");
				}

				// Select a random available spot
				var random = new Random();
				var selectedSpot = availableSpots[random.Next(availableSpots.Count)];
				int selectedX = selectedSpot.X;
				int selectedY = selectedSpot.Y;

				// Insert new base and assign random color
				string insertSql = @"
					INSERT INTO nexus_bases (user_id, gold, base_name, coords_x, coords_y)
					VALUES (@UserId, 200, (SELECT u.username FROM users AS u WHERE u.id = user_id), @CoordsX, @CoordsY);

					INSERT INTO nexus_colors (user_id, color)
					VALUES (@UserId, LPAD(HEX(FLOOR(RAND() * 16777215)), 6, '0'))
					ON DUPLICATE KEY UPDATE color = color;

					SELECT @CoordsX AS coords_x, @CoordsY AS coords_y;";

				using var insertCmd = new MySqlCommand(insertSql, conn);
				insertCmd.Parameters.AddWithValue("@UserId", userId);
				insertCmd.Parameters.AddWithValue("@BaseName", "Anonymous"); // Replace with actual username if available
				insertCmd.Parameters.AddWithValue("@CoordsX", selectedX);
				insertCmd.Parameters.AddWithValue("@CoordsY", selectedY);

				using (var insertReader = await insertCmd.ExecuteReaderAsync())
				{
					if (await insertReader.ReadAsync())
					{
						int coordsX = insertReader.GetInt32("coords_x");
						int coordsY = insertReader.GetInt32("coords_y");
						return new OkObjectResult(new { X = coordsX, Y = coordsY });
					}
					else
					{
						return StatusCode(500, "Failed to insert new base. Try again.");
					}
				}
			}
			catch (Exception ex)
			{
				await _log.Db($"An error occurred while starting the game for player {userId}. {ex.Message}", userId, "NEXUS", true);
				return StatusCode(500, "Internal server error");
			}
		}


		[HttpPost("/Nexus/GetMap", Name = "GetMap")]
		public async Task<IActionResult> GetMap()
		{
			//_ = _log.Db($"POST /Nexus/GetMap for player {user.Id}");
			List<NexusBase> bases = new List<NexusBase>();
			MySqlConnection conn = new MySqlConnection(_connectionString);

			await conn.OpenAsync();
			MySqlTransaction transaction = await conn.BeginTransactionAsync();

			try
			{

				// Insert new base at the available location
				string sql = @"
                    SELECT 
                        n.user_id, 
						n.base_name, 
						u.username, 
						n.coords_x, 
						n.coords_y, 
						n.gold, 
						n.command_center_level, 
						n.engineering_bay_level, 
						n.mines_level, 
						n.factory_level, 
						n.starport_level, 
						n.warehouse_level,
						n.supply_depot_level,
						n.conquered, 
						udp.file_id
                    FROM 
                        maxhanna.nexus_bases n
                    LEFT JOIN 
                        maxhanna.users u on u.id = n.user_id
                    LEFT JOIN 
                        maxhanna.user_display_pictures udp on udp.user_id = n.user_id;";


				MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						FileEntry? dp = null;
						if (!reader.IsDBNull(reader.GetOrdinal("file_id")))
						{
							dp = new FileEntry();
							dp.Id = reader.GetInt32(reader.GetOrdinal("file_id"));
						}
						NexusBase tmpBase = new NexusBase();
						tmpBase.CoordsX = reader.IsDBNull(reader.GetOrdinal("coords_x")) ? 0 : reader.GetInt32(reader.GetOrdinal("coords_x"));
						tmpBase.CoordsY = reader.IsDBNull(reader.GetOrdinal("coords_y")) ? 0 : reader.GetInt32(reader.GetOrdinal("coords_y"));
						tmpBase.BaseName = reader.IsDBNull(reader.GetOrdinal("base_name")) ? null : reader.GetString(reader.GetOrdinal("base_name"));
						tmpBase.CommandCenterLevel = reader.IsDBNull(reader.GetOrdinal("command_center_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("command_center_level"));
						tmpBase.MinesLevel = reader.IsDBNull(reader.GetOrdinal("mines_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("mines_level"));
						tmpBase.EngineeringBayLevel = reader.IsDBNull(reader.GetOrdinal("engineering_bay_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("engineering_bay_level"));
						tmpBase.FactoryLevel = reader.IsDBNull(reader.GetOrdinal("factory_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("factory_level"));
						tmpBase.StarportLevel = reader.IsDBNull(reader.GetOrdinal("starport_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("starport_level"));
						tmpBase.WarehouseLevel = reader.IsDBNull(reader.GetOrdinal("warehouse_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("warehouse_level"));
						tmpBase.SupplyDepotLevel = reader.IsDBNull(reader.GetOrdinal("supply_depot_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("supply_depot_level"));
						tmpBase.Gold = reader.IsDBNull(reader.GetOrdinal("gold")) ? 0 : reader.GetDecimal(reader.GetOrdinal("gold"));
						tmpBase.Conquered = reader.IsDBNull(reader.GetOrdinal("conquered")) ? DateTime.MinValue : reader.GetDateTime(reader.GetOrdinal("conquered"));
						tmpBase.User =
								new User(
									reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32(reader.GetOrdinal("user_id")), 
									reader.IsDBNull(reader.GetOrdinal("username")) ? "Anonymous" : reader.GetString(reader.GetOrdinal("username")),
									dp);
						bases.Add(tmpBase);
					}
				}

				await transaction.CommitAsync();
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				_ = _log.Db("An error occurred while Getting the map. " + ex.Message, null, "NEXUS", true);
				return StatusCode(500, "Internal server error");
			}
			finally
			{
				await conn.CloseAsync();
			}

			return Ok(bases);
		}
		
		[HttpPost("/Nexus/HasRecentFirstConquest", Name = "HasRecentFirstConquest")]
		public async Task<IActionResult> HasRecentFirstConquest([FromBody] int userId)
		{
			await using var conn = new MySqlConnection(_connectionString);
			await conn.OpenAsync();

			await using var cmd = new MySqlCommand(@"
				SELECT conquered
				FROM   maxhanna.nexus_bases
				WHERE  user_id = @userId
				AND  conquered IS NOT NULL
				ORDER  BY conquered ASC
				LIMIT  1;", conn);

			cmd.Parameters.AddWithValue("@userId", userId);

			try
			{
				var result = await cmd.ExecuteScalarAsync();

				// No conquered‑date found ⇒ user never conquered a base.
				if (result is null || result == DBNull.Value)
					return Ok(false);

				var firstConquered = (DateTime)result;

				// Compare in UTC to avoid daylight/time‑zone surprises.
				bool isLessThan3Days =
					firstConquered.ToUniversalTime() > DateTime.UtcNow.AddDays(-3);

				return Ok(isLessThan3Days);   // returns true / false
			}
			catch (Exception ex)
			{
				await _log.Db("Error checking first conquest date: " + ex.Message,
							  null, "NEXUS", true);
				return StatusCode(500, "Internal server error");
			}
			finally
			{
				await conn.CloseAsync();
			}
		}

		[HttpPost("/Nexus/GetBattleReports", Name = "GetBattleReports")]
		public async Task<IActionResult> GetBattleReports([FromBody] BattleReportRequest request)
		{ 
			var paginatedReports = await GetAllBattleReports(request.UserId, request.TargetBase, request.TargetUserId, request.PageNumber, request.PageSize, request.SearchDefenceReports ?? false, request.SearchAttackReports ?? false, null, null);
			return Ok(paginatedReports);
		}

		[HttpPost("/Nexus/GetMinesInfo", Name = "GetMinesInfo")]
		public async Task<IActionResult> GetMinesInfo([FromBody] NexusRequest request)
		{ 
			if (request.Nexus == null)
			{
				return Ok(0);
			}
			return Ok(await GetMiningSpeedForNexus(request.Nexus, null, null));
		}

		private async Task<decimal> GetMiningSpeedForNexus(NexusBase? nexusBase, MySqlConnection? connection, MySqlTransaction? transaction)
		{
			if (nexusBase == null)
			{
				return 0;
			}
			decimal speed = Decimal.One;

			bool ownConnection = false;
			bool ownTransaction = false;

			try
			{
				if (connection == null)
				{
					connection = new MySqlConnection(_connectionString);
					await connection.OpenAsync();
					ownConnection = true;
				}

				if (transaction == null)
				{
					transaction = await connection.BeginTransactionAsync();
					ownTransaction = true;
				}

				string sql = @"
                    SELECT 
                        speed
                    FROM 
                        maxhanna.nexus_mining_speed s
                    LEFT JOIN 
                        maxhanna.nexus_bases n ON s.mines_level = n.mines_level 
                    WHERE 
                        n.coords_x = @CoordsX 
                    AND n.coords_y = @CoordsY";

				MySqlCommand cmd = new MySqlCommand(sql, connection, transaction);
				cmd.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
				cmd.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						speed = reader.IsDBNull(reader.GetOrdinal("speed")) ? 0 : reader.GetDecimal(reader.GetOrdinal("speed"));
						break;
					}
				}

				if (ownTransaction)
				{
					await transaction.CommitAsync();
				}
			}
			catch (Exception ex)
			{
				if (ownTransaction && transaction != null)
				{
					await transaction.RollbackAsync();
				}

				_ = _log.Db($"An error occurred while GetMiningSpeedForNexus. " + ex.Message, nexusBase.User?.Id, "NEXUS", true);
			}
			finally
			{
				if (ownConnection && connection != null)
				{
					await connection.CloseAsync();
					await connection.DisposeAsync();
				}

				if (ownTransaction && transaction != null)
				{
					await transaction.DisposeAsync();
				}
			}
			return speed;
		}

		[HttpPost("/Nexus/GetUnitStats", Name = "GetUnitStats")]
		public async Task<IActionResult> GetUnitStats()
		{ 
			List<UnitStats> unitStats = await GetUnitStatsFromDB(null, null);

			return Ok(unitStats);
		}

		[HttpPost("/Nexus/GetUnitUpgradeStats", Name = "GetUnitUpgradeStats")]
		public async Task<IActionResult> GetUnitUpgradeStats()
		{ 
			List<UnitUpgradeStats> unitStats = await GetUnitUpgradeStatsFromDB(null, null);

			return Ok(unitStats);
		}

		[HttpPost("/Nexus/PurchaseUnit", Name = "PurchaseUnit")]
		public async Task<IActionResult> PurchaseUnit([FromBody] NexusPurchaseUnitRequest request)
		{ 
			string unitType = "";
			if (request.UserId == 0 || request.PurchaseAmount == 0)
			{
				return BadRequest("Invalid purchase request.");
			}

			try
			{
				using (MySqlConnection conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();

					using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
					{
						try
						{
							await RecalculateNexusGold(conn, transaction);
							//_ = _log.Db("Updated Gold");
							List<UnitStats> unitStats = await GetUnitStatsFromDB(request.UnitId, null);
							if (unitStats == null || unitStats.Count <= 0)
							{
								return NotFound("Unit not found.");
							}

							if (unitStats.First().UnitType == "glitcher")
							{
								NexusUnits? currentUnits = await GetNexusUnits(request.Nexus, false, conn, transaction);
								if (currentUnits != null && currentUnits.GlitcherTotal > 0)
								{
									return BadRequest("Only one glitcher allowed per base.");
								}
							}

							UnitStats unit = unitStats.First(x => x.UnitId == request.UnitId);
							int unitCost = unit.Cost;
							int unitSupply = unit.Supply;
							unitType = unit.UnitType ?? "";

							//_ = _log.Db($"Unit purchased: {unitType}, unitSupply: {unitSupply}, unitCost: {unitCost}, totalCost: {unitCost * request.PurchaseAmount}");
							var (currentGold, totalSupplyUsed) = await GetNexusGoldAndSupply(request.Nexus, conn, transaction);
							int currentSupplyUsed = await CalculateUsedNexusSupply(request.Nexus, conn, transaction);
							//_ = _log.Db($"before purchase : {unitType}, currentGold: {currentGold}, currentSupplyUsed: {currentSupplyUsed}");

							currentGold -= (unitCost * request.PurchaseAmount);
							var supplyCost = (unitSupply * request.PurchaseAmount);
							totalSupplyUsed = (supplyCost + currentSupplyUsed);

							//_ = _log.Db($"After Unit purchased: {unitType}, totalSupplyUsed: {totalSupplyUsed}, currentGold: {currentGold}, supplyCost: {supplyCost}, currentSupplyUsed: {currentSupplyUsed}");

							if (currentGold < 0)
							{
								return BadRequest("Not Enough Gold");
							}
							if (totalSupplyUsed < 0)
							{
								return BadRequest("Not Enough Supply");
							}
							List<NexusUnitsPurchased>? nup = await GetNexusUnitPurchases(request.Nexus, conn, transaction);
							int factoryPurchases = 0;
							int starportPurchases = 0;
							if (nup != null && nup.Count > 0)
							{
								foreach (var purchase in nup)
								{
									//_ = _log.Db("unitIdPurchasd: " + purchase.UnitIdPurchased);
									var stats = unitStats.FirstOrDefault(x => x.UnitId == purchase.UnitIdPurchased);
									if (stats != null && (stats.UnitType == "marine" || stats.UnitType == "goliath" || stats.UnitType == "siege_tank"))
									{
										factoryPurchases++;
									}
									else if (stats != null && (stats.UnitType == "scout" || stats.UnitType == "wraith" || stats.UnitType == "battlecruiser"))
									{
										starportPurchases++;
									}
								}
							}
							//_ = _log.Db("before factory and starport checks");

							if (factoryPurchases > 0 && request.Nexus.FactoryLevel <= factoryPurchases)
							{
								return BadRequest("Factory Level Insufficient");
							}
							else if (starportPurchases > 0 && request.Nexus.StarportLevel <= starportPurchases)
							{
								return BadRequest("Starport Level Insufficient");
							}
							//_ = _log.Db("before update nexus gold and supply");
							await UpdateNexusGoldAndSupply(request.Nexus.CoordsX, request.Nexus.CoordsY, currentGold, totalSupplyUsed, conn, transaction);
							//_ = _log.Db("current gold : after the update: " + currentGold);
							await UpdateNexusUnitPurchases(request.Nexus.CoordsX, request.Nexus.CoordsY, request.UnitId, request.PurchaseAmount, conn, transaction);

							await transaction.CommitAsync();
						}
						catch (Exception ex)
						{
							_ = _log.Db($"Error while purchasing units: {ex.Message}", request.Nexus.User?.Id, "NEXUS", true);
							await transaction.RollbackAsync();
							return BadRequest(ex.Message);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error with database connection: {ex.Message}", request.Nexus.User?.Id, "NEXUS", true);
				return StatusCode(500, "Database error");
			}

			return Ok($"Purchased {request.PurchaseAmount} {unitType}.");
		}

		[HttpPost("/Nexus/GetBuildingUpgrades", Name = "GetBuildingUpgrades")]
		public async Task<IActionResult> GetBuildingUpgrades([FromBody] NexusRequest request)
		{ 
			if (request.Nexus?.User?.Id == null || request.Nexus.User.Id == 0)
			{
				return BadRequest("Invalid user data.");
			}
			if (request.Nexus == null)
			{
				return NotFound("User base not found.");
			}
			var availableUpgrades = await GetBuildingUpgradeList(request.Nexus, null, null);

			return Ok(new { Upgrades = availableUpgrades });
		}


		[HttpPost("/Nexus/MassPurchase", Name = "MassPurchase")]
		public async Task<IActionResult> MassPurchase([FromBody] NexusMassPurchaseRequest request)
		{
			//_ = _log.Db($"POST /Nexus/MassPurchase for player ({request.User.Id})");

			if (request.UserId == 0)
			{
				return BadRequest("Invalid user data.");
			}
			if (string.IsNullOrEmpty(request.Upgrade))
			{
				return BadRequest("Requested unit invalid.");
			}
			List<NexusBase> upgradedBases = new List<NexusBase>();
			try
			{
				using (MySqlConnection conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();

					using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
					{
						try
						{

							upgradedBases = await MassPurchaseUnits(request.Upgrade, request.UserId, conn, transaction);

							await transaction.CommitAsync();
						}
						catch (Exception ex)
						{
							_ = _log.Db($"Error while MassPurchase: {ex.Message}", request.UserId, "NEXUS", true);
							await transaction.RollbackAsync();
							return BadRequest(ex.Message);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error on MassPurchase. {ex.Message}", request.UserId, "NEXUS", true);
				return StatusCode(500, "Database error");
			}
			return Ok(upgradedBases);
		}


		[HttpPost("/Nexus/UpgradeAll", Name = "UpgradeAll")]
		public async Task<IActionResult> UpgradeAll([FromBody] NexusMassPurchaseRequest request)
		{
			//_ = _log.Db($"POST /Nexus/UpgradeAll for player ({request.User.Id})");

			if (request.UserId == 0)
			{
				return BadRequest("Invalid user data.");
			}
			if (string.IsNullOrEmpty(request.Upgrade))
			{
				return BadRequest("Requested upgrade invalid.");
			}
			List<NexusBase> upgradedBases = new List<NexusBase>();
			try
			{
				using (MySqlConnection conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();

					using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
					{
						try
						{
							upgradedBases = await MassUpgradeBuildings(request.Upgrade, request.UserId, conn, transaction);

							await transaction.CommitAsync();
						}
						catch (Exception ex)
						{
							_ = _log.Db($"Error while purchasing upgrades: {ex.Message}", request.UserId, "NEXUS", true);
							await transaction.RollbackAsync();
							return BadRequest(ex.Message);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error with database connection: {ex.Message}", request.UserId, "NEXUS", true);
				return StatusCode(500, "Database error");
			}
			return Ok(upgradedBases);
		}

		[HttpPost("/Nexus/DeleteReport", Name = "DeleteReport")]
		public async Task<IActionResult> DeleteReportRequest([FromBody] NexusDeleteReportRequest request)
		{  
			if (request.UserId == 0)
			{
				return BadRequest("Invalid user data.");
			}

			try
			{
				using (MySqlConnection conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();

					using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
					{
						try
						{
							if (request.BattleIds != null)
							{
								await DeleteReport(request.UserId, request.BattleIds, conn, transaction);
							}
							else
							{
								await DeleteAllUserReports(request.UserId, conn, transaction);
							}

							await transaction.CommitAsync();
						}
						catch (Exception ex)
						{
							_ = _log.Db($"Error while purchasing units: {ex.Message}.", request.UserId, "NEXUS", true);
							await transaction.RollbackAsync();
							return BadRequest(ex.Message);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error with database connection: {ex.Message}.", request.UserId, "NEXUS", true);
				return StatusCode(500, "Database error");
			}
			return Ok($"Report {request.BattleIds} deleted.");
		}


		[HttpPost("/Nexus/Research", Name = "Research")]
		public async Task<IActionResult> Research([FromBody] NexusResearchRequest request)
		{ 
			try
			{
				using (MySqlConnection conn = new MySqlConnection(_connectionString))
				{
					await conn.OpenAsync();

					using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
					{
						try
						{
							await RecalculateNexusGold(conn, transaction);
							NexusBase? nexus = await GetNexusBase(request.NexusBase.CoordsX, request.NexusBase.CoordsY, conn, transaction);

							// Check if Nexus base is null before proceeding
							if (nexus == null)
							{
								return NotFound("Nexus base not found.");
							}

							// Retrieve unit upgrade stats and unit stats in parallel
							List<UnitUpgradeStats> unitUpgradeStats = await GetUnitUpgradeStatsFromDB(conn, transaction);
							List<UnitStats> unitStats = await GetUnitStatsFromDB(request.Unit.UnitId, null);

							// Check if upgrade stats and unit stats are found
							if (unitUpgradeStats == null || unitUpgradeStats.Count == 0)
							{
								return NotFound("Unit upgrades not found.");
							} 
							UnitStats? upgradeUnit = unitStats[0];  
							if (unitStats == null || unitStats.Count == 0)
							{
								return NotFound("Unit stats not found.");
							}
							if (upgradeUnit == null)
							{
								return NotFound("Unit not found.");
							}
							int unitLevel = upgradeUnit?.UnitType switch
							{
								"marine" => nexus.MarineLevel,
								"goliath" => nexus.GoliathLevel,
								"siege_tank" => nexus.SiegeTankLevel,
								"scout" => nexus.ScoutLevel,
								"wraith" => nexus.WraithLevel,
								"battlecruiser" => nexus.BattlecruiserLevel,
								"glitcher" => nexus.GlitcherLevel,
								_ => 0 // Default if the unit type does not match
							};

							//Make sure the unit upgrade isnt already queued.
							List<NexusUnitUpgrades> unitUpgrades = await GetNexusUnitUpgrades(request.NexusBase, conn, transaction);
							if (unitUpgrades.Any(x => x.UnitIdUpgraded == upgradeUnit?.UnitId))
							{
								return BadRequest("You must wait until the current upgrade finishes.");
							}
							 
							nexus.Gold -= ((upgradeUnit?.Cost ?? 1) * 10 * (unitLevel + 1));

							if (nexus.Gold < 0)
							{
								return BadRequest("Not Enough Gold");
							}
							await UpdateNexusGoldAndSupply(nexus.CoordsX, nexus.CoordsY, nexus.Gold, null, conn, transaction);
							await ResearchUnit(nexus, upgradeUnit, conn, transaction);
							await transaction.CommitAsync();
						}
						catch (Exception ex)
						{
							_ = _log.Db($"Error while purchasing units: {ex.Message}.", request.NexusBase.User?.Id, "NEXUS", true);
							await transaction.RollbackAsync();
							return BadRequest(ex.Message);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error with database connection: {ex.Message}.", request.NexusBase.User?.Id, "NEXUS", true);
				return BadRequest("Something went wrong: " + ex.Message);
			}
			//substract money from unit.cost * 10 * ((unit.unitLevel ? unit.unitLevel : 0) + 1

			return Ok($"Research started.");
		}

		[HttpPost("/Nexus/UpgradeMines", Name = "UpgradeMines")]
		public Task<IActionResult> UpgradeMines([FromBody] NexusRequest req)
		{
			return UpgradeBuilding(req.UserId, "mines", req.Nexus);
		}

		[HttpPost("/Nexus/UpgradeFactory", Name = "UpgradeFactory")]
		public Task<IActionResult> UpgradeFactory([FromBody] NexusRequest req)
		{
			return UpgradeBuilding(req.UserId, "factory", req.Nexus);
		}

		[HttpPost("/Nexus/UpgradeStarport", Name = "UpgradeStarport")]
		public Task<IActionResult> UpgradeStarport([FromBody] NexusRequest req)
		{
			return UpgradeBuilding(req.UserId, "starport", req.Nexus);
		}


		[HttpPost("/Nexus/UpgradeEngineeringBay", Name = "UpgradeEngineeringBay")]
		public Task<IActionResult> UpgradeEngineeringBay([FromBody] NexusRequest req)
		{
			return UpgradeBuilding(req.UserId, "engineering_bay", req.Nexus);
		}


		[HttpPost("/Nexus/UpgradeWarehouse", Name = "UpgradeWarehouse")]
		public Task<IActionResult> UpgradeWarehouse([FromBody] NexusRequest req)
		{
			return UpgradeBuilding(req.UserId, "warehouse", req.Nexus);
		}

		[HttpPost("/Nexus/UpgradeNexus", Name = "UpgradeNexus")]
		public Task<IActionResult> UpgradeNexus([FromBody] NexusRequest req)
		{
			return UpgradeBuilding(req.UserId, "command_center", req.Nexus);
		}

		[HttpPost("/Nexus/UpgradeSupplyDepot", Name = "UpgradeSupplyDepot")]
		public Task<IActionResult> UpgradeSupplyDepot([FromBody] NexusRequest req)
		{
			return UpgradeBuilding(req.UserId, "supply_depot", req.Nexus);
		}

		[HttpPost("/Nexus/Engage", Name = "Engage")]
		public async Task<IActionResult> Engage([FromBody] NexusEngagementRequest req)
		{
			//_ = _log.Db($"POST /Nexus/Engage for player ({req.User.Id})");
			if (req.OriginNexus == null) { return BadRequest("Origin must be defined!"); }
			if (req.DestinationNexus == null) { return BadRequest("Destination must be defined!"); }

			using (MySqlConnection conn = new MySqlConnection(_connectionString))
			{
				await conn.OpenAsync();

				using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
				{
					try
					{
						//_ = _log.Db($@"Checking if base has enough units to send the attack.");
						bool canSend = await DoesBaseHaveEnoughUnitsToSendAttack(req.OriginNexus, req.UnitList, true, null, null);
						if (canSend)
						{
							//_ = _log.Db("Sending the attack...");
							await SendAttack(req.OriginNexus, req.DestinationNexus, req.OriginNexus.User, req.DestinationNexus.User, req.UnitList, conn, transaction);
						}
						else
						{
							//_ = _log.Db("Not enough units.");
							return BadRequest("Not enough units.");
						}
						await transaction.CommitAsync();
					}
					catch (Exception ex)
					{
						_ = _log.Db("Engage ERROR: " + ex.Message, req.OriginNexus.User?.Id, "NEXUS", true);
						await transaction.RollbackAsync();
					}
				}
			}
			return Ok($"Attack sent to {"{" + req.DestinationNexus.CoordsX + "," + req.DestinationNexus.CoordsY + "}"}");
		}

		[HttpPost("/Nexus/Defend", Name = "Defend")]
		public async Task<IActionResult> Defend([FromBody] NexusEngagementRequest req)
		{
			//_ = _log.Db($"POST /Nexus/Defend for player ({req.User.Id})");
			if (req.OriginNexus == null) { return BadRequest("Origin must be defined!"); }
			if (req.DestinationNexus == null) { return BadRequest("Destination must be defined!"); }

			using (MySqlConnection conn = new MySqlConnection(_connectionString))
			{
				await conn.OpenAsync();

				using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
				{
					try
					{
						//_ = _log.Db($@"Checking if base has enough units to send the defence.");
						bool canSend = await DoesBaseHaveEnoughUnitsToSendAttack(req.OriginNexus, req.UnitList, true, null, null);
						if (canSend)
						{
							//_ = _log.Db($"Sending the defence from {req.OriginNexus.CoordsX}{req.OriginNexus.CoordsY} to {req.DestinationNexus.CoordsX}{req.DestinationNexus.CoordsY}...");
							await SendDefence(req.OriginNexus, req.DestinationNexus, req.UnitList, conn, transaction);
						}
						else
						{
							//_ = _log.Db("Not enough units.");
							return BadRequest("Not enough units.");
						}
						await transaction.CommitAsync();
					}
					catch (Exception ex)
					{
						_ = _log.Db("Defend ERROR: " + ex.Message, req.OriginNexus.User?.Id, "NEXUS", true);
						await transaction.RollbackAsync();
					}
				}
			}


			//first check if units being sent are valid


			return Ok($"Defence sent to {"{" + req.DestinationNexus.CoordsX + "," + req.DestinationNexus.CoordsY + "}"}");
		}


		[HttpPost("/Nexus/ReturnDefence", Name = "ReturnDefence")]
		public async Task<IActionResult> ReturnDefence([FromBody] NexusReturnDefenceRequest req)
		{
			if (req.DefenceId == 0)
			{
				return BadRequest("Invalid Defence Id");
			}

			using (MySqlConnection conn = new MySqlConnection(_connectionString))
			{
				await conn.OpenAsync();

				using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
				{
					try
					{
						// Calculate the remaining duration and update the defense details
						string updateSql = @"
                        UPDATE 
                            maxhanna.nexus_defences_sent
                        SET
                            duration = IF(arrived = 0, 
                                GREATEST(0, TIMESTAMPDIFF(SECOND, timestamp, CURRENT_TIMESTAMP())), 
                                duration),
                            destination_coords_x = origin_coords_x,
                            destination_coords_y = origin_coords_y,
                            destination_user_id = origin_user_id,
                            timestamp = CURRENT_TIMESTAMP(),
                            arrived = 0
                        WHERE 
                            id = @DefenceId";

						var parameters = new Dictionary<string, object?>
												{
														{ "@DefenceId", req.DefenceId }
												};

						await ExecuteInsertOrUpdateOrDeleteAsync(updateSql, parameters, conn, transaction);

						await transaction.CommitAsync();
						return Ok($"Units returning to base.");
					}
					catch (Exception ex)
					{
						_ = _log.Db("ReturnDefence ERROR: " + ex.Message, null, "NEXUS", true);
						await transaction.RollbackAsync();
						return StatusCode(500, "An error occurred while processing your request.");
					}
				}
			}
		}

		[HttpPost("/Nexus/ReturnAttack", Name = "ReturnAttack")]
		public async Task<IActionResult> ReturnAttack([FromBody] NexusReturnDefenceRequest req)
		{  
			if (req.DefenceId == 0)
			{
				return BadRequest("Invalid Attack Id");
			}

			using (MySqlConnection conn = new MySqlConnection(_connectionString))
			{
				await conn.OpenAsync();

				using (MySqlTransaction transaction = await conn.BeginTransactionAsync())
				{
					try
					{
						// Calculate the remaining duration and update the attack details
						string updateSql = @"
                            UPDATE 
                                maxhanna.nexus_attacks_sent
                            SET
                                duration = GREATEST(0, TIMESTAMPDIFF(SECOND, timestamp, CURRENT_TIMESTAMP())),
                                destination_coords_x = origin_coords_x,
                                destination_coords_y = origin_coords_y,
                                destination_user_id = origin_user_id,
                                timestamp = CURRENT_TIMESTAMP()
                            WHERE 
                                id = @DefenceId";

						var parameters = new Dictionary<string, object?>
												{
														{ "@DefenceId", req.DefenceId }
												};

						await ExecuteInsertOrUpdateOrDeleteAsync(updateSql, parameters, conn, transaction);
						await transaction.CommitAsync();
						return Ok("Units returning to base.");
					}
					catch (Exception ex)
					{
						_ = _log.Db("ReturnAttack ERROR: " + ex.Message, null, "NEXUS", true);
						await transaction.RollbackAsync();
						return StatusCode(500, "An error occurred while processing your request.");
					}
				}
			}
		}


		private async Task<List<object>> GetBuildingUpgradeList(NexusBase? nexusBase, MySqlConnection? connection, MySqlTransaction? transaction)
		{
			var availableUpgrades = new List<object>();

			if (nexusBase == null) return availableUpgrades;

			try
			{
				// Combining the queries for current levels and upgrade timestamps
				string sqlCurrentData = @"
                    SELECT 
                        nb.command_center_level, nb.mines_level, nb.supply_depot_level, nb.warehouse_level, 
                        nb.engineering_bay_level, nb.factory_level, nb.starport_level,
                        nbu.command_center_upgraded, nbu.mines_upgraded, nbu.supply_depot_upgraded, 
                        nbu.warehouse_upgraded, nbu.engineering_bay_upgraded, nbu.factory_upgraded, nbu.starport_upgraded
                    FROM 
                        nexus_bases nb
                    LEFT JOIN
                        nexus_base_upgrades nbu ON nb.coords_x = nbu.coords_x AND nb.coords_y = nbu.coords_y
                    WHERE 
                        nb.coords_x = @CoordsX AND nb.coords_y = @CoordsY";

				MySqlCommand cmdCurrentData = new MySqlCommand(sqlCurrentData, connection, transaction);
				cmdCurrentData.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
				cmdCurrentData.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

				var readerCurrentData = await cmdCurrentData.ExecuteReaderAsync();
				if (!await readerCurrentData.ReadAsync())
				{
					await readerCurrentData.CloseAsync();
					return availableUpgrades;
				}

				int currentCommandCenterLevel = readerCurrentData.GetInt32("command_center_level");
				int currentMinesLevel = readerCurrentData.GetInt32("mines_level");
				int currentSupplyDepotLevel = readerCurrentData.GetInt32("supply_depot_level");
				int currentFactoryLevel = readerCurrentData.GetInt32("factory_level");
				int currentEngineeringBayLevel = readerCurrentData.GetInt32("engineering_bay_level");
				int currentWarehouseLevel = readerCurrentData.GetInt32("warehouse_level");
				int currentStarportLevel = readerCurrentData.GetInt32("starport_level");

				DateTime? commandCenterUpgraded = readerCurrentData.IsDBNull(readerCurrentData.GetOrdinal("command_center_upgraded"))
						? null : readerCurrentData.GetDateTime("command_center_upgraded");
				DateTime? minesUpgraded = readerCurrentData.IsDBNull(readerCurrentData.GetOrdinal("mines_upgraded"))
						? null : readerCurrentData.GetDateTime("mines_upgraded");
				DateTime? supplyDepotUpgraded = readerCurrentData.IsDBNull(readerCurrentData.GetOrdinal("supply_depot_upgraded"))
						? null : readerCurrentData.GetDateTime("supply_depot_upgraded");
				DateTime? warehouseUpgraded = readerCurrentData.IsDBNull(readerCurrentData.GetOrdinal("warehouse_upgraded"))
						? null : readerCurrentData.GetDateTime("warehouse_upgraded");
				DateTime? engineeringBayUpgraded = readerCurrentData.IsDBNull(readerCurrentData.GetOrdinal("engineering_bay_upgraded"))
						? null : readerCurrentData.GetDateTime("engineering_bay_upgraded");
				DateTime? factoryUpgraded = readerCurrentData.IsDBNull(readerCurrentData.GetOrdinal("factory_upgraded"))
						? null : readerCurrentData.GetDateTime("factory_upgraded");
				DateTime? starportUpgraded = readerCurrentData.IsDBNull(readerCurrentData.GetOrdinal("starport_upgraded"))
						? null : readerCurrentData.GetDateTime("starport_upgraded");

				await readerCurrentData.CloseAsync();

				// Fetch all relevant data in a single query
				string sqlDurationsAndCosts = @"
                    SELECT 
                        b.type AS building_type, 
                        bs.building_level, 
                        bs.duration, 
                        bs.cost
                    FROM 
                        nexus_base_upgrade_stats bs
                    JOIN 
                        nexus_building_types b ON bs.building_type = b.id
                    WHERE 
                        b.type IN ('command_center', 'mines', 'supply_depot', 'warehouse', 'engineering_bay', 'factory', 'starport')";

				MySqlCommand cmdDurationsAndCosts = new MySqlCommand(sqlDurationsAndCosts, connection, transaction);
				var readerDurationsAndCosts = await cmdDurationsAndCosts.ExecuteReaderAsync();

				// Use dictionaries for faster lookups
				var durations = new Dictionary<string, Dictionary<int, int>>();
				var costs = new Dictionary<string, Dictionary<int, int>>();

				while (await readerDurationsAndCosts.ReadAsync())
				{
					string buildingType = readerDurationsAndCosts.GetString("building_type");
					int level = readerDurationsAndCosts.GetInt32("building_level");
					int duration = readerDurationsAndCosts.GetInt32("duration");
					int cost = readerDurationsAndCosts.GetInt32("cost");

					if (!durations.ContainsKey(buildingType))
					{
						durations[buildingType] = new Dictionary<int, int>();
					}
					if (!costs.ContainsKey(buildingType))
					{
						costs[buildingType] = new Dictionary<int, int>();
					}

					durations[buildingType][level] = duration;
					costs[buildingType][level] = cost;
				}

				await readerDurationsAndCosts.CloseAsync();

				// Prepare a list of buildings and levels
				var buildings = new List<(string BuildingName, int CurrentLevel, DateTime? LastUpgraded)>
								{
										("command_center", currentCommandCenterLevel, commandCenterUpgraded),
										("mines", currentMinesLevel, minesUpgraded),
										("supply_depot", currentSupplyDepotLevel, supplyDepotUpgraded),
										("warehouse", currentWarehouseLevel, warehouseUpgraded),
										("engineering_bay", currentEngineeringBayLevel, engineeringBayUpgraded),
										("factory", currentFactoryLevel, factoryUpgraded),
										("starport", currentStarportLevel, starportUpgraded)
								};

				// Process each building and get the next level upgrade data
				foreach (var (buildingName, currentLevel, lastUpgraded) in buildings)
				{
					// Get the next level upgrade details
					int nextLevel = currentLevel + 1;
					if (durations.ContainsKey(buildingName) && durations[buildingName].ContainsKey(nextLevel))
					{
						int duration = durations[buildingName][nextLevel];
						int cost = costs[buildingName][nextLevel];

						availableUpgrades.Add(new
						{
							Building = buildingName,
							NextLevel = nextLevel,
							Duration = duration,
							Cost = cost,
							LastUpgraded = lastUpgraded
						});
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while retrieving building upgrades for {nexusBase.CoordsX},{nexusBase.CoordsY}. " + ex.Message, nexusBase.User?.Id, "NEXUS", true);
			}

			return availableUpgrades;
		}



		private async Task<List<NexusBase>> MassUpgradeBuildings(string building, int userId, MySqlConnection connection, MySqlTransaction transaction)
		{
			var tmpUpgradedBases = new List<NexusBase>();
			var upgradedBases = new List<NexusBase>();

			if (string.IsNullOrEmpty(building)) return upgradedBases;

			try
			{
				string sql = $@"
                    SELECT b.*, b.gold - (SELECT cost FROM nexus_base_upgrade_stats WHERE building_type = (SELECT id FROM nexus_building_types WHERE type = '{building}') and building_level = b.{building}_level) as updatedGold 
                    FROM nexus_bases b 
                    WHERE user_id = @UserId
                    AND b.{building}_level < (SELECT MAX(building_level) + 2 FROM nexus_base_upgrade_stats WHERE building_type = (SELECT id FROM nexus_building_types WHERE type = '{building}'))
                    AND b.gold >= (SELECT cost FROM nexus_base_upgrade_stats WHERE building_type = (SELECT id FROM nexus_building_types WHERE type = '{building}') AND building_level = b.{building}_level)";

				MySqlCommand cmdSql = new MySqlCommand(sql, connection, transaction);
				cmdSql.Parameters.AddWithValue("@UserId", userId);
				using (var reader = await cmdSql.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						var tmpBase = new NexusBase
						{
							User = new User(reader.GetInt32("user_id"), "Anonymous"),
							Gold = reader.GetDecimal("updatedGold"),
							Supply = reader.GetInt32("supply"),
							CoordsX = reader.GetInt32("coords_x"),
							CoordsY = reader.GetInt32("coords_y"),
							CommandCenterLevel = reader.GetInt32("command_center_level"),
							MinesLevel = reader.GetInt32("mines_level"),
							SupplyDepotLevel = reader.GetInt32("supply_depot_level"),
							EngineeringBayLevel = reader.GetInt32("engineering_bay_level"),
							WarehouseLevel = reader.GetInt32("warehouse_level"),
							FactoryLevel = reader.GetInt32("factory_level"),
							StarportLevel = reader.GetInt32("starport_level"),
							MarineLevel = reader.GetInt32("marine_level"),
							GoliathLevel = reader.GetInt32("goliath_level"),
							SiegeTankLevel = reader.GetInt32("siege_tank_level"),
							ScoutLevel = reader.GetInt32("scout_level"),
							WraithLevel = reader.GetInt32("wraith_level"),
							BattlecruiserLevel = reader.GetInt32("battlecruiser_level"),
							GlitcherLevel = reader.GetInt32("glitcher_level"),
							Conquered = reader.GetDateTime("conquered"),
							Updated = reader.GetDateTime("updated"),
						};
						tmpUpgradedBases.Add(tmpBase);
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while mass upgrading for {userId}. {ex.Message}", userId, "NEXUS", true);
				return upgradedBases;
			}

			foreach (var nbase in tmpUpgradedBases)
			{
				if (await CanUpgradeBuilding(nbase, building, connection, transaction))
				{
					await PerformUpgrade(nbase, building, userId, connection, transaction);
					upgradedBases.Add(nbase);
				}
			}

			return upgradedBases;
		}

		private async Task PerformUpgrade(NexusBase nbase, string building, int userId, MySqlConnection connection, MySqlTransaction transaction)
		{
			string selectSql = @"
                SELECT COUNT(*) 
                FROM nexus_base_upgrades 
                WHERE coords_x = @CoordsX AND coords_y = @CoordsY";
			MySqlCommand selectCmd = new MySqlCommand(selectSql, connection, transaction);
			selectCmd.Parameters.AddWithValue("@CoordsX", nbase.CoordsX);
			selectCmd.Parameters.AddWithValue("@CoordsY", nbase.CoordsY);

			var res = await selectCmd.ExecuteScalarAsync();
			if (res != null && (long)res > 0)
			{
				string updateUpgradeSql = $@"
                    UPDATE 
                        nexus_base_upgrades 
                    SET {building}_upgraded = @Timestamp 
                    WHERE 
                        coords_x = @CoordsX 
                    AND coords_y = @CoordsY
                    LIMIT 1;";
				MySqlCommand updateUpgradeCmd = new MySqlCommand(updateUpgradeSql, connection, transaction);
				updateUpgradeCmd.Parameters.AddWithValue("@Timestamp", DateTime.Now.AddSeconds(-1));
				updateUpgradeCmd.Parameters.AddWithValue("@CoordsX", nbase.CoordsX);
				updateUpgradeCmd.Parameters.AddWithValue("@CoordsY", nbase.CoordsY);

				await updateUpgradeCmd.ExecuteNonQueryAsync();
			}
			else
			{
				string insertUpgradeSql = $@"
                    INSERT INTO nexus_base_upgrades (coords_x, coords_y, {building}_upgraded)
                    VALUES (@CoordsX, @CoordsY, @Timestamp)";
				MySqlCommand insertUpgradeCmd = new MySqlCommand(insertUpgradeSql, connection, transaction);
				insertUpgradeCmd.Parameters.AddWithValue("@Timestamp", DateTime.Now.AddSeconds(-1));
				insertUpgradeCmd.Parameters.AddWithValue("@CoordsX", nbase.CoordsX);
				insertUpgradeCmd.Parameters.AddWithValue("@CoordsY", nbase.CoordsY);

				await insertUpgradeCmd.ExecuteNonQueryAsync();
			}

			string updateBaseSql = $@"
                UPDATE nexus_bases
                SET 
                    gold = @Gold
                WHERE 
                    coords_x = @CoordsX
                    AND coords_y = @CoordsY
                    AND user_id = @UserId
                LIMIT 1;";
			MySqlCommand updateBaseCmd = new MySqlCommand(updateBaseSql, connection, transaction);
			updateBaseCmd.Parameters.AddWithValue("@UserId", userId);
			updateBaseCmd.Parameters.AddWithValue("@CoordsX", nbase.CoordsX);
			updateBaseCmd.Parameters.AddWithValue("@CoordsY", nbase.CoordsY);
			updateBaseCmd.Parameters.AddWithValue("@Gold", nbase.Gold);

			await updateBaseCmd.ExecuteNonQueryAsync();
		}

		private async Task<bool> CanUpgradeBuilding(NexusBase nbase, string building, MySqlConnection connection, MySqlTransaction transaction)
		{
			if (nbase.MinesLevel < 1 && building != "mines")
			{
				return false;
			}
			NexusBaseUpgrades? currentUpgrades = await GetNexusBaseUpgrades(nbase, connection, transaction);
			if (nbase.MinesLevel < 1 && currentUpgrades?.MinesUpgraded == null && building != "mines")
			{
				return false;
			}
			if (building == "starport" && (nbase.EngineeringBayLevel < 1 || nbase.FactoryLevel < 1))
			{
				return false;
			}
			int upgradeCount = 0;

			if (currentUpgrades?.EngineeringBayUpgraded != null) upgradeCount++;
			if (currentUpgrades?.CommandCenterUpgraded != null) upgradeCount++;
			if (currentUpgrades?.MinesUpgraded != null) upgradeCount++;
			if (currentUpgrades?.StarportUpgraded != null) upgradeCount++;
			if (currentUpgrades?.FactoryUpgraded != null) upgradeCount++;
			if (currentUpgrades?.SupplyDepotUpgraded != null) upgradeCount++;
			if (currentUpgrades?.WarehouseUpgraded != null) upgradeCount++;

			if (upgradeCount >= Math.Max(nbase.CommandCenterLevel, 1))
			{
				return false;
			}

			return building switch
			{
				"command_center" => currentUpgrades?.CommandCenterUpgraded == null,
				"supply_depot" => currentUpgrades?.SupplyDepotUpgraded == null,
				"engineering_bay" => currentUpgrades?.EngineeringBayUpgraded == null,
				"warehouse" => currentUpgrades?.WarehouseUpgraded == null,
				"mines" => currentUpgrades?.MinesUpgraded == null,
				"factory" => currentUpgrades?.FactoryUpgraded == null,
				"starport" => currentUpgrades?.StarportUpgraded == null,
				_ => false,
			};
		}

		private async Task<List<NexusBase>> MassPurchaseUnits(string unit, int userId, MySqlConnection connection, MySqlTransaction transaction)
		{
			var upgradedBases = new List<NexusBase>();

			if (string.IsNullOrEmpty(unit)) return upgradedBases;

			// Dictionary to store base coordinates and corresponding NexusBase objects
			var baseUpdates = new Dictionary<(int CoordsX, int CoordsY), (NexusBase Base, int UnitId, decimal AdjustedGold, int Supply, int QtyPurchased)>();
			List<UnitStats> unitStats = await GetUnitStatsFromDB(null, null, connection, transaction);
			try
			{
				string sql = $@"
    SELECT 
        b.*, 
        (SELECT id FROM nexus_unit_types WHERE type = @Unit) as unitId,
        FLOOR(b.gold / (SELECT cost FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit))) AS maxByGold, 
        FLOOR((b.supply_depot_level * 2500 - b.supply) / 
              (SELECT supply FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit))) AS maxBySupply, 
        LEAST(
            FLOOR(b.gold / (SELECT cost FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit))),
            FLOOR((b.supply_depot_level * 2500 - b.supply) / 
                  (SELECT supply FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit)))
        ) AS qtyPurchased, 
        b.gold - LEAST(
            FLOOR(b.gold / (SELECT cost FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit))),
            FLOOR((b.supply_depot_level * 2500 - b.supply) / 
                  (SELECT supply FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit)))
        ) * (SELECT cost FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit)) AS adjustedGold, 
        LEAST(
            FLOOR(b.gold / (SELECT cost FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit))),
            FLOOR((b.supply_depot_level * 2500 - b.supply) / 
                  (SELECT supply FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit)))
        ) * (SELECT supply FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit)) AS supplyCost 
    FROM 
        nexus_bases b 
    LEFT JOIN 
        nexus_units u ON b.coords_x = u.coords_x AND b.coords_y = u.coords_y
    LEFT JOIN 
        nexus_unit_purchases up ON b.coords_x = up.coords_x AND b.coords_y = up.coords_y 
                              AND up.unit_id_purchased = (SELECT id FROM nexus_unit_types WHERE type = 'glitcher')
    WHERE 
        b.user_id = @UserId
        AND b.gold > (SELECT cost FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit))
        AND b.factory_level >= (SELECT factory_level FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit))
        AND b.starport_level >= (SELECT starport_level FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit))
        AND b.engineering_bay_level >= (SELECT engineering_bay_level FROM nexus_unit_stats WHERE unit_id = (SELECT id FROM nexus_unit_types WHERE type = @Unit))
        AND (@Unit != 'glitcher' OR (COALESCE(u.glitcher_total, 0) = 0 AND up.id IS NULL));";  // <-- New check
				MySqlCommand cmdSql = new MySqlCommand(sql, connection, transaction);
				cmdSql.Parameters.AddWithValue("@UserId", userId);
				cmdSql.Parameters.AddWithValue("@Unit", unit);

				using (var reader = await cmdSql.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						// Populate the NexusBase object
						var nexusBase = new NexusBase
						{
							User = new User(reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32("user_id"), "Anonymous"),
							Gold = reader.IsDBNull(reader.GetOrdinal("gold")) ? 0 : reader.GetDecimal("gold"),
							Supply = reader.IsDBNull(reader.GetOrdinal("supply")) ? 0 : reader.GetInt32("supply"),
							CoordsX = reader.IsDBNull(reader.GetOrdinal("coords_x")) ? 0 : reader.GetInt32("coords_x"),
							CoordsY = reader.IsDBNull(reader.GetOrdinal("coords_y")) ? 0 : reader.GetInt32("coords_y"),
							CommandCenterLevel = reader.IsDBNull(reader.GetOrdinal("command_center_level")) ? 0 : reader.GetInt32("command_center_level"),
							MinesLevel = reader.IsDBNull(reader.GetOrdinal("mines_level")) ? 0 : reader.GetInt32("mines_level"),
							SupplyDepotLevel = reader.IsDBNull(reader.GetOrdinal("supply_depot_level")) ? 0 : reader.GetInt32("supply_depot_level"),
							EngineeringBayLevel = reader.IsDBNull(reader.GetOrdinal("engineering_bay_level")) ? 0 : reader.GetInt32("engineering_bay_level"),
							WarehouseLevel = reader.IsDBNull(reader.GetOrdinal("warehouse_level")) ? 0 : reader.GetInt32("warehouse_level"),
							FactoryLevel = reader.IsDBNull(reader.GetOrdinal("factory_level")) ? 0 : reader.GetInt32("factory_level"),
							StarportLevel = reader.IsDBNull(reader.GetOrdinal("starport_level")) ? 0 : reader.GetInt32("starport_level"),
							MarineLevel = reader.IsDBNull(reader.GetOrdinal("marine_level")) ? 0 : reader.GetInt32("marine_level"),
							GoliathLevel = reader.IsDBNull(reader.GetOrdinal("goliath_level")) ? 0 : reader.GetInt32("goliath_level"),
							SiegeTankLevel = reader.IsDBNull(reader.GetOrdinal("siege_tank_level")) ? 0 : reader.GetInt32("siege_tank_level"),
							ScoutLevel = reader.IsDBNull(reader.GetOrdinal("scout_level")) ? 0 : reader.GetInt32("scout_level"),
							WraithLevel = reader.IsDBNull(reader.GetOrdinal("wraith_level")) ? 0 : reader.GetInt32("wraith_level"),
							BattlecruiserLevel = reader.IsDBNull(reader.GetOrdinal("battlecruiser_level")) ? 0 : reader.GetInt32("battlecruiser_level"),
							GlitcherLevel = reader.IsDBNull(reader.GetOrdinal("glitcher_level")) ? 0 : reader.GetInt32("glitcher_level"),
							Conquered = reader.IsDBNull(reader.GetOrdinal("conquered")) ? DateTime.MinValue : reader.GetDateTime("conquered"),
							Updated = reader.IsDBNull(reader.GetOrdinal("updated")) ? DateTime.MinValue : reader.GetDateTime("updated"),
						};

						int unitId = reader.GetInt32("unitId");
						decimal adjustedGold = reader.GetDecimal("adjustedGold");
						int supply = reader.GetInt32("supply") + reader.GetInt32("supplyCost");
						int qtyPurchased = reader.GetInt32("qtyPurchased");
						if (unit == "glitcher")
						{
							qtyPurchased = Math.Min(qtyPurchased, 1); // Never more than 1
						}
						baseUpdates[(nexusBase.CoordsX, nexusBase.CoordsY)] = (nexusBase, unitId, adjustedGold, supply, qtyPurchased);
					}
				}

				// Step 2: Use the dictionary for updates
				foreach (var baseUpdate in baseUpdates)
				{
					var coords = baseUpdate.Key;
					var updateInfo = baseUpdate.Value;


					List<NexusUnitsPurchased>? nup = await GetNexusUnitPurchases(baseUpdate.Value.Base, connection, transaction);
					int factoryPurchases = 0;
					int starportPurchases = 0;
					if (nup != null && nup.Count > 0)
					{
						foreach (var purchase in nup)
						{
							var stats = unitStats.First(x => x.UnitId == purchase.UnitIdPurchased);
							if (stats.UnitType == "marine" || stats.UnitType == "goliath" || stats.UnitType == "siege_tank")
							{
								factoryPurchases++;
							}
							else if (stats.UnitType == "scout" || stats.UnitType == "wraith" || stats.UnitType == "battlecruiser")
							{
								starportPurchases++;
							}
						}
					}

					if (factoryPurchases > 0 && baseUpdate.Value.Base.FactoryLevel <= factoryPurchases)
					{
						continue;
					}
					else if (starportPurchases > 0 && baseUpdate.Value.Base.StarportLevel <= starportPurchases)
					{
						continue;
					}
					// Update NexusBase 
					await UpdateNexusGoldAndSupply(coords.CoordsX, coords.CoordsY, updateInfo.AdjustedGold, updateInfo.Supply, connection, transaction);
					await UpdateNexusUnitPurchases(coords.CoordsX, coords.CoordsY, updateInfo.UnitId, updateInfo.QtyPurchased, connection, transaction);

					// Update the NexusBase object with the new values
					updateInfo.Base.Gold = updateInfo.AdjustedGold;
					updateInfo.Base.Supply = updateInfo.Supply;

					upgradedBases.Add(updateInfo.Base);
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while mass purchasing units for {userId}. {ex.Message}", userId, "NEXUS", true);
			}

			return upgradedBases;
		}



		private async Task<List<Object>> GetAllBuildingUpgradeList(MySqlConnection connection, MySqlTransaction transaction)
		{
			var availableUpgrades = new List<Object>();

			try
			{
				var durations = new Dictionary<string, Dictionary<int, int>>();
				var costs = new Dictionary<string, Dictionary<int, int>>();
				string sqlDurations = @"
                    SELECT 
                        building_type, building_level, duration, cost
                    FROM 
                        nexus_base_upgrade_stats
                    WHERE 
                        building_type 
                        IN (
                            SELECT id 
                            FROM nexus_building_types 
                            WHERE type IN ('command_center', 'mines', 'supply_depot', 'warehouse', 'engineering_bay', 'factory', 'starport')
                        )";
				MySqlCommand cmdDurations = new MySqlCommand(sqlDurations, connection, transaction);
				var readerDurations = await cmdDurations.ExecuteReaderAsync();
				while (await readerDurations.ReadAsync())
				{
					int buildingType = readerDurations.GetInt32("building_type");
					int level = readerDurations.GetInt32("building_level");
					int duration = readerDurations.GetInt32("duration");
					int cost = readerDurations.GetInt32("cost");

					string buildingTypeEnum = GetBuildingTypeFromTypeId(buildingType);
					if (!string.IsNullOrEmpty(buildingTypeEnum))
					{
						if (!durations.ContainsKey(buildingTypeEnum))
						{
							durations[buildingTypeEnum] = new Dictionary<int, int>();
						}
						if (!costs.ContainsKey(buildingTypeEnum))
						{
							costs[buildingTypeEnum] = new Dictionary<int, int>();
						}
						durations[buildingTypeEnum][level] = duration;
						costs[buildingTypeEnum][level] = cost;
					}
				}
				await readerDurations.CloseAsync();

				var buildings = new List<string>
								{
										"command_center",
										"mines",
										"supply_depot",
										"warehouse",
										"engineering_bay",
										"factory",
										"starport"
								};

				foreach (string buildingName in buildings)
				{
					foreach (int buildingLevel in durations[buildingName].Keys)
					{
						int duration = durations[buildingName][buildingLevel];
						int cost = costs[buildingName][buildingLevel];
						availableUpgrades.Add(new
						{
							Building = buildingName,
							NextLevel = buildingLevel,
							Duration = duration,
							Cost = cost
						});
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while retrieving building upgrades. " + ex.Message, null, "NEXUS", true);
			}

			return availableUpgrades;
		}



		private async Task<List<NexusUnits>> GetAllBasesUnitsList(int userId, MySqlConnection connection, MySqlTransaction transaction)
		{
			var availableUnits = new List<NexusUnits>();
			try
			{
				string sqlBaseUnits = @"
                    SELECT 
	                    nu.coords_x, nu.coords_y, nu.marine_total, nu.goliath_total, nu.siege_tank_total, nu.scout_total, 
	                    nu.wraith_total, nu.battlecruiser_total, nu.glitcher_total  
                    FROM 
	                    nexus_units nu
                    INNER JOIN 
	                    nexus_bases nb 
                    ON 
	                    nu.coords_x = nb.coords_x AND nu.coords_y = nb.coords_y
                    WHERE 
	                    nb.user_id = @UserId;";
				MySqlCommand cmd = new MySqlCommand(sqlBaseUnits, connection, transaction);
				cmd.Parameters.AddWithValue("@UserId", userId);
				var reader = await cmd.ExecuteReaderAsync();
				while (await reader.ReadAsync())
				{

					int coordsX = reader.GetInt32("coords_x");
					int coordsY = reader.GetInt32("coords_y");
					int marineTotal = reader.GetInt32("marine_total");
					int goliathTotal = reader.GetInt32("goliath_total");
					int siegeTankTotal = reader.GetInt32("siege_tank_total");
					int scoutTotal = reader.GetInt32("scout_total");
					int wraithTotal = reader.GetInt32("wraith_total");
					int battlecruiserTotal = reader.GetInt32("battlecruiser_total");
					int glitcherTotal = reader.GetInt32("glitcher_total");
					availableUnits.Add(
							new NexusUnits()
							{
								CoordsX = coordsX,
								CoordsY = coordsY,
								MarineTotal = marineTotal,
								GoliathTotal = goliathTotal,
								SiegeTankTotal = siegeTankTotal,
								ScoutTotal = scoutTotal,
								WraithTotal = wraithTotal,
								BattlecruiserTotal = battlecruiserTotal,
								GlitcherTotal = glitcherTotal
							}
					);
				}
				await reader.CloseAsync();
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while retrieving building upgrades. " + ex.Message, userId, "NEXUS", true);
			}

			return availableUnits;
		}
		private async Task SendAttack(NexusBase OriginNexus, NexusBase DestinationNexus, User? from, User? to, UnitStats[] UnitList, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			//_ = _log.Db("SendAttack...");
			if (OriginNexus == null || DestinationNexus == null) return;

			decimal slowestSpeed = UnitList
			 .Where(unit => unit.SentValue > 0)
			 .Select(unit => unit.Speed)
			 .DefaultIfEmpty(0.0m)
			 .Max();
			int distance = 1 + Math.Abs(OriginNexus.CoordsX - DestinationNexus.CoordsX) + Math.Abs(OriginNexus.CoordsY - DestinationNexus.CoordsY);
			int duration = (int)(distance * slowestSpeed * 60);
			//_ = _log.Db($"duration:{duration} distance:{distance}, slowestSpeed: {slowestSpeed}");

			int marinesSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "marine")?.SentValue ?? 0;
			int goliathSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "goliath")?.SentValue ?? 0;
			int siegeTankSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "siege_tank")?.SentValue ?? 0;
			int scoutSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "scout")?.SentValue ?? 0;
			int wraithSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "wraith")?.SentValue ?? 0;
			int battlecruiserSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "battlecruiser")?.SentValue ?? 0;
			int glitcherSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "glitcher")?.SentValue ?? 0;


			string sql = @"
                INSERT INTO 
                    maxhanna.nexus_attacks_sent 
                    (origin_coords_x, origin_coords_y, origin_user_id, destination_coords_x, destination_coords_y, destination_user_id, marine_total, goliath_total, siege_tank_total, scout_total, wraith_total, battlecruiser_total, glitcher_total, duration)
                VALUES
                    (@OriginX, @OriginY, @OriginUserId, @DestinationX, @DestinationY, @DestinationUserId, @Marine, @Goliath, @SiegeTank, @Scout, @Wraith, @Battlecruiser, @Glitcher, @Duration);";

			var parameters = new Dictionary<string, object?>
						{
								{ "@OriginX", OriginNexus.CoordsX },
								{ "@OriginY", OriginNexus.CoordsY },
								{ "@OriginUserId", from?.Id },
								{ "@DestinationX", DestinationNexus.CoordsX },
								{ "@DestinationY", DestinationNexus.CoordsY },
								{ "@DestinationUserId", to?.Id },
								{ "@Duration", duration },
								{ "@Marine", marinesSent },
								{ "@Goliath", goliathSent },
								{ "@SiegeTank", siegeTankSent },
								{ "@Scout", scoutSent },
								{ "@Wraith", wraithSent },
								{ "@Battlecruiser", battlecruiserSent },
								{ "@Glitcher", glitcherSent },
						};

			var insertedId = await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
		}


		private async Task SendDefence(NexusBase OriginNexus, NexusBase DestinationNexus, UnitStats[] UnitList, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			//_ = _log.Db("SendDefence...");
			if (OriginNexus == null || DestinationNexus == null) return;

			decimal slowestSpeed = UnitList
			 .Where(unit => unit.SentValue > 0)
			 .Select(unit => unit.Speed)
			 .DefaultIfEmpty(0.0m)
			 .Max();
			int distance = 1 + Math.Abs(OriginNexus.CoordsX - DestinationNexus.CoordsX) + Math.Abs(OriginNexus.CoordsY - DestinationNexus.CoordsY);
			int duration = (int)(distance * slowestSpeed * 60);

			int marinesSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "marine")?.SentValue ?? 0;
			int goliathSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "goliath")?.SentValue ?? 0;
			int siegeTankSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "siege_tank")?.SentValue ?? 0;
			int scoutSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "scout")?.SentValue ?? 0;
			int wraithSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "wraith")?.SentValue ?? 0;
			int battlecruiserSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "battlecruiser")?.SentValue ?? 0;
			int glitcherSent = UnitList.FirstOrDefault(x => x.UnitType != null && x.UnitType == "glitcher")?.SentValue ?? 0;


			string sql = @"
                INSERT INTO 
                    maxhanna.nexus_defences_sent 
                    (origin_coords_x, origin_coords_y, origin_user_id, destination_coords_x, destination_coords_y, destination_user_id, marine_total, goliath_total, siege_tank_total, scout_total, wraith_total, battlecruiser_total, glitcher_total, duration)
                VALUES
                    (@OriginX, @OriginY, @OriginUserId, @DestinationX, @DestinationY, @DestinationUserId, @Marine, @Goliath, @SiegeTank, @Scout, @Wraith, @Battlecruiser, @Glitcher, @Duration);";

			var parameters = new Dictionary<string, object?>
						{
								{ "@OriginX", OriginNexus.CoordsX },
								{ "@OriginY", OriginNexus.CoordsY },
								{ "@OriginUserId", OriginNexus.User?.Id },
								{ "@DestinationX", DestinationNexus.CoordsX },
								{ "@DestinationY", DestinationNexus.CoordsY },
								{ "@DestinationUserId", DestinationNexus.User?.Id },
								{ "@Duration", duration },
								{ "@Marine", marinesSent },
								{ "@Goliath", goliathSent },
								{ "@SiegeTank", siegeTankSent },
								{ "@Scout", scoutSent },
								{ "@Wraith", wraithSent },
								{ "@Battlecruiser", battlecruiserSent },
								{ "@Glitcher", glitcherSent },
						};

			var insertedId = await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);


			//_ = _log.Db("Attack sent");
		}

		private async Task DeleteAttack(NexusBase OriginNexus, NexusBase DestinationNexus, DateTime timestamp, int DistanceTimeInSeconds, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			//_ = _log.Db($"Deleting NexusAttack from {OriginNexus.CoordsX},{OriginNexus.CoordsY} sent on {DestinationNexus.CoordsX},{DestinationNexus.CoordsY}; Timestamp: {timestamp}, DistanceInSeconds: {DistanceTimeInSeconds}");

			string sql = @"
                DELETE FROM
                    maxhanna.nexus_attacks_sent 
                WHERE 
                    origin_coords_x = @OriginX
                AND origin_coords_y = @OriginY
                AND destination_coords_x = @DestinationX
                AND destination_coords_y = @DestinationY
                AND timestamp = @Timestamp
                AND duration = @Duration
                LIMIT 1;";

			var parameters = new Dictionary<string, object?>
						{
								{ "@OriginX", OriginNexus.CoordsX },
								{ "@OriginY", OriginNexus.CoordsY },
								{ "@DestinationX", DestinationNexus.CoordsX },
								{ "@DestinationY", DestinationNexus.CoordsY },
								{ "@Duration", DistanceTimeInSeconds },
								{ "@Timestamp", timestamp },
						};

			await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
			//_ = _log.Db("NexusAttack deleted");
		}

		private async Task DeleteDefence(NexusBase OriginNexus, NexusBase DestinationNexus, DateTime timestamp, int DistanceTimeInSeconds, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			//_ = _log.Db($"Deleting NexusAttack from {OriginNexus.CoordsX},{OriginNexus.CoordsY} sent on {DestinationNexus.CoordsX},{DestinationNexus.CoordsY}; Timestamp: {timestamp}, DistanceInSeconds: {DistanceTimeInSeconds}");

			string sql = @"
                DELETE FROM
                    maxhanna.nexus_defences_sent 
                WHERE 
                    origin_coords_x = @OriginX
                AND origin_coords_y = @OriginY
                AND destination_coords_x = @DestinationX
                AND destination_coords_y = @DestinationY
                AND timestamp = @Timestamp
                AND duration = @Duration
                LIMIT 1;";

			var parameters = new Dictionary<string, object?>
						{
								{ "@OriginX", OriginNexus.CoordsX },
								{ "@OriginY", OriginNexus.CoordsY },
								{ "@DestinationX", DestinationNexus.CoordsX },
								{ "@DestinationY", DestinationNexus.CoordsY },
								{ "@Duration", DistanceTimeInSeconds },
								{ "@Timestamp", timestamp },
						};

			await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
			//_ = _log.Db("NexusAttack deleted");
		}


		private async Task DefenceArrived(NexusBase OriginNexus, NexusBase DestinationNexus, DateTime timestamp, int DistanceTimeInSeconds, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			//_ = _log.Db($"Deleting NexusAttack from {OriginNexus.CoordsX},{OriginNexus.CoordsY} sent on {DestinationNexus.CoordsX},{DestinationNexus.CoordsY}; Timestamp: {timestamp}, DistanceInSeconds: {DistanceTimeInSeconds}");

			string sql = @"
                UPDATE
                    maxhanna.nexus_defences_sent 
                SET arrived = 1, origin_user_id = @OriginUserId, destination_user_id = @DestinationUserId
                WHERE 
                    origin_coords_x = @OriginX
                AND origin_coords_y = @OriginY
                AND destination_coords_x = @DestinationX
                AND destination_coords_y = @DestinationY
                AND timestamp = @Timestamp
                AND duration = @Duration
                LIMIT 1;";

			var parameters = new Dictionary<string, object?>
						{
								{ "@OriginX", OriginNexus.CoordsX },
								{ "@OriginY", OriginNexus.CoordsY },
								{ "@OriginUserId", OriginNexus.User?.Id },
								{ "@DestinationUserId", DestinationNexus.User?.Id },
								{ "@DestinationX", DestinationNexus.CoordsX },
								{ "@DestinationY", DestinationNexus.CoordsY },
								{ "@Duration", DistanceTimeInSeconds },
								{ "@Timestamp", timestamp },
						};

			await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
		}
		private async Task<List<NexusAttackSent>?> GetNexusAttacksSent(NexusBase? nexusBase, bool onlyCurrentBase, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			//_ = _log.Db($"Get nexus attacks sent. onlyCurrentBase: {onlyCurrentBase}");
			List<NexusAttackSent>? attacks = null;
			if (nexusBase == null) return attacks;

			bool passedInConn = conn != null;

			try
			{
				if (!passedInConn)
				{
					conn = new MySqlConnection(_connectionString);
					await conn.OpenAsync();
				}

				string sql = "";
				if (onlyCurrentBase)
				{
					sql = @"
                        SELECT a.*, ou.username as origin_username, du.username as destination_username, oudp.file_id as origin_file_id, dudp.file_id as destination_file_id
                        FROM maxhanna.nexus_attacks_sent a 
                        LEFT JOIN maxhanna.users ou on ou.id = a.origin_user_id
                        LEFT JOIN maxhanna.user_display_pictures oudp on oudp.user_id = a.origin_user_id
                        LEFT JOIN maxhanna.users du on du.id = a.destination_user_id
                        LEFT JOIN maxhanna.user_display_pictures dudp on dudp.user_id = a.destination_user_id 
                        WHERE origin_coords_x = @OriginX AND origin_coords_y = @OriginY;";
				}
				else
				{
					sql = @"
                        SELECT a.*, ou.username as origin_username, du.username as destination_username, oudp.file_id as origin_file_id, dudp.file_id as destination_file_id
                        FROM maxhanna.nexus_attacks_sent a 
                        LEFT JOIN maxhanna.users ou on ou.id = a.origin_user_id
                        LEFT JOIN maxhanna.user_display_pictures oudp on oudp.user_id = a.origin_user_id
                        LEFT JOIN maxhanna.users du on du.id = a.destination_user_id
                        LEFT JOIN maxhanna.user_display_pictures dudp on dudp.user_id = a.destination_user_id 
                        WHERE origin_user_id = @UserId;";
				}
				using (MySqlCommand sqlCmd = new MySqlCommand(sql, conn))
				{
					if (transaction != null)
					{
						sqlCmd.Transaction = transaction;
					}
					if (onlyCurrentBase)
					{
						sqlCmd.Parameters.AddWithValue("@OriginX", nexusBase.CoordsX);
						sqlCmd.Parameters.AddWithValue("@OriginY", nexusBase.CoordsY);
					}
					else
					{
						sqlCmd.Parameters.AddWithValue("@UserId", nexusBase.User?.Id ?? 0);
					}
					//_ = _log.Db("attack sent sql : " + sqlCmd.CommandText);
					using (var reader = await sqlCmd.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{
							if (attacks == null)
							{
								attacks = new List<NexusAttackSent>();
							}
							var originDisplayPicture = new FileEntry
							{
								Id = reader.IsDBNull(reader.GetOrdinal("origin_file_id")) ? 0 : reader.GetInt32("origin_file_id")
							};
							var destinationDisplayPicture = new FileEntry
							{
								Id = reader.IsDBNull(reader.GetOrdinal("destination_file_id")) ? 0 : reader.GetInt32("destination_file_id")
							};
							attacks.Add(new NexusAttackSent
							{
								Id = reader.GetInt32(reader.GetOrdinal("id")),
								OriginCoordsX = reader.GetInt32(reader.GetOrdinal("origin_coords_x")),
								OriginCoordsY = reader.GetInt32(reader.GetOrdinal("origin_coords_y")),
								OriginUser =
											new User(reader.IsDBNull(reader.GetOrdinal("origin_user_id")) ? 0 : reader.GetInt32("origin_user_id"),
													reader.IsDBNull(reader.GetOrdinal("origin_username")) ? "Anonymous" : reader.GetString("origin_username"),
													originDisplayPicture),

								DestinationCoordsX = reader.GetInt32(reader.GetOrdinal("destination_coords_x")),
								DestinationCoordsY = reader.GetInt32(reader.GetOrdinal("destination_coords_y")),
								DestinationUser =
											new User(reader.IsDBNull(reader.GetOrdinal("destination_user_id")) ? 0 : reader.GetInt32("destination_user_id"),
													reader.IsDBNull(reader.GetOrdinal("destination_username")) ? "Anonymous" : reader.GetString("destination_username"),
													destinationDisplayPicture),
								MarineTotal = reader.IsDBNull(reader.GetOrdinal("marine_total")) ? null : reader.GetInt32("marine_total"),
								GoliathTotal = reader.IsDBNull(reader.GetOrdinal("goliath_total")) ? null : reader.GetInt32("goliath_total"),
								SiegeTankTotal = reader.IsDBNull(reader.GetOrdinal("siege_tank_total")) ? null : reader.GetInt32("siege_tank_total"),
								ScoutTotal = reader.IsDBNull(reader.GetOrdinal("scout_total")) ? null : reader.GetInt32("scout_total"),
								WraithTotal = reader.IsDBNull(reader.GetOrdinal("wraith_total")) ? null : reader.GetInt32("wraith_total"),
								BattlecruiserTotal = reader.IsDBNull(reader.GetOrdinal("battlecruiser_total")) ? null : reader.GetInt32("battlecruiser_total"),
								GlitcherTotal = reader.IsDBNull(reader.GetOrdinal("glitcher_total")) ? null : reader.GetInt32("glitcher_total"),
								Duration = reader.IsDBNull(reader.GetOrdinal("duration")) ? 0 : reader.GetInt32("duration"),
								Timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp")) ? DateTime.Now : reader.GetDateTime("timestamp"),
							});
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while GetNexusAttacksSent. " + ex.Message, nexusBase.User?.Id, "NEXUS", true);
			}
			finally
			{
				if (!passedInConn && conn != null)
				{
					await conn.CloseAsync();
				}
			}

			return attacks;
		}

		private async Task<List<NexusAttackSent>?> GetNexusDefencesSent(NexusBase? nexusBase, bool onlyCurrentBase, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			//_ = _log.Db($"Get nexus defences sent. onlyCurrentBase: {onlyCurrentBase}");
			List<NexusAttackSent>? attacks = null;
			if (nexusBase == null) return attacks;

			bool passedInConn = conn != null;

			try
			{
				if (!passedInConn)
				{
					conn = new MySqlConnection(_connectionString);
					await conn.OpenAsync();
				}

				string sql = "";
				if (onlyCurrentBase)
				{
					sql = @"
                        SELECT a.*, ou.username as origin_username, du.username as destination_username, oudp.file_id as origin_file_id, dudp.file_id as destination_file_id
                        FROM maxhanna.nexus_defences_sent a 
                        LEFT JOIN maxhanna.users ou on ou.id = a.origin_user_id
                        LEFT JOIN maxhanna.user_display_pictures oudp on oudp.user_id = a.origin_user_id
                        LEFT JOIN maxhanna.users du on du.id = a.destination_user_id
                        LEFT JOIN maxhanna.user_display_pictures dudp on dudp.user_id = a.destination_user_id 
                        WHERE origin_coords_x = @OriginX AND origin_coords_y = @OriginY;";
				}
				else
				{
					sql = @"
                        SELECT a.*, ou.username as origin_username, du.username as destination_username, oudp.file_id as origin_file_id, dudp.file_id as destination_file_id
                        FROM maxhanna.nexus_defences_sent a 
                        LEFT JOIN maxhanna.users ou on ou.id = a.origin_user_id
                        LEFT JOIN maxhanna.user_display_pictures oudp on oudp.user_id = a.origin_user_id
                        LEFT JOIN maxhanna.users du on du.id = a.destination_user_id
                        LEFT JOIN maxhanna.user_display_pictures dudp on dudp.user_id = a.destination_user_id 
                        WHERE origin_user_id = @UserId;";
				}
				using (MySqlCommand sqlCmd = new MySqlCommand(sql, conn))
				{
					if (transaction != null)
					{
						sqlCmd.Transaction = transaction;
					}
					if (onlyCurrentBase)
					{
						sqlCmd.Parameters.AddWithValue("@OriginX", nexusBase.CoordsX);
						sqlCmd.Parameters.AddWithValue("@OriginY", nexusBase.CoordsY);
					}
					else
					{
						sqlCmd.Parameters.AddWithValue("@UserId", nexusBase.User?.Id ?? 0);
					}
					//_ = _log.Db("attack sent sql : " + sqlCmd.CommandText);
					using (var reader = await sqlCmd.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{
							if (attacks == null)
							{
								attacks = new List<NexusAttackSent>();
							}
							var originDisplayPicture = new FileEntry
							{
								Id = reader.IsDBNull(reader.GetOrdinal("origin_file_id")) ? 0 : reader.GetInt32("origin_file_id")
							};
							var destinationDisplayPicture = new FileEntry
							{
								Id = reader.IsDBNull(reader.GetOrdinal("destination_file_id")) ? 0 : reader.GetInt32("destination_file_id")
							};
							attacks.Add(new NexusAttackSent
							{
								Id = reader.GetInt32(reader.GetOrdinal("id")),
								OriginCoordsX = reader.GetInt32(reader.GetOrdinal("origin_coords_x")),
								OriginCoordsY = reader.GetInt32(reader.GetOrdinal("origin_coords_y")),
								OriginUser =
											new User(reader.IsDBNull(reader.GetOrdinal("origin_user_id")) ? 0 : reader.GetInt32("origin_user_id"),
													reader.IsDBNull(reader.GetOrdinal("origin_username")) ? "Anonymous" : reader.GetString("origin_username"),
													originDisplayPicture),

								DestinationCoordsX = reader.GetInt32(reader.GetOrdinal("destination_coords_x")),
								DestinationCoordsY = reader.GetInt32(reader.GetOrdinal("destination_coords_y")),
								DestinationUser =
											new User(reader.IsDBNull(reader.GetOrdinal("destination_user_id")) ? 0 : reader.GetInt32("destination_user_id"),
													reader.IsDBNull(reader.GetOrdinal("destination_username")) ? "Anonymous" : reader.GetString("destination_username"),
													destinationDisplayPicture),
								MarineTotal = reader.IsDBNull(reader.GetOrdinal("marine_total")) ? null : reader.GetInt32("marine_total"),
								GoliathTotal = reader.IsDBNull(reader.GetOrdinal("goliath_total")) ? null : reader.GetInt32("goliath_total"),
								SiegeTankTotal = reader.IsDBNull(reader.GetOrdinal("siege_tank_total")) ? null : reader.GetInt32("siege_tank_total"),
								ScoutTotal = reader.IsDBNull(reader.GetOrdinal("scout_total")) ? null : reader.GetInt32("scout_total"),
								WraithTotal = reader.IsDBNull(reader.GetOrdinal("wraith_total")) ? null : reader.GetInt32("wraith_total"),
								BattlecruiserTotal = reader.IsDBNull(reader.GetOrdinal("battlecruiser_total")) ? null : reader.GetInt32("battlecruiser_total"),
								GlitcherTotal = reader.IsDBNull(reader.GetOrdinal("glitcher_total")) ? null : reader.GetInt32("glitcher_total"),
								Duration = reader.IsDBNull(reader.GetOrdinal("duration")) ? 0 : reader.GetInt32("duration"),
								Timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp")) ? DateTime.Now : reader.GetDateTime("timestamp"),
								Arrived = reader.IsDBNull(reader.GetOrdinal("arrived")) ? false : reader.GetBoolean("arrived"),
							});
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while GetNexusDefencesSent. " + ex.Message, nexusBase.User?.Id, "NEXUS", true);
			}
			finally
			{
				if (!passedInConn && conn != null)
				{
					await conn.CloseAsync();
				}
			}

			return attacks;
		}
		private async Task<List<NexusAttackSent>?> GetNexusAttacksIncoming(NexusBase? nexusBase, bool onlyCurrentBase, bool withUnits, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
		{
			List<NexusAttackSent>? attacks = null;
			if (nexusBase == null) return attacks;

			//_ = _log.Db($"GetNexusAttacksIncoming {nexusBase.CoordsX}, {nexusBase.CoordsY}");

			bool passedInConn = conn != null;

			try
			{
				if (!passedInConn)
				{
					conn = new MySqlConnection(_connectionString);
					await conn.OpenAsync();
				}

				string sql = "";
				if (onlyCurrentBase)
				{
					sql = @"
                        SELECT a.*, ou.username as origin_username, du.username as destination_username, oudp.file_id as origin_file_id, dudp.file_id as destination_file_id
                        FROM maxhanna.nexus_attacks_sent a 
                        LEFT JOIN maxhanna.users ou on ou.id = a.origin_user_id
                        LEFT JOIN maxhanna.user_display_pictures oudp on oudp.user_id = a.origin_user_id
                        LEFT JOIN maxhanna.users du on du.id = a.destination_user_id
                        LEFT JOIN maxhanna.user_display_pictures dudp on dudp.user_id = a.destination_user_id
                        WHERE a.destination_coords_x = @DestX 
                        AND a.destination_coords_y = @DestY;";
				}
				else
				{
					sql = @"
                        SELECT a.*, ou.username as origin_username, du.username as destination_username, oudp.file_id as origin_file_id, dudp.file_id as destination_file_id
                        FROM maxhanna.nexus_attacks_sent a 
                        LEFT JOIN maxhanna.users ou on ou.id = a.origin_user_id
                        LEFT JOIN maxhanna.user_display_pictures oudp on oudp.user_id = a.origin_user_id
                        LEFT JOIN maxhanna.users du on du.id = a.destination_user_id
                        LEFT JOIN maxhanna.user_display_pictures dudp on dudp.user_id = a.destination_user_id
                        WHERE destination_user_id = @UserId";
				}
				using (MySqlCommand sqlCmd = new MySqlCommand(sql, conn, transaction))
				{
					if (onlyCurrentBase)
					{
						sqlCmd.Parameters.AddWithValue("@DestX", nexusBase.CoordsX);
						sqlCmd.Parameters.AddWithValue("@DestY", nexusBase.CoordsY);
					}
					else
					{
						sqlCmd.Parameters.AddWithValue("@UserId", nexusBase.User?.Id ?? 0);
					}

					//_ = _log.Db("attacks received sql " + sqlCmd.CommandText);

					using (var reader = await sqlCmd.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{
							if (attacks == null)
							{
								attacks = new List<NexusAttackSent>();
							}
							var originDisplayPicture = new FileEntry
							{
								Id = reader.IsDBNull(reader.GetOrdinal("origin_file_id")) ? 0 : reader.GetInt32("origin_file_id")
							};
							var destinationDisplayPicture = new FileEntry
							{
								Id = reader.IsDBNull(reader.GetOrdinal("destination_file_id")) ? 0 : reader.GetInt32("destination_file_id")
							};

							var attack = new NexusAttackSent
							{
								Id = reader.GetInt32(reader.GetOrdinal("id")),
								OriginCoordsX = reader.GetInt32(reader.GetOrdinal("origin_coords_x")),
								OriginCoordsY = reader.GetInt32(reader.GetOrdinal("origin_coords_y")),
								OriginUser =
											new User(reader.IsDBNull(reader.GetOrdinal("origin_user_id")) ? 0 : reader.GetInt32("origin_user_id"),
													reader.IsDBNull(reader.GetOrdinal("origin_username")) ? "Anonymous" : reader.GetString("origin_username"),
													originDisplayPicture),

								DestinationCoordsX = reader.GetInt32(reader.GetOrdinal("destination_coords_x")),
								DestinationCoordsY = reader.GetInt32(reader.GetOrdinal("destination_coords_y")),
								DestinationUser =
											new User(reader.IsDBNull(reader.GetOrdinal("destination_user_id")) ? 0 : reader.GetInt32("destination_user_id"),
													reader.IsDBNull(reader.GetOrdinal("destination_username")) ? "Anonymous" : reader.GetString("destination_username"),
													destinationDisplayPicture),
								Duration = reader.IsDBNull(reader.GetOrdinal("duration")) ? 0 : reader.GetInt32("duration"),
								Timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp")) ? DateTime.Now : reader.GetDateTime("timestamp"),
							};

							if (withUnits)
							{
								attack.MarineTotal = reader.IsDBNull(reader.GetOrdinal("marine_total")) ? null : reader.GetInt32("marine_total");
								attack.GoliathTotal = reader.IsDBNull(reader.GetOrdinal("goliath_total")) ? null : reader.GetInt32("goliath_total");
								attack.SiegeTankTotal = reader.IsDBNull(reader.GetOrdinal("siege_tank_total")) ? null : reader.GetInt32("siege_tank_total");
								attack.ScoutTotal = reader.IsDBNull(reader.GetOrdinal("scout_total")) ? null : reader.GetInt32("scout_total");
								attack.WraithTotal = reader.IsDBNull(reader.GetOrdinal("wraith_total")) ? null : reader.GetInt32("wraith_total");
								attack.BattlecruiserTotal = reader.IsDBNull(reader.GetOrdinal("battlecruiser_total")) ? null : reader.GetInt32("battlecruiser_total");
								attack.GlitcherTotal = reader.IsDBNull(reader.GetOrdinal("glitcher_total")) ? null : reader.GetInt32("glitcher_total");
							}

							attacks.Add(attack);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while GetNexusAttacksIncoming. " + ex.Message, nexusBase.User?.Id, "NEXUS", true);
			}
			finally
			{
				if (!passedInConn && conn != null)
				{ 
					await conn.CloseAsync();
				}
			}

			return attacks;
		}


		private async Task<List<NexusAttackSent>?> GetNexusDefencesIncoming(NexusBase? nexusBase, bool onlyCurrentBase, bool withUnits, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
		{
			List<NexusAttackSent>? attacks = null;
			if (nexusBase == null) return attacks; 
			bool passedInConn = conn != null;

			try
			{
				if (!passedInConn)
				{
					conn = new MySqlConnection(_connectionString);
					await conn.OpenAsync();
				}

				string sql = "";
				if (onlyCurrentBase)
				{
					sql = @"
                        SELECT a.*, ou.username as origin_username, du.username as destination_username, oudp.file_id as origin_file_id, dudp.file_id as destination_file_id
                        FROM maxhanna.nexus_defences_sent a 
                        LEFT JOIN maxhanna.users ou on ou.id = a.origin_user_id
                        LEFT JOIN maxhanna.user_display_pictures oudp on oudp.user_id = a.origin_user_id
                        LEFT JOIN maxhanna.users du on du.id = a.destination_user_id
                        LEFT JOIN maxhanna.user_display_pictures dudp on dudp.user_id = a.destination_user_id 
                        WHERE destination_coords_x = @DestX AND destination_coords_y = @DestY;";
				}
				else
				{
					sql = @"
                        SELECT a.*, ou.username as origin_username, du.username as destination_username, oudp.file_id as origin_file_id, dudp.file_id as destination_file_id
                        FROM maxhanna.nexus_defences_sent a 
                        LEFT JOIN maxhanna.users ou on ou.id = a.origin_user_id
                        LEFT JOIN maxhanna.user_display_pictures oudp on oudp.user_id = a.origin_user_id
                        LEFT JOIN maxhanna.users du on du.id = a.destination_user_id
                        LEFT JOIN maxhanna.user_display_pictures dudp on dudp.user_id = a.destination_user_id 
                        WHERE destination_user_id = @UserId";

				}
				using (MySqlCommand sqlCmd = new MySqlCommand(sql, conn))
				{
					if (transaction != null)
					{
						sqlCmd.Transaction = transaction;
					}

					if (onlyCurrentBase)
					{
						sqlCmd.Parameters.AddWithValue("@DestX", nexusBase.CoordsX);
						sqlCmd.Parameters.AddWithValue("@DestY", nexusBase.CoordsY);
					}
					else
					{
						sqlCmd.Parameters.AddWithValue("@UserId", nexusBase.User?.Id ?? 0);
					}
					 
					using (var reader = await sqlCmd.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{
							if (attacks == null)
							{
								attacks = new List<NexusAttackSent>();
							}

							var originDisplayPicture = new FileEntry
							{
								Id = reader.IsDBNull(reader.GetOrdinal("origin_file_id")) ? 0 : reader.GetInt32("origin_file_id")
							};
							var destinationDisplayPicture = new FileEntry
							{
								Id = reader.IsDBNull(reader.GetOrdinal("destination_file_id")) ? 0 : reader.GetInt32("destination_file_id")
							};

							var attack = new NexusAttackSent
							{
								Id = reader.GetInt32(reader.GetOrdinal("id")),
								OriginCoordsX = reader.GetInt32(reader.GetOrdinal("origin_coords_x")),
								OriginCoordsY = reader.GetInt32(reader.GetOrdinal("origin_coords_y")),
								OriginUser =
											new User(reader.IsDBNull(reader.GetOrdinal("origin_user_id")) ? 0 : reader.GetInt32("origin_user_id"),
													reader.IsDBNull(reader.GetOrdinal("origin_username")) ? "Anonymous" : reader.GetString("origin_username"),
													originDisplayPicture),

								DestinationCoordsX = reader.GetInt32(reader.GetOrdinal("destination_coords_x")),
								DestinationCoordsY = reader.GetInt32(reader.GetOrdinal("destination_coords_y")),
								DestinationUser =
											new User(reader.IsDBNull(reader.GetOrdinal("destination_user_id")) ? 0 : reader.GetInt32("destination_user_id"),
													reader.IsDBNull(reader.GetOrdinal("destination_username")) ? "Anonymous" : reader.GetString("destination_username"),
													destinationDisplayPicture),
								Duration = reader.IsDBNull(reader.GetOrdinal("duration")) ? 0 : reader.GetInt32("duration"),
								Timestamp = reader.IsDBNull(reader.GetOrdinal("timestamp")) ? DateTime.Now : reader.GetDateTime("timestamp"),
								Arrived = reader.IsDBNull(reader.GetOrdinal("arrived")) ? false : reader.GetBoolean("arrived"),
							};

							if (withUnits)
							{
								attack.MarineTotal = reader.IsDBNull(reader.GetOrdinal("marine_total")) ? null : reader.GetInt32("marine_total");
								attack.GoliathTotal = reader.IsDBNull(reader.GetOrdinal("goliath_total")) ? null : reader.GetInt32("goliath_total");
								attack.SiegeTankTotal = reader.IsDBNull(reader.GetOrdinal("siege_tank_total")) ? null : reader.GetInt32("siege_tank_total");
								attack.ScoutTotal = reader.IsDBNull(reader.GetOrdinal("scout_total")) ? null : reader.GetInt32("scout_total");
								attack.WraithTotal = reader.IsDBNull(reader.GetOrdinal("wraith_total")) ? null : reader.GetInt32("wraith_total");
								attack.BattlecruiserTotal = reader.IsDBNull(reader.GetOrdinal("battlecruiser_total")) ? null : reader.GetInt32("battlecruiser_total");
								attack.GlitcherTotal = reader.IsDBNull(reader.GetOrdinal("glitcher_total")) ? null : reader.GetInt32("glitcher_total");
							}

							attacks.Add(attack);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while GetNexusDefencesIncoming. " + ex.Message, nexusBase.User?.Id, "NEXUS", true);
			}
			finally
			{
				if (!passedInConn && conn != null)
				{
					await conn.CloseAsync();
				}
			}

			return attacks;
		}


		private async Task UpdateNexusUnits(NexusBase nexusBase, int marinesTotal, int goliathTotal, int siegeTankTotal, int scoutTotal, int wraithTotal, int battlecruiserTotal, int glitcherTotal, MySqlConnection? conn, MySqlTransaction? transaction)
		{ 
			string sql = @"
        UPDATE maxhanna.nexus_units 
        SET 
            marine_total = @Marine, 
            goliath_total = @Goliath, 
            siege_tank_total = @SiegeTank, 
            scout_total = @Scout, 
            wraith_total = @Wraith, 
            battlecruiser_total = @Battlecruiser,
            glitcher_total = @Glitcher
        WHERE 
            coords_x = @CoordsX 
        AND coords_y = @CoordsY;";

			var parameters = new Dictionary<string, object?>
			{
					{ "@CoordsX", nexusBase.CoordsX },
					{ "@CoordsY", nexusBase.CoordsY },
					{ "@Marine", Math.Max(0, marinesTotal) },
					{ "@Goliath", Math.Max(0, goliathTotal) },
					{ "@SiegeTank", Math.Max(0, siegeTankTotal) },
					{ "@Scout", Math.Max(0, scoutTotal) },
					{ "@Wraith", Math.Max(0, wraithTotal) },
					{ "@Battlecruiser", Math.Max(0, battlecruiserTotal) },
					{ "@Glitcher", Math.Max(0, glitcherTotal) }
			}; 
			await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction); 
		}

		private async Task UpdateSupportingUnitsAfterAttack(NexusAttackSent supportingUnitsSent, Dictionary<String, int?>? losses, MySqlConnection? conn, MySqlTransaction? transaction)
		{ 
			if (supportingUnitsSent != null)
			{
				Dictionary<string, object?> parameters = new Dictionary<string, object?>();

				if (supportingUnitsSent.MarineTotal <= 0 && supportingUnitsSent.GoliathTotal <= 0 && supportingUnitsSent.SiegeTankTotal <= 0 && supportingUnitsSent.ScoutTotal <= 0
				&& supportingUnitsSent.WraithTotal <= 0 && supportingUnitsSent.BattlecruiserTotal <= 0 && supportingUnitsSent.GlitcherTotal <= 0)
				{
					string sql = @"
            DELETE FROM maxhanna.nexus_defences_sent
            WHERE id = @DefenceId LIMIT 1;";

					parameters = new Dictionary<string, object?>
					{
							{ "@DefenceId", supportingUnitsSent.Id}
					};
					await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
				}
				else
				{
					string sql = @"
                        UPDATE maxhanna.nexus_defences_sent 
                        SET 
                            marine_total = GREATEST(0, @MarineTotal), 
                            goliath_total = GREATEST(0, @GoliathTotal), 
                            siege_tank_total = GREATEST(0, @SiegeTankTotal), 
                            scout_total = GREATEST(0, @ScoutTotal), 
                            wraith_total = GREATEST(0, @WraithTotal), 
                            battlecruiser_total = GREATEST(0, @BattlecruiserTotal), 
                            glitcher_total = GREATEST(0, @GlitcherTotal)
                        WHERE 
                            id = @DefenceId 
                        LIMIT 1;";
					parameters = new Dictionary<string, object?>
										{
												{ "@DefenceId", supportingUnitsSent.Id},
												{ "@MarineTotal", supportingUnitsSent.MarineTotal - (losses?["marine"] ?? 0)},
												{ "@GoliathTotal", supportingUnitsSent.GoliathTotal - (losses?["goliath"] ?? 0) },
												{ "@SiegeTankTotal", supportingUnitsSent.SiegeTankTotal - (losses?["siege_tank"] ?? 0) },
												{ "@ScoutTotal", supportingUnitsSent.ScoutTotal - (losses?["scout"] ?? 0) },
												{ "@WraithTotal", supportingUnitsSent.WraithTotal - (losses?["wraith"] ?? 0) },
												{ "@BattlecruiserTotal", supportingUnitsSent.BattlecruiserTotal - (losses?["battlecruiser"] ?? 0) },
												{ "@GlitcherTotal", supportingUnitsSent.GlitcherTotal - (losses?["glitcher"] ?? 0) },
										};
					await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
				}
			} 
			return;
		}

		private async Task UpdateNexusSupply(NexusBase nexusBase, int? supply, MySqlConnection? conn, MySqlTransaction? transaction)
		{ 
			if (supply != null)
			{
				string sql = @"UPDATE maxhanna.nexus_bases SET supply = @Supply WHERE coords_x = @CoordsX AND coords_y = @CoordsY LIMIT 1;";

				var parameters = new Dictionary<string, object?>
								{
										{ "@CoordsX", nexusBase.CoordsX },
										{ "@CoordsY", nexusBase.CoordsY },
										{ "@Supply", Math.Max(0, (int)supply) }
								};

				await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction); 
			} 
			return;
		}


		private async Task<bool> DoesBaseHaveEnoughUnitsToSendAttack(NexusBase originNexus, UnitStats[]? unitsSent, bool skipAttackingUnits, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			NexusUnits? units = await GetNexusUnits(originNexus, true, conn, transaction);
			//_ = _log.Db($"Got these units at base : m:{units?.MarineTotal} g:{units?.GoliathTotal} st:{units?.SiegeTankTotal} s:{units?.ScoutTotal} w:{units?.WraithTotal} b:{units?.BattlecruiserTotal} gl:{units?.GlitcherTotal}");
			if (units == null || units.MarineTotal < 0 || units.GoliathTotal < 0 || units.SiegeTankTotal < 0 || units.ScoutTotal < 0 || units.WraithTotal < 0 || units.BattlecruiserTotal < 0 || units.GlitcherTotal < 0)
			{
				//_ = _log.Db($"Units sent less than zero!");
				return false;
			}
			CalculateUnitsAvailableAfterSendingUnits(units, unitsSent, out int marinesTotal, out int goliathTotal, out int siegeTankTotal,
					out int scoutTotal, out int wraithTotal, out int battlecruiserTotal, out int glitcherTotal);
			//_ = _log.Db($"Got these units after sending units : m:{marinesTotal} g:{goliathTotal} st:{siegeTankTotal} s:{scoutTotal} w:{wraithTotal} b:{battlecruiserTotal} gl:{glitcherTotal}");
			if (units == null || marinesTotal < 0 || goliathTotal < 0 || siegeTankTotal < 0 || scoutTotal < 0 || wraithTotal < 0 || battlecruiserTotal < 0 || glitcherTotal < 0)
			{
				//_ = _log.Db($"Units sent less than zero!");
				return false;
			} 
			return (marinesTotal >= 0 && goliathTotal >= 0 && siegeTankTotal >= 0 && scoutTotal >= 0 && wraithTotal >= 0 && battlecruiserTotal >= 0 && glitcherTotal >= 0);
		}

		private static void CalculateUnitsAvailableAfterSendingUnits(NexusUnits? playerUnits, UnitStats[]? unitsSent,
				out int marinesTotal, out int goliathTotal, out int siegeTankTotal, out int scoutTotal, out int wraithTotal, out int battlecruiserTotal, out int glitcherTotal)
		{
			marinesTotal = (playerUnits?.MarineTotal ?? 0);
			goliathTotal = (playerUnits?.GoliathTotal ?? 0);
			siegeTankTotal = (playerUnits?.SiegeTankTotal ?? 0);
			scoutTotal = (playerUnits?.ScoutTotal ?? 0);
			wraithTotal = (playerUnits?.WraithTotal ?? 0);
			battlecruiserTotal = (playerUnits?.BattlecruiserTotal ?? 0);
			glitcherTotal = (playerUnits?.GlitcherTotal ?? 0);
			if (playerUnits == null)
			{
				//_ = _log.Db("No player units, returning");
				return;
			};

			if (unitsSent != null)
			{
				//for (var x = 0; x < unitsSent.Length; x++)
				//{
				//    _ = _log.Db(unitsSent[x].SentValue + " " + unitsSent[x].UnitType);
				//}
				marinesTotal -= (unitsSent?.First(x => x.UnitType == "marine").SentValue ?? 0);
				goliathTotal -= (unitsSent?.First(x => x.UnitType == "goliath").SentValue ?? 0);
				siegeTankTotal -= (unitsSent?.First(x => x.UnitType == "siege_tank").SentValue ?? 0);
				scoutTotal -= (unitsSent?.First(x => x.UnitType == "scout").SentValue ?? 0);
				wraithTotal -= (unitsSent?.First(x => x.UnitType == "wraith").SentValue ?? 0);
				battlecruiserTotal -= (unitsSent?.First(x => x.UnitType == "battlecruiser").SentValue ?? 0);
				glitcherTotal -= (unitsSent?.First(x => x.UnitType == "glitcher").SentValue ?? 0);
			}

		}

		private static bool DoesBaseContainUnits(NexusUnits playerUnits)
		{
			return !(playerUnits.MarineTotal == 0 && playerUnits.GoliathTotal == 0 && playerUnits.SiegeTankTotal == 0
					&& playerUnits.ScoutTotal == 0 && playerUnits.WraithTotal == 0 && playerUnits.BattlecruiserTotal == 0 && playerUnits.GlitcherTotal == 0);
		}

		private async Task<List<UnitStats>> GetUnitStatsFromDB(int? unitId, string? unitType, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
		{
			List<UnitStats> unitStats = new List<UnitStats>();
			bool createdConnection = false;

			try
			{
				if (conn == null)
				{
					conn = new MySqlConnection(_connectionString);
					await conn.OpenAsync();
					createdConnection = true;
				}

				string sql = $@"
                    SELECT 
                        nut.id as unit_id, 
                        nut.type as unit_type, 
                        n.unit_level, 
                        n.duration, 
                        n.cost,
                        n.supply,
                        n.speed,
                        n.gold_carrying_capacity,
                        n.ground_damage,
                        n.air_damage,
                        n.building_damage,
                        n.starport_level,
                        n.factory_level,
                        n.engineering_bay_level
                    FROM 
                        maxhanna.nexus_unit_stats n
                    LEFT JOIN
                        maxhanna.nexus_unit_types nut ON nut.id = n.unit_id
                    WHERE 1=1
                    {(unitId != null ? " AND nut.id = @UnitId" : "")}
                    {(unitType != null ? " AND nut.type = @UnitType" : "")};";

				using (MySqlCommand cmd = new MySqlCommand(sql, conn, transaction))
				{
					if (unitId != null)
					{
						cmd.Parameters.AddWithValue("@UnitId", unitId);
					}
					if (unitType != null)
					{
						cmd.Parameters.AddWithValue("@UnitType", unitType);
					}
					using (var reader = await cmd.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{
							var unitStat = new UnitStats
							{
								UnitId = reader.GetInt32(reader.GetOrdinal("unit_id")),
								UnitType = reader.GetString(reader.GetOrdinal("unit_type")),
								UnitLevel = reader.GetInt32(reader.GetOrdinal("unit_level")),
								Duration = reader.GetInt32(reader.GetOrdinal("duration")),
								Cost = reader.GetInt32(reader.GetOrdinal("cost")),
								Speed = reader.GetDecimal(reader.GetOrdinal("speed")),
								Supply = reader.GetInt32(reader.GetOrdinal("supply")),
								GoldCarryingCapacity = reader.GetInt32(reader.GetOrdinal("gold_carrying_capacity")),
								GroundDamage = reader.GetInt32(reader.GetOrdinal("ground_damage")),
								AirDamage = reader.GetInt32(reader.GetOrdinal("air_damage")),
								BuildingDamage = reader.GetInt32(reader.GetOrdinal("building_damage")),
								StarportLevel = reader.GetInt32(reader.GetOrdinal("starport_level")),
								EngineeringBayLevel = reader.GetInt32(reader.GetOrdinal("engineering_bay_level")),
								FactoryLevel = reader.GetInt32(reader.GetOrdinal("factory_level")),
							};
							unitStats.Add(unitStat);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while GetUnitStatsFromDB. " + ex.Message, null, "NEXUS", true);
			}
			finally
			{
				if (createdConnection && conn != null)
				{
					await conn.CloseAsync();
				}
			}

			return unitStats;
		}



		private async Task<List<UnitUpgradeStats>> GetUnitUpgradeStatsFromDB(MySqlConnection? conn = null, MySqlTransaction? transaction = null)
		{
			List<UnitUpgradeStats> upgradeStats = new List<UnitUpgradeStats>();
			bool createdConnection = false;

			try
			{
				if (conn == null)
				{
					conn = new MySqlConnection(_connectionString);
					await conn.OpenAsync();
					createdConnection = true;
				}

				string sql = $@"
                    SELECT 
                        unit_level, 
                        damage_multiplier, 
                        duration
                    FROM 
                        maxhanna.nexus_unit_upgrade_stats
                    WHERE 1=1;";
				using (MySqlCommand cmd = new MySqlCommand(sql, conn, transaction))
				{

					using (var reader = await cmd.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{
							var upgradeStat = new UnitUpgradeStats
							{
								UnitLevel = reader.GetInt32(reader.GetOrdinal("unit_level")),
								DamageMultiplier = reader.GetDecimal(reader.GetOrdinal("damage_multiplier")),
								Duration = reader.GetInt32(reader.GetOrdinal("duration"))
							};
							upgradeStats.Add(upgradeStat);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred while GetUpgradeUnitStatsFromDB." + ex.Message, null, "NEXUS", true);
			}
			finally
			{
				if (createdConnection && conn != null)
				{
					await conn.CloseAsync();
				}
			}

			return upgradeStats;
		}

		private async Task<NexusBase?> GetNexusBase(int? coordsX, int? coordsY, MySqlConnection? connection = null, MySqlTransaction? transaction = null)
		{
			NexusBase? nexusBase = null;

			if (coordsX == null || coordsY == null) return nexusBase;

			bool shouldCloseConnection = false;
			MySqlConnection? conn = connection;

			try
			{
				if (conn == null)
				{
					conn = new MySqlConnection(_connectionString);
					await conn.OpenAsync();
					shouldCloseConnection = true;
				}

				string sqlBase = "SELECT * FROM nexus_bases WHERE coords_x = @CoordsX AND coords_y = @CoordsY";
				MySqlCommand cmdBase = new MySqlCommand(sqlBase, conn, transaction);
				cmdBase.Parameters.AddWithValue("@CoordsX", coordsX);
				cmdBase.Parameters.AddWithValue("@CoordsY", coordsY);

				using (var readerBase = await cmdBase.ExecuteReaderAsync())
				{
					if (await readerBase.ReadAsync())
					{
						nexusBase = new NexusBase
						{
							User = new User(readerBase.IsDBNull(readerBase.GetOrdinal("user_id")) ? 0 : readerBase.GetInt32("user_id"), "Anonymous"),
							BaseName = readerBase.IsDBNull(readerBase.GetOrdinal("base_name")) ? null : readerBase.GetString("base_name"),
							Gold = readerBase.IsDBNull(readerBase.GetOrdinal("gold")) ? 0 : readerBase.GetDecimal("gold"),
							Supply = readerBase.IsDBNull(readerBase.GetOrdinal("supply")) ? 0 : readerBase.GetInt32("supply"),
							CoordsX = readerBase.IsDBNull(readerBase.GetOrdinal("coords_x")) ? 0 : readerBase.GetInt32("coords_x"),
							CoordsY = readerBase.IsDBNull(readerBase.GetOrdinal("coords_y")) ? 0 : readerBase.GetInt32("coords_y"),
							CommandCenterLevel = readerBase.IsDBNull(readerBase.GetOrdinal("command_center_level")) ? 0 : readerBase.GetInt32("command_center_level"),
							MinesLevel = readerBase.IsDBNull(readerBase.GetOrdinal("mines_level")) ? 0 : readerBase.GetInt32("mines_level"),
							SupplyDepotLevel = readerBase.IsDBNull(readerBase.GetOrdinal("supply_depot_level")) ? 0 : readerBase.GetInt32("supply_depot_level"),
							EngineeringBayLevel = readerBase.IsDBNull(readerBase.GetOrdinal("engineering_bay_level")) ? 0 : readerBase.GetInt32("engineering_bay_level"),
							WarehouseLevel = readerBase.IsDBNull(readerBase.GetOrdinal("warehouse_level")) ? 0 : readerBase.GetInt32("warehouse_level"),
							FactoryLevel = readerBase.IsDBNull(readerBase.GetOrdinal("factory_level")) ? 0 : readerBase.GetInt32("factory_level"),
							StarportLevel = readerBase.IsDBNull(readerBase.GetOrdinal("starport_level")) ? 0 : readerBase.GetInt32("starport_level"),
							MarineLevel = readerBase.IsDBNull(readerBase.GetOrdinal("marine_level")) ? 0 : readerBase.GetInt32("marine_level"),
							GoliathLevel = readerBase.IsDBNull(readerBase.GetOrdinal("goliath_level")) ? 0 : readerBase.GetInt32("goliath_level"),
							SiegeTankLevel = readerBase.IsDBNull(readerBase.GetOrdinal("siege_tank_level")) ? 0 : readerBase.GetInt32("siege_tank_level"),
							ScoutLevel = readerBase.IsDBNull(readerBase.GetOrdinal("scout_level")) ? 0 : readerBase.GetInt32("scout_level"),
							WraithLevel = readerBase.IsDBNull(readerBase.GetOrdinal("wraith_level")) ? 0 : readerBase.GetInt32("wraith_level"),
							BattlecruiserLevel = readerBase.IsDBNull(readerBase.GetOrdinal("battlecruiser_level")) ? 0 : readerBase.GetInt32("battlecruiser_level"),
							GlitcherLevel = readerBase.IsDBNull(readerBase.GetOrdinal("glitcher_level")) ? 0 : readerBase.GetInt32("glitcher_level"),
							Conquered = readerBase.IsDBNull(readerBase.GetOrdinal("conquered")) ? DateTime.MinValue : readerBase.GetDateTime("conquered"),
							Updated = readerBase.IsDBNull(readerBase.GetOrdinal("updated")) ? DateTime.MinValue : readerBase.GetDateTime("updated"),
						};
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while GetNexusBase. " + ex.Message, nexusBase?.User?.Id, "NEXUS", true);
			}
			finally
			{
				if (shouldCloseConnection && conn != null)
				{
					await conn.CloseAsync();
				}
			}

			return nexusBase;
		}



		private async Task<NexusBaseUpgrades?> GetNexusBaseUpgrades(NexusBase? nexusBase, MySqlConnection connection, MySqlTransaction transaction)
		{
			NexusBaseUpgrades? nexusBaseUpgrades = null;
			if (nexusBase == null) { return nexusBaseUpgrades; }
			{
				try
				{
					string sqlUpgrades = @"
                            SELECT * 
                            FROM nexus_base_upgrades 
                            WHERE 
                                coords_x = @CoordsX 
                            AND coords_y = @CoordsY";
					MySqlCommand cmdUpgrades = new MySqlCommand(sqlUpgrades, connection, transaction);
					cmdUpgrades.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
					cmdUpgrades.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

					using (var readerUpgrades = await cmdUpgrades.ExecuteReaderAsync())
					{
						if (await readerUpgrades.ReadAsync())
						{
							nexusBaseUpgrades = new NexusBaseUpgrades
							{
								CoordsX = readerUpgrades.GetInt32("coords_x"),
								CoordsY = readerUpgrades.GetInt32("coords_y"),
								CommandCenterUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("command_center_upgraded")) ? null : readerUpgrades.GetDateTime("command_center_upgraded"),
								MinesUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("mines_upgraded")) ? null : readerUpgrades.GetDateTime("mines_upgraded"),
								SupplyDepotUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("supply_depot_upgraded")) ? null : readerUpgrades.GetDateTime("supply_depot_upgraded"),
								EngineeringBayUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("engineering_bay_upgraded")) ? null : readerUpgrades.GetDateTime("engineering_bay_upgraded"),
								WarehouseUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("warehouse_upgraded")) ? null : readerUpgrades.GetDateTime("warehouse_upgraded"),
								FactoryUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("factory_upgraded")) ? null : readerUpgrades.GetDateTime("factory_upgraded"),
								StarportUpgraded = readerUpgrades.IsDBNull(readerUpgrades.GetOrdinal("starport_upgraded")) ? null : readerUpgrades.GetDateTime("starport_upgraded"),
							};
						}
					}
				}
				catch (Exception ex)
				{
					_ = _log.Db($"An error occurred while GetNexusBaseUpgrades. " + ex.Message, nexusBase.User?.Id, "NEXUS", true);
				}
			}

			return nexusBaseUpgrades;
		}
		private async Task<List<NexusAttackSent>> GetNexusUnitsSupportingBase(NexusBase? nexusBase, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			bool passedInConn = conn != null;
			List<NexusAttackSent> nexusUnitsList = new List<NexusAttackSent>();

			if (nexusBase == null) return nexusUnitsList;

			if (!passedInConn)
			{
				conn = new MySqlConnection(_connectionString);
			}

			try
			{
				if (!passedInConn && conn != null)
				{
					await conn.OpenAsync();
				}
				string sqlUnits = @"
                    SELECT * 
                    FROM nexus_defences_sent
                    WHERE 
                        destination_coords_x = @CoordsX 
                    AND destination_coords_y = @CoordsY";
				MySqlCommand cmdUnits = new MySqlCommand(sqlUnits, conn, transaction);
				cmdUnits.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
				cmdUnits.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);

				using (var readerUnits = await cmdUnits.ExecuteReaderAsync())
				{
					while (await readerUnits.ReadAsync()) // Use while loop to read all rows
					{
						NexusAttackSent nexusUnits = new NexusAttackSent
						{
							Id = readerUnits.GetInt32("id"),
							OriginCoordsX = readerUnits.GetInt32("origin_coords_x"),
							OriginCoordsY = readerUnits.GetInt32("origin_coords_y"),
							DestinationCoordsX = readerUnits.GetInt32("destination_coords_x"),
							DestinationCoordsY = readerUnits.GetInt32("destination_coords_y"),
							MarineTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("marine_total")) ? null : readerUnits.GetInt32("marine_total"),
							GoliathTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("goliath_total")) ? null : readerUnits.GetInt32("goliath_total"),
							SiegeTankTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("siege_tank_total")) ? null : readerUnits.GetInt32("siege_tank_total"),
							ScoutTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("scout_total")) ? null : readerUnits.GetInt32("scout_total"),
							WraithTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("wraith_total")) ? null : readerUnits.GetInt32("wraith_total"),
							BattlecruiserTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("battlecruiser_total")) ? null : readerUnits.GetInt32("battlecruiser_total"),
							GlitcherTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("glitcher_total")) ? null : readerUnits.GetInt32("glitcher_total"),
							Arrived = readerUnits.IsDBNull(readerUnits.GetOrdinal("arrived")) ? false : readerUnits.GetBoolean("arrived"),
							Duration = readerUnits.IsDBNull(readerUnits.GetOrdinal("duration")) ? 0 : readerUnits.GetInt32("duration"),
							Timestamp = readerUnits.IsDBNull(readerUnits.GetOrdinal("timestamp")) ? DateTime.MinValue : readerUnits.GetDateTime("timestamp"),
						};

						nexusUnitsList.Add(nexusUnits); // Add each unit to the list
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while GetNexusUnits. " + ex.Message, nexusBase.User?.Id, "NEXUS", true);
			}
			finally
			{
				if (!passedInConn && conn != null)
				{
					await conn.CloseAsync();
				}
			}

			return nexusUnitsList; // Return the list of NexusUnits
		}

		private async Task<NexusUnits?> GetNexusUnits(NexusBase? nexusBase, bool currentlyInBase, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			bool passedInConn = conn != null;
			NexusUnits? nexusUnits = null;
			if (nexusBase == null) return nexusUnits;

			if (!passedInConn)
			{
				conn = new MySqlConnection(_connectionString);
			}

			try
			{
				if (!passedInConn && conn != null)
				{
					await conn.OpenAsync();
				}
				string sqlUnits = @"
                    SELECT * 
                    FROM nexus_units 
                    WHERE 
                        coords_x = @CoordsX 
                    AND coords_y = @CoordsY";
				MySqlCommand cmdUnits = new MySqlCommand(sqlUnits, conn, transaction);
				cmdUnits.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
				cmdUnits.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);
				using (var readerUnits = await cmdUnits.ExecuteReaderAsync())
				{
					if (await readerUnits.ReadAsync())
					{
						nexusUnits = new NexusUnits
						{
							CoordsX = readerUnits.GetInt32("coords_x"),
							CoordsY = readerUnits.GetInt32("coords_y"),
							MarineTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("marine_total")) ? null : readerUnits.GetInt32("marine_total"),
							GoliathTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("goliath_total")) ? null : readerUnits.GetInt32("goliath_total"),
							SiegeTankTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("siege_tank_total")) ? null : readerUnits.GetInt32("siege_tank_total"),
							ScoutTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("scout_total")) ? null : readerUnits.GetInt32("scout_total"),
							WraithTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("wraith_total")) ? null : readerUnits.GetInt32("wraith_total"),
							BattlecruiserTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("battlecruiser_total")) ? null : readerUnits.GetInt32("battlecruiser_total"),
							GlitcherTotal = readerUnits.IsDBNull(readerUnits.GetOrdinal("glitcher_total")) ? null : readerUnits.GetInt32("glitcher_total")
						};
					}
				}
				if (currentlyInBase && nexusUnits != null)
				{
					List<NexusAttackSent>? nexusAttacksSent = await GetNexusAttacksSent(nexusBase, true, conn, transaction);
					List<NexusAttackSent>? nexusDefencesSent = await GetNexusDefencesSent(nexusBase, true, conn, transaction);

					if (nexusDefencesSent != null)
					{
						if (nexusAttacksSent == null)
						{
							nexusAttacksSent = new List<NexusAttackSent>();
						}

						var attackIds = new HashSet<int>(nexusAttacksSent.Select(a => a.Id));
						var uniqueDefences = nexusDefencesSent.Where(d => !attackIds.Contains(d.Id));

						nexusAttacksSent = nexusAttacksSent.Concat(uniqueDefences).ToList();
					}
					List<UnitStats> unitsSent = await GetUnitStatsFromDB(null, null, conn, transaction);
					unitsSent = AggregateUnitsSentIntoUnitStats(nexusAttacksSent, unitsSent);

					CalculateUnitsAvailableAfterSendingUnits(nexusUnits, unitsSent.ToArray(), out int marinesTotal, out int goliathTotal,
							out int siegeTankTotal, out int scoutTotal, out int wraithTotal, out int battlecruiserTotal, out int glitcherTotal);
					nexusUnits = new NexusUnits
					{
						CoordsX = nexusUnits.CoordsX,
						CoordsY = nexusUnits.CoordsY,
						MarineTotal = marinesTotal,
						GoliathTotal = goliathTotal,
						SiegeTankTotal = siegeTankTotal,
						ScoutTotal = scoutTotal,
						WraithTotal = wraithTotal,
						BattlecruiserTotal = battlecruiserTotal,
						GlitcherTotal = glitcherTotal
					};
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while GetNexusUnits. " + ex.Message, nexusBase.User?.Id, "NEXUS", true);
			}
			finally
			{
				if (!passedInConn && conn != null)
				{
					await conn.CloseAsync();
				}
			}

			return nexusUnits;
		}
		private List<UnitStats> AggregateUnitsSentIntoUnitStats(List<NexusAttackSent>? nexusAttackSents, List<UnitStats> unitsSent)
		{
			unitsSent.ForEach(x => x.SentValue = 0);
			if (nexusAttackSents == null) return unitsSent;

			foreach (var attack in nexusAttackSents)
			{
				if (attack.MarineTotal.HasValue)
				{
					var marineStats = unitsSent.FirstOrDefault(x => x.UnitType == "marine");
					if (marineStats != null) marineStats.SentValue += attack.MarineTotal.Value;
				}
				if (attack.GoliathTotal.HasValue)
				{
					var goliathStats = unitsSent.FirstOrDefault(x => x.UnitType == "goliath");
					if (goliathStats != null) goliathStats.SentValue += attack.GoliathTotal.Value;
				}
				if (attack.SiegeTankTotal.HasValue)
				{
					var siegeTankStats = unitsSent.FirstOrDefault(x => x.UnitType == "siege_tank");
					if (siegeTankStats != null) siegeTankStats.SentValue += attack.SiegeTankTotal.Value;
				}
				if (attack.ScoutTotal.HasValue)
				{
					var scoutStats = unitsSent.FirstOrDefault(x => x.UnitType == "scout");
					if (scoutStats != null) scoutStats.SentValue += attack.ScoutTotal.Value;
				}
				if (attack.WraithTotal.HasValue)
				{
					var wraithStats = unitsSent.FirstOrDefault(x => x.UnitType == "wraith");
					if (wraithStats != null) wraithStats.SentValue += attack.WraithTotal.Value;
				}
				if (attack.BattlecruiserTotal.HasValue)
				{
					var battlecruiserStats = unitsSent.FirstOrDefault(x => x.UnitType == "battlecruiser");
					if (battlecruiserStats != null) battlecruiserStats.SentValue += attack.BattlecruiserTotal.Value;
				}
				if (attack.GlitcherTotal.HasValue)
				{
					var glitcherStats = unitsSent.FirstOrDefault(x => x.UnitType == "glitcher");
					if (glitcherStats != null) glitcherStats.SentValue += attack.GlitcherTotal.Value;
				}
			}

			return unitsSent;
		}

		private async Task<NexusUnits?> GetNexusAttackingUnits(NexusBase? nexusBase, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			List<NexusAttackSent>? nexusAttacksSent = await GetNexusAttacksSent(nexusBase, true, conn, transaction);

			int marinesTotal = nexusAttacksSent?.Sum(x => x.MarineTotal) ?? 0;
			int goliathTotal = nexusAttacksSent?.Sum(x => x.GoliathTotal) ?? 0;
			int siegeTankTotal = nexusAttacksSent?.Sum(x => x.SiegeTankTotal) ?? 0;
			int scoutTotal = nexusAttacksSent?.Sum(x => x.ScoutTotal) ?? 0;
			int wraithTotal = nexusAttacksSent?.Sum(x => x.WraithTotal) ?? 0;
			int battlecruiserTotal = nexusAttacksSent?.Sum(x => x.BattlecruiserTotal) ?? 0;
			int glitcherTotal = nexusAttacksSent?.Sum(x => x.GlitcherTotal) ?? 0;
			return new NexusUnits
			{
				CoordsX = nexusBase?.CoordsX ?? 0,
				CoordsY = nexusBase?.CoordsY ?? 0,
				MarineTotal = marinesTotal,
				GoliathTotal = goliathTotal,
				SiegeTankTotal = siegeTankTotal,
				ScoutTotal = scoutTotal,
				WraithTotal = wraithTotal,
				BattlecruiserTotal = battlecruiserTotal,
				GlitcherTotal = glitcherTotal
			};
		} 

		private async Task<List<NexusUnitsPurchased>?> GetNexusUnitPurchases(NexusBase? nexusBase, MySqlConnection? conn = null, MySqlTransaction? transaction = null)
		{
			if (nexusBase == null)
			{
				return new List<NexusUnitsPurchased>();
			}

			var res = new List<NexusUnitsPurchased>();
			bool createdConnection = false;

			MySqlConnection? localConn = null;

			try
			{
				if (conn == null)
				{
					localConn = new MySqlConnection(_connectionString);
					await localConn.OpenAsync();
					createdConnection = true;
					conn = localConn;
				}

				if (conn == null)
				{
					throw new InvalidOperationException("Database connection is not available.");
				}

				string sqlUnitPurchases = @"
                    SELECT * 
                    FROM nexus_unit_purchases 
                    WHERE 
                        coords_x = @CoordsX 
                    AND coords_y = @CoordsY";

				using (MySqlCommand cmdUnitPurchases = new MySqlCommand(sqlUnitPurchases, conn, transaction))
				{
					cmdUnitPurchases.Parameters.AddWithValue("@CoordsX", nexusBase.CoordsX);
					cmdUnitPurchases.Parameters.AddWithValue("@CoordsY", nexusBase.CoordsY);
					using (var readerUnitPurchases = await cmdUnitPurchases.ExecuteReaderAsync())
					{
						while (await readerUnitPurchases.ReadAsync())
						{
							var nexusUnitPurchases = new NexusUnitsPurchased
							{
								CoordsX = readerUnitPurchases.GetInt32("coords_x"),
								CoordsY = readerUnitPurchases.GetInt32("coords_y"),
								UnitIdPurchased = readerUnitPurchases.GetInt32("unit_id_purchased"),
								QuantityPurchased = readerUnitPurchases.GetInt32("quantity_purchased"),
								Timestamp = readerUnitPurchases.GetDateTime("timestamp"),
							};

							res.Add(nexusUnitPurchases);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while getting Nexus unit purchases. " + ex.Message, nexusBase.User?.Id, "NEXUS", true);
			}
			finally
			{
				if (createdConnection && localConn != null)
				{
					await localConn.CloseAsync();
				}
			}

			return res;
		}

		private async Task<NexusBase?> GetUserFirstBase(int userId, MySqlConnection connection, MySqlTransaction transaction)
		{
			//_ = _log.Db($"Get User first base for user id {user.Id}");
			NexusBase? tmpBase = null;

			try
			{
				string sql = @"
                SELECT 
                    user_id, coords_x, coords_y 
                FROM 
                    maxhanna.nexus_bases n
                WHERE user_id = @UserId
                LIMIT 1;";

				MySqlCommand cmd = new MySqlCommand(sql, connection, transaction);
				cmd.Parameters.AddWithValue("@UserId", userId);

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						tmpBase = new NexusBase();
						tmpBase.CoordsX = reader.IsDBNull(reader.GetOrdinal("coords_x")) ? 0 : reader.GetInt32(reader.GetOrdinal("coords_x"));
						tmpBase.CoordsY = reader.IsDBNull(reader.GetOrdinal("coords_y")) ? 0 : reader.GetInt32(reader.GetOrdinal("coords_y"));
						tmpBase.User = new User(reader.IsDBNull(reader.GetOrdinal("user_id")) ? 0 : reader.GetInt32(reader.GetOrdinal("user_id")), "Anonymous");
						break;
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"An error occurred getting first base for player {userId}. " + ex.Message, userId, "NEXUS", true);
			}
			return tmpBase;
		}

		private async Task<int> RecalculateNexusGold(MySqlConnection conn, MySqlTransaction transaction)
		{
			// Ensure the connection is open
			if (conn.State != System.Data.ConnectionState.Open)
			{
				await conn.OpenAsync();
			}
			if (transaction == null)
			{
				_ = _log.Db("RecalculateNexusGold Transaction is null.", null, "NEXUS", true);
				throw new InvalidOperationException("Transaction is required for this operation.");
			}

			// SQL to update gold with calculations
			string updateGoldSql = @"
                UPDATE nexus_bases nb
                JOIN nexus_mining_speed nms ON nb.mines_level = nms.mines_level
                SET nb.gold = LEAST(5000 * (nb.warehouse_level + 1), nb.gold + (
                    CASE 
                        WHEN nms.speed > 0 THEN
                            (UNIX_TIMESTAMP(NOW()) - UNIX_TIMESTAMP(nb.updated)) / nms.speed
                        ELSE 0
                    END
                )),
                nb.updated = NOW()
                WHERE nms.mines_level = nb.mines_level;";
			return (int)(await ExecuteInsertOrUpdateOrDeleteAsync(updateGoldSql, new Dictionary<string, object?>(), conn, transaction) ?? 0);
		} 

		[HttpPost("UpdateNexusGold")]
		public async Task<int> UpdateNexusGold()
		{
			int basesUpdated = 0;
			using (var conn = new MySqlConnection(_connectionString))
			{
				await conn.OpenAsync();
				MySqlTransaction? transaction = null;

				try
				{
					transaction = await conn.BeginTransactionAsync(System.Data.IsolationLevel.ReadUncommitted);
					basesUpdated = await RecalculateNexusGold(conn, transaction);

					if (transaction != null)
					{
						await transaction.CommitAsync();
					}
					else
					{
						_ = _log.Db("Transaction object is null, cannot commit.", null, "NEXUS", true);
					}

				}
				catch (Exception ex)
				{
					if (transaction != null)
					{
						await transaction.RollbackAsync();
					}

					_ = _log.Db("An error occurred while updating Nexus gold." + ex.Message, null, "NEXUS", true);
					throw;
				}
				finally
				{
					if (conn.State == System.Data.ConnectionState.Open)
					{
						await conn.CloseAsync();
					}
				}
			}
			return basesUpdated;
		}

		[HttpPost("UpdateNexusBuildings")]
		public async Task UpdateNexusBuildings()
		{
			string sql = @"
                UPDATE 
                    nexus_bases AS nb
                JOIN 
                    nexus_base_upgrades AS nbu 
                ON 
                    nb.coords_x = nbu.coords_x 
                    AND nb.coords_y = nbu.coords_y
                LEFT JOIN 
                    nexus_base_upgrade_stats AS nbus_cc 
                    ON nbus_cc.building_type = (SELECT id FROM nexus_building_types WHERE type = 'command_center') 
                    AND nbus_cc.building_level = nb.command_center_level
                LEFT JOIN 
                    nexus_base_upgrade_stats AS nbus_mines 
                    ON nbus_mines.building_type = (SELECT id FROM nexus_building_types WHERE type = 'mines') 
                    AND nbus_mines.building_level = nb.mines_level
                LEFT JOIN 
                    nexus_base_upgrade_stats AS nbus_sd 
                    ON nbus_sd.building_type = (SELECT id FROM nexus_building_types WHERE type = 'supply_depot') 
                    AND nbus_sd.building_level = nb.supply_depot_level
                LEFT JOIN 
                    nexus_base_upgrade_stats AS nbus_factory 
                    ON nbus_factory.building_type = (SELECT id FROM nexus_building_types WHERE type = 'factory') 
                    AND nbus_factory.building_level = nb.factory_level
                LEFT JOIN 
                    nexus_base_upgrade_stats AS nbus_starport 
                    ON nbus_starport.building_type = (SELECT id FROM nexus_building_types WHERE type = 'starport') 
                    AND nbus_starport.building_level = nb.starport_level
                LEFT JOIN 
                    nexus_base_upgrade_stats AS nbus_engbay 
                    ON nbus_engbay.building_type = (SELECT id FROM nexus_building_types WHERE type = 'engineering_bay') 
                    AND nbus_engbay.building_level = nb.engineering_bay_level
                LEFT JOIN 
                    nexus_base_upgrade_stats AS nbus_warehouse 
                    ON nbus_warehouse.building_type = (SELECT id FROM nexus_building_types WHERE type = 'warehouse') 
                    AND nbus_warehouse.building_level = nb.warehouse_level

                SET 
                    nb.command_center_level = IF(TIMESTAMPDIFF(SECOND, nbu.command_center_upgraded, NOW()) >= nbus_cc.duration, nb.command_center_level + 1, nb.command_center_level),
                    nbu.command_center_upgraded = IF(TIMESTAMPDIFF(SECOND, nbu.command_center_upgraded, NOW()) >= nbus_cc.duration, NULL, nbu.command_center_upgraded),

                    nb.mines_level = IF(TIMESTAMPDIFF(SECOND, nbu.mines_upgraded, NOW()) >= nbus_mines.duration, nb.mines_level + 1, nb.mines_level),
                    nbu.mines_upgraded = IF(TIMESTAMPDIFF(SECOND, nbu.mines_upgraded, NOW()) >= nbus_mines.duration, NULL, nbu.mines_upgraded),

                    nb.supply_depot_level = IF(TIMESTAMPDIFF(SECOND, nbu.supply_depot_upgraded, NOW()) >= nbus_sd.duration, nb.supply_depot_level + 1, nb.supply_depot_level),
                    nbu.supply_depot_upgraded = IF(TIMESTAMPDIFF(SECOND, nbu.supply_depot_upgraded, NOW()) >= nbus_sd.duration, NULL, nbu.supply_depot_upgraded),

                    nb.factory_level = IF(TIMESTAMPDIFF(SECOND, nbu.factory_upgraded, NOW()) >= nbus_factory.duration, nb.factory_level + 1, nb.factory_level),
                    nbu.factory_upgraded = IF(TIMESTAMPDIFF(SECOND, nbu.factory_upgraded, NOW()) >= nbus_factory.duration, NULL, nbu.factory_upgraded),

                    nb.starport_level = IF(TIMESTAMPDIFF(SECOND, nbu.starport_upgraded, NOW()) >= nbus_starport.duration, nb.starport_level + 1, nb.starport_level),
                    nbu.starport_upgraded = IF(TIMESTAMPDIFF(SECOND, nbu.starport_upgraded, NOW()) >= nbus_starport.duration, NULL, nbu.starport_upgraded),

                    nb.engineering_bay_level = IF(TIMESTAMPDIFF(SECOND, nbu.engineering_bay_upgraded, NOW()) >= nbus_engbay.duration, nb.engineering_bay_level + 1, nb.engineering_bay_level),
                    nbu.engineering_bay_upgraded = IF(TIMESTAMPDIFF(SECOND, nbu.engineering_bay_upgraded, NOW()) >= nbus_engbay.duration, NULL, nbu.engineering_bay_upgraded),

                    nb.warehouse_level = IF(TIMESTAMPDIFF(SECOND, nbu.warehouse_upgraded, NOW()) >= nbus_warehouse.duration, nb.warehouse_level + 1, nb.warehouse_level),
                    nbu.warehouse_upgraded = IF(TIMESTAMPDIFF(SECOND, nbu.warehouse_upgraded, NOW()) >= nbus_warehouse.duration, NULL, nbu.warehouse_upgraded)

                WHERE 
                    TIMESTAMPDIFF(SECOND, nbu.command_center_upgraded, NOW()) >= nbus_cc.duration 
                    OR TIMESTAMPDIFF(SECOND, nbu.mines_upgraded, NOW()) >= nbus_mines.duration
                    OR TIMESTAMPDIFF(SECOND, nbu.supply_depot_upgraded, NOW()) >= nbus_sd.duration
                    OR TIMESTAMPDIFF(SECOND, nbu.factory_upgraded, NOW()) >= nbus_factory.duration
                    OR TIMESTAMPDIFF(SECOND, nbu.starport_upgraded, NOW()) >= nbus_starport.duration
                    OR TIMESTAMPDIFF(SECOND, nbu.engineering_bay_upgraded, NOW()) >= nbus_engbay.duration
                    OR TIMESTAMPDIFF(SECOND, nbu.warehouse_upgraded, NOW()) >= nbus_warehouse.duration;";

			var parameters = new Dictionary<string, object?>();

			long? res = await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters);
			if (res != null && res > 0)
			{
				_ = _log.Db($"Updated building upgrades for {res / 2} bases.", null, "NEXUS", true);
			}
		}



		[HttpPost("UpdateNexusAttacks")]
		public async Task UpdateNexusAttacks([FromBody] NexusBase nexus)
		{
			//_ = _log.Db($"Update Nexus Attacks for {nexus.CoordsX},{nexus.CoordsY}");
			MySqlConnection conn = new MySqlConnection(_connectionString);
			await conn.OpenAsync();

			MySqlTransaction transaction = await conn.BeginTransactionAsync(System.Data.IsolationLevel.ReadUncommitted);

			try
			{
				List<UnitStats> stats = await GetUnitStatsFromDB(null, null, conn, transaction);
				UnitStats marineStats = stats.Find(x => x.UnitType == "marine")!;
				UnitStats goliathStats = stats.Find(x => x.UnitType == "goliath")!;
				UnitStats siegeTankStats = stats.Find(x => x.UnitType == "siege_tank")!;
				UnitStats scoutStats = stats.Find(x => x.UnitType == "scout")!;
				UnitStats wraithStats = stats.Find(x => x.UnitType == "wraith")!;
				UnitStats battlecruiserStats = stats.Find(x => x.UnitType == "battlecruiser")!;
				UnitStats glitcherStats = stats.Find(x => x.UnitType == "glitcher")!;

				List<NexusAttackSent>? attacks = (await GetNexusAttacksIncoming(nexus, true, true, conn, transaction)) ?? new List<NexusAttackSent>();
				List<NexusAttackSent>? attacks2 = (await GetNexusAttacksSent(nexus, true, conn, transaction)) ?? new List<NexusAttackSent>();
				if (attacks == null)
				{
					attacks = new List<NexusAttackSent>();
				}
				attacks = attacks.Concat(attacks2).ToList();

				//_ = _log.Db(" Attacks Count: " + attacks.Count);


				if (attacks != null && attacks.Count > 0)
				{
					List<UnitUpgradeStats> upgradeStats = await GetUnitUpgradeStatsFromDB(conn, transaction);
					for (var attackIndex = 0; attackIndex < attacks.Count; attackIndex++)
					{
						await PerformAttackOrDefenceIfTimeElapsed(conn, transaction, marineStats, goliathStats, siegeTankStats, scoutStats, wraithStats, battlecruiserStats, glitcherStats, attacks, attackIndex, upgradeStats);
					}
				}

				await transaction.CommitAsync();

				await conn.CloseAsync();
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error while updating attacks:" + ex.Message, null, "NEXUS", true);
				await transaction.RollbackAsync();
			}
		}

		[HttpPost("UpdateNexusDefences")]
		public async Task UpdateNexusDefences([FromBody] NexusBase nexus)
		{
			//_ = _log.Db($"Update Nexus Defences for {nexus.CoordsX},{nexus.CoordsY}");

			MySqlConnection conn = new MySqlConnection(_connectionString);
			await conn.OpenAsync();

			MySqlTransaction transaction = await conn.BeginTransactionAsync(System.Data.IsolationLevel.ReadUncommitted);

			try
			{
				List<NexusAttackSent>? defences = (await GetNexusDefencesIncoming(nexus, true, true, null, null)) ?? new List<NexusAttackSent>();
				List<NexusAttackSent>? defences2 = (await GetNexusDefencesSent(nexus, true, null, null)) ?? new List<NexusAttackSent>();
				if (defences == null)
				{
					defences = new List<NexusAttackSent>();
				}
				var defenceIds = new HashSet<int>(defences.Select(a => a.Id));
				var uniqueDefences = defences2.Where(d => !defenceIds.Contains(d.Id));

				defences = defences.Concat(uniqueDefences).ToList();

				//_ = _log.Db(" Defences Count: " + defences.Count);


				if (defences != null && defences.Count > 0)
				{
					for (var defenceIndex = 0; defenceIndex < defences.Count; defenceIndex++)
					{
						if (defences[defenceIndex] != null && defences[defenceIndex].Arrived == false)
						{
							await PerformDefenceIfTimeElapsed(conn, transaction, defences, defenceIndex);
						}
					}
					await transaction.CommitAsync();

					await conn.CloseAsync();
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error while updating attacks:" + ex.Message, null, "NEXUS", true);

				await transaction.RollbackAsync();

			}
		}

		private async Task PerformAttackOrDefenceIfTimeElapsed(MySqlConnection conn, MySqlTransaction transaction,
				UnitStats marineStats, UnitStats goliathStats, UnitStats siegeTankStats, UnitStats scoutStats, UnitStats wraithStats, UnitStats battlecruiserStats, UnitStats glitcherStats,
				List<NexusAttackSent> attacks, int attackIndex, List<UnitUpgradeStats> unitUpgradeStats)
		{
			TimeSpan timeElapsed = (DateTime.Now - attacks?[attackIndex].Timestamp) ?? TimeSpan.Zero;
			//_ = _log.Db($"Checking timeElapsed: {timeElapsed.TotalSeconds}, duration: {attacks[attackIndex].Duration} : {timeElapsed.TotalSeconds - attacks[attackIndex].Duration}");
			if (attacks == null) { attacks = new List<NexusAttackSent>(); }
			if ((timeElapsed.TotalSeconds - attacks[attackIndex].Duration) >= 0)
			{
				//_ = _log.Db($"{attacks[attackIndex].OriginCoordsX}, {attacks[attackIndex].OriginCoordsY} Attack has landed on {attacks[attackIndex].DestinationCoordsX},{attacks[attackIndex].DestinationCoordsY}!");

				NexusBase origin = await GetNexusBase(attacks[attackIndex].OriginCoordsX, attacks[attackIndex].OriginCoordsY, conn, transaction)
						?? new NexusBase() { CoordsX = attacks[attackIndex].OriginCoordsX, CoordsY = attacks[attackIndex].OriginCoordsY };

				NexusBase destination = await GetNexusBase(attacks[attackIndex].DestinationCoordsX, attacks[attackIndex].DestinationCoordsY, conn, transaction)
						?? new NexusBase() { CoordsX = attacks[attackIndex].DestinationCoordsX, CoordsY = attacks[attackIndex].DestinationCoordsY };

				await DeleteAttack(origin, destination, attacks[attackIndex].Timestamp, attacks[attackIndex].Duration, conn, transaction);
				 
				List<UnitStats> attackingUnits = new List<UnitStats>();
				List<UnitStats> attackingUnitsBeforeAttack = new List<UnitStats>();
				var units = new (UnitStats us, int? total)[]
				{
																		(marineStats, attacks[attackIndex].MarineTotal),
																		(goliathStats, attacks[attackIndex].GoliathTotal),
																		(siegeTankStats, attacks[attackIndex].SiegeTankTotal),
																		(scoutStats, attacks[attackIndex].ScoutTotal),
																		(wraithStats, attacks[attackIndex].WraithTotal),
																		(battlecruiserStats, attacks[attackIndex].BattlecruiserTotal),
																		(glitcherStats, attacks[attackIndex].GlitcherTotal),
				};
				foreach (var (us, total) in units)
				{
					if (total != null && total > 0 && us != null)
					{
						UnitStats tmp = us;
						tmp.SentValue = Math.Max(0, (total ?? 0));
						attackingUnits.Add(tmp);
						//_ = _log.Db($"added {tmp.SentValue} {tmp.UnitType} in attackingUnits");
					}
				}
				attackingUnits.ForEach(x =>
				{
					UnitStats tmp = x;
					tmp.SentValue = x.SentValue;
					attackingUnitsBeforeAttack.Add(tmp);
				}
				);
				bool scoutAttack = attackingUnits.Any(u => u.UnitType == "scout") && attackingUnits.Count == 1;

				NexusUnits? defendingUnits = await GetNexusUnits(destination, true, conn, transaction);
				List<NexusAttackSent> supportingUnits = await GetNexusUnitsSupportingBase(destination, conn, transaction);

				if (scoutAttack && defendingUnits != null)
				{
					defendingUnits.MarineTotal = 0;
					defendingUnits.GoliathTotal = 0;
					defendingUnits.SiegeTankTotal = 0;
					defendingUnits.WraithTotal = 0;
					defendingUnits.BattlecruiserTotal = 0;
					defendingUnits.GlitcherTotal = 0;
				}
				else
				{
					if (defendingUnits == null)
					{
						defendingUnits = new NexusUnits();
					}
					for (int i = 0; i < supportingUnits.Count; i++)
					{
						//_ = _log.Db($"adding support units : m:{supportingUnits[i].MarineTotal} g:{supportingUnits[i].GoliathTotal} st:{supportingUnits[i].SiegeTankTotal} s:{supportingUnits[i].ScoutTotal} w:{supportingUnits[i].WraithTotal} b:{supportingUnits[i].BattlecruiserTotal} gl:{supportingUnits[i].GlitcherTotal}");
						defendingUnits.MarineTotal = Math.Max(0, ((defendingUnits.MarineTotal ?? 0) + (supportingUnits[i].MarineTotal ?? 0)));
						defendingUnits.GoliathTotal = Math.Max(0, ((defendingUnits.GoliathTotal ?? 0) + (supportingUnits[i].GoliathTotal ?? 0)));
						defendingUnits.SiegeTankTotal = Math.Max(0, ((defendingUnits.SiegeTankTotal ?? 0) + (supportingUnits[i].SiegeTankTotal ?? 0)));
						defendingUnits.ScoutTotal = Math.Max(0, ((defendingUnits.ScoutTotal ?? 0) + (supportingUnits[i].ScoutTotal ?? 0)));
						defendingUnits.WraithTotal = Math.Max(0, ((defendingUnits.WraithTotal ?? 0) + (supportingUnits[i].WraithTotal ?? 0)));
						defendingUnits.BattlecruiserTotal = Math.Max(0, ((defendingUnits.BattlecruiserTotal ?? 0) + (supportingUnits[i].BattlecruiserTotal ?? 0)));
						defendingUnits.GlitcherTotal = Math.Max(0, ((defendingUnits.GlitcherTotal ?? 0) + (supportingUnits[i].GlitcherTotal ?? 0)));
					}
				}
				//if (defendingUnits != null)
				//{
				//    _ = _log.Db($"defence units : m:{defendingUnits.MarineTotal} g:{defendingUnits.GoliathTotal} st:{defendingUnits.SiegeTankTotal} s:{defendingUnits.ScoutTotal} w:{defendingUnits.WraithTotal} b:{defendingUnits.BattlecruiserTotal} gl:{defendingUnits.GlitcherTotal}");
				//}


				if (origin.CoordsX != destination.CoordsX || origin.CoordsY != destination.CoordsY || origin.User?.Id != destination.User?.Id)
				{
					var unitTypeToPropertyMap = new Dictionary<string, string>
										{
												{ "marine", "MarineTotal" },
												{ "goliath", "GoliathTotal" },
												{ "siege_tank", "SiegeTankTotal" },
												{ "scout", "ScoutTotal" },
												{ "wraith", "WraithTotal" },
												{ "battlecruiser", "BattlecruiserTotal" },
												{ "glitcher", "GlitcherTotal" }
										};
					var attackerUnitTypeToLevelMap = new Dictionary<string, Func<int>>
										{
												{ "marine", () => origin.MarineLevel },
												{ "goliath", () => origin.GoliathLevel },
												{ "siege_tank", () => origin.SiegeTankLevel },
												{ "scout", () => origin.ScoutLevel },
												{ "wraith", () => origin.WraithLevel },
												{ "battlecruiser", () => origin.BattlecruiserLevel },
												{ "glitcher", () => origin.GlitcherLevel }
										};
					var defenderUnitTypeToLevelMap = new Dictionary<string, Func<int>>
										{
												{ "marine", () => destination.MarineLevel },
												{ "goliath", () => destination.GoliathLevel },
												{ "siege_tank", () => destination.SiegeTankLevel },
												{ "scout", () => destination.ScoutLevel },
												{ "wraith", () => destination.WraithLevel },
												{ "battlecruiser", () => destination.BattlecruiserLevel },
												{ "glitcher", () => destination.GlitcherLevel }
										};
					//CALCULATE DAMAGE  
					var unitStats = new Dictionary<string, UnitStats>
										{
												{ "marine", marineStats },
												{ "goliath", goliathStats },
												{ "siege_tank", siegeTankStats },
												{ "scout", scoutStats },
												{ "wraith", wraithStats },
												{ "battlecruiser", battlecruiserStats },
												{ "glitcher", glitcherStats },
										};

					int CalculateDamage(Func<UnitStats, decimal> damageSelector, Dictionary<string, Func<int>> unitTypeToLevelMap)
					{
						return attackingUnits.Sum(x =>
						{
							var sentValue = x.SentValue ?? 0; // Default to 0 if SentValue is null
							var unitStat = unitStats.FirstOrDefault(y => x.UnitType == y.Key).Value;
							int unitLevel = unitTypeToLevelMap.TryGetValue(x.UnitType ?? "", out var getLevel) ? getLevel() : 0;

							decimal damageMultiplier = unitUpgradeStats.FirstOrDefault(u => u.UnitLevel == unitLevel)?.DamageMultiplier ?? 1;
							decimal selectedDamage = damageSelector(unitStat);
							decimal totalDamage = (decimal)sentValue * (selectedDamage * damageMultiplier);

							if (totalDamage > int.MaxValue || totalDamage < int.MinValue)
							{
								//_ = _log.Db($"Overflow detected for unit {x.UnitType}. Calculated damage: {totalDamage}");
								return 0;
							}

							//_ = _log.Db($"Detected sent attacking unit: {sentValue} {x.UnitType}. Regular damage: {selectedDamage}; Total added damage: {totalDamage}");
							return (int)totalDamage;
						});
					}

					int attackingGroundDamage = CalculateDamage(unitStat => unitStat.GroundDamage, attackerUnitTypeToLevelMap);
					int attackingAirDamage = CalculateDamage(unitStat => unitStat.AirDamage, attackerUnitTypeToLevelMap);


					double defendingGroundDamage = Math.Max(0, (defendingUnits?.ScoutTotal * unitStats["scout"]?.GroundDamage) ?? 0.0001);
					double defendingAirDamage = Math.Max(0, (defendingUnits?.ScoutTotal * unitStats["scout"]?.AirDamage) ?? 0.0001);
					foreach (var unitType in unitStats.Keys)
					{
						if (!scoutAttack && unitType != "scout") // Skip scout since it's already calculated
						{
							if (unitTypeToPropertyMap.TryGetValue(unitType, out var propertyName) &&
									defenderUnitTypeToLevelMap.TryGetValue(unitType, out var getLevel))
							{
								var totalUnits = defendingUnits?.GetType().GetProperty(propertyName)?.GetValue(defendingUnits, null) as int? ?? 0;
								int unitLevel = getLevel();
								decimal damageMultiplier = unitUpgradeStats.FirstOrDefault(u => u.UnitLevel == unitLevel)?.DamageMultiplier ?? 1;

								defendingGroundDamage += Math.Max(0, totalUnits * ((unitStats[unitType]?.GroundDamage ?? 0.0001) * (double)damageMultiplier));
								defendingAirDamage += Math.Max(0, totalUnits * ((unitStats[unitType]?.AirDamage ?? 0.0001) * (double)damageMultiplier));

								//_ = _log.Db($"Calculating added {unitType} defending damage: {defendingGroundDamage} {defendingAirDamage} ... ground: {(unitStats[unitType]?.GroundDamage ?? 0.0001)}, air: {(unitStats[unitType]?.AirDamage ?? 0.0001)}, multiplier: {damageMultiplier}");
							}
						}
					}

					//_ = _log.Db("Attacking ground damage: " + attackingGroundDamage);
					//_ = _log.Db("Attacking air damage: " + attackingAirDamage);
					//_ = _log.Db("Defending ground damage: " + defendingGroundDamage);
					//_ = _log.Db("Defending air damage: " + defendingAirDamage);

					double groundCoeff = Math.Max(0, attackingGroundDamage / defendingGroundDamage);
					double airCoeff = Math.Max(0, attackingAirDamage / defendingAirDamage);
					double groundAttackDmgLossCoeff = Math.Max(0, groundCoeff * Math.Sqrt((double)groundCoeff));
					double airAttackDmgLossCoeff = Math.Max(0, airCoeff * Math.Sqrt((double)airCoeff));

					//_ = _log.Db("groundCoeff: " + groundCoeff);
					//_ = _log.Db("airCoeff: " + airCoeff);
					//_ = _log.Db("groundAttackDmgLossCoeff: " + groundAttackDmgLossCoeff);
					//_ = _log.Db("airAttackDmgLossCoeff: " + airAttackDmgLossCoeff);

					var attackingLosses = new Dictionary<string, int?>();
					var defendingLosses = new Dictionary<string, int?>();
					bool attackerSupplyRecovered = false;
					bool defenderSupplyRecovered = false;

					// CALCULATE LOSSES
					if ((attackingGroundDamage != 0 || attackingAirDamage != 0) && (defendingGroundDamage != 0 || defendingAirDamage != 0))
					{
						//_ = _log.Db($"groundCoeff: {groundCoeff}, airCoeff: {airCoeff}, groundAttackDmgLossCoeff: {groundAttackDmgLossCoeff}, airAttackDmgLossCoeff: {airAttackDmgLossCoeff} ");


						foreach (var unitType in unitStats.Keys)
						{
							//_ = _log.Db($"Processing unit type: {unitType}");

							var attackingUnit = attackingUnits.FirstOrDefault(x => x.UnitType == unitType);
							//_ = _log.Db("got attackingUnit: " + attackingUnit);
							//_ = _log.Db($"Attacking unit: {attackingUnit?.UnitType}");

							string bigType = unitType;
							bigType = (unitType == "siege_tank" ? "SiegeTank"
									: unitType == "marine" ? "Marine"
									: unitType == "goliath" ? "Goliath"
									: unitType == "scout" ? "Scout"
									: unitType == "wraith" ? "Wraith"
									: unitType == "battlecruiser" ? "Battlecruiser"
									: "Glitcher");

							var defendingUnitProperty = defendingUnits?.GetType().GetProperty($"{bigType}Total");
							//_ = _log.Db($"Defending unit property: {defendingUnitProperty?.Name}");

							var defendingUnitValue = Math.Max(0, defendingUnitProperty?.GetValue(defendingUnits, null) as int? ?? 0);
							//_ = _log.Db($"Defending unit value: {defendingUnitValue}");

							var sentValue = Math.Max(0, attackingUnit?.SentValue ?? 0);
							//_ = _log.Db($"Sent value: {sentValue}");

							var attackLossCoeff = (unitType == "scout" || unitType == "wraith" || unitType == "battlecruiser" || unitType == "glitcher")
									? airAttackDmgLossCoeff
									: groundAttackDmgLossCoeff;
							//_ = _log.Db($"Attack loss coeff: {attackLossCoeff}");
							int aLoss = Math.Min(sentValue, (int)(sentValue / attackLossCoeff));
							int dLoss = Math.Min(defendingUnitValue, (int)(defendingUnitValue * attackLossCoeff));
							attackingLosses[unitType] = Math.Max(0, aLoss);
							defendingLosses[unitType] = Math.Max(0, dLoss);
							//_ = _log.Db($"Attacking losses: {attackingLosses[unitType]}"); 
							//_ = _log.Db($"Defending losses: {defendingLosses[unitType]}");\
							if (aLoss > 0) { attackerSupplyRecovered = true; }
							if (dLoss > 0) { defenderSupplyRecovered = true; }
							//_ = _log.Db($"Attacking unit: {unitType}: {sentValue}");
							//_ = _log.Db($"Defending unit: {unitType}: {defendingUnitValue}");
						}
						//_ = _log.Db($"attackerSupplyRecovered: {attackerSupplyRecovered}, defenderSupplyRecovered: {defenderSupplyRecovered}");
					}
					if (defenderSupplyRecovered)
					{
						var supportingLosses = new Dictionary<string, int?>();
						foreach (var unitType in new[] { "marine", "goliath", "siege_tank", "scout", "wraith", "battlecruiser", "glitcher" })
						{
							if (!supportingLosses.ContainsKey(unitType))
							{
								supportingLosses[unitType] = 0;
							}
						}
						// Calculate losses for supporting units based on defending losses and coefficients
						foreach (var supportingBaseUnits in supportingUnits)
						{
							if (supportingBaseUnits != null)
							{
								//_ = _log.Db($"Processing supporting base from ({supportingBaseUnits.OriginCoordsX}, {supportingBaseUnits.OriginCoordsY}) at ({supportingBaseUnits.DestinationCoordsX}, {supportingBaseUnits.DestinationCoordsY})");

								if (supportingBaseUnits.MarineTotal != null && supportingBaseUnits.MarineTotal > 0)
								{
									int loss = Math.Min(supportingBaseUnits.MarineTotal.Value, (int)(supportingBaseUnits.MarineTotal.Value * groundAttackDmgLossCoeff));
									supportingLosses["marine"] = Math.Min(supportingBaseUnits.MarineTotal.Value, loss);
									supportingBaseUnits.MarineTotal = Math.Max(0, supportingBaseUnits.MarineTotal.Value - loss);
								}

								if (supportingBaseUnits.GoliathTotal != null && supportingBaseUnits.GoliathTotal > 0)
								{
									int loss = Math.Min(supportingBaseUnits.GoliathTotal.Value, (int)(supportingBaseUnits.GoliathTotal.Value * groundAttackDmgLossCoeff));
									supportingLosses["goliath"] = Math.Min(supportingBaseUnits.GoliathTotal.Value, loss);
									supportingBaseUnits.GoliathTotal = Math.Max(0, supportingBaseUnits.GoliathTotal.Value - loss);
								}

								if (supportingBaseUnits.SiegeTankTotal != null && supportingBaseUnits.SiegeTankTotal > 0)
								{
									int loss = Math.Min(supportingBaseUnits.SiegeTankTotal.Value, (int)(supportingBaseUnits.SiegeTankTotal.Value * groundAttackDmgLossCoeff));
									supportingLosses["siege_tank"] = Math.Min(supportingBaseUnits.SiegeTankTotal.Value, loss);
									supportingBaseUnits.SiegeTankTotal = Math.Max(0, supportingBaseUnits.SiegeTankTotal.Value - loss);
								}

								if (supportingBaseUnits.ScoutTotal != null && supportingBaseUnits.ScoutTotal > 0)
								{
									int loss = Math.Min(supportingBaseUnits.ScoutTotal.Value, (int)(supportingBaseUnits.ScoutTotal.Value * airAttackDmgLossCoeff));
									supportingLosses["scout"] = Math.Min(supportingBaseUnits.ScoutTotal.Value, loss);
									supportingBaseUnits.ScoutTotal = Math.Max(0, supportingBaseUnits.ScoutTotal.Value - loss);
								}

								if (supportingBaseUnits.WraithTotal != null && supportingBaseUnits.WraithTotal > 0)
								{
									int loss = Math.Min(supportingBaseUnits.WraithTotal.Value, (int)(supportingBaseUnits.WraithTotal.Value * airAttackDmgLossCoeff));
									supportingLosses["wraith"] = Math.Min(supportingBaseUnits.WraithTotal.Value, loss);
									supportingBaseUnits.WraithTotal = Math.Max(0, supportingBaseUnits.WraithTotal.Value - loss);
								}

								if (supportingBaseUnits.BattlecruiserTotal != null && supportingBaseUnits.BattlecruiserTotal > 0)
								{
									int loss = Math.Min(supportingBaseUnits.BattlecruiserTotal.Value, (int)(supportingBaseUnits.BattlecruiserTotal.Value * airAttackDmgLossCoeff));
									supportingLosses["battlecruiser"] = Math.Min(supportingBaseUnits.BattlecruiserTotal.Value, loss);
									supportingBaseUnits.BattlecruiserTotal = Math.Max(0, supportingBaseUnits.BattlecruiserTotal.Value - loss);
								}

								if (supportingBaseUnits.GlitcherTotal != null && supportingBaseUnits.GlitcherTotal > 0)
								{
									int loss = Math.Min(supportingBaseUnits.GlitcherTotal.Value, (int)(supportingBaseUnits.GlitcherTotal.Value * airAttackDmgLossCoeff));
									supportingLosses["glitcher"] = Math.Min(supportingBaseUnits.GlitcherTotal.Value, loss);
									supportingBaseUnits.GlitcherTotal = Math.Max(0, supportingBaseUnits.GlitcherTotal.Value - loss);
								}

								var tmpBase = new NexusBase();
								tmpBase.CoordsX = supportingBaseUnits.DestinationCoordsX;
								tmpBase.CoordsY = supportingBaseUnits.DestinationCoordsY;
								//_ = _log.Db($"Marine losses: {supportingLosses["marine"]} (Total before: {supportingBaseUnits.MarineTotal})");
								//_ = _log.Db($"Goliath losses: {supportingLosses["goliath"]} (Total before: {supportingBaseUnits.GoliathTotal})");
								//_ = _log.Db($"Siege Tank losses: {supportingLosses["siege_tank"]} (Total before: {supportingBaseUnits.SiegeTankTotal})");
								//_ = _log.Db($"Scout losses: {supportingLosses["scout"]} (Total before: {supportingBaseUnits.ScoutTotal})");
								//_ = _log.Db($"Wraith losses: {supportingLosses["wraith"]} (Total before: {supportingBaseUnits.WraithTotal})");
								//_ = _log.Db($"Battlecruiser losses: {supportingLosses["battlecruiser"]} (Total before: {supportingBaseUnits.BattlecruiserTotal})");
								//_ = _log.Db($"Glitcher losses: {supportingLosses["glitcher"]} (Total before: {supportingBaseUnits.GlitcherTotal})");

								await UpdateNexusUnitsAfterAttack(conn, transaction, tmpBase, supportingLosses);
								int supportingBaseCurrentSupplyUsed = await CalculateUsedNexusSupply(tmpBase, conn, transaction);
								await UpdateNexusSupply(tmpBase, supportingBaseCurrentSupplyUsed, conn, transaction);
								await UpdateSupportingUnitsAfterAttack(supportingBaseUnits, supportingLosses, conn, transaction);
							}
						}

						await UpdateNexusUnitsAfterAttack(conn, transaction, destination, defendingLosses);
						int currentSupplyUsed = await CalculateUsedNexusSupply(destination, conn, transaction);
						await UpdateNexusSupply(destination, currentSupplyUsed, conn, transaction);
					}

					var expectedKeys = new List<string> { "marine", "goliath", "siege_tank", "scout", "wraith", "battlecruiser", "glitcher" };
					foreach (var key in expectedKeys)
					{
						if (!attackingLosses.ContainsKey(key))
						{
							attackingLosses[key] = 0; // Initialize missing keys with a default value
						}
					}
					//_ = _log.Db("Sending survivors back home...");
					//SEND SURVIVORS BACK
					if (attackingLosses != null && attackingLosses.Count > 0)
					{
						var losses = new Dictionary<string, int?>
																		{
																				{ "marine", attackingLosses["marine"] },
																				{ "goliath", attackingLosses["goliath"] },
																				{ "siege_tank", attackingLosses["siege_tank"] },
																				{ "scout", attackingLosses["scout"] },
																				{ "wraith", attackingLosses["wraith"] },
																				{ "battlecruiser", attackingLosses["battlecruiser"] },
																				{ "glitcher", attackingLosses["glitcher"] },
																		};
						attackingUnits.ForEach(x =>
						{
							if (!string.IsNullOrEmpty(x.UnitType) && losses.ContainsKey(x.UnitType))
							{
								x.SentValue = Math.Max(0, (x.SentValue ?? 0) - (losses[x.UnitType] ?? 0));
							}
						});
					}

					decimal goldPlundered = await GetGoldPlundered(conn, transaction, destination, attackingUnits, defendingUnits, unitStats);

					NexusBattleOutcome battleOutcome = await CreateBattleOutcome(attacks, attackIndex, origin, destination, defendingUnits, attackingLosses, defendingLosses, goldPlundered, conn, transaction);
					await InsertBattleOutcome(battleOutcome, conn, transaction);
					//_ = _log.Db("Inserted report, now find glitchers");
					var foundGlitchers = attackingUnits.FirstOrDefault(x => x.UnitType == "glitcher" && x.SentValue > 0);
					//_ = _log.Db("Found glitchers or not ");

					if (attackingUnits != null && foundGlitchers != null)
					{
						// Glitcher was sent, and it survived. Take over the nexus and make sure the units remain there;
						// Since support is not implemented yet, just send the units back to base for now.
						await ChangeOwnership((origin.User?.Id ?? 0), destination, conn, transaction);
						await DeleteSupportSent(destination, conn, transaction);
						attackerSupplyRecovered = true;
						if (attackingLosses != null && !attackingLosses.ContainsKey("glitcher"))
						{
							attackingLosses["glitcher"] = 1;
						}
						else if (attackingLosses != null)
						{
							attackingLosses["glitcher"] += 1;
						}
						else if (attackingLosses == null)
						{
							attackingLosses = new Dictionary<string, int?>();
							attackingLosses["glitcher"] = 1;
						}
						attackingUnits.Where(x => x.UnitType == "glitcher").First().SentValue = 0;
					}

					if (attackerSupplyRecovered && attackingLosses != null)
					{
						await UpdateNexusUnitsAfterAttack(conn, transaction, origin, attackingLosses);
						int currentSupplyUsed = await CalculateUsedNexusSupply(origin, conn, transaction);
						await UpdateNexusSupply(origin, currentSupplyUsed, conn, transaction);
					}
					//_ = _log.Db("all done, sending survivor attacking units back home");
					if (attackingUnits != null && attackingUnits.FirstOrDefault(x => x.SentValue > 0) != null)
					{
						if (origin.CoordsX != destination.CoordsX || origin.CoordsY != destination.CoordsY)
						{
							//_ = _log.Db("Sent surviving units back home.");
							await SendAttack(origin, origin, origin.User, origin.User, attackingUnits.ToArray(), conn, transaction);
						}
						else
						{
							//_ = _log.Db("Returning units were ousted from their home. Units disbanded.");
						}
					}
					else
					{
						//_ = _log.Db($"No survivors made it...");
					}
				}
				else
				{
					//_ = _log.Db($"Survivors made it back home..."); 
				}
			}
		}


		private async Task PerformDefenceIfTimeElapsed(MySqlConnection conn, MySqlTransaction transaction, List<NexusAttackSent> defences, int defenceIndex)
		{
			TimeSpan timeElapsed = (DateTime.Now - defences?[defenceIndex].Timestamp) ?? TimeSpan.Zero;
			//_ = _log.Db($"Checking timeElapsed: {timeElapsed.TotalSeconds}, duration: {defences[defenceIndex].Duration} : {timeElapsed.TotalSeconds - defences[defenceIndex].Duration}");

			if (defences == null)
			{
				defences = new List<NexusAttackSent>();
			}

			if ((timeElapsed.TotalSeconds - defences[defenceIndex].Duration) >= 0)
			{
				//_ = _log.Db($"{defences[defenceIndex].OriginCoordsX}, {defences[defenceIndex].OriginCoordsY} Defence has landed on {defences[defenceIndex].DestinationCoordsX},{defences[defenceIndex].DestinationCoordsY}!");

				NexusBase origin = await GetNexusBase(defences[defenceIndex].OriginCoordsX, defences[defenceIndex].OriginCoordsY, conn, transaction)
						?? new NexusBase() { CoordsX = defences[defenceIndex].OriginCoordsX, CoordsY = defences[defenceIndex].OriginCoordsY };

				NexusBase destination = await GetNexusBase(defences[defenceIndex].DestinationCoordsX, defences[defenceIndex].DestinationCoordsY, conn, transaction)
						?? new NexusBase() { CoordsX = defences[defenceIndex].DestinationCoordsX, CoordsY = defences[defenceIndex].DestinationCoordsY };

				if (origin.CoordsX == destination.CoordsX && origin.CoordsY == destination.CoordsY)
				{
					//_ = _log.Db("Deleting support as it has arrived back home");
					await DeleteDefence(origin, destination, defences[defenceIndex].Timestamp, defences[defenceIndex].Duration, conn, transaction);
				}
				else
				{
					//_ = _log.Db("Defence has arrived");
					await DefenceArrived(origin, destination, defences[defenceIndex].Timestamp, defences[defenceIndex].Duration, conn, transaction);
				}

				//_ = _log.Db($"Getting defence results for {origin.CoordsX},{origin.CoordsY} support on {destination.CoordsX},{destination.CoordsY}");
			}
		}

		private async Task UpdateNexusUnitsAfterAttack(MySqlConnection conn, MySqlTransaction transaction, NexusBase nexusBase, Dictionary<string, int?> losses)
		{
			string sql = @"
                UPDATE maxhanna.nexus_units 
                SET 
                    marine_total = GREATEST(0, marine_total - @Marine), 
                    goliath_total = GREATEST(0, goliath_total - @Goliath), 
                    siege_tank_total = GREATEST(0, siege_tank_total - @SiegeTank), 
                    scout_total = GREATEST(0, scout_total - @Scout), 
                    wraith_total = GREATEST(0, wraith_total - @Wraith), 
                    battlecruiser_total = GREATEST(0, battlecruiser_total - @Battlecruiser), 
                    glitcher_total = GREATEST(0, glitcher_total - @Glitcher)
                WHERE 
                    coords_x = @CoordsX 
                AND coords_y = @CoordsY;";
			var parameters = new Dictionary<string, object?>
						{
								{ "@CoordsX", nexusBase.CoordsX },
								{ "@CoordsY", nexusBase.CoordsY },
								{ "@Marine", Math.Max(0, losses["marine"] ?? 0) },
								{ "@Goliath",  Math.Max(0, losses["goliath"] ?? 0) },
								{ "@SiegeTank",  Math.Max(0, losses["siege_tank"] ?? 0) },
								{ "@Scout",  Math.Max(0, losses["scout"] ?? 0) },
								{ "@Wraith",  Math.Max(0, losses["wraith"] ?? 0) },
								{ "@Battlecruiser",  Math.Max(0, losses["battlecruiser"] ?? 0) },
								{ "@Glitcher", Math.Max(0, losses["glitcher"] ?? 0)}
						};
			//_ = _log.Db("UpdateNexusUnitsAfterAttack - attacking losses passed in :");

			await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
		}

		private async Task<decimal> GetGoldPlundered(MySqlConnection conn, MySqlTransaction transaction, NexusBase destination, List<UnitStats> attackingUnits, NexusUnits? defendingUnits, Dictionary<string, UnitStats> unitStats)
		{
			await RecalculateNexusGold(conn, transaction);
			decimal goldForGrabs = destination.Gold;
			if (destination.MinesLevel == 0)
			{
				goldForGrabs = new Random().Next(0, 666);
			}
			//_ = _log.Db("destination gold : " + goldForGrabs);
			decimal goldCarryingCapacity = attackingUnits.Sum(x => x.GoldCarryingCapacity);

			//_ = _log.Db("gold carrying capacity: " + goldCarryingCapacity);
			decimal goldPlundered;
			if (defendingUnits != null)
			{
				// Step 1: Calculate total attacking and defending units
				int totalAttackingUnits = attackingUnits.Sum(x => Math.Max(0, x.SentValue ?? 0));
				int totalDefendingUnits = unitStats.Keys.Sum(unitType =>
				{
					string bigType = (unitType == "siege_tank" ? "SiegeTank"
											: unitType == "marine" ? "Marine"
											: unitType == "goliath" ? "Goliath"
											: unitType == "scout" ? "Scout"
											: unitType == "wraith" ? "Wraith"
											: unitType == "battlecruiser" ? "Battlecruiser"
											: "Glitcher");
					return defendingUnits.GetType().GetProperty($"{bigType}Total")?.GetValue(defendingUnits, null) as int? ?? 0;
				});
				//_ = _log.Db($"totalAttackingUnits: {totalAttackingUnits}, totalDefendingUnits: {totalDefendingUnits}");
				// Step 2: Determine the ratio
				decimal ratio = totalAttackingUnits == 0 || totalDefendingUnits == 0
						? (totalAttackingUnits > totalDefendingUnits ? 1.0m : 0.0m)
						: Math.Min((decimal)totalAttackingUnits / totalDefendingUnits, 1.0m);
				//_ = _log.Db("ratio : " + ratio);
				// Step 3: Adjust goldPlundered based on the ratio
				goldPlundered = ratio * Math.Min(goldForGrabs, goldCarryingCapacity);
			}
			else
			{
				// If there are no defending units
				//_ = _log.Db("No defending units");
				goldPlundered = Math.Min(goldForGrabs, goldCarryingCapacity);
			}

			return goldPlundered;
		}

		private async Task ChangeOwnership(int userId, NexusBase deadBase, MySqlConnection conn, MySqlTransaction transaction)
		{
			// Insert or update the base ownership
			const string insertOrUpdateBaseSql = @"
                INSERT INTO maxhanna.nexus_bases (user_id, coords_x, coords_y, gold)
                VALUES (@UserId, @CoordsX, @CoordsY, @Gold)
                ON DUPLICATE KEY UPDATE user_id = @UserId;";

			var baseParameters = new Dictionary<string, object?>
			{
				{ "@UserId", userId },
				{ "@CoordsX", deadBase.CoordsX },
				{ "@CoordsY", deadBase.CoordsY },
				{ "@Gold", 200 }
			};

			await ExecuteInsertOrUpdateOrDeleteAsync(insertOrUpdateBaseSql, baseParameters, conn, transaction);

			// Update attacks and defences sent to that base
			var updateParameters = new Dictionary<string, object?>
			{
				{ "@UserId", userId },
				{ "@CoordsX", deadBase.CoordsX },
				{ "@CoordsY", deadBase.CoordsY }
			};

			const string updateAttacksSentSql = @"
                UPDATE maxhanna.nexus_attacks_sent 
                SET destination_user_id = @UserId 
                WHERE destination_coords_x = @CoordsX
                  AND destination_coords_y = @CoordsY;";

			const string updateDefencesSentSql = @"
                UPDATE maxhanna.nexus_defences_sent 
                SET destination_user_id = @UserId 
                WHERE destination_coords_x = @CoordsX
                  AND destination_coords_y = @CoordsY;";

			await ExecuteInsertOrUpdateOrDeleteAsync(updateAttacksSentSql, updateParameters, conn, transaction);
			await ExecuteInsertOrUpdateOrDeleteAsync(updateDefencesSentSql, updateParameters, conn, transaction);
			await NotifyAttackerAndDefender(userId, deadBase, conn, transaction);
			int availableSpots = await CountAvailableSpotsAsync(conn, transaction);
			if (availableSpots <= 0)
			{
				await VictoryConditionMet(conn, transaction, userId);
			}
		}

		[HttpPost("/Nexus/GetEpochRankings", Name = "GetEpochRankings")]
		public async Task<IActionResult> GetEpochRankings()
		{
			using (MySqlConnection conn = new MySqlConnection(_connectionString))
			{
				await conn.OpenAsync();

				try
				{
					string querySql = @"
						SELECT 
							epoch_id,
							user_id,
							username,
							base_count,
							total_building_upgrades,
							total_unit_upgrades,
							total_units,
							total_unit_purchases,
							total_gold,
							total_supply,
							attacks_sent,
							defences_sent,
							battles_won,
							battles_lost,
							gold_stolen,
							`rank`,
							timestamp
						FROM 
							maxhanna.nexus_epoch_rankings
						ORDER BY 
							epoch_id DESC,
							`rank` ASC;";

					var rankings = new List<NexusEpochRanking>();

					using (var cmd = new MySqlCommand(querySql, conn))
					{
						using var reader = await cmd.ExecuteReaderAsync();
						while (await reader.ReadAsync())
						{
							rankings.Add(new NexusEpochRanking
							{
								EpochId = reader.GetInt32("epoch_id"),
								UserId = reader.GetInt32("user_id"),
								Username = reader.GetString("username"),
								BaseCount = reader.GetInt32("base_count"),
								TotalBuildingUpgrades = reader.GetInt32("total_building_upgrades"),
								TotalUnitUpgrades = reader.GetInt32("total_unit_upgrades"),
								TotalUnits = reader.GetInt32("total_units"),
								TotalUnitPurchases = reader.GetInt32("total_unit_purchases"),
								TotalGold = reader.GetDecimal("total_gold"),
								TotalSupply = reader.GetInt32("total_supply"),
								AttacksSent = reader.GetInt32("attacks_sent"),
								DefencesSent = reader.GetInt32("defences_sent"),
								BattlesWon = reader.GetInt32("battles_won"),
								BattlesLost = reader.GetInt32("battles_lost"),
								GoldStolen = reader.GetDecimal("gold_stolen"),
								Rank = reader.GetInt32("rank"),
								Timestamp = reader.GetDateTime("timestamp")
							});
						}
					}

					return Ok(rankings);
				}
				catch (Exception ex)
				{
					return StatusCode(500, "An error occurred while retrieving epoch rankings. " + ex.Message);
				}
			}
		}
		private async Task VictoryConditionMet(MySqlConnection conn, MySqlTransaction transaction, int userId)
		{
			try
			{
				// 1. Get the next epoch ID
				int epochId = await GetNextEpochId(conn, transaction);

				// 2. Get all active users (those with bases)
				var activeUserIds = await GetActiveUserIds(conn, transaction);

				// 3. Process each user's stats and save rankings
				var allRankings = new List<UserRanking>();
				foreach (var activeUserId in activeUserIds)
				{
					var stats = await CalculateUserStats(conn, transaction, activeUserId);
					var ranking = await SaveUserRanking(conn, transaction, epochId, stats);
					allRankings.Add(ranking);
				}

				// 4. Determine final rankings based on base count
				var orderedRankings = allRankings
					.OrderByDescending(r => r.BaseCount)
					.ThenByDescending(r => r.TotalBuildingUpgrades)
					.ThenByDescending(r => r.TotalGold)
					.ToList();

				// 5. Update ranks in the database
				for (int i = 0; i < orderedRankings.Count; i++)
				{
					await UpdateUserRank(conn, transaction, epochId, orderedRankings[i].UserId, i + 1);
				}

				// 6. Send notifications to all players
				foreach (var ranking in orderedRankings)
				{
					await SendPlayerNotification(
						conn,
						transaction,
						ranking.UserId,
						ranking.Username,
						epochId,
						ranking.Rank,
						ranking.BaseCount,
						ranking.TotalBuildingUpgrades + ranking.TotalUnitUpgrades,
						ranking.TotalGold);
				}

				// 7. Only after all processing is complete, reset the game
				await ResetGameAsync(conn, transaction);
			}
			catch (Exception ex)
			{
				await _log.Db($"Error in VictoryConditionMet for user {userId}: {ex.Message}", userId, "NEXUS", true);
				throw;
			}
		}

		private async Task<int> GetNextEpochId(MySqlConnection conn, MySqlTransaction transaction)
		{
			const string sql = "SELECT COALESCE(MAX(epoch_id), 0) + 1 FROM nexus_epoch_rankings;";
			using var cmd = new MySqlCommand(sql, conn, transaction);
			cmd.CommandTimeout = 300;
			return Convert.ToInt32(await cmd.ExecuteScalarAsync());
		}

		private async Task<List<int>> GetActiveUserIds(MySqlConnection conn, MySqlTransaction transaction)
		{
			var userIds = new List<int>();
			const string sql = "SELECT DISTINCT user_id FROM nexus_bases;";

			using (var cmd = new MySqlCommand(sql, conn, transaction))
			{
				cmd.CommandTimeout = 300;
				using var reader = await cmd.ExecuteReaderAsync();
				while (await reader.ReadAsync())
				{
					userIds.Add(reader.GetInt32(0));
				}
			}
			return userIds;
		}

		private async Task<UserStats> CalculateUserStats(MySqlConnection conn, MySqlTransaction transaction, int userId)
		{
			const string statsSql = @"
    SELECT 
        u.id AS user_id,
        COALESCE(u.username, 'Anonymous') AS username,
        COUNT(DISTINCT nb.coords_x, nb.coords_y) AS base_count,
        SUM(
            COALESCE(nb.command_center_level, 0) +
            COALESCE(nb.mines_level, 0) +
            COALESCE(nb.supply_depot_level, 0) +
            COALESCE(nb.factory_level, 0) +
            COALESCE(nb.starport_level, 0) +
            COALESCE(nb.warehouse_level, 0) +
            COALESCE(nb.engineering_bay_level, 0)
        ) AS total_building_levels,
        SUM(
            COALESCE(nb.marine_level, 0) +
            COALESCE(nb.goliath_level, 0) +
            COALESCE(nb.siege_tank_level, 0) +
            COALESCE(nb.scout_level, 0) +
            COALESCE(nb.wraith_level, 0) +
            COALESCE(nb.battlecruiser_level, 0) +
            COALESCE(nb.glitcher_level, 0)
        ) AS total_unit_levels,
        (SELECT COUNT(*) FROM nexus_base_upgrades nbu 
         JOIN nexus_bases nb2 ON nbu.coords_x = nb2.coords_x AND nbu.coords_y = nb2.coords_y
         WHERE nb2.user_id = u.id) AS building_upgrade_events,
        (SELECT COUNT(*) FROM nexus_unit_upgrades nuu 
         JOIN nexus_bases nb2 ON nuu.coords_x = nb2.coords_x AND nuu.coords_y = nb2.coords_y
         WHERE nb2.user_id = u.id) AS unit_upgrade_events,
        SUM(
            COALESCE(nu.marine_total, 0) +
            COALESCE(nu.goliath_total, 0) +
            COALESCE(nu.siege_tank_total, 0) +
            COALESCE(nu.scout_total, 0) +
            COALESCE(nu.wraith_total, 0) +
            COALESCE(nu.battlecruiser_total, 0) +
            COALESCE(nu.glitcher_total, 0)
        ) AS total_units,
        (SELECT COALESCE(SUM(quantity_purchased), 0) FROM nexus_unit_purchases nup 
         JOIN nexus_bases nb2 ON nup.coords_x = nb2.coords_x AND nup.coords_y = nb2.coords_y
         WHERE nb2.user_id = u.id) AS total_unit_purchases,
        SUM(COALESCE(nb.gold, 0)) AS total_gold,
        SUM(COALESCE(nb.supply, 0)) AS total_supply,
        (SELECT COUNT(*) FROM nexus_attacks_sent WHERE origin_user_id = u.id) AS attacks_sent,
        (SELECT COUNT(*) FROM nexus_defences_sent WHERE origin_user_id = u.id) AS defences_sent,
        (SELECT COUNT(*) FROM nexus_battles WHERE origin_user_id = u.id AND defender_gold_stolen > 0) AS battles_won,
        (SELECT COUNT(*) FROM nexus_battles WHERE destination_user_id = u.id AND defender_gold_stolen > 0) AS battles_lost,
        (SELECT COALESCE(SUM(defender_gold_stolen), 0) FROM nexus_battles WHERE origin_user_id = u.id) AS gold_stolen
    FROM users u
    LEFT JOIN nexus_bases nb ON u.id = nb.user_id
    LEFT JOIN nexus_units nu ON nb.coords_x = nu.coords_x AND nb.coords_y = nu.coords_y
    WHERE u.id = @userId
    GROUP BY u.id, u.username;";

			using var cmd = new MySqlCommand(statsSql, conn, transaction);
			cmd.Parameters.AddWithValue("@userId", userId);
			cmd.CommandTimeout = 300;

			using var reader = await cmd.ExecuteReaderAsync();
			if (await reader.ReadAsync())
			{
				return new UserStats(
					UserId: reader.GetInt32("user_id"),
					Username: reader.GetString("username"),
					BaseCount: reader.GetInt32("base_count"),
					TotalBuildingLevels: reader.GetInt32("total_building_levels"),
					TotalUnitLevels: reader.GetInt32("total_unit_levels"),
					BuildingUpgradeEvents: reader.IsDBNull(reader.GetOrdinal("building_upgrade_events")) ?
						0 : reader.GetInt32("building_upgrade_events"),
					UnitUpgradeEvents: reader.IsDBNull(reader.GetOrdinal("unit_upgrade_events")) ?
						0 : reader.GetInt32("unit_upgrade_events"),
					TotalUnits: reader.IsDBNull(reader.GetOrdinal("total_units")) ?
						0 : reader.GetInt32("total_units"),
					TotalUnitPurchases: reader.IsDBNull(reader.GetOrdinal("total_unit_purchases")) ?
						0 : reader.GetInt32("total_unit_purchases"),
					TotalGold: reader.GetDecimal("total_gold"),
					TotalSupply: reader.GetInt32("total_supply"),
					AttacksSent: reader.GetInt32("attacks_sent"),
					DefencesSent: reader.GetInt32("defences_sent"),
					BattlesWon: reader.GetInt32("battles_won"),
					BattlesLost: reader.GetInt32("battles_lost"),
					GoldStolen: reader.GetDecimal("gold_stolen")
				);
			}

			throw new Exception($"No stats found for user {userId}");
		}

		private async Task<UserRanking> SaveUserRanking(MySqlConnection conn, MySqlTransaction transaction, int epochId, UserStats stats)
		{
			const string sql = @"
    INSERT INTO nexus_epoch_rankings (
        epoch_id, user_id, username, base_count, total_building_upgrades, total_unit_upgrades,
        total_units, total_unit_purchases, total_gold, total_supply, attacks_sent, defences_sent,
        battles_won, battles_lost, gold_stolen, timestamp
    ) VALUES (
        @epochId, @userId, @username, @baseCount, @totalBuildingUpgrades, @totalUnitUpgrades,
        @totalUnits, @totalUnitPurchases, @totalGold, @totalSupply, @attacksSent, @defencesSent,
        @battlesWon, @battlesLost, @goldStolen, UTC_TIMESTAMP()
    );
    SELECT LAST_INSERT_ID();";

			using var cmd = new MySqlCommand(sql, conn, transaction);
			cmd.Parameters.AddWithValue("@epochId", epochId);
			cmd.Parameters.AddWithValue("@userId", stats.UserId);
			cmd.Parameters.AddWithValue("@username", stats.Username);
			cmd.Parameters.AddWithValue("@baseCount", stats.BaseCount);
			cmd.Parameters.AddWithValue("@totalBuildingUpgrades", stats.TotalBuildingLevels + stats.BuildingUpgradeEvents);
			cmd.Parameters.AddWithValue("@totalUnitUpgrades", stats.TotalUnitLevels + stats.UnitUpgradeEvents);
			cmd.Parameters.AddWithValue("@totalUnits", stats.TotalUnits);
			cmd.Parameters.AddWithValue("@totalUnitPurchases", stats.TotalUnitPurchases);
			cmd.Parameters.AddWithValue("@totalGold", stats.TotalGold);
			cmd.Parameters.AddWithValue("@totalSupply", stats.TotalSupply);
			cmd.Parameters.AddWithValue("@attacksSent", stats.AttacksSent);
			cmd.Parameters.AddWithValue("@defencesSent", stats.DefencesSent);
			cmd.Parameters.AddWithValue("@battlesWon", stats.BattlesWon);
			cmd.Parameters.AddWithValue("@battlesLost", stats.BattlesLost);
			cmd.Parameters.AddWithValue("@goldStolen", stats.GoldStolen);
			cmd.CommandTimeout = 300;

			var rankingId = Convert.ToInt32(await cmd.ExecuteScalarAsync());

			return new UserRanking(
				RankingId: rankingId,
				UserId: stats.UserId,
				Username: stats.Username,
				BaseCount: stats.BaseCount,
				TotalBuildingUpgrades: stats.TotalBuildingLevels + stats.BuildingUpgradeEvents,
				TotalUnitUpgrades: stats.TotalUnitLevels + stats.UnitUpgradeEvents,
				TotalUnits: stats.TotalUnits,
				TotalUnitPurchases: stats.TotalUnitPurchases,
				TotalGold: stats.TotalGold,
				TotalSupply: stats.TotalSupply,
				AttacksSent: stats.AttacksSent,
				DefencesSent: stats.DefencesSent,
				BattlesWon: stats.BattlesWon,
				BattlesLost: stats.BattlesLost,
				GoldStolen: stats.GoldStolen,
				Rank: 0 // Temporary value, will be updated later
			);
		}

		private async Task UpdateUserRank(MySqlConnection conn, MySqlTransaction transaction, int epochId, int userId, int rank)
		{
			const string sql = @"
    UPDATE nexus_epoch_rankings 
    SET `rank` = @rank 
    WHERE epoch_id = @epochId AND user_id = @userId;";

			using var cmd = new MySqlCommand(sql, conn, transaction);
			cmd.Parameters.AddWithValue("@epochId", epochId);
			cmd.Parameters.AddWithValue("@userId", userId);
			cmd.Parameters.AddWithValue("@rank", rank);
			cmd.CommandTimeout = 300;

			await cmd.ExecuteNonQueryAsync();
		}

		private async Task SendPlayerNotification(
			MySqlConnection conn,
			MySqlTransaction transaction,
			int userId,
			string username,
			int epochId,
			int rank,
			int baseCount,
			int totalUpgrades,
			decimal totalGold)
		{
			const string sql = @"
    INSERT INTO notifications (user_id, text, date) 
    VALUES (@userId, @message, UTC_TIMESTAMP());";

			using var cmd = new MySqlCommand(sql, conn, transaction);
			cmd.Parameters.AddWithValue("@userId", userId);
			cmd.Parameters.AddWithValue("@message",
				$"Epoch {epochId} ended! You ranked #{rank} with {baseCount} bases, " +
				$"{totalUpgrades} upgrades, and {totalGold} gold. Check the rankings for details!");
			cmd.CommandTimeout = 300;

			await cmd.ExecuteNonQueryAsync();
		}

		// Helper classes
		private record UserStats(
			int UserId,
			string Username,
			int BaseCount,
			int TotalBuildingLevels,
			int TotalUnitLevels,
			int BuildingUpgradeEvents,
			int UnitUpgradeEvents,
			int TotalUnits,
			int TotalUnitPurchases,
			decimal TotalGold,
			int TotalSupply,
			int AttacksSent,
			int DefencesSent,
			int BattlesWon,
			int BattlesLost,
			decimal GoldStolen
		);

		private record UserRanking(
			int RankingId,
			int UserId,
			string Username,
			int BaseCount,
			int TotalBuildingUpgrades,
			int TotalUnitUpgrades,
			int TotalUnits,
			int TotalUnitPurchases,
			decimal TotalGold,
			int TotalSupply,
			int AttacksSent,
			int DefencesSent,
			int BattlesWon,
			int BattlesLost,
			decimal GoldStolen,
			int Rank
		);

		private async Task ResetGameAsync(MySqlConnection conn, MySqlTransaction transaction)
		{
			try
			{
				// Delete from dependent tables first (due to foreign keys)
				string[] deleteSqls = new[]
				{
				"DELETE FROM nexus_reports_deleted;",
				"DELETE FROM nexus_attacks_sent;",
				"DELETE FROM nexus_defences_sent;",
				"DELETE FROM nexus_battles;",
				"DELETE FROM nexus_unit_purchases;",
				"DELETE FROM nexus_unit_upgrades;",
				"DELETE FROM nexus_base_upgrades;",
				"DELETE FROM nexus_units;",
				"DELETE FROM nexus_colors;",
				"DELETE FROM nexus_bases;" // Delete bases last due to cascades
            };

				foreach (var sql in deleteSqls)
				{
					using var cmd = new MySqlCommand(sql, conn, transaction);
					await cmd.ExecuteNonQueryAsync();
				}
			}
			catch (Exception ex)
			{
				await _log.Db($"Error resetting game: {ex.Message}", null, "NEXUS", true);
				throw; // Re-throw to rollback transaction
			}
		}
		private async Task<int> CountAvailableSpotsAsync(MySqlConnection conn, MySqlTransaction transaction)
		{
			const string countOccupiedSpotsSql = @"
            SELECT COUNT(*) 
            FROM maxhanna.nexus_bases";

			await using var selectCmd = new MySqlCommand(countOccupiedSpotsSql, conn, transaction);
			long? baseCount = (long?)await selectCmd.ExecuteScalarAsync();
			if (baseCount == null)
			{
				baseCount = 0;
			}
			int totalSpots = this.MapSizeX * this.MapSizeX;
			return totalSpots - (int)baseCount;
		}
		private async Task NotifyUser(int userId, int senderId, string baseCoords, string notificationType, MySqlConnection conn, MySqlTransaction transaction)
		{
			string selectCountSql = $@"
                SELECT COUNT(*)
                FROM maxhanna.notifications
                WHERE user_id = @userId
                  AND from_user_id = @senderId
                  AND user_profile_id = @senderId
                  AND (date >= (UTC_TIMESTAMP() - INTERVAL 1 DAY))
                  AND text LIKE 'Captured%';";

			await using var selectCmd = new MySqlCommand(selectCountSql, conn, transaction);
			selectCmd.Parameters.AddWithValue("@userId", userId);
			selectCmd.Parameters.AddWithValue("@senderId", senderId);

			long? notificationCount = (long?)await selectCmd.ExecuteScalarAsync();

			if (notificationCount == 0)
			{
				// Insert a new notification if none exists
				string insertSql = $@"
                    INSERT INTO maxhanna.notifications (user_id, from_user_id, user_profile_id, text, date)
                    VALUES (@userId, @senderId, @senderId, 'Captured {notificationType} at {baseCoords}!', UTC_TIMESTAMP());";

				await using var insertCmd = new MySqlCommand(insertSql, conn, transaction);
				insertCmd.Parameters.AddWithValue("@userId", userId);
				insertCmd.Parameters.AddWithValue("@senderId", senderId);

				await insertCmd.ExecuteNonQueryAsync();
			}
			else
			{
				// Update the existing notification
				string updateSql = $@"
                    UPDATE maxhanna.notifications
                    SET text = IF(
                        text LIKE 'Captured % bases,%',
                        CONCAT('Captured ', CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(text, ' ', -4), ' ', 1) AS UNSIGNED) + 1, ' bases, including {baseCoords}!'),
                        CONCAT('Captured 2 bases, including {baseCoords}!')
                    )
                    WHERE user_id = @userId 
                      AND from_user_id = @senderId 
                      AND user_profile_id = @senderId 
                      AND (date >= (UTC_TIMESTAMP() - INTERVAL 1 DAY))
                      AND text LIKE 'Captured%'
                    LIMIT 1;";

				await using var updateCmd = new MySqlCommand(updateSql, conn, transaction);
				updateCmd.Parameters.AddWithValue("@userId", userId);
				updateCmd.Parameters.AddWithValue("@senderId", senderId);

				await updateCmd.ExecuteNonQueryAsync();
			}
		}

		private async Task NotifyAttackerAndDefender(int attackerId, NexusBase deadBase, MySqlConnection conn, MySqlTransaction transaction)
		{
			var defenderId = deadBase.User?.Id ?? 0;
			var coordsX = deadBase.CoordsX;
			var coordsY = deadBase.CoordsY;
			var baseCoords = $"{{{coordsX},{coordsY}}}";

			// Notify Defender (if exists)
			if (defenderId != 0)
			{
				await NotifyUser(defenderId, attackerId, baseCoords, "your base", conn, transaction);
			}

			// Notify Attacker
			await NotifyUser(attackerId, attackerId, baseCoords, "a base", conn, transaction);
		}


		private async Task DeleteSupportSent(NexusBase deadBase, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			// Insert or update the base ownership
			string sql = @"
                DELETE FROM maxhanna.nexus_defences_sent 
                WHERE origin_coords_x = @CoordsX 
                AND origin_coords_y = @CoordsY;";

			var parameters = new Dictionary<string, object?>
						{
								{ "@CoordsX", deadBase.CoordsX },
								{ "@CoordsY", deadBase.CoordsY },
						};

			await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
		}

		private async Task DeleteAllUserReports(int userId, MySqlConnection conn, MySqlTransaction transaction)
		{
			// Step 1: Insert deletion requests for all battles involving the user
			string insertSql = @"
                INSERT INTO nexus_reports_deleted (user_id, battle_id)
                SELECT DISTINCT @UserId, b.battle_id
                FROM nexus_battles b
                WHERE (b.origin_user_id = @UserId OR b.destination_user_id = @UserId)
                AND NOT EXISTS (
                    SELECT 1 FROM nexus_reports_deleted d
                    WHERE d.user_id = @UserId AND d.battle_id = b.battle_id
                );";

			var insertParameters = new Dictionary<string, object?>
						{
								{ "@UserId", userId }
						};
			await ExecuteInsertOrUpdateOrDeleteAsync(insertSql, insertParameters, conn, transaction);

			// Step 2: Identify battles where both users have deleted the report
			string selectBattlesToDeleteSql = @"
                SELECT b.battle_id 
                FROM nexus_battles b
                LEFT JOIN nexus_reports_deleted d1 ON b.battle_id = d1.battle_id AND b.origin_user_id = d1.user_id
                LEFT JOIN nexus_reports_deleted d2 ON b.battle_id = d2.battle_id AND b.destination_user_id = d2.user_id
                WHERE (b.origin_user_id = @UserId OR b.destination_user_id = @UserId)
                AND d1.user_id IS NOT NULL
                AND d2.user_id IS NOT NULL;";

			List<int> battleIdsToDelete = new List<int>();

			MySqlCommand selectCmd = new MySqlCommand(selectBattlesToDeleteSql, conn, transaction);
			selectCmd.Parameters.AddWithValue("@UserId", userId);

			using (var reader = await selectCmd.ExecuteReaderAsync())
			{
				while (await reader.ReadAsync())
				{
					battleIdsToDelete.Add(reader.GetInt32("battle_id"));
				}
			}

			if (battleIdsToDelete.Count > 0)
			{
				string placeholders = string.Join(",", battleIdsToDelete.Select((_, index) => $"@BattleId{index}"));

				string deleteBattlesSql = $@"
                    DELETE FROM nexus_battles 
                    WHERE battle_id IN ({placeholders});";

				string deleteReportsSql = $@"
                    DELETE FROM nexus_reports_deleted
                    WHERE battle_id IN ({placeholders});";

				var deleteParameters = new Dictionary<string, object?>();

				for (int i = 0; i < battleIdsToDelete.Count; i++)
				{
					deleteParameters.Add($"@BattleId{i}", battleIdsToDelete[i]);
				}

				await ExecuteInsertOrUpdateOrDeleteAsync(deleteBattlesSql, deleteParameters, conn, transaction);
				await ExecuteInsertOrUpdateOrDeleteAsync(deleteReportsSql, deleteParameters, conn, transaction);
			}

		}

		private async Task DeleteReport(int userId, int[] battleIds, MySqlConnection conn, MySqlTransaction transaction)
		{
			// Insert the deletion request into nexus_reports_deleted
			for (var x = 0; x < battleIds.Length; x++)
			{
				string insertSql = @"
                INSERT INTO nexus_reports_deleted (user_id, battle_id) 
                VALUES (@UserId, @BattleId);";

				var insertParameters = new Dictionary<string, object?>
								{
										{ "@UserId", userId },
										{ "@BattleId", battleIds[x] },
								};
				await ExecuteInsertOrUpdateOrDeleteAsync(insertSql, insertParameters, conn, transaction);

				// Check if both users have deleted the report
				string selectUserIdsSql = @"
                SELECT user_id 
                FROM nexus_reports_deleted
                WHERE battle_id = @BattleId
                AND user_id IN (
                    SELECT origin_user_id 
                    FROM nexus_battles 
                    WHERE battle_id = @BattleId
                    UNION
                    SELECT destination_user_id 
                    FROM nexus_battles 
                    WHERE battle_id = @BattleId
                );";

				List<int> userIdsToDelete = new List<int>();

				MySqlCommand cmd = new MySqlCommand(selectUserIdsSql, conn, transaction);
				cmd.Parameters.AddWithValue("@BattleId", battleIds[x]);

				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						userIdsToDelete.Add(reader.GetInt32("user_id"));
					}
				}

				// If both users have deleted the report, proceed to delete the report from the nexus_battles table
				if (userIdsToDelete.Count == 2)
				{
					string deleteBattleSql = @"
                    DELETE FROM nexus_battles 
                    WHERE battle_id = @BattleId;";

					var deleteBattleParameters = new Dictionary<string, object?>
										{
												{ "@BattleId",  battleIds[x] },
										};
					await ExecuteInsertOrUpdateOrDeleteAsync(deleteBattleSql, deleteBattleParameters, conn, transaction);

					string deleteReportsSql = @"
                    DELETE FROM nexus_reports_deleted
                    WHERE battle_id = @BattleId;";

					var deleteReportsParameters = new Dictionary<string, object?>
										{
												{ "@BattleId",  battleIds[x] },
										};
					await ExecuteInsertOrUpdateOrDeleteAsync(deleteReportsSql, deleteReportsParameters, conn, transaction);
				}
			}
		}


		private async Task ResearchUnit(NexusBase nexusBase, UnitStats? unit, MySqlConnection? connection = null, MySqlTransaction? transaction = null)
		{
			if (unit == null) return;
			string sql = @"
                INSERT INTO nexus_unit_upgrades (coords_x, coords_y, unit_id_upgraded) 
                VALUES (@CoordsX, @CoordsY, @UnitId);";

			var parameters = new Dictionary<string, object?>
						{
								{ "@CoordsX", nexusBase.CoordsX },
								{ "@CoordsY", nexusBase.CoordsY },
								{ "@UnitId", unit.UnitId },
						};
			await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, connection, transaction);
		}


		private async Task<NexusBattleOutcome> CreateBattleOutcome(List<NexusAttackSent> attacks, int attackIndex, NexusBase origin, NexusBase destination,
				NexusUnits? defendingUnits, Dictionary<string, int?>? attackingLosses, Dictionary<string, int?> defendingLosses, decimal goldPlundered, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			//_ = _log.Db("Create battle outcome");
			NexusUnits? dunoi = await GetNexusAttackingUnits(destination, conn, transaction);
			return new NexusBattleOutcome()
			{
				OriginUser = origin.User,
				OriginCoordsX = origin.CoordsX,
				OriginCoordsY = origin.CoordsY,
				DestinationUser = destination.User,
				DestinationCoordsX = destination.CoordsX,
				DestinationCoordsY = destination.CoordsY,
				AttackingUnits = new Dictionary<string, int?>
								{
										{ "marine", attacks[attackIndex].MarineTotal },
										{ "goliath", attacks[attackIndex].GoliathTotal },
										{ "siege_tank", attacks[attackIndex].SiegeTankTotal },
										{ "scout", attacks[attackIndex].ScoutTotal },
										{ "wraith", attacks[attackIndex].WraithTotal },
										{ "battlecruiser", attacks[attackIndex].BattlecruiserTotal },
										{ "glitcher", attacks[attackIndex].GlitcherTotal },
								},
				DefendingUnits = new Dictionary<string, int?>
								{
										{ "marine", defendingUnits?.MarineTotal },
										{ "goliath", defendingUnits?.GoliathTotal },
										{ "siege_tank", defendingUnits?.SiegeTankTotal },
										{ "scout", defendingUnits?.ScoutTotal },
										{ "wraith", defendingUnits?.WraithTotal },
										{ "battlecruiser", defendingUnits?.BattlecruiserTotal },
										{ "glitcher", defendingUnits?.GlitcherTotal },
								},
				AttackingLosses = attackingLosses ?? new Dictionary<string, int?>(),
				DefendingLosses = defendingLosses,
				DefenderGold = destination.Gold,
				DefenderGoldStolen = goldPlundered,
				DefenderBuildingLevels = new Dictionary<string, int?>
								{
										{ "command_center", destination.CommandCenterLevel },
										{ "mines", destination.MinesLevel },
										{ "supply_depot", destination.SupplyDepotLevel },
										{ "warehouse", destination.WarehouseLevel },
										{ "factory", destination.FactoryLevel },
										{ "starport", destination.StarportLevel },
										{ "engineering_bay", destination.EngineeringBayLevel },
								},
				DefenderUnitsNotInVillage = new Dictionary<string, int?>
								{

										{ "marine", dunoi?.MarineTotal },
										{ "goliath", dunoi?.GoliathTotal },
										{ "siege_tank", dunoi?.SiegeTankTotal },
										{ "scout", dunoi?.ScoutTotal },
										{ "wraith", dunoi?.WraithTotal },
										{ "battlecruiser", dunoi?.BattlecruiserTotal },
										{ "glitcher", dunoi?.GlitcherTotal },
								}
			};
		}
		private async Task<NexusBattleOutcomeReports> GetAllBattleReports(
				int? userId,
				NexusBase? targetBase,
				int? targetUserId,
				int pageNumber,
				int pageSize,
				bool searchDefenceReports,
				bool searchAttackReports,
				MySqlConnection? externalConnection = null,
				MySqlTransaction? externalTransaction = null)
		{
			var battleReports = new List<NexusBattleOutcome>();
			int offset = (pageNumber - 1) * pageSize;
			int totalReports = 0;
			string query = $@"
                SELECT SQL_CALC_FOUND_ROWS b.*, au.username as attackerUsername, du.username as defenderUsername, audp.file_id as attackerDp, dudp.file_id as defenderDp
                FROM nexus_battles b
                LEFT JOIN maxhanna.users au ON au.id = b.origin_user_id
                LEFT JOIN maxhanna.user_display_pictures audp ON au.id = audp.user_id
                LEFT JOIN maxhanna.users du ON du.id = b.destination_user_id
                LEFT JOIN maxhanna.user_display_pictures dudp ON du.id = dudp.user_id
                WHERE 1=1 {(searchDefenceReports ? " AND du.id = @UserId " : "")} {(searchAttackReports ? " AND au.id = @UserId " : "")}";

			if (userId != null)
			{
				query += @"
                    AND (b.origin_user_id = @UserId OR b.destination_user_id = @UserId)
                    AND NOT EXISTS (
                        SELECT 1
                        FROM nexus_reports_deleted d
                        WHERE d.user_id = @UserId
                        AND d.battle_id = b.battle_id
                    )";
			}

			if (targetBase != null)
			{
				query += @"
                    AND (b.destination_coords_x = @BaseCoordsX AND b.destination_coords_y = @BaseCoordsY)";
			}
			if (targetUserId != null)
			{
				if (targetUserId == 0)
				{
					query += @"
                        AND (b.destination_user_id IS NULL)";
				}
				else
				{
					query += @"
                        AND (b.destination_user_id = @DestinationUserId OR b.origin_user_id = @DestinationUserId)";
				}
			}
			query += @"
                ORDER BY b.timestamp DESC, b.battle_id DESC
                LIMIT @PageSize OFFSET @Offset";



			string countQuery = @"
                    SELECT COUNT(*) 
                    FROM nexus_battles b 
                    WHERE 1=1 ";

			if (userId != null)
			{
				countQuery += @"
                        AND (b.origin_user_id = @UserId OR b.destination_user_id = @UserId)
                        AND NOT EXISTS (
                            SELECT 1
                            FROM nexus_reports_deleted d
                            WHERE d.user_id = @UserId
                            AND d.battle_id = b.battle_id
                        )";
			}

			if (targetBase != null)
			{
				countQuery += @"
                        AND (b.destination_coords_x = @BaseCoordsX AND b.destination_coords_y = @BaseCoordsY)";
			}

			MySqlConnection connection = externalConnection ?? new MySqlConnection(_connectionString);
			MySqlTransaction? transaction = externalTransaction;
			bool needToCloseConnection = externalConnection == null;
			bool needToCommitTransaction = externalTransaction == null; 
			//_ = _log.Db(offset);
			//_ = _log.Db(pageSize);
			try
			{
				if (needToCloseConnection)
				{
					await connection.OpenAsync();
				}

				if (needToCommitTransaction)
				{
					transaction = await connection.BeginTransactionAsync();
				}

				using (var command = new MySqlCommand(query, connection, transaction))
				{
					if (userId != null)
					{
						command.Parameters.AddWithValue("@UserId", userId);
					}
					if (targetBase != null)
					{
						command.Parameters.AddWithValue("@BaseCoordsX", targetBase.CoordsX);
						command.Parameters.AddWithValue("@BaseCoordsY", targetBase.CoordsY);
					}
					if (targetUserId != null)
					{
						command.Parameters.AddWithValue("@DestinationUserId", targetUserId == 0 ? null : targetUserId);
					}
					command.Parameters.AddWithValue("@PageSize", pageSize);
					command.Parameters.AddWithValue("@Offset", offset);

					using (var reader = await command.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{
							int? aDisplayPicId = reader.IsDBNull(reader.GetOrdinal("attackerDp")) ? null : reader.GetInt32("attackerDp");
							FileEntry? adpFileEntry = aDisplayPicId != null ? new FileEntry() { Id = (Int32)(aDisplayPicId) } : null;
							int? originUserId = reader.IsDBNull(reader.GetOrdinal("origin_user_id")) ? (int?)null : reader.GetInt32("origin_user_id");
							string? originUserName = reader.IsDBNull(reader.GetOrdinal("attackerUsername")) ? "Anonymous" : reader.GetString("attackerUsername");

							int? dDisplayPicId = reader.IsDBNull(reader.GetOrdinal("defenderDp")) ? null : reader.GetInt32("defenderDp");
							FileEntry? ddpFileEntry = dDisplayPicId != null ? new FileEntry() { Id = (Int32)(dDisplayPicId) } : null;
							int? defenderUserId = reader.IsDBNull(reader.GetOrdinal("destination_user_id")) ? (int?)null : reader.GetInt32("destination_user_id");
							string? defenderUserName = reader.IsDBNull(reader.GetOrdinal("defenderUsername")) ? "Anonymous" : reader.GetString("defenderUsername");

							var battleOutcome = new NexusBattleOutcome
							{
								BattleId = reader.GetInt32("battle_id"),
								OriginUser = new User(originUserId ?? 0, originUserName, adpFileEntry),
								OriginCoordsX = reader.IsDBNull(reader.GetOrdinal("origin_coords_x")) ? 0 : reader.GetInt32("origin_coords_x"),
								OriginCoordsY = reader.IsDBNull(reader.GetOrdinal("origin_coords_y")) ? 0 : reader.GetInt32("origin_coords_y"),
								DestinationUser = new User(defenderUserId ?? 0, defenderUserName, ddpFileEntry),
								DestinationCoordsX = reader.IsDBNull(reader.GetOrdinal("destination_coords_x")) ? 0 : reader.GetInt32("destination_coords_x"),
								DestinationCoordsY = reader.IsDBNull(reader.GetOrdinal("destination_coords_y")) ? 0 : reader.GetInt32("destination_coords_y"),
								Timestamp = reader.GetDateTime("timestamp"),
								AttackingUnits = JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("attacking_units")) ?? new Dictionary<string, int?>(),
								DefendingUnits = JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("defending_units")) ?? new Dictionary<string, int?>(),
								AttackingLosses = JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("attacking_losses")) ?? new Dictionary<string, int?>(),
								DefendingLosses = JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("defending_losses")) ?? new Dictionary<string, int?>(),
								DefenderUnitsNotInVillage = reader.IsDBNull(reader.GetOrdinal("defender_units_not_in_village")) ? new Dictionary<string, int?>() : JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("defender_units_not_in_village")),
								DefenderBuildingLevels = reader.IsDBNull(reader.GetOrdinal("defender_building_levels")) ? new Dictionary<string, int?>() : JsonConvert.DeserializeObject<Dictionary<string, int?>>(reader.GetString("defender_building_levels")),
								DefenderGold = reader.IsDBNull(reader.GetOrdinal("defender_gold")) ? 0 : reader.GetDecimal("defender_gold"),
								DefenderGoldStolen = reader.IsDBNull(reader.GetOrdinal("defender_gold_stolen")) ? 0 : reader.GetDecimal("defender_gold_stolen"),
							};

							battleReports.Add(battleOutcome);
						}
					}
				}

				foreach (var battleOutcome in battleReports)
				{
					int attackingScouts = battleOutcome.AttackingUnits?.GetValueOrDefault("scout") ?? 0;
					int scoutLosses = battleOutcome.AttackingLosses?.GetValueOrDefault("scout") ?? 0;
					int scoutsSurvived = attackingScouts - scoutLosses;
					double attackingScoutsSurvivedPercentage = attackingScouts > 0 ? (double)scoutsSurvived / attackingScouts : 0;

					// Fetch the scout level for the attacking base
					int scoutLevel = 0;
					if (battleOutcome.OriginCoordsX != 0 && battleOutcome.OriginCoordsY != 0)
					{
						string scoutLevelQuery = @"
                            SELECT scout_level
                            FROM nexus_bases
                            WHERE coords_x = @OriginCoordsX AND coords_y = @OriginCoordsY";

						using (var scoutLevelCommand = new MySqlCommand(scoutLevelQuery, connection, transaction))
						{
							scoutLevelCommand.Parameters.AddWithValue("@OriginCoordsX", battleOutcome.OriginCoordsX);
							scoutLevelCommand.Parameters.AddWithValue("@OriginCoordsY", battleOutcome.OriginCoordsY);

							scoutLevel = Convert.ToInt32(await scoutLevelCommand.ExecuteScalarAsync());
						}
					}

					if (attackingScoutsSurvivedPercentage < 0.5 || (battleOutcome.DestinationUser?.Id != userId && battleOutcome.OriginUser?.Id != userId))
					{
						// Hide defending units
						battleOutcome.DefendingUnits = new Dictionary<string, int?>();
					}
					else
					{
						if (!(attackingScoutsSurvivedPercentage >= 0.5))
						{
							// Show defending units that are currently in the village
							battleOutcome.DefendingUnits = new Dictionary<string, int?>();
						}

						if (!(attackingScoutsSurvivedPercentage > 0.5 && scoutLevel >= 1))
						{
							// Add resources to the battle outcome
							battleOutcome.DefenderGold = null; // Assuming you have a Resources property in NexusBattleOutcome
						}

						if (!(attackingScoutsSurvivedPercentage > 0.7 && scoutLevel >= 2))
						{
							// Add building levels to the battle outcome
							battleOutcome.DefenderBuildingLevels = new Dictionary<string, int?>(); // Assuming you have a BuildingLevels property in NexusBattleOutcome
						}

						if (!(attackingScoutsSurvivedPercentage > 0.9 && scoutLevel >= 3))
						{
							// Add units not currently in the village to the battle outcome
							battleOutcome.DefenderUnitsNotInVillage = new Dictionary<string, int?>(); // Assuming you have a UnitsNotInVillage property in NexusBattleOutcome
						}
					}
				}

				using (var totalReportsCommand = new MySqlCommand(countQuery, connection, transaction))
				{
					if (userId != null)
					{
						totalReportsCommand.Parameters.AddWithValue("@UserId", userId);
					}
					if (targetBase != null)
					{
						totalReportsCommand.Parameters.AddWithValue("@BaseCoordsX", targetBase.CoordsX);
						totalReportsCommand.Parameters.AddWithValue("@BaseCoordsY", targetBase.CoordsY);
					}
					totalReports = Convert.ToInt32(await totalReportsCommand.ExecuteScalarAsync());
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("GetAllBattleReports Exception!:" + ex.Message, userId, "NEXUS", true);
				if (externalTransaction == null && transaction != null)
				{
					await transaction.RollbackAsync();
				}
			}
			finally
			{

				if (externalTransaction == null && transaction != null)
				{
					await transaction.CommitAsync();
				}
				if (externalConnection == null && connection != null)
				{
					await connection.CloseAsync();
				}
			}
			return new NexusBattleOutcomeReports
			{
				BattleOutcomes = battleReports,
				CurrentPage = pageNumber,
				PageSize = pageSize,
				TotalReports = totalReports
			};
		}



		private async Task InsertBattleOutcome(NexusBattleOutcome battleOutcome, MySqlConnection? conn, MySqlTransaction? transaction)
		{
			//_ = _log.Db("Creating a report");
			string sql = @"
                INSERT INTO nexus_battles 
                    (origin_user_id, origin_coords_x, origin_coords_y, destination_user_id, destination_coords_x, destination_coords_y, 
                    attacking_units, defending_units, attacking_losses, defending_losses, defender_units_not_in_village, defender_building_levels, defender_gold, defender_gold_stolen) 
                VALUES 
                    (@origin_user_id, @origin_coords_x, @origin_coords_y, @destination_user_id, @destination_coords_x, @destination_coords_y, 
                    @attacking_units, @defending_units, @attacking_losses, @defending_losses, @defender_units_not_in_village, @defender_building_levels, @defender_gold, @defender_gold_stolen);";

			var parameters = new Dictionary<string, object?>
						{
								{ "@origin_user_id", battleOutcome.OriginUser != null ? battleOutcome.OriginUser.Id : DBNull.Value },
								{ "@origin_coords_x", battleOutcome.OriginCoordsX },
								{ "@origin_coords_y", battleOutcome.OriginCoordsY },
								{ "@destination_user_id",  battleOutcome.DestinationUser != null ? battleOutcome.DestinationUser.Id : DBNull.Value },
								{ "@destination_coords_x", battleOutcome.DestinationCoordsX },
								{ "@destination_coords_y", battleOutcome.DestinationCoordsY },
								{ "@attacking_units", JsonConvert.SerializeObject(battleOutcome.AttackingUnits) },
								{ "@defending_units", JsonConvert.SerializeObject(battleOutcome.DefendingUnits) },
								{ "@attacking_losses", JsonConvert.SerializeObject(battleOutcome.AttackingLosses) },
								{ "@defending_losses", JsonConvert.SerializeObject(battleOutcome.DefendingLosses) },
								{ "@defender_units_not_in_village", JsonConvert.SerializeObject(battleOutcome.DefenderUnitsNotInVillage) },
								{ "@defender_building_levels", JsonConvert.SerializeObject(battleOutcome.DefenderBuildingLevels) },
								{ "@defender_gold", battleOutcome.DefenderGold },
								{ "@defender_gold_stolen", battleOutcome.DefenderGoldStolen },
						};

			await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction);
			//_ = _log.Db($"Report created");
		}
		[HttpPost("UpdateNexusUnitUpgradesCompletes")]
		public async Task UpdateNexusUnitUpgradesCompletes([FromBody] NexusBase nexus)
		{
			MySqlConnection conn = new MySqlConnection(_connectionString);
			await conn.OpenAsync();
			MySqlTransaction transaction = await conn.BeginTransactionAsync();

			try
			{
				List<UnitStats> stats = await GetUnitStatsFromDB(null, null, conn, transaction);
				List<NexusUnitUpgrades>? upgrades = await GetNexusUnitUpgrades(nexus, conn, transaction);

				if (upgrades != null && stats.Count > 0)
				{
					for (var x = 0; x < upgrades.Count; x++)
					{
						UnitStats stat = stats.First(stat => stat.UnitId == upgrades[x].UnitIdUpgraded);
						int duration = stat.Duration;
						int unitId = upgrades[x].UnitIdUpgraded;
						int unitLevel = GetUnitLevelForUnit(nexus, unitId);
						int upgradeDuration = await GetUpgradeDurationForUnit(unitLevel, unitId, conn, transaction);

						string unitType = stat.UnitType ?? "";
						TimeSpan timeElapsed = DateTime.Now - upgrades[x].Timestamp;
						//_ = _log.Db($"Checking {nexus.CoordsX}{nexus.CoordsX} unit upgrades. timeElapsed.TotalSeconds: {timeElapsed.TotalSeconds} Duration : {duration} ({timeElapsed.TotalSeconds - duration})");
						if ((timeElapsed.TotalSeconds - duration) >= -3)
						{
							//_ = _log.Db("time elapsed! upgrading unit");
							// Update unit level in nexus_bases table
							string sqlUpdate = $@"
                                UPDATE nexus_bases 
                                SET {unitType}_level = {unitType}_level + 1 
                                WHERE coords_x = @CoordsX AND coords_y = @CoordsY;";

							MySqlCommand cmdUpdate = new MySqlCommand(sqlUpdate, conn, transaction);
							cmdUpdate.Parameters.AddWithValue("@CoordsX", upgrades[x].CoordsX);
							cmdUpdate.Parameters.AddWithValue("@CoordsY", upgrades[x].CoordsY);
							await cmdUpdate.ExecuteNonQueryAsync();

							// Delete the completed upgrade from nexus_unit_upgrades
							string sqlDelete = $@"
                                DELETE FROM nexus_unit_upgrades 
                                WHERE id = @Id;";

							MySqlCommand cmdDelete = new MySqlCommand(sqlDelete, conn, transaction);
							cmdDelete.Parameters.AddWithValue("@Id", upgrades[x].Id);
							await cmdDelete.ExecuteNonQueryAsync();
						}
					}
				}
				await transaction.CommitAsync();
			}
			catch (Exception ex)
			{
				await transaction.RollbackAsync();
				_ = _log.Db("An error occurred while updating Nexus unit upgrades. " + ex.Message, nexus.User?.Id, "NEXUS", true);
				throw;
			}
			finally
			{
				await conn.CloseAsync();
			}
		}


		[HttpPost("UpdateNexusUnitTrainingCompletes")]
		public async Task UpdateNexusUnitTrainingCompletes()
		{
			//_ = _log.Db("Update Nexus Units Training Completed");
			string sql = @"
                INSERT INTO nexus_units (coords_x, coords_y, marine_total, goliath_total, siege_tank_total, scout_total, wraith_total, battlecruiser_total, glitcher_total)
                SELECT
                    p.coords_x,
                    p.coords_y,
                    SUM(CASE WHEN p.unit_id_purchased = 6 THEN p.quantity_purchased ELSE 0 END) AS marine_total,
                    SUM(CASE WHEN p.unit_id_purchased = 7 THEN p.quantity_purchased ELSE 0 END) AS goliath_total,
                    SUM(CASE WHEN p.unit_id_purchased = 10 THEN p.quantity_purchased ELSE 0 END) AS siege_tank_total,
                    SUM(CASE WHEN p.unit_id_purchased = 11 THEN p.quantity_purchased ELSE 0 END) AS scout_total,
                    SUM(CASE WHEN p.unit_id_purchased = 9 THEN p.quantity_purchased ELSE 0 END) AS wraith_total,
                    SUM(CASE WHEN p.unit_id_purchased = 8 THEN p.quantity_purchased ELSE 0 END) AS battlecruiser_total,
                    SUM(CASE WHEN p.unit_id_purchased = 12 THEN p.quantity_purchased ELSE 0 END) AS glitcher_total
                FROM nexus_unit_purchases p
                JOIN nexus_unit_stats stat ON stat.unit_id = p.unit_id_purchased
                WHERE TIMESTAMPDIFF(SECOND, p.timestamp, NOW()) >= stat.duration 
                GROUP BY p.coords_x, p.coords_y 
                ON DUPLICATE KEY UPDATE
                    marine_total = marine_total + VALUES(marine_total),
                    goliath_total = goliath_total + VALUES(goliath_total),
                    siege_tank_total = siege_tank_total + VALUES(siege_tank_total),
                    scout_total = scout_total + VALUES(scout_total),
                    wraith_total = wraith_total + VALUES(wraith_total),
                    battlecruiser_total = battlecruiser_total + VALUES(battlecruiser_total),
                    glitcher_total = glitcher_total + VALUES(glitcher_total);
    
                DELETE FROM nexus_unit_purchases
                WHERE TIMESTAMPDIFF(SECOND, timestamp, NOW()) >= (SELECT duration FROM nexus_unit_stats WHERE unit_id = unit_id_purchased);";
			MySqlConnection conn = new MySqlConnection(_connectionString);
			await conn.OpenAsync();
			MySqlTransaction transaction = await conn.BeginTransactionAsync(System.Data.IsolationLevel.ReadUncommitted);

			try
			{

				var parameters = new Dictionary<string, object?>();
				long? res = await ExecuteInsertOrUpdateOrDeleteAsync(sql, parameters, conn, transaction); 
				await transaction.CommitAsync();
			}
			catch (Exception ex)
			{

				await transaction.RollbackAsync();
				_ = _log.Db("An error occurred while updating Nexus units. : " + ex.Message, null, "NEXUS", true);
				throw;
			}
			finally
			{

				await conn.CloseAsync();

			}
		}

		[HttpPost("/Nexus/ActivePlayers", Name = "GetNexusActivePlayers")]
		public async Task<IActionResult> GetNexusActivePlayers([FromBody] int? minutes)
		{
			int windowMinutes = minutes ?? 2;
			// clamp to reasonable bounds to avoid accidental large values
			if (windowMinutes < 0) windowMinutes = 0;
			if (windowMinutes > 60 * 24) windowMinutes = 60 * 24; // max 24 hours
			try
			{
				using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();
				// Build a query that returns all potentially active user_ids; we'll distinct them in C#
				string sql = $@"
					SELECT user_id FROM (
						SELECT origin_user_id AS user_id FROM maxhanna.nexus_attacks_sent WHERE timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL {windowMinutes} MINUTE)
						UNION ALL
						SELECT destination_user_id AS user_id FROM maxhanna.nexus_attacks_sent WHERE timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL {windowMinutes} MINUTE)
						UNION ALL
						SELECT origin_user_id AS user_id FROM maxhanna.nexus_defences_sent WHERE timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL {windowMinutes} MINUTE)
						UNION ALL
						SELECT destination_user_id AS user_id FROM maxhanna.nexus_defences_sent WHERE timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL {windowMinutes} MINUTE)
						UNION ALL
						SELECT nb.user_id AS user_id FROM maxhanna.nexus_unit_purchases p JOIN maxhanna.nexus_bases nb ON nb.coords_x = p.coords_x AND nb.coords_y = p.coords_y WHERE p.timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL {windowMinutes} MINUTE)
						UNION ALL
						SELECT nb.user_id AS user_id FROM maxhanna.nexus_unit_upgrades u JOIN maxhanna.nexus_bases nb ON nb.coords_x = u.coords_x AND nb.coords_y = u.coords_y WHERE u.timestamp >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL {windowMinutes} MINUTE)
						UNION ALL
						SELECT user_id AS user_id FROM maxhanna.nexus_bases WHERE updated >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL {windowMinutes} MINUTE)
					) x WHERE user_id IS NOT NULL;";

				var distinctUserIds = new HashSet<int>();
				using (var cmd = new MySqlCommand(sql, conn))
				using (var reader = await cmd.ExecuteReaderAsync())
				{
					while (await reader.ReadAsync())
					{
						if (!reader.IsDBNull(0))
						{
							int uid = reader.GetInt32(0);
							// Only consider positive user ids
							if (uid > 0) distinctUserIds.Add(uid);
						}
					}
				}
				return Ok(new { count = distinctUserIds.Count });
			}
			catch (Exception ex)
			{
				_ = _log.Db("GetNexusActivePlayers Exception: " + ex.Message, null, "NEXUS", true);
				return StatusCode(500, "Internal server error");
			}
		}

		[HttpPost("/Nexus/GetUserRank", Name = "Nexus_GetUserRank")]
		public async Task<IActionResult> GetNexusUserRank([FromBody] int userId)
		{
			if (userId <= 0) return BadRequest("Invalid user id");
			try
			{
				await using var conn = new MySqlConnection(_connectionString);
				await conn.OpenAsync();

				// Fetch user's base count & total gold
				const string userStatsSql = "SELECT COUNT(*) AS base_count, COALESCE(SUM(gold),0) AS total_gold FROM maxhanna.nexus_bases WHERE user_id = @UserId;";
				int userBaseCount = 0; decimal userTotalGold = 0m;
				await using (var userStatsCmd = new MySqlCommand(userStatsSql, conn))
				{
					userStatsCmd.Parameters.AddWithValue("@UserId", userId);
					await using var r = await userStatsCmd.ExecuteReaderAsync();
					if (await r.ReadAsync())
					{
						userBaseCount = r.IsDBNull(r.GetOrdinal("base_count")) ? 0 : r.GetInt32("base_count");
						userTotalGold = r.IsDBNull(r.GetOrdinal("total_gold")) ? 0 : r.GetDecimal("total_gold");
					}
				}

				// Total distinct players that have at least 1 base
				const string totalPlayersSql = "SELECT COUNT(DISTINCT user_id) FROM maxhanna.nexus_bases;";
				int totalPlayers = 0;
				await using (var totalCmd = new MySqlCommand(totalPlayersSql, conn))
				{
					totalPlayers = Convert.ToInt32(await totalCmd.ExecuteScalarAsync());
				}

				if (userBaseCount == 0)
				{
					return Ok(new { hasBase = false, totalPlayers });
				}

				// Count number of players with strictly better stats (higher base count OR same base count but higher total gold)
				const string higherSql = @"SELECT COUNT(*) FROM (SELECT user_id, COUNT(*) AS bc, SUM(gold) AS tg FROM maxhanna.nexus_bases GROUP BY user_id) x WHERE (x.bc > @Bc) OR (x.bc = @Bc AND x.tg > @Tg);";
				int higherCount = 0;
				await using (var higherCmd = new MySqlCommand(higherSql, conn))
				{
					higherCmd.Parameters.AddWithValue("@Bc", userBaseCount);
					higherCmd.Parameters.AddWithValue("@Tg", userTotalGold);
					higherCount = Convert.ToInt32(await higherCmd.ExecuteScalarAsync());
				}

				int rank = higherCount + 1; // dense ranking concept
				return Ok(new { hasBase = true, rank, baseCount = userBaseCount, totalGold = userTotalGold, totalPlayers });
			}
			catch (Exception ex)
			{
				_ = _log.Db("GetNexusUserRank Exception: " + ex.Message, userId, "NEXUS", true);
				return StatusCode(500, "Internal server error");
			}
		}

		private int GetUnitLevelForUnit(NexusBase nexus, int unitId)
		{
			switch (unitId)
			{
				case 6:
					return nexus.MarineLevel;
				case 7:
					return nexus.GoliathLevel;
				case 8:
					return nexus.BattlecruiserLevel;
				case 9:
					return nexus.WraithLevel;
				case 10:
					return nexus.SiegeTankLevel;
				case 11:
					return nexus.ScoutLevel;
				case 12:
					return nexus.GlitcherLevel;
				default:
					throw new ArgumentException($"Unknown unitId: {unitId}");
			}
		}

		private async Task<int> GetUpgradeDurationForUnit(int unitLevel, int unitId, MySqlConnection conn, MySqlTransaction transaction)
		{
			string sql = @"
                SELECT us.duration
                FROM nexus_unit_upgrade_stats us
                JOIN nexus_unit_stats s ON s.unit_level = us.unit_level
                WHERE s.unit_id = @UnitId AND us.unit_level = @UnitLevel;";

			MySqlCommand cmd = new MySqlCommand(sql, conn, transaction);
			cmd.Parameters.AddWithValue("@UnitId", unitId);
			cmd.Parameters.AddWithValue("@UnitLevel", unitLevel);

			object? result = await cmd.ExecuteScalarAsync();
			if (result != null && int.TryParse(result.ToString(), out int duration))
			{
				return duration;
			}
			return 1; // Default duration if not found
		}

		private async Task<List<NexusUnitUpgrades>> GetNexusUnitUpgrades(NexusBase? nexus, MySqlConnection conn, MySqlTransaction transaction)
		{
			if (nexus == null) { return new List<NexusUnitUpgrades>(); }
			string query = @"
                SELECT 
                    id, 
                    coords_x, 
                    coords_y, 
                    unit_id_upgraded, 
                    timestamp 
                FROM 
                    nexus_unit_upgrades 
                WHERE 
                    coords_x = @CoordsX AND coords_y = @CoordsY;";

			MySqlCommand cmd = new MySqlCommand(query, conn, transaction);
			cmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
			cmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);

			List<NexusUnitUpgrades> upgrades = new List<NexusUnitUpgrades>();
			using (var reader = await cmd.ExecuteReaderAsync())
			{
				while (await reader.ReadAsync())
				{
					NexusUnitUpgrades upgrade = new NexusUnitUpgrades
					{
						Id = reader.GetInt32("id"),
						CoordsX = reader.GetInt32("coords_x"),
						CoordsY = reader.GetInt32("coords_y"),
						UnitIdUpgraded = reader.GetInt32("unit_id_upgraded"),
						Timestamp = reader.GetDateTime("timestamp")
					};
					upgrades.Add(upgrade);
				}
			}
			return upgrades;
		}
		private async Task UpdateNexusUnitPurchases(int coordsX, int coordsY, int unitId, int unitsToAdd, MySqlConnection conn, MySqlTransaction transaction)
		{
			string sqlUpdate = $@"
                INSERT INTO nexus_unit_purchases (coords_x, coords_y, unit_id_purchased, quantity_purchased)
                VALUES (@CoordsX, @CoordsY, @UnitId, @UnitsTotal);";

			MySqlCommand cmdUpdate = new MySqlCommand(sqlUpdate, conn, transaction);
			cmdUpdate.Parameters.AddWithValue("@UnitsTotal", unitsToAdd);
			cmdUpdate.Parameters.AddWithValue("@UnitId", unitId);
			cmdUpdate.Parameters.AddWithValue("@CoordsX", coordsX);
			cmdUpdate.Parameters.AddWithValue("@CoordsY", coordsY);
			//_ = _log.Db($"Updated Nexus Unit Purchases {unitId}: {unitsToAdd}");
			await cmdUpdate.ExecuteNonQueryAsync();
		}

		private async Task UpdateNexusGoldAndSupply(
				int coordsX,
				int coordsY,
				decimal? newGoldAmount,
				int? newSupplyAmount,
				MySqlConnection conn,
				MySqlTransaction transaction)
		{
			// Ensure either gold or supply is provided, but not both
			if (newGoldAmount == null && newSupplyAmount == null)
			{
				throw new ArgumentException("At least one of newGoldAmount or newSupplyAmount must be provided.");
			}

			try
			{
				// Prepare the SQL update statement based on which parameters are provided
				string sqlUpdate = "UPDATE nexus_bases SET ";
				var parameters = new List<MySqlParameter>();

				if (newGoldAmount != null)
				{
					sqlUpdate += "gold = @Gold ";
					parameters.Add(new MySqlParameter("@Gold", newGoldAmount));
				}

				if (newSupplyAmount != null)
				{
					if (sqlUpdate.Contains("@Gold"))
					{
						sqlUpdate += ", ";
					}
					sqlUpdate += "supply = @Supply ";
					parameters.Add(new MySqlParameter("@Supply", newSupplyAmount));
				}

				sqlUpdate += "WHERE coords_x = @CoordsX AND coords_y = @CoordsY;";
				parameters.Add(new MySqlParameter("@CoordsX", coordsX));
				parameters.Add(new MySqlParameter("@CoordsY", coordsY));

				using (var cmdUpdate = new MySqlCommand(sqlUpdate, conn, transaction))
				{
					// Add parameters to the command
					cmdUpdate.Parameters.AddRange(parameters.ToArray());
					//_ = _log.Db(sqlUpdate);
					//_ = _log.Db($"Updated nexus at ({coordsX}, {coordsY}) - Gold: {newGoldAmount}, Supply: {newSupplyAmount}");
					await cmdUpdate.ExecuteNonQueryAsync();
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Exception : " + ex.Message, null, "NEXUS", true);
			}
		}


		private async Task<(decimal currentGold, int supplyCapacity)> GetNexusGoldAndSupply(NexusBase request, MySqlConnection conn, MySqlTransaction transaction)
		{
			var res = ((decimal)0.0, 0);
			try
			{
				string sqlCurrentLevels = @"
                        SELECT 
                            n.supply_depot_level, n.gold, n.supply 
                        FROM 
                            nexus_bases n
                        WHERE 
                            coords_x = @CoordsX
                            AND coords_y = @CoordsY";

				using (MySqlCommand cmdLvl = new MySqlCommand(sqlCurrentLevels, conn, transaction))
				{
					//_ = _log.Db("creating command for levels");
					cmdLvl.Parameters.AddWithValue("@CoordsX", request.CoordsX);
					cmdLvl.Parameters.AddWithValue("@CoordsY", request.CoordsY);
					using (var readerCurrentLevels = await cmdLvl.ExecuteReaderAsync())
					{
						if (await readerCurrentLevels.ReadAsync())
						{
							int supplyCapacity = readerCurrentLevels.GetInt32("supply_depot_level") * 2500;
							decimal currentGold = readerCurrentLevels.GetDecimal("gold");
							//_ = _log.Db($"Got current supplyCapacity {supplyCapacity} and currentGold: {currentGold}");
							res = (currentGold, supplyCapacity);
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error reading current levels: {ex.Message}", null, "NEXUS", true);
				throw;
			}

			return res;
		}


		private async Task<int> CalculateUsedNexusSupply(NexusBase? nexus, MySqlConnection conn, MySqlTransaction transaction)
		{
			int res = 0;
			if (nexus == null || nexus.User == null || nexus.User?.Id == 0) return res;
			try
			{
				string sqlCurrentSupply = @"
            SELECT 
                u.marine_total,
                u.goliath_total,
                u.siege_tank_total,
                u.wraith_total,
                u.scout_total,
                u.battlecruiser_total,
                u.glitcher_total,
                COALESCE(marines.supply, 0) AS marines_supply,
                COALESCE(goliaths.supply, 0) AS goliaths_supply,
                COALESCE(siege_tanks.supply, 0) AS siege_tanks_supply,
                COALESCE(scouts.supply, 0) AS scouts_supply,
                COALESCE(wraiths.supply, 0) AS wraiths_supply,
                COALESCE(battlecruisers.supply, 0) AS battlecruisers_supply,
                COALESCE(glitchers.supply, 0) AS glitchers_supply,
                COALESCE(marine_purchased.total, 0) AS marine_purchased,
                COALESCE(goliath_purchased.total, 0) AS goliath_purchased,
                COALESCE(siege_tank_purchased.total, 0) AS siege_tank_purchased,
                COALESCE(scout_purchased.total, 0) AS scout_purchased,
                COALESCE(wraith_purchased.total, 0) AS wraith_purchased,
                COALESCE(battlecruiser_purchased.total, 0) AS battlecruiser_purchased,
                COALESCE(glitcher_purchased.total, 0) AS glitcher_purchased
            FROM 
                nexus_units u
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 6
                ) AS marines ON 1=1
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 7
                ) AS goliaths ON 1=1
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 8
                ) AS battlecruisers ON 1=1
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 9
                ) AS wraiths ON 1=1
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 11
                ) AS scouts ON 1=1
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 10
                ) AS siege_tanks ON 1=1 
            LEFT JOIN 
                (SELECT 
                     s.unit_id, s.unit_level, s.supply
                 FROM 
                     nexus_unit_stats s 
                 WHERE 
                     s.unit_id = 12
                ) AS glitchers ON 1=1
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS marine_purchased ON marine_purchased.unit_id_purchased = 6
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS goliath_purchased ON goliath_purchased.unit_id_purchased = 7
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS siege_tank_purchased ON siege_tank_purchased.unit_id_purchased = 10
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS scout_purchased ON scout_purchased.unit_id_purchased = 11
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS wraith_purchased ON wraith_purchased.unit_id_purchased = 9
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS battlecruiser_purchased ON battlecruiser_purchased.unit_id_purchased = 8
            LEFT JOIN
                (SELECT
                    unit_id_purchased,
                    SUM(quantity_purchased) AS total
                FROM
                    nexus_unit_purchases
                WHERE
                    coords_x = @CoordsX AND coords_y = @CoordsY
                GROUP BY 
                    unit_id_purchased
                ) AS glitcher_purchased ON glitcher_purchased.unit_id_purchased = 12
            WHERE 
                u.coords_x = @CoordsX 
            AND u.coords_y = @CoordsY;
        ";

				using (MySqlCommand cmdCurrentSupply = new MySqlCommand(sqlCurrentSupply, conn, transaction))
				{
					cmdCurrentSupply.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
					cmdCurrentSupply.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);

					using (var readerCurrentSupply = await cmdCurrentSupply.ExecuteReaderAsync())
					{
						if (!await readerCurrentSupply.ReadAsync())
						{
							await readerCurrentSupply.CloseAsync();
							return 0;
						}

						int marinesTotal = readerCurrentSupply.GetInt32("marine_total");
						int goliathTotal = readerCurrentSupply.GetInt32("goliath_total");
						int siegeTankTotal = readerCurrentSupply.GetInt32("siege_tank_total");
						int scoutTotal = readerCurrentSupply.GetInt32("scout_total");
						int wraithTotal = readerCurrentSupply.GetInt32("wraith_total");
						int battleCruiserTotal = readerCurrentSupply.GetInt32("battlecruiser_total");
						int glitcherTotal = readerCurrentSupply.GetInt32("glitcher_total");

						// Get the supply for each unit type
						int marinesSupply = readerCurrentSupply.GetInt32("marines_supply");
						int goliathSupply = readerCurrentSupply.GetInt32("goliaths_supply");
						int siegeTankSupply = readerCurrentSupply.GetInt32("siege_tanks_supply");
						int scoutSupply = readerCurrentSupply.GetInt32("scouts_supply");
						int wraithSupply = readerCurrentSupply.GetInt32("wraiths_supply");
						int battleCruiserSupply = readerCurrentSupply.GetInt32("battlecruisers_supply");
						int glitcherSupply = readerCurrentSupply.GetInt32("glitchers_supply");

						// Calculate the total supply usage
						res = (marinesTotal + readerCurrentSupply.GetInt32("marine_purchased")) * marinesSupply +
									(goliathTotal + readerCurrentSupply.GetInt32("goliath_purchased")) * goliathSupply +
									(siegeTankTotal + readerCurrentSupply.GetInt32("siege_tank_purchased")) * siegeTankSupply +
									(scoutTotal + readerCurrentSupply.GetInt32("scout_purchased")) * scoutSupply +
									(wraithTotal + readerCurrentSupply.GetInt32("wraith_purchased")) * wraithSupply +
									(battleCruiserTotal + readerCurrentSupply.GetInt32("battlecruiser_purchased")) * battleCruiserSupply +
									(glitcherTotal + readerCurrentSupply.GetInt32("glitcher_purchased")) * glitcherSupply;
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db($"Error: {ex.Message}.", nexus.User?.Id, "NEXUS", true);
			}
			return res;
		}
		private string GetBuildingTypeFromTypeId(int typeId)
		{
			string buildingType = "";

			using (MySqlConnection conn = new MySqlConnection(_connectionString))
			{
				conn.Open();

				string sql = "SELECT type FROM nexus_building_types WHERE id = @TypeId";
				MySqlCommand cmd = new MySqlCommand(sql, conn);
				cmd.Parameters.AddWithValue("@TypeId", typeId);

				object? result = cmd.ExecuteScalar();
				if (result != null)
				{
					buildingType = result.ToString() ?? "";
				}

				conn.Close();
			}

			return buildingType;
		}

		private async Task<IActionResult> UpgradeBuilding(int userId, string component, NexusBase? nexus)
		{
			//_ = _log.Db($"UpgradeBuilding -> Upgrading: {component} ({user.Id})");
			if (nexus == null)
			{
				return NotFound("Base not found.");
			}

			using (MySqlConnection conn = new MySqlConnection(_connectionString))
			{
				try
				{
					await conn.OpenAsync();

					// Start a transaction
					MySqlTransaction transaction = await conn.BeginTransactionAsync();
					// first check if the upgrade was already started, if it has then return an error.
					NexusBaseUpgrades? currentUpgrades = await GetNexusBaseUpgrades(nexus, conn, transaction);
					if (((component == "command_center") && (currentUpgrades != null) && (currentUpgrades.CommandCenterUpgraded != null))
							|| ((component == "supply_depot") && (currentUpgrades != null) && (currentUpgrades.SupplyDepotUpgraded != null))
							|| ((component == "engineering_bay") && (currentUpgrades != null) && (currentUpgrades.EngineeringBayUpgraded != null))
							|| ((component == "warehouse") && (currentUpgrades != null) && (currentUpgrades.WarehouseUpgraded != null))
							|| ((component == "mines") && (currentUpgrades != null) && (currentUpgrades.MinesUpgraded != null))
							|| ((component == "factory") && (currentUpgrades != null) && (currentUpgrades.FactoryUpgraded != null))
							|| ((component == "starport") && (currentUpgrades != null) && (currentUpgrades.StarportUpgraded != null))
							)
					{
						await transaction.RollbackAsync();
						return BadRequest("Component upgrade is already queued.");
					}

					await RecalculateNexusGold(conn, transaction);

					string getCostSql = $@"
                        SELECT cost, building_level
                        FROM nexus_base_upgrade_stats 
                        WHERE building_type = (SELECT id FROM nexus_building_types WHERE LOWER(type) = @Component)
                          AND building_level = (SELECT {component}_level FROM nexus_bases WHERE coords_x = @CoordsX AND coords_y = @CoordsY AND user_id = @UserId)
                        LIMIT 1;";
					MySqlCommand getCostCmd = new MySqlCommand(getCostSql, conn, transaction);
					getCostCmd.Parameters.AddWithValue("@Component", component);
					getCostCmd.Parameters.AddWithValue("@UserId", userId);
					getCostCmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
					getCostCmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);

					int cost = 0;
					int level = 0;
					int maxLevel = 0;
					using (var reader = await getCostCmd.ExecuteReaderAsync())
					{
						while (await reader.ReadAsync())
						{

							cost = reader.IsDBNull(reader.GetOrdinal("cost")) ? 0 : reader.GetInt32(reader.GetOrdinal("cost"));
							level = reader.IsDBNull(reader.GetOrdinal("building_level")) ? 0 : reader.GetInt32(reader.GetOrdinal("building_level"));
						}
					}
					if (cost == 0)
					{
						await transaction.RollbackAsync();
						return BadRequest("Server error: Invalid cost found for upgrade.");
					}

					string getMaxUpgradeLevelSql = @"
                        SELECT MAX(building_level)
                        FROM nexus_base_upgrade_stats 
                        WHERE building_type = (SELECT id FROM nexus_building_types WHERE LOWER(type) = @Component)
                        LIMIT 1;";
					MySqlCommand getMaxUpgradeLevelCmd = new MySqlCommand(getMaxUpgradeLevelSql, conn, transaction);
					getMaxUpgradeLevelCmd.Parameters.AddWithValue("@Component", component);
					var maxLevelResult = await getMaxUpgradeLevelCmd.ExecuteScalarAsync();
					if (maxLevelResult == null)
					{
						await transaction.RollbackAsync();
						return NotFound("Max upgrade level not found.");
					}
					maxLevel = Convert.ToInt32(maxLevelResult);
					if (cost == 0 || level > maxLevel)
					{
						await transaction.RollbackAsync();
						return BadRequest("Invalid upgrade level.");
					}

					// Retrieve the current gold amount
					string getGoldSql = @"
                        SELECT gold 
                        FROM nexus_bases 
                        WHERE coords_x = @CoordsX AND coords_y = @CoordsY AND user_id = @UserId
                        LIMIT 1;";
					MySqlCommand getGoldCmd = new MySqlCommand(getGoldSql, conn, transaction);
					getGoldCmd.Parameters.AddWithValue("@UserId", userId);
					getGoldCmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
					getGoldCmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);
					var goldResult = await getGoldCmd.ExecuteScalarAsync();
					if (goldResult == null)
					{
						await transaction.RollbackAsync();
						return NotFound("Base not found.");
					}
					int currentGold = Convert.ToInt32(goldResult);
					//_ = _log.Db("Got current gold : " + currentGold);
					if (currentGold < cost)
					{
						await transaction.RollbackAsync();
						return BadRequest("Not enough gold to upgrade.");
					}

					// Check if a record exists in nexus_base_upgrades
					string selectSql = @"
                        SELECT COUNT(*) 
                        FROM nexus_base_upgrades 
                        WHERE coords_x = @CoordsX AND coords_y = @CoordsY";
					MySqlCommand selectCmd = new MySqlCommand(selectSql, conn, transaction);
					selectCmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
					selectCmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);

					var res = await selectCmd.ExecuteScalarAsync();
					if (res != null && (long)res > 0)
					{
						// Update the existing record
						string updateUpgradeSql = $@"
                            UPDATE 
                                nexus_base_upgrades 
                            SET {component}_upgraded = @Timestamp 
                            WHERE 
                                coords_x = @CoordsX 
                            AND coords_y = @CoordsY
                            LIMIT 1;";
						MySqlCommand updateUpgradeCmd = new MySqlCommand(updateUpgradeSql, conn, transaction);
						updateUpgradeCmd.Parameters.AddWithValue("@Timestamp", DateTime.Now.AddSeconds(-1));
						updateUpgradeCmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
						updateUpgradeCmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);

						await updateUpgradeCmd.ExecuteNonQueryAsync();
					}
					else
					{
						// Insert a new record
						string insertUpgradeSql = $@"
                            INSERT INTO nexus_base_upgrades (coords_x, coords_y, {component}_upgraded)
                            VALUES (@CoordsX, @CoordsY, @Timestamp)";
						MySqlCommand insertUpgradeCmd = new MySqlCommand(insertUpgradeSql, conn, transaction);
						insertUpgradeCmd.Parameters.AddWithValue("@Timestamp", DateTime.Now.AddSeconds(-1));
						insertUpgradeCmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
						insertUpgradeCmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);

						await insertUpgradeCmd.ExecuteNonQueryAsync();
					}

					// Update the nexus_bases table (subtract gold and increment level)
					string updateBaseSql = $@"
                        UPDATE maxhanna.nexus_bases
                        SET 
                            gold = gold - @UpgradeCost
                        WHERE 
                            coords_x = @CoordsX
                            AND coords_y = @CoordsY
                            AND user_id = @UserId
                        LIMIT 1;";
					MySqlCommand updateBaseCmd = new MySqlCommand(updateBaseSql, conn, transaction);
					updateBaseCmd.Parameters.AddWithValue("@UserId", userId);
					updateBaseCmd.Parameters.AddWithValue("@CoordsX", nexus.CoordsX);
					updateBaseCmd.Parameters.AddWithValue("@CoordsY", nexus.CoordsY);
					updateBaseCmd.Parameters.AddWithValue("@UpgradeCost", cost);

					await updateBaseCmd.ExecuteNonQueryAsync();
					await transaction.CommitAsync();

					return Ok($"Upgrading {component}.");
				}
				catch (Exception ex)
				{
					_ = _log.Db($"An error occurred while processing the POST request to upgrade {component}." + ex.Message, userId, "NEXUS", true);
					return StatusCode(500, "An error occurred while processing the request.");
				}
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
				_ = _log.Db("An error occurred while executing update" + ex.Message, null, "NEXUS", true); 
				_ = _log.Db(cmdText, null, "NEXUS", false);
				foreach (var param in parameters)
				{
					_ = _log.Db("Param: " + param.Key + ": " + param.Value, null, "NEXUS", true);
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
