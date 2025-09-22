using maxhanna.Server.Controllers.DataContracts.Users;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class RatingController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly Log _log;

        public RatingController(Log log, IConfiguration config)
        {
            _log = log;
            _config = config;
        }

        [HttpPost("/Ratings/Add")]
        public async Task<IActionResult> Add([FromBody] Rating rating)
        {
            var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
            using var conn = new MySqlConnection(connectionString);
            await conn.OpenAsync();
            string sql = @"INSERT INTO ratings (user_id, rating, file_id, search_id, timestamp) VALUES (@UserId, @Rating, @FileId, @SearchId, UTC_TIMESTAMP())";
            using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@UserId", rating.UserId ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@Rating", rating.RatingValue);
            cmd.Parameters.AddWithValue("@FileId", rating.FileId ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@SearchId", rating.SearchId ?? (object)DBNull.Value);
            try
            {
                await cmd.ExecuteNonQueryAsync();
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _ = _log.Db("Error adding rating: " + ex.Message, rating.UserId, "RATING", true);
                return StatusCode(500, "Error adding rating.");
            }
        }

        [HttpPost("/Ratings/GetByUser")]
        public async Task<IActionResult> GetByUser([FromBody] int userId)
        {
            var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
            var ratings = new List<Rating>();
            using var conn = new MySqlConnection(connectionString);
            await conn.OpenAsync();
            string sql = @"SELECT * FROM ratings WHERE user_id = @UserId ORDER BY timestamp DESC LIMIT 50";
            using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@UserId", userId);
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                ratings.Add(new Rating
                {
                    Id = reader.GetInt32(reader.GetOrdinal("id")),
                    UserId = reader.IsDBNull(reader.GetOrdinal("user_id")) ? null : reader.GetInt32(reader.GetOrdinal("user_id")),
                    RatingValue = reader.GetInt32(reader.GetOrdinal("rating")),
                    Timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp")),
                    FileId = reader.IsDBNull(reader.GetOrdinal("file_id")) ? null : reader.GetInt32(reader.GetOrdinal("file_id")),
                    SearchId = reader.IsDBNull(reader.GetOrdinal("search_id")) ? null : reader.GetInt32(reader.GetOrdinal("search_id"))
                });
            }
            return Ok(ratings);
        }

        [HttpPost("/Ratings/GetByFile")]
        public async Task<IActionResult> GetByFile([FromBody] int fileId)
        {
            var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
            var ratings = new List<Rating>();
            using var conn = new MySqlConnection(connectionString);
            await conn.OpenAsync();
            string sql = @"SELECT * FROM ratings WHERE file_id = @FileId ORDER BY timestamp DESC LIMIT 50";
            using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@FileId", fileId);
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                ratings.Add(new Rating
                {
                    Id = reader.GetInt32(reader.GetOrdinal("id")),
                    UserId = reader.IsDBNull(reader.GetOrdinal("user_id")) ? null : reader.GetInt32(reader.GetOrdinal("user_id")),
                    RatingValue = reader.GetInt32(reader.GetOrdinal("rating")),
                    Timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp")),
                    FileId = reader.IsDBNull(reader.GetOrdinal("file_id")) ? null : reader.GetInt32(reader.GetOrdinal("file_id")),
                    SearchId = reader.IsDBNull(reader.GetOrdinal("search_id")) ? null : reader.GetInt32(reader.GetOrdinal("search_id"))
                });
            }
            return Ok(ratings);
        }

        [HttpPost("/Ratings/GetBySearch")]
        public async Task<IActionResult> GetBySearch([FromBody] int searchId)
        {
            var connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");
            var ratings = new List<Rating>();
            using var conn = new MySqlConnection(connectionString);
            await conn.OpenAsync();
            string sql = @"SELECT * FROM ratings WHERE search_id = @SearchId ORDER BY timestamp DESC LIMIT 50";
            using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@SearchId", searchId);
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                ratings.Add(new Rating
                {
                    Id = reader.GetInt32(reader.GetOrdinal("id")),
                    UserId = reader.IsDBNull(reader.GetOrdinal("user_id")) ? null : reader.GetInt32(reader.GetOrdinal("user_id")),
                    RatingValue = reader.GetInt32(reader.GetOrdinal("rating")),
                    Timestamp = reader.GetDateTime(reader.GetOrdinal("timestamp")),
                    FileId = reader.IsDBNull(reader.GetOrdinal("file_id")) ? null : reader.GetInt32(reader.GetOrdinal("file_id")),
                    SearchId = reader.IsDBNull(reader.GetOrdinal("search_id")) ? null : reader.GetInt32(reader.GetOrdinal("search_id"))
                });
            }
            return Ok(ratings);
        }
    }

    public class Rating
    {
        public int Id { get; set; }
        public int? UserId { get; set; }
        public int RatingValue { get; set; }
        public DateTime Timestamp { get; set; }
        public int? FileId { get; set; }
        public int? SearchId { get; set; }
    }
}
