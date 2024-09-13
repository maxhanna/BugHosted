using System.Text; 
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
        private DateTime _lastDailyTaskRun = DateTime.MinValue; // Keep track of when daily tasks were last run

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
                 
                if ((DateTime.Now - _lastDailyTaskRun).TotalHours >= 24)
                {
                    await DeleteOldBattleReports();
                    await DeleteOldGuests();
                    _lastDailyTaskRun = DateTime.Now; 
                } 
                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            }
        }

        private async Task DeleteOldBattleReports()
        {
            try
            {
                await using MySqlConnection conn = new MySqlConnection(_connectionString);
                await conn.OpenAsync();

                await using MySqlTransaction transaction = await conn.BeginTransactionAsync();
                try
                { 
                    string deleteSqlReportsAndBattles = @"
                        DELETE rd, b
                        FROM nexus_reports_deleted rd
                        JOIN nexus_battles b ON rd.battle_id = b.battle_id
                        WHERE b.timestamp < NOW() - INTERVAL 10 DAY;";

                    await using (var deleteCmd = new MySqlCommand(deleteSqlReportsAndBattles, conn, transaction))
                    {
                        int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
                        _logger.LogInformation($"Deleted {affectedRows} old battle reports and references.");
                    }
                     
                    string deleteSqlBaseUpgrades = @"
                        DELETE FROM nexus_base_upgrades
                        WHERE command_center_upgraded IS NULL
                        AND mines_upgraded IS NULL
                        AND supply_depot_upgraded IS NULL
                        AND factory_upgraded IS NULL
                        AND starport_upgraded IS NULL
                        AND engineering_bay_upgraded IS NULL
                        AND warehouse_upgraded IS NULL;";

                    await using (var deleteCmd = new MySqlCommand(deleteSqlBaseUpgrades, conn, transaction))
                    {
                        int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
                        _logger.LogInformation($"Deleted {affectedRows} null nexus base upgrade rows.");
                    }
                     
                    await transaction.CommitAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred while deleting old battle reports or base upgrades. Rolling back transaction.");
                    await transaction.RollbackAsync();  
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while establishing the database connection or transaction.");
            }
        }

        private async Task DeleteOldGuests()
        {
            try
            {
                using (var conn = new MySqlConnection(_connectionString))
                {
                    await conn.OpenAsync();

                    // SQL statement to delete from nexus_reports_deleted and nexus_battles in one go
                    var deleteSql = @"
                        DELETE FROM maxhanna.users 
                        WHERE username LIKE 'Guest%'
                        AND (last_seen < (NOW() - INTERVAL 10 DAY));";

                    using (var deleteCmd = new MySqlCommand(deleteSql, conn))
                    {
                        int affectedRows = await deleteCmd.ExecuteNonQueryAsync();
                        _logger.LogInformation($"Deleted {affectedRows} guest accounts older than 10 days.");
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred while deleting old guest accounts.");
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
