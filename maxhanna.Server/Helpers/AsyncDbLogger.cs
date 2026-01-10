
using System.Threading.Channels;
using MySqlConnector;

public sealed class AsyncDbLogger : IAsyncDisposable
{
    private const int MaxBatch = 100;
    private static readonly TimeSpan MaxInterval = TimeSpan.FromSeconds(5);

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
        var buffer = new List<(string c, string comp, int? uid, DateTime ts)>(MaxBatch);
        DateTime? flushDeadline = null;

        while (true)
        {
            // If buffer is empty, wait until at least one item is available or the channel is completed.
            if (buffer.Count == 0)
            {
                bool hasData;
                try
                {
                    hasData = await _channel.Reader.WaitToReadAsync(ct);
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                if (!hasData)
                    break; // Channel completed, nothing more to read.

                // Drain whatever is available (up to MaxBatch)
                while (buffer.Count < MaxBatch && _channel.Reader.TryRead(out var item))
                {
                    buffer.Add(item);
                }

                if (buffer.Count > 0)
                {
                    // Start a flush window (5s) for this batch
                    flushDeadline = DateTime.UtcNow + MaxInterval;
                }
                else
                {
                    // Spurious wake-up, continue loop
                    continue;
                }
            }
            else
            {
                // Buffer already has items. Either fill up to MaxBatch OR wait until deadline expires.
                var remaining = flushDeadline!.Value - DateTime.UtcNow;

                if (remaining <= TimeSpan.Zero)
                {
                    // Time-based flush
                    await FlushBatchAsync(buffer, ct);
                    buffer.Clear();
                    flushDeadline = null;
                    continue;
                }

                // Wait until either more data arrives or the deadline expires
                Task<bool> waitTask;
                try
                {
                    waitTask = _channel.Reader.WaitToReadAsync(ct).AsTask();
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                var delayTask = Task.Delay(remaining, ct);
                Task finished;

                try
                {
                    finished = await Task.WhenAny(waitTask, delayTask);
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                if (finished == waitTask && await waitTask)
                {
                    // There might be data—drain as much as we can (up to MaxBatch)
                    while (buffer.Count < MaxBatch && _channel.Reader.TryRead(out var item))
                    {
                        buffer.Add(item);
                    }

                    // If we reached MaxBatch, flush immediately
                    if (buffer.Count >= MaxBatch)
                    {
                        await FlushBatchAsync(buffer, ct);
                        buffer.Clear();
                        flushDeadline = null;
                    }
                    // otherwise, continue waiting until more arrives or the deadline hits
                }
                else
                {
                    // Deadline expired: time-based flush
                    await FlushBatchAsync(buffer, ct);
                    buffer.Clear();
                    flushDeadline = null;
                }
            }
        }

        // Channel completed or cancellation signaled—flush any remaining messages best-effort
        if (buffer.Count > 0)
        {
            try { await FlushBatchAsync(buffer, CancellationToken.None); }
            catch (Exception ex)
            {
                Console.WriteLine($"Log final flush failed: {ex.Message}");
            }
        }
    }

    private async Task FlushBatchAsync(
        List<(string c, string comp, int? uid, DateTime ts)> batch,
        CancellationToken ct)
    {
        if (batch.Count == 0 || string.IsNullOrEmpty(_connString))
            return;

        try
        {
            await using var conn = new MySqlConnection(_connString);
            await conn.OpenAsync(ct);

            await using var tx = await conn.BeginTransactionAsync(ct);

            const string sql = @"
                INSERT INTO maxhanna.logs (comment, component, user_id, timestamp)
                VALUES (@comment, @component, @userId, @ts);";

            await using var cmd = new MySqlCommand(sql, conn, (MySqlTransaction)tx) { CommandTimeout = 5 };
            var pComment   = cmd.Parameters.Add("@comment",   MySqlDbType.Text);
            var pComponent = cmd.Parameters.Add("@component", MySqlDbType.VarChar, 45);
            var pUserId    = cmd.Parameters.Add("@userId",    MySqlDbType.Int32);
            var pTs        = cmd.Parameters.Add("@ts",        MySqlDbType.DateTime);

            foreach (var (c, comp, uid, ts) in batch)
            {
                pComment.Value   = c;
                pComponent.Value = comp;
                pUserId.Value    = (object?)uid ?? DBNull.Value;
                pTs.Value        = ts; // preserve enqueue time; change to UTC_TIMESTAMP() in SQL if you prefer DB time
                await cmd.ExecuteNonQueryAsync(ct);
            }

            await tx.CommitAsync(ct);
        }
        catch (OperationCanceledException)
        {
            // Shutting down—best-effort logger: swallow
        }
        catch (Exception ex)
        {
            // Best-effort logger: don't rethrow
            Console.WriteLine($"Log insert failed (batch of {batch.Count}): {ex.Message}");
        }
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            // Signal completion so the worker can drain what’s left.
            _channel.Writer.TryComplete();
        }
        catch { /* ignore */ }

        // Give the worker up to 5s to flush, then cancel
        using var shutdownCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        using (shutdownCts.Token.Register(() => _cts.Cancel()))
        {
            try { await _worker.ConfigureAwait(false); }
            catch { /* ignore */ }
        }

        _cts.Dispose();
    }
}
