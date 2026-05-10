using Microsoft.AspNetCore.Mvc;
using MySqlConnector; 
using System.Net.Http;

[ApiController]
[Route("[controller]")]
public class TileCacheController : ControllerBase
{
    private readonly string _connectionString;
    private readonly HttpClient _httpClient;
    private const string ExternalTileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
    private const string PlaceholderPrefix = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT";

    public TileCacheController(IConfiguration configuration, IHttpClientFactory httpClientFactory)
    {
        _connectionString = configuration.GetValue<string>("ConnectionStrings:maxhanna") ?? "";
        _httpClient = httpClientFactory.CreateClient();
        _httpClient.Timeout = TimeSpan.FromSeconds(10);
    }

    public class TileRequest
    {
        public int Z { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
        public string? ImageData { get; set; }
    }

    public class TileBatchRequest
    {
        public List<TileRequest>? Tiles { get; set; }
    }

    [HttpGet]
    public async Task<IActionResult> GetTile([FromQuery] int z, [FromQuery] int x, [FromQuery] int y)
    {
        if (z <= 0 || x < 0 || y < 0) return BadRequest("Invalid parameters");

        try
        {             
            using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            var sql = @"SELECT image_data FROM maxhanna.tile_cache WHERE z = @z AND x = @x AND y = @y LIMIT 1";
            using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@z", z);
            cmd.Parameters.AddWithValue("@x", x);
            cmd.Parameters.AddWithValue("@y", y);

            var result = await cmd.ExecuteScalarAsync();
            if (result != null && result != DBNull.Value)
            {
                return Ok(new { imageData = result.ToString() });
            }
            
            // Fetch from external API and cache
            var imageData = await FetchAndCacheTileAsync(connection, z, x, y);
            if (imageData != null)
            {
                return Ok(new { imageData });
            }
            
            return NotFound();
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error: {ex.Message}");
        }
    }

    [HttpPost]
    public async Task<IActionResult> SaveTile([FromBody] TileRequest req)
    {
        if (string.IsNullOrEmpty(req.ImageData)) return BadRequest("Image data required");

        try
        { 
            using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            var sql = @"INSERT INTO maxhanna.tile_cache (z, x, y, image_data, created_at) 
                        VALUES (@z, @x, @y, @imageData, NOW())
                        ON DUPLICATE KEY UPDATE image_data = @imageData, created_at = NOW()";
            using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@z", req.Z);
            cmd.Parameters.AddWithValue("@x", req.X);
            cmd.Parameters.AddWithValue("@y", req.Y);
            cmd.Parameters.AddWithValue("@imageData", req.ImageData);

            await cmd.ExecuteNonQueryAsync();
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error: {ex.Message}");
        }
    }

    [HttpPost("getbatch")]
    public async Task<IActionResult> GetTileBatch([FromBody] TileBatchRequest batchReq)
    {
        if (batchReq?.Tiles == null || batchReq.Tiles.Count == 0) return BadRequest("No tiles provided");

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(HttpContext.RequestAborted);
        cts.CancelAfter(TimeSpan.FromSeconds(25));
        
        try
        {
            var requested = batchReq.Tiles
                .Where(t => t.Z > 0 && t.X >= 0 && t.Y >= 0)
                .GroupBy(t => $"{t.Z}/{t.X}/{t.Y}")
                .Select(g => g.First())
                .Take(256)
                .ToList();
            if (requested.Count == 0) return BadRequest("No valid tiles provided");

            using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync(cts.Token);

            var found = new Dictionary<string, string?>();
            var clauses = new List<string>();
            using (var cmd = new MySqlCommand { Connection = connection })
            {
                for (var i = 0; i < requested.Count; i++)
                {
                    var tile = requested[i];
                    clauses.Add($"(z = @z{i} AND x = @x{i} AND y = @y{i})");
                    cmd.Parameters.AddWithValue($"@z{i}", tile.Z);
                    cmd.Parameters.AddWithValue($"@x{i}", tile.X);
                    cmd.Parameters.AddWithValue($"@y{i}", tile.Y);
                }

                cmd.CommandText = $"SELECT z, x, y, image_data FROM maxhanna.tile_cache WHERE {string.Join(" OR ", clauses)}";
                await using var reader = await cmd.ExecuteReaderAsync(cts.Token);
                while (await reader.ReadAsync(cts.Token))
                {
                    var z = reader.GetInt32(reader.GetOrdinal("z"));
                    var x = reader.GetInt32(reader.GetOrdinal("x"));
                    var y = reader.GetInt32(reader.GetOrdinal("y"));
                    var imageData = reader.IsDBNull(reader.GetOrdinal("image_data"))
                        ? null
                        : reader.GetString(reader.GetOrdinal("image_data"));
                    if (IsUsefulImageData(imageData)) found[$"{z}/{x}/{y}"] = imageData;
                }
            }

            var misses = requested
                .Where(t => !found.ContainsKey($"{t.Z}/{t.X}/{t.Y}"))
                .ToList();

            if (misses.Count > 0)
            {
                using var semaphore = new SemaphoreSlim(8);
                var fetched = await Task.WhenAll(misses.Select(async tile =>
                {
                    await semaphore.WaitAsync(cts.Token);
                    try
                    {
                        return (tile, imageData: await FetchTileExternalAsync(tile.Z, tile.X, tile.Y, cts.Token));
                    }
                    catch
                    {
                        return (tile, imageData: (string?)null);
                    }
                    finally
                    {
                        semaphore.Release();
                    }
                }));

                foreach (var (tile, imageData) in fetched.Where(r => IsUsefulImageData(r.imageData)))
                {
                    await SaveTileDataAsync(connection, tile.Z, tile.X, tile.Y, imageData!, cts.Token);
                    found[$"{tile.Z}/{tile.X}/{tile.Y}"] = imageData;
                }
            }

            var results = requested.Select(tile => new
            {
                z = tile.Z,
                x = tile.X,
                y = tile.Y,
                imageData = found.TryGetValue($"{tile.Z}/{tile.X}/{tile.Y}", out var imageData) ? imageData : null
            });

            return Ok(results);
        }
        catch (OperationCanceledException)
        {
            return Ok(new List<object>());
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error: {ex.Message}");
        }
    }

