using System;
using System.Threading;
using System.Threading.Tasks;

namespace maxhanna.Infrastructure
{
    /// <summary>
    /// Manages database operation load by serializing background/housekeeping tasks.
    /// Trade operations bypass the queue to execute immediately.
    /// </summary>
    public sealed class DbOperationQueue : IAsyncDisposable
    {
        // Count=1 means: at most one queued operation runs at any given time.
        private readonly SemaphoreSlim _gate = new(1, 1);
        private readonly AsyncLocal<bool> _isInGate = new();

        /// <summary>
        /// Enqueue a background/housekeeping operation. Only one such
        /// operation runs at a time; others wait their turn.
        /// Reentrant-safe: if the current call is already inside the gate,
        /// the operation runs immediately without waiting.
        /// </summary>
        public async Task EnqueueAsync(
            Func<Task> operation,
            CancellationToken ct = default)
        {
            if (_isInGate.Value)
            {
                await operation().ConfigureAwait(false);
                return;
            }
            await _gate.WaitAsync(ct).ConfigureAwait(false);
            _isInGate.Value = true;
            try
            {
                await operation().ConfigureAwait(false);
            }
            finally
            {
                _isInGate.Value = false;
                _gate.Release();
            }
        }

        /// <summary>Generic overload that returns a value.</summary>
        public async Task<T> EnqueueAsync<T>(
            Func<Task<T>> operation,
            CancellationToken ct = default)
        {
            if (_isInGate.Value)
            {
                return await operation().ConfigureAwait(false);
            }
            await _gate.WaitAsync(ct).ConfigureAwait(false);
            _isInGate.Value = true;
            try
            {
                return await operation().ConfigureAwait(false);
            }
            finally
            {
                _isInGate.Value = false;
                _gate.Release();
            }
        }

        /// <summary>
        /// Bypass lane for latency-sensitive operations (e.g., Trades).
        /// Does NOT wait for the gate; may run concurrently with a queued op.
        /// </summary>
        public Task<T> RunImmediateAsync<T>(
            Func<Task<T>> operation,
            CancellationToken ct = default) => operation();

        /// <summary>
        /// Bypass lane for latency-sensitive operations (e.g., Trades).
        /// Does NOT wait for the gate; may run concurrently with a queued op.
        /// </summary>
        public Task RunImmediateAsync(
            Func<Task> operation,
            CancellationToken ct = default) => operation();

        public ValueTask DisposeAsync()
        {
            _gate.Dispose();
            return ValueTask.CompletedTask;
        }
    }
}