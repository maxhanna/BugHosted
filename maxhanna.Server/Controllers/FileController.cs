using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using System.Diagnostics;
using System.Net;
using MySqlConnector;
using Microsoft.AspNetCore.Components.Forms;
using System.IO;
using System.Xml.Linq;
using static System.Net.WebRequestMethods;
using System.Runtime.Intrinsics.Arm;
using Microsoft.VisualBasic.FileIO;
using static System.Net.Mime.MediaTypeNames;
using Xabe.FFmpeg;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Formats.Webp;
using Microsoft.Extensions.Logging;

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
            FFmpeg.SetExecutablesPath("E:\\ffmpeg-latest-win64-static\\bin"); // Windows
        }

        [HttpPost("/File/GetDirectory/", Name = "GetDirectory")]
        public IActionResult GetDirectory([FromBody] User? user, [FromQuery] string? directory,
          [FromQuery] string? visibility, [FromQuery] string? ownership, [FromQuery] string? search,
          [FromQuery] int page = 1, [FromQuery] int pageSize = 10, [FromQuery] int? fileId = null, [FromQuery] List<string>? fileType = null)
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
            _logger.LogInformation(
                @$"POST /File/GetDirectory?directory={directory}&visibility={visibility}
         &ownership={ownership}&search={search}&page={page}
         &pageSize={pageSize}&fileId={fileId}&fileType={(fileType != null ? string.Join(", ", fileType) : "")}");

            if (!ValidatePath(directory!)) { return StatusCode(500, $"Must be within {baseTarget}"); }

            try
            {
                List<FileEntry> fileEntries = new List<FileEntry>();
                string replaced = "'" + string.Join(", ", fileType!).Replace(",", "','") + "'";
                string fileTypeCondition = fileType != null && fileType.Any() && !string.IsNullOrEmpty(string.Join(',', fileType))
                        ? " AND LOWER(f.file_type) IN (" + string.Join(", ", replaced) + ") "
                        : "";
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    connection.Open();
                    int offset = (page - 1) * pageSize;
                    bool doOrder = true;

                    if (fileId.HasValue && page == 1)
                    {
                        _logger.LogInformation($"fetching specific fileId's: {fileId} folder path");
                        doOrder = false;
                        // Fetch directory path associated with fileId
                        var directoryCommand = new MySqlCommand(
                            "SELECT folder_path FROM maxhanna.file_uploads WHERE id = @fileId",
                            connection);
                        directoryCommand.Parameters.AddWithValue("@fileId", fileId.Value);
                        var directoryReader = directoryCommand.ExecuteReader();

                        if (directoryReader.Read())
                        {
                            directory = directoryReader.GetString("folder_path");
                        }

                        directoryReader.Close();

                        var countCommand = new MySqlCommand(
                            @$"SELECT 
                         COUNT(*) 
                     FROM 
                         maxhanna.file_uploads f 
                     WHERE 
                         f.folder_path = @folderPath 
                         AND f.id <= @fileId 
                         {fileTypeCondition}",
                         connection);
                        countCommand.Parameters.AddWithValue("@folderPath", directory);
                        countCommand.Parameters.AddWithValue("@fileId", fileId.Value);

                        int filePosition = Convert.ToInt32(countCommand.ExecuteScalar());
                        page = (filePosition / pageSize) + 1;
                        offset = (page - 1) * pageSize;
                    }

                    _logger.LogInformation($"setting page:{page}&offset={offset}");

                    var command = new MySqlCommand($@"
                SELECT 
                    f.id AS fileId,
                    MAX(f.file_name) AS file_name,
                    MAX(f.folder_path) AS folder_path,
                    MAX(f.is_public) AS is_public,
                    MAX(f.is_folder) AS is_folder,
                    MAX(f.user_id) AS fileUserId,
                    MAX(u.username) AS fileUsername,
                    MAX(f.shared_with) AS shared_with,
                    SUM(CASE WHEN fv.upvote = 1 THEN 1 ELSE 0 END) AS fileUpvotes,
                    SUM(CASE WHEN fv.downvote = 1 THEN 1 ELSE 0 END) AS fileDownvotes,
                    MAX(f.upload_date) AS date,
                    fc.id AS commentId,
                    fc.user_id AS commentUserId,
                    MAX(uc.username) AS commentUsername,
                    MAX(fc.comment) AS commentText,
                    SUM(CASE WHEN fcv.upvote = 1 THEN 1 ELSE 0 END) AS commentUpvotes,
                    SUM(CASE WHEN fcv.downvote = 1 THEN 1 ELSE 0 END) AS commentDownvotes,
                    fd.given_file_name,
                    fd.description,
                    fd.last_updated AS file_data_updated,
                    f.file_type AS file_type,
                    f.file_size AS file_size,
                    cf.file_id AS commentFileId,
                    cf2.file_name AS commentFileName,
                    cf2.folder_path AS commentFileFolderPath,
                    cf2.is_public AS commentFileIsPublic,
                    cf2.is_folder AS commentFileIsFolder,
                    cf2.user_id AS commentFileUserId,
                    cfu2.username AS commentFileUsername,
                    cf2.file_type AS commentFileType,
                    cf2.file_size AS commentFileSize,
                    cf2.upload_date AS commentFileDate
                FROM
                    maxhanna.file_uploads f
                LEFT JOIN
                    maxhanna.file_votes fv ON f.id = fv.file_id
                LEFT JOIN
                    maxhanna.file_data fd ON f.id = fd.file_id
                LEFT JOIN
                    maxhanna.comments fc ON f.id = fc.file_id
                LEFT JOIN
                    maxhanna.users u ON f.user_id = u.id
                LEFT JOIN
                    maxhanna.users uc ON fc.user_id = uc.id
                LEFT JOIN
                    maxhanna.comment_votes fcv ON fc.id = fcv.comment_id
                LEFT JOIN
                    maxhanna.comment_files cf ON fc.id = cf.comment_id
                LEFT JOIN
                    maxhanna.file_uploads cf2 ON cf.file_id = cf2.id
                LEFT JOIN 
                    maxhanna.users cfu2 on cfu2.id = cf2.user_id
                WHERE
                    f.folder_path = @folderPath
                    AND (
                        f.is_public = 1
                        OR f.user_id = @userId
                        OR FIND_IN_SET(@userId, f.shared_with) > 0
                    )
                    {(string.IsNullOrEmpty(search) ? "" : "AND (f.file_name LIKE @search OR fd.given_file_name LIKE @search)")}
                    {fileTypeCondition}
                GROUP BY
                    f.id, fc.id, fd.given_file_name, fd.description, fd.last_Updated, f.file_type, f.file_size, cf.file_id,
                    cf2.file_name, cf2.folder_path, cf2.is_public, cf2.is_folder, cf2.user_id, cfu2.username, cf2.file_type,
                    cf2.file_size, cf2.upload_date 
                {(!doOrder ? "" : " ORDER BY f.id desc ")}
                LIMIT
                    @pageSize OFFSET @offset
            ", connection);
                    command.Parameters.AddWithValue("@folderPath", directory);
                    command.Parameters.AddWithValue("@userId", user?.Id ?? 0);
                    command.Parameters.AddWithValue("@pageSize", pageSize);
                    command.Parameters.AddWithValue("@offset", offset);
                    command.Parameters.AddWithValue("@fileId", fileId);
                    if (!string.IsNullOrEmpty(search))
                    {
                        command.Parameters.AddWithValue("@search", "%" + search + "%"); // Add search parameter
                    }

                    using (var reader = command.ExecuteReader())
                    {
                        int previousFileId = -1;
                        FileEntry? currentFileEntry = null;
                        Dictionary<int, FileComment> commentDictionary = new Dictionary<int, FileComment>();

                        while (reader.Read())
                        {
                            var fileIdValue = reader.GetInt32("fileId");

                            if (fileIdValue != previousFileId)
                            {
                                if (currentFileEntry != null)
                                {
                                    fileEntries.Add(currentFileEntry);
                                }

                                var fileName = reader.GetString("file_name");
                                var folderPath = reader.GetString("folder_path");
                                var isPublic = reader.GetBoolean("is_public");
                                var fileUserId = reader.GetInt32("fileUserId");
                                var fileUsername = reader.GetString("fileUsername");
                                var sharedWith = reader.IsDBNull(reader.GetOrdinal("shared_with")) ? string.Empty : reader.GetString("shared_with");
                                var isFolder = reader.GetBoolean("is_folder");
                                var fileUpvotes = reader.GetInt32("fileUpvotes");
                                var fileDownvotes = reader.GetInt32("fileDownvotes");
                                var date = reader.GetDateTime("date");
                                var fileTypeValue = reader.IsDBNull(reader.GetOrdinal("file_type")) ? null : reader.GetString("file_type");
                                var fileSizeValue = reader.GetInt32("file_size");

                                FileData fileData = new FileData();
                                fileData.FileId = reader.IsDBNull(reader.GetOrdinal("fileId")) ? 0 : reader.GetInt32("fileId");
                                fileData.GivenFileName = reader.IsDBNull(reader.GetOrdinal("given_file_name")) ? null : reader.GetString("given_file_name");
                                fileData.Description = reader.IsDBNull(reader.GetOrdinal("description")) ? null : reader.GetString("description");
                                fileData.LastUpdated = reader.IsDBNull(reader.GetOrdinal("file_data_updated")) ? null : reader.GetDateTime("file_data_updated");

                                bool matchesVisibility = (visibility == "public" && isPublic) || (visibility == "private" && !isPublic) || visibility == "all";
                                bool matchesOwnership = (ownership == "own" && sharedWith.Contains(user?.Id.ToString() ?? "")) || (ownership == "others" && fileUserId != user?.Id) || (ownership == "all");

                                if (matchesVisibility && matchesOwnership)
                                {
                                    currentFileEntry = new FileEntry();
                                    currentFileEntry.Id = fileIdValue;
                                    currentFileEntry.FileName = fileName;
                                    currentFileEntry.Directory = string.IsNullOrEmpty(folderPath) ? baseTarget : folderPath;
                                    currentFileEntry.Visibility = isPublic ? "Public" : "Private";
                                    currentFileEntry.SharedWith = sharedWith;
                                    currentFileEntry.User = new User(fileUserId, fileUsername);
                                    currentFileEntry.IsFolder = isFolder;
                                    currentFileEntry.Upvotes = fileUpvotes;
                                    currentFileEntry.Downvotes = fileDownvotes;
                                    currentFileEntry.FileComments = new List<FileComment>();
                                    currentFileEntry.Date = date;
                                    currentFileEntry.FileData = fileData;
                                    currentFileEntry.FileType = fileTypeValue;
                                    currentFileEntry.FileSize = fileSizeValue;
                                }
                                previousFileId = fileIdValue;
                            }

                            if (currentFileEntry != null && !reader.IsDBNull(reader.GetOrdinal("commentId")))
                            {
                                var commentId = reader.GetInt32("commentId");

                                FileComment fileComment;
                                if (!commentDictionary.TryGetValue(commentId, out fileComment))
                                {
                                    var commentUserId = reader.GetInt32("commentUserId");
                                    var commentUsername = reader.GetString("commentUsername");
                                    var commentText = reader.GetString("commentText");
                                    var commentUpvotes = reader.GetInt32("commentUpvotes");
                                    var commentDownvotes = reader.GetInt32("commentDownvotes");

                                    fileComment = new FileComment
                                    {
                                        Id = commentId,
                                        FileId = fileIdValue,
                                        User = new User(commentUserId, commentUsername),
                                        CommentText = commentText,
                                        Upvotes = commentUpvotes,
                                        Downvotes = commentDownvotes
                                    };

                                    commentDictionary[commentId] = fileComment;
                                    currentFileEntry.FileComments!.Add(fileComment);
                                }

                                if (!reader.IsDBNull(reader.GetOrdinal("commentFileId")))
                                {
                                    var commentFileId = reader.GetInt32("commentFileId");
                                    var commentFileName = reader.GetString("commentFileName");
                                    var commentFileFolderPath = reader.GetString("commentFileFolderPath");
                                    var commentFileIsPublic = reader.GetBoolean("commentFileIsPublic");
                                    var commentFileIsFolder = reader.GetBoolean("commentFileIsFolder");
                                    var commentFileUserId = reader.GetInt32("commentFileUserId");
                                    var commentFileUserName = reader.GetString("commentFileUsername");
                                    var commentFileType = reader.IsDBNull(reader.GetOrdinal("commentFileType")) ? null : reader.GetString("commentFileType");
                                    var commentFileSize = reader.GetInt32("commentFileSize");
                                    var commentFileDate = reader.GetDateTime("commentFileDate");

                                    var commentFileEntry = new FileEntry
                                    {
                                        Id = commentFileId,
                                        FileName = commentFileName,
                                        Directory = commentFileFolderPath,
                                        Visibility = commentFileIsPublic ? "Public" : "Private",
                                        IsFolder = commentFileIsFolder,
                                        User = new User(commentFileUserId, commentFileUserName),
                                        FileType = commentFileType,
                                        FileSize = commentFileSize,
                                        Date = commentFileDate
                                    };

                                    fileComment.CommentFiles.Add(commentFileEntry);
                                }
                            }
                        }

                        if (currentFileEntry != null)
                        {
                            fileEntries.Add(currentFileEntry);
                        }
                    }

                    // Get the total count of files for pagination
                    var totalCountCommand = new MySqlCommand(
                        $@"SELECT 
                     COUNT(*) 
                 FROM 
                     maxhanna.file_uploads f 
                 LEFT JOIN 
                     maxhanna.file_data fd ON fd.file_id = f.id
                 WHERE 
                     f.folder_path = @folderPath 
                     AND ( 
                         f.is_public = 1 OR 
                         f.user_id = @userId OR 
                         FIND_IN_SET(@userId, f.shared_with) > 0
                     ) 
                     {(string.IsNullOrEmpty(search) ? "" : " AND f.file_name LIKE @search OR fd.given_file_name LIKE @search ")}
                     {fileTypeCondition}"
                     , connection);
                    totalCountCommand.Parameters.AddWithValue("@folderPath", directory);
                    totalCountCommand.Parameters.AddWithValue("@userId", user?.Id ?? 0);
                    if (!string.IsNullOrEmpty(search))
                    {
                        totalCountCommand.Parameters.AddWithValue("@search", "%" + search + "%"); // Add search parameter
                    }
                    //_logger.LogInformation("total count sql : " + totalCountCommand.CommandText);
                    int totalCount = Convert.ToInt32(totalCountCommand.ExecuteScalar());
                    var result = new
                    {
                        TotalCount = totalCount,
                        CurrentDirectory = directory.Replace(baseTarget, ""),
                        Page = page,
                        PageSize = pageSize,
                        Data = fileEntries
                    };

                    return Ok(result);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while listing files.");
                return StatusCode(500, "An error occurred while listing files.");
            }
        }

        [HttpPost("/File/UpdateFileData", Name = "UpdateFileData")]
        public async Task<IActionResult> UpdateFileData([FromBody] FileDataRequest request)
        {
            _logger.LogInformation($"POST /File/UpdateFileData (Updating data for file: {request.FileData.FileId}  user: {request.User?.Id})");

            try
            {
                using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await connection.OpenAsync();

                    var command = new MySqlCommand($@"
                        INSERT INTO file_data 
                            (file_id, given_file_name, description, last_updated_by_user_id) 
                        VALUES 
                            (@file_id, @given_file_name, @description, @last_updated_by_user_id) 
                        ON DUPLICATE KEY UPDATE 
                            given_file_name = @given_file_name, 
                            description = @description,
                            last_updated_by_user_id = @last_updated_by_user_id"
                    , connection);
                    command.Parameters.AddWithValue("@given_file_name", request.FileData.GivenFileName);
                    command.Parameters.AddWithValue("@last_updated_by_user_id", request.User!.Id);
                    command.Parameters.AddWithValue("@file_id", request.FileData.FileId);
                    command.Parameters.AddWithValue("@description", request.FileData.Description);

                    await command.ExecuteNonQueryAsync();
                }

                return Ok("Filedata added successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while updating the Filedata.");
                return StatusCode(500, "An error occurred while updating the Filedata.");
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
        public IActionResult GetFile([FromBody] User? user, string filePath)
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
                _logger.LogInformation("returning file : " + filePath);
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
                           "(user_id, upload_date, file_name, folder_path, is_public, is_folder) " +
                           "VALUES (@user_id, @uploadDate, @fileName, @folderPath, @isPublic, @isFolder);" +
                           "SELECT LAST_INSERT_ID();",
                           connection,
                           transaction);

                        insertCommand.Parameters.AddWithValue("@user_id", request.user.Id);
                        insertCommand.Parameters.AddWithValue("@uploadDate", uploadDate);
                        insertCommand.Parameters.AddWithValue("@fileName", fileName);
                        insertCommand.Parameters.AddWithValue("@folderPath", directoryName);
                        insertCommand.Parameters.AddWithValue("@isPublic", request.isPublic);
                        insertCommand.Parameters.AddWithValue("@isFolder", 1);

                        int id = 0;
                        object? result = await insertCommand.ExecuteScalarAsync();
                        if (result != null)
                        {
                            id = Convert.ToInt32(result);
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
            List<FileEntry> uploaded = new List<FileEntry>();
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

                    var conflictingFile = await GetConflictingFile(user?.Id ?? 0, file, uploadDirectory, isPublic);
                    if (conflictingFile != null)
                    {
                        _logger.LogError("Cannot upload duplicate files.");
                        uploaded.Add(conflictingFile);
                    }
                    else
                    {
                        if (!Directory.Exists(uploadDirectory))
                        {
                            Directory.CreateDirectory(uploadDirectory);
                            await InsertDirectoryMetadata(user, filePath, isPublic);
                        }

                        // Check file type and convert if necessary
                        var convertedFilePath = filePath;
                        if (IsGifFile(file))
                        {
                            convertedFilePath = await ConvertGifToWebp(file, uploadDirectory);

                        }
                        else if (IsImageFile(file))
                        {
                            convertedFilePath = await ConvertImageToWebp(file, uploadDirectory);
                        }
                        else if (IsVideoFile(file))
                        {
                            convertedFilePath = await ConvertVideoToWebm(file, uploadDirectory);
                        }
                        else
                        {
                            using (var stream = new FileStream(filePath, FileMode.Create))
                            {
                                await file.CopyToAsync(stream);
                            }
                        }

                        var fileId = await InsertFileMetadata(user, file, uploadDirectory, isPublic, convertedFilePath);
                        var fileEntry = CreateFileEntry(file, user, isPublic, fileId, convertedFilePath);
                        uploaded.Add(fileEntry);

                        _logger.LogInformation($"Uploaded file: {file.FileName}, Size: {file.Length} bytes, Path: {convertedFilePath}");
                    }
                }

                return Ok(uploaded);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while uploading files.");
                return StatusCode(500, "An error occurred while uploading files.");
            }
        }

        private bool IsImageFile(IFormFile file)
        {
            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".bmp", ".gif" };
            var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
            return allowedExtensions.Contains(fileExtension);
        }
        private bool IsGifFile(IFormFile file)
        {
            var allowedExtensions = new[] { ".gif" };
            var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
            return allowedExtensions.Contains(fileExtension);
        }

        private bool IsVideoFile(IFormFile file)
        {
            var allowedExtensions = new[] { ".mp4", ".avi", ".mov", ".wmv", ".flv", ".mkv" };
            var fileExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
            return allowedExtensions.Contains(fileExtension);
        }
        private async Task<string> ConvertGifToWebp(IFormFile file, string uploadDirectory)
        {
            var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
            var convertedFileName = $"{fileNameWithoutExtension}.webp";
            var convertedFilePath = Path.Combine(uploadDirectory, convertedFileName);
            _logger.LogInformation($"After converting GIF, got fileName :{convertedFileName} filepath:{convertedFilePath} ");
            var inputFilePath = Path.Combine(uploadDirectory, file.FileName);

            await Task.Run(async () =>
            {
                try
                {
                    using (var stream = new FileStream(inputFilePath, FileMode.Create))
                    {
                        await file.CopyToAsync(stream);
                    }
                    var conversion = FFmpeg.Conversions.New()
                        .AddParameter($"-i \"{inputFilePath}\"")
                        .AddParameter("-c:v libwebp")
                        .AddParameter("-lossless 0")
                        .AddParameter("-q:v 75")
                        .AddParameter("-loop 0")
                        .SetOutput(convertedFilePath);

                    await conversion.Start();
                    _logger.LogInformation("Finished converting GIF to WebP");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred during GIF conversion.");
                }
                finally
                {
                    System.IO.File.Delete(inputFilePath); // Remove the original file after conversion
                }
            });

            return convertedFilePath;
        }
        private async Task<string> ConvertImageToWebp(IFormFile file, string uploadDirectory)
        {
            var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
            var convertedFileName = $"{fileNameWithoutExtension}.webp";
            var convertedFilePath = Path.Combine(uploadDirectory, convertedFileName);
            await Task.Run(async () =>
            {
                try
                {
                    using (var image = await SixLabors.ImageSharp.Image.LoadAsync(file.OpenReadStream()))
                    {
                        await image.SaveAsWebpAsync(convertedFilePath);
                        _logger.LogInformation("Finished converting image to WebP"); 
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred during photo conversion.");
                } 
            });

            return convertedFilePath;
        }

        private async Task<string> ConvertVideoToWebm(IFormFile file, string uploadDirectory)
        {
            var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
            var convertedFileName = $"{fileNameWithoutExtension}.webm";
            var convertedFilePath = Path.Combine(uploadDirectory, convertedFileName);
            _logger.LogInformation($"After converting video, got fileName :{convertedFileName} filepath:{convertedFilePath} ");
            var inputFilePath = Path.Combine(uploadDirectory, file.FileName);

            await Task.Run(async () =>
            {
                try
                {
                    using (var stream = new FileStream(inputFilePath, FileMode.Create))
                    {
                        await file.CopyToAsync(stream);
                    }
                    var res = await FFmpeg.Conversions.FromSnippet.ToWebM(inputFilePath, convertedFilePath);
                    await res.Start();
                    _logger.LogInformation($"Finished converting {fileNameWithoutExtension} to WebM.");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred during video conversion.");
                }
                finally
                {
                    System.IO.File.Delete(inputFilePath); // Remove the original file after conversion
                }
            });
            return convertedFilePath;
        }

        private async Task InsertDirectoryMetadata(User user, string directoryPath, bool isPublic)
        {
            using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await connection.OpenAsync();
                var directoryName = (Path.GetFileName(Path.GetDirectoryName(directoryPath.TrimEnd('/'))) ?? "").Replace("\\", "/");
                var directoryPathTrimmed = (Path.GetDirectoryName(directoryPath.TrimEnd('/')) ?? "").Replace("\\", "/").TrimEnd('/') + '/';
                var command = new MySqlCommand(
                    @$"INSERT INTO maxhanna.file_uploads 
                    (user_id, file_name, upload_date, folder_path, is_public, is_folder, file_size) 
                VALUES 
                    (@user_id, @fileName, @uploadDate, @folderPath, @isPublic, @isFolder, @file_size);"
                , connection);
                command.Parameters.AddWithValue("@user_id", user?.Id ?? 0);
                command.Parameters.AddWithValue("@fileName", directoryName);
                command.Parameters.AddWithValue("@uploadDate", DateTime.UtcNow);
                command.Parameters.AddWithValue("@folderPath", directoryPathTrimmed);
                command.Parameters.AddWithValue("@isPublic", isPublic);
                command.Parameters.AddWithValue("@isFolder", true);
                command.Parameters.AddWithValue("@file_size", 0);

                await command.ExecuteScalarAsync();
                _logger.LogInformation($"Uploaded folder: {directoryName}, Path: {directoryPath}");
            }
        }

        private async Task<int> InsertFileMetadata(User user, IFormFile file, string uploadDirectory, bool isPublic, string convertedFilePath)
        {
            using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await connection.OpenAsync();

                var command = new MySqlCommand(
                    @$"INSERT INTO maxhanna.file_uploads 
                    (user_id, file_name, upload_date, folder_path, is_public, is_folder, file_size)  
                VALUES 
                    (@user_id, @fileName, @uploadDate, @folderPath, @isPublic, @isFolder, @file_size); 
                SELECT LAST_INSERT_ID();", connection);
                command.Parameters.AddWithValue("@user_id", user?.Id ?? 0);
                command.Parameters.AddWithValue("@fileName", Path.GetFileName(convertedFilePath));
                command.Parameters.AddWithValue("@uploadDate", DateTime.UtcNow);
                command.Parameters.AddWithValue("@folderPath", uploadDirectory ?? "");
                command.Parameters.AddWithValue("@isPublic", isPublic);
                command.Parameters.AddWithValue("@isFolder", false);
                command.Parameters.AddWithValue("@file_size", new FileInfo(convertedFilePath).Length);

                var fileId = await command.ExecuteScalarAsync();
                return Convert.ToInt32(fileId);
            }
        }

        private FileEntry CreateFileEntry(IFormFile file, User user, bool isPublic, int fileId, string filePath)
        {
            return new FileEntry
            {
                Id = fileId,
                FileName = Path.GetFileName(filePath),
                Visibility = isPublic ? "Public" : "Private",
                User = user ?? new User(0, "Anonymous"),
                IsFolder = false,
                Upvotes = 0,
                Downvotes = 0,
                FileComments = new List<FileComment>(),
                Date = DateTime.UtcNow,
                SharedWith = string.Empty,
                FileType = Path.GetExtension(filePath).TrimStart('.'),
                FileSize = (int)new FileInfo(filePath).Length
            };
        }
        private async Task<FileEntry?> GetConflictingFile(int userId, Microsoft.AspNetCore.Http.IFormFile file, string folderPath, bool isPublic)
        {
            var convertedFileName = "";
            if (IsImageFile(file))
            {
                var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
                convertedFileName = $"{fileNameWithoutExtension}.webp";
            } 
            else if (IsVideoFile(file))
            {
                var fileNameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
                convertedFileName = $"{fileNameWithoutExtension}.webm";
            }

            _logger.LogInformation("Checking for duplicated files : " + (!string.IsNullOrEmpty(convertedFileName) ? convertedFileName : file.FileName));

            using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
            {
                await connection.OpenAsync();

                var command = new MySqlCommand(
                    @"SELECT 
                f.id AS fileId, 
                f.file_name, 
                f.is_public, 
                f.is_folder, 
                f.user_id, 
                u.username AS username, 
                f.shared_with, 
                SUM(CASE WHEN fv.upvote = 1 THEN 1 ELSE 0 END) AS upvotes, 
                SUM(CASE WHEN fv.downvote = 1 THEN 1 ELSE 0 END) AS downvotes, 
                f.upload_date AS date, 
                fc.id AS commentId, 
                fc.user_id AS commentUserId, 
                uc.username AS commentUsername, 
                fc.comment AS commentText, 
                SUM(CASE WHEN fcv.upvote = 1 THEN 1 ELSE 0 END) AS commentUpvotes, 
                SUM(CASE WHEN fcv.downvote = 1 THEN 1 ELSE 0 END) AS commentDownvotes,
                fd.given_file_name,
                fd.description,
                fd.last_updated as file_data_updated
            FROM 
                maxhanna.file_uploads f 
            LEFT JOIN 
                maxhanna.file_votes fv ON f.id = fv.file_id 
            LEFT JOIN 
                maxhanna.file_data fd ON f.id = fd.file_id 
            LEFT JOIN 
                maxhanna.comments fc ON fc.file_id = f.id 
            LEFT JOIN 
                maxhanna.users u ON u.id = f.user_id 
            LEFT JOIN 
                maxhanna.users uc ON fc.user_id = uc.id 
            LEFT JOIN 
                maxhanna.comment_votes fcv ON fc.id = fcv.comment_id 
            WHERE 
                f.file_name = @fileName 
                AND f.folder_path = @folderPath 
                AND (
                    f.is_public = @isPublic OR 
                    f.user_id = @userId OR 
                    FIND_IN_SET(@userId, f.shared_with) > 0
                ) 
            GROUP BY 
                f.id, u.username, f.file_name, fc.id, uc.username, fc.comment, fd.given_file_name, fd.description, fd.last_updated 
            LIMIT 1;",
                    connection);

                command.Parameters.AddWithValue("@userId", userId);
                command.Parameters.AddWithValue("@fileName", !string.IsNullOrEmpty(convertedFileName) ? convertedFileName : file.FileName);
                command.Parameters.AddWithValue("@folderPath", folderPath);
                command.Parameters.AddWithValue("@isPublic", isPublic);

                using (var reader = await command.ExecuteReaderAsync())
                {
                    if (await reader.ReadAsync())
                    {
                        var id = reader.GetInt32("fileId");
                        var user_id = reader.GetInt32("user_id");
                        var userName = reader.GetString("username");
                        var shared_with = reader.IsDBNull(reader.GetOrdinal("shared_with")) ? string.Empty : reader.GetString("shared_with");
                        var isFolder = reader.GetBoolean("is_folder");
                        var upvotes = reader.GetInt32("upvotes");
                        var downvotes = reader.GetInt32("downvotes");
                        var date = reader.GetDateTime("date");
                        var fileData = new FileData();
                        fileData.FileId = reader.IsDBNull(reader.GetOrdinal("fileId")) ? 0 : reader.GetInt32("fileId");
                        fileData.GivenFileName = reader.IsDBNull(reader.GetOrdinal("given_file_name")) ? null : reader.GetString("given_file_name");
                        fileData.Description = reader.IsDBNull(reader.GetOrdinal("description")) ? null : reader.GetString("description");
                        fileData.LastUpdated = reader.IsDBNull(reader.GetOrdinal("file_data_updated")) ? null : reader.GetDateTime("file_data_updated");


                        var fileEntry = new FileEntry();
                        fileEntry.Id = id;
                        fileEntry.FileName = !string.IsNullOrEmpty(convertedFileName) ? convertedFileName : file.FileName;
                        fileEntry.Visibility = isPublic ? "Public" : "Private";
                        fileEntry.SharedWith = shared_with;
                        fileEntry.User = new User(user_id, userName);
                        fileEntry.IsFolder = isFolder;
                        fileEntry.Upvotes = upvotes;
                        fileEntry.Downvotes = downvotes;
                        fileEntry.FileComments = new List<FileComment>();
                        fileEntry.Date = date;
                        fileEntry.FileData = fileData;


                        if (!reader.IsDBNull(reader.GetOrdinal("commentId")))
                        {
                            do
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
                                    FileId = id,
                                    User = new User(commentUserId, commentUsername ?? "Anonymous"),
                                    CommentText = commentText,
                                    Upvotes = commentUpvotes,
                                    Downvotes = commentDownvotes
                                };

                                fileEntry.FileComments!.Add(fileComment);
                            } while (await reader.ReadAsync());
                        }

                        return fileEntry;
                    }
                }
            }
            return null;
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
                        "SELECT user_id, file_name, folder_path, is_folder, shared_with FROM maxhanna.file_uploads WHERE id = @fileId",
                        connection);
                    ownershipCommand.Parameters.AddWithValue("@fileId", request.file.Id);

                    var ownershipReader = ownershipCommand.ExecuteReader();
                    if (!ownershipReader.Read())
                    {
                        _logger.LogError($"File or directory with id {request.file.Id} not found.");
                        return NotFound("File or directory not found.");
                    }

                    var userId = ownershipReader.GetInt32("user_id");
                    var sharedWith = ownershipReader.IsDBNull(ownershipReader.GetOrdinal("shared_with")) ? string.Empty : ownershipReader.GetString("shared_with");

                    if (!sharedWith.Split(',').Contains(request.user.Id.ToString()) && userId != request.user.Id)
                    {
                        _logger.LogError($"User {request.user.Id} does not have ownership of {request.file.FileName}");
                        return StatusCode(409, "You do not have permission to delete this file or directory.");
                    }

                    var fileName = ownershipReader.GetString("file_name");
                    var folderPath = ownershipReader.GetString("folder_path").Replace("\\", "/").TrimEnd('/') + "/";
                    var isFolder = ownershipReader.GetBoolean("is_folder");

                    filePath = Path.Combine(baseTarget, folderPath, fileName).Replace("\\", "/");
                    ownershipReader.Close();

                    if (!ValidatePath(filePath)) { return BadRequest($"Cannot delete: {filePath}"); }


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

            string updateSql = @"
                UPDATE maxhanna.file_uploads 
                SET shared_with = 
                    CASE 
                        WHEN shared_with IS NULL OR shared_with = '' THEN @user2id
                        ELSE CONCAT(shared_with, ',', @user2id) 
                    END 
                WHERE id = @fileId 
                AND (
                    shared_with IS NULL 
                    OR NOT FIND_IN_SET(@user2id, shared_with)
                )";

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
            else if (directory.Equals("E:/Uploads/Users") || directory.Equals("E:/Uploads/Roms") || directory.Equals("E:/Uploads/Meme"))
            {
                _logger.LogError($"Cannot delete {directory}!");
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
