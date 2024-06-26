using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class CoinValueController : ControllerBase
    {
        private readonly ILogger<CoinValueController> _logger;
        private readonly IConfiguration _config;

        public CoinValueController(ILogger<CoinValueController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost("/CoinValue/", Name = "GetAllCoinValues")]
        public async Task<List<CoinValue>> GetAllCoinValues()
        {
            _logger.LogInformation("GET /CoinValue/GetAll");
            var coinValues = new List<CoinValue>();

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                await conn.OpenAsync();

                string sql = @"SELECT id, symbol, name, value_cad, timestamp FROM coin_value";
                MySqlCommand cmd = new MySqlCommand(sql, conn);
                using (var reader = await cmd.ExecuteReaderAsync())
                {
                    while (await reader.ReadAsync())
                    {
                        var coinValue = new CoinValue
                        {
                            Id = reader.GetInt32(reader.GetOrdinal("id")),
                            Symbol = reader.IsDBNull(reader.GetOrdinal("symbol")) ? null : reader.GetString(reader.GetOrdinal("symbol")),
                            Name = reader.IsDBNull(reader.GetOrdinal("name")) ? null : reader.GetString(reader.GetOrdinal("name")),
                            ValueCAD = reader.IsDBNull(reader.GetOrdinal("value_cad")) ? 0 : reader.GetDecimal(reader.GetOrdinal("value_cad")),
                            Timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp"))
                        };
                        coinValues.Add(coinValue);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while trying to get all coin values.");
            }
            finally
            {
                await conn.CloseAsync();
            }

            return coinValues;
        }

        [HttpPost("/CoinValue/GetLatest/", Name = "GetLatestCoinValues")]
        public async Task<List<CoinValue>> GetLatestCoinValues()
        {
            _logger.LogInformation("POST /CoinValue/GetLatest");
            var coinValues = new List<CoinValue>();

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                await conn.OpenAsync();

                // Get the latest timestamp
                string timestampSql = @"SELECT MAX(timestamp) FROM coin_value";
                MySqlCommand timestampCmd = new MySqlCommand(timestampSql, conn);
                var latestTimestamp = await timestampCmd.ExecuteScalarAsync() as DateTime?;

                if (latestTimestamp != null)
                {
                    string sql = @"SELECT id, symbol, name, value_cad, timestamp FROM coin_value WHERE timestamp = @latestTimestamp";
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@latestTimestamp", latestTimestamp);
                    using (var reader = await cmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            var coinValue = new CoinValue
                            {
                                Id = reader.GetInt32(reader.GetOrdinal("id")),
                                Symbol = reader.IsDBNull(reader.GetOrdinal("symbol")) ? null : reader.GetString(reader.GetOrdinal("symbol")),
                                Name = reader.IsDBNull(reader.GetOrdinal("name")) ? null : reader.GetString(reader.GetOrdinal("name")),
                                ValueCAD = reader.IsDBNull(reader.GetOrdinal("value_cad")) ? 0 : reader.GetDecimal(reader.GetOrdinal("value_cad")),
                                Timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp"))
                            };
                            coinValues.Add(coinValue);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while trying to get the latest coin values.");
            }
            finally
            {
                await conn.CloseAsync();
            }

            return coinValues;
        }

        [HttpPost("/CoinValue/GetLatestByName/{name}", Name = "GetLatestCoinValuesByName")]
        public async Task<CoinValue> GetLatestCoinValuesByName(string name)
        {
            _logger.LogInformation($"POST /CoinValue/GetLatestByName/{name}");
            var coinValues = new CoinValue();

            MySqlConnection conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
            try
            {
                await conn.OpenAsync();

                // Get the latest timestamp
                string timestampSql = @"SELECT MAX(timestamp) FROM coin_value WHERE LOWER(name) = LOWER(@name)";
                MySqlCommand timestampCmd = new MySqlCommand(timestampSql, conn);
                timestampCmd.Parameters.AddWithValue("@name", name);
                var latestTimestamp = await timestampCmd.ExecuteScalarAsync() as DateTime?;

                if (latestTimestamp != null)
                {
                    string sql = @"SELECT id, symbol, name, value_cad, timestamp FROM coin_value WHERE LOWER(name) = LOWER(@name) AND timestamp = @latestTimestamp LIMIT 1";
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@name", name);
                    cmd.Parameters.AddWithValue("@latestTimestamp", latestTimestamp);
                    using (var reader = await cmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            var coinValue = new CoinValue
                            {
                                Id = reader.GetInt32(reader.GetOrdinal("id")),
                                Symbol = reader.IsDBNull(reader.GetOrdinal("symbol")) ? null : reader.GetString(reader.GetOrdinal("symbol")),
                                Name = reader.IsDBNull(reader.GetOrdinal("name")) ? null : reader.GetString(reader.GetOrdinal("name")),
                                ValueCAD = reader.IsDBNull(reader.GetOrdinal("value_cad")) ? 0 : reader.GetDecimal(reader.GetOrdinal("value_cad")),
                                Timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp"))
                            };
                            return coinValue;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while trying to get the latest coin values by name.");
            }
            finally
            {
                await conn.CloseAsync();
            }

            return coinValues;
        }
    }

    public class CoinValue
    {
        public int Id { get; set; }
        public string? Symbol { get; set; }
        public string? Name { get; set; }
        public decimal ValueCAD { get; set; }
        public DateTime Timestamp { get; set; }
    }
}
