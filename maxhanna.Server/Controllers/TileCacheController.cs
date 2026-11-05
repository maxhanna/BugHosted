using System.Collections.Concurrent;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("[controller]")]
public class TileCacheController : ControllerBase
{
    // Globe tiles are ordinary JPEGs, so they live on disk beside the other
    // uploads (game artwork, memes, planter photos) instead of as base64 blobs
    // in MySQL — one file per tile, never a database round trip.
    //
    // The file name alone identifies the tile, so a lookup is just a path:
    //     <TileRoot>/{z}/{x}_{y}.jpg        e.g. GlobeTiles/12/1523_2491.jpg
    // which is served to the client as
    //     /assets/Uploads/GlobeTiles/{z}/{x}_{y}.jpg
    private const string TileRoot = "E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/GlobeTiles/";
    private const string TileUrlRoot = "/assets/Uploads/GlobeTiles/";
    private const string ExternalTileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
    // Anything smaller is a placeholder/grey tile with no useful imagery.
    private const int MinTileBytes = 500;
    // Base64 of the blank placeholder ArcGIS returns where imagery is missing.
    private const string PlaceholderBase64Prefix = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT";
    private static readonly byte[] PlaceholderMagic = DecodeBase64Prefix(PlaceholderBase64Prefix);

    /// <summary>Decodes a (possibly clipped) base64 prefix into its leading bytes.</summary>
    private static byte[] DecodeBase64Prefix(string prefix)
    {
        var usable = prefix[..(prefix.Length - prefix.Length % 4)];
        return Convert.FromBase64String(usable);
    }

    private readonly HttpClient _httpClient;

