using maxhanna.Server.Controllers.DataContracts.Crypto;
using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using RestSharp;
using System.Text;

namespace maxhanna.Server.Controllers.Helpers
{
	class MiningApi
	{
		private string urlRoot = "https://api2.nicehash.com"; 
		public async void UpdateWalletInDB(IConfiguration config, Log _log)
		{
			int userId = await GetNextUserWalletToUpdate(config, _log);
			if (userId <= 0) return;

			var creds = await GetNicehashCredentials(userId, config, _log);
			if (creds.Count == 0) return;

			var res = get(creds, "/main/api/v2/accounting/accounts2?fiat=CAD", true);

			if (string.IsNullOrEmpty(res))
			{ 
				return;
			}

			CryptoWallet wallet = JsonConvert.DeserializeObject<CryptoWallet>(res)!;

			if (wallet == null)
			{ 
				return;
			}

			_ = CreateWalletEntryFromFetchedDictionary(Convert.ToDecimal(wallet.total?.totalBalance), userId, config, _log);
		}
		public async Task CreateWalletEntryFromFetchedDictionary(decimal btcBalance, int userId, IConfiguration config, Log _log)
		{
			if (btcBalance == 0)
			{
				return;
			}

			const string ensureBtcWalletSql = @"
				INSERT INTO user_btc_wallet_info (user_id, btc_address, last_fetched)
				VALUES (@UserId, 'Nicehash', UTC_TIMESTAMP())
				ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id);
				SELECT LAST_INSERT_ID();";

			const string checkRecentBtcSql = @"
				SELECT COUNT(*) FROM user_btc_wallet_balance 
				WHERE wallet_id = @WalletId AND fetched_at > (UTC_TIMESTAMP() - INTERVAL 10 MINUTE);";

			const string insertBtcSql = "INSERT INTO user_btc_wallet_balance (wallet_id, balance, fetched_at) VALUES (@WalletId, @Balance, UTC_TIMESTAMP());";

			const string updateBtcFetchedSql = "UPDATE user_btc_wallet_info SET last_fetched = UTC_TIMESTAMP() WHERE id = @WalletId;";

