using Microsoft.AspNetCore.Mvc;
using MySqlConnector; 

[ApiController]
[Route("[controller]")]
public class TileCacheController : ControllerBase
{
    private readonly string _connectionString;

    public TileCacheController(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection") ?? "";
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

        try
        {             
            using var connection = new MySqlConnection(_connectionString);
            await connection.OpenAsync();

            var results = new List<object>();
            
            foreach (var tile in batchReq.Tiles)
            {
                var sql = @"SELECT image_data FROM maxhanna.tile_cache WHERE z = @z AND x = @x AND y = @y LIMIT 1";
                using var cmd = new MySqlCommand(sql, connection);
                cmd.Parameters.AddWithValue("@z", tile.Z);
                cmd.Parameters.AddWithValue("@x", tile.X);
                cmd.Parameters.AddWithValue("@y", tile.Y);

                var result = await cmd.ExecuteScalarAsync();
                results.Add(new { 
                    z = tile.Z, 
                    x = tile.X, 
                    y = tile.Y,
                    imageData = result != null && result != DBNull.Value ? result.ToString() : null 
                });
            }
            
            return Ok(results);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error: {ex.Message}");
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