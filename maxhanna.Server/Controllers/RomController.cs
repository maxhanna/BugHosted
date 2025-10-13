using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using Newtonsoft.Json;
using System.Net;

namespace maxhanna.Server.Controllers
{
	[ApiController]
	[Route("[controller]")]
	public class RomController : ControllerBase
	{
		private readonly Log _log;
		private readonly IConfiguration _config;
		private readonly string _baseTarget = "E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Roms";
 

		public RomController(Log log, IConfiguration config)
		{
			_log = log;
			_config = config;
		}


		[HttpGet("/Rom/UserStats/{userId}")]
		public async Task<IActionResult> UserStats(int userId)
		{
			try
			{
				using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
				{
					await connection.OpenAsync();
					string totalSql = @"SELECT IFNULL(SUM(duration_seconds),0) AS totalSeconds FROM maxhanna.emulation_play_time WHERE user_id = @UserId;";
					var totalCmd = new MySqlCommand(totalSql, connection);
					totalCmd.Parameters.AddWithValue("@UserId", userId);
					var totalSecondsObj = await totalCmd.ExecuteScalarAsync();
					int totalSeconds = Convert.ToInt32(totalSecondsObj ?? 0);

					// Count distinct ROM uploads for this user (files in folder_path = 'roms')
					string romCountSql = @"SELECT COUNT(*) FROM maxhanna.file_uploads WHERE user_id = @UserId AND folder_path = @FolderPath;";
					var romCountCmd = new MySqlCommand(romCountSql, connection);
					romCountCmd.Parameters.AddWithValue("@UserId", userId);
					romCountCmd.Parameters.AddWithValue("@FolderPath", _baseTarget);
					var romCountObj = await romCountCmd.ExecuteScalarAsync();
					int romCount = Convert.ToInt32(romCountObj ?? 0);

					string topSql = @"SELECT rom_file_name, plays FROM maxhanna.emulation_play_time WHERE user_id = @UserId ORDER BY plays DESC LIMIT 1;";
					var topCmd = new MySqlCommand(topSql, connection);
					topCmd.Parameters.AddWithValue("@UserId", userId);
					using (var reader = await topCmd.ExecuteReaderAsync())
					{
						string? topName = null;
						int topPlays = 0;
						if (await reader.ReadAsync())
						{
							topName = reader.IsDBNull(0) ? null : reader.GetString(0);
							topPlays = reader.IsDBNull(1) ? 0 : reader.GetInt32(1);
						}
						return Ok(new { totalSeconds = totalSeconds, topGameName = topName, topGamePlays = topPlays, romCount = romCount });
					}
				}
			}
			catch (Exception ex)
			{
				_ = _log.Db("Error fetching user emulation stats: " + ex.Message, userId, "ROM", true);
				return StatusCode(500, "Error fetching stats");
			}
		}

