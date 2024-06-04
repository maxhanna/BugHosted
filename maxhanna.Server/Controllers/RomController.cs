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
    public class RomController : ControllerBase
    {
        private readonly ILogger<RomController> _logger;
        private readonly IConfiguration _config;
        private readonly string baseTarget = "E:/Uploads/Roms";

        public RomController(ILogger<RomController> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
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


        [HttpPost("/Rom/Uploadrom", Name = "Uploadrom")]
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
                        newFilename = filenameWithoutExtension + "_" + user!.Id + Path.GetExtension(file.FileName).Replace("\\", "/");
                    }

                    var uploadDirectory = baseTarget; // Combine base path with folder path
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
                     
                    using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                    {
                        await connection.OpenAsync();

                        var checkCommand = new MySqlCommand("SELECT COUNT(*) FROM maxhanna.file_uploads WHERE file_name = @fileName AND folder_path = @folderPath", connection);
                        checkCommand.Parameters.AddWithValue("@fileName", file.FileName);
                        checkCommand.Parameters.AddWithValue("@folderPath", "roms");

                        var fileExists = Convert.ToInt32(await checkCommand.ExecuteScalarAsync()) > 0;

                        if (!fileExists)
                        {

                            var command = new MySqlCommand("INSERT INTO maxhanna.file_uploads (user_id, file_name, upload_date, folder_path, is_public, is_folder) VALUES (@user_id, @fileName, @uploadDate, @folderPath, @isPublic, @isFolder)", connection);
                            command.Parameters.AddWithValue("@user_id", user!.Id);
                            command.Parameters.AddWithValue("@fileName", file.FileName);
                            command.Parameters.AddWithValue("@uploadDate", DateTime.UtcNow);
                            command.Parameters.AddWithValue("@folderPath", "roms");
                            command.Parameters.AddWithValue("@isPublic", 1);
                            command.Parameters.AddWithValue("@isFolder", 0);

                            await command.ExecuteNonQueryAsync();
                            _logger.LogInformation($"Uploaded rom file: {file.FileName}, Size: {file.Length} bytes, Path: {filePath}");

                        }
                        else
                        {
                            _logger.LogInformation($"Rom file already exists: {file.FileName}, Size: {file.Length} bytes, Path: {filePath}");

                        }
                    }

                }

                return Ok("ROM uploaded successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while uploading files.");
                return StatusCode(500, "An error occurred while uploading files.");
            }
        }

        [HttpPost("/Rom/GetRomFile/{filePath}", Name = "GetRomFile")]
        public IActionResult GetRomFile([FromBody] User user, string filePath)
        {
            filePath = Path.Combine(baseTarget, WebUtility.UrlDecode(filePath) ?? "").Replace("\\", "/");
            _logger.LogInformation($"POST /File/GetRomFile/{filePath}");

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
                    string newFilename = filenameWithoutExtension + "_" + user!.Id + Path.GetExtension(filePath).Replace("\\", "/");
                    string userSpecificPath = Path.Combine(baseTarget, newFilename).Replace("\\", "/");

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
                _logger.LogInformation($"Filestreaming FilePath: " + filePath);

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
    }
}
