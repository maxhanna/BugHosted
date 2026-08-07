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

        // Aggregated "type-ahead" suggestions for the nav search bar: up to 5
        // matches each from files, social posts, comments, news headlines and
        // favourites, matched with a simple contains search. Each group is
        // queried independently and guarded so one slow/failing group never
        // blocks the rest — the popup renders whatever came back fast.
        [HttpGet("/search/suggest")]
        public async Task<IActionResult> GetSuggestions([FromQuery] string? query, [FromQuery] int userId = 0)
        {
            if (string.IsNullOrWhiteSpace(query) || query.Trim().Length < 2)
            {
                return Ok(new { files = Array.Empty<object>(), posts = Array.Empty<object>(), comments = Array.Empty<object>(), news = Array.Empty<object>(), favourites = Array.Empty<object>() });
            }
            string term = query.Trim();
            string like = "%" + term + "%";
            try
            {
                using var conn = new MySqlConnection(_connectionString);
                await conn.OpenAsync();

                var files = new List<object>();
                var posts = new List<object>();
                var comments = new List<object>();
                var news = new List<object>();
                var favourites = new List<object>();

                // ── Files (public, own or shared with the caller) ──
                try
                {
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        SELECT f.id, f.file_name, f.given_file_name, f.description, f.folder_path,
                               f.file_type, f.is_public, f.is_folder, f.user_id, f.upload_date
                        FROM maxhanna.file_uploads f
                        WHERE f.is_folder = 0
                          AND (f.file_name LIKE @like OR f.given_file_name LIKE @like OR f.description LIKE @like)
                          AND (f.is_public = 1 OR f.user_id = @uid OR JSON_CONTAINS(f.shared_with_json, CAST(@uid AS JSON)))
                        ORDER BY f.upload_date DESC
                        LIMIT 5;";
                    cmd.Parameters.AddWithValue("@like", like);
                    cmd.Parameters.AddWithValue("@uid", userId);
                    using var rdr = await cmd.ExecuteReaderAsync();
                    while (await rdr.ReadAsync())
                    {
                        files.Add(new
                        {
                            id = rdr.GetInt32(0),
                            name = rdr.IsDBNull(2) || string.IsNullOrWhiteSpace(rdr.GetString(2)) ? rdr.GetString(1) : rdr.GetString(2),
                            description = rdr.IsDBNull(3) ? "" : rdr.GetString(3),
                            folderPath = rdr.IsDBNull(4) ? "" : rdr.GetString(4),
                            fileType = rdr.IsDBNull(5) ? "" : rdr.GetString(5),
                            isPublic = rdr.GetBoolean(6),
                            userId = rdr.GetInt32(8)
                        });
                    }
                }
                catch { /* files group failed — keep the rest */ }

                // ── Social posts (visible stories only) ──
                try
                {
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        SELECT s.id, s.story_text, s.date, s.city, s.country,
                               COALESCE(u.username, 'Unknown') AS username
                        FROM maxhanna.stories s
                        LEFT JOIN maxhanna.users u ON u.id = s.user_id
                        WHERE (s.story_text LIKE @like OR s.city LIKE @like OR s.country LIKE @like OR u.username LIKE @like)
                          AND s.visibility <> 'self'
                          AND NOT EXISTS (
                              SELECT 1 FROM maxhanna.user_blocks ub
                              WHERE (ub.user_id = @uid AND ub.blocked_user_id = s.user_id)
                                 OR (ub.user_id = s.user_id AND ub.blocked_user_id = @uid)
                          )
                        ORDER BY s.date DESC
                        LIMIT 5;";
                    cmd.Parameters.AddWithValue("@like", like);
                    cmd.Parameters.AddWithValue("@uid", userId);
                    using var rdr = await cmd.ExecuteReaderAsync();
                    while (await rdr.ReadAsync())
                    {
                        posts.Add(new
                        {
                            id = rdr.GetInt32(0),
                            text = rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                            date = rdr.IsDBNull(2) ? (DateTime?)null : rdr.GetDateTime(2),
                            city = rdr.IsDBNull(3) ? "" : rdr.GetString(3),
                            country = rdr.IsDBNull(4) ? "" : rdr.GetString(4),
                            username = rdr.GetString(5)
                        });
                    }
                }
                catch { /* posts group failed — keep the rest */ }

                // ── Comments (with their parent context for deep-linking) ──
                try
                {
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        SELECT c.id, c.comment, c.date, c.user_id, c.file_id, c.story_id,
                               COALESCE(u.username, 'Unknown') AS username
                        FROM maxhanna.comments c
                        LEFT JOIN maxhanna.users u ON u.id = c.user_id
                        WHERE c.comment LIKE @like
                        ORDER BY c.date DESC
                        LIMIT 5;";
                    cmd.Parameters.AddWithValue("@like", like);
                    using var rdr = await cmd.ExecuteReaderAsync();
                    while (await rdr.ReadAsync())
                    {
                        comments.Add(new
                        {
                            id = rdr.GetInt32(0),
                            text = rdr.GetString(1),
                            date = rdr.IsDBNull(2) ? (DateTime?)null : rdr.GetDateTime(2),
                            userId = rdr.GetInt32(3),
                            fileId = rdr.IsDBNull(4) ? (int?)null : rdr.GetInt32(4),
                            storyId = rdr.IsDBNull(5) ? (int?)null : rdr.GetInt32(5),
                            username = rdr.GetString(6)
                        });
                    }
                }
                catch { /* comments group failed — keep the rest */ }

                // ── News headlines already indexed by the news crawler ──
                try
                {
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        SELECT id, title, description, url, url_to_image, published_at
                        FROM maxhanna.news_headlines
                        WHERE title LIKE @like OR description LIKE @like
                        ORDER BY saved_at DESC
                        LIMIT 5;";
                    cmd.Parameters.AddWithValue("@like", like);
                    using var rdr = await cmd.ExecuteReaderAsync();
                    while (await rdr.ReadAsync())
                    {
                        news.Add(new
                        {
                            id = rdr.GetInt32(0),
                            title = rdr.GetString(1),
                            description = rdr.IsDBNull(2) ? "" : rdr.GetString(2),
                            url = rdr.IsDBNull(3) ? "" : rdr.GetString(3),
                            imageUrl = rdr.IsDBNull(4) ? "" : rdr.GetString(4),
                            publishedAt = rdr.IsDBNull(5) ? (DateTime?)null : rdr.GetDateTime(5)
                        });
                    }
                }
                catch { /* news group failed — keep the rest */ }

                // ── Favourites (only the caller's own saved links — the
                // Favourites app defaults to the 'yours' view, so a suggestion
                // must always land somewhere visible) ──
                try
                {
                    using var cmd = conn.CreateCommand();
                    cmd.CommandText = @"
                        SELECT f.id, f.name, f.url, f.image_url, f.created_by
                        FROM maxhanna.favourites f
                        WHERE (f.name LIKE @like OR f.url LIKE @like)
                          AND EXISTS (
                              SELECT 1 FROM maxhanna.favourites_selected fs
                              WHERE fs.favourite_id = f.id AND fs.user_id = @uid
                          )
                        ORDER BY f.last_added_date DESC
                        LIMIT 5;";
                    cmd.Parameters.AddWithValue("@like", like);
                    cmd.Parameters.AddWithValue("@uid", userId);
                    using var rdr = await cmd.ExecuteReaderAsync();
                    while (await rdr.ReadAsync())
                    {
                        favourites.Add(new
                        {
                            id = rdr.GetInt32(0),
                            name = rdr.IsDBNull(1) ? "" : rdr.GetString(1),
                            url = rdr.IsDBNull(2) ? "" : rdr.GetString(2),
                            imageUrl = rdr.IsDBNull(3) ? "" : rdr.GetString(3),
                            createdBy = rdr.IsDBNull(4) ? (int?)null : rdr.GetInt32(4)
                        });
                    }
                }
                catch { /* favourites group failed — keep the rest */ }

                return Ok(new { files, posts, comments, news, favourites });
            }
            catch (Exception ex)
            {
                _log?.Db("GetSuggestions failed" + ex.Message);
                return Ok(new { files = Array.Empty<object>(), posts = Array.Empty<object>(), comments = Array.Empty<object>(), news = Array.Empty<object>(), favourites = Array.Empty<object>() });
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
