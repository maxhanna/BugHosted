using maxhanna.Server.Controllers.DataContracts;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using System.Diagnostics;
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

        [HttpPost("/File/GetDirectory/", Name = "GetDirectory")]
        public IActionResult GetDirectory([FromBody] User user, [FromQuery] string? directory)
        {
            directory = Path.Combine(baseTarget, WebUtility.UrlDecode(directory) ?? "");
            _logger.LogInformation($"GET /File/GetDirectory?directory={directory}");
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

                Response.Headers.Append("Cross-Origin-Opener-Policy", "same-origin"); // You can specify specific origins instead of "*"
                Response.Headers.Append("Cross-Origin-Embedder-Policy", "require-corp"); // Specify allowed methods
                return Ok(fileNames);
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


        [HttpPost("/File/GetRomFile/{filePath}", Name = "GetRomFile")]
        public IActionResult GetRomFile([FromBody] User user, string filePath)
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
                Response.Headers.Append("Cross-Origin-Opener-Policy", "same-origin"); // You can specify specific origins instead of "*"
                Response.Headers.Append("Cross-Origin-Embedder-Policy", "require-corp"); // Specify allowed methods

                return File(fileStream, contentType, Path.GetFileName(filePath));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred while streaming the file.");
                return StatusCode(500, "An error occurred while streaming the file.");
            }
        }

        [HttpPost("/File/MakeDirectory", Name = "MakeDirectory")]
        public IActionResult MakeDirectory([FromBody] CreateDirectory request)
        {
            if (request.directory == null)
            {
                _logger.LogError("POST /File/MakeDirectory ERROR: directoryPath cannot be empty!");
                return StatusCode(500, "POST /File/MakeDirectory ERROR: directoryPath cannot be empty!");
            }
            request.directory = Path.Combine(baseTarget, WebUtility.UrlDecode(request.directory) ?? "");
            _logger.LogInformation($"POST /File/MakeDirectory/ (directoryPath: {request.directory})");
            if (!ValidatePath(request.directory)) { return StatusCode(500, $"Must be within {baseTarget}"); }

            try
            {
                // Check if the directory already exists
                if (Directory.Exists(request.directory))
                {
                    _logger.LogError($"Directory already exists at {request.directory}");
                    return Conflict("Directory already exists.");
                }

                // Create the directory
                Directory.CreateDirectory(request.directory);

                _logger.LogInformation($"Directory created at {request.directory}");

                return Ok("Directory created successfully.");
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
                _logger.LogInformation($"before forloop {files.Count}");


                foreach (var file in files)
                {
                    if (file.Length == 0)
                    {
                        _logger.LogInformation($"File length is empty!");
                        continue; // Skip empty files
                    }

                    var uploadDirectory = Path.Combine(baseTarget, "roms/"); // Combine base path with folder path
                    var filePath = Path.Combine(uploadDirectory, file.FileName); // Combine upload directory with file name
                    _logger.LogInformation($"filePath : {filePath}");

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
                    Directory.Delete(request.file, true); // Recursively delete directory and its contents
                }
                else
                {
                    System.IO.File.Delete(request.file);
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
        public IActionResult MoveFile([FromBody] User user, [FromQuery] string inputFile, [FromQuery] string? destinationFolder)
        {
            _logger.LogInformation($"POST /File/Move (inputFile = {inputFile}, destinationFolder = {destinationFolder})");

            try
            {
                inputFile = Path.Combine(baseTarget, this.baseTarget + WebUtility.UrlDecode(inputFile) ?? "");
                destinationFolder = Path.Combine(baseTarget, this.baseTarget + WebUtility.UrlDecode(destinationFolder) ?? "");

                if (!ValidatePath(inputFile) || !ValidatePath(destinationFolder))
                {
                    _logger.LogError($"Invalid path: inputFile = {inputFile}, destinationFolder = {destinationFolder}");
                    return NotFound("Invalid path.");
                }

                if (System.IO.File.Exists(inputFile))
                {
                    string fileName = Path.GetFileName(inputFile);
                    string newFilePath = Path.Combine(destinationFolder, fileName);
                    System.IO.File.Move(inputFile, newFilePath);

                    _logger.LogInformation($"File moved from {inputFile} to {newFilePath}");
                    return Ok("File moved successfully.");
                }
                else if (Directory.Exists(inputFile))
                {
                    MoveDirectory(inputFile, destinationFolder);
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
        [HttpPost("/File/Batch/", Name = "ExecuteBatch")]
        public IActionResult ExecuteBatch([FromBody] User user, [FromQuery] string? inputFile)
        {
            _logger.LogInformation($"POST /File/Batch (inputFile = {inputFile})");
            string result = "";
            try
            {
                // Start the child process.
                Process p = new Process();
                // Redirect the output stream of the child process.
                p.StartInfo.UseShellExecute = false;
                p.StartInfo.RedirectStandardOutput = true;
                p.StartInfo.FileName = "E:/Uploads/hello_world.bat";
                p.Start();
                // Do not wait for the child process to exit before
                // reading to the end of its redirected stream.
                // p.WaitForExit();
                // Read the output stream first and then wait.
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
