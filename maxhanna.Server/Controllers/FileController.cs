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
    public class FileController : ControllerBase
    {
        private readonly ILogger<FileController> _logger;
        private readonly IConfiguration _config;
        private readonly string baseTarget = "E:/Uploads/";

        public FileController(ILogger<FileController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        [HttpPost("/File/GetDirectory/", Name = "GetDirectory")]
        public IActionResult GetDirectory([FromBody] User user, [FromQuery] string? directory, [FromQuery] string? visibility, [FromQuery] string? ownership)
        {
            if (string.IsNullOrEmpty(directory))
            {
                directory = baseTarget;
            }
            else
            {
                directory = Path.Combine(baseTarget, WebUtility.UrlDecode(directory));
                if (!directory.EndsWith("/"))
                {
                    directory += "/";
                }
            }
            _logger.LogInformation($"GET /File/GetDirectory?directory={directory}&visibility={visibility}&ownership={ownership}");

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
                            "f.file_name, " +
                            "f.is_public, " +
                            "f.is_folder, " +
                            "f.ownership, " +
                            "SUM(CASE WHEN fv.upvote = 1 THEN 1 ELSE 0 END) AS upvotes, " +
                            "SUM(CASE WHEN fv.downvote = 1 THEN 1 ELSE 0 END) AS downvotes, " +
                            "f.upload_date AS date, " +
                            "COUNT(fc.id) AS commentCount " +
                        "FROM " +
                            "maxhanna.file_uploads f " +
                        "LEFT JOIN " +
                            "maxhanna.file_votes fv ON f.id = fv.file_id " +
                        "LEFT JOIN " +
                            "maxhanna.file_comments fc ON f.id = fc.file_id " +
                        "WHERE " +
                            "f.folder_path = @folderPath " +
                            "AND (" +
                                "f.is_public = 1 OR " +
                                "FIND_IN_SET(@userId, f.ownership) > 0" +
                            ") " +
                        "GROUP BY " +
                            "f.id, f.file_name, f.is_public, f.is_folder, f.ownership"
                        , connection);


                    command.Parameters.AddWithValue("@folderPath", directory);
                    command.Parameters.AddWithValue("@userId", user.Id);

                    using (var reader = command.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var id = reader.GetInt32("id");
                            var fileName = reader.GetString("file_name");
                            var isPublic = reader.GetBoolean("is_public");
                            var owner = reader.GetString("ownership");
                            var isFolder = reader.GetBoolean("is_folder");
                            var upvotes = reader.GetInt32("upvotes");
                            var downvotes = reader.GetInt32("downvotes");
                            var commentCount = reader.GetInt32("commentCount");
                            var date = reader.GetDateTime("date");

                            // Apply filters
                            bool matchesVisibility = (visibility == "public" && isPublic) || (visibility == "private" && !isPublic) || visibility == "all";
                            bool matchesOwnership = (ownership == "own" && owner.Contains(user.Id.ToString())) || (ownership == "others" && !owner.Contains(user.Id.ToString())) || (ownership == "all");

                            if (matchesVisibility && matchesOwnership)
                            {
                                fileEntries.Add(new FileEntry(id, fileName, isPublic ? "Public" : "Private", owner, "", user.Id, isFolder, upvotes, downvotes, commentCount, date));
                            }
                        }
                    }
                }

                Response.Headers.Append("Cross-Origin-Opener-Policy", "same-origin"); //?still need??
                Response.Headers.Append("Cross-Origin-Embedder-Policy", "require-corp"); //?still need??

                return Ok(fileEntries);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while listing files.");
                return StatusCode(500, "An error occurred while listing files.");
            }
        }

        [HttpGet("/File/Comments/{fileId}", Name = "GetCommentsForFile")]
        public async Task<IActionResult> GetCommentsForFile(int fileId)
        {
            try
            {
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    var command = new MySqlCommand(@"
                        SELECT 
                            c.id, 
                            c.file_id, 
                            c.user_id, 
                            c.comment, 
                            u.username,
                            SUM(CASE WHEN cv_up.upvote = 1 THEN 1 ELSE 0 END) AS upvotes,
                            SUM(CASE WHEN cv_down.downvote = 1 THEN 1 ELSE 0 END) AS downvotes
                        FROM 
                            maxhanna.file_comments c 
                        JOIN 
                            maxhanna.users u 
                            ON c.user_id = u.id 
                        LEFT JOIN 
                            maxhanna.comment_votes cv_up 
                            ON c.id = cv_up.comment_id AND cv_up.upvote = 1
                        LEFT JOIN 
                            maxhanna.comment_votes cv_down 
                            ON c.id = cv_down.comment_id AND cv_down.downvote = 1
                        WHERE 
                            c.file_id = @fileId
                        GROUP BY 
                            c.id, c.file_id, c.user_id, c.comment, u.username", connection);
                    command.Parameters.AddWithValue("@fileId", fileId);

                    using (var reader = await command.ExecuteReaderAsync())
                    {
                        var comments = new List<Comment>();

                        while (reader.Read())
                        {
                            var comment = new Comment
                            {
                                Id = reader.GetInt32("id"),
                                FileId = reader.GetInt32("file_id"),
                                UserId = reader.GetInt32("user_id"),
                                Username = reader.GetString("username"),
                                CommentText = reader.GetString("comment"),
                                Upvotes = reader.GetInt32("upvotes"),
                                Downvotes = reader.GetInt32("downvotes"),
                            };

                            comments.Add(comment);
                        }

                        return Ok(comments);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while retrieving comments for the file.");
                return StatusCode(500, "An error occurred while retrieving comments for the file.");
            }
        }
        [HttpPost("/File/Comment", Name = "CommentFile")]
        public async Task<IActionResult> CommentFile([FromBody] CommentRequest request)
        {
            _logger.LogInformation($"POST /File/Comment");
            try
            {
                if (request.User.Id <= 0 || request.FileId <= 0 || string.IsNullOrEmpty(request.Comment))
                {
                    _logger.LogWarning($"Invalid request data! Returning BadRequest.");
                    return BadRequest("Invalid user, file ID, or comment.");
                }

                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    var command = new MySqlCommand("INSERT INTO file_comments (file_id, user_id, comment) VALUES (@fileId, @userId, @comment)", connection);
                    command.Parameters.AddWithValue("@fileId", request.FileId);
                    command.Parameters.AddWithValue("@userId", request.User.Id);
                    command.Parameters.AddWithValue("@comment", request.Comment);

                    await command.ExecuteNonQueryAsync();
                }

                _logger.LogInformation($"Comment added to file {request.FileId} by user {request.User.Id}");
                return Ok("Comment added successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while adding a comment to the file.");
                return StatusCode(500, "An error occurred while adding a comment to the file.");
            }
        }
        [HttpPost("/File/UpvoteComment", Name = "UpvoteComment")]
        public async Task<IActionResult> UpvoteComment([FromBody] CommentVoteRequest request)
        {
            try
            {
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    var command = new MySqlCommand("INSERT INTO comment_votes (comment_id, user_id, upvote, downvote) VALUES (@commentId, @userId, @upvote, 0) ON DUPLICATE KEY UPDATE upvote = @upvote, downvote = 0", connection);
                    command.Parameters.AddWithValue("@commentId", request.CommentId);
                    command.Parameters.AddWithValue("@userId", request.User.Id);
                    command.Parameters.AddWithValue("@upvote", request.Upvote);

                    await command.ExecuteNonQueryAsync();
                }

                return Ok("Comment upvoted successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while upvoting the comment.");
                return StatusCode(500, "An error occurred while upvoting the comment.");
            }
        }

        [HttpPost("/File/DownvoteComment", Name = "DownvoteComment")]
        public async Task<IActionResult> DownvoteComment([FromBody] CommentVoteRequest request)
        {
            try
            {
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    var command = new MySqlCommand("INSERT INTO comment_votes (comment_id, user_id, upvote, downvote) VALUES (@commentId, @userId, 0, @downvote) ON DUPLICATE KEY UPDATE upvote = 0, downvote = @downvote", connection);
                    command.Parameters.AddWithValue("@commentId", request.CommentId);
                    command.Parameters.AddWithValue("@userId", request.User.Id);
                    command.Parameters.AddWithValue("@downvote", request.Downvote);

                    await command.ExecuteNonQueryAsync();
                }

                return Ok("Comment downvoted successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while downvoting the comment.");
                return StatusCode(500, "An error occurred while downvoting the comment.");
            }
        }
        [HttpPost("/File/Upvote", Name = "UpvoteFile")]
        public async Task<IActionResult> UpvoteFile([FromBody] VoteRequest request)
        {
            _logger.LogInformation($"POST /File/Upvote");
            try
            {
                if (request.User.Id <= 0 || request.FileId <= 0)
                {
                    _logger.LogWarning($"Invalid request data! Returning BadRequest.");
                    return BadRequest("Invalid user or File ID.");
                }

                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    var command = new MySqlCommand("INSERT INTO file_votes (file_id, user_id, upvote, downvote) VALUES (@fileId, @userId, 1, 0) ON DUPLICATE KEY UPDATE upvote = 1, downvote = 0", connection);
                    command.Parameters.AddWithValue("@fileId", request.FileId);
                    command.Parameters.AddWithValue("@userId", request.User.Id);

                    await command.ExecuteNonQueryAsync();
                }

                _logger.LogInformation($"File {request.FileId} upvoted by user {request.User.Id}");
                return Ok("File upvoted successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while upvoting the file.");
                return StatusCode(500, "An error occurred while upvoting the file.");
            }
        }

        [HttpPost("/File/Downvote", Name = "DownvoteFile")]
        public async Task<IActionResult> DownvoteFile([FromBody] VoteRequest request)
        {
            _logger.LogInformation($"POST /File/Downvote");
            try
            {
                if (request.User.Id <= 0 || request.FileId <= 0)
                {
                    _logger.LogWarning($"Invalid request data! Returning BadRequest.");
                    return BadRequest("Invalid user or File ID.");
                }

                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    var command = new MySqlCommand("INSERT INTO file_votes (file_id, user_id, upvote, downvote) VALUES (@fileId, @userId, 0, 1) ON DUPLICATE KEY UPDATE upvote = 0, downvote = 1", connection);
                    command.Parameters.AddWithValue("@fileId", request.FileId);
                    command.Parameters.AddWithValue("@userId", request.User.Id);

                    await command.ExecuteNonQueryAsync();
                }

                _logger.LogInformation($"File {request.FileId} downvoted by user {request.User.Id}");
                return Ok("File downvoted successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while downvoting the file.");
                return StatusCode(500, "An error occurred while downvoting the file.");
            }
        }
        [HttpPost("/File/GetFile/{filePath}", Name = "GetFile")]
        public IActionResult GetFile([FromBody] User user, string filePath)
        {
            filePath = Path.Combine(baseTarget, WebUtility.UrlDecode(filePath) ?? "");

            _logger.LogInformation($"GET /File/GetFile/{filePath}");
            if (!ValidatePath(filePath)) { return StatusCode(500, $"Must be within {baseTarget}"); }

            try
            {
                if (string.IsNullOrEmpty(filePath))
                {
                    _logger.LogError($"File path is missing.");
                    return BadRequest("File path is missing.");
                }

                if (!System.IO.File.Exists(filePath))
                {
                    _logger.LogError($"File not found at {filePath}");
                    return NotFound();
                }

                var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
                string contentType = GetContentType(Path.GetExtension(filePath));

                return File(fileStream, contentType, Path.GetFileName(filePath));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while streaming the file.");
                return StatusCode(500, "An error occurred while streaming the file.");
            }
        }


        [HttpPost("/File/GetRomFile/{filePath}", Name = "GetRomFile")]
        public IActionResult GetRomFile([FromBody] User user, string filePath)
        {
            filePath = Path.Combine(baseTarget + "roms/", WebUtility.UrlDecode(filePath) ?? "");
            _logger.LogInformation($"GET /File/GetRomFile/{filePath}");

            if (!ValidatePath(filePath)) { return StatusCode(500, $"Must be within {baseTarget}"); }

            try
            {
                if (string.IsNullOrEmpty(filePath))
                {
                    _logger.LogError($"File path is missing.");
                    return BadRequest("File path is missing.");
                }

                if (filePath.Contains(".sav"))
                {
                    string filenameWithoutExtension = Path.GetFileNameWithoutExtension(filePath);
                    string newFilename = filenameWithoutExtension + "_" + user!.Id + Path.GetExtension(filePath);
                    string userSpecificPath = Path.Combine(baseTarget + "roms/", newFilename);

                    if (System.IO.File.Exists(userSpecificPath))
                    {
                        filePath = userSpecificPath;
                    }
                    else
                    {
                        _logger.LogError($"File not found at {filePath} or {userSpecificPath}");
                        return NotFound();
                    }
                    _logger.LogInformation($"File path changed . New FilePath: " + filePath);
                }
                _logger.LogInformation($"Filestreaing FilePath: " + filePath);

                var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
                string contentType = "application/octet-stream";

                return File(fileStream, contentType, Path.GetFileName(filePath));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while streaming the file.");
                return StatusCode(500, "An error occurred while streaming the file.");
            }
        }

        [HttpPost("/File/MakeDirectory", Name = "MakeDirectory")]
        public async Task<IActionResult> MakeDirectory([FromBody] CreateDirectory request)
        {
            if (request.directory == null)
            {
                _logger.LogError("POST /File/MakeDirectory ERROR: directoryPath cannot be empty!");
                return StatusCode(500, "POST /File/MakeDirectory ERROR: directoryPath cannot be empty!");
            }

            request.directory = Path.Combine(baseTarget, WebUtility.UrlDecode(request.directory) ?? "");
            _logger.LogInformation($"POST /File/MakeDirectory/ (directoryPath: {request.directory})");
            if (!ValidatePath(request.directory))
            {
                return StatusCode(500, $"Must be within {baseTarget}");
            }

            try
            {
                if (Directory.Exists(request.directory))
                {
                    _logger.LogError($"Directory already exists at {request.directory}");
                    return Conflict("Directory already exists.");
                }

                Directory.CreateDirectory(request.directory);

                DateTime uploadDate = DateTime.UtcNow;
                string fileName = Path.GetFileName(request.directory);
                string directoryName = (Path.GetDirectoryName(request.directory) ?? "").Replace("\\", "/");

                string connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna") ?? "";

                using (var connection = new MySqlConnection(connectionString))
                {
                    await connection.OpenAsync();
                    using (var transaction = await connection.BeginTransactionAsync())
                    {
                        if (!directoryName.EndsWith("/"))
                        {
                            directoryName += "/";
                        }

                        var insertCommand = new MySqlCommand(
                            "INSERT INTO maxhanna.file_uploads " +
                            "(ownership, upload_date, file_name, folder_path, is_public, is_folder) " +
                            "VALUES (@ownership, @uploadDate, @fileName, @folderPath, @isPublic, @isFolder)",
                            connection,
                            transaction);

                        insertCommand.Parameters.AddWithValue("@ownership", request.user.Id);
                        insertCommand.Parameters.AddWithValue("@uploadDate", uploadDate);
                        insertCommand.Parameters.AddWithValue("@fileName", fileName);
                        insertCommand.Parameters.AddWithValue("@folderPath", directoryName);
                        insertCommand.Parameters.AddWithValue("@isPublic", request.isPublic);
                        insertCommand.Parameters.AddWithValue("@isFolder", 1);

                        await insertCommand.ExecuteNonQueryAsync();

                        var selectCommand = new MySqlCommand(
                            "SELECT id FROM maxhanna.file_uploads " +
                            "WHERE ownership = @ownership AND upload_date = @uploadDate " +
                            "AND file_name = @fileName AND folder_path = @folderPath " +
                            "AND is_public = @isPublic AND is_folder = @isFolder",
                            connection,
                            transaction);

                        selectCommand.Parameters.AddWithValue("@ownership", request.user.Id);
                        selectCommand.Parameters.AddWithValue("@uploadDate", uploadDate);
                        selectCommand.Parameters.AddWithValue("@fileName", fileName);
                        selectCommand.Parameters.AddWithValue("@folderPath", directoryName);
                        selectCommand.Parameters.AddWithValue("@isPublic", request.isPublic);
                        selectCommand.Parameters.AddWithValue("@isFolder", 1);

                        int id = 0;
                        using (var reader = await selectCommand.ExecuteReaderAsync())
                        {
                            if (await reader.ReadAsync())
                            {
                                id = reader.GetInt32("id");
                            }
                        }

                        await transaction.CommitAsync();
                        return Ok(id);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while creating directory.");
                return StatusCode(500, "An error occurred while creating directory.");
            }
        }


        [HttpPost("/File/Upload", Name = "Upload")]
        public async Task<IActionResult> UploadFiles([FromQuery] string? folderPath)
        {
            _logger.LogInformation($"POST /File/Upload (folderPath = {folderPath})");
            try
            {
                if (Request.Form["user"].Count <= 0)
                {
                    _logger.LogWarning($"Invalid user! Returning null.");
                    return BadRequest("No user logged in.");
                }

                var user = JsonConvert.DeserializeObject<User>(Request.Form["user"]!);
                var isPublic = JsonConvert.DeserializeObject<bool>(Request.Form["isPublic"]!);
                var files = Request.Form.Files;

                if (files == null || files.Count == 0)
                    return BadRequest("No files uploaded.");

                foreach (var file in files)
                {
                    if (file.Length == 0)
                        continue; // Skip empty files

                    var uploadDirectory = string.IsNullOrEmpty(folderPath) ? baseTarget : Path.Combine(baseTarget, WebUtility.UrlDecode(folderPath));
                    if (!uploadDirectory.EndsWith("/"))
                    {
                        uploadDirectory += "/";
                    }
                    var filePath = Path.Combine(uploadDirectory, file.FileName); // Combine upload directory with file name

                    if (!Directory.Exists(uploadDirectory))
                    {
                        Directory.CreateDirectory(uploadDirectory);
                    }

                    using (var stream = new FileStream(filePath, FileMode.Create))
                    {
                        await file.CopyToAsync(stream);
                    }

                    // Insert file metadata into MySQL database
                    using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                    {
                        await connection.OpenAsync();

                        var command = new MySqlCommand(
                            "INSERT INTO maxhanna.file_uploads" +
                            " (ownership, file_name, upload_date, folder_path, is_public, is_folder) " +
                            "VALUES (@ownership, @fileName, @uploadDate, @folderPath, @isPublic, @isFolder)", connection);
                        command.Parameters.AddWithValue("@ownership", user!.Id);
                        command.Parameters.AddWithValue("@fileName", file.FileName);
                        command.Parameters.AddWithValue("@uploadDate", DateTime.UtcNow);
                        command.Parameters.AddWithValue("@folderPath", uploadDirectory ?? "");
                        command.Parameters.AddWithValue("@isPublic", isPublic);
                        command.Parameters.AddWithValue("@isFolder", 0);

                        await command.ExecuteNonQueryAsync();
                    }

                    _logger.LogInformation($"Uploaded file: {file.FileName}, Size: {file.Length} bytes, Path: {filePath}");
                }

                return Ok("Files uploaded successfully.");
            }
            catch (Exception ex)
            {
                if (ex.Message.Contains("Duplicate entry"))
                {
                    _logger.LogError(ex, "Cannot upload duplicate files.");
                    return Conflict("Cannot upload duplicate files.");
                }
                _logger.LogError(ex, "An error occurred while uploading files.");
                return StatusCode(500, "An error occurred while uploading files.");
            }
        }

        [HttpPost("/File/Uploadrom", Name = "Uploadrom")]
        public async Task<IActionResult> UploadRom()
        {
            _logger.LogInformation($"POST /File/Uploadrom");
            try
            {
                if (Request.Form["user"].Count <= 0)
                {
                    _logger.LogWarning($"Invalid user! Returning null.");
                    return BadRequest("No user logged in.");
                }

                var user = JsonConvert.DeserializeObject<User>(Request.Form["user"]!);
                var files = Request.Form.Files; // Get all uploaded files

                if (files == null || files.Count == 0)
                {
                    _logger.LogError($"No File Uploaded!");
                    return BadRequest("No files uploaded.");
                }

                foreach (var file in files)
                {
                    if (file.Length == 0)
                    {
                        _logger.LogInformation($"File length is empty!");
                        continue; // Skip empty files
                    }

                    string newFilename = "";
                    if (file.FileName.Contains(".sav"))
                    {
                        string filenameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
                        newFilename = filenameWithoutExtension + "_" + user!.Id + Path.GetExtension(file.FileName);
                    }

                    var uploadDirectory = Path.Combine(baseTarget, "roms/"); // Combine base path with folder path
                    var filePath = string.IsNullOrEmpty(newFilename) ? file.FileName : newFilename;
                    filePath = Path.Combine(uploadDirectory, filePath); // Combine upload directory with file name
                    _logger.LogInformation($"filePath : {filePath}");

                    if (!Directory.Exists(uploadDirectory))
                    {
                        Directory.CreateDirectory(uploadDirectory);
                    }

                    using (var stream = new FileStream(filePath, FileMode.Create))
                    {
                        await file.CopyToAsync(stream);
                    }

                    // Insert file metadata into MySQL database
                    using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                    {
                        await connection.OpenAsync();

                        var command = new MySqlCommand("INSERT INTO maxhanna.file_uploads (ownership, file_name, upload_date, folder_path, is_public, is_folder) VALUES (@ownership, @fileName, @uploadDate, @folderPath, @isPublic, @isFolder)", connection);
                        command.Parameters.AddWithValue("@ownership", user!.Id);
                        command.Parameters.AddWithValue("@fileName", file.FileName);
                        command.Parameters.AddWithValue("@uploadDate", DateTime.UtcNow);
                        command.Parameters.AddWithValue("@folderPath", "roms");
                        command.Parameters.AddWithValue("@isPublic", 1);
                        command.Parameters.AddWithValue("@isFolder", 0);

                        await command.ExecuteNonQueryAsync();
                    }

                    _logger.LogInformation($"Uploaded rom file: {file.FileName}, Size: {file.Length} bytes, Path: {filePath}");
                }

                return Ok("ROM uploaded successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while uploading files.");
                return StatusCode(500, "An error occurred while uploading files.");
            }
        }

        [HttpDelete("/File/Delete/", Name = "DeleteFileOrDirectory")]
        public IActionResult DeleteFileOrDirectory([FromBody] DeleteFileOrDirectory request)
        {
            // Ensure baseTarget ends with a forward slash
            string filePath;

            try
            {
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    connection.Open();
                    _logger.LogInformation($"Opened connection to database for deleting file or directory with id {request.file.Id}");

                    // Check for ownership
                    var ownershipCommand = new MySqlCommand(
                        "SELECT ownership, file_name, folder_path, is_folder FROM maxhanna.file_uploads WHERE id = @fileId",
                        connection);
                    ownershipCommand.Parameters.AddWithValue("@fileId", request.file.Id);

                    var ownershipReader = ownershipCommand.ExecuteReader();
                    if (!ownershipReader.Read())
                    {
                        _logger.LogError($"File or directory with id {request.file.Id} not found.");
                        return NotFound("File or directory not found.");
                    }

                    var ownership = ownershipReader.GetString("ownership");
                    if (!ownership.Split(',').Contains(request.user.Id.ToString()))
                    {
                        _logger.LogError($"User {request.user.Id} does not have ownership for {request.file.Name}");
                        return StatusCode(409, "You do not have permission to delete this file or directory.");
                    }

                    var fileName = ownershipReader.GetString("file_name");
                    var folderPath = ownershipReader.GetString("folder_path").Replace("\\", "/").TrimEnd('/') + "/";
                    var isFolder = ownershipReader.GetBoolean("is_folder");

                    filePath = Path.Combine(baseTarget, folderPath, fileName).Replace("\\", "/");
                    ownershipReader.Close();

                    _logger.LogInformation($"User {request.user.Id} has ownership. Proceeding with deletion. File Path: {filePath}");

                    // Proceed with deletion if ownership is confirmed
                    if (isFolder)
                    {
                        if (Directory.Exists(filePath))
                        {
                            _logger.LogInformation($"Deleting directory at {filePath}");
                            Directory.Delete(filePath, true);
                            _logger.LogInformation($"Directory deleted at {filePath}");
                        }
                        else
                        {
                            _logger.LogError($"Directory not found at {filePath}");
                            return NotFound("Directory not found.");
                        }
                    }
                    else
                    {
                        if (System.IO.File.Exists(filePath))
                        {
                            _logger.LogInformation($"Deleting file at {filePath}");
                            System.IO.File.Delete(filePath);
                            _logger.LogInformation($"File deleted at {filePath}");
                        }
                        else
                        {
                            _logger.LogError($"File not found at {filePath}");
                            return NotFound("File not found.");
                        }
                    }

                    // Delete record from database
                    var deleteCommand = new MySqlCommand(
                        "DELETE FROM maxhanna.file_uploads WHERE id = @fileId",
                        connection);
                    deleteCommand.Parameters.AddWithValue("@fileId", request.file.Id);
                    deleteCommand.ExecuteNonQuery();

                    _logger.LogInformation($"Record deleted from database for file or directory with id {request.file.Id}");
                }

                _logger.LogInformation($"File or directory deleted successfully at {filePath}");
                return Ok("File or directory deleted successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while deleting file or directory.");
                return StatusCode(500, "An error occurred while deleting file or directory.");
            }
        }




        [HttpPost("/File/Move/", Name = "MoveFile")]
        public async Task<IActionResult> MoveFile([FromBody] User user, [FromQuery] string inputFile, [FromQuery] string? destinationFolder)
        {
            _logger.LogInformation($"POST /File/Move (inputFile = {inputFile}, destinationFolder = {destinationFolder})");

            try
            {
                // Remove any leading slashes
                inputFile = WebUtility.UrlDecode(inputFile ?? "").TrimStart('/');
                destinationFolder = WebUtility.UrlDecode(destinationFolder ?? "").TrimStart('/');

                // Combine with baseTarget
                inputFile = Path.Combine(baseTarget, inputFile);
                destinationFolder = Path.Combine(baseTarget, destinationFolder);

                if (!ValidatePath(inputFile) || !ValidatePath(destinationFolder))
                {
                    _logger.LogError($"Invalid path: inputFile = {inputFile}, destinationFolder = {destinationFolder}");
                    return NotFound("Invalid path.");
                }

                if (System.IO.File.Exists(inputFile))
                {
                    string fileName = Path.GetFileName(inputFile).Replace("\\", "/");
                    string newFilePath = Path.Combine(destinationFolder, fileName).Replace("\\", "/");
                    System.IO.File.Move(inputFile, newFilePath);

                    await UpdateFilePathInDatabase(inputFile, newFilePath);

                    _logger.LogInformation($"File moved from {inputFile} to {newFilePath}");
                    return Ok("File moved successfully.");
                }
                else if (Directory.Exists(inputFile))
                {
                    MoveDirectory(inputFile, destinationFolder);

                    await UpdateDirectoryPathInDatabase(inputFile, destinationFolder);

                    _logger.LogInformation($"Directory moved from {inputFile} to {destinationFolder}");
                    return Ok("Directory moved successfully.");
                }
                else
                {
                    _logger.LogError($"Input file or directory not found at {inputFile}");
                    return NotFound("Input file or directory not found.");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while moving the file or directory.");
                return StatusCode(500, "An error occurred while moving the file or directory.");
            }
        }

        [HttpPost("/File/Share/{fileId}", Name = "ShareFile")]
        public async Task<IActionResult> ShareFileRequest([FromBody] ShareFileRequest request, int fileId)
        {
            _logger.LogInformation($"GET /File/Share/{fileId} (for user: {request.User1.Id} to user: {request.User2.Id})");

            string updateSql = "UPDATE maxhanna.file_uploads SET ownership = CONCAT(ownership, ',', @user2id) WHERE id = @fileId";
            string selectSql = "SELECT id, folder_path FROM maxhanna.file_uploads WHERE id = @fileId";

            try
            {
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();

                    // Find the file's path
                    string? filePath = null;
                    using (var selectCmd = new MySqlCommand(selectSql, conn))
                    {
                        selectCmd.Parameters.AddWithValue("@fileId", fileId);
                        using (var reader = await selectCmd.ExecuteReaderAsync())
                        {
                            if (await reader.ReadAsync())
                            {
                                filePath = reader["folder_path"].ToString();
                            }
                        }
                    }

                    if (filePath == null)
                    {
                        _logger.LogInformation("Returned 500: File path not found");
                        return StatusCode(500, "File path not found");
                    }

                    // List to keep track of all ids to be updated
                    List<int> idsToUpdate = new List<int> { fileId };

                    // Find all parent directories
                    while (!string.IsNullOrEmpty(filePath))
                    {
                        _logger.LogInformation($"LOG::: folderPath: {filePath}");

                        string parentPath = (Path.GetDirectoryName(filePath.TrimEnd('/').Replace("\\", "/")) ?? "").Replace("\\", "/");
                        if (!parentPath.EndsWith("/"))
                        {
                            parentPath += "/";
                        }
                        string folderName = Path.GetFileName(filePath.TrimEnd('/'));

                        _logger.LogInformation($"LOG::: parentPath: {parentPath}");
                        _logger.LogInformation($"LOG::: folderName: {folderName}");

                        if (string.IsNullOrEmpty(parentPath))
                        {
                            break;
                        }

                        using (var selectParentCmd = new MySqlCommand("SELECT id FROM maxhanna.file_uploads WHERE folder_path = @parentPath AND file_name = @folderName AND is_folder = 1", conn))
                        {
                            selectParentCmd.Parameters.AddWithValue("@parentPath", parentPath);
                            selectParentCmd.Parameters.AddWithValue("@folderName", folderName);

                            using (var reader = await selectParentCmd.ExecuteReaderAsync())
                            {
                                if (await reader.ReadAsync())
                                {
                                    idsToUpdate.Add(reader.GetInt32("id"));
                                    filePath = parentPath;
                                }
                                else
                                {
                                    break;
                                }
                            }
                        }
                    }

                    // Update all relevant records
                    foreach (var id in idsToUpdate)
                    {
                        using (var updateCmd = new MySqlCommand(updateSql, conn))
                        {
                            updateCmd.Parameters.AddWithValue("@user2id", request.User2.Id);
                            updateCmd.Parameters.AddWithValue("@fileId", id);
                            await updateCmd.ExecuteNonQueryAsync();
                        }
                    }

                    _logger.LogInformation("Returned OK");
                    return Ok();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while sharing the file.");
                return StatusCode(500, "An error occurred while sharing the file.");
            }
        }


        private async Task UpdateFilePathInDatabase(string oldFilePath, string newFilePath)
        {

            using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await connection.OpenAsync();

                // Ensure folder paths are standardized (replace backslashes with forward slashes)
                string oldFolderPath = (Path.GetDirectoryName(oldFilePath) ?? "").Replace("\\", "/");
                if (!oldFolderPath.EndsWith("/"))
                {
                    oldFolderPath += "/";
                }
                string newFolderPath = (Path.GetDirectoryName(newFilePath) ?? "").Replace("\\", "/");
                if (!newFolderPath.EndsWith("/"))
                {
                    newFolderPath += "/";
                }
                string fileName = Path.GetFileName(oldFilePath);

                _logger.LogInformation($"Update FilePath in database: oldFolderPath: {oldFolderPath}; newFolderPath: {newFolderPath}; fileName: {fileName}");


                var command = new MySqlCommand(
                    "UPDATE maxhanna.file_uploads SET folder_path = @newFolderPath WHERE folder_path = @oldFolderPath AND file_name = @fileName", connection);
                command.Parameters.AddWithValue("@newFolderPath", newFolderPath);
                command.Parameters.AddWithValue("@oldFolderPath", oldFolderPath);
                command.Parameters.AddWithValue("@fileName", fileName);

                await command.ExecuteNonQueryAsync();
            }
        }

        private async Task UpdateDirectoryPathInDatabase(string oldDirectoryPath, string newDirectoryPath)
        {
            _logger.LogInformation($"UpdateDirectoryPathInDatabase: oldDirectoryPath: {oldDirectoryPath}; newDirectoryPath: {newDirectoryPath}");

            using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await connection.OpenAsync();

                // Ensure folder paths are standardized (replace backslashes with forward slashes)
                string standardizedOldPath = Path.GetDirectoryName(oldDirectoryPath)!.Replace("\\", "/");
                if (!standardizedOldPath.EndsWith("/"))
                {
                    standardizedOldPath += "/";
                }

                string standardizedNewPath = newDirectoryPath.Replace("\\", "/");
                if (!standardizedNewPath.EndsWith("/"))
                {
                    standardizedNewPath += "/";
                }

                // Update paths for all files within the directory
                var command = new MySqlCommand(
                    "UPDATE maxhanna.file_uploads SET folder_path = REPLACE(folder_path, @standardOldFolderPath, @newFolderPath) " +
                    "WHERE folder_path LIKE CONCAT(@oldFolderPath, '%')", connection);
                command.Parameters.AddWithValue("@standardOldFolderPath", standardizedOldPath);
                command.Parameters.AddWithValue("@oldFolderPath", oldDirectoryPath);
                command.Parameters.AddWithValue("@newFolderPath", standardizedNewPath);

                await command.ExecuteNonQueryAsync();

                string fileName = Path.GetFileName(oldDirectoryPath)!;
                _logger.LogInformation($"UpdateDirectoryPathInDatabase: standardizedOldPath: {standardizedOldPath}; standardizedNewPath: {standardizedNewPath}; fileName: {fileName}");

                command = new MySqlCommand(
                   "UPDATE maxhanna.file_uploads SET folder_path = @newFolderPath " +
                   "WHERE folder_path  = @oldFolderPath AND file_name = @fileName;", connection);
                command.Parameters.AddWithValue("@oldFolderPath", standardizedOldPath);
                command.Parameters.AddWithValue("@newFolderPath", standardizedNewPath);
                command.Parameters.AddWithValue("@fileName", fileName);

                await command.ExecuteNonQueryAsync();
            }
        }


        [HttpPost("/File/Batch/", Name = "ExecuteBatch")]
        public IActionResult ExecuteBatch([FromBody] User user, [FromQuery] string? inputFile)
        {
            _logger.LogInformation($"POST /File/Batch (inputFile = {inputFile})");
            string result = "";
            try
            {
                Process p = new Process();
                p.StartInfo.UseShellExecute = false;
                p.StartInfo.RedirectStandardOutput = true;
                p.StartInfo.FileName = "E:/Uploads/hello_world.bat";
                p.Start();
                result = p.StandardOutput.ReadToEnd();
                p.WaitForExit();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while executing BAT file.");
                return StatusCode(500, "An error occurred while executing BAT file.");
            }
            return Ok(result);
        }

        private void MoveDirectory(string sourceDirectory, string destinationDirectory)
        {
            string directoryName = new DirectoryInfo(sourceDirectory).Name;
            string newDirectoryPath = Path.Combine(destinationDirectory, directoryName);
            Directory.Move(sourceDirectory, newDirectoryPath);
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