		private bool ValidatePath(string directory)
		{
			if (!directory.Contains(_baseTarget))
			{
				_ = _log.Db($"'{directory}'Must be within '{_baseTarget}'", null, "ROM", true);
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
			try
			{
				if (Request.Form["userId"].Count <= 0)
				{
					_ = _log.Db($"Invalid user! Returning null.", null, "ROM", true);
					return BadRequest("No user logged in.");
				}

				int userId = JsonConvert.DeserializeObject<int>(Request.Form["userId"]!);
				var files = Request.Form.Files; // Get all uploaded files
				if (userId == 0)
				{
					_ = _log.Db($"Invalid user! Returning null.", null, "ROM", true);
					return BadRequest("No user logged in.");

				}
				if (files == null || files.Count == 0)
				{
					_ = _log.Db($"No File Uploaded!", userId, "ROM", true);
					return BadRequest("No files uploaded.");
				}

				foreach (var file in files)
				{
					if (file.Length == 0)
					{
						_ = _log.Db($"File length is empty!", userId, "ROM", true);
						continue; // Skip empty files
					}

					string newFilename = "";
					bool isSaveFile = false;
					if (file.FileName.Contains(".sav"))
					{
						isSaveFile = true;
						string filenameWithoutExtension = Path.GetFileNameWithoutExtension(file.FileName);
						newFilename = filenameWithoutExtension + "_" + userId + Path.GetExtension(file.FileName).Replace("\\", "/");
					}

					var uploadDirectory = _baseTarget;
					var filePath = string.IsNullOrEmpty(newFilename) ? file.FileName : newFilename;
					filePath = Path.Combine(uploadDirectory, filePath).Replace("\\", "/");

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
						checkCommand.Parameters.AddWithValue("@folderPath", _baseTarget);

						var fileExists = Convert.ToInt32(await checkCommand.ExecuteScalarAsync()) > 0;

						if (!fileExists)
						{

							var command = new MySqlCommand("INSERT INTO maxhanna.file_uploads (user_id, file_name, upload_date, folder_path, is_public, is_folder) VALUES (@user_id, @fileName, @uploadDate, @folderPath, @isPublic, @isFolder)", connection);
							command.Parameters.AddWithValue("@user_id", userId);
							command.Parameters.AddWithValue("@fileName", file.FileName);
							command.Parameters.AddWithValue("@uploadDate", DateTime.UtcNow);
							command.Parameters.AddWithValue("@folderPath", _baseTarget);
							command.Parameters.AddWithValue("@isPublic", 1);
							command.Parameters.AddWithValue("@isFolder", 0);

							await command.ExecuteNonQueryAsync();
							_ = _log.Db($"Uploaded rom file: {file.FileName}, Size: {file.Length} bytes, Path: {filePath}", userId, "ROM", true);

						}
						else if (!isSaveFile)
						{
							_ = _log.Db($"Rom file already exists: {file.FileName}, Size: {file.Length} bytes, Path: {filePath}", userId, "ROM", true); 
						}

						// If this was a save file upload, check for optional timing fields and persist playtime
						if (isSaveFile)
						{
							try
							{
								// Form keys expected: startTimeMs, saveTimeMs, durationSeconds
								long startMs = 0;
								long saveMs = 0;
								int durationSeconds = 0;
								if (Request.Form.ContainsKey("startTimeMs") && long.TryParse(Request.Form["startTimeMs"], out var sm)) startMs = sm;
								if (Request.Form.ContainsKey("saveTimeMs") && long.TryParse(Request.Form["saveTimeMs"], out var svm)) saveMs = svm;
								if (Request.Form.ContainsKey("durationSeconds") && int.TryParse(Request.Form["durationSeconds"], out var ds)) durationSeconds = ds;

								string upsertSql = @"
								INSERT INTO maxhanna.emulation_play_time (user_id, rom_file_name, start_time, save_time, duration_seconds, plays, created_at)
								VALUES (@UserId, @RomFileName, FROM_UNIXTIME(@StartMs/1000), FROM_UNIXTIME(@SaveMs/1000), @DurationSeconds, 1, UTC_TIMESTAMP())
								ON DUPLICATE KEY UPDATE
									start_time = VALUES(start_time),
									save_time = VALUES(save_time),
									duration_seconds = IFNULL(duration_seconds, 0) + VALUES(duration_seconds),
									plays = plays + 1,
									created_at = VALUES(created_at);";
								var upsertCmd = new MySqlCommand(upsertSql, connection);
								upsertCmd.Parameters.AddWithValue("@UserId", userId);
								upsertCmd.Parameters.AddWithValue("@RomFileName", file.FileName);
								upsertCmd.Parameters.AddWithValue("@StartMs", startMs);
								upsertCmd.Parameters.AddWithValue("@SaveMs", saveMs);
								upsertCmd.Parameters.AddWithValue("@DurationSeconds", durationSeconds);
								try
								{
									await upsertCmd.ExecuteNonQueryAsync();
								}
								catch (MySqlException mex)
								{ 
									_ = _log.Db("Error recording playtime on upload (DB error): " + mex.Message, userId, "ROM", true);
								}
							}
							catch (Exception ex)
							{
								_ = _log.Db("Error recording playtime on upload: " + ex.Message, userId, "ROM", true);
							}
						}
					}

				}

				return Ok("ROM uploaded successfully.");
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while uploading files." + ex.Message, null, "ROM", true);
				return StatusCode(500, "An error occurred while uploading files.");
			}
		}



		[HttpPost("/Rom/GetRomFile/{filePath}", Name = "GetRomFile")]
		public IActionResult GetRomFile([FromBody] int? userId, string filePath)
		{
			filePath = Path.Combine(_baseTarget, WebUtility.UrlDecode(filePath) ?? "").Replace("\\", "/"); 
			string fileName = Path.GetFileName(filePath);
			if (!ValidatePath(filePath)) { return StatusCode(500, $"Must be within {_baseTarget}"); }

			try
			{
				if (string.IsNullOrEmpty(filePath))
				{
					_ = _log.Db($"File path is missing.", null, "ROM", true);
					return BadRequest("File path is missing.");
				}
				if (userId != null && (filePath.Contains(".sav") || filePath.Contains(".srm")))
				{
					string filenameWithoutExtension = Path.GetFileNameWithoutExtension(filePath);
					string newFilename = filenameWithoutExtension + "_" + userId + Path.GetExtension(filePath).Replace("\\", "/");
					string userSpecificPath = Path.Combine(_baseTarget, newFilename).Replace("\\", "/");

					if (System.IO.File.Exists(userSpecificPath))
					{
						filePath = userSpecificPath;
					}
					else
					{
						_ = _log.Db($"File not found at {filePath} or {userSpecificPath}", userId, "ROM", true);
						return NotFound();
					}
					//_ = _log.Db($"File path changed . New FilePath: " + filePath, userId, "ROM", true);
				}
				else if (userId == null && (filePath.Contains(".sav") || filePath.Contains(".srm")))
					return BadRequest("Must be logged in to access save files!"); 

				var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
				string contentType = "application/octet-stream";

				updateLastAccessForRom(fileName);
				return File(fileStream, contentType, Path.GetFileName(filePath));
			}
			catch (Exception ex)
			{
				_ = _log.Db("An error occurred while streaming the file." + ex.Message, userId, "ROM", true);
				return StatusCode(500, "An error occurred while streaming the file.");
			}
		}

		private async void updateLastAccessForRom(string fileName)
		{ 
			using (var connection = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
			{
				await connection.OpenAsync();

				string sql = "UPDATE maxhanna.file_uploads SET last_access = NOW() WHERE file_name = @File_Name LIMIT 1;";
				var command = new MySqlCommand(sql, connection);
				command.Parameters.AddWithValue("@File_Name", fileName);

				await command.ExecuteNonQueryAsync();
			}
		}
	}
}