using MySqlConnector;
using System.Text;

namespace maxhanna.Server.Services
{
  /// <summary>
  /// Enriches ROM files with IGDB metadata. Designed to be registered as a singleton
  /// and called from one or more background timers. A SemaphoreSlim(1,1) guarantees
  /// only one enrichment run is active at a time — overlapping callers return immediately.
  /// </summary>
  public class RomEnrichmentService
  {
    private readonly string _connectionString;
    private readonly string _romFolder = "E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Roms/";
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _config;
    private readonly Log _log;
    private static readonly SemaphoreSlim _runLock = new SemaphoreSlim(1, 1);

    public RomEnrichmentService(IConfiguration config, Log log)
    {
      _config = config;
      _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna")!;
      _httpClient = new HttpClient();
      _log = log;
    }

    /// <summary>
    /// Run one enrichment pass. If a previous run is still in progress the call
    /// returns immediately (no queuing, no overlap).
    /// </summary>
    public async Task RunAsync(CancellationToken ct = default)
    {
      if (!await _runLock.WaitAsync(0, ct))
      {
        await _log.Db("IGDB enrichment already running — skipping overlapping call.", null, "IGDB", outputToConsole: true);
        return;
      }

      try
      {
        await EnrichRomsFromIgdb(ct);
      }
      catch(Exception ex)
      {
        await _log.Db($"IGDB enrichment failed: {ex.Message}", null, "IGDB", outputToConsole: true);
      }
      finally
      {
        _runLock.Release();
      }
    }

    // =====================================================================
    //  The full enrichment method (moved verbatim from SystemBackgroundService)
    // =====================================================================
    private async Task EnrichRomsFromIgdb(CancellationToken ct = default)
    {
      // IGDB: 4 req/sec and 8 open requests max. Keep it sequential with a small delay.
      const int batchSize = 25;
      const int perRequestDelayMs = 300;
      _ = _log.Db("Starting IGDB enrichment pass...", null, "IGDB", outputToConsole: true);
      // ---- local helpers ----

      static string StripDiacritics(string text)
      {
        var normalized = text.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(normalized.Length);
        foreach (var c in normalized)
        {
          if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c)
              != System.Globalization.UnicodeCategory.NonSpacingMark)
            sb.Append(c);
        }
        return sb.ToString().Normalize(NormalizationForm.FormC);
      }

