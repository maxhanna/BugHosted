
using System.Threading.Channels;
using MySqlConnector;

public sealed class AsyncDbLogger : IAsyncDisposable
{
    private readonly Channel<(string comment, string component, int? userId, DateTime ts)> _channel
        = Channel.CreateBounded<(string, string, int?, DateTime)>(new BoundedChannelOptions(5000)
        {
            SingleReader = true,
            SingleWriter = false,
            FullMode = BoundedChannelFullMode.DropWrite // drop when saturated to protect app
        });

    private readonly string? _connString;
    private readonly Task _worker;
    private readonly CancellationTokenSource _cts = new();

    public AsyncDbLogger(IConfiguration cfg)
    {
        _connString = cfg.GetConnectionString("maxhanna");
        _worker = Task.Run(() => WorkerAsync(_cts.Token));
    }

    public bool TryEnqueue(string message, string component = "SYSTEM", int? userId = null)
        => _channel.Writer.TryWrite((message ?? "", component ?? "SYSTEM", userId, DateTime.UtcNow));

    private async Task WorkerAsync(CancellationToken ct)
    {
        await using var conn = new MySqlConnection(_connString);
        await conn.OpenAsync(ct);

        const string sql = @"INSERT INTO maxhanna.logs (comment, component, user_id, timestamp)
                             VALUES (@comment, @component, @userId, @timestamp);";

        await using var cmd = new MySqlCommand(sql, conn) { CommandTimeout = 5 };
        var pComment   = cmd.Parameters.Add("@comment",   MySqlDbType.Text);
        var pComponent = cmd.Parameters.Add("@component", MySqlDbType.VarChar, 45);
        var pUserId    = cmd.Parameters.Add("@userId",    MySqlDbType.Int32);
        var pTs        = cmd.Parameters.Add("@timestamp", MySqlDbType.Timestamp);
        cmd.Prepare();

        var batch = new List<(string c, string comp, int? uid, DateTime ts)>(100);

        while (!ct.IsCancellationRequested)
        {
            batch.Clear();

            // Try to read up to N messages
            while (batch.Count < 100 && await _channel.Reader.WaitToReadAsync(ct))
            {
                while (batch.Count < 100 && _channel.Reader.TryRead(out var item))
                    batch.Add(item);

                if (batch.Count >= 100) break;
                // small wait to coalesce more writes
                await Task.Delay(25, ct);
            }

            foreach (var (c, comp, uid, ts) in batch)
            {
                pComment.Value   = c;
                pComponent.Value = comp;
                pUserId.Value    = (object?)uid ?? DBNull.Value;
                pTs.Value        = ts;
                try
                {
                    await cmd.ExecuteNonQueryAsync(ct);
                }
                catch (Exception ex)
                {
                    // last resort: console (do not rethrow)
                    Console.WriteLine($"Log insert failed: {ex.Message}");
                }
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        try { await _worker; } catch { /* ignore */ }
        _cts.Dispose();
    }
} 