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
        public IActionResult GetMemes([FromBody] User user)
        {
            var directory = baseTarget;
            if (!directory.EndsWith("/"))
            {
                directory += "/";
            }
            _logger.LogInformation($"GET /File/GetMemes (for user: {user.Id}, directory: {directory}");

            if (!ValidatePath(directory!)) { return StatusCode(500, $"Must be within {baseTarget}"); }

            try
            {
                List<FileEntry> fileEntries = new List<FileEntry>();

                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    connection.Open();

                    var command = new MySqlCommand(
                        "SELECT " +
                            "f.id, " +
                            "COALESCE(mn.meme_name, f.file_name) AS file_name, " +
                            "f.ownership, " +
                            "u.username AS username, " +
                            "u.id AS userid, " +
                            "SUM(CASE WHEN fv.upvote = 1 THEN 1 ELSE 0 END) AS upvotes, " +
                            "SUM(CASE WHEN fv.downvote = 1 THEN 1 ELSE 0 END) AS downvotes, " +
                            "f.upload_date as date " +
                        "FROM " +
                            "maxhanna.file_uploads f " +
                        "JOIN " +
                            "maxhanna.users u " +
                            "ON " +
                                "f.ownership = u.id " +
                        "LEFT JOIN " +
                            "maxhanna.meme_names mn " +
                            "ON mn.meme_id = f.id " +
                        "LEFT JOIN " +
                            "maxhanna.file_votes fv " +
                            "ON fv.file_id = f.id " +
                        "WHERE " +
                            "f.folder_path = @folderPath " +
                        "GROUP BY " +
                            "f.id, u.username, u.id, mn.meme_name, f.file_name " +
                        "ORDER BY " +
                            "f.id DESC;"
                        , connection);
                    command.Parameters.AddWithValue("@folderPath", directory);

                    using (var reader = command.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var id = reader.GetInt32("id");
                            var fileName = reader.GetString("file_name");
                            var owner = reader.GetString("ownership");
                            var username = reader.GetString("username");
                            int userid = reader.GetInt32("userid");
                            int upvotes = reader.GetInt32("upvotes");
                            int downvotes = reader.GetInt32("downvotes");
                            DateTime date = reader.GetDateTime("date");

                            fileEntries.Add(new FileEntry( id, fileName, "Public", owner, username, userid, false, upvotes, downvotes, date ));
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

        [HttpPost("/Meme/SearchMemes/", Name = "SearchMemes")]
        public IActionResult SearchMemes([FromBody] SearchRequest searchRequest)
        {
            var directory = baseTarget;
            if (!directory.EndsWith("/"))
            {
                directory += "/";
            }
            _logger.LogInformation($"POST /File/SearchMemes (for user: {searchRequest.User.Id}, keywords: {searchRequest.Keywords}, directory: {directory})");

            if (!ValidatePath(directory!)) { return StatusCode(500, $"Must be within {baseTarget}"); }

            try
            {
                List<FileEntry> fileEntries = new List<FileEntry>();

                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    connection.Open();

                    var command = new MySqlCommand(
                        "SELECT " +
                            "f.id, " +
                            "COALESCE(mn.meme_name, f.file_name) AS file_name, " +
                            "f.ownership, " +
                            "u.username AS username, " +
                            "u.id AS userid, " +
                            "SUM(CASE WHEN fv.upvote = 1 THEN 1 ELSE 0 END) AS upvotes, " +
                            "SUM(CASE WHEN fv.downvote = 1 THEN 1 ELSE 0 END) AS downvotes, " +
                            "f.upload_date AS date " +
                        "FROM " +
                            "maxhanna.file_uploads f " +
                        "JOIN " +
                            "maxhanna.users u " +
                            "ON f.ownership = u.id " +
                        "LEFT JOIN " +
                            "maxhanna.meme_names mn " +
                            "ON mn.meme_id = f.id " +
                        "LEFT JOIN " +
                            "maxhanna.file_votes fv " +
                            "ON fv.file_id = f.id " +
                        "WHERE " +
                            "f.folder_path = @folderPath " +
                            "AND (f.file_name LIKE @keywords OR mn.meme_name LIKE @keywords) " +
                        "GROUP BY " +
                            "f.id, u.username, u.id, mn.meme_name, f.file_name " +
                        "ORDER BY " +
                            "f.id DESC;"
                        , connection);
                    command.Parameters.AddWithValue("@folderPath", directory);
                    command.Parameters.AddWithValue("@keywords", "%" + searchRequest.Keywords + "%");

                    using (var reader = command.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var id = reader.GetInt32("id");
                            var fileName = reader.GetString("file_name");
                            var owner = reader.GetString("ownership");
                            var username = reader.GetString("username");
                            int userid = reader.GetInt32("userid");
                            int upvotes = reader.GetInt32("upvotes");
                            int downvotes = reader.GetInt32("downvotes");
                            DateTime date = reader.GetDateTime("date");

                            fileEntries.Add(new FileEntry(id, fileName, "Public", owner, username, userid, false, upvotes, downvotes, date));
                        }
                    }
                }

                Response.Headers.Append("Cross-Origin-Opener-Policy", "same-origin");
                Response.Headers.Append("Cross-Origin-Embedder-Policy", "require-corp");

                return Ok(fileEntries);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while searching for memes.");
                return StatusCode(500, "An error occurred while searching for memes.");
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
