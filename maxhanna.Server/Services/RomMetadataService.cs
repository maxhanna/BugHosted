using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MySqlConnector;
using Newtonsoft.Json;
using System.Text;

namespace maxhanna.Server.Services
{
  public class RomMetadataService
  {
    private readonly Log _log;
    private readonly IConfiguration _config;
    private readonly string _connectionString;
    private readonly HttpClient _httpClient;

    public RomMetadataService(Log log, IConfiguration config)
    {
      _log = log;
      _config = config;
      _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna")!;
      _httpClient = new HttpClient();
    }

    private static string Esc(string s) => (s ?? "").Replace("\"", "\\\"");

    private static string IgdbImageUrl(string imageId, string size) =>
      $"https://images.igdb.com/igdb/image/upload/{size}/{imageId}.jpg";

    private static string Norm(string x)
    {
      x = (x ?? "").ToLowerInvariant();
      x = System.Text.RegularExpressions.Regex.Replace(x, @"[^a-z0-9]+", " ").Trim();
      return x;
    }

    private static bool IsArchiveExt(string ext) => ext is "zip" or "7z" or "rar";

    private static string CleanTitle(string fileName)
    {
      var stem = Path.GetFileNameWithoutExtension(fileName) ?? fileName;
      // Strip common version tokens first: (v1.2.3), [v1.2], v.13.5, r.11, -v1.2, _v1.2, .v1.2
      stem = System.Text.RegularExpressions.Regex.Replace(stem, @"\(\s*[vVrR]\.?\d+(?:\.\d+)*\s*\)", " ");
      stem = System.Text.RegularExpressions.Regex.Replace(stem, @"\[\s*[vVrR]\.?\d+(?:\.\d+)*\s*\]", " ");
      stem = System.Text.RegularExpressions.Regex.Replace(stem, @"(?<=^|[\s_\-\.])[vVrR]\.?\d+(?:\.\d+)*(?=$|[\s_\-\.])", " ");

      // Remove trailing hash-system tags like " # GBC" and generic bracketed tokens
      stem = System.Text.RegularExpressions.Regex.Replace(
        stem,
        @"\s*#\s*(GB|GBC|GBA|NES|SNES|SFC|N64|NDS|PSX|PS1|PS2|PS3|PS4|PS5|PSP|GC|GCM|GBA|GEN|MD|SMS|GG|SAT|DC|PC|XBOX|X360|XONE|XSX|WII|WIIU|SWITCH|NS|3DS|DS|N64|NGC|MAME)\s*$",
        " ",
        System.Text.RegularExpressions.RegexOptions.IgnoreCase
      );

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

    private static IReadOnlyList<string> ExtractTags(string fileName)
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
        @"#\s*([A-Za-z0-9]+)\b",
        System.Text.RegularExpressions.RegexOptions.IgnoreCase
      );

      if (hashMatch.Success)
        tags.Add(hashMatch.Groups[1].Value.Trim());

      return tags;
    }

    private static bool IsGarbageTagToken(string token)
    {
      if (string.IsNullOrWhiteSpace(token)) return true;

      token = token.Trim().ToLowerInvariant();

      var garbage = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
      {
        "usa","u","us","europe","eur","eu","pal","ntsc","ntscu","ntsc-j","ntscj",
        "japan","jpn","jp","j","asia","australia","aus","world","w","korea","kor","kr","china","cn",
        "en","fr","de","es","it","nl","pt","sv","no","da","fi","pl","ru","zh","ja",
        "rev","reva","rev1","rev2","v1","v1.0","v1.1","v2","v2.0",
        "proto","prototype","beta","sample","demo","preview",
        "hack","hacked","trainer","crack","cracked","fix","fixed","patched","patch",
        "good","bad","best","alt","alt1","alt2",
        "sram","sav","save","battery","batterysave",
        "pirate","unl","unlicensed",
        "virtualconsole","vc",
        "sfc","smc",
        "gbcompatible","gb","gbc",
        "sgb","sgbenhanced","color","enhanced"
      };

      if (garbage.Contains(token)) return true;
      if (System.Text.RegularExpressions.Regex.IsMatch(token, @"^\d+$")) return true;
      return false;
    }

    private static IEnumerable<string> ExtractSystemCodes(string fileExt, IReadOnlyList<string> tags)
    {
      if (!string.IsNullOrWhiteSpace(fileExt))
        yield return fileExt.Trim().ToUpperInvariant();

      foreach (var t in tags)
      {
        foreach (var raw in System.Text.RegularExpressions.Regex.Split(t, @"[^A-Za-z0-9]+"))
        {
          var token = raw?.Trim();
          if (string.IsNullOrWhiteSpace(token)) continue;
          if (IsGarbageTagToken(token)) continue;

          yield return token.ToUpperInvariant();
        }
      }
    }

