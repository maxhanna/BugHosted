using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MySqlConnector;
using Newtonsoft.Json;

namespace maxhanna.Server.Services
{
    public class CoinValueBackgroundService : BackgroundService
    {
        private readonly ILogger<CoinValueBackgroundService> _logger;
        private readonly string _apiKey = "49965ff1-ebed-48b2-8ee3-796c390fcde1";
        private readonly string _url = "https://api.livecoinwatch.com/coins/list";
        private readonly string _connectionString;
        private readonly HttpClient _httpClient;

        public CoinValueBackgroundService(ILogger<CoinValueBackgroundService> logger, IConfiguration config)
        {
            _logger = logger; 
            _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna")!;
            _httpClient = new HttpClient();
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                _logger.LogInformation("Refreshing system information: {time}", DateTimeOffset.Now);
                await FetchAndStoreCoinValues();
                await DeleteOldBattleReports();
                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            }
        }

        private async Task DeleteOldBattleReports()
        {
            try
            {
                using (var conn = new MySqlConnection(_connectionString))
                {
                    await conn.OpenAsync();

                    // SQL statement to delete from nexus_reports_deleted and nexus_battles in one go
                    var deleteSql = @"
                        DELETE rd, b
                        FROM nexus_reports_deleted rd
                        JOIN nexus_battles b ON rd.battle_id = b.battle_id
                        WHERE b.timestamp < NOW() - INTERVAL 10 DAY;
                
                        DELETE FROM nexus_battles
                        WHERE timestamp < NOW() - INTERVAL 10 DAY;";

                    using (var deleteCmd = new MySqlCommand(deleteSql, conn))
                    {
                        int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
                        _logger.LogInformation($"Deleted {affectedRows} battle reports and their references older than 10 days.");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while deleting old battle reports.");
            }
        }


        private async Task FetchAndStoreCoinValues()
        {
            var body = new
            {
                currency = "CAD",
                sort = "rank",
                order = "ascending",
                offset = 0,
                limit = 8,
                meta = true
            };

            var jsonBody = JsonConvert.SerializeObject(body);
            var content = new StringContent(jsonBody, Encoding.UTF8, "application/json");
            content.Headers.Add("x-api-key", _apiKey);

            try
            {
                var response = await _httpClient.PostAsync(_url, content);
                if (response.IsSuccessStatusCode)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();
                    var coinData = JsonConvert.DeserializeObject<CoinResponse[]>(responseContent);
                    if (coinData != null)
                    {
                        await StoreCoinValues(coinData);
                    }
                }
                else
                {
                    _logger.LogError("Failed to fetch coin values: {statusCode}", response.StatusCode);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while fetching coin values.");
            }
        }
        private async Task StoreCoinValues(CoinResponse[] coinData)
        {
            try
            {
                using (var conn = new MySqlConnection(_connectionString))
                {
                    await conn.OpenAsync();
                     
                    var checkSql = "SELECT COUNT(*) FROM coin_value WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)";
                    using (var checkCmd = new MySqlCommand(checkSql, conn))
                    {
                        var count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
                        if (count > 0)
                        {
                            _logger.LogInformation("Coin values not added as entries were added in the last 1 hour.");
                            return;
                        }
                    }

                    // Delete entries older than five years
                    var deleteSql = "DELETE FROM coin_value WHERE timestamp < DATE_SUB(NOW(), INTERVAL 5 YEAR)";
                    using (var deleteCmd = new MySqlCommand(deleteSql, conn))
                    {
                        await deleteCmd.ExecuteNonQueryAsync();
                    }

                    // Insert new coin data
                    foreach (var coin in coinData)
                    {
                        var sql = "INSERT INTO coin_value (symbol, name, value_cad, timestamp) VALUES (@Symbol, @Name, @ValueCAD, NOW())";
                        using (var cmd = new MySqlCommand(sql, conn))
                        {
                            cmd.Parameters.AddWithValue("@Symbol", coin.symbol);
                            cmd.Parameters.AddWithValue("@Name", coin.name);
                            cmd.Parameters.AddWithValue("@ValueCAD", coin.rate);

                            await cmd.ExecuteNonQueryAsync();
                        }
                    }

                    _logger.LogInformation("Coin values stored successfully.");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while storing coin values.");
            }
        }


    }

    public class CoinResponse
    {
        public string? symbol { get; set; }
        public string? name { get; set; }
        public float rate { get; set; }
    }
}
