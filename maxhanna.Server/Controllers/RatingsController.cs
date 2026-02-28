using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class RatingsController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly Log _log;

        public RatingsController(Log log, IConfiguration config)
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

            try
            {
                // If we have a user and a file, try to update existing rating for that user/file
                if (rating.UserId.HasValue && rating.FileId.HasValue)
                {
                    const string selectSql = @"SELECT rating FROM ratings WHERE user_id = @UserId AND file_id = @FileId LIMIT 1";
                    using var sel = new MySqlCommand(selectSql, conn);
                    sel.Parameters.AddWithValue("@UserId", rating.UserId.Value);
                    sel.Parameters.AddWithValue("@FileId", rating.FileId.Value);
                    var existingObj = await sel.ExecuteScalarAsync();
                    if (existingObj != null && existingObj != DBNull.Value)
                    {
                        var existingRating = Convert.ToInt32(existingObj);
                        if (existingRating == rating.RatingValue)
                        {
                            // Same rating posted twice — treat as delete (toggle off)
                            const string deleteSql = @"DELETE FROM ratings WHERE user_id = @UserId AND file_id = @FileId";
                            using var del = new MySqlCommand(deleteSql, conn);
                            del.Parameters.AddWithValue("@UserId", rating.UserId.Value);
                            del.Parameters.AddWithValue("@FileId", rating.FileId.Value);
                            await del.ExecuteNonQueryAsync();
                            return Ok(new { success = true, deleted = true });
                        }
                        else
                        {
                            const string updateSql = @"UPDATE ratings SET rating = @Rating, timestamp = UTC_TIMESTAMP() WHERE user_id = @UserId AND file_id = @FileId";
                            using var upd = new MySqlCommand(updateSql, conn);
                            upd.Parameters.AddWithValue("@UserId", rating.UserId.Value);
                            upd.Parameters.AddWithValue("@FileId", rating.FileId.Value);
                            upd.Parameters.AddWithValue("@Rating", rating.RatingValue);
                            var rows = await upd.ExecuteNonQueryAsync();
                            if (rows > 0) return Ok(new { success = true, replaced = true });
                        }
                    }
                }

                // If we have a user and a search rating, try to update existing rating for that user/search
                if (rating.UserId.HasValue && rating.SearchId.HasValue)
                {
                    const string selectSearchSql = @"SELECT rating FROM ratings WHERE user_id = @UserId AND search_id = @SearchId LIMIT 1";
                    using var sel2 = new MySqlCommand(selectSearchSql, conn);
                    sel2.Parameters.AddWithValue("@UserId", rating.UserId.Value);
                    sel2.Parameters.AddWithValue("@SearchId", rating.SearchId.Value);
                    var existingObj2 = await sel2.ExecuteScalarAsync();
                    if (existingObj2 != null && existingObj2 != DBNull.Value)
                    {
                        var existingRating2 = Convert.ToInt32(existingObj2);
                        if (existingRating2 == rating.RatingValue)
                        {
                            // Same rating posted twice — delete
                            const string deleteSearchSql = @"DELETE FROM ratings WHERE user_id = @UserId AND search_id = @SearchId";
                            using var del2 = new MySqlCommand(deleteSearchSql, conn);
                            del2.Parameters.AddWithValue("@UserId", rating.UserId.Value);
                            del2.Parameters.AddWithValue("@SearchId", rating.SearchId.Value);
                            await del2.ExecuteNonQueryAsync();
                            return Ok(new { success = true, deleted = true });
                        }
                        else
                        {
                            const string updateSearchSql = @"UPDATE ratings SET rating = @Rating, timestamp = UTC_TIMESTAMP() WHERE user_id = @UserId AND search_id = @SearchId";
                            using var upd2 = new MySqlCommand(updateSearchSql, conn);
                            upd2.Parameters.AddWithValue("@UserId", rating.UserId.Value);
                            upd2.Parameters.AddWithValue("@SearchId", rating.SearchId.Value);
                            upd2.Parameters.AddWithValue("@Rating", rating.RatingValue);
                            var rows2 = await upd2.ExecuteNonQueryAsync();
                            if (rows2 > 0) return Ok(new { success = true, replaced = true });
                        }
                    }
                }

                // No existing rating found (or no identifying keys), insert a new row
                string sql = @"INSERT INTO ratings (user_id, rating, file_id, search_id, timestamp) VALUES (@UserId, @Rating, @FileId, @SearchId, UTC_TIMESTAMP())";
                using var cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@UserId", rating.UserId ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Rating", rating.RatingValue);
                cmd.Parameters.AddWithValue("@FileId", rating.FileId ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@SearchId", rating.SearchId ?? (object)DBNull.Value);

                await cmd.ExecuteNonQueryAsync();
                return Ok(new { success = true, replaced = false });
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