      static int LevenshteinDistance(string s, string t)
      {
        int n = s.Length, m = t.Length;
        var d = new int[n + 1, m + 1];
        for (int i = 0; i <= n; i++) d[i, 0] = i;
        for (int j = 0; j <= m; j++) d[0, j] = j;
        for (int i = 1; i <= n; i++)
          for (int j = 1; j <= m; j++)
            d[i, j] = Math.Min(
              Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1),
              d[i - 1, j - 1] + (s[i - 1] == t[j - 1] ? 0 : 1));
        return d[n, m];
      }

      static string CleanTitle(string fileName)
      {
        var stem = Path.GetFileNameWithoutExtension(fileName) ?? fileName;

        // Strip diacritics early: é→e, ü→u, ñ→n, etc.
        stem = StripDiacritics(stem);

        // Strip version tokens in parens/brackets: (v1.2.3), [v26-02-26], (r11)
        stem = System.Text.RegularExpressions.Regex.Replace(stem, @"\(\s*[vVrR]\.?\d+(?:[\.\-]\d+)*[a-zA-Z]*\s*\)", " ");
        stem = System.Text.RegularExpressions.Regex.Replace(stem, @"\[\s*[vVrR]\.?\d+(?:[\.\-]\d+)*[a-zA-Z]*\s*\]", " ");
        // Standalone version tokens: v26-02-26, v1.2.3, r.11, v2beta
        stem = System.Text.RegularExpressions.Regex.Replace(stem, @"(?<=^|[\s_\-\.])[vVrR]\.?\d+(?:[\.\-]\d+)*[a-zA-Z]*(?=$|[\s_\-\.])", " ");

        // Strip trailing bare date-like suffixes: "title 26-02-26", "title 2024-01-15"
        stem = System.Text.RegularExpressions.Regex.Replace(stem, @"\s+\d{1,4}[\-\.]\d{1,2}[\-\.]\d{1,4}\s*$", " ");

        // Remove trailing hash-system tags like " # GBC", " # GB", etc.
        stem = System.Text.RegularExpressions.Regex.Replace(
          stem,
          @"\s*#\s*(GB|GBC|GBA|NES|SNES|SFC|N64|NDS|PSX|PS1|PSP|GEN|MD|MAME)\s*$",
          " ",
          System.Text.RegularExpressions.RegexOptions.IgnoreCase
        );

        // Strip common ROM tags: (USA), [!], (Rev A), etc.
        stem = System.Text.RegularExpressions.Regex.Replace(stem, @"\[[^\]]*\]|\([^\)]*\)", " ");

        // Normalize letter-dot acronyms: "S.W.A.R.M." -> "SWARM"
        stem = System.Text.RegularExpressions.Regex.Replace(
          stem,
          @"\b(?:[A-Za-z]\.){2,}[A-Za-z]?\b",
          m => m.Value.Replace(".", "")
        );

        stem = stem.Replace("_", " ");
        stem = System.Text.RegularExpressions.Regex.Replace(stem, @"\s+", " ").Trim();
        return stem;
      }

      static IReadOnlyList<string> ExtractTags(string fileName)
      {
        var tags = new List<string>();
        var stem = Path.GetFileNameWithoutExtension(fileName) ?? fileName;

        foreach (System.Text.RegularExpressions.Match m in
                 System.Text.RegularExpressions.Regex.Matches(stem, @"\(([^)]*)\)|\[([^\]]*)\]"))
        {
          var val = (m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value) ?? "";
          val = val.Trim();
          if (!string.IsNullOrWhiteSpace(val))
            tags.Add(val);
        }

        var hashMatch = System.Text.RegularExpressions.Regex.Match(
          stem,
          @"#\s*(GB|GBC|GBA|NES|SNES|SFC|N64|NDS|PSX|PS1|PSP|GEN|MD|MAME)\b",
          System.Text.RegularExpressions.RegexOptions.IgnoreCase
        );

        if (hashMatch.Success)
          tags.Add(hashMatch.Groups[1].Value.Trim());

        return tags;
      }

      static int[]? InferPlatformIds(string fileExt, IReadOnlyList<string> tags)
      {
        var tag = tags
          .SelectMany(t => System.Text.RegularExpressions.Regex.Split(t, @"[^A-Za-z0-9]+"))
          .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x)) ?? "";

        var tagMap = new Dictionary<string, int[]>(StringComparer.OrdinalIgnoreCase)
        {
          ["GBC"] = new[] { 22 }, // Game Boy Color
          ["GB"]  = new[] { 33 }, // Game Boy
          ["N64"] = new[] { 4  }, // Nintendo 64
          ["PS1"] = new[] { 7  }, // PlayStation
          ["PSX"] = new[] { 7  },
        };

        if (!string.IsNullOrWhiteSpace(tag) && tagMap.TryGetValue(tag, out var tagIds))
          return tagIds;

        var extMap = new Dictionary<string, int[]>(StringComparer.OrdinalIgnoreCase)
        {
          ["gbc"] = new[] { 22 },
          ["gb"]  = new[] { 33 },
        };

        return extMap.TryGetValue(fileExt, out var extIds) ? extIds : null;
      }

      static bool IsArchiveExt(string ext) => ext is "zip" or "7z" or "rar";

      static string[]? InferPlatformKeywords(string fileExt, IReadOnlyList<string> tags)
      {
        var tagMap = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
          { "GB",   new[] { "game boy" } },
          { "GBC",  new[] { "game boy color", "game boy" } },
          { "GBA",  new[] { "game boy advance", "gba" } },
          { "NES",  new[] { "nintendo entertainment system", "nes", "famicom" } },
          { "SNES", new[] { "super nintendo", "super nintendo entertainment system", "snes", "super famicom" } },
          { "SFC",  new[] { "super nintendo", "super nintendo entertainment system", "snes", "super famicom" } },
          { "N64",  new[] { "nintendo 64", "n64" } },
          { "NDS",  new[] { "nintendo ds", "nds" } },
          { "PSX",  new[] { "playstation", "ps1", "playstation 1" } },
          { "PS1",  new[] { "playstation", "ps1", "playstation 1" } },
          { "PSP",  new[] { "playstation portable", "psp" } },
          { "GEN",  new[] { "genesis", "mega drive" } },
          { "MD",   new[] { "mega drive", "genesis", "sega mega drive/genesis" } },
          { "MAME", new[] { "arcade", "mame" } },
          { "SAT", new[] { "sega saturn", "saturn" } },
          { "SATURN", new[] { "sega saturn", "saturn" } },
          { "SS", new[] { "sega saturn", "saturn" } },
          { "GG", new[] { "sega game gear", "game gear", "gamegear" } },
          { "GAMEGEAR", new[] { "sega game gear", "game gear", "gamegear" } }
        };

        foreach (var t in tags)
        {
          var parts = System.Text.RegularExpressions.Regex
            .Split(t, @"[^A-Za-z0-9]+")
            .Where(p => !string.IsNullOrWhiteSpace(p));

          foreach (var p in parts)
          {
            var key = p.Trim();
            if (tagMap.TryGetValue(key, out var kws))
              return kws;
          }
        }

        if (IsArchiveExt(fileExt))
          return null;

        var extMap = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
          { "gba",  new[] { "game boy advance", "gba" } },
          { "gb",   new[] { "game boy" } },
          { "gbc",  new[] { "game boy color", "game boy" } },
          { "nes",  new[] { "nintendo entertainment system", "nes", "famicom" } },
          { "snes", new[] { "super nintendo", "snes", "super famicom" } },
          { "sfc",  new[] { "super nintendo", "snes", "super famicom" } },
          { "n64",  new[] { "nintendo 64", "n64" } },
          { "nds",  new[] { "nintendo ds", "nds" } },
          { "psp",  new[] { "playstation portable", "psp" } },
          { "pbp",  new[] { "playstation portable", "psp" } },
          { "md",   new[] { "mega drive", "genesis" } },
          { "gen",  new[] { "mega drive", "genesis" } },
          { "bin",  new[] { "playstation", "ps1", "playstation 1", "playstation portable", "psp" } },
          { "cue",  new[] { "playstation", "ps1", "playstation 1", "playstation portable", "psp" } },
          { "iso",  new[] { "playstation", "ps1", "playstation 1", "playstation portable", "psp" } },
          { "gg",   new[] { "sega game gear", "game gear" } },
        };

        return extMap.TryGetValue(fileExt, out var extKws) ? extKws : null;
      }

      static bool CandidateMatchesPlatform(Newtonsoft.Json.Linq.JObject c, string[] kws)
      {
        var pnames = c.SelectTokens("platforms[*].name")
          .Select(x => x.ToString())
          .Where(s => !string.IsNullOrWhiteSpace(s))
          .Select(s => s.ToLowerInvariant())
          .ToList();

        if (pnames.Count == 0) return false;

        foreach (var pname in pnames)
          foreach (var kw in kws)
            if (pname.Contains(kw, StringComparison.OrdinalIgnoreCase))
              return true;

        return false;
      }

      static string Norm(string x)
      {
        x = StripDiacritics(x ?? "").ToLowerInvariant();
        x = System.Text.RegularExpressions.Regex.Replace(x, @"[^a-z0-9]+", " ").Trim();
        return x;
      }

      static string CleanComparison(string s)
      {
        if (string.IsNullOrWhiteSpace(s)) return "";
        s = StripDiacritics(s);
        s = System.Text.RegularExpressions.Regex.Replace(s, "\\([^)]*\\)|\\[[^\\]]*\\]", " ");
        s = System.Text.RegularExpressions.Regex.Replace(s, @"\(\s*[vVrR]\.?\d+(?:[\.\-]\d+)*[a-zA-Z]*\s*\)", " ");
        s = System.Text.RegularExpressions.Regex.Replace(s, @"\[\s*[vVrR]\.?\d+(?:[\.\-]\d+)*[a-zA-Z]*\s*\]", " ");
        s = System.Text.RegularExpressions.Regex.Replace(s, @"(?<=^|[\s_\-\.\\/])[vVrR]\.?\d+(?:[\.\-]\d+)*[a-zA-Z]*(?=$|[\s_\-\.\\/])", " ");
        s = System.Text.RegularExpressions.Regex.Replace(s, @"\s+\d{1,4}[\-\.]\d{1,2}[\-\.]\d{1,4}\s*$", " ");
        s = System.Text.RegularExpressions.Regex.Replace(s, @"\b(?:[A-Za-z]\.){2,}[A-Za-z]?\b", m => m.Value.Replace(".", ""));
        s = s.Replace("_", " ").Replace("-", " ").Replace("/", " ").Replace("\\", " ").Replace(".", " ");
        s = System.Text.RegularExpressions.Regex.Replace(s, @"^\W+|\W+$", "");
        s = System.Text.RegularExpressions.Regex.Replace(s, @"\s+", " ").Trim();
        return s;
      }

      static int ScoreName(string candidateName, string cleanedTitle)
      {
        var a = Norm(CleanComparison(cleanedTitle));
        var b = Norm(CleanComparison(candidateName));

        if (string.IsNullOrWhiteSpace(a) || string.IsNullOrWhiteSpace(b))
          return 0;

        int score = 0;

        // Exact normalized match
        if (b == a) score += 1000;

        // Substring containment
        if (b.Contains(a) || a.Contains(b)) score += 250;

        // Word-level Jaccard overlap
        var wordsA = new HashSet<string>(a.Split(' ', StringSplitOptions.RemoveEmptyEntries));
        var wordsB = new HashSet<string>(b.Split(' ', StringSplitOptions.RemoveEmptyEntries));
        if (wordsA.Count > 0 && wordsB.Count > 0)
        {
          int intersection = wordsA.Intersect(wordsB).Count();
          int union = wordsA.Union(wordsB).Count();
          double jaccard = (double)intersection / union;
          score += (int)(jaccard * 500);

          // Bonus if one title's words are a complete subset of the other
          int minCount = Math.Min(wordsA.Count, wordsB.Count);
          if (minCount > 0 && intersection == minCount)
            score += 200;
        }

        // Levenshtein similarity bonus for reasonably short strings
        if (a.Length <= 50 && b.Length <= 50)
        {
          int maxLen = Math.Max(a.Length, b.Length);
          int dist = LevenshteinDistance(a, b);
          double similarity = 1.0 - ((double)dist / maxLen);
          if (similarity >= 0.75)
            score += (int)(similarity * 200);
        }

        return score;
      }

      static int ScoreCandidateImproved(Newtonsoft.Json.Linq.JObject g, string cleanedTitle, string[]? platformKws)
      {
        var bestNameScore = ScoreName(g.Value<string>("name") ?? "", cleanedTitle);

        var altNames = g.SelectTokens("alternative_names[*].name")
          .Select(x => x.ToString())
          .Where(s => !string.IsNullOrWhiteSpace(s))
          .Take(20)
          .ToList();

        foreach (var alt in altNames)
          bestNameScore = Math.Max(bestNameScore, ScoreName(alt, cleanedTitle));

        bestNameScore += (g.Value<int?>("total_rating_count") ?? 0) / 10;

        if (platformKws != null && platformKws.Length > 0)
        {
          bool hasPlatforms = g.SelectTokens("platforms[*].name").Any();
          if (hasPlatforms)
          {
            bool match = CandidateMatchesPlatform(g, platformKws);
            bestNameScore += match ? 600 : -600;
          }
        }

        if (g.SelectTokens("platforms[*].name").Any()) bestNameScore += 25;
        if (!string.IsNullOrWhiteSpace(g.Value<string>("summary"))) bestNameScore += 10;

        return bestNameScore;
      }

      static string Esc(string s) => (s ?? "").Replace("\"", "\\\"");
      static string IgdbImageUrl(string imageId, string size) => $"https://images.igdb.com/igdb/image/upload/{size}/{imageId}.jpg";

      static IEnumerable<string> BuildSearchTerms(string titleGuess)
      {
        yield return titleGuess;

        var t2 = titleGuess.Replace(" - ", ": ").Replace("–", ":").Replace("—", ":");
        if (!string.Equals(t2, titleGuess, StringComparison.OrdinalIgnoreCase))
          yield return t2;

        var t3 = System.Text.RegularExpressions.Regex.Replace(t2, @"\b(the|a|an)\b\s+", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim();
        t3 = System.Text.RegularExpressions.Regex.Replace(t3, @"\bamazing\b\s+", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim();
        if (!string.IsNullOrWhiteSpace(t3) && !string.Equals(t3, t2, StringComparison.OrdinalIgnoreCase))
          yield return t3;

        var tokens = Norm(t3).Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length > 8)
        {
          var t4 = string.Join(' ', tokens.Take(8));
          yield return t4;
        }

        var key = tokens.Where(w => w.Length >= 4).Take(6).ToArray();
        if (key.Length >= 3)
          yield return string.Join(' ', key);
      }

      async Task<string> GetTwitchAppAccessTokenAsync(string clientId, string clientSecret)
      {
        var url =
          $"https://id.twitch.tv/oauth2/token" +
          $"?client_id={Uri.EscapeDataString(clientId)}" +
          $"&client_secret={Uri.EscapeDataString(clientSecret)}" +
          $"&grant_type=client_credentials";

        using var resp = await _httpClient.PostAsync(url, content: null, ct);
        resp.EnsureSuccessStatusCode();
        var json = await resp.Content.ReadAsStringAsync(ct);
        var o = Newtonsoft.Json.Linq.JObject.Parse(json);
        return o["access_token"]?.ToString() ?? throw new Exception("No access_token in token response");
      }

      async Task<string> IgdbPostAsync(string token, string clientId, string endpoint, string body)
      {
        using var req = new HttpRequestMessage(HttpMethod.Post, $"https://api.igdb.com/v4/{endpoint}");
        req.Headers.Add("Client-ID", clientId);
        req.Headers.Add("Authorization", $"Bearer {token}");
        req.Headers.Add("Accept", "application/json");
        req.Content = new StringContent(body, Encoding.UTF8, "text/plain");

        using var resp = await _httpClient.SendAsync(req, ct);
        if ((int)resp.StatusCode == 429)
          throw new Exception("IGDB rate limit hit (429) — slow down.");

        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync(ct);
      }

      async Task UpsertEnrichmentAsync(
        MySqlConnection conn,
        int fileId,
        string romFileName,
        string romTitleGuess,
        int? igdbGameId,
        string? igdbName,
        int matchScore,
        string status,
        string? error,
        string? summary,
        long? firstReleaseDate,
        decimal? totalRating,
        int? totalRatingCount,
        Newtonsoft.Json.Linq.JArray? platforms,
        Newtonsoft.Json.Linq.JArray? genres,
        string? coverUrl,
        Newtonsoft.Json.Linq.JArray? screenshots,
        Newtonsoft.Json.Linq.JArray? artworks,
        Newtonsoft.Json.Linq.JArray? videos,
        int resetVotes,
        string? rawJson)
      {
        const string sql = @"
INSERT INTO maxhanna.rom_igdb_enrichment (
  file_id, rom_file_name, rom_title_guess,
  igdb_game_id, igdb_name, match_score,
  status, error,
  summary, first_release_date, total_rating, total_rating_count,
  platforms_json, genres_json,
  cover_url, screenshots_json, artworks_json, videos_json,
  reset_votes, raw_json, updated_at, fetched_at
)
VALUES (
  @file_id, @rom_file_name, @rom_title_guess,
  @igdb_game_id, @igdb_name, @match_score,
  @status, @error,
  @summary, @first_release_date, @total_rating, @total_rating_count,
  @platforms_json, @genres_json,
  @cover_url, @screenshots_json, @artworks_json, @videos_json,
  @reset_votes, @raw_json, UTC_TIMESTAMP(), UTC_TIMESTAMP()
)
ON DUPLICATE KEY UPDATE
  rom_file_name      = VALUES(rom_file_name),
  rom_title_guess    = VALUES(rom_title_guess),
  igdb_game_id       = VALUES(igdb_game_id),
  igdb_name          = VALUES(igdb_name),
  match_score        = VALUES(match_score),
  status             = VALUES(status),
  error              = VALUES(error),
  summary            = VALUES(summary),
  first_release_date = VALUES(first_release_date),
  total_rating       = VALUES(total_rating),
  total_rating_count = VALUES(total_rating_count),
  platforms_json     = VALUES(platforms_json),
  genres_json        = VALUES(genres_json),
  cover_url          = VALUES(cover_url),
  screenshots_json   = VALUES(screenshots_json),
  artworks_json      = VALUES(artworks_json),
  videos_json        = VALUES(videos_json),
  reset_votes        = VALUES(reset_votes),
  raw_json           = VALUES(raw_json),
  fetched_at         = VALUES(fetched_at),
  updated_at         = UTC_TIMESTAMP();";

        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@file_id", fileId);
        cmd.Parameters.AddWithValue("@rom_file_name", romFileName);
        cmd.Parameters.AddWithValue("@rom_title_guess", romTitleGuess);

        cmd.Parameters.AddWithValue("@igdb_game_id", (object?)igdbGameId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@igdb_name", (object?)igdbName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@match_score", matchScore);

        cmd.Parameters.AddWithValue("@status", status);
        cmd.Parameters.AddWithValue("@error", (object?)error ?? DBNull.Value);

        cmd.Parameters.AddWithValue("@summary", (object?)summary ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@first_release_date", (object?)firstReleaseDate ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@total_rating", (object?)totalRating ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@total_rating_count", (object?)totalRatingCount ?? DBNull.Value);

        cmd.Parameters.AddWithValue("@platforms_json", (object?)platforms?.ToString(Newtonsoft.Json.Formatting.None) ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@genres_json", (object?)genres?.ToString(Newtonsoft.Json.Formatting.None) ?? DBNull.Value);

        cmd.Parameters.AddWithValue("@cover_url", (object?)coverUrl ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@screenshots_json", (object?)screenshots?.ToString(Newtonsoft.Json.Formatting.None) ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@artworks_json", (object?)artworks?.ToString(Newtonsoft.Json.Formatting.None) ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@videos_json", (object?)videos?.ToString(Newtonsoft.Json.Formatting.None) ?? DBNull.Value);

        cmd.Parameters.AddWithValue("@reset_votes", resetVotes);
        cmd.Parameters.AddWithValue("@raw_json", (object?)rawJson ?? DBNull.Value);

        await cmd.ExecuteNonQueryAsync(ct);
      }

      async Task<(Newtonsoft.Json.Linq.JArray arr, string rawJson, bool excludedVersions, string usedSearch)> QueryIgdbWithFallbackAsync(
        string token,
        string clientId,
        string titleGuess)
      {
        foreach (var term in BuildSearchTerms(titleGuess).Distinct(StringComparer.OrdinalIgnoreCase))
        {
          // Attempt A: exclude versions
          {
            var q = $@"
search ""{Esc(term)}"";
fields
  id,
  name,
  alternative_names.name,
  version_parent,
  summary,
  first_release_date,
  total_rating,
  total_rating_count,
  platforms.name,
  genres.name,
  cover.image_id,
  screenshots.image_id,
  artworks.image_id,
  videos.video_id;
where version_parent = null;
limit 50;
";
            var json = await IgdbPostAsync(token, clientId, "games", q);
            await Task.Delay(perRequestDelayMs, ct);

            var a = Newtonsoft.Json.Linq.JArray.Parse(json);
            if (a.Count > 0)
              return (a, json, excludedVersions: true, usedSearch: term);
          }

          // Attempt B: include versions
          {
            var q = $@"
search ""{Esc(term)}"";
fields
  id,
  name,
  alternative_names.name,
  version_parent,
  summary,
  first_release_date,
  total_rating,
  total_rating_count,
  platforms.name,
  genres.name,
  cover.image_id,
  screenshots.image_id,
  artworks.image_id,
  videos.video_id;
limit 50;
";
            var json = await IgdbPostAsync(token, clientId, "games", q);
            await Task.Delay(perRequestDelayMs, ct);

            var a = Newtonsoft.Json.Linq.JArray.Parse(json);
            if (a.Count > 0)
              return (a, json, excludedVersions: false, usedSearch: term);
          }
        }

        return (new Newtonsoft.Json.Linq.JArray(), "[]", excludedVersions: false, usedSearch: titleGuess);
      }

      // ---- start of method logic ----
      var clientId = _config.GetValue<string>("IGDB:ClientId");
      var clientSecret = _config.GetValue<string>("IGDB:ClientSecret");
      if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
      {
        await _log.Db("IGDB credentials missing in config (IGDB:ClientId / IGDB:ClientSecret).", null, "IGDB", true);
        return;
      }

      var token = await GetTwitchAppAccessTokenAsync(clientId!, clientSecret!);

      // Normalize root folder to forward slashes to avoid backslash LIKE headaches.
      var romRoot = (_romFolder ?? "").Replace('\\', '/');

      // --- Phase 1: files in file_uploads that have NO enrichment row yet (highest priority) ---
      const string pickNewSql = @"
    SELECT fu.id, fu.file_name, fu.given_file_name
    FROM maxhanna.file_uploads fu
LEFT JOIN maxhanna.rom_igdb_enrichment r ON r.file_id = fu.id
WHERE fu.is_folder = 0
  AND fu.file_name IS NOT NULL
  AND (
        fu.folder_path = @FolderPath
     OR fu.folder_path = REPLACE(@FolderPath, '\\', '/')
     OR fu.folder_path LIKE CONCAT(REPLACE(@FolderPath, '\\', '/'), '/%')
  )
  AND r.file_id IS NULL
ORDER BY fu.id
LIMIT @lim;";

      // --- Phase 2: rows that already have enrichment but need a redo ---
      //   a) reset_votes > 0  (user requested re-enrichment)
      //   b) status = 'ERROR' (previous attempt failed)
      //   c) fetched_at older than 30 days (stale refresh)
      // Delete the old enrichment row so the upsert creates a fresh one.
      const string pickRedoSql = @"
    SELECT r.file_id, fu.file_name, fu.given_file_name
FROM maxhanna.rom_igdb_enrichment r
JOIN maxhanna.file_uploads fu ON fu.id = r.file_id
WHERE (
    r.reset_votes > 0
    OR r.status = 'ERROR'
    OR r.fetched_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
  )
ORDER BY
  r.reset_votes DESC,
  CASE WHEN r.status = 'ERROR' THEN 0 ELSE 1 END,
  r.fetched_at ASC
LIMIT @lim;";

      int totalProcessed = 0;
      bool phase1Done = false;

      while (true)
      {
        ct.ThrowIfCancellationRequested();

        var roms = new List<(int id, string fileName, string? givenFileName)>();

        // Open a fresh connection per batch to avoid holding one for the entire run.
        await using (var conn = new MySqlConnection(_connectionString))
        {
          await conn.OpenAsync(ct);

          if (!phase1Done)
          {
            // Phase 1 — unenriched files
            await using (var cmd = new MySqlCommand(pickNewSql, conn))
            {
              cmd.Parameters.AddWithValue("@FolderPath", romRoot);
              cmd.Parameters.AddWithValue("@lim", batchSize);
              await using var r = await cmd.ExecuteReaderAsync(ct);
              while (await r.ReadAsync(ct))
              {
                var id = r.GetInt32("id");
                var fn = r.IsDBNull(r.GetOrdinal("file_name")) ? string.Empty : r.GetString("file_name");
                var given = r.IsDBNull(r.GetOrdinal("given_file_name")) ? null : r.GetString("given_file_name");
                roms.Add((id, fn, given));
              }
            }

            if (roms.Count == 0)
              phase1Done = true; // move to Phase 2 in next iteration
          }

          if (phase1Done && roms.Count == 0)
          {
            // Phase 2 — redo errored / reset-voted / stale
            var redoIds = new List<(int id, string fileName, string? givenFileName)>();
            await using (var cmd2 = new MySqlCommand(pickRedoSql, conn))
            {
              cmd2.Parameters.AddWithValue("@lim", batchSize);
              await using var rr = await cmd2.ExecuteReaderAsync(ct);
              while (await rr.ReadAsync(ct))
              {
                var id = rr.GetInt32("file_id");
                var fn = rr.IsDBNull(rr.GetOrdinal("file_name")) ? string.Empty : rr.GetString("file_name");
                var given = rr.IsDBNull(rr.GetOrdinal("given_file_name")) ? null : rr.GetString("given_file_name");
                redoIds.Add((id, fn, given));
              }
            }

            if (redoIds.Count == 0)
              break; // nothing left in either phase

            // Delete old enrichment rows so they get a fresh upsert
            var idsCsv = string.Join(',', redoIds.Select(x => x.id));
            await using (var del = new MySqlCommand(
              $"DELETE FROM maxhanna.rom_igdb_enrichment WHERE file_id IN ({idsCsv});", conn))
              await del.ExecuteNonQueryAsync(ct);
            // carry through given_file_name for redo candidates
            roms.AddRange(redoIds.Select(x => (x.id, x.fileName, x.givenFileName)));
          }
        } // connection returned to pool

        foreach (var (fileId, romFileName, romGivenFileName) in roms)
        {
          ct.ThrowIfCancellationRequested();
          // Prefer tags extracted from given file name if present, otherwise from stored file name
          var tags = ExtractTags(romGivenFileName ?? romFileName);

          var titleGuess = CleanTitle(romFileName);
          string? givenTitleGuess = string.IsNullOrWhiteSpace(romGivenFileName) ? null : CleanTitle(romGivenFileName!);
          _ = _log.Db($"Cleaning title from filename: {romFileName} to {titleGuess}{(givenTitleGuess != null ? ('/' + givenTitleGuess) : "")}", null, "IGDB", outputToConsole: true);

          // Prioritize given file name for IGDB search; fall back to stored file name.
          var primaryTitle = givenTitleGuess ?? titleGuess;
          var secondaryTitle = givenTitleGuess != null
            && !string.Equals(givenTitleGuess, titleGuess, StringComparison.OrdinalIgnoreCase)
            ? titleGuess : null;

          // Open a short-lived connection for each file's upsert so we don't hold a
          // connection across the IGDB HTTP round-trips.
          try
          {
            var (arr, respJson, excludedVersions, usedSearch) = await QueryIgdbWithFallbackAsync(token, clientId, primaryTitle);

            if (!string.IsNullOrWhiteSpace(secondaryTitle))
            {
              try
              {
                var (arr2, respJson2, excluded2, usedSearch2) = await QueryIgdbWithFallbackAsync(token, clientId, secondaryTitle);
                // merge arr2 into arr, avoiding duplicate game ids
                var ids = new HashSet<int>(arr.OfType<Newtonsoft.Json.Linq.JObject>().Select(o => o.Value<int>("id")));
                foreach (var tok in arr2.OfType<Newtonsoft.Json.Linq.JObject>())
                {
                  var id = tok.Value<int>("id");
                  if (!ids.Contains(id))
                  {
                    arr.Add(tok);
                    ids.Add(id);
                  }
                }
                // concatenate raw JSON for debugging/storage
                respJson = respJson == "[]" ? respJson2 : (respJson + "\n" + respJson2);
                excludedVersions = excludedVersions && excluded2;
              }
              catch (Exception ex)
              {
                _ = _log.Db($"IGDB query for secondary title failed: {ex.Message}", null, "IGDB", outputToConsole: true);
              }
            }

            if (arr.Count == 0)
            {
              await using (var upsertConn = new MySqlConnection(_connectionString))
              {
                await upsertConn.OpenAsync(ct);
                await UpsertEnrichmentAsync(
                  upsertConn, fileId, romFileName, primaryTitle,
                  null, null, 0, "NOT_FOUND", $"No results for '{primaryTitle}'{(secondaryTitle != null ? $" or '{secondaryTitle}'" : "")} (tried variants).",
                  null, null, null, null,
                  null, null,
                  null, null, null, null,
                  0, respJson
                );
              }
              continue;
            }

            var fileExt = Path.GetExtension(romFileName)?.TrimStart('.')?.ToLowerInvariant() ?? string.Empty;
            var platformIds = InferPlatformIds(fileExt, tags);
            var platformWhere = (platformIds != null && platformIds.Length > 0)
              ? $" & platforms = ({string.Join(",", platformIds)})"
              : "";

            // If the initial results are empty we'd do more focused queries, but we already have some candidates.
            var platformKws = InferPlatformKeywords(fileExt, tags);

            var candidates = arr.OfType<Newtonsoft.Json.Linq.JObject>().ToList();

            // Prefer platform matches if we can infer platform AND any candidate matches.
            List<Newtonsoft.Json.Linq.JObject> preferred = candidates;
            bool anyPlatformMatch = false;

            if (platformKws != null && platformKws.Length > 0)
            {
              var matching = candidates.Where(c => CandidateMatchesPlatform(c, platformKws)).ToList();
              if (matching.Count > 0)
              {
                preferred = matching;
                anyPlatformMatch = true;
              }
            }

            var best = preferred
              .OrderByDescending(g => ScoreCandidateImproved(g, primaryTitle, platformKws))
              .First();

            var bestScore = ScoreCandidateImproved(best, primaryTitle, platformKws);

            // Determine status
            string status;
            string? statusError = null;

            if (platformKws != null && platformKws.Length > 0)
            {
              bool bestMatches = CandidateMatchesPlatform(best, platformKws);

              if (bestMatches)
              {
                status = excludedVersions ? "OK" : "OK_INCLUDED_VERSIONS";
                if (!excludedVersions)
                  statusError = $"Matched only when including versions/editions. SearchUsed='{usedSearch}'.";
              }
              else if (!anyPlatformMatch)
              {
                status = "PLATFORM_MISMATCH_FALLBACK";
                statusError = $"No candidates matched inferred platform (ext='{fileExt}', tags='{string.Join(",", tags)}'). SearchUsed='{usedSearch}'. Stored best overall match.";
              }
              else
              {
                status = excludedVersions ? "OK" : "OK_INCLUDED_VERSIONS";
              }
            }
            else
            {
              status = excludedVersions ? "OK_NO_PLATFORM_HINT" : "OK_INCLUDED_VERSIONS_NO_PLATFORM_HINT";
              if (!excludedVersions)
                statusError = $"Matched only when including versions/editions. SearchUsed='{usedSearch}'.";
            }

            int igdbId = best.Value<int>("id");
            string igdbName = best.Value<string>("name") ?? primaryTitle;

            string? summary = best.Value<string>("summary");
            long? firstRelease = best.Value<long?>("first_release_date");
            decimal? rating = best.Value<decimal?>("total_rating");
            int? ratingCount = best.Value<int?>("total_rating_count");

            Newtonsoft.Json.Linq.JArray? platforms = null;
            var pNames = best.SelectTokens("platforms[*].name").Select(x => x.ToString()).Distinct().ToList();
            if (pNames.Count > 0) platforms = new Newtonsoft.Json.Linq.JArray(pNames);

            Newtonsoft.Json.Linq.JArray? genres = null;
            var gNames = best.SelectTokens("genres[*].name").Select(x => x.ToString()).Distinct().ToList();
            if (gNames.Count > 0) genres = new Newtonsoft.Json.Linq.JArray(gNames);

            string? coverUrl = null;
            var coverId = best.SelectToken("cover.image_id")?.ToString();
            if (!string.IsNullOrWhiteSpace(coverId))
              coverUrl = IgdbImageUrl(coverId!, "t_cover_big");

            Newtonsoft.Json.Linq.JArray? screenshots = null;
            var ss = best.SelectTokens("screenshots[*].image_id")
              .Select(x => x.ToString())
              .Where(s => !string.IsNullOrWhiteSpace(s))
              .Take(10)
              .ToList();
            if (ss.Count > 0) screenshots = new Newtonsoft.Json.Linq.JArray(ss.Select(id => IgdbImageUrl(id, "t_1080p")));

            Newtonsoft.Json.Linq.JArray? artworks = null;
            var aw = best.SelectTokens("artworks[*].image_id")
              .Select(x => x.ToString())
              .Where(s => !string.IsNullOrWhiteSpace(s))
              .Take(6)
              .ToList();
            if (aw.Count > 0) artworks = new Newtonsoft.Json.Linq.JArray(aw.Select(id => IgdbImageUrl(id, "t_1080p")));

            Newtonsoft.Json.Linq.JArray? videos = null;
            var vids = best.SelectTokens("videos[*].video_id")
              .Select(x => x.ToString())
              .Where(s => !string.IsNullOrWhiteSpace(s))
              .Take(3)
              .ToList();
            if (vids.Count > 0) videos = new Newtonsoft.Json.Linq.JArray(vids.Select(v => $"https://www.youtube.com/watch?v={v}"));

            string rawToStore =
              status.StartsWith("OK", StringComparison.OrdinalIgnoreCase) && !status.Contains("INCLUDED_VERSIONS", StringComparison.OrdinalIgnoreCase)
                ? best.ToString(Newtonsoft.Json.Formatting.None)
                : arr.ToString(Newtonsoft.Json.Formatting.None);

            await using (var upsertConn = new MySqlConnection(_connectionString))
            {
              await upsertConn.OpenAsync(ct);
              await UpsertEnrichmentAsync(
                upsertConn, fileId, romFileName, primaryTitle,
                igdbId, igdbName, bestScore, status, statusError,
                summary, firstRelease, rating, ratingCount,
                platforms, genres,
                coverUrl, screenshots, artworks, videos,
                0, rawToStore
              );
            }

            totalProcessed++;
          }
          catch (Exception ex)
          {
            try
            {
              await using (var errConn = new MySqlConnection(_connectionString))
              {
                await errConn.OpenAsync(ct);
                await UpsertEnrichmentAsync(
                  errConn, fileId, romFileName, primaryTitle,
                  null, null, 0, "ERROR", ex.Message,
                  null, null, null, null,
                  null, null,
                  null, null, null, null,
                  0, null
                );
              }
            }
            catch { /* swallow — don't let a logging failure kill the batch */ }

            await Task.Delay(500, ct);
          }
        }

        // polite pause between batches (DB + IGDB)
        await Task.Delay(250, ct);
      }

      await _log.Db($"IGDB enrich: processed {totalProcessed} ROM(s) this run.", null, "IGDB", outputToConsole: true);
    }
  }
}
