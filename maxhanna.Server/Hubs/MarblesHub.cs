using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace maxhanna.Server.Hubs
{
    /// <summary>
    /// SignalR hub for "Marbles" — a Lose-Your-Marbles-style match-3 game.
    /// Players join a room, each plays their own board in a race to a target
    /// score, and scores are broadcast in real time. The server owns the board
    /// (single source of truth): clients send swap intents and the hub applies
    /// them, resolves cascades, and returns the authoritative board + score.
    /// </summary>
    public class MarblesHub : Hub
    {
        private const int BoardSize = 8;
        private const int ColorCount = 6;
        private const int TargetScore = 1000;
        private const int BasePointsPerMarble = 10;

        private static readonly Random _rng = new();
        private static readonly ConcurrentDictionary<string, Lobby> _lobbies = new();
        private static readonly ConcurrentDictionary<string, string> _connectionLobby = new();

        private class Lobby
        {
            public string Code = "";
            public string HostConnectionId = "";
            public string Status = "lobby"; // "lobby" | "playing"
            public readonly List<Player> Players = new();
            public readonly object Sync = new();
        }

        private class Player
        {
            public string ConnectionId = "";
            public string PlayerName = "";
            public int PlayerId = 0;
            public bool Ready = false;
            public int Score = 0;
            public int[,] Board = new int[BoardSize, BoardSize];
        }

        /// <summary>Live player count across all lobbies (for the nav badge).</summary>
        public static int ActivePlayerCount => _connectionLobby.Count;

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            if (!_connectionLobby.TryRemove(Context.ConnectionId, out var code)) return;
            if (!_lobbies.TryGetValue(code, out var lobby)) return;

            string? departedName = null;
            lock (lobby.Sync)
            {
                var p = lobby.Players.Find(x => x.ConnectionId == Context.ConnectionId);
                departedName = p?.PlayerName;
                lobby.Players.RemoveAll(x => x.ConnectionId == Context.ConnectionId);
                if (lobby.Players.Count == 0)
                {
                    _lobbies.TryRemove(code, out _);
                    return;
                }
                if (lobby.HostConnectionId == Context.ConnectionId)
                {
                    lobby.HostConnectionId = lobby.Players[0].ConnectionId;
                }
            }

            await Clients.Group(code).SendAsync("OnPlayerLeft", new { connectionId = Context.ConnectionId, playerName = departedName ?? "" });
            await BroadcastLobbyAsync(lobby);
        }

        // ── Lobby lifecycle ────────────────────────────────────────────────

        public async Task<object?> JoinLobby(string code, string playerName, int playerId)
        {
            code = (code ?? "").Trim().ToUpperInvariant();
            if (code.Length < 3 || code.Length > 16) code = NewCode();

            var lobby = _lobbies.GetOrAdd(code, _ => new Lobby { Code = code });

            lock (lobby.Sync)
            {
                var existing = lobby.Players.Find(p => p.ConnectionId == Context.ConnectionId);
                if (existing != null)
                {
                    existing.PlayerName = playerName;
                    existing.PlayerId = playerId;
                }
                else
                {
                    var player = new Player
                    {
                        ConnectionId = Context.ConnectionId,
                        PlayerName = string.IsNullOrWhiteSpace(playerName) ? "Player" : playerName,
                        PlayerId = playerId,
                    };
                    // The newest player starts un-ready; when the room is fresh the
                    // first joiner becomes host.
                    player.Board = GenerateBoard();
                    if (lobby.Players.Count == 0)
                    {
                        lobby.HostConnectionId = Context.ConnectionId;
                    }
                    lobby.Players.Add(player);
                }
            }

            _connectionLobby[Context.ConnectionId] = code;
            await Groups.AddToGroupAsync(Context.ConnectionId, code);
            await Clients.Group(code).SendAsync("OnPlayerJoined", new { connectionId = Context.ConnectionId, playerName });
            await BroadcastLobbyAsync(lobby);

            var me = lobby.Players.Find(p => p.ConnectionId == Context.ConnectionId);
            return new
            {
                code = code,
                hostConnectionId = lobby.HostConnectionId,
                status = lobby.Status,
                targetScore = TargetScore,
                players = lobby.Players.Select(p => PlayerView(p, lobby.HostConnectionId)).ToArray(),
                myBoard = me == null ? ToJagged(new int[BoardSize, BoardSize]) : ToJagged(me.Board),
                myScore = me?.Score ?? 0,
            };
        }

        public async Task LeaveLobby(string code)
        {
            if (!_lobbies.TryGetValue(code, out var lobby)) return;
            await OnDisconnectedAsync(null);
        }

        public async Task ToggleReady(string code)
        {
            if (!_lobbies.TryGetValue(code, out var lobby)) return;
            lock (lobby.Sync)
            {
                var p = lobby.Players.Find(x => x.ConnectionId == Context.ConnectionId);
                if (p == null) return;
                p.Ready = !p.Ready;
            }
            await BroadcastLobbyAsync(lobby);
        }

        public async Task StartGame(string code)
        {
            if (!_lobbies.TryGetValue(code, out var lobby)) return;
            List<Player> players;
            lock (lobby.Sync)
            {
                if (lobby.HostConnectionId != Context.ConnectionId) return;
                if (lobby.Players.Count < 1) return;
                lobby.Status = "playing";
                foreach (var p in lobby.Players)
                {
                    p.Score = 0;
                    p.Board = GenerateBoard();
                    p.Ready = false;
                }
                players = new List<Player>(lobby.Players);
            }
            await Clients.Group(code).SendAsync("OnGameStarted", new
            {
                targetScore = TargetScore,
                players = players.Select(p => PlayerView(p, lobby.HostConnectionId)).ToArray(),
            });
            // Each client gets its own authoritative starting board.
            foreach (var p in players)
            {
                await Clients.Client(p.ConnectionId).SendAsync("OnBoardUpdate", new
                {
                    valid = true,
                    board = ToJagged(p.Board),
                    score = 0,
                    gained = 0,
                });
            }
            await BroadcastLobbyAsync(lobby);
        }

        public async Task SendChat(string code, string message)
        {
            if (!_lobbies.TryGetValue(code, out var lobby)) return;
            var name = lobby.Players.Find(p => p.ConnectionId == Context.ConnectionId)?.PlayerName ?? "?";
            await Clients.Group(code).SendAsync("OnChatMessage", new { playerName = name, message = message });
        }

        // ── Gameplay ───────────────────────────────────────────────────────

        public async Task<object?> Swap(string code, int r1, int c1, int r2, int c2)
        {
            if (!_lobbies.TryGetValue(code, out var lobby)) return null;
            Player? player;
            lock (lobby.Sync)
            {
                if (lobby.Status != "playing") return null;
                player = lobby.Players.Find(p => p.ConnectionId == Context.ConnectionId);
                if (player == null) return null;
            }

            var board = player.Board;
            if (!InBounds(r1, c1) || !InBounds(r2, c2)) return null;
            if (board[r1, c1] == 0 || board[r2, c2] == 0) return null;
            if (Math.Abs(r1 - r2) + Math.Abs(c1 - c2) != 1) return null;

            // Try the swap; revert if it doesn't form a match.
            (board[r1, c1], board[r2, c2]) = (board[r2, c2], board[r1, c1]);
            if (!HasAnyMatch(board))
            {
                (board[r1, c1], board[r2, c2]) = (board[r2, c2], board[r1, c1]);
                return new { valid = false, board = ToJagged(player.Board), score = player.Score };
            }

            // Resolve cascades: clear matches → gravity → refill, until stable.
            var gained = ResolveCascades(board);
            player.Score += gained;

            var result = new
            {
                valid = true,
                board = ToJagged(player.Board),
                score = player.Score,
                gained,
            };

            await Clients.Client(Context.ConnectionId).SendAsync("OnBoardUpdate", result);
            await Clients.Group(code).SendAsync("OnScoreUpdate", PlayerView(player, lobby.HostConnectionId));
            if (player.Score >= TargetScore)
            {
                lock (lobby.Sync) { lobby.Status = "lobby"; }
                await Clients.Group(code).SendAsync("OnGameWon", PlayerView(player, lobby.HostConnectionId));
                await BroadcastLobbyAsync(lobby);
            }
            return result;
        }

        private async Task BroadcastLobbyAsync(Lobby lobby)
        {
            var view = new
            {
                code = lobby.Code,
                hostConnectionId = lobby.HostConnectionId,
                status = lobby.Status,
                targetScore = TargetScore,
                players = lobby.Players.Select(p => PlayerView(p, lobby.HostConnectionId)).ToArray(),
            };
            await Clients.Group(lobby.Code).SendAsync("OnLobbyState", view);
        }

        private static object PlayerView(Player p, string hostConnectionId) => new
        {
            connectionId = p.ConnectionId,
            playerName = p.PlayerName,
            playerId = p.PlayerId,
            ready = p.Ready,
            score = p.Score,
            isHost = p.ConnectionId == hostConnectionId,
        };

        /// <summary>
        /// Convert the server's rectangular board (int[,]) into a jagged array
        /// (int[][]) so it serializes correctly over SignalR's JSON protocol.
        /// System.Text.Json does not support multi-dimensional arrays.
        /// </summary>
        private static int[][] ToJagged(int[,] board)
        {
            var rows = board.GetLength(0);
            var cols = board.GetLength(1);
            var jagged = new int[rows][];
            for (var r = 0; r < rows; r++)
            {
                jagged[r] = new int[cols];
                for (var c = 0; c < cols; c++) jagged[r][c] = board[r, c];
            }
            return jagged;
        }

        // ── Match-3 engine ─────────────────────────────────────────────────

        private static bool InBounds(int r, int c) => r >= 0 && r < BoardSize && c >= 0 && c < BoardSize;

        private static int[,] GenerateBoard()
        {
            var board = new int[BoardSize, BoardSize];
            for (var r = 0; r < BoardSize; r++)
            {
                for (var c = 0; c < BoardSize; c++)
                {
                    int color;
                    do
                    {
                        color = _rng.Next(1, ColorCount + 1);
                    }
                    while (FormsMatch(board, r, c, color));
                    board[r, c] = color;
                }
            }
            return board;
        }

        private static bool FormsMatch(int[,] board, int r, int c, int color)
        {
            if (r >= 2 && board[r - 1, c] == color && board[r - 2, c] == color) return true;
            if (c >= 2 && board[r, c - 1] == color && board[r, c - 2] == color) return true;
            return false;
        }

        private static bool HasAnyMatch(int[,] board)
        {
            for (var r = 0; r < BoardSize; r++)
                for (var c = 0; c < BoardSize; c++)
                {
                    var color = board[r, c];
                    if (color == 0) continue;
                    if (c + 2 < BoardSize && board[r, c + 1] == color && board[r, c + 2] == color) return true;
                    if (r + 2 < BoardSize && board[r + 1, c] == color && board[r + 2, c] == color) return true;
                }
            return false;
        }

        /// <summary>Clear matches, drop marbles, refill, and repeat. Returns points gained.</summary>
        private static int ResolveCascades(int[,] board)
        {
            var total = 0;
            var chain = 0;
            while (true)
            {
                var matched = new bool[BoardSize, BoardSize];
                var cleared = 0;
                for (var r = 0; r < BoardSize; r++)
                {
                    for (var c = 0; c < BoardSize; c++)
                    {
                        var color = board[r, c];
                        if (color == 0) continue;
                        // horizontal runs
                        var run = 1;
                        while (c + run < BoardSize && board[r, c + run] == color) run++;
                        if (run >= 3)
                            for (var k = 0; k < run; k++) matched[r, c + k] = true;
                        // vertical runs
                        run = 1;
                        while (r + run < BoardSize && board[r + run, c] == color) run++;
                        if (run >= 3)
                            for (var k = 0; k < run; k++) matched[r + k, c] = true;
                    }
                }

                for (var r = 0; r < BoardSize; r++)
                    for (var c = 0; c < BoardSize; c++)
                        if (matched[r, c]) { board[r, c] = 0; cleared++; }

                if (cleared == 0) break;

                chain++;
                total += cleared * BasePointsPerMarble * chain;
                ApplyGravity(board);
                Refill(board);
            }
            return total;
        }

        private static void ApplyGravity(int[,] board)
        {
            for (var c = 0; c < BoardSize; c++)
            {
                var write = BoardSize - 1;
                for (var r = BoardSize - 1; r >= 0; r--)
                {
                    if (board[r, c] != 0)
                    {
                        board[write, c] = board[r, c];
                        if (write != r) board[r, c] = 0;
                        write--;
                    }
                }
            }
        }

        private static void Refill(int[,] board)
        {
            for (var c = 0; c < BoardSize; c++)
            {
                for (var r = 0; r < BoardSize; r++)
                {
                    if (board[r, c] == 0)
                    {
                        int color;
                        do { color = _rng.Next(1, ColorCount + 1); }
                        while (FormsMatch(board, r, c, color));
                        board[r, c] = color;
                    }
                }
            }
        }

        private static string NewCode()
        {
            const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            var chars = new char[4];
            for (var i = 0; i < chars.Length; i++) chars[i] = alphabet[_rng.Next(alphabet.Length)];
            return new string(chars);
        }
    }
}