    private static string[]? InferPlatformKeywords(string fileExt, IReadOnlyList<string> tags)
    {
      var tagMap = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
      {
        { "GB",   new[] { "game boy" } },
        { "GBC",  new[] { "game boy color", "game boy" } },
        { "GBA",  new[] { "game boy advance", "gba" } },
        { "NES",  new[] { "nintendo entertainment system", "nes", "famicom" } },
        { "SNES", new[] { "super nintendo", "snes", "super famicom" } },
        { "SFC",  new[] { "super nintendo", "snes", "super famicom" } },
        { "N64",  new[] { "nintendo 64", "n64" } },
        { "NDS",  new[] { "nintendo ds", "nds" } },
        { "DS",   new[] { "nintendo ds", "nds" } },
        { "3DS",  new[] { "nintendo 3ds" } },
        { "PSX",  new[] { "playstation", "ps1", "playstation 1" } },
        { "PS1",  new[] { "playstation", "ps1", "playstation 1" } },
        { "PS2",  new[] { "playstation 2", "ps2" } },
        { "PS3",  new[] { "playstation 3", "ps3" } },
        { "PS4",  new[] { "playstation 4", "ps4" } },
        { "PS5",  new[] { "playstation 5", "ps5" } },
        { "PSP",  new[] { "playstation portable", "psp" } },
        { "GC",   new[] { "gamecube", "nintendo gamecube" } },
        { "NGC",  new[] { "gamecube", "nintendo gamecube" } },
        { "GEN",  new[] { "genesis", "mega drive" } },
        { "MD",   new[] { "mega drive", "genesis" } },
        { "DC",   new[] { "dreamcast" } },
        { "SAT",  new[] { "saturn", "sega saturn" } },
        { "GG",   new[] { "game gear" } },
        { "SMS",  new[] { "master system" } },
        { "MAME", new[] { "arcade", "mame" } }
      };

      foreach (var code in ExtractSystemCodes(fileExt, tags))
        if (tagMap.TryGetValue(code, out var kws))
          return kws;

      if (IsArchiveExt(fileExt))
        return null;

      if (tagMap.TryGetValue(fileExt, out var extKws))
        return extKws;

      return null;
    }

    private static bool CandidateMatchesPlatform(Newtonsoft.Json.Linq.JObject c, string[] kws)
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

    private static int ScoreName(string candidateName, string cleanedTitle)
    {
      var a = Norm(cleanedTitle);
      var b = Norm(candidateName);

      int score = 0;
      if (b == a) score += 1000;
      if (b.Contains(a) || a.Contains(b)) score += 250;
      return score;
    }

    private static int ScoreCandidateImproved(Newtonsoft.Json.Linq.JObject g, string cleanedTitle, string[]? platformKws)
    {
      var bestNameScore = ScoreName(g.Value<string>("name") ?? "", cleanedTitle);

      var altNames = g.SelectTokens("alternative_names[*].name")
        .Select(x => x.ToString())
        .Where(s => !string.IsNullOrWhiteSpace(s))
        .Take(30)
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

    private static IEnumerable<string> BuildSearchTerms(string titleGuess)
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
      if (tokens.Length > 9)
        yield return string.Join(' ', tokens.Take(9));

      var key = tokens.Where(w => w.Length >= 4).Take(7).ToArray();
      if (key.Length >= 3)
        yield return string.Join(' ', key);
    }

    private async Task<string> GetTwitchAppAccessTokenAsync(string clientId, string clientSecret)
    {
      var url =
        $"https://id.twitch.tv/oauth2/token" +
        $"?client_id={Uri.EscapeDataString(clientId)}" +
        $"&client_secret={Uri.EscapeDataString(clientSecret)}" +
        $"&grant_type=client_credentials";

      using var resp = await _httpClient.PostAsync(url, content: null);
      resp.EnsureSuccessStatusCode();
      var json = await resp.Content.ReadAsStringAsync();
      var o = Newtonsoft.Json.Linq.JObject.Parse(json);
      return o["access_token"]?.ToString() ?? throw new Exception("No access_token in token response");
    }

    private async Task<string> IgdbPostAsync(string token, string clientId, string endpoint, string body, CancellationToken ct)
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

