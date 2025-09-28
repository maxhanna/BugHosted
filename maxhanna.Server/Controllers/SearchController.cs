using Microsoft.AspNetCore.Mvc;
using maxhanna.Server.Controllers.DataContracts.Users;
using MySqlConnector;
using System.Data;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class SearchController : ControllerBase
    {
        private readonly Log _log;
        private readonly IConfiguration _config;
        private readonly string _connectionString;

        public SearchController(Log log, IConfiguration config)
        {
            _log = log;
            _config = config;
            _connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        }


        [HttpPost("/search/record")]
        public IActionResult RecordSearch([FromBody] RecordBody body)
        {
            if (body == null || string.IsNullOrWhiteSpace(body.Query)) return BadRequest("Missing query");

            try
            {
                using var conn = new MySqlConnection(_connectionString);
                conn.Open();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"INSERT INTO search_queries (`query`, `type`, `user_id`, `created_at`) VALUES (@query, @type, @userId, UTC_TIMESTAMP());";
                cmd.Parameters.AddWithValue("@query", body.Query);
                cmd.Parameters.AddWithValue("@type", (object?)body.Type ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@userId", (object?)body.UserId ?? DBNull.Value);
                cmd.ExecuteNonQuery();
                return Ok();
            }
            catch (Exception ex)
            {
                _log?.Db("RecordSearch failed" + ex.Message);
                return StatusCode(500, "Error recording search");
            }
        }

        [HttpGet("/search/trending")]
        public IActionResult GetTrending([FromQuery] string? type = null, [FromQuery] int limit = 5)
        {
            try
            {
                using var conn = new MySqlConnection(_connectionString);
                conn.Open();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = @"
                    SELECT `query`, COUNT(*) AS cnt, MAX(created_at) AS last
                    FROM search_queries
                    WHERE (@type IS NULL OR `type` = @type)
                    GROUP BY `query`
                    ORDER BY last DESC
                    LIMIT @limit;";
                cmd.Parameters.AddWithValue("@type", (object?)type ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@limit", limit);

                var results = new List<object>();
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        results.Add(new
                        {
                            query = reader.GetString("query"),
                            count = reader.IsDBNull(reader.GetOrdinal("cnt")) ? 0 : reader.GetInt32("cnt"),
                            last = reader.IsDBNull(reader.GetOrdinal("last")) ? (DateTime?)null : reader.GetDateTime("last")
                        });
                    }
                }
                return Ok(results);
            }
            catch (Exception ex)
            {
                _log?.Db("GetTrending failed" + ex.Message);
                return StatusCode(500, "Error fetching trending searches");
            }
        }
    }
    public class RecordBody
    {
        public string? Query { get; set; }
        public string? Type { get; set; }
        public int? UserId { get; set; }
    }
}
