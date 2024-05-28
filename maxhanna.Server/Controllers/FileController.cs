using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using System.Diagnostics;
using System.Net;
using MySqlConnector;
using Microsoft.AspNetCore.Components.Forms;
using System.IO;

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
                            "id, file_name, is_public, is_folder, ownership " +
                        "FROM " +
                            "maxhanna.file_uploads " +
                        "WHERE " +
                            "folder_path = @folderPath " +
                        "AND (" +
                            "is_public = 1 OR " +
                            "FIND_IN_SET(@userId, ownership) > 0" +
                        ")"
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

                            // Apply filters
                            bool matchesVisibility = (visibility == "public" && isPublic) || (visibility == "private" && !isPublic) || visibility == "all";
                            bool matchesOwnership = (ownership == "own" && owner.Contains(user.Id.ToString())) || (ownership == "others" && !owner.Contains(user.Id.ToString())) || (ownership == "all");

                            if (matchesVisibility && matchesOwnership)
                            {
                                fileEntries.Add(new FileEntry { Id = id, Name = fileName, Visibility = isPublic ? "Public" : "Private", Owner = owner, IsFolder = isFolder });
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
                string directoryName = Path.GetDirectoryName(request.directory).Replace("\\", "/");

                string connectionString = _config.GetValue<string>("ConnectionStrings:maxhanna");

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

                    var uploadDirectory = string.IsNullOrEmpty(folderPath) ? baseTarget : Path.Combine(baseTarget, WebUtility.UrlDecode(folderPath)); // Combine base path with folder path
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
                        command.Parameters.AddWithValue("@ownership", user.Id);
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
                        command.Parameters.AddWithValue("@ownership", user.Id);
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
            request.file = this.baseTarget + request.file ?? "";
            _logger.LogInformation($"DELETE /File/Delete - Path: {request.file}");
            if (!ValidatePath(request.file)) { return StatusCode(500, $"Must be within {baseTarget}"); }

            try
            {
                if (!Directory.Exists(request.file) && !System.IO.File.Exists(request.file))
                {
                    _logger.LogError($"File or directory not found at {request.file}");
                    return NotFound("File or directory not found.");
                }

                if (Directory.Exists(request.file))
                {
                    Directory.Delete(request.file, true);
                    string subFoldersPath = request.file.Replace("\\", "/");
                    if (!subFoldersPath.EndsWith("/"))
                    {
                        subFoldersPath += "/";
                    }
                    string fileName = Path.GetFileName(Path.GetDirectoryName(subFoldersPath))!;
                    string folderPath = Path.GetDirectoryName(Path.GetDirectoryName(subFoldersPath))!.Replace("\\", "/");
                    if (!folderPath.EndsWith("/"))
                    {
                        folderPath += "/";
                    }

                    _logger.LogInformation($"subFoldersPath: {subFoldersPath}; fileName: {fileName}; folderLocation: {folderPath}");

                    using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                    {
                        connection.Open();

                        var command = new MySqlCommand("DELETE FROM maxhanna.file_uploads WHERE (folder_path = @folderPath and file_name = @fileName) OR folder_path LIKE CONCAT(@subFoldersPath,'%')", connection);
                        command.Parameters.AddWithValue("@folderPath", folderPath);
                        command.Parameters.AddWithValue("@fileName", fileName);
                        command.Parameters.AddWithValue("@subFoldersPath", subFoldersPath);

                        command.ExecuteNonQuery();
                    }
                }
                else
                {
                    System.IO.File.Delete(request.file);
                    string fileName = Path.GetFileName(request.file).Replace("\\", "/");
                    string folder = Path.GetDirectoryName(request.file).Replace("\\", "/");
                    if (!folder.EndsWith("/"))
                    {
                        folder += "/";
                    }
                    using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                    {
                        connection.Open();

                        var command = new MySqlCommand("DELETE FROM maxhanna.file_uploads WHERE folder_path = @folderPath AND file_name = @fileName", connection);
                        command.Parameters.AddWithValue("@folderPath", folder);
                        command.Parameters.AddWithValue("@fileName", fileName);

                        command.ExecuteNonQuery();
                    } 
                }

                _logger.LogInformation($"File or directory deleted at {request.file}");

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
                    string filePath = null;
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

                        string parentPath = Path.GetDirectoryName(filePath.TrimEnd('/').Replace("\\", "/")).Replace("\\", "/");
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
                string oldFolderPath = Path.GetDirectoryName(oldFilePath)?.Replace("\\", "/");
                if (!oldFolderPath.EndsWith("/"))
                {
                    oldFolderPath += "/";
                }
                string newFolderPath = Path.GetDirectoryName(newFilePath)?.Replace("\\", "/");
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
    public class FileEntry
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public string Visibility { get; set; }
        public string Owner { get; set; }
        public bool IsFolder { get; set; }
    } 
    public class ShareFileRequest
    {
        public User User1 { get; set; }
        public User User2 { get; set; }
    }
}