    public async Task EnrichRomsFromIgdb_SingleTable(CancellationToken ct = default)
    {
      const int batchSize = 25;

      var clientId = _config.GetValue<string>("IGDB:ClientId");
      var clientSecret = _config.GetValue<string>("IGDB:ClientSecret");
      if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
      {
        await _log.Db("IGDB credentials missing in config (IGDB:ClientId / IGDB:ClientSecret).", null, "IGDB", true);
        return;
      }

      var token = await GetTwitchAppAccessTokenAsync(clientId!, clientSecret!);

      await using var conn = new MySqlConnection(_connectionString);
      await conn.OpenAsync(ct);

      var pickSql = @"
SELECT fu.id, fu.file_name
FROM maxhanna.file_uploads fu
LEFT JOIN maxhanna.rom_igdb_enrichment r ON r.file_id = fu.id
WHERE fu.folder_path = @FolderPath
  AND fu.is_folder = 0
  AND fu.file_name IS NOT NULL
  AND (
    r.file_id IS NULL
    OR r.status <> 'OK'
    OR r.fetched_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
  )
ORDER BY fu.id
LIMIT @lim;";

      var roms = new List<(int id, string fileName)>();
      await using (var cmd = new MySqlCommand(pickSql, conn))
      {
        cmd.Parameters.AddWithValue("@FolderPath", "E:/Dev/maxhanna/maxhanna.client/src/assets/Uploads/Roms/");
        cmd.Parameters.AddWithValue("@lim", batchSize);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
          roms.Add((r.GetInt32("id"), r.GetString("file_name")));
      }

      if (roms.Count == 0)
      {
        var resetIds = new List<int>();
        const string selectResetSql = @"SELECT file_id FROM maxhanna.rom_igdb_enrichment WHERE reset_votes > 1 LIMIT @lim;";
        await using (var sel = new MySqlCommand(selectResetSql, conn))
        {
          sel.Parameters.AddWithValue("@lim", batchSize);
          await using var rr = await sel.ExecuteReaderAsync(ct);
          while (await rr.ReadAsync(ct))
            resetIds.Add(rr.GetInt32(0));
        }

        if (resetIds.Count > 0)
        {
          var idsCsv = string.Join(',', resetIds);
          var deleteSql = $"DELETE FROM maxhanna.rom_igdb_enrichment WHERE file_id IN ({idsCsv});";
          await using (var del = new MySqlCommand(deleteSql, conn))
            await del.ExecuteNonQueryAsync(ct);

          var fetchSql = $@"SELECT id, file_name FROM maxhanna.file_uploads WHERE id IN ({idsCsv}) ORDER BY id LIMIT @lim;";
          await using (var pc = new MySqlCommand(fetchSql, conn))
          {
            pc.Parameters.AddWithValue("@lim", batchSize);
            await using var r2 = await pc.ExecuteReaderAsync(ct);
            while (await r2.ReadAsync(ct))
              roms.Add((r2.GetInt32("id"), r2.GetString("file_name")));
          }
        }

        if (roms.Count == 0)
        {
          await _log.Db("IGDB enrich: no ROMs to process.", null, "IGDB", outputToConsole: true);
          return;
        }
      }

      foreach (var (fileId, romFileName) in roms)
      {
        ct.ThrowIfCancellationRequested();

        var tags = ExtractTags(romFileName);
        var titleGuess = CleanTitle(romFileName);

        var fileExt = Path.GetExtension(romFileName)?.TrimStart('.')?.ToLowerInvariant() ?? string.Empty;
        var platformKws = InferPlatformKeywords(fileExt, tags);

        try
        {
          var platformIds = await InferPlatformIdsAsync(fileExt, tags, clientId!, token, perRequestDelayMs:300);

          var (arr, respJson, excludedVersions, usedPlatformFilter, usedSearch) =
            await QueryIgdbWithFallbackAsync(token, clientId!, titleGuess, platformIds, perRequestDelayMs:300, ct);

          if (arr.Count == 0)
          {
            await UpsertEnrichmentAsync(
              conn, fileId, romFileName, titleGuess,
              null, null, 0, "NOT_FOUND", $"No results for '{titleGuess}' (tried variants).",
              null, null, null, null,
              null, null,
              null, null, null, null,
              0, respJson
            );
            continue;
          }

          var candidates = arr.OfType<Newtonsoft.Json.Linq.JObject>().ToList();

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
            .OrderByDescending(g => ScoreCandidateImproved(g, titleGuess, platformKws))
            .First();

          var bestScore = ScoreCandidateImproved(best, titleGuess, platformKws);

          string status;
          string? statusError = null;

          if (platformKws != null && platformKws.Length > 0)
          {
            bool bestMatches = CandidateMatchesPlatform(best, platformKws);

            if (bestMatches)
            {
              status =
                excludedVersions
                  ? (usedPlatformFilter ? "OK" : "OK_NO_PLATFORM_FILTER")
                  : (usedPlatformFilter ? "OK_INCLUDED_VERSIONS" : "OK_INCLUDED_VERSIONS_NO_PLATFORM_FILTER");

              if (!excludedVersions)
                statusError = $"Matched only when including versions/editions. SearchUsed='{usedSearch}'.";
              if (!usedPlatformFilter && platformIds != null && platformIds.Length > 0)
                statusError = (statusError == null ? "" : statusError + " ")
                              + $"Platform filter could not be applied successfully; usedSearch='{usedSearch}'.";
            }
            else if (!anyPlatformMatch)
            {
              status = "PLATFORM_MISMATCH_FALLBACK";
              statusError = $"No candidates matched inferred platform. ext='{fileExt}', tags='{string.Join(",", tags)}', searchUsed='{usedSearch}'. Stored best overall match.";
            }
            else
            {
              status = excludedVersions ? "OK" : "OK_INCLUDED_VERSIONS";
            }
          }
          else
          {
            status =
              excludedVersions
                ? (usedPlatformFilter ? "OK_NO_PLATFORM_HINT" : "OK_NO_PLATFORM_HINT_NO_PLATFORM_FILTER")
                : (usedPlatformFilter ? "OK_INCLUDED_VERSIONS_NO_PLATFORM_HINT" : "OK_INCLUDED_VERSIONS_NO_PLATFORM_HINT_NO_PLATFORM_FILTER");

            if (!excludedVersions)
              statusError = $"Matched only when including versions/editions. SearchUsed='{usedSearch}'.";
          }

          int igdbId = best.Value<int>("id");
          string igdbName = best.Value<string>("name") ?? titleGuess;

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
            status == "OK"
              ? best.ToString(Newtonsoft.Json.Formatting.None)
              : respJson;

          await UpsertEnrichmentAsync(
            conn, fileId, romFileName, titleGuess,
            igdbId, igdbName, bestScore, status, statusError,
            summary, firstRelease, rating, ratingCount,
            platforms, genres,
            coverUrl, screenshots, artworks, videos,
            0, rawToStore
          );
        }
        catch (Exception ex)
        {
          await UpsertEnrichmentAsync(
            conn, fileId, romFileName, titleGuess,
            null, null, 0, "ERROR", ex.Message,
            null, null, null, null,
            null, null,
            null, null, null, null,
            0, null
          );

          await Task.Delay(500, ct);
        }
      }

      await _log.Db($"IGDB enrich: processed {roms.Count} ROM(s).", null, "IGDB", outputToConsole: true);
    }

