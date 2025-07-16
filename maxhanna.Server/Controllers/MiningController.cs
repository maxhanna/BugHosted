using maxhanna.Server.Controllers.DataContracts.Crypto;
using maxhanna.Server.Controllers.DataContracts.Users;
using maxhanna.Server.Controllers.Helpers;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SixLabors.ImageSharp.Formats.Bmp;
using System.Collections.ObjectModel;
using System.Text.Json;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class MiningController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;
		MiningApi _api = new MiningApi();

		public MiningController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}

		[HttpPost("/Mining/GetNicehashApiCredentials", Name = "GetNicehashApiCredentials")]
		public async Task<Dictionary<string, string>> GetNicehashCredentials([FromBody] int userId)
		{
			var credentials = new Dictionary<string, string>();

			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					string sql =
							"SELECT ownership, orgId, apiKey, apiSecret FROM maxhanna.nicehash_api_keys WHERE ownership = @Owner;";
					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Owner", userId);
						using (var rdr = await cmd.ExecuteReaderAsync())
						{
							while (await rdr.ReadAsync())
							{
								credentials.Add("ownership", rdr.GetInt32(0).ToString());
								credentials.Add("orgId", rdr.GetString(1));
								credentials.Add("apiKey", rdr.GetString(2));
								credentials.Add("apiSecret", rdr.GetString(3));
							}
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while retrieving Nicehash credentials. " + ex.Message, userId, "MINING", true);
				throw;
			}

			return credentials;
		}


		[HttpPost("/Mining/GetHasNicehashApiCredentials", Name = "GetHasNicehashApiCredentials")]
		public async Task<bool> GetHasNicehashApiCredentials([FromBody] int userId)
		{
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					string sql = "SELECT 1 FROM maxhanna.nicehash_api_keys WHERE ownership = @Owner LIMIT 1;";
					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Owner", userId);
						var result = await cmd.ExecuteScalarAsync();
						return result != null;
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while checking Nicehash credentials. " + ex.Message, userId, "MINING", true);
				throw;
			}
		}

		[HttpPost("/Mining/DeleteNicehashApiCredentials", Name = "DeleteNicehashApiCredentials")]
		public async Task<bool> DeleteNicehashApiCredentials([FromBody] int userId)
		{
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					string sql = "DELETE FROM maxhanna.nicehash_api_keys WHERE ownership = @Owner LIMIT 1;";
					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Owner", userId);
						var result = await cmd.ExecuteScalarAsync();
						return result != null;
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while checking Nicehash credentials. " + ex.Message, userId, "MINING", true);
				throw;
			}
		}

		[HttpPost("/Mining/DeleteKrakenApiCredentials", Name = "DeleteKrakenApiCredentials")]
		public async Task<bool> DeleteKrakenApiCredentials([FromBody] int userId)
		{
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					string sql = "DELETE FROM maxhanna.user_kraken_api_keys WHERE user_id = @Owner LIMIT 1;";
					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Owner", userId);
						var result = await cmd.ExecuteScalarAsync();
						return result != null;
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while deleting Kraken credentials. " + ex.Message, userId, "MINING", true);
				throw;
			}
		}

		[HttpPut("/Mining/UpdateNicehashApiCredentials", Name = "UpdateNicehashApiCredentials")]
		public async Task<IActionResult> UpdateOrCreateNicehashCredentials([FromBody] CreateNicehashApiCredentials credentials)
		{ 
			try
			{
				using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					string sql =
							"INSERT INTO maxhanna.nicehash_api_keys (ownership, orgId, apiKey, apiSecret) VALUES (@Owner, @OrgId, @ApiKey, @ApiSecret) " +
							"ON DUPLICATE KEY UPDATE orgId = @OrgId, apiKey = @ApiKey, apiSecret = @ApiSecret;";
					using (var cmd = new MySqlCommand(sql, conn))
					{
						cmd.Parameters.AddWithValue("@Owner", credentials.userId);
						cmd.Parameters.AddWithValue("@OrgId", credentials.keys.OrgId);
						cmd.Parameters.AddWithValue("@ApiKey", credentials.keys.ApiKey);
						cmd.Parameters.AddWithValue("@ApiSecret", credentials.keys.ApiSecret);
						if (await cmd.ExecuteNonQueryAsync() >= 0)
						{ 
							return Ok();
						}
						else
						{
							_ = _log.Db("UpdateNicehashApiCredentials Returned 500.", credentials.userId, "MINING", true);
							return StatusCode(500, "Failed to update or create data");
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while updating or creating Nicehash credentials. " + ex.Message, credentials.userId, "MINING", true);
				throw;
			}
		}

		[HttpPost("/Mining/", Name = "GetMiningRigInfo")]
		public async Task<List<MiningRig>> GetRigsAsync([FromBody] int userId)
		{ 
			List<MiningRig> rigs = new List<MiningRig>();

			try
			{
				Dictionary<string, string> kz = await GetNicehashCredentials(userId);
				if (kz.Count == 0) return rigs;
				var res = _api.get(kz, "/main/api/v2/mining/rigs2", true);
				JsonDocument jsonDoc = JsonDocument.Parse(res);
				JsonElement miningRigs; 
				if (jsonDoc.RootElement.TryGetProperty("miningRigs", out miningRigs) && miningRigs.ValueKind == JsonValueKind.Array)
				{
					foreach (JsonElement rigElement in miningRigs.EnumerateArray())
					{
						MiningRig tmpRig = new MiningRig();
						tmpRig.devices = new List<MiningRigDevice>();
						tmpRig.rigId = rigElement.GetProperty("rigId").GetString()!;
						tmpRig.minerStatus = rigElement.GetProperty("minerStatus").GetString()!;
						JsonElement unpaid;
						if (rigElement.TryGetProperty("unpaidAmount", out unpaid))
						{
							tmpRig.unpaidAmount = float.Parse(unpaid.GetString()!);
						}
						tmpRig.localProfitability = float.Parse(rigElement.GetProperty("localProfitability").GetRawText()!);
						tmpRig.actualProfitability = float.Parse(rigElement.GetProperty("profitability").GetRawText()!);

						if (rigElement.TryGetProperty("v4", out JsonElement v4Element) && v4Element.ValueKind == JsonValueKind.Object)
						{
							tmpRig.rigName = v4Element.GetProperty("mmv").GetProperty("workerName").GetString()!;
							if (v4Element.TryGetProperty("devices", out JsonElement devicesElement) && devicesElement.ValueKind == JsonValueKind.Array)
							{
								ExtractDeviceData(tmpRig.devices, tmpRig.rigId, v4Element, tmpRig.rigName);
							}
							if (rigElement.TryGetProperty("stats", out JsonElement statsElement) && statsElement.ValueKind == JsonValueKind.Object)
							{
								if (float.Parse(statsElement.GetProperty("speedRejectedTotal").GetString()!) > 0)
								{
									tmpRig.speedRejected = float.Parse(statsElement.GetProperty("speedRejectedTotal").GetString()!);
								}
							}
							rigs.Add(tmpRig);
						}
					}
				}
				return rigs;
			}
			catch (Exception ex)
			{
				_ = _log.Db("Mining Error occurred. " + ex.Message, userId, "MINING", true);

				// Return an error response
				return rigs;
			}
		}

		[HttpPost("/Mining/Devices", Name = "GetMiningDeviceInfo")]
		public async Task<List<MiningRigDevice>> GetDevices([FromBody] int userId)
		{ 
			List<MiningRigDevice> devices = new List<MiningRigDevice>(); 
			try
			{
				var creds = await GetNicehashCredentials(userId);
				if (creds.Count == 0) return devices;

				var res = _api.get(creds, "/main/api/v2/mining/rigs2", true);
				JsonDocument jsonDoc = JsonDocument.Parse(res);
				JsonElement miningRigs; 
				if (jsonDoc.RootElement.TryGetProperty("miningRigs", out miningRigs) && miningRigs.ValueKind == JsonValueKind.Array)
				{
					foreach (JsonElement rigElement in miningRigs.EnumerateArray())
					{
						string rigId = rigElement.GetProperty("rigId").GetString()!;

						if (rigElement.TryGetProperty("v4", out JsonElement v4Element) && v4Element.ValueKind == JsonValueKind.Object)
						{
							string rigName = v4Element.GetProperty("mmv").GetProperty("workerName").GetString()!;
							ExtractDeviceData(devices, rigId, v4Element, rigName);
						}
					} 
				}

				return devices.OrderBy(d => d, new MiningRigDeviceComparer()).ToList();

			}
			catch (Exception ex)
			{
				_ = _log.Db("Mining Error occurred. " + ex.Message, userId, "MINING", true);

				// Return an error response
				return devices;
			}
		}

		private static void ExtractDeviceData(List<MiningRigDevice> devices, string rigId, JsonElement v4Element, string rigName)
		{
			if (v4Element.TryGetProperty("devices", out JsonElement devicesElement) && devicesElement.ValueKind == JsonValueKind.Array)
			{
				foreach (JsonElement deviceElement in devicesElement.EnumerateArray())
				{
					MiningRigDevice tmpDevice = new MiningRigDevice();
					tmpDevice.rigId = rigId;
					tmpDevice.rigName = rigName;
					tmpDevice.deviceName = deviceElement.GetProperty("dsv").GetProperty("name").GetString()!;
					tmpDevice.deviceId = deviceElement.GetProperty("dsv").GetProperty("id").GetString()!;
					JsonElement mdvElement = deviceElement.GetProperty("mdv");
					tmpDevice.state = mdvElement.GetProperty("state").GetInt32();
					JsonElement tmpAlgorithmSpeedElements = mdvElement.GetProperty("algorithmsSpeed");
					foreach (JsonElement tmpAlgorithmSpeedElement in tmpAlgorithmSpeedElements.EnumerateArray())
					{
						tmpDevice.speed = tmpAlgorithmSpeedElement.GetProperty("speed").GetSingle();
						break;
					}
					JsonElement odvElement = deviceElement.GetProperty("odv");
					foreach (JsonElement odvItem in odvElement.EnumerateArray())
					{
						string key = odvItem.GetProperty("key").GetString()!;
						switch (key)
						{
							case "Temperature":
								tmpDevice.temperature = float.Parse(odvItem.GetProperty("value").GetString()!);
								break;
							case "Fan speed":
								if (odvItem.GetProperty("unit").GetString() == "%")
								{
									tmpDevice.fanSpeed = float.Parse(odvItem.GetProperty("value").GetString()!);
								}
								else if (odvItem.GetProperty("unit").GetString() == "RPM")
								{
									tmpDevice.fanSpeedRPM = float.Parse(odvItem.GetProperty("value").GetString()!);
								}
								break;
							case "Power usage":
								tmpDevice.power = float.Parse(odvItem.GetProperty("value").GetString()!);
								break;
							case "Core clock":
								tmpDevice.coreClock = float.Parse(odvItem.GetProperty("value").GetString()!);
								break;
							case "Memory clock":
								tmpDevice.memoryClock = float.Parse(odvItem.GetProperty("value").GetString()!);
								break;
							case "Core voltage":
								tmpDevice.coreVoltage = float.Parse(odvItem.GetProperty("value").GetString()!);
								break;
							case "Power Limit":
								if (odvItem.GetProperty("unit").GetString() == "%")
								{
									tmpDevice.powerLimitPercentage = float.Parse(odvItem.GetProperty("value").GetString()!);
								}
								else if (odvItem.GetProperty("unit").GetString() == "W")
								{
									tmpDevice.powerLimitWatts = float.Parse(odvItem.GetProperty("value").GetString()!);
								}
								break;
							case "Miner":
								tmpDevice.miner = odvItem.GetProperty("value").GetString();
								break;
							default: 
								break;
						}
					}

					devices.Add(tmpDevice);
				}
			}
		}

		[HttpPost("/Mining/Wallet", Name = "GetMiningWalletInfo")]
		public async Task<IActionResult> GetWallet([FromBody] int userId)
		{
			try
			{
				using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				// Check if a recent BTC balance is already cached (within last 10 minutes)
				string getRecentBalanceSql = @"
					SELECT balance 
					FROM user_btc_wallet_balance b
					JOIN user_btc_wallet_info w ON b.wallet_id = w.id
					WHERE w.user_id = @UserId
					AND b.fetched_at > (UTC_TIMESTAMP() - INTERVAL 2 HOUR) 
					AND w.btc_address = 'Nicehash' 
					ORDER BY b.fetched_at DESC
					LIMIT 1;";

				using var checkCmd = new MySqlCommand(getRecentBalanceSql, conn);
				checkCmd.Parameters.AddWithValue("@UserId", userId);

				var result = await checkCmd.ExecuteScalarAsync();

				if (result != null)
				{
					Currency currency = new Currency();
					CryptoWallet tmpWallet = new CryptoWallet(); 
					decimal balance = Convert.ToDecimal(result);
					currency.address = "Nicehash";
					currency.totalBalance = Convert.ToString(balance);
					currency.btcRate = await _api.GetLatestBTCRate(_config, _log);
					tmpWallet.total = new Total(); 
					tmpWallet.total.totalBalance = Convert.ToString(balance);
					tmpWallet.total.currency = "Bitcoin";
					tmpWallet.currencies = new List<Currency>() { currency };
					Console.WriteLine("Got balance from db instead of nh api");
					return Ok(tmpWallet);
				}

				// Fallback to calling the Nicehash API
				var creds = await GetNicehashCredentials(userId);
				if (creds.Count == 0) return Ok("No Nicehash API present!");

				var res = _api.get(creds, "/main/api/v2/accounting/accounts2?fiat=CAD", true);

				if (string.IsNullOrEmpty(res))
				{
					_ = _log.Db("Mining API response is null or empty", userId, "MINING", true);
					return NotFound("Mining API response is null or empty");
				}

				CryptoWallet wallet = JsonConvert.DeserializeObject<CryptoWallet>(res)!;

				if (wallet == null)
				{
					_ = _log.Db("Deserialized MiningWallet object is null", userId, "MINING", true);
					return NotFound("Deserialized MiningWallet object is null");
				}

				_ = _api.CreateWalletEntryFromFetchedDictionary(Convert.ToDecimal(wallet.total?.totalBalance), userId, _config, _log);

				return Ok(new { balance = wallet.total?.totalBalance, source = "live" });
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while fetching mining wallet info. " + ex.Message, userId, "MINING", true);
				return StatusCode(500, "An unexpected error occurred while fetching mining wallet info");
			}
		}


		[HttpPost("/Mining/DailyEarnings", Name = "GetDailyMiningEarnings")]
		public async Task<IActionResult> GetDailyMiningEarnings([FromBody] int userId)
		{ 
			try
			{
				var creds = await GetNicehashCredentials(userId);
				if (creds.Count == 0) return Ok("No Nicehash API present!");

				var res = _api.get(creds, "/main/api/v2/mining/rigs/stats/data", true);

				if (string.IsNullOrEmpty(res))
				{
					_ = _log.Db("Mining API response is null or empty", userId, "MINING", true);
					return NotFound("Mining API response is null or empty");
				}

				Collection<DailyMiningEarnings> wallet = JsonConvert.DeserializeObject<Collection<DailyMiningEarnings>>(res)!;

				if (wallet == null)
				{
					_ = _log.Db("Deserialized DailyMiningEarnings object is null", userId, "MINING", true);
					return NotFound("Deserialized DailyMiningEarnings object is null");
				} 
				return Ok(wallet);
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error occurred while fetching daily mining earnings info. " + ex.Message, userId, "MINING", true);
				return StatusCode(500, "An unexpected error occurred while fetching daily mining earnings info");
			}
		}

		[HttpPost("/Mining/{rigId}/{deviceId?}", Name = "PostStatusUpdate")]
		public async Task<IActionResult> PostStatusUpdate(string rigId, string? deviceId, [FromBody] MiningStatusUpdate statusUpdate)
		{ 
			try
			{
				JObject payload = new JObject();
				payload.Add("rigId", rigId);
				if (!string.IsNullOrEmpty(deviceId))
				{
					payload.Add(new JProperty("deviceId", deviceId));
				}
				payload.Add(new JProperty("action", statusUpdate.requestedAction));

				var creds = await GetNicehashCredentials(statusUpdate.userId);
				if (creds.Count == 0) return Ok("No Nicehash API present!");

				var res = _api.post(creds, "/main/api/v2/mining/rigs/status2", JsonConvert.SerializeObject(payload), true);
				return Ok(res);
			}
			catch (Exception e)
			{
				return BadRequest(e);
			}
		} 

		private class MiningRigDeviceComparer : IComparer<MiningRigDevice?>
		{
			public int Compare(MiningRigDevice? x, MiningRigDevice? y)
			{
				if (x is null && y is null)
					return 0;
				if (x is null)
					return 1;
				if (y is null)
					return -1;

				// Check for 'Glitch' entries and move them to the top
				if (x.state == 1 && (y.state != 1 || !ContainsCpuOrAmd(x)))
					return -1;
				if (y.state == 1 && (x.state != 1 || !ContainsCpuOrAmd(y)))
					return 1;

				// Handle other cases
				if (x.state == -1 && y.state != -1)
					return -1;
				if (x.state != -1 && y.state == -1)
					return 1;

				// If states are the same, compare temperatures
				return -x.temperature.CompareTo(y.temperature);
			}

			// Helper method to check if the device name contains 'CPU' or 'AMD'
			private bool ContainsCpuOrAmd(MiningRigDevice? device)
			{
				if (device == null || string.IsNullOrEmpty(device.deviceName))
					return false;

				return device.deviceName.Contains("CPU") || device.deviceName.Contains("AMD");
			}
		}
	}
}
