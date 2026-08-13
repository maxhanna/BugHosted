using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace maxhanna.Server.Hubs
{
    /// <summary>
    /// SignalR hub for "Marbles" — a faithful remake of SegaSoft's 1997
    /// "Lose Your Marbles" (the Windows 98 playground marble game).
    ///
    /// Board: 6 columns × 12 rows of holes. A highlighted CENTER ROW (the
    /// "pitch line") is the match zone. You shift the center row left/right
    /// (marbles wrap around the ends) and shift individual columns up/down
    /// (marbles cycle through the column) to bring same-colored marbles side
    /// by side in the pitch row. 3+ in a row pop; marbles above fall down.
    ///
    /// A special "hot" color is designated: popping groups that contain it
    /// fills your reserve. Popping a match of 5+ dumps your reserve onto a
    /// random opponent's board. New marbles rain in from the top every few
    /// seconds; whoever's columns fill up first loses.
    /// </summary>
    public class MarblesHub : Hub
    {
        private const int Cols = 6;
        private const int Rows = 12;
        private const int PitchRow = 5; // 0-indexed center row
        private const int ColorCount = 6;
        private static readonly TimeSpan DropInterval = TimeSpan.FromSeconds(5);

        private static readonly Random _rng = new();
        private static readonly ConcurrentDictionary<string, Lobby> _lobbies = new();
        private static readonly ConcurrentDictionary<string, string> _connectionLobby = new();

        private readonly IHubContext<MarblesHub> _hubContext;

        public MarblesHub(IHubContext<MarblesHub> hubContext)
        {
            _hubContext = hubContext;
        }

        private class Lobby
        {
            public string Code = "";
            public string HostConnectionId = "";
            public string Status = "lobby"; // "lobby" | "playing"
            public CancellationTokenSource? DropCts;
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
            public bool IsBot = false;
            public int Difficulty = 0; // 0 easy, 1 medium, 2 hard (bots only)
            public int Sent = 0;
            public int Reserve = 0;
            public int SpecialColor = 0;
            public int[][] Board = EmptyBoard();
        }

        /// <summary>Live player count across all lobbies (for the nav badge).</summary>
        public static int ActivePlayerCount => _connectionLobby.Count;

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            if (!_connectionLobby.TryRemove(Context.ConnectionId, out var code)) return;
            if (!_lobbies.TryGetValue(code, out var lobby)) return;

            string? departedName = null;
            CancellationTokenSource? cts = null;
            lock (lobby.Sync)
            {
                var p = lobby.Players.Find(x => x.ConnectionId == Context.ConnectionId);
                departedName = p?.PlayerName;
                lobby.Players.RemoveAll(x => x.ConnectionId == Context.ConnectionId);
                if (lobby.Players.Count == 0)
                {
                    cts = lobby.DropCts;
                    lobby.DropCts = null;
                    _lobbies.TryRemove(code, out _);
                }
                else
                {
                    if (lobby.HostConnectionId == Context.ConnectionId)
                    {
                        lobby.HostConnectionId = lobby.Players[0].ConnectionId;
                    }
                }
            }
            if (cts != null) { cts.Cancel(); cts.Dispose(); }

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
                myBoard = me?.Board ?? EmptyBoard(),
                mySpecialColor = me?.SpecialColor ?? 0,
                myReserve = me?.Reserve ?? 0,
                mySent = me?.Sent ?? 0,
                opponents = lobby.Players
                    .Where(o => o.ConnectionId != Context.ConnectionId)
                    .Select(o => OpponentView(o)).ToArray(),
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
            CancellationTokenSource? cts = null;
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
                    p.Reserve = 0;
                    p.SpecialColor = _rng.Next(1, ColorCount + 1);
                    p.Board = GenerateStartBoard();
                }
                players = new List<Player>(lobby.Players);
                if (lobby.DropCts != null) { lobby.DropCts.Cancel(); lobby.DropCts.Dispose(); }
                lobby.DropCts = new CancellationTokenSource();
                cts = lobby.DropCts;
            }

            await Clients.Group(code).SendAsync("OnGameStarted", new
            {
                players = players.Select(p => PlayerView(p, lobby.HostConnectionId)).ToArray(),
            });
            foreach (var p in players)
            {
                await Clients.Client(p.ConnectionId).SendAsync("OnBoardUpdate", MakeUpdate(lobby, p, null, 0, false));
            }
            await BroadcastLobbyAsync(lobby);

            // Periodic marble drops — the board fills up over time.
            _ = Task.Run(() => DropLoopAsync(code, cts!.Token));
        }

        public async Task SendChat(string code, string message)
        {
            if (!_lobbies.TryGetValue(code, out var lobby)) return;
            var name = lobby.Players.Find(p => p.ConnectionId == Context.ConnectionId)?.PlayerName ?? "?";
            await Clients.Group(code).SendAsync("OnChatMessage", new { playerName = name, message = message });
        }

        // ── Single-player vs AI ────────────────────────────────────────────

        /// <summary>
        /// Host a single-player game against a computer opponent. Difficulty:
        /// 0 = easy, 1 = medium, 2 = hard. The server spawns a bot player and
        /// drives it through the same shift/match engine the human uses.
        /// </summary>
        public async Task StartVsAI(string code, int difficulty)
        {
            if (!_lobbies.TryGetValue(code, out var lobby)) return;
            List<Player> players;
            CancellationTokenSource? cts = null;
            lock (lobby.Sync)
            {
                var host = lobby.Players.Find(p => p.ConnectionId == Context.ConnectionId);
                if (host == null) return;
                if (lobby.HostConnectionId != Context.ConnectionId) return;

                lobby.Status = "playing";

                // Reuse the existing player slot for the human; replace any old bot.
                lobby.Players.RemoveAll(p => p.IsBot);
                var bot = new Player
                {
                    ConnectionId = "bot-" + code,
                    PlayerName = difficulty switch { 1 => "Computer (Medium)", 2 => "Computer (Hard)", _ => "Computer (Easy)" },
                    PlayerId = -1,
                    IsBot = true,
                    Difficulty = difficulty,
                    Ready = true,
                    Alive = true,
                };
                lobby.Players.Add(bot);

                foreach (var p in lobby.Players)
                {
                    p.Ready = false;
                    p.Alive = true;
                    p.Sent = 0;
                    p.Reserve = 0;
                    p.SpecialColor = _rng.Next(1, ColorCount + 1);
                    p.Board = GenerateStartBoard();
                }
                players = new List<Player>(lobby.Players);

                if (lobby.DropCts != null) { lobby.DropCts.Cancel(); lobby.DropCts.Dispose(); }
                lobby.DropCts = new CancellationTokenSource();
                cts = lobby.DropCts;
            }

            await Clients.Group(code).SendAsync("OnGameStarted", new
            {
                players = players.Select(p => PlayerView(p, lobby.HostConnectionId)).ToArray(),
            });
            foreach (var p in players)
            {
                if (!p.IsBot) await Clients.Client(p.ConnectionId).SendAsync("OnBoardUpdate", MakeUpdate(lobby, p, null, 0, false));
            }
            await BroadcastLobbyAsync(lobby);

            _ = Task.Run(() => DropLoopAsync(code, cts!.Token));
            _ = Task.Run(() => AiLoopAsync(code, cts!.Token));
        }

        /// <summary>
        /// Background loop that picks and plays moves for the bot player.
        /// Difficulty controls both reaction speed and move quality.
        /// </summary>
        private async Task AiLoopAsync(string code, CancellationToken ct)
        {
            var rng = new Random();
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    if (!_lobbies.TryGetValue(code, out var lobby)) return;

                    Player? bot = null;
                    lock (lobby.Sync)
                    {
                        if (lobby.Status != "playing") bot = null;
                        else bot = lobby.Players.FirstOrDefault(p => p.IsBot && p.Alive);
                    }
                    if (bot == null) { await Task.Delay(500, ct); continue; }

                    var thinkMs = bot.Difficulty switch { 0 => 2000, 1 => 1300, _ => 850 };
                    await Task.Delay(thinkMs, ct);
                    if (!_lobbies.TryGetValue(code, out lobby)) return;

                    // Re-read the bot under the lock so the board is current.
                    Player? currentBot = null;
                    List<int[][]>? botBoard = null;
                    lock (lobby.Sync)
                    {
                        if (lobby.Status != "playing") continue;
                        currentBot = lobby.Players.FirstOrDefault(p => p.IsBot && p.Alive);
                        if (currentBot == null) continue;
                        botBoard = new List<int[][]> { CloneBoard(currentBot.Board) };
                    }
                    if (currentBot == null || botBoard == null) continue;

                    var move = PickAiMove(botBoard[0], currentBot.SpecialColor, currentBot.Difficulty, rng);
                    if (move == null) continue;

                    Action<Player> apply = move.Kind switch
                    {
                        0 => p => ShiftRowOn(p.Board, move.Dir),
                        _ => p => ShiftColumnOn(p.Board, move.Col, move.Dir),
                    };
                    var (updates, winnerName) = ApplyMoveAndResolve(lobby, currentBot, apply);
                    if (updates.Count == 0) continue;
                    await SendMoveUpdatesAsync(code, updates, winnerName);
                    if (winnerName != null) return;
                }
            }
            catch (OperationCanceledException) { /* lobby ended */ }
        }

        /// <summary>
        /// Score every legal move on a clone of the board and return the best,
        /// with difficulty-based noise (easy plays sloppier, hard plays greedy).
        /// MoveKind 0 = row shift, 1 = column shift.
        /// </summary>
        private static AiMove? PickAiMove(int[][] board, int specialColor, int difficulty, Random rng)
        {
            var candidates = new List<AiMove>();
            void Consider(int kind, int col, int dir)
            {
                var clone = CloneBoard(board);
                if (kind == 0) ShiftRowOn(clone, dir); else ShiftColumnOn(clone, col, dir);
                var result = SimulateResolve(clone, specialColor);
                candidates.Add(new AiMove
                {
                    Kind = kind,
                    Col = col,
                    Dir = dir,
                    Score = result.PoppedCount * 12 + result.ReserveGained * 6 + (result.HasFivePlus ? 30 : 0),
                });
            }

            Consider(0, 0, -1);
            Consider(0, 0, 1);
            for (var c = 0; c < Cols; c++)
            {
                Consider(1, c, -1);
                Consider(1, c, 1);
            }

            var bestScore = candidates.Max(x => x.Score);
            var best = candidates.Where(x => x.Score == bestScore).ToList();

            // Difficulty noise: easy picks randomly among moves, hard always takes best.
            if (difficulty == 0 && rng.Next(100) < 55) return candidates[rng.Next(candidates.Count)];
            if (difficulty == 1 && rng.Next(100) < 25)
            {
                var decent = candidates.Where(x => x.Score >= bestScore - 12).ToList();
                return decent[rng.Next(decent.Count)];
            }
            return best[rng.Next(best.Count)];
        }

        /// <summary>Resolve matches on a throwaway board (used by the AI's move scoring).</summary>
        private static MoveResult SimulateResolve(int[][] board, int specialColor)
        {
            var popped = new List<object>();
            var reserveGained = 0;
            var hasFivePlus = false;
            var poppedCount = 0;

            for (;;)
            {
                var runs = new List<(int start, int len)>();
                var c = 0;
                while (c < Cols)
                {
                    var color = board[PitchRow][c];
                    if (color == 0) { c++; continue; }
                    var runStart = c;
                    while (c < Cols && board[PitchRow][c] == color) c++;
                    var len = c - runStart;
                    if (len >= 3) runs.Add((runStart, len));
                }
                if (runs.Count == 0) break;

                foreach (var (runStart, len) in runs)
                {
                    for (var k = runStart; k < runStart + len; k++)
                    {
                        var color = board[PitchRow][k];
                        popped.Add(new { row = PitchRow, col = k, color });
                        board[PitchRow][k] = 0;
                        poppedCount++;
                        if (color == specialColor) reserveGained++;
                    }
                    if (len >= 5) hasFivePlus = true;
                }
                ApplyGravity(board);
            }

            return new MoveResult { Popped = popped, ReserveGained = reserveGained, HasFivePlus = hasFivePlus, PoppedCount = poppedCount };
        }

        private static int[][] CloneBoard(int[][] board)
        {
            var clone = EmptyBoard();
            for (var r = 0; r < Rows; r++)
            {
                Array.Copy(board[r], clone[r], Cols);
            }
            return clone;
        }

        private class AiMove
        {
            public int Kind = 0;
            public int Col = 0;
            public int Dir = 0;
            public int Score = 0;
        }

        // ── Gameplay: the center-row slider ────────────────────────────────

        /// <summary>
        /// Shift the CENTER ROW left (-1) or right (+1). All marbles in the
        /// pitch row slide one cell; the marble at the far edge wraps around.
        /// </summary>
        public async Task<object?> ShiftRow(string code, int dir)
        {
            return await DoMove(code, p => ShiftRowOn(p.Board, dir));
        }

        /// <summary>
        /// Shift a COLUMN up (-1) or down (+1). All marbles in the column
        /// cycle one cell; the marble at the edge wraps to the other end.
        /// </summary>
        public async Task<object?> ShiftColumn(string code, int col, int dir)
        {
            if (col < 0 || col >= Cols) return null;
            return await DoMove(code, p => ShiftColumnOn(p.Board, col, dir));
        }

        private static void ShiftRowOn(int[][] board, int dir)
        {
            var newRow = new int[Cols];
            for (var c = 0; c < Cols; c++)
            {
                var src = (c - dir + Cols) % Cols;
                newRow[c] = board[PitchRow][src];
            }
            for (var c = 0; c < Cols; c++) board[PitchRow][c] = newRow[c];
        }

        private static void ShiftColumnOn(int[][] board, int col, int dir)
        {
            var newCol = new int[Rows];
            for (var r = 0; r < Rows; r++)
            {
                var src = (r - dir + Rows) % Rows;
                newCol[r] = board[src][col];
            }
            for (var r = 0; r < Rows; r++) board[r][col] = newCol[r];
        }

        private async Task<object?> DoMove(string code, Action<Player> apply)
        {
            if (!_lobbies.TryGetValue(code, out var lobby)) return null;
            Player? mover;
            lock (lobby.Sync)
            {
                if (lobby.Status != "playing") return null;
                mover = lobby.Players.Find(p => p.ConnectionId == Context.ConnectionId);
                if (mover == null || !mover.Alive) return null;
            }

            var (updates, winnerName) = ApplyMoveAndResolve(lobby, mover, apply);
            if (updates.Count == 0) return null;
            await SendMoveUpdatesAsync(code, updates, winnerName);
            return new { ok = true };
        }

        /// <summary>
        /// Apply a shift to a player's board, resolve pitch-row matches,
        /// handle reserve dumps, and build the per-player update payloads.
        /// Shared by human moves and the single-player AI loop.
        /// </summary>
        private static (Dictionary<string, object?> Updates, string? Winner) ApplyMoveAndResolve(Lobby lobby, Player mover, Action<Player> apply)
        {
            var updates = new Dictionary<string, object?>();
            var rainedBy = new Dictionary<string, int>();
            lock (lobby.Sync)
            {
                if (lobby.Status != "playing" || !mover.Alive) return (updates, null);

                apply(mover);

                // Resolve pitch-row matches (cascades included).
                var result = ResolveMatches(mover);
                if (result.ReserveGained > 0) mover.Reserve += result.ReserveGained;

                // A 5+ match dumps the reserve onto a random alive opponent.
                if (result.HasFivePlus)
                {
                    var target = PickAliveOpponent(lobby, mover);
                    if (target != null)
                    {
                        var dump = mover.Reserve > 0 ? mover.Reserve : result.PoppedCount;
                        mover.Sent += dump;
                        rainedBy[target.ConnectionId] = dump;
                        for (var i = 0; i < dump; i++)
                        {
                            RainOne(target, _rng.Next(1, ColorCount + 1));
                        }
                        mover.Reserve = 0;
                    }
                }

                updates[mover.ConnectionId] = MakeUpdate(lobby, mover, result.Popped, 0, false);
                foreach (var p in lobby.Players)
                {
                    if (updates.ContainsKey(p.ConnectionId)) continue;
                    updates[p.ConnectionId] = MakeUpdate(lobby, p, null, rainedBy.GetValueOrDefault(p.ConnectionId), false);
                }
            }

            return (updates, DetermineWinner(lobby));
        }

        private async Task SendMoveUpdatesAsync(string code, Dictionary<string, object?> updates, string? winnerName)
        {
            foreach (var kv in updates)
            {
                var payload = (Dictionary<string, object?>)kv.Value!;
                if (winnerName != null) payload["winnerName"] = winnerName;
                await _hubContext.Clients.Client(kv.Key).SendAsync("OnBoardUpdate", payload);
            }

            if (winnerName != null)
            {
                await _hubContext.Clients.Group(code).SendAsync("OnGameWon", new { winnerName });
                if (_lobbies.TryGetValue(code, out var l)) { lock (l.Sync) { l.Status = "lobby"; } }
            }
            if (_lobbies.TryGetValue(code, out var lobby)) await BroadcastLobbyAsync(lobby);
        }

        private async Task DropLoopAsync(string code, CancellationToken ct)
        {
            try
            {
                while (!ct.IsCancellationRequested)
                {
                    await Task.Delay(DropInterval, ct);
                    if (!_lobbies.TryGetValue(code, out var lobby)) return;

                    var updates = new Dictionary<string, object?>();
                    lock (lobby.Sync)
                    {
                        if (lobby.Status != "playing") continue;
                        foreach (var p in lobby.Players)
                        {
                            if (!p.Alive) continue;
                            if (DropMarbleInto(p))
                            {
                                // A drop landing in the pitch row can also pop.
                                var pop = ResolveMatches(p);
                                if (pop.ReserveGained > 0) p.Reserve += pop.ReserveGained;
                                if (pop.HasFivePlus)
                                {
                                    var target = PickAliveOpponent(lobby, p);
                                    if (target != null)
                                    {
                                        var dump = p.Reserve > 0 ? p.Reserve : pop.PoppedCount;
                                        p.Sent += dump;
                                        for (var i = 0; i < dump; i++) RainOne(target, _rng.Next(1, ColorCount + 1));
                                        p.Reserve = 0;
                                    }
                                }
                                updates[p.ConnectionId] = MakeUpdate(lobby, p, pop.Popped, 0, true);
                            }
                        }
                        foreach (var p in lobby.Players)
                        {
                            if (!updates.ContainsKey(p.ConnectionId))
                            {
                                updates[p.ConnectionId] = MakeUpdate(lobby, p, null, 0, false);
                            }
                        }
                    }

                    var winnerName = DetermineWinner(lobby);
                    foreach (var kv in updates)
                    {
                        var payload = (Dictionary<string, object?>)kv.Value!;
                        if (winnerName != null) payload["winnerName"] = winnerName;
                        await _hubContext.Clients.Client(kv.Key).SendAsync("OnBoardUpdate", payload);
                    }
                    if (winnerName != null)
                    {
                        await _hubContext.Clients.Group(code).SendAsync("OnGameWon", new { winnerName });
                        lock (lobby.Sync) { lobby.Status = "lobby"; }
                        await BroadcastLobbyAsync(lobby);
                        return;
                    }
                }
            }
            catch (OperationCanceledException) { /* lobby ended */ }
        }

        // ── Engine ─────────────────────────────────────────────────────────

        /// <summary>
        /// Check horizontal runs of 3+ in the pitch row; pop them, apply
        /// gravity, and repeat until stable (cascades). Tracks how many
        /// marbles contained the special color (reserve gain) and whether any
        /// match was 5+ (reserve dump trigger).
        /// </summary>
        private static MoveResult ResolveMatches(Player p)
        {
            return SimulateResolve(p.Board, p.SpecialColor);
        }

        /// <summary>
        /// Drop one marble into the lowest empty cell of a random column.
        /// Returns false if the board is completely full (the owner loses).
        /// </summary>
        private static bool DropMarbleInto(Player p)
        {
            var board = p.Board;
            var emptyCols = new List<int>();
            for (var c = 0; c < Cols; c++)
            {
                if (board[0][c] == 0) emptyCols.Add(c);
            }
            if (emptyCols.Count == 0)
            {
                p.Alive = false;
                return false;
            }

            var col = emptyCols[_rng.Next(emptyCols.Count)];
            var row = Rows - 1;
            while (row >= 0 && board[row][col] != 0) row--;
            var color = _rng.Next(1, ColorCount + 1);
            board[row][col] = color;

            ApplyGravity(board);
            return true;
        }

        private static void ApplyGravity(int[][] board)
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
            }
        }

        private static void RainOne(Player target, int color)
        {
            var board = target.Board;
            var emptyCols = new List<int>();
            for (var c = 0; c < Cols; c++) if (board[0][c] == 0) emptyCols.Add(c);
            if (emptyCols.Count == 0)
            {
                target.Alive = false;
                return;
            }
            var col = emptyCols[_rng.Next(emptyCols.Count)];
            var row = Rows - 1;
            while (row >= 0 && board[row][col] != 0) row--;
            board[row][col] = color;
            ApplyGravity(board);
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
                if (alive.Count == 0 && lobby.Players.Count > 0) return lobby.Players[0].PlayerName;
                return null;
            }
        }

        /// <summary>
        /// Start with a nearly-full board like the original game: each column
        /// is filled from the bottom up to a random height around the pitch
        /// line, so the center row is populated and matches can form at once.
        /// </summary>
        private static int[][] GenerateStartBoard()
        {
            var board = EmptyBoard();
            for (var c = 0; c < Cols; c++)
            {
                // Fill so the pitch row (5) is usually occupied: heights 7-10.
                var count = 7 + _rng.Next(4);
                for (var k = 0; k < count; k++)
                {
                    var row = Rows - 1 - k;
                    board[row][c] = _rng.Next(1, ColorCount + 1);
                }
            }
            return board;
        }

        private static int[][] EmptyBoard()
        {
            var board = new int[Rows][];
            for (var r = 0; r < Rows; r++) board[r] = new int[Cols];
            return board;
        }

        private static Dictionary<string, object?> MakeUpdate(Lobby lobby, Player p, List<object>? popped, int rained, bool dropped)
        {
            return new Dictionary<string, object?>
            {
                ["board"] = p.Board,
                ["specialColor"] = p.SpecialColor,
                ["reserve"] = p.Reserve,
                ["sent"] = p.Sent,
                ["popped"] = popped ?? new List<object>(),
                ["rained"] = rained,
                ["dropped"] = dropped,
                ["alive"] = p.Alive,
                ["winnerName"] = (string?)null,
                ["opponents"] = lobby.Players
                    .Where(o => o.ConnectionId != p.ConnectionId)
                    .Select(o => OpponentView(o)).ToArray(),
            };
        }

        /// <summary>Public snapshot of another player's board (for the side-by-side / corner view).</summary>
        private static object OpponentView(Player o) => new
        {
            connectionId = o.ConnectionId,
            playerName = o.PlayerName,
            board = o.Board,
            specialColor = o.SpecialColor,
            reserve = o.Reserve,
            sent = o.Sent,
            alive = o.Alive,
            isBot = o.IsBot,
        };

        private async Task BroadcastLobbyAsync(Lobby lobby)
        {
            var view = new
            {
                code = lobby.Code,
                hostConnectionId = lobby.HostConnectionId,
                status = lobby.Status,
                players = lobby.Players.Select(p => PlayerView(p, lobby.HostConnectionId)).ToArray(),
            };
            await _hubContext.Clients.Group(lobby.Code).SendAsync("OnLobbyState", view);
        }

        private static object PlayerView(Player p, string hostConnectionId) => new
        {
            connectionId = p.ConnectionId,
            playerName = p.PlayerName,
            playerId = p.PlayerId,
            ready = p.Ready,
            sent = p.Sent,
            isHost = p.ConnectionId == hostConnectionId,
            isBot = p.IsBot,
            alive = p.Alive,
        };

        private async Task CheckGameOverAsync(Lobby lobby)
        {
            var winner = DetermineWinner(lobby);
            if (winner == null) return;
            await _hubContext.Clients.Group(lobby.Code).SendAsync("OnGameWon", new { winnerName = winner });
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

        private class MoveResult
        {
            public List<object> Popped = new();
            public int ReserveGained = 0;
            public bool HasFivePlus = false;
            public int PoppedCount = 0;
        }
    }
}