    public TileCacheController(IHttpClientFactory httpClientFactory)
    {
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

    /// <summary>File path for a tile; the coordinates are the whole key.</summary>
    private static string TilePath(int z, int x, int y)
        => Path.Combine(TileRoot, z.ToString(), $"{x}_{y}.jpg");

    /// <summary>Static URL the client can load the tile from directly.</summary>
    private static string TileUrl(int z, int x, int y)
        => $"{TileUrlRoot}{z}/{x}_{y}.jpg";

    /// <summary>True when a usable tile file is already on disk for these coordinates.</summary>
    private static bool TileIsCached(int z, int x, int y)
    {
        try
        {
            var info = new FileInfo(TilePath(z, x, y));
            return info.Exists && info.Length >= MinTileBytes;
        }
        catch (IOException)
        {
            return false;
        }
    }

    /// <summary>
    /// Writes the tile next to its siblings, creating the zoom folder on first
    /// use. Written to a temp name and moved into place so a half-written file
    /// is never served.
    /// </summary>
    private static async Task<bool> WriteTileAsync(int z, int x, int y, byte[] bytes, CancellationToken ct)
    {
        if (bytes.Length < MinTileBytes) return false;
        try
        {
            var path = TilePath(z, x, y);
            System.IO.Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var temp = $"{path}.{Guid.NewGuid():N}.tmp";
            await System.IO.File.WriteAllBytesAsync(temp, bytes, ct);
            System.IO.File.Move(temp, path, overwrite: true);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Caching is opportunistic; a failed write just means a re-fetch later.
            return false;
        }
    }

    /// <summary>Decodes a "data:image/jpeg;base64,..." payload into raw bytes.</summary>
    private static byte[]? DecodeImageData(string? imageData)
    {
        if (string.IsNullOrWhiteSpace(imageData)) return null;
        var comma = imageData.IndexOf(',');
        var base64 = comma >= 0 ? imageData[(comma + 1)..] : imageData;
        try
        {
            return Convert.FromBase64String(base64);
        }
        catch (FormatException)
        {
            return null;
        }
    }

    private static bool IsUsefulTile(byte[] bytes)
    {
        if (bytes.Length < MinTileBytes) return false;
        // Compare the leading bytes against the blank placeholder JPEG.
        return !bytes.AsSpan().StartsWith(PlaceholderMagic);
    }

    [HttpGet]
    public async Task<IActionResult> GetTile([FromQuery] int z, [FromQuery] int x, [FromQuery] int y)
    {
        if (z <= 0 || x < 0 || y < 0) return BadRequest("Invalid parameters");

        if (TileIsCached(z, x, y))
        {
            // Stream straight off disk; the file name already is the cache key.
            return PhysicalFile(TilePath(z, x, y), "image/jpeg");
        }

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(HttpContext.RequestAborted);
        cts.CancelAfter(TimeSpan.FromSeconds(10));
        var bytes = await FetchTileExternalAsync(z, x, y, cts.Token);
        if (bytes == null) return NotFound();

        await WriteTileAsync(z, x, y, bytes, CancellationToken.None);
        return File(bytes, "image/jpeg");
    }

    [HttpPost]
    public async Task<IActionResult> SaveTile([FromBody] TileRequest req)
    {
        var bytes = DecodeImageData(req.ImageData);
        if (bytes == null || !IsUsefulTile(bytes)) return BadRequest("Image data required");

        var written = await WriteTileAsync(req.Z, req.X, req.Y, bytes, CancellationToken.None);
        return written
            ? Ok(new { success = true, url = TileUrl(req.Z, req.X, req.Y) })
            : StatusCode(500, "Could not write tile");
    }

    [HttpPost("batch")]
    public async Task<IActionResult> SaveTileBatch([FromBody] TileBatchRequest batchReq)
    {
        if (batchReq?.Tiles == null || batchReq.Tiles.Count == 0) return BadRequest("No tiles provided");

        var written = 0;
        foreach (var tile in batchReq.Tiles)
        {
            var bytes = DecodeImageData(tile.ImageData);
            if (bytes == null || !IsUsefulTile(bytes)) continue;
            if (await WriteTileAsync(tile.Z, tile.X, tile.Y, bytes, CancellationToken.None)) written++;
        }

        return Ok(new { success = true, count = written });
    }

    [HttpPost("getbatch")]
    public async Task<IActionResult> GetTileBatch([FromBody] TileBatchRequest batchReq)
    {
        if (batchReq?.Tiles == null || batchReq.Tiles.Count == 0) return BadRequest("No tiles provided");

        using var cts = CancellationTokenSource.CreateLinkedTokenSource(HttpContext.RequestAborted);
        cts.CancelAfter(TimeSpan.FromSeconds(25));

        var requested = batchReq.Tiles
            .Where(t => t.Z > 0 && t.X >= 0 && t.Y >= 0)
            .GroupBy(t => $"{t.Z}/{t.X}/{t.Y}")
            .Select(g => g.First())
            .Take(256)
            .ToList();
        if (requested.Count == 0) return BadRequest("No valid tiles provided");

        // Disk hits: the file name is the key, so this is a plain exists check.
        var found = new ConcurrentDictionary<string, string>();
        foreach (var tile in requested)
        {
            if (TileIsCached(tile.Z, tile.X, tile.Y))
            {
                found[$"{tile.Z}/{tile.X}/{tile.Y}"] = TileUrl(tile.Z, tile.X, tile.Y);
            }
        }

        var misses = requested.Where(t => !found.ContainsKey($"{t.Z}/{t.X}/{t.Y}")).ToList();
        if (misses.Count > 0)
        {
            using var semaphore = new SemaphoreSlim(8);
            await Task.WhenAll(misses.Select(async tile =>
            {
                try
                {
                    await semaphore.WaitAsync(cts.Token);
                }
                catch (OperationCanceledException)
                {
                    return;
                }

                try
                {
                    var bytes = await FetchTileExternalAsync(tile.Z, tile.X, tile.Y, cts.Token);
                    if (bytes != null && await WriteTileAsync(tile.Z, tile.X, tile.Y, bytes, cts.Token))
                    {
                        found[$"{tile.Z}/{tile.X}/{tile.Y}"] = TileUrl(tile.Z, tile.X, tile.Y);
                    }
                }
                catch (OperationCanceledException)
                {
                }
                catch
                {
                    // A missing tile stays missing; the client just draws nothing here.
                }
                finally
                {
                    semaphore.Release();
                }
            }));
        }

        var results = requested.Select(tile => new
        {
            z = tile.Z,
            x = tile.X,
            y = tile.Y,
            url = found.TryGetValue($"{tile.Z}/{tile.X}/{tile.Y}", out var url) ? url : null
        });

        return Ok(results);
    }

    private async Task<byte[]?> FetchTileExternalAsync(int z, int x, int y, CancellationToken ct)
    {
        var url = $"{ExternalTileUrl}/{z}/{y}/{x}";
        using var response = await _httpClient.GetAsync(url, ct);
        if (!response.IsSuccessStatusCode) return null;

        var bytes = await response.Content.ReadAsByteArrayAsync(ct);
        return IsUsefulTile(bytes) ? bytes : null;
    }
}
