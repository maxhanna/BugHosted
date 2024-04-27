using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Collections.ObjectModel;
using System.IO;
using System.Net;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class FileController : ControllerBase
    {
        private readonly ILogger<FileController> _logger;
        private readonly string baseTarget = "E:/Uploads/";

        public FileController(ILogger<FileController> logger)
        {
            _logger = logger;
        }

        [HttpGet("/File/GetDirectory/", Name = "GetDirectory")]
        public IActionResult GetDirectory([FromQuery] string? directory)
        {
            directory = Path.Combine(baseTarget, WebUtility.UrlDecode(directory) ?? "");
            _logger.LogInformation($"GET /File/GetDirectory/{directory}");
            if (!ValidatePath(directory!)) { return StatusCode(500, $"Must be within {baseTarget}"); }

            try
            {   // Check if the directory exists
                if (!Directory.Exists(directory))
                {
                    _logger.LogError($"Directory not found at {directory}");
                    return NotFound();
                }

                // Get the list of file names in the directory
                string[] fileNames = Directory.GetFileSystemEntries(directory).Select(path => Path.GetFileName(path)).ToArray();

                return Ok(fileNames);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while listing files.");
                return StatusCode(500, "An error occurred while listing files.");
            }
        }

        [HttpGet("/File/GetFile/{filePath}", Name = "GetFile")]
        public IActionResult GetFile(string filePath)
        {
            filePath = Path.Combine(baseTarget, WebUtility.UrlDecode(filePath) ?? "");

            _logger.LogInformation($"GET /File/GetFile/{filePath}");
            if (!ValidatePath(filePath)) { return StatusCode(500, $"Must be within {baseTarget}"); }

            try
            {
                // Check if the file path is provided
                if (string.IsNullOrEmpty(filePath))
                {
                    _logger.LogError($"File path is missing.");
                    return BadRequest("File path is missing.");
                }

                // Check if the file exists
                if (!System.IO.File.Exists(filePath))
                {
                    _logger.LogError($"File not found at {filePath}");
                    return NotFound();
                }

                // Stream the content of the file
                var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read);

                // Determine the content type based on the file extension (you can adjust it accordingly)
                string contentType = GetContentType(Path.GetExtension(filePath));

                return File(fileStream, contentType, Path.GetFileName(filePath));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while streaming the file.");
                return StatusCode(500, "An error occurred while streaming the file.");
            }
        }
        [HttpGet("/File/GetRomFile/{filePath}", Name = "GetRomFile")]
        public IActionResult GetRomFile(string filePath)
        { 
            filePath = Path.Combine(baseTarget + "roms/", WebUtility.UrlDecode(filePath) ?? "");
            _logger.LogInformation($"GET /File/GetRomFile/{filePath}");
            if (!ValidatePath(filePath)) { return StatusCode(500, $"Must be within {baseTarget}"); }

            try
            {
                // Check if the file path is provided
                if (string.IsNullOrEmpty(filePath))
                {
                    _logger.LogError($"File path is missing.");
                    return BadRequest("File path is missing.");
                }

                // Check if the file exists
                if (!System.IO.File.Exists(filePath))
                {
                    _logger.LogError($"File not found at {filePath}");
                    return NotFound();
                }

                // Stream the content of the file
                var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read);

                // Determine the content type based on the file extension (you can adjust it accordingly)
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
        public IActionResult MakeDirectory([FromBody] string? directoryPath)
        {
            if (directoryPath == null)
            {
                _logger.LogError("POST /File/MakeDirectory ERROR: directoryPath cannot be empty!");
                return StatusCode(500, "POST /File/MakeDirectory ERROR: directoryPath cannot be empty!");
            }
            directoryPath = Path.Combine(baseTarget, WebUtility.UrlDecode(directoryPath) ?? "");
            _logger.LogInformation($"POST /File/MakeDirectory/ (directoryPath: {directoryPath})");
            if (!ValidatePath(directoryPath)) { return StatusCode(500, $"Must be within {baseTarget}"); }

            try
            {
                // Check if the directory already exists
                if (Directory.Exists(directoryPath))
                {
                    _logger.LogError($"Directory already exists at {directoryPath}");
                    return Conflict("Directory already exists.");
                }

                // Create the directory
                Directory.CreateDirectory(directoryPath);

                _logger.LogInformation($"Directory created at {directoryPath}");

                return Ok("Directory created successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while creating directory.");
                return StatusCode(500, "An error occurred while creating directory.");
            }
        }
        [HttpPost("/File/Upload", Name = "Upload")]
        public async Task<IActionResult> UploadFiles(string? folderPath)
        {
            _logger.LogInformation($"POST /File/Upload (folderPath = {folderPath})");
            try
            {
                var files = Request.Form.Files; // Get all uploaded files

                if (files == null || files.Count == 0)
                    return BadRequest("No files uploaded.");


                foreach (var file in files)
                {
                    if (file.Length == 0)
                        continue; // Skip empty files

                    var uploadDirectory = string.IsNullOrEmpty(folderPath) ? baseTarget : Path.Combine(baseTarget, WebUtility.UrlDecode(folderPath)); // Combine base path with folder path
                    var filePath = Path.Combine(uploadDirectory, file.FileName); // Combine upload directory with file name

                    // Create directory if it doesn't exist
                    if (!Directory.Exists(uploadDirectory))
                    {
                        Directory.CreateDirectory(uploadDirectory);
                    }

                    using (var stream = new FileStream(filePath, FileMode.Create))
                    {
                        await file.CopyToAsync(stream);
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
                var files = Request.Form.Files; // Get all uploaded files

                if (files == null || files.Count == 0)
                    return BadRequest("No files uploaded.");


                foreach (var file in files)
                {
                    if (file.Length == 0)
                        continue; // Skip empty files

                    var uploadDirectory = Path.Combine(baseTarget, "roms/"); // Combine base path with folder path
                    var filePath = Path.Combine(uploadDirectory, file.FileName); // Combine upload directory with file name

                    // Create directory if it doesn't exist
                    if (!Directory.Exists(uploadDirectory))
                    {
                        Directory.CreateDirectory(uploadDirectory);
                    }

                    using (var stream = new FileStream(filePath, FileMode.Create))
                    {
                        await file.CopyToAsync(stream);
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
        public IActionResult DeleteFileOrDirectory([FromBody]string filePath)
        {
            filePath = this.baseTarget + filePath ?? "";
            _logger.LogInformation($"DELETE /File/Delete - Path: {filePath}");
            if (!ValidatePath(filePath)) { return StatusCode(500, $"Must be within {baseTarget}"); }

            try
            {
                if (!Directory.Exists(filePath) && !System.IO.File.Exists(filePath))
                {
                    _logger.LogError($"File or directory not found at {filePath}");
                    return NotFound("File or directory not found.");
                }

                if (Directory.Exists(filePath))
                {
                    Directory.Delete(filePath, true); // Recursively delete directory and its contents
                }
                else
                {
                    System.IO.File.Delete(filePath);
                }

                _logger.LogInformation($"File or directory deleted at {filePath}");

                return Ok("File or directory deleted successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while deleting file or directory.");
                return StatusCode(500, "An error occurred while deleting file or directory.");
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
