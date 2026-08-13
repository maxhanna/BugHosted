using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace maxhanna.Server.Hubs
{
    /// <summary>
    /// SignalR hub for "Marbles" — a faithful remake of the classic 1997
    /// "Lose Your Marbles" marble-dropper (SegaSoft).
    ///
    /// Each player has a 6×12 pegboard. Marbles drop one at a time into a
    /// column of your choice; when 3+ same-colored marbles touch (orthogonally)
    /// they pop, and each popped group of size N sends N−2 marbles raining onto
    /// a random opponent's board. Whoever's columns fill up first loses.
    /// </summary>
    public class MarblesHub : Hub
    {
        private const int Cols = 6;
        private const int Rows = 12;
        private const int ColorCount = 6;

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
            public bool Alive = true;
            public int Sent = 0;
            public int CurrentColor = 0;
            public int[] Heights = new int[Cols];
            public int[][] Board = EmptyBoard();
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
            await CheckGameOverAsync(lobby);
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
                players = lobby.Players.Select(p => PlayerView(p, lobby.HostConnectionId)).ToArray(),
                myBoard = me == null ? EmptyBoard() : me.Board,
                myCurrentColor = me?.CurrentColor ?? 0,
                mySent = me?.Sent ?? 0,
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
                    p.Ready = false;
                    p.Alive = true;
                    p.Sent = 0;
                    p.CurrentColor = _rng.Next(1, ColorCount + 1);
                    p.Board = EmptyBoard();
                }
                players = new List<Player>(lobby.Players);
            }
            await Clients.Group(code).SendAsync("OnGameStarted", new
            {
                players = players.Select(p => PlayerView(p, lobby.HostConnectionId)).ToArray(),
            });
            foreach (var p in players)
            {
                await Clients.Client(p.ConnectionId).SendAsync("OnBoardUpdate", MakeUpdate(p, null, 0, false, false));
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

        /// <summary>
        /// Drop your current marble into a column. The server owns the board:
        /// it places the marble, resolves pops + cascades, rains N−2 marbles per
        /// popped group onto a random alive opponent, and checks for overflow.
        /// </summary>
        public async Task<object?> Drop(string code, int col)
        {
            if (!_lobbies.TryGetValue(code, out var lobby)) return null;

            var updates = new Dictionary<string, object?>();
            var rainedBy = new Dictionary<string, int>();
            string? winnerName = null;
            lock (lobby.Sync)
            {
                if (lobby.Status != "playing") return null;
                var player = lobby.Players.Find(p => p.ConnectionId == Context.ConnectionId);
                if (player == null || !player.Alive) return null;
                if (col < 0 || col >= Cols) return null;

                if (player.Heights[col] >= Rows)
                {
                    // Dropping into a full column overflows your own board.
                    player.Alive = false;
                }
                else
                {
                    var row = Rows - 1 - player.Heights[col];
                    player.Board[row][col] = player.CurrentColor;
                    player.Heights[col]++;
                    player.CurrentColor = _rng.Next(1, ColorCount + 1);

                    var result = ResolvePops(player.Board, player.Heights);
                    player.Sent += result.Marbles.Count;

                    // Rain the sent marbles onto a random alive opponent.
                    var target = PickAliveOpponent(lobby, player);
                    if (target != null && result.Marbles.Count > 0)
                    {
                        rainedBy[target.ConnectionId] = result.Marbles.Count;
                        foreach (var color in result.Marbles)
                        {
                            RainOne(target, color);
                        }
                    }

                    updates[player.ConnectionId] = MakeUpdate(player, result.Popped, 0, true, false);
                }

                // Build updates for everyone else (rain targets get their count).
                foreach (var p in lobby.Players)
                {
                    if (updates.ContainsKey(p.ConnectionId)) continue;
                    updates[p.ConnectionId] = MakeUpdate(p, null, rainedBy.GetValueOrDefault(p.ConnectionId), false, false);
                }
            }

            // Winners are determined after the lock so broadcasts stay outside it.
            winnerName = DetermineWinner(lobby);

            foreach (var kv in updates)
            {
                var payload = (Dictionary<string, object?>)kv.Value!;
                if (winnerName != null)
                {
                    payload["winnerName"] = winnerName;
                }
                await Clients.Client(kv.Key).SendAsync("OnBoardUpdate", payload);
            }

            if (winnerName != null)
            {
                await Clients.Group(code).SendAsync("OnGameWon", new { winnerName });
                lock (lobby.Sync) { lobby.Status = "lobby"; }
                await BroadcastLobbyAsync(lobby);
            }
            else
            {
                await BroadcastLobbyAsync(lobby);
            }
            return new { ok = true };
        }

        // ── Engine ─────────────────────────────────────────────────────────

        private static void RainOne(Player target, int color)
        {
            // Random column; a marble landing in a full column overflows the board.
            var col = _rng.Next(0, Cols);
            if (target.Heights[col] >= Rows)
            {
                target.Alive = false;
                return;
            }
            var row = Rows - 1 - target.Heights[col];
            target.Board[row][col] = color;
            target.Heights[col]++;
        }

        private static Player? PickAliveOpponent(Lobby lobby, Player self)
        {
            var others = lobby.Players.Where(p => p.ConnectionId != self.ConnectionId && p.Alive).ToList();
            if (others.Count == 0) return null;
            return others[_rng.Next(others.Count)];
        }

        private static string? DetermineWinner(Lobby lobby)
        {
            lock (lobby.Sync)
            {
                var alive = lobby.Players.Where(p => p.Alive).ToList();
                if (alive.Count == 1) return alive[0].PlayerName;
                if (alive.Count == 0) return lobby.Players.Count > 0 ? lobby.Players[0].PlayerName : null;
                return null;
            }
        }

        /// <summary>Popped group resolution + cascades with gravity. Returns sent marbles and cleared cells.</summary>
        private static PopResult ResolvePops(int[][] board, int[] heights)
        {
            var marbles = new List<int>();
            var popped = new List<object>();
            for (;;)
            {
                var groups = FindGroups(board);
                var toPop = groups.Where(g => g.Count >= 3).ToList();
                if (toPop.Count == 0) break;

                foreach (var g in toPop)
                {
                    var color = board[g[0].r][g[0].c];
                    // A group of size N sends N−2 marbles to the opponent.
                    for (var i = 0; i < g.Count - 2; i++) marbles.Add(color);
                    foreach (var cell in g)
                    {
                        popped.Add(new { row = cell.r, col = cell.c, color });
                        board[cell.r][cell.c] = 0;
                    }
                }
                Gravity(board, heights);
            }
            return new PopResult { Marbles = marbles, Popped = popped };
        }

        private static List<List<(int r, int c)>> FindGroups(int[][] board)
        {
            var groups = new List<List<(int, int)>>();
            var seen = new bool[Rows, Cols];
            for (var r = 0; r < Rows; r++)
            {
                for (var c = 0; c < Cols; c++)
                {
                    if (seen[r, c] || board[r][c] == 0) continue;
                    var color = board[r][c];
                    var stack = new Stack<(int, int)>();
                    stack.Push((r, c));
                    seen[r, c] = true;
                    var group = new List<(int, int)>();
                    while (stack.Count > 0)
                    {
                        var (cr, cc) = stack.Pop();
                        group.Add((cr, cc));
                        foreach (var (dr, dc) in new[] { (0, 1), (0, -1), (1, 0), (-1, 0) })
                        {
                            var nr = cr + dr;
                            var nc = cc + dc;
                            if (nr < 0 || nr >= Rows || nc < 0 || nc >= Cols) continue;
                            if (seen[nr, nc] || board[nr][nc] != color) continue;
                            seen[nr, nc] = true;
                            stack.Push((nr, nc));
                        }
                    }
                    groups.Add(group);
                }
            }
            return groups;
        }

        private static void Gravity(int[][] board, int[] heights)
        {
            for (var c = 0; c < Cols; c++)
            {
                var write = Rows - 1;
                for (var r = Rows - 1; r >= 0; r--)
                {
                    if (board[r][c] != 0)
                    {
                        if (write != r)
                        {
                            board[write][c] = board[r][c];
                            board[r][c] = 0;
                        }
                        write--;
                    }
                }
                heights[c] = Rows - 1 - write;
            }
        }

        private static int[][] EmptyBoard()
        {
            var board = new int[Rows][];
            for (var r = 0; r < Rows; r++)
            {
                board[r] = new int[Cols];
            }
            return board;
        }

        private static Dictionary<string, object?> MakeUpdate(Player p, List<object>? popped, int rained, bool dropped, bool _)
        {
            return new Dictionary<string, object?>
            {
                ["board"] = p.Board,
                ["currentColor"] = p.CurrentColor,
                ["sent"] = p.Sent,
                ["popped"] = popped ?? new List<object>(),
                ["rained"] = rained,
                ["dropped"] = dropped,
                ["alive"] = p.Alive,
                ["winnerName"] = (string?)null,
            };
        }

        private async Task BroadcastLobbyAsync(Lobby lobby)
        {
            var view = new
            {
                code = lobby.Code,
                hostConnectionId = lobby.HostConnectionId,
                status = lobby.Status,
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
            sent = p.Sent,
            isHost = p.ConnectionId == hostConnectionId,
            alive = p.Alive,
            heights = p.Heights,
        };

        private async Task CheckGameOverAsync(Lobby lobby)
        {
            var winner = DetermineWinner(lobby);
            if (winner == null) return;
            await Clients.Group(lobby.Code).SendAsync("OnGameWon", new { winnerName = winner });
            lock (lobby.Sync) { lobby.Status = "lobby"; }
            await BroadcastLobbyAsync(lobby);
        }

        private static string NewCode()
        {
            const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            var chars = new char[4];
            for (var i = 0; i < chars.Length; i++) chars[i] = alphabet[_rng.Next(alphabet.Length)];
            return new string(chars);
        }

        private class PopResult
        {
            public List<int> Marbles = new();
            public List<object> Popped = new();
        }
    }
}
