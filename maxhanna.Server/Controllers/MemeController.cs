using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using System.Diagnostics;
using System.Net;
using MySqlConnector;
using Microsoft.AspNetCore.Components.Forms;
using System.IO;
using System.Xml.Linq;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class MemeController : ControllerBase
    {
        private readonly ILogger<MemeController> _logger;
        private readonly IConfiguration _config;
        private readonly string baseTarget = "E:/Uploads/Meme";

        public MemeController(ILogger<MemeController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost("/Meme/GetMemes/", Name = "GetMemes")]
        public IActionResult GetMemes([FromBody] SearchRequest searchRequest)
        {
            var directory = baseTarget;
            if (!directory.EndsWith("/"))
            {
                directory += "/";
            }
            bool isSearch = !string.IsNullOrEmpty(searchRequest.Keywords);
            _logger.LogInformation($"POST /File/GetMemes (for user: {searchRequest.User?.Id}, {(isSearch ? "keywords: " + searchRequest.Keywords : "directory: " + directory)})");

            if (!ValidatePath(directory!)) { return StatusCode(500, $"Must be within {baseTarget}"); }

            try
            {
                List<FileEntry> fileEntries = new List<FileEntry>();
                Dictionary<int, FileEntry> fileEntryMap = new Dictionary<int, FileEntry>();

                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    connection.Open();

                    string sql = @"
                SELECT 
                    f.id AS fileId, 
                    COALESCE(mn.given_file_name, f.file_name) AS file_name, 
                    f.user_id, 
                    u.username AS username, 
                    u.id AS userid, 
                    SUM(CASE WHEN fv.upvote = 1 THEN 1 ELSE 0 END) AS upvotes, 
                    SUM(CASE WHEN fv.downvote = 1 THEN 1 ELSE 0 END) AS downvotes, 
                    f.upload_date AS date, 
                    fc.id AS commentId, 
                    fc.user_id AS commentUserId, 
                    uc.username AS commentUsername, 
                    fc.comment AS commentText, 
                    SUM(CASE WHEN fcv.upvote = 1 THEN 1 ELSE 0 END) AS commentUpvotes, 
                    SUM(CASE WHEN fcv.downvote = 1 THEN 1 ELSE 0 END) AS commentDownvotes 
                FROM 
                    maxhanna.file_uploads f 
                JOIN 
                    maxhanna.users u ON f.user_id = u.id 
                LEFT JOIN 
                    maxhanna.file_data mn ON mn.file_id = f.id 
                LEFT JOIN 
                    maxhanna.file_votes fv ON fv.file_id = f.id 
                LEFT JOIN 
                    maxhanna.file_comments fc ON fc.file_id = f.id 
                LEFT JOIN 
                    maxhanna.users uc ON fc.user_id = uc.id 
                LEFT JOIN 
                    maxhanna.file_comment_votes fcv ON fc.id = fcv.comment_id 
                WHERE 
                    f.folder_path = @folderPath ";

                    if (isSearch)
                    {
                        sql += "AND (f.file_name LIKE @keywords OR mn.given_file_name LIKE @keywords) ";
                    }

                    sql += @"
                GROUP BY 
                    f.id, u.username, u.id, COALESCE(mn.given_file_name, f.file_name), fc.id, uc.username, fc.comment 
                ORDER BY 
                    f.id DESC;";

                    var command = new MySqlCommand(sql, connection);
                    command.Parameters.AddWithValue("@folderPath", directory);
                    if (isSearch)
                    {
                        command.Parameters.AddWithValue("@keywords", "%" + searchRequest.Keywords + "%");
                    }

                    using (var reader = command.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var fileId = reader.GetInt32("fileId");

                            if (!fileEntryMap.TryGetValue(fileId, out var fileEntry))
                            {
                                var fileName = reader.GetString("file_name");
                                var username = reader.GetString("username");
                                int userId = reader.GetInt32("userid");
                                int upvotes = reader.GetInt32("upvotes");
                                int downvotes = reader.GetInt32("downvotes");
                                DateTime date = reader.GetDateTime("date");

                                fileEntry = new FileEntry();
                                fileEntry.Id = fileId;
                                fileEntry.FileName = fileName;
                                fileEntry.Visibility = "Public";
                                fileEntry.SharedWith = "";
                                fileEntry.User = new User(userId, username);
                                fileEntry.IsFolder = false;
                                fileEntry.Upvotes = upvotes;
                                fileEntry.Downvotes = downvotes;
                                fileEntry.FileComments = new List<FileComment>();
                                fileEntry.Date = date;
                                fileEntryMap[fileId] = fileEntry;
                                fileEntries.Add(fileEntry);
                            }

                            if (!reader.IsDBNull(reader.GetOrdinal("commentId")))
                            {
                                var commentId = reader.GetInt32("commentId");
                                var commentUserId = reader.GetInt32("commentUserId");
                                var commentUsername = reader.GetString("commentUsername");
                                var commentText = reader.GetString("commentText");
                                var commentUpvotes = reader.GetInt32("commentUpvotes");
                                var commentDownvotes = reader.GetInt32("commentDownvotes");

                                var fileComment = new FileComment
                                {
                                    Id = commentId,
                                    FileId = fileId,
                                    User = new User(commentUserId, commentUsername ?? "Anonymous"),
                                    CommentText = commentText,
                                    Upvotes = commentUpvotes,
                                    Downvotes = commentDownvotes
                                };

                                fileEntry.FileComments!.Add(fileComment);
                            }
                        }
                    }
                }

                Response.Headers.Append("Cross-Origin-Opener-Policy", "same-origin");
                Response.Headers.Append("Cross-Origin-Embedder-Policy", "require-corp");

                return Ok(fileEntries);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while listing files.");
                return StatusCode(500, "An error occurred while listing files.");
            }
        }


        [HttpPost("/Meme/UpdateMemeName/{memeId}", Name = "UpdateMemeName")]
        public async Task<IActionResult> UpdateMemeName([FromBody] UpdateMemeRequest request, int memeId)
        { 
            _logger.LogInformation($"GET /File/UpdateMemeName/{memeId} (for user: {request.User.Id}, text: {request.Text}"); 
            try
            {
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    // Check if meme name already exists
                    var checkCommand = new MySqlCommand(
                        "SELECT COUNT(*) FROM maxhanna.meme_names WHERE meme_name = @memeName AND meme_id != @memeId " +
                        "UNION ALL " +
                        "SELECT COUNT(*) FROM maxhanna.file_uploads WHERE folder_path = 'E:/Uploads/Meme/' AND file_name = @memeName AND id != @memeId",
                        connection);
                    checkCommand.Parameters.AddWithValue("@memeName", request.Text);
                    checkCommand.Parameters.AddWithValue("@memeId", memeId);

                    var count = await checkCommand.ExecuteScalarAsync();
                    if (count != null && (long)count > 0)
                    {
                        return Conflict("Meme name already exists.");
                    }

                    // Update or insert the meme name
                    var updateCommand = new MySqlCommand(
                        "INSERT INTO maxhanna.meme_names (meme_id, meme_name) " +
                        "VALUES (@memeId, @memeName) " +
                        "ON DUPLICATE KEY UPDATE meme_name = VALUES(meme_name)",
                        connection);
                    updateCommand.Parameters.AddWithValue("@memeId", memeId);
                    updateCommand.Parameters.AddWithValue("@memeName", request.Text);

                    await updateCommand.ExecuteNonQueryAsync();
                }

                return Ok("Meme updated");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while updating the meme.");
                return StatusCode(500, "An error occurred while updating the meme.");
            }
        }

        [HttpPost("/Meme/GetMeme/{memeId}", Name = "GetMeme")]
        public async Task<IActionResult> GetMeme(string memeId)
        {
            string memeFolderPath = baseTarget;

            _logger.LogInformation($"POST /File/GetMeme/{memeId}");

            if (string.IsNullOrEmpty(memeId))
            {
                _logger.LogError("Meme ID is missing.");
                return BadRequest("Meme ID is missing.");
            }

            string oldFilePath;

            try
            {
                // Query the database to find the file name using the provided meme ID
                var fileNameQuery = "SELECT file_name " +
                                    "FROM maxhanna.file_uploads " +
                                    "WHERE id = @MemeId";

                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();
                    var command = new MySqlCommand(fileNameQuery, connection);
                    command.Parameters.AddWithValue("@MemeId", memeId);

                    var result = await command.ExecuteScalarAsync();

                    if (result == null)
                    {
                        _logger.LogError($"No file found for meme ID: {memeId}");
                        return NotFound();
                    }

                    oldFilePath = Path.Combine(memeFolderPath, result.ToString()!).Replace("\\", "/");
                    _logger.LogInformation($"Found file path: {oldFilePath}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while looking up the file name.");
                return StatusCode(500, "An error occurred while looking up the file name.");
            }

            if (!ValidatePath(oldFilePath))
            {
                return StatusCode(500, $"Must be within {memeFolderPath}");
            }

            try
            {
                if (!System.IO.File.Exists(oldFilePath))
                {
                    _logger.LogError($"File not found at {oldFilePath}");
                    return NotFound();
                }

                var fileStream = new FileStream(oldFilePath, FileMode.Open, FileAccess.Read);
                string contentType = GetContentType(Path.GetExtension(oldFilePath));

                _logger.LogInformation($"Found and returning file: {Path.GetFileName(oldFilePath)}");
                return File(fileStream, contentType, Path.GetFileName(oldFilePath));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while streaming the meme.");
                return StatusCode(500, "An error occurred while streaming the meme.");
            }
        }


        private bool ValidatePath(string directory)
        {
            if (!directory.Contains(baseTarget))
            {
                _logger.LogError($"Must be within {baseTarget}");
                return false;
            }
            else
            {
                return true;
            }
        }

        private string GetContentType(string fileExtension)
        {
            switch (fileExtension.ToLower())
            {
                case ".pdf":
                    return "application/pdf";
                case ".txt":
                    return "text/plain";
                case ".jpg":
                case ".jpeg":
                    return "image/jpeg";
                case ".png":
                    return "image/png";
                default:
                    return "application/octet-stream";
            }
        }
    }
}