    private async Task<int[]?> InferPlatformIdsAsync(string fileExt, IReadOnlyList<string> tags, string clientId, string token, int perRequestDelayMs = 300)
    {
      // Conservative implementation: do not attempt to resolve IGDB platform IDs here.
      // Returning null will cause the search to run without a platform filter.
      await Task.Delay(1);
      return null;
    }

    private async Task<(List<object> arr, string respJson, bool excludedVersions, bool usedPlatformFilter, string usedSearch)>
      QueryIgdbWithFallbackAsync(string token, string clientId, string titleGuess, int[]? platformIds, int perRequestDelayMs, CancellationToken ct)
    {
      var searches = BuildSearchTerms(titleGuess).ToList();
      foreach (var s in searches)
      {
        ct.ThrowIfCancellationRequested();
        var body = $"search \"{Esc(s)}\"; fields name,summary,platforms.name,alternative_names.name,total_rating,total_rating_count,cover.image_id,screenshots.image_id,artworks.image_id,videos.video_id,first_release_date,genres.name; limit 50;";
        try
        {
          var resp = await IgdbPostAsync(token, clientId, "games", body, ct);
          if (!string.IsNullOrWhiteSpace(resp))
          {
            try
            {
              var arr = Newtonsoft.Json.Linq.JArray.Parse(resp).ToObject<List<object>>() ?? new List<object>();
              if (arr.Count > 0)
                return (arr, resp, false, platformIds != null && platformIds.Length > 0, s);
            }
            catch { /* ignore parse errors and continue */ }
          }
        }
        catch (Exception ex)
        {
          // continue trying other search variants
          await Task.Delay(perRequestDelayMs, ct);
        }
      }

      return (new List<object>(), "[]", false, false, searches.FirstOrDefault() ?? titleGuess);
    }

