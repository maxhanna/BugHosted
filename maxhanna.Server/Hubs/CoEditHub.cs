using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace maxhanna.Server.Hubs
{
    /// <summary>
    /// SignalR hub for real-time co-editing of files.
    /// Clients join a "file group" identified by the normalized file path.
    /// </summary>
    public class CoEditHub : Hub
    {
        // Track which connections are editing which files, and their display names
        private static readonly ConcurrentDictionary<string, ParticipantInfo> _participants = new();

        // Track current content version per file (monotonic counter)
        private static readonly ConcurrentDictionary<string, long> _fileVersions = new();

        // Track last known content per file for new joiners
        private static readonly ConcurrentDictionary<string, string> _fileContents = new();

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            if (_participants.TryRemove(Context.ConnectionId, out var info))
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, info.FilePath);
                await Clients.Group(info.FilePath)
                    .SendAsync("OnParticipantLeft", Context.ConnectionId, info.DisplayName);
            }
            await base.OnDisconnectedAsync(exception);
        }

        /// <summary>
        /// Join the co-editing session for a file.
        /// Caller receives the current participant list + latest content.
        /// </summary>
        public async Task JoinFile(string path, string displayName)
        {
            var normalised = NormalisePath(path);
            var old = _participants.Values
                .Where(p => p.ConnectionId == Context.ConnectionId)
                .ToList();
            foreach (var o in old)
            {
                _participants.TryRemove(o.ConnectionId, out _);
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, o.FilePath);
                await Clients.Group(o.FilePath)
                    .SendAsync("OnParticipantLeft", Context.ConnectionId, o.DisplayName);
            }

            _participants[Context.ConnectionId] = new ParticipantInfo
            {
                ConnectionId = Context.ConnectionId,
                FilePath = normalised,
                DisplayName = displayName
            };

            await Groups.AddToGroupAsync(Context.ConnectionId, normalised);

            // Tell everyone else this person joined
            await Clients.OthersInGroup(normalised)
                .SendAsync("OnParticipantJoined", Context.ConnectionId, displayName);

            // Send current participants (excluding caller) to the caller
            var current = _participants.Values
                .Where(p => p.FilePath == normalised && p.ConnectionId != Context.ConnectionId)
                .Select(p => new { connectionId = p.ConnectionId, displayName = p.DisplayName, cursor = p.Cursor })
                .ToList();

            long version = _fileVersions.GetOrAdd(normalised, 0);
            _fileContents.TryGetValue(normalised, out var content);

            await Clients.Caller.SendAsync("OnCurrentParticipants", current, version, content);
        }

        /// <summary>
        /// Leave the co-editing session for a file.
        /// </summary>
        public async Task LeaveFile(string path)
        {
            var normalised = NormalisePath(path);
            if (_participants.TryRemove(Context.ConnectionId, out var info))
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, normalised);
                await Clients.Group(normalised)
                    .SendAsync("OnParticipantLeft", Context.ConnectionId, info.DisplayName);
            }
        }

        /// <summary>
        /// Push full file content to all other co-editors.
        /// version must be monotonically increasing; clients discard stale updates.
        /// </summary>
        public async Task PushContent(string path, string content, long version)
        {
            var normalised = NormalisePath(path);
            _fileVersions.AddOrUpdate(normalised, version, (_, old) => Math.Max(old, version));
            _fileContents[normalised] = content;

            await Clients.OthersInGroup(normalised)
                .SendAsync("OnContentChanged", Context.ConnectionId, content, version);
        }

        /// <summary>
        /// Broadcast cursor/selection position to other co-editors.
        /// </summary>
        public async Task PushCursor(string path, int line, int col,
                                     int? selEndLine = null, int? selEndCol = null)
        {
            var normalised = NormalisePath(path);
            if (_participants.TryGetValue(Context.ConnectionId, out var info))
            {
                info.Cursor = new CursorInfo
                {
                    Line = line, Col = col,
                    SelEndLine = selEndLine, SelEndCol = selEndCol
                };
            }

            await Clients.OthersInGroup(normalised)
                .SendAsync("OnCursorChanged", Context.ConnectionId, line, col, selEndLine, selEndCol);
        }

        private static string NormalisePath(string path) =>
            path.Replace('\\', '/').Trim('/').ToLowerInvariant();

        private class ParticipantInfo
        {
            public string ConnectionId { get; set; } = "";
            public string FilePath { get; set; } = "";
            public string DisplayName { get; set; } = "";
            public CursorInfo? Cursor { get; set; }
        }

        private class CursorInfo
        {
            public int Line { get; set; }
            public int Col { get; set; }
            public int? SelEndLine { get; set; }
            public int? SelEndCol { get; set; }
        }
    }
}
