using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using MySqlConnector;

namespace maxhanna.Server.Controllers;

[ApiController]
[Route("mtgarena")]
public sealed class MtgArenaController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _http;
    public MtgArenaController(IConfiguration config, IHttpClientFactory http) { _config = config; _http = http; }
    private string Cs => _config.GetValue<string>("ConnectionStrings:maxhanna") ?? string.Empty;

    [HttpGet("cards/{id}")]
    public async Task<IActionResult> Card(string id, CancellationToken ct)
    {
        await using var db = new MySqlConnection(Cs); await db.OpenAsync(ct);
        const string select = "SELECT scryfall_id AS id, name, image_uri AS imageUri, type_line AS typeLine, oracle_text AS oracleText, mana_cost AS manaCost FROM maxhanna.mtg_cards WHERE scryfall_id=@id LIMIT 1";
        await using var find = new MySqlCommand(select, db); find.Parameters.AddWithValue("@id", id);
        await using var reader = await find.ExecuteReaderAsync(ct);
        if (await reader.ReadAsync(ct)) return Ok(new { id = reader.GetString("id"), name = reader.GetString("name"), imageUri = reader.IsDBNull(reader.GetOrdinal("imageUri")) ? null : reader.GetString("imageUri"), typeLine = reader.IsDBNull(reader.GetOrdinal("typeLine")) ? null : reader.GetString("typeLine"), oracleText = reader.IsDBNull(reader.GetOrdinal("oracleText")) ? null : reader.GetString("oracleText"), manaCost = reader.IsDBNull(reader.GetOrdinal("manaCost")) ? null : reader.GetString("manaCost") });
        await reader.DisposeAsync();
        using var client = _http.CreateClient(); client.DefaultRequestHeaders.UserAgent.ParseAdd("BugHosted/1.0 contact@bughosted.com");
        using var response = await client.GetAsync($"https://api.scryfall.com/cards/{Uri.EscapeDataString(id)}", ct);
        if (!response.IsSuccessStatusCode) return StatusCode((int)response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct)); var root = doc.RootElement;
        var name = root.GetProperty("name").GetString() ?? id; var image = root.TryGetProperty("image_uris", out var images) && images.TryGetProperty("normal", out var normal) ? normal.GetString() : null;
        var type = root.TryGetProperty("type_line", out var typeEl) ? typeEl.GetString() : null; var oracle = root.TryGetProperty("oracle_text", out var oracleEl) ? oracleEl.GetString() : null; var mana = root.TryGetProperty("mana_cost", out var manaEl) ? manaEl.GetString() : null;
        await using var insert = new MySqlCommand("INSERT INTO maxhanna.mtg_cards (scryfall_id,name,image_uri,type_line,oracle_text,mana_cost,raw_json) VALUES (@id,@name,@image,@type,@oracle,@mana,@raw) ON DUPLICATE KEY UPDATE name=VALUES(name),image_uri=VALUES(image_uri),type_line=VALUES(type_line),oracle_text=VALUES(oracle_text),mana_cost=VALUES(mana_cost),raw_json=VALUES(raw_json)", db);
        insert.Parameters.AddWithValue("@id", id); insert.Parameters.AddWithValue("@name", name); insert.Parameters.AddWithValue("@image", image); insert.Parameters.AddWithValue("@type", type); insert.Parameters.AddWithValue("@oracle", oracle); insert.Parameters.AddWithValue("@mana", mana); insert.Parameters.AddWithValue("@raw", root.GetRawText()); await insert.ExecuteNonQueryAsync(ct);
        return Ok(new { id, name, imageUri = image, typeLine = type, oracleText = oracle, manaCost = mana });
    }

    [HttpGet("lobby")]
    public IActionResult Lobby() => Ok(new { roomId = "digcraft-main", players = Array.Empty<object>() });

    [HttpGet("decks")]
    public async Task<IActionResult> Decks(int userId, CancellationToken ct) { if (userId <= 0) return Ok(Array.Empty<object>()); return Ok(Array.Empty<object>()); }

    [HttpPost("decks/starter")]
    public IActionResult Starter([FromBody] UserRequest request) => Ok(new { id = 0, name = "Starter Spark", cards = Array.Empty<object>() });

    [HttpPost("challenges")]
    public IActionResult Challenge([FromBody] ChallengeRequest request) => Ok(new { accepted = true, roomId = "digcraft-main" });

    public sealed record UserRequest(int UserId);
    public sealed record ChallengeRequest(int UserId, int OpponentId);
}