    private static bool IsUsefulImageData(string? imageData)
    {
        return !string.IsNullOrWhiteSpace(imageData)
            && imageData.Length >= 500
            && !imageData.StartsWith(PlaceholderPrefix, StringComparison.Ordinal);
    }

    private async Task<string?> FetchTileExternalAsync(int z, int x, int y, CancellationToken ct)
    {
        var url = $"{ExternalTileUrl}/{z}/{y}/{x}";
        var response = await _httpClient.GetAsync(url, ct);
        if (!response.IsSuccessStatusCode) return null;

        var bytes = await response.Content.ReadAsByteArrayAsync(ct);
        if (bytes.Length < 500) return null;

        var dataUrl = $"data:image/jpeg;base64,{Convert.ToBase64String(bytes)}";
        return IsUsefulImageData(dataUrl) ? dataUrl : null;
    }

    private static async Task SaveTileDataAsync(
        MySqlConnection connection,
        int z,
        int x,
        int y,
        string imageData,
        CancellationToken ct)
    {
        var sql = @"INSERT INTO maxhanna.tile_cache (z, x, y, image_data, created_at) 
                    VALUES (@z, @x, @y, @imageData, NOW())
                    ON DUPLICATE KEY UPDATE image_data = @imageData, created_at = NOW()";
        using var cmd = new MySqlCommand(sql, connection);
        cmd.Parameters.AddWithValue("@z", z);
        cmd.Parameters.AddWithValue("@x", x);
        cmd.Parameters.AddWithValue("@y", y);
        cmd.Parameters.AddWithValue("@imageData", imageData);
        await cmd.ExecuteNonQueryAsync(ct);
    }
    
    private async Task<string?> FetchAndCacheTileAsync(MySqlConnection connection, int z, int x, int y)
    {
        try
        {
            var url = $"{ExternalTileUrl}/{z}/{y}/{x}";
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var response = await _httpClient.GetAsync(url, cts.Token);
            if (!response.IsSuccessStatusCode) return null;
            
            var bytes = await response.Content.ReadAsByteArrayAsync(cts.Token);
            
            // Skip very small images - these are likely placeholder/error images (like gray tiles)
            if (bytes.Length < 500) return null;
            
            var base64 = Convert.ToBase64String(bytes);
            var dataUrl = $"data:image/jpeg;base64,{base64}";
            
            // Skip specific placeholder image that contains no useful data
            if (dataUrl == "data:image/jpeg;base64,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") 
                return null;
            
            var sql = @"INSERT INTO maxhanna.tile_cache (z, x, y, image_data, created_at) 
                        VALUES (@z, @x, @y, @imageData, NOW())
                        ON DUPLICATE KEY UPDATE image_data = @imageData, created_at = NOW()";
            using var cmd = new MySqlCommand(sql, connection);
            cmd.Parameters.AddWithValue("@z", z);
            cmd.Parameters.AddWithValue("@x", x);
            cmd.Parameters.AddWithValue("@y", y);
            cmd.Parameters.AddWithValue("@imageData", dataUrl);
            await cmd.ExecuteNonQueryAsync();
            
            return dataUrl;
        }
        catch
        {
            return null;
        }
    }

    [HttpPost("batch")]
    public async Task<IActionResult> SaveTileBatch([FromBody] TileBatchRequest batchReq)
    {
        if (batchReq?.Tiles == null || batchReq.Tiles.Count == 0) return BadRequest("No tiles provided");

        try
        { 
            using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            foreach (var tile in batchReq.Tiles)
            {
                if (string.IsNullOrEmpty(tile.ImageData)) continue;
                
                var sql = @"INSERT INTO maxhanna.tile_cache (z, x, y, image_data, created_at) 
                            VALUES (@z, @x, @y, @imageData, NOW())
                            ON DUPLICATE KEY UPDATE image_data = @imageData, created_at = NOW()";
                using var cmd = new MySqlCommand(sql, connection);
                cmd.Parameters.AddWithValue("@z", tile.Z);
                cmd.Parameters.AddWithValue("@x", tile.X);
                cmd.Parameters.AddWithValue("@y", tile.Y);
                cmd.Parameters.AddWithValue("@imageData", tile.ImageData);
                await cmd.ExecuteNonQueryAsync();
            }
            
            return Ok(new { success = true, count = batchReq.Tiles.Count });
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error: {ex.Message}");
        }
    }
}