			try
			{
				using var conn = new MySqlConnection(config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				// BTC Wallet
				if (btcBalance > 0)
				{
					int btcWalletId;
					using (var cmd = new MySqlCommand(ensureBtcWalletSql, conn))
					{
						cmd.Parameters.AddWithValue("@UserId", userId);
						using var reader = await cmd.ExecuteReaderAsync();
						await reader.ReadAsync();
						btcWalletId = reader.GetInt32(0);
					}

					using (var checkCmd = new MySqlCommand(checkRecentBtcSql, conn))
					{
						checkCmd.Parameters.AddWithValue("@WalletId", btcWalletId);
						var recentCount = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
						if (recentCount == 0)
						{
							using var insertCmd = new MySqlCommand(insertBtcSql, conn);
							insertCmd.Parameters.AddWithValue("@WalletId", btcWalletId);
							insertCmd.Parameters.AddWithValue("@Balance", btcBalance);
							await insertCmd.ExecuteNonQueryAsync();

							using var updateCmd = new MySqlCommand(updateBtcFetchedSql, conn);
							updateCmd.Parameters.AddWithValue("@WalletId", btcWalletId);
							await updateCmd.ExecuteNonQueryAsync();
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error creating wallet balance entry: " + ex.Message, null, "MININGAPI", true);
			}
		}
		public async Task<double?> GetLatestBTCRate(IConfiguration config, Log _log)
		{
			double? rate = null;

			try
			{
				using var conn = new MySqlConnection(config.GetValue<string>("ConnectionStrings:maxhanna"));
				await conn.OpenAsync();

				string sql = @"
					SELECT value_cad 
					FROM coin_value 
					WHERE name = 'Bitcoin' 
					ORDER BY timestamp DESC 
					LIMIT 1;";

				using var cmd = new MySqlCommand(sql, conn);
				var result = await cmd.ExecuteScalarAsync();

				if (result != null && result != DBNull.Value)
				{
					rate = Convert.ToDouble(result);
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while trying to get the latest Bitcoin rate: " + ex.Message, null, "MININGAPI", true);
			}

			return rate;
		}
		private async Task<int> GetNextUserWalletToUpdate(IConfiguration config, Log _log)
		{
			int userId = -1; // Default value if no wallet is found

			try
			{
				using (var conn = new MySqlConnection(config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await conn.OpenAsync();

					const string getLastUpdatedWalletSql = @"
						SELECT user_id
						FROM user_btc_wallet_info
						WHERE last_fetched <= (UTC_TIMESTAMP() - INTERVAL 60 MINUTE) 
						ORDER BY last_fetched ASC
						LIMIT 1;"; 

					using (var cmd = new MySqlCommand(getLastUpdatedWalletSql, conn))
					{
						var result = await cmd.ExecuteScalarAsync();

						if (result != null)
						{
							userId = Convert.ToInt32(result); // Convert the result to an integer
						}
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while fetching the wallet with the earliest last_fetched timestamp: " + ex.Message, null, "MININGAPI", true); 
			}

			return userId;
		}


		public async Task<Dictionary<string, string>> GetNicehashCredentials([FromBody] int userId, IConfiguration config, Log _log)
		{
			var credentials = new Dictionary<string, string>();

			try
			{
				using (var conn = new MySqlConnection(config.GetValue<string>("ConnectionStrings:maxhanna")))
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
				_ = _log.Db("Error occurred while retrieving Nicehash credentials. " + ex.Message, null, "MININGAPI", true);
				throw;
			}

			return credentials;
		}
		private static string HashBySegments(string key, string apiKey, string time, string nonce, string orgId, string method, string encodedPath, string query, string? bodyStr)
		{
			List<string?> segments = new List<string?>
						{
								apiKey,
								time,
								nonce,
								null,
								orgId,
								null,
								method,
								encodedPath ?? null,
								query ?? null
						};

			if (bodyStr != null && bodyStr.Length > 0)
			{
				segments.Add(bodyStr);
			}
			return CalcHMACSHA256Hash(JoinSegments(segments!), key);
		}
		private static string getPath(string url)
		{
			var arrSplit = url.Split('?');
			return arrSplit[0];
		}
		private static string? getQuery(string url)
		{
			var arrSplit = url.Split('?');

			if (arrSplit.Length == 1)
			{
				return null;
			}
			else
			{
				return arrSplit[1];
			}
		}

		private static string JoinSegments(List<string> segments)
		{
			var sb = new System.Text.StringBuilder();
			bool first = true;
			foreach (var segment in segments)
			{
				if (!first)
				{
					sb.Append("\x00");
				}
				else
				{
					first = false;
				}

				if (segment != null)
				{
					sb.Append(segment);
				}
			}
			return sb.ToString();
		}

		private static string CalcHMACSHA256Hash(string plaintext, string salt)
		{
			string result = "";
			var enc = Encoding.Default;
			byte[]
			baText2BeHashed = enc.GetBytes(plaintext),
			baSalt = enc.GetBytes(salt);
			System.Security.Cryptography.HMACSHA256 hasher = new System.Security.Cryptography.HMACSHA256(baSalt);
			byte[] baHashedText = hasher.ComputeHash(baText2BeHashed);
			result = string.Join("", baHashedText.ToList().Select(b => b.ToString("x2")).ToArray());
			return result;
		}
		private string? getTime(Dictionary<string, string> apiKeys)
		{
			string? timeResponse = get(apiKeys, "/api/v2/time");

			if (!string.IsNullOrEmpty(timeResponse))
			{
				ServerTime? serverTimeObject = Newtonsoft.Json.JsonConvert.DeserializeObject<ServerTime>(timeResponse);
				return serverTimeObject?.serverTime;
			}
			else
			{
				return null;
			}
		}
		public string get(Dictionary<string, string> apiKeys, string url)
		{
			return this.get(apiKeys, url, false);
		}

		public string get(Dictionary<string, string> apiKeys, string url, bool auth)
		{
			try
			{
				var client = new RestSharp.RestClient(this.urlRoot);
				var request = new RestSharp.RestRequest(url);
				string orgId = apiKeys["orgId"];
				string apiKey = apiKeys["apiKey"];
				string apiSecret = apiKeys["apiSecret"];
				if (auth)
				{
					string time = getTime(apiKeys)!;
					if (string.IsNullOrEmpty(time))
					{
						return "";
					}
					string nonce = Guid.NewGuid().ToString();
					string digest = HashBySegments(apiSecret, apiKey, time, nonce, orgId, "GET", getPath(url), getQuery(url)!, null);

					request.AddHeader("X-Time", time);
					request.AddHeader("X-Nonce", nonce);
					request.AddHeader("X-Auth", apiKey + ":" + digest);
					request.AddHeader("X-Organization-Id", orgId);
				}

				var response = client.Execute(request, Method.Get);
				var content = response.Content;
				return content!;
			}
			catch (Exception ex)
			{
				Console.WriteLine(ex.ToString());
				return "";
			}
		}

		public string post(Dictionary<string, string> apiKeys, string url, string payload, bool requestId)
		{
			var client = new RestSharp.RestClient(this.urlRoot);
			var request = new RestSharp.RestRequest(url);
			string orgId = apiKeys["orgId"];
			string apiKey = apiKeys["apiKey"];
			string apiSecret = apiKeys["apiSecret"];
			request.AddHeader("Accept", "application/json");
			request.AddHeader("Content-type", "application/json");

			string nonce = Guid.NewGuid().ToString();
			string time = getTime(apiKeys)!;
			string digest = HashBySegments(apiSecret, apiKey, time, nonce, orgId, "POST", getPath(url), getQuery(url)!, payload);

			if (payload != null)
			{
				request.AddJsonBody(payload);
			}

			request.AddHeader("X-Time", time);
			request.AddHeader("X-Nonce", nonce);
			request.AddHeader("X-Auth", apiKey + ":" + digest);
			request.AddHeader("X-Organization-Id", orgId);

			if (requestId)
			{
				request.AddHeader("X-Request-Id", Guid.NewGuid().ToString());
			}

			var response = client.Execute(request, Method.Post);
			var content = response.Content;
			return content!;
		}

		public string delete(Dictionary<string, string> apiKeys, string url, string time, bool requestId)
		{
			var client = new RestClient(this.urlRoot);
			var request = new RestRequest(url);
			string orgId = apiKeys["orgId"];
			string apiKey = apiKeys["apiKey"];
			string apiSecret = apiKeys["apiSecret"];

			string nonce = Guid.NewGuid().ToString();
			string digest = HashBySegments(apiSecret, apiKey, time, nonce, orgId, "DELETE", getPath(url), getQuery(url)!, null);

			request.AddHeader("X-Time", time);
			request.AddHeader("X-Nonce", nonce);
			request.AddHeader("X-Auth", apiKey + ":" + digest);
			request.AddHeader("X-Organization-Id", orgId);

			if (requestId)
			{
				request.AddHeader("X-Request-Id", Guid.NewGuid().ToString());
			}

			var response = client.Execute(request, Method.Delete);
			var content = response.Content;
			return content!;
		}
		public class ServerTime
		{
			public string? serverTime { get; set; }
		}
	}
}