using System.Collections.Concurrent;
using MySqlConnector;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace maxhanna.Server.Services
{
    public class FlightBatchService : BackgroundService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _config;
        private readonly Log _log;
        private readonly string _connectionString;

        private readonly ConcurrentQueue<PendingBatch> _queue = new();
        private readonly ConcurrentDictionary<string, DateTime> _lastFetched = new();
        private readonly object _flushLock = new();
        private bool _flushPending = false;
        private bool _initialFlushScheduled = false;

        private const int CACHE_TTL_SECONDS = 60;
        private const int FLUSH_INTERVAL_SECONDS = 60;

        public FlightBatchService(IHttpClientFactory httpClientFactory, IConfiguration config, Log log)
        {
            _httpClientFactory = httpClientFactory;
            _config = config;
            _log = log;
            _connectionString = config.GetValue<string>("ConnectionStrings:maxhanna")!;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        { 
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(FLUSH_INTERVAL_SECONDS), stoppingToken);
                await FlushNow();
            }
        } 
        public async Task<List<List<object?>>> RequestStates(List<string> callsigns)
        {
            if (callsigns.Count == 0) return new List<List<object?>>();

            var unique = callsigns.Distinct(StringComparer.OrdinalIgnoreCase).ToList();

            // Gather fresh cached results
            var cached = await GetFromCache(unique);
            var cachedCs = cached.Select(c => c.callsign).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var results = cached.SelectMany(c => c.states).ToList();

            var missing = unique.Where(cs => !cachedCs.Contains(cs)).ToList();
            if (missing.Count == 0) return results;

            var tcs = new TaskCompletionSource<List<List<object?>>>(TaskCreationOptions.RunContinuationsAsynchronously);
            _queue.Enqueue(new PendingBatch { Callsigns = missing, Tcs = tcs });

            // Schedule an immediate flush if none is pending (with a short debounce)
            ScheduleFlush();

            var batchResult = await tcs.Task;
            results.AddRange(batchResult);
            return results;
        }

        private void ScheduleFlush()
        {
            lock (_flushLock)
            {
                if (_flushPending) return;
                _flushPending = true;
            }
            _ = Task.Run(async () =>
            {
                await Task.Delay(5000);
                await FlushNow();
                lock (_flushLock) { _flushPending = false; }
            });
        }

        private async Task FlushNow()
        {
            var batches = new List<PendingBatch>();
            while (_queue.TryDequeue(out var batch))
                batches.Add(batch);

            if (batches.Count == 0) return;

            // Deduplicate all callsigns across all pending batches
            var allCs = batches.SelectMany(b => b.Callsigns)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            // Check cache again (another request may have populated it)
            var cached = await GetFromCache(allCs);
            var cachedCs = cached.Select(c => c.callsign).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var toFetch = allCs.Where(cs => !cachedCs.Contains(cs)).ToList();

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);

            var fetchedStates = new List<List<object?>>();

            foreach (var cs in toFetch)
            {
                try
                {
                    var response = await client.GetAsync($"https://api.airplanes.live/v2/callsign/{Uri.EscapeDataString(cs)}");
                    if (response.IsSuccessStatusCode)
                    {
                        var json = await response.Content.ReadAsStringAsync();
                        var states = ParseAirplanesResponse(json);
                        fetchedStates.AddRange(states);
                        await SaveToCache(cs, states);
                    }
                }
                catch (Exception ex)
                {
                    _ = _log.Db($"FlightBatchService fetch error for {cs}: {ex.Message}", null, "FLIGHT", true);
                }
            }

            // Include cached results too
            fetchedStates.AddRange(cached.SelectMany(c => c.states));

            // Build per-callsign lookup
            var stateLookup = fetchedStates
                .Where(s => s.Count > 1 && s[1] is string)
                .GroupBy(s => ((string)s[1]!).Trim().ToUpperInvariant())
                .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

            // Resolve each batch with its subset
            foreach (var batch in batches)
            {
                var subset = batch.Callsigns
                    .Where(cs => stateLookup.ContainsKey(cs))
                    .SelectMany(cs => stateLookup[cs])
                    .ToList();
                batch.Tcs.TrySetResult(subset);
            }

            foreach (var cs in toFetch)
                _lastFetched[cs] = DateTime.UtcNow;
        }

        private async Task<List<(string callsign, List<List<object?>> states)>> GetFromCache(List<string> callsigns)
        {
            var results = new List<(string, List<List<object?>>)>();
            try
            {
                using var conn = new MySqlConnection(_connectionString);
                await conn.OpenAsync();
                foreach (var cs in callsigns)
                {
                    using var cmd = new MySqlCommand(
                        "SELECT states FROM maxhanna.flight_cache_v2 WHERE callsign = @cs AND fetched_at > UTC_TIMESTAMP() - INTERVAL @ttl SECOND",
                        conn);
                    cmd.Parameters.AddWithValue("@cs", cs);
                    cmd.Parameters.AddWithValue("@ttl", CACHE_TTL_SECONDS);
                    var raw = await cmd.ExecuteScalarAsync();
                    if (raw != null && raw != DBNull.Value)
                    {
                        var states = JsonConvert.DeserializeObject<List<List<object?>>>(raw.ToString()!) ?? new();
                        results.Add((cs, states));
                    }
                }
            }
            catch (Exception ex)
            {
                _ = _log.Db($"FlightBatchService cache read error: {ex.Message}", null, "FLIGHT", true);
            }
            return results;
        }

        private async Task SaveToCache(string callsign, List<List<object?>> states)
        {
            try
            {
                using var conn = new MySqlConnection(_connectionString);
                await conn.OpenAsync();
                using var cmd = new MySqlCommand(@"
                    INSERT INTO maxhanna.flight_cache_v2 (callsign, states, fetched_at)
                    VALUES (@cs, @data, UTC_TIMESTAMP())
                    ON DUPLICATE KEY UPDATE states = @data, fetched_at = UTC_TIMESTAMP()", conn);
                cmd.Parameters.AddWithValue("@cs", callsign);
                cmd.Parameters.AddWithValue("@data", JsonConvert.SerializeObject(states));
                await cmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                _ = _log.Db($"FlightBatchService cache write error for {callsign}: {ex.Message}", null, "FLIGHT", true);
            }
        }

        private static List<List<object?>> ParseAirplanesResponse(string json)
        {
            var results = new List<List<object?>>();
            var obj = JObject.Parse(json);
            var acArray = obj["ac"] as JArray;
            long now = obj["now"]?.Value<long>() ?? 0;
            long ts = now / 1000;
            if (acArray == null) return results;
            foreach (var ac in acArray)
            {
                var state = new List<object?>();
                state.Add(ac["hex"]?.ToString());
                state.Add(ac["flight"]?.ToString()?.Trim());
                state.Add("");
                state.Add(ts);
                state.Add(ts);
                state.Add(ac["lon"]?.Value<double?>());
                state.Add(ac["lat"]?.Value<double?>());
                var altToken = ac["alt_baro"];
                if (altToken != null && (altToken.Type == JTokenType.Float || altToken.Type == JTokenType.Integer))
                    state.Add(altToken.Value<double>());
                else if (altToken?.Type == JTokenType.String && altToken.Value<string>() == "ground")
                    state.Add(0);
                else
                    state.Add(null);
                state.Add(altToken?.Type == JTokenType.String && altToken.Value<string>() == "ground");
                state.Add(ac["gs"]?.Value<double?>());
                state.Add(ac["track"]?.Value<double?>());
                state.Add(ac["r"]?.ToString());
                state.Add(ac["t"]?.ToString());
                state.Add(ac["desc"]?.ToString());
                state.Add(ac["ownOp"]?.ToString());
                results.Add(state);
            }
            return results;
        }

        private class PendingBatch
        {
            public List<string> Callsigns { get; set; } = new();
            public TaskCompletionSource<List<List<object?>>> Tcs { get; set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        }
    }
}