    private async Task UpsertEnrichmentAsync(
      MySqlConnection conn,
      int fileId,
      string fileName,
      string titleGuess,
      int? igdbId,
      string? igdbName,
      int bestScore,
      string status,
      string? statusError,
      string? summary,
      long? firstRelease,
      decimal? rating,
      int? ratingCount,
      Newtonsoft.Json.Linq.JArray? platforms,
      Newtonsoft.Json.Linq.JArray? genres,
      string? coverUrl,
      Newtonsoft.Json.Linq.JArray? screenshots,
      Newtonsoft.Json.Linq.JArray? artworks,
      Newtonsoft.Json.Linq.JArray? videos,
      int resetVotes,
      string? rawJson
    )
    {
      const string sql = @"
INSERT INTO maxhanna.rom_igdb_enrichment
  (file_id, file_name, title_guess, igdb_id, igdb_name, best_score, status, status_error,
   summary, first_release, rating, rating_count, platforms, genres, cover_url, screenshots, artworks, videos, reset_votes, fetched_at, raw_json)
VALUES
  (@file_id, @file_name, @title_guess, @igdb_id, @igdb_name, @best_score, @status, @status_error,
   @summary, @first_release, @rating, @rating_count, @platforms, @genres, @cover_url, @screenshots, @artworks, @videos, @reset_votes, UTC_TIMESTAMP(), @raw_json)
ON DUPLICATE KEY UPDATE
  file_name = VALUES(file_name), title_guess = VALUES(title_guess), igdb_id = VALUES(igdb_id), igdb_name = VALUES(igdb_name),
  best_score = VALUES(best_score), status = VALUES(status), status_error = VALUES(status_error),
  summary = VALUES(summary), first_release = VALUES(first_release), rating = VALUES(rating), rating_count = VALUES(rating_count),
  platforms = VALUES(platforms), genres = VALUES(genres), cover_url = VALUES(cover_url), screenshots = VALUES(screenshots), artworks = VALUES(artworks), videos = VALUES(videos),
  reset_votes = VALUES(reset_votes), fetched_at = UTC_TIMESTAMP(), raw_json = VALUES(raw_json);";

      await using var cmd = new MySqlCommand(sql, conn);
      cmd.Parameters.AddWithValue("@file_id", fileId);
      cmd.Parameters.AddWithValue("@file_name", fileName ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@title_guess", titleGuess ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@igdb_id", igdbId.HasValue ? (object)igdbId.Value : DBNull.Value);
      cmd.Parameters.AddWithValue("@igdb_name", igdbName ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@best_score", bestScore);
      cmd.Parameters.AddWithValue("@status", status ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@status_error", statusError ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@summary", summary ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@first_release", firstRelease.HasValue ? (object)DateTimeOffset.FromUnixTimeSeconds(firstRelease.Value).UtcDateTime : DBNull.Value);
      cmd.Parameters.AddWithValue("@rating", rating.HasValue ? (object)rating.Value : DBNull.Value);
      cmd.Parameters.AddWithValue("@rating_count", ratingCount.HasValue ? (object)ratingCount.Value : DBNull.Value);
      cmd.Parameters.AddWithValue("@platforms", platforms != null ? (object)platforms.ToString(Newtonsoft.Json.Formatting.None) : DBNull.Value);
      cmd.Parameters.AddWithValue("@genres", genres != null ? (object)genres.ToString(Newtonsoft.Json.Formatting.None) : DBNull.Value);
      cmd.Parameters.AddWithValue("@cover_url", coverUrl ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@screenshots", screenshots != null ? (object)screenshots.ToString(Newtonsoft.Json.Formatting.None) : DBNull.Value);
      cmd.Parameters.AddWithValue("@artworks", artworks != null ? (object)artworks.ToString(Newtonsoft.Json.Formatting.None) : DBNull.Value);
      cmd.Parameters.AddWithValue("@videos", videos != null ? (object)videos.ToString(Newtonsoft.Json.Formatting.None) : DBNull.Value);
      cmd.Parameters.AddWithValue("@reset_votes", resetVotes);
      cmd.Parameters.AddWithValue("@raw_json", rawJson ?? (object)DBNull.Value);

      await cmd.ExecuteNonQueryAsync();
    }

    private static readonly Dictionary<string, int> _emptyCache = new();

    // Note: a few helpers above duplicate logic from the original location to keep
    // the extraction safe and self-contained. They may be refactored later.
  }
}
