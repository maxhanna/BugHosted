using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;

namespace maxhanna.Server.Controllers;

[ApiController]
[Route("tomtom")]
public sealed class TomTomController : ControllerBase
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _cache;
    private readonly TimeSpan _defaultJsonCacheDuration = TimeSpan.FromSeconds(30);
    private static readonly SemaphoreSlim JsonCacheGate = new(1, 1);
    private const string TomTomRoot = "https://api.tomtom.com";

    public TomTomController(
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        IMemoryCache cache)
    {
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _cache = cache;
    }

    [HttpGet("traffic/flow-tile")]
    public async Task<IActionResult> GetFlowTile(
        [FromQuery] int z,
        [FromQuery] int x,
        [FromQuery] int y,
        CancellationToken cancellationToken)
    {
        if (z is < 5 or > 12) return BadRequest("Zoom must be between 5 and 12.");
        var tileCount = 1 << z;
        if (x < 0 || x >= tileCount || y < 0 || y >= tileCount)
            return BadRequest("Tile coordinates are outside the selected zoom.");

        var apiKey = GetApiKey();
        if (apiKey is null) return StatusCode(StatusCodes.Status503ServiceUnavailable, "TomTom API key is not configured on the server.");

        var url = $"{TomTomRoot}/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key={Uri.EscapeDataString(apiKey)}&tileSize=256";
        try
        {
            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);
            using var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
                return StatusCode((int)response.StatusCode, "TomTom traffic tile request failed.");

            var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
            Response.Headers.CacheControl = "no-store";
            return File(bytes, response.Content.Headers.ContentType?.MediaType ?? "image/png");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return StatusCode(StatusCodes.Status504GatewayTimeout, "TomTom traffic tile request timed out.");
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status502BadGateway, "TomTom traffic tile service is unavailable.");
        }
    }

    [HttpGet("incidents")]
    public Task<IActionResult> GetIncidents(
        [FromQuery] double minLon,
        [FromQuery] double minLat,
        [FromQuery] double maxLon,
        [FromQuery] double maxLat,
        CancellationToken cancellationToken)
    {
        if (!ValidBounds(minLon, minLat, maxLon, maxLat))
            return Task.FromResult<IActionResult>(BadRequest("Invalid incident search bounds."));

        var bbox = string.Join(',', new[] { minLon, minLat, maxLon, maxLat }.Select(FormatCoordinate));
        const string fields = "{incidents{type,geometry,properties{iconCategory,magnitudeOfDelay,events,from,to,length,delay,roadNumbers,timeValidity,probabilityOfOccurrence}}}";
        var url = $"{TomTomRoot}/traffic/services/5/incidentDetails?bbox={Uri.EscapeDataString(bbox)}&fields={Uri.EscapeDataString(fields)}&language=en-US&timeValidityFilter=present";
        return GetJson(url, $"incidents:{bbox}", cancellationToken);
    }

    [HttpGet("nearby-fuel")]
    public Task<IActionResult> GetNearbyFuel(
        [FromQuery] double lat,
        [FromQuery] double lon,
        [FromQuery] int radius = 5000,
        CancellationToken cancellationToken = default)
    {
        if (!ValidPoint(lat, lon) || radius is < 250 or > 20000)
            return Task.FromResult<IActionResult>(BadRequest("Provide a valid location and a radius from 250 to 20000 metres."));

        var latitude = FormatCoordinate(lat);
        var longitude = FormatCoordinate(lon);
        var url = $"{TomTomRoot}/search/2/poiSearch/gas%20station.json?lat={latitude}&lon={longitude}&radius={radius}&limit=30&language=en-US";
        return GetJson(url, $"fuel:{latitude}:{longitude}:{radius}", cancellationToken);
    }

    [HttpGet("reverse-geocode")]
    public Task<IActionResult> ReverseGeocode(
        [FromQuery] double lat,
        [FromQuery] double lon,
        CancellationToken cancellationToken)
    {
        if (!ValidPoint(lat, lon))
            return Task.FromResult<IActionResult>(BadRequest("Provide a valid latitude and longitude."));

        var latitude = FormatCoordinate(lat);
        var longitude = FormatCoordinate(lon);
        var url = $"{TomTomRoot}/search/2/reverseGeocode/{latitude},{longitude}.json?language=en-US";
        return GetJson(url, $"reverse:{latitude}:{longitude}", cancellationToken);
    }

    [HttpGet("traffic/flow-segment")]
    public Task<IActionResult> GetFlowSegment(
        [FromQuery] double lat,
        [FromQuery] double lon,
        [FromQuery] int zoom = 10,
        CancellationToken cancellationToken = default)
    {
        if (!ValidPoint(lat, lon) || zoom is < 5 or > 18)
            return Task.FromResult<IActionResult>(BadRequest("Provide a valid location and zoom from 5 to 18."));

        var point = $"{FormatCoordinate(lat)},{FormatCoordinate(lon)}";
        var url = $"{TomTomRoot}/traffic/services/4/flowSegmentData/relative/{zoom}/json?point={Uri.EscapeDataString(point)}&unit=kmph";
        return GetJson(url, $"flow-segment:{point}:{zoom}", cancellationToken);
    }

    private async Task<IActionResult> GetJson(string url, string cacheKey, CancellationToken cancellationToken)
    {
        var apiKey = GetApiKey();
        if (apiKey is null)
            return StatusCode(StatusCodes.Status503ServiceUnavailable, "TomTom API key is not configured on the server.");

        var separator = url.Contains('?') ? '&' : '?';
        var keyedUrl = $"{url}{separator}key={Uri.EscapeDataString(apiKey)}";
        var keyFingerprint = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(apiKey)))[..12];
        cacheKey = $"{cacheKey}:{keyFingerprint}";
        try
        {
            await JsonCacheGate.WaitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            return StatusCode(StatusCodes.Status504GatewayTimeout, "TomTom request was cancelled.");
        }
        try
        {
            if (_cache.TryGetValue(cacheKey, out string? cachedJson) && cachedJson is not null)
                return CachedJson(cachedJson);

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);
            using var response = await client.GetAsync(keyedUrl, cancellationToken);
            if (!response.IsSuccessStatusCode)
                return StatusCode((int)response.StatusCode, "TomTom data request failed.");

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            var cacheControl = response.Headers.CacheControl;
            // Honor explicit no-store/no-cache directives. For responses without
            // cache instructions, briefly reuse in process only; never persist licensed
            // TomTom data in the application's database without explicit permission.
            if (cacheControl?.NoStore != true && cacheControl?.NoCache != true)
            {
                var duration = cacheControl?.MaxAge ?? _defaultJsonCacheDuration;
                if (duration > TimeSpan.Zero)
                    _cache.Set(cacheKey, json, duration > TimeSpan.FromMinutes(5) ? TimeSpan.FromMinutes(5) : duration);
            }

            return CachedJson(json);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return StatusCode(StatusCodes.Status504GatewayTimeout, "TomTom data request timed out.");
        }
        catch (HttpRequestException)
        {
            return StatusCode(StatusCodes.Status502BadGateway, "TomTom service is unavailable.");
        }
        finally
        {
            JsonCacheGate.Release();
        }
    }

    private JsonResult CachedJson(string json)
    {
        Response.Headers.CacheControl = "no-store";
        using var document = JsonDocument.Parse(json);
        return new JsonResult(document.RootElement.Clone());
    }

    private string? GetApiKey()
    {
        var key = _configuration["Tomtom:ApiKey"] ?? _configuration["TomTom:ApiKey"];
        return string.IsNullOrWhiteSpace(key) ? null : key.Trim();
    }

    private static bool ValidPoint(double lat, double lon) =>
        double.IsFinite(lat) && double.IsFinite(lon) && lat is >= -90 and <= 90 && lon is >= -180 and <= 180;

    private static bool ValidBounds(double minLon, double minLat, double maxLon, double maxLat)
    {
        if (!double.IsFinite(minLon) || !double.IsFinite(minLat) || !double.IsFinite(maxLon) || !double.IsFinite(maxLat)) return false;
        if (minLon is < -180 or > 180 || maxLon is < -180 or > 180 || minLat is < -85 or > 85 || maxLat is < -85 or > 85) return false;
        if (minLon >= maxLon || minLat >= maxLat) return false;
        var approxAreaKm2 = (maxLon - minLon) * 111.32 * (maxLat - minLat) * 111.32
            * Math.Cos(((minLat + maxLat) / 2) * Math.PI / 180);
        return approxAreaKm2 <= 10000;
    }

    private static string FormatCoordinate(double value) => value.ToString("0.#####", CultureInfo.InvariantCulture);
}
