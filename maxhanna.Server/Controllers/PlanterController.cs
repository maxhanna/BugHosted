using maxhanna.Server.Controllers.DataContracts.Planter;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;
using System.Text;
using System.Text.Json;

namespace maxhanna.Server.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class PlanterController : ControllerBase
    {
        private readonly IConfiguration _config;
        private readonly Log _log;
        private readonly HttpClient _ollamaClient;
        private readonly string _plantPhotoDirectory;
        private readonly string _visionModel;

        public PlanterController(IConfiguration config, Log log)
        {
            _config = config;
            _log = log;
            _ollamaClient = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
            _plantPhotoDirectory = _config.GetValue<string>("Planter:PhotoDirectory") ??
                Path.Combine(Directory.GetCurrentDirectory(), "../maxhanna.client/src/assets/Uploads/PlantPhotos/");
            _visionModel = _config.GetValue<string>("Planter:Model") ?? "gemma3:4b";
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
                    INSERT INTO maxhanna.file_uploads (file_name, folder_path, file_type, file_size, upload_date, is_public, last_updated, access_count)
                    VALUES (@FileName, @FolderPath, @FileType, @FileSize, UTC_TIMESTAMP(), FALSE, UTC_TIMESTAMP(), 0);
                    SELECT LAST_INSERT_ID();";
                using var fileCmd = new MySqlCommand(fileSql, conn);
                fileCmd.Parameters.AddWithValue("@FileName", fileName);
                fileCmd.Parameters.AddWithValue("@FolderPath", _plantPhotoDirectory);
                fileCmd.Parameters.AddWithValue("@FileType", ext.TrimStart('.'));
                fileCmd.Parameters.AddWithValue("@FileSize", file.Length);
                var fileId = Convert.ToInt32(await fileCmd.ExecuteScalarAsync());

                return Ok(new { FileId = fileId, FileName = fileName });
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
                        INSERT INTO maxhanna.file_uploads (file_name, folder_path, file_type, file_size, upload_date, is_public, last_updated, access_count)
                        VALUES (@FileName, @FolderPath, @FileType, @FileSize, UTC_TIMESTAMP(), FALSE, UTC_TIMESTAMP(), 0);
                        SELECT LAST_INSERT_ID();";
                    using var fileCmd = new MySqlCommand(fileSql, conn, tx);
                    fileCmd.Parameters.AddWithValue("@FileName", fileName);
                    fileCmd.Parameters.AddWithValue("@FolderPath", _plantPhotoDirectory);
                    fileCmd.Parameters.AddWithValue("@FileType", ext.TrimStart('.'));
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
        public async Task<IActionResult> DeletePhoto([FromQuery] int photoId, [FromQuery] int userId)
        {
            try
            {
                using var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna"));
                await conn.OpenAsync();

                var getSql = @"
                    SELECT pp.file_id, fu.file_name, fu.folder_path
                    FROM maxhanna.plant_photos pp
                    LEFT JOIN maxhanna.file_uploads fu ON pp.file_id = fu.id
                    WHERE pp.id = @PhotoId";
                using var getCmd = new MySqlCommand(getSql, conn);
                getCmd.Parameters.AddWithValue("@PhotoId", photoId);
                using var rdr = await getCmd.ExecuteReaderAsync();
                if (!await rdr.ReadAsync())
                    return NotFound("Photo not found.");

                var fileId = rdr.GetInt32("file_id");
                var fileName = rdr.IsDBNull(rdr.GetOrdinal("file_name")) ? null : rdr.GetString("file_name");
                var folderPath = rdr.IsDBNull(rdr.GetOrdinal("folder_path")) ? null : rdr.GetString("folder_path");
                rdr.Close();

                using var tx = conn.BeginTransaction();
                try
                {
                    await new MySqlCommand("DELETE FROM maxhanna.plant_photos WHERE id = @PhotoId", conn, tx) { Parameters = { new MySqlParameter("@PhotoId", photoId) } }.ExecuteNonQueryAsync();
                    await new MySqlCommand("DELETE FROM maxhanna.file_uploads WHERE id = @FileId", conn, tx) { Parameters = { new MySqlParameter("@FileId", fileId) } }.ExecuteNonQueryAsync();
                    await tx.CommitAsync();

                    if (fileName != null && folderPath != null)
                    {
                        try { System.IO.File.Delete(Path.Combine(folderPath, fileName)); } catch { }
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
                    SELECT pp.id, pp.plant_id, pp.file_id, pp.created_at,
                           fu.file_name, fu.folder_path
                    FROM maxhanna.plant_photos pp
                    LEFT JOIN maxhanna.file_uploads fu ON pp.file_id = fu.id
                    WHERE pp.plant_id = @PlantId
                    ORDER BY pp.created_at DESC";

                using var cmd = new MySqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@PlantId", plantId);
                using var reader = await cmd.ExecuteReaderAsync();

                var photos = new List<PlantPhoto>();
                while (await reader.ReadAsync())
                {
                    photos.Add(new PlantPhoto
                    {
                        Id = reader.GetInt32("id"),
                        PlantId = reader.GetInt32("plant_id"),
                        FileId = reader.GetInt32("file_id"),
                        FileName = reader.IsDBNull(reader.GetOrdinal("file_name")) ? null : reader.GetString("file_name"),
                        FilePath = reader.IsDBNull(reader.GetOrdinal("folder_path")) ? null : reader.GetString("folder_path"),
                        CreatedAt = reader.GetDateTime("created_at")
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

                var imageBase64 = await LoadImageAsBase64(request.PhotoFileId);
                if (string.IsNullOrEmpty(imageBase64))
                    return StatusCode(500, "Failed to load plant photo.");

                string systemPrompt = GetAnalysisSystemPrompt(request.AnalysisType, plantName);

                var response = await SendVisionToOllama(systemPrompt, imageBase64);

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
                var imageBase64 = await LoadImageAsBase64(request.PhotoFileId);
                if (string.IsNullOrEmpty(imageBase64))
                    return StatusCode(500, "Failed to load photo.");

                string systemPrompt = "You are a botanist identifying a plant from a photo. " +
                    "Respond with ONLY a valid JSON object in this exact format (no markdown, no code fences): " +
                    "{ \"suggestions\": [ " +
                    "{ \"name\": \"Common plant name\", \"species\": \"Scientific name\", \"reason\": \"Brief reason for identification\" } " +
                    "], \"topPick\": { \"name\": \"Best guess common name\", \"species\": \"Best guess scientific name\" } }. " +
                    "Include 3-5 suggestions. The first/topPick should be your most confident identification. " +
                    "Use empty strings if uncertain rather than guessing scientific names.";

                var responseText = await SendVisionToOllama(systemPrompt, imageBase64);
                if (string.IsNullOrEmpty(responseText))
                    return Ok(new IdentifyPlantResponse { Suggestions = new List<PlantSuggestion>(), TopPick = new PlantSuggestion() });

                try
                {
                    var parsed = JsonSerializer.Deserialize<IdentifyPlantResponse>(responseText, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (parsed?.Suggestions != null && parsed.Suggestions.Count > 0)
                        return Ok(parsed);
                }
                catch { }

                return Ok(new IdentifyPlantResponse
                {
                    Suggestions = new List<PlantSuggestion>
                    {
                        new PlantSuggestion { Name = responseText.Length > 80 ? responseText.Substring(0, 80) : responseText, Reason = "AI identified" }
                    },
                    TopPick = new PlantSuggestion { Name = responseText.Length > 80 ? responseText.Substring(0, 80).TrimEnd('.', ',', ' ') : responseText }
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

                string? imageBase64 = null;
                if (request.PhotoFileId.HasValue)
                    imageBase64 = await LoadImageAsBase64(request.PhotoFileId.Value);

                string systemPrompt = $"You are a knowledgeable plant expert assistant. The user is asking about their plant named \"{plantName}\"" +
                    $"{(plantSpecies != null ? $" (species: {plantSpecies})" : "")}. " +
                    "Answer their question helpfully and accurately based on plant care knowledge." +
                    (imageBase64 != null ? " Use the provided photo to inform your response." : "");

                string prompt = $"{systemPrompt}\n\nUser question: {request.Message}";

                string response;
                if (imageBase64 != null)
                    response = await SendVisionToOllama(prompt, imageBase64);
                else
                    response = await SendTextToOllama(prompt);

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

        private async Task<string?> LoadImageAsBase64(int fileId)
        {
            try
            {
                string? fileName = null;
                string? folderPath = null;
                using (var conn = new MySqlConnection(_config.GetValue<string>("ConnectionStrings:maxhanna")))
                {
                    await conn.OpenAsync();
                    using var cmd = new MySqlCommand("SELECT file_name, folder_path FROM maxhanna.file_uploads WHERE id = @FileId", conn);
                    cmd.Parameters.AddWithValue("@FileId", fileId);
                    using var rdr = await cmd.ExecuteReaderAsync();
                    if (await rdr.ReadAsync())
                    {
                        fileName = rdr.GetString("file_name");
                        folderPath = rdr.GetString("folder_path");
                    }
                }

                if (fileName == null || folderPath == null) return null;

                var fullPath = Path.Combine(folderPath, fileName);
                if (!System.IO.File.Exists(fullPath)) return null;

                var ext = Path.GetExtension(fileName).ToLower().TrimStart('.');
                var mimeType = ext switch
                {
                    "jpg" or "jpeg" => "image/jpeg",
                    "png" => "image/png",
                    "gif" => "image/gif",
                    "webp" => "image/webp",
                    "bmp" => "image/bmp",
                    _ => "image/jpeg"
                };

                var bytes = await System.IO.File.ReadAllBytesAsync(fullPath);
                return $"data:{mimeType};base64,{Convert.ToBase64String(bytes)}";
            }
            catch (Exception ex)
            {
                _ = _log.Db($"Error loading image for analysis: {ex.Message}", null, "PLANTER", true);
                return null;
            }
        }

        private async Task<string> SendVisionToOllama(string prompt, string base64Image)
        {
            var payload = new
            {
                model = _visionModel,
                stream = false,
                messages = new[]
                {
                    new
                    {
                        role = "user",
                        content = prompt,
                        images = new[] { StripDataUriPrefix(base64Image) }
                    }
                },
                options = new { num_ctx = 2048, temperature = 0.3 }
            };

            var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions
            {
                Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            });

            using var req = new HttpRequestMessage(HttpMethod.Post, "http://localhost:11434/api/chat")
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };

            using var resp = await _ollamaClient.SendAsync(req);
            var body = await resp.Content.ReadAsStringAsync();

            if (!resp.IsSuccessStatusCode)
            {
                _ = _log.Db($"Ollama vision error {(int)resp.StatusCode}: {body}", null, "PLANTER", true);
                return "Analysis service unavailable.";
            }

            var parsed = JsonSerializer.Deserialize<JsonElement>(body);
            return parsed.GetProperty("message").GetProperty("content").GetString() ?? "No analysis returned.";
        }

        private async Task<string> SendTextToOllama(string prompt)
        {
            var payload = new
            {
                model = _visionModel,
                prompt,
                stream = false,
                options = new { temperature = 0.3 }
            };

            var json = JsonSerializer.Serialize(payload);
            using var req = new HttpRequestMessage(HttpMethod.Post, "http://localhost:11434/api/generate")
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };

            using var resp = await _ollamaClient.SendAsync(req);
            var body = await resp.Content.ReadAsStringAsync();

            if (!resp.IsSuccessStatusCode)
            {
                _ = _log.Db($"Ollama text error {(int)resp.StatusCode}: {body}", null, "PLANTER", true);
                return "Chat service unavailable.";
            }

            var parsed = JsonSerializer.Deserialize<JsonElement>(body);
            return parsed.GetProperty("response").GetString() ?? "No response.";
        }

        private static string StripDataUriPrefix(string input)
        {
            if (string.IsNullOrWhiteSpace(input)) return string.Empty;
            int commaIdx = input.IndexOf(',');
            return commaIdx >= 0 ? input.Substring(commaIdx + 1).Trim() : input.Trim();
        }
    }
}
