using maxhanna.Server.Controllers.DataContracts.Files;
using maxhanna.Server.Controllers.DataContracts.Planter;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Text.Json;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class PlanterController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly Log _log;
        private readonly AiController _ai;
        private readonly string _plantPhotoDirectory;

        public PlanterController(IConfiguration config, Log log, AiController ai)
        {
            _config = config;
            _log = log;
            _ai = ai;
            _plantPhotoDirectory = "E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Planter/";
            if (!Directory.Exists(_plantPhotoDirectory))
                Directory.CreateDirectory(_plantPhotoDirectory);
        }

        [HttpGet("/Planter/GetPlants")]
        public async Task<IActionResult> GetPlants([FromQuery] int userId)
        {
            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();
                string sql = @"
                    SELECT id, user_id, name, species, notes, location, last_watered, created_at, updated_at
                    FROM maxhanna.user_plants
                    WHERE user_id = @UserId
                    ORDER BY updated_at DESC";

                using var cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@UserId", userId);
                using var reader = await cmd.ExecuteReaderAsync();

                var plants = new List<UserPlant>();
                while (await reader.ReadAsync())
                {
                    plants.Add(new UserPlant
                    {
                        Id = reader.GetInt32("id"),
                        UserId = reader.GetInt32("user_id"),
                        Name = reader.GetString("name"),
                        Species = reader.IsDBNull(reader.GetOrdinal("species")) ? null : reader.GetString("species"),
                        Notes = reader.IsDBNull(reader.GetOrdinal("notes")) ? null : reader.GetString("notes"),
                        Location = reader.IsDBNull(reader.GetOrdinal("location")) ? null : reader.GetString("location"),
                        LastWatered = reader.IsDBNull(reader.GetOrdinal("last_watered")) ? null : reader.GetDateTime("last_watered"),
                        CreatedAt = reader.GetDateTime("created_at"),
                        UpdatedAt = reader.GetDateTime("updated_at")
                    });
                }
                return Ok(plants);
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error in GetPlants: {ex.Message}", userId, "PLANTER", true);
                return StatusCode(500, "An error occurred while fetching plants.");
            }
        }

        [HttpPost("/Planter/AddPlant")]
        public async Task<IActionResult> AddPlant([FromBody] AddPlantRequest request)
        {
            if (request.UserId == 0 || string.IsNullOrWhiteSpace(request.Name))
                return BadRequest("UserId and Name are required.");

            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();
                string sql = @"
                    INSERT INTO maxhanna.user_plants (user_id, name, species, notes, location, created_at, updated_at)
                    VALUES (@UserId, @Name, @Species, @Notes, @Location, UTC_TIMESTAMP(), UTC_TIMESTAMP());
                    SELECT LAST_INSERT_ID();";

                using var cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@UserId", request.UserId);
                cmd.Parameters.AddWithValue("@Name", request.Name);
                cmd.Parameters.AddWithValue("@Species", request.Species ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Notes", request.Notes ?? (object)DBNull.Value);
                cmd.Parameters.AddWithValue("@Location", request.Location ?? (object)DBNull.Value);

                var plantId = Convert.ToInt32(await cmd.ExecuteScalarAsync());

                if (request.PhotoFileId.HasValue)
                {
                    var linkSql = @"INSERT INTO maxhanna.plant_photos (plant_id, file_id, created_at) VALUES (@PlantId, @FileId, UTC_TIMESTAMP());";
                    using var linkCmd = new MySqlCommand(linkSql, conn);
                    linkCmd.Parameters.AddWithValue("@PlantId", plantId);
                    linkCmd.Parameters.AddWithValue("@FileId", request.PhotoFileId.Value);
                    await linkCmd.ExecuteNonQueryAsync();
                }

                return Ok(new { Id = plantId });
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error in AddPlant: {ex.Message}", request.UserId, "PLANTER", true);
                return StatusCode(500, "An error occurred while adding plant.");
            }
        }

        [HttpPut("/Planter/UpdatePlant")]
        public async Task<IActionResult> UpdatePlant([FromBody] UpdatePlantRequest request)
        {
            if (request.PlantId == 0)
                return BadRequest("PlantId is required.");

            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                var updates = new List<string>();
                var parameters = new Dictionary<string, object>();

                if (request.Name != null) { updates.Add("name = @Name"); parameters["@Name"] = request.Name; }
                if (request.Species != null) { updates.Add("species = @Species"); parameters["@Species"] = request.Species; }
                if (request.Notes != null) { updates.Add("notes = @Notes"); parameters["@Notes"] = request.Notes; }
                if (request.Location != null) { updates.Add("location = @Location"); parameters["@Location"] = request.Location; }
                if (request.LastWatered != null) { updates.Add("last_watered = @LastWatered"); parameters["@LastWatered"] = request.LastWatered; }

                if (updates.Count == 0)
                    return BadRequest("No fields to update.");

                updates.Add("updated_at = UTC_TIMESTAMP()");

                string sql = $"UPDATE maxhanna.user_plants SET {string.Join(", ", updates)} WHERE id = @PlantId";
                parameters["@PlantId"] = request.PlantId;

                using var cmd = new MySqlCommand(sql, conn);
                foreach (var kvp in parameters)
                    cmd.Parameters.AddWithValue(kvp.Key, kvp.Value);

                await cmd.ExecuteNonQueryAsync();
                return Ok(new { Success = true });
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error in UpdatePlant: {ex.Message}", null, "PLANTER", true);
                return StatusCode(500, "An error occurred while updating plant.");
            }
        }

        [HttpDelete("/Planter/DeletePlant")]
        public async Task<IActionResult> DeletePlant([FromQuery] int plantId, [FromQuery] int userId)
        {
            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var tx = conn.BeginTransaction();

                try
                {
                    var photoCmd = new MySqlCommand(
                        "SELECT pp.id, pp.file_id, fu.file_name, fu.folder_path FROM maxhanna.plant_photos pp " +
                        "LEFT JOIN maxhanna.file_uploads fu ON pp.file_id = fu.id WHERE pp.plant_id = @PlantId", conn, tx);
                    photoCmd.Parameters.AddWithValue("@PlantId", plantId);
                    var filesToDelete = new List<(int fileId, string? fileName, string? folderPath)>();
                    using (var rdr = await photoCmd.ExecuteReaderAsync())
                    {
                        while (await rdr.ReadAsync())
                        {
                            filesToDelete.Add((
                                rdr.GetInt32("file_id"),
                                rdr.IsDBNull(rdr.GetOrdinal("file_name")) ? null : rdr.GetString("file_name"),
                                rdr.IsDBNull(rdr.GetOrdinal("folder_path")) ? null : rdr.GetString("folder_path")
                            ));
                        }
                    }

                    await new MySqlCommand("DELETE FROM maxhanna.plant_photos WHERE plant_id = @PlantId", conn, tx) { Parameters = { new MySqlParameter("@PlantId", plantId) } }.ExecuteNonQueryAsync();
                    await new MySqlCommand("DELETE FROM maxhanna.user_plants WHERE id = @PlantId AND user_id = @UserId", conn, tx) { Parameters = { new MySqlParameter("@PlantId", plantId), new MySqlParameter("@UserId", userId) } }.ExecuteNonQueryAsync();

                    foreach (var f in filesToDelete)
                    {
                        if (f.fileName != null && f.folderPath != null)
                        {
                            try { System.IO.File.Delete(Path.Combine(f.folderPath, f.fileName)); } catch { }
                        }
                        await new MySqlCommand("DELETE FROM maxhanna.file_uploads WHERE id = @FileId", conn, tx) { Parameters = { new MySqlParameter("@FileId", f.fileId) } }.ExecuteNonQueryAsync();
                    }

                    await tx.CommitAsync();
                    return Ok(new { Success = true });
                }
                catch
                {
                    await tx.RollbackAsync();
                    throw;
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error in DeletePlant: {ex.Message}", userId, "PLANTER", true);
                return StatusCode(500, "An error occurred while deleting plant.");
            }
        }

        [HttpPost("/Planter/UploadPhotoForIdentification")]
        public async Task<IActionResult> UploadPhotoForIdentification([FromForm] int userId, IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest("No file uploaded.");

            try
            {
                var ext = Path.GetExtension(file.FileName).ToLower();
                if (string.IsNullOrEmpty(ext)) ext = ".jpg";
                var fileName = $"{Guid.NewGuid()}{ext}";
                var filePath = Path.Combine(_plantPhotoDirectory, fileName);

                using (var stream = new FileStream(filePath, FileMode.Create))
                    await file.CopyToAsync(stream);

                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();
                var fileSql = @"
                    INSERT INTO maxhanna.file_uploads (user_id, file_name, folder_path, file_size, upload_date, is_public, last_updated, access_count, is_folder)
                    VALUES (@UserId, @FileName, @FolderPath, @FileSize, UTC_TIMESTAMP(), TRUE, UTC_TIMESTAMP(), 0, 0);
                    SELECT LAST_INSERT_ID();";
                using var fileCmd = new MySqlCommand(fileSql, conn);
                fileCmd.Parameters.AddWithValue("@UserId", userId);
                fileCmd.Parameters.AddWithValue("@FileName", fileName);
                fileCmd.Parameters.AddWithValue("@FolderPath", _plantPhotoDirectory);
                fileCmd.Parameters.AddWithValue("@FileSize", file.Length);
                var fileId = Convert.ToInt32(await fileCmd.ExecuteScalarAsync());

                return Ok(new FileEntry
                {
                    Id = fileId,
                    FileName = fileName,
                    Directory = _plantPhotoDirectory,
                    FileSize = (int)file.Length,
                    FileType = ext.TrimStart('.')
                });
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error in UploadPhotoForIdentification: {ex.Message}", userId, "PLANTER", true);
                return StatusCode(500, "An error occurred while uploading photo.");
            }
        }

        [HttpPost("/Planter/UploadPhoto")]
        public async Task<IActionResult> UploadPhoto([FromForm] int plantId, [FromForm] int userId, IFormFile file)
        {
            if (file == null || file.Length == 0)
                return BadRequest("No file uploaded.");

            try
            {
                var ext = Path.GetExtension(file.FileName).ToLower();
                if (string.IsNullOrEmpty(ext)) ext = ".jpg";
                var fileName = $"{Guid.NewGuid()}{ext}";
                var filePath = Path.Combine(_plantPhotoDirectory, fileName);

                using (var stream = new FileStream(filePath, FileMode.Create))
                    await file.CopyToAsync(stream);

                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                using var tx = conn.BeginTransaction();
                try
                {
                    var fileSql = @"
                        INSERT INTO maxhanna.file_uploads (user_id, file_name, folder_path, file_size, upload_date, is_public, last_updated, access_count, is_folder)
                        VALUES (@UserId, @FileName, @FolderPath, @FileSize, UTC_TIMESTAMP(), FALSE, UTC_TIMESTAMP(), 0, 0);
                        SELECT LAST_INSERT_ID();";
                    using var fileCmd = new MySqlCommand(fileSql, conn, tx);
                    fileCmd.Parameters.AddWithValue("@UserId", userId);
                    fileCmd.Parameters.AddWithValue("@FileName", fileName);
                    fileCmd.Parameters.AddWithValue("@FolderPath", _plantPhotoDirectory);
                    fileCmd.Parameters.AddWithValue("@FileSize", file.Length);
                    var fileId = Convert.ToInt32(await fileCmd.ExecuteScalarAsync());

                    var photoSql = @"
                        INSERT INTO maxhanna.plant_photos (plant_id, file_id, created_at)
                        VALUES (@PlantId, @FileId, UTC_TIMESTAMP());
                        SELECT LAST_INSERT_ID();";
                    using var photoCmd = new MySqlCommand(photoSql, conn, tx);
                    photoCmd.Parameters.AddWithValue("@PlantId", plantId);
                    photoCmd.Parameters.AddWithValue("@FileId", fileId);
                    var photoId = Convert.ToInt32(await photoCmd.ExecuteScalarAsync());

                    await tx.CommitAsync();
                    return Ok(new { PhotoId = photoId, FileId = fileId, FileName = fileName });
                }
                catch
                {
                    await tx.RollbackAsync();
                    try { System.IO.File.Delete(filePath); } catch { }
                    throw;
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error in UploadPhoto: {ex.Message}", userId, "PLANTER", true);
                return StatusCode(500, "An error occurred while uploading photo.");
            }
        }

        [HttpDelete("/Planter/DeletePhoto")]
        public async Task<IActionResult> DeletePhoto([FromQuery] int fileId, [FromQuery] int userId)
        {
            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                var getSql = @"
                    SELECT fu.file_name, fu.directory
                    FROM maxhanna.file_uploads fu
                    WHERE fu.id = @FileId";
                using var getCmd = new MySqlCommand(getSql, conn);
                getCmd.Parameters.AddWithValue("@FileId", fileId);
                using var rdr = await getCmd.ExecuteReaderAsync();
                if (!await rdr.ReadAsync())
                    return NotFound("Photo not found.");

                var fileName = rdr.IsDBNull(rdr.GetOrdinal("file_name")) ? null : rdr.GetString("file_name");
                var directory = rdr.IsDBNull(rdr.GetOrdinal("directory")) ? null : rdr.GetString("directory");
                rdr.Close();

                using var tx = conn.BeginTransaction();
                try
                {
                    await new MySqlCommand("DELETE FROM maxhanna.plant_photos WHERE file_id = @FileId", conn, tx) { Parameters = { new MySqlParameter("@FileId", fileId) } }.ExecuteNonQueryAsync();
                    await new MySqlCommand("DELETE FROM maxhanna.file_uploads WHERE id = @FileId", conn, tx) { Parameters = { new MySqlParameter("@FileId", fileId) } }.ExecuteNonQueryAsync();
                    await tx.CommitAsync();

                    if (fileName != null && directory != null)
                    {
                        try { System.IO.File.Delete(Path.Combine(directory, fileName)); } catch { }
                    }
                    return Ok(new { Success = true });
                }
                catch
                {
                    await tx.RollbackAsync();
                    throw;
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error in DeletePhoto: {ex.Message}", userId, "PLANTER", true);
                return StatusCode(500, "An error occurred while deleting photo.");
            }
        }

        [HttpGet("/Planter/GetPhotos")]
        public async Task<IActionResult> GetPhotos([FromQuery] int plantId)
        {
            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();
                string sql = @"
                    SELECT fu.id, fu.file_name, fu.given_file_name, fu.folder_path as directory, fu.is_public as visibility,
                           fu.user_id, fu.is_folder, fu.upload_date, fu.last_updated,
                           fu.file_type, fu.file_size, fu.width, fu.height, fu.duration,
                           fu.last_access, fu.access_count
                    FROM maxhanna.plant_photos pp
                    JOIN maxhanna.file_uploads fu ON pp.file_id = fu.id
                    WHERE pp.plant_id = @PlantId
                    ORDER BY pp.created_at DESC";

                using var cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@PlantId", plantId);
                using var reader = await cmd.ExecuteReaderAsync();

                var photos = new List<FileEntry>();
                while (await reader.ReadAsync())
                {
                    photos.Add(new FileEntry
                    {
                        Id = reader.GetInt32("id"),
                        FileName = reader.IsDBNull(reader.GetOrdinal("file_name")) ? null : reader.GetString("file_name"),
                        GivenFileName = reader.IsDBNull(reader.GetOrdinal("given_file_name")) ? null : reader.GetString("given_file_name"),
                        Directory = reader.IsDBNull(reader.GetOrdinal("directory")) ? null : reader.GetString("directory"),
                        Visibility = reader.IsDBNull(reader.GetOrdinal("visibility")) ? "Public" : reader.GetBoolean("visibility") ? "Public" : "Private",
                        IsFolder = reader.GetBoolean("is_folder"),
                        Date = reader.GetDateTime("upload_date"),
                        LastUpdated = reader.IsDBNull(reader.GetOrdinal("last_updated")) ? null : reader.GetDateTime("last_updated"),
                        FileType = reader.IsDBNull(reader.GetOrdinal("file_type")) ? null : reader.GetString("file_type"),
                        FileSize = reader.GetInt32("file_size"),
                        Width = reader.IsDBNull(reader.GetOrdinal("width")) ? null : (int?)reader.GetInt32("width"),
                        Height = reader.IsDBNull(reader.GetOrdinal("height")) ? null : (int?)reader.GetInt32("height"),
                        Duration = reader.IsDBNull(reader.GetOrdinal("duration")) ? null : (int?)reader.GetInt32("duration"),
                        LastAccess = reader.IsDBNull(reader.GetOrdinal("last_access")) ? null : reader.GetDateTime("last_access"),
                        AccessCount = reader.GetInt32("access_count"),
                    });
                }
                return Ok(photos);
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error in GetPhotos: {ex.Message}", null, "PLANTER", true);
                return StatusCode(500, "An error occurred while fetching photos.");
            }
        }

        [HttpPost("/Planter/AnalyzePlant")]
        public async Task<IActionResult> AnalyzePlant([FromBody] PlantAnalysisRequest request)
        {
            if (request.UserId == 0 || request.PlantId == 0 || request.PhotoFileId == 0 || string.IsNullOrEmpty(request.AnalysisType))
                return BadRequest("UserId, PlantId, PhotoFileId, and AnalysisType are required.");

            try
            {  
                // Check cache first
                using (var checkConn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await checkConn.OpenAsync();
                    using var checkCmd = new MySqlCommand(
                        "SELECT result FROM maxhanna.plant_analysis_cache WHERE plant_id = @PlantId AND file_id = @FileId AND analysis_type = @AnalysisType",
                        checkConn);
                    checkCmd.Parameters.AddWithValue("@PlantId", request.PlantId);
                    checkCmd.Parameters.AddWithValue("@FileId", request.PhotoFileId);
                    checkCmd.Parameters.AddWithValue("@AnalysisType", request.AnalysisType);
                    var cached = await checkCmd.ExecuteScalarAsync();
                    if (cached != null)
                    {
                        return Ok(new { Reply = cached.ToString() });
                    }
                }

                string plantName = "";
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();
                    using var cmd = new MySqlCommand("SELECT name, species FROM maxhanna.user_plants WHERE id = @PlantId", conn);
                    cmd.Parameters.AddWithValue("@PlantId", request.PlantId);
                    using var rdr = await cmd.ExecuteReaderAsync();
                    if (await rdr.ReadAsync())
                    {
                        plantName = rdr.GetString("name");
                    }
                }

                string systemPrompt = GetAnalysisSystemPrompt(request.AnalysisType, plantName);

                var response = await _ai.SendVisionToAI(systemPrompt, request.PhotoFileId);

                // Save to cache
                using (var saveConn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await saveConn.OpenAsync();
                    using var saveCmd = new MySqlCommand(@"
                        INSERT INTO maxhanna.plant_analysis_cache (plant_id, file_id, analysis_type, result)
                        VALUES (@PlantId, @FileId, @AnalysisType, @Result)
                        ON DUPLICATE KEY UPDATE result = @Result, created_at = CURRENT_TIMESTAMP", saveConn);
                    saveCmd.Parameters.AddWithValue("@PlantId", request.PlantId);
                    saveCmd.Parameters.AddWithValue("@FileId", request.PhotoFileId);
                    saveCmd.Parameters.AddWithValue("@AnalysisType", request.AnalysisType);
                    saveCmd.Parameters.AddWithValue("@Result", response ?? "");
                    await saveCmd.ExecuteNonQueryAsync();
                }

                return Ok(new { Reply = response });
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error in AnalyzePlant: {ex.Message}", request.UserId, "PLANTER", true);
                return StatusCode(500, new { Reply = "Analysis failed." });
            }
        }

        [HttpPost("/Planter/IdentifyPlant")]
        public async Task<IActionResult> IdentifyPlant([FromBody] IdentifyPlantRequest request)
        {
            if (request.UserId == 0 || request.PhotoFileId == 0)
                return BadRequest("UserId and PhotoFileId are required.");

            try
            {
                string systemPrompt = "You are a botanist identifying a plant from a photo. " +
                    "Respond with ONLY a valid JSON object in this exact format (no markdown, no code fences): " +
                    "{ \"suggestions\": [ " +
                    "{ \"name\": \"Common plant name\", \"species\": \"Scientific name\", \"reason\": \"Brief reason for identification\" } " +
                    "], \"topPick\": { \"name\": \"Best guess common name\", \"species\": \"Best guess scientific name\" } }. " +
                    "Include 3-5 suggestions. The first/topPick should be your most confident identification. " +
                    "Use empty strings if uncertain rather than guessing scientific names.";

                var responseText = await _ai.SendVisionToAI(systemPrompt, request.PhotoFileId);
                if (string.IsNullOrEmpty(responseText))
                    return Ok(new IdentifyPlantResponse { Suggestions = new List<PlantSuggestion>(), TopPick = new PlantSuggestion() });

                var jsonToParse = responseText;
                var firstBrace = responseText.IndexOf('{');
                var lastBrace = responseText.LastIndexOf('}');
                if (firstBrace >= 0 && lastBrace > firstBrace)
                    jsonToParse = responseText.Substring(firstBrace, lastBrace - firstBrace + 1);

                try
                {
                    var parsed = JsonSerializer.Deserialize<IdentifyPlantResponse>(jsonToParse, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (parsed?.Suggestions != null && parsed.Suggestions.Count > 0)
                        return Ok(parsed);
                }
                catch { }

                var display = responseText.Length > 200 ? responseText.Substring(0, 200) + "..." : responseText;
                return Ok(new IdentifyPlantResponse
                {
                    Suggestions = new List<PlantSuggestion>
                    {
                        new PlantSuggestion { Name = "Unknown plant", Species = "", Reason = display }
                    },
                    TopPick = new PlantSuggestion { Name = "Unknown plant", Species = "" }
                });
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error in IdentifyPlant: {ex.Message}", request.UserId, "PLANTER", true);
                return StatusCode(500, "Plant identification failed.");
            }
        }

        [HttpPost("/Planter/ChatAboutPlant")]
        public async Task<IActionResult> ChatAboutPlant([FromBody] PlantChatRequest request)
        {
            if (request.UserId == 0 || request.PlantId == 0 || string.IsNullOrEmpty(request.Message))
                return BadRequest("UserId, PlantId, and Message are required.");

            try
            {
                string plantName = "";
                string? plantSpecies = null;
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();
                    using var cmd = new MySqlCommand("SELECT name, species FROM maxhanna.user_plants WHERE id = @PlantId", conn);
                    cmd.Parameters.AddWithValue("@PlantId", request.PlantId);
                    using var rdr = await cmd.ExecuteReaderAsync();
                    if (await rdr.ReadAsync())
                    {
                        plantName = rdr.GetString("name");
                        plantSpecies = rdr.IsDBNull(rdr.GetOrdinal("species")) ? null : rdr.GetString("species");
                    }
                }

                string systemPrompt = $"You are a knowledgeable plant expert assistant. The user is asking about their plant named \"{plantName}\"" +
                    $"{(plantSpecies != null ? $" (species: {plantSpecies})" : "")}. " +
                    "Answer their question helpfully and accurately based on plant care knowledge." +
                    (request.PhotoFileId.HasValue ? " Use the provided photo to inform your response." : "");

                string prompt = $"{systemPrompt}\n\nUser question: {request.Message}";

                string response;
                if (request.PhotoFileId.HasValue)
                    response = await _ai.SendVisionToAI(prompt, request.PhotoFileId.Value);
                else
                    response = await _ai.SendChatToAI(prompt);

                return Ok(new { Reply = response });
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error in ChatAboutPlant: {ex.Message}", request.UserId, "PLANTER", true);
                return StatusCode(500, new { Reply = "Chat failed." });
            }
        }

        private string GetAnalysisSystemPrompt(string analysisType, string plantName)
        {
            switch (analysisType.ToLower())
            {
                case "general":
                    return $"You are a botanist analyzing a photo of a plant named \"{plantName}\". " +
                        "Describe the plant in detail: identify its likely species or family, describe its visible characteristics " +
                        "(leaf shape, color, growth habit, size), and share interesting facts about where it originates from " +
                        "and its typical environment. If the species cannot be determined with certainty, suggest possibilities.";
                case "health":
                    return $"You are a plant health specialist analyzing a photo of \"{plantName}\". " +
                        "Assess the plant's overall health based on visible signs. Look for: " +
                        "- Leaf color (yellowing, browning, spots, wilting) " +
                        "- Signs of pests or disease " +
                        "- Signs of overwatering or underwatering " +
                        "- Light exposure issues (stretching, burning) " +
                        "- Overall vigor and growth " +
                        "Provide a health assessment with specific observations.";
                case "recommendations":
                    return $"You are a master gardener giving care advice for a plant named \"{plantName}\". " +
                        "Based on the visible condition of the plant in the photo, provide specific recommendations including: " +
                        "- Watering schedule and technique " +
                        "- Optimal sunlight and placement " +
                        "- Fertilizing needs " +
                        "- Pruning or grooming tips " +
                        "- Any treatments for visible issues " +
                        "Be practical and actionable.";
                default:
                    return $"Analyze this plant photo and provide useful information about \"{plantName}\".";
            }
        }

    }
}
