using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace maxhanna.Server.Hubs
{
    /// <summary>
    /// SignalR hub for "Marbles" — a faithful remake of SegaSoft's 1997
    /// "Lose Your Marbles" (the Windows 98 playground marble game).
    ///
    /// Board: 5 columns × 12 rows of holes. You shift the center row (the
    /// "pitch line") left/right (marbles wrap around the ends) and shift
    /// individual columns up/down (marbles cycle through the column) to bring
    /// same-colored marbles together. 3+ contiguous marbles pop in ANY row or
    /// ANY column; marbles above fall down, and the fall can line up new runs
    /// that pop too (chain matches).
    ///
    /// A special "hot" color is designated: popping groups that contain it
    /// fills your reserve. Every match dumps garbage onto a random opponent's
    /// board scaled to the match size — 3-in-a-row sends 1 marble, 4 sends 2,
    /// and 5+ sends 3. New marbles rain in from the top every few seconds;
    /// whoever's columns fill up first loses.
    /// </summary>
    public class MarblesHub : Hub
    {
        private const int Cols = 5;
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
            public bool IsPublic = false; // public rooms appear in the open-room list and are 1:1
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
            public int Score = 0; // marbles cleared this game (single-player high scores)
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

        /// <summary>Round-trip probe so the client can measure its connection
        /// latency and jitter for the lobby's health indicator.</summary>
        public Task<string> Ping() => Task.FromResult("pong");

        public async Task<object?> JoinLobby(string code, string playerName, int playerId, bool isPublic = false)
        {
            code = (code ?? "").Trim().ToUpperInvariant();
            var creating = code.Length < 3 || code.Length > 16;
            if (creating) code = NewCode();

            var lobby = _lobbies.GetOrAdd(code, _ => new Lobby { Code = code });

            lock (lobby.Sync)
            {
                // A freshly-created lobby takes its visibility from the host's
                // choice; joining an existing room never changes it.
                if (creating) lobby.IsPublic = isPublic;

                var existing = lobby.Players.Find(p => p.ConnectionId == Context.ConnectionId);
                if (existing == null && lobby.IsPublic && lobby.Players.Count >= 2)
                {
                    return new { error = "That public room is full." };
                }

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
                error = (string?)null,
                code = code,
                isPublic = lobby.IsPublic,
                hostConnectionId = lobby.HostConnectionId,
                status = lobby.Status,
                players = lobby.Players.Select(p => PlayerView(p, lobby.HostConnectionId)).ToArray(),
                myBoard = me?.Board ?? EmptyBoard(),
                mySpecialColor = me?.SpecialColor ?? 0,
                myReserve = me?.Reserve ?? 0,
                mySent = me?.Sent ?? 0,
                myScore = me?.Score ?? 0,
                opponents = lobby.Players
                    .Where(o => o.ConnectionId != Context.ConnectionId)
                    .Select(o => OpponentView(o)).ToArray(),
            };
        }

        /// <summary>
        /// Snapshot of the open public rooms (1:1 matches waiting for a
        /// challenger). Rooms that are mid-game or full are left out — a
        /// public room only shows up while a second player can still join.
        /// </summary>
        public Task<object> ListPublicRooms()
        {
            var rooms = _lobbies.Values
                .Where(l => l.IsPublic && l.Status == "lobby")
                .Select(l =>
                {
                    lock (l.Sync)
                    {
                        var host = l.Players.FirstOrDefault(p => p.ConnectionId == l.HostConnectionId)
                                   ?? l.Players.FirstOrDefault();
                        return new
                        {
                            code = l.Code,
                            hostName = host?.PlayerName ?? "?",
                            players = l.Players.Count(p => !p.IsBot),
                            status = l.Status,
                        };
                    }
                })
                .Where(r => r.players < 2)
                .OrderByDescending(r => r.players)
                .ThenBy(r => r.code)
                .ToArray();
            return Task.FromResult<object>(new { rooms });
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
                    p.Score = 0;
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
                    p.Score = 0;
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

                    var thinkMs = bot.Difficulty switch { 0 => 2300, 1 => 1200, _ => 750 };
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
                    var (updates, winnerName) = ApplyMoveAndResolve(lobby, currentBot, apply, move.Kind == 0 ? move.Dir : 0);
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

                // Look-ahead: after this move, how likely is the NEXT random
                // drop to complete a match (and cascade)? For every column
                // with space and every marble colour, drop one in and count
                // what pops. A high setup means the board keeps clearing
                // itself — this is what makes the AI set up pairs instead of
                // wandering when nothing matches right now. Medium/hard use
                // it; easy plays purely reactive.
                var setupSum = 0;
                var dropTests = 0;
                if (difficulty >= 1)
                {
                    for (var c = 0; c < Cols; c++)
                    {
                        if (!ColumnHasSpace(clone, c)) continue;
                        for (var color = 1; color <= ColorCount; color++)
                        {
                            var test = CloneBoard(clone);
                            if (!DropIntoColumn(test, c, color)) continue;
                            var r2 = SimulateResolve(test, specialColor);
                            setupSum += r2.PoppedCount * 6 + r2.ReserveGained * 3;
                            dropTests++;
                        }
                    }
                }
                var setup = dropTests > 0 ? Math.Min(40, (setupSum / (double)dropTests) * 12) : 0;

                candidates.Add(new AiMove
                {
                    Kind = kind,
                    Col = col,
                    Dir = dir,
                    Score = result.PoppedCount * 20 + result.ReserveGained * 10 + result.Garbage * 15 + (int)setup,
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

            // Difficulty noise: easy still picks a random or merely-decent move
            // fairly often, medium mostly takes the best, hard always takes it.
            if (difficulty == 0)
            {
                var roll = rng.Next(100);
                if (roll < 30) return candidates[rng.Next(candidates.Count)];
                if (roll < 55)
                {
                    var decent = candidates.Where(x => x.Score >= bestScore - 30).ToList();
                    return decent[rng.Next(decent.Count)];
                }
            }
            else if (difficulty == 1 && rng.Next(100) < 20)
            {
                var decent = candidates.Where(x => x.Score >= bestScore - 30).ToList();
                return decent[rng.Next(decent.Count)];
            }
            return best[rng.Next(best.Count)];
        }

        /// <summary>True when the column has at least one empty cell.</summary>
        private static bool ColumnHasSpace(int[][] board, int col)
        {
            for (var r = 0; r < Rows; r++) if (board[r][col] == 0) return true;
            return false;
        }

        /// <summary>Stack one marble on top of a SPECIFIC column's stack (for
        /// the AI's drop look-ahead). Returns false when that column is full.</summary>
        private static bool DropIntoColumn(int[][] board, int col, int color)
        {
            var top = 0;
            while (top < Rows && board[top][col] == 0) top++;
            if (top > 0)
            {
                board[top - 1][col] = color;
                return true;
            }
            var bottom = Rows - 1;
            while (bottom >= 0 && board[bottom][col] != 0) bottom--;
            if (bottom < 0) return false;
            board[bottom][col] = color;
            return true;
        }

        /// <summary>
        /// Resolve every match on a board: contiguous runs of 3+ same-coloured
        /// marbles in ANY row (horizontal) or ANY column (vertical). Popping a
        /// run applies gravity, which can line up new runs, which pop too — so
        /// the loop repeats until the board is stable (chain matches). Tracks
        /// reserve gain (special colour pops) and the garbage to dump (each run
        /// sends 1 for 3, 2 for 4, 3 for 5+, summed across cascades).</summary>
        private static MoveResult SimulateResolve(int[][] board, int specialColor)
        {
            var popped = new List<object>();
            var reserveGained = 0;
            var garbage = 0;
            var poppedCount = 0;

            for (;;)
            {
                var toPop = new HashSet<(int r, int c)>();

                // Horizontal runs of 3+ in any row.
                for (var r = 0; r < Rows; r++)
                {
                    var c = 0;
                    while (c < Cols)
                    {
                        var color = board[r][c];
                        if (color == 0) { c++; continue; }
                        var runStart = c;
                        while (c < Cols && board[r][c] == color) c++;
                        var len = c - runStart;
                        if (len >= 3)
                        {
                            garbage += GarbageFor(len);
                            for (var k = runStart; k < c; k++) toPop.Add((r, k));
                        }
                    }
                }

                // Vertical runs of 3+ in any column.
                for (var c = 0; c < Cols; c++)
                {
                    var r = 0;
                    while (r < Rows)
                    {
                        var color = board[r][c];
                        if (color == 0) { r++; continue; }
                        var runStart = r;
                        while (r < Rows && board[r][c] == color) r++;
                        var len = r - runStart;
                        if (len >= 3)
                        {
                            garbage += GarbageFor(len);
                            for (var k = runStart; k < r; k++) toPop.Add((k, c));
                        }
                    }
                }

                if (toPop.Count == 0) break;

                foreach (var (r, c) in toPop)
                {
                    var color = board[r][c];
                    popped.Add(new { row = r, col = c, color });
                    board[r][c] = 0;
                    poppedCount++;
                    if (color == specialColor) reserveGained++;
                }
                ApplyGravity(board);
            }

            return new MoveResult { Popped = popped, ReserveGained = reserveGained, Garbage = garbage, PoppedCount = poppedCount };
        }

        /// <summary>Garbage marbles a match of the given length dumps: 1 for a
        /// 3-run, 2 for a 4-run, 3 for any run of 5 or more.</summary>
        private static int GarbageFor(int len) => len == 3 ? 1 : len == 4 ? 2 : 3;

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
            return await DoMove(code, p => ShiftRowOn(p.Board, dir), dir);
        }

        /// <summary>
        /// Shift a COLUMN up (-1) or down (+1). The column's stack (the
        /// contiguous block of marbles, always settled at the bottom) is
        /// rotated in place: up moves the top marble to the bottom of the
        /// stack, down moves the bottom marble to the top. Same direction
        /// feel as the classic wrap, but marbles never float — gaps are
        /// filled because the stack never leaves holes behind.
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
            // Heal any residual gap first: marbles fall down to fill holes,
            // so the column always starts settled (no floating stacks).
            var write = Rows - 1;
            for (var r = Rows - 1; r >= 0; r--)
            {
                if (board[r][col] != 0)
                {
                    if (write != r)
                    {
                        board[write][col] = board[r][col];
                        board[r][col] = 0;
                    }
                    write--;
                }
            }

            var top = write + 1; // first row of the settled stack
            if (top >= Rows) return; // empty column
            var stackLen = Rows - top;
            if (stackLen <= 1) return;

            // A full column rotates through all rows (the classic wrap — no
            // holes because the column is completely full).
            if (stackLen == Rows)
            {
                var newCol = new int[Rows];
                for (var r = 0; r < Rows; r++)
                {
                    var src = (r - dir + Rows) % Rows;
                    newCol[r] = board[src][col];
                }
                for (var r = 0; r < Rows; r++) board[r][col] = newCol[r];
                return;
            }

            // Partial stack: rotate the marbles within the stack's own
            // footprint so it stays settled — no marble ever floats above a
            // gap, and nothing wraps to the far end of the column.
            var colors = new int[stackLen];
            for (var i = 0; i < stackLen; i++) colors[i] = board[top + i][col];
            for (var i = 0; i < stackLen; i++)
            {
                var src = (i - dir + stackLen) % stackLen;
                board[top + i][col] = colors[src];
            }
        }

        private async Task<object?> DoMove(string code, Action<Player> apply, int rowShiftDir = 0)
        {
            if (!_lobbies.TryGetValue(code, out var lobby)) return null;
            Player? mover;
            lock (lobby.Sync)
            {
                if (lobby.Status != "playing") return null;
                mover = lobby.Players.Find(p => p.ConnectionId == Context.ConnectionId);
                if (mover == null || !mover.Alive) return null;
            }

            var (updates, winnerName) = ApplyMoveAndResolve(lobby, mover, apply, rowShiftDir);
            if (updates.Count == 0) return null;
            await SendMoveUpdatesAsync(code, updates, winnerName);
            return new { ok = true };
        }

        /// <summary>
        /// Apply a shift to a player's board, resolve matches (any row/column),
        /// handle reserve dumps, and build the per-player update payloads.
        /// Shared by human moves and the single-player AI loop.
        /// rowShiftDir is non-zero when the move rotated the pitch row, which
        /// lets the client animate marbles sliding along it (and lets it know
        /// NOT to slide them for drops, which only touch one column).
        /// </summary>
        private static (Dictionary<string, object?> Updates, string? Winner) ApplyMoveAndResolve(Lobby lobby, Player mover, Action<Player> apply, int rowShiftDir = 0)
        {
            var updates = new Dictionary<string, object?>();
            var rainedBy = new Dictionary<string, int>();
            lock (lobby.Sync)
            {
                if (lobby.Status != "playing" || !mover.Alive) return (updates, null);

                apply(mover);

                // Resolve all matches (cascades included).
                var result = ResolveMatches(mover);
                if (result.ReserveGained > 0) mover.Reserve += result.ReserveGained;
                mover.Score += result.PoppedCount;

                // Every match dumps garbage scaled to its size (3 → 1, 4 → 2,
                // 5+ → 3), summed across the move and its cascades.
                if (result.Garbage > 0)
                {
                    var target = PickAliveOpponent(lobby, mover);
                    if (target != null)
                    {
                        mover.Sent += result.Garbage;
                        rainedBy[target.ConnectionId] = result.Garbage;
                        for (var i = 0; i < result.Garbage; i++)
                        {
                            RainOne(target, _rng.Next(1, ColorCount + 1));
                        }
                    }
                }

                var metas = new Dictionary<string, PlayerMoveMeta>();
                foreach (var p in lobby.Players) metas[p.ConnectionId] = new PlayerMoveMeta();
                metas[mover.ConnectionId].Popped = result.Popped;
                metas[mover.ConnectionId].RowShifted = rowShiftDir;
                foreach (var kv in rainedBy) metas[kv.Key].Rained = kv.Value;

                foreach (var p in lobby.Players)
                {
                    var m = metas[p.ConnectionId];
                    updates[p.ConnectionId] = MakeUpdate(lobby, p, m.Popped, m.Rained, m.Dropped, m.RowShifted, metas);
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
                        var metas = new Dictionary<string, PlayerMoveMeta>();
                        foreach (var p in lobby.Players) metas[p.ConnectionId] = new PlayerMoveMeta();

                        foreach (var p in lobby.Players)
                        {
                            if (!p.Alive) continue;
                            if (DropMarbleInto(p))
                            {
                                // A drop can complete runs anywhere on the board.
                                var pop = ResolveMatches(p);
                                if (pop.ReserveGained > 0) p.Reserve += pop.ReserveGained;
                                p.Score += pop.PoppedCount;
                                metas[p.ConnectionId].Popped = pop.Popped;
                                metas[p.ConnectionId].Dropped = true;
                                if (pop.Garbage > 0)
                                {
                                    var target = PickAliveOpponent(lobby, p);
                                    if (target != null)
                                    {
                                        p.Sent += pop.Garbage;
                                        for (var i = 0; i < pop.Garbage; i++) RainOne(target, _rng.Next(1, ColorCount + 1));
                                        metas[target.ConnectionId].Rained += pop.Garbage;
                                    }
                                }
                            }
                        }
                        foreach (var p in lobby.Players)
                        {
                            var m = metas[p.ConnectionId];
                            updates[p.ConnectionId] = MakeUpdate(lobby, p, m.Popped, m.Rained, m.Dropped, 0, metas);
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
        /// Check runs of 3+ in every row and column; pop them, apply gravity,
        /// and repeat until stable (cascades). Tracks how many marbles
        /// contained the special color (reserve gain) and the garbage to dump
        /// (3 → 1, 4 → 2, 5+ → 3 per run).
        /// </summary>
        private static MoveResult ResolveMatches(Player p)
        {
            return SimulateResolve(p.Board, p.SpecialColor);
        }

        /// <summary>
        /// Drop one marble onto a random column.
        /// Returns false if the board is completely full (the owner loses).
        /// </summary>
        private static bool DropMarbleInto(Player p)
        {
            var added = AddMarbleToTop(p.Board, _rng.Next(1, ColorCount + 1));
            if (!added) p.Alive = false;
            return added;
        }

        /// <summary>
        /// Place one marble onto a random column without disturbing anything
        /// else: it stacks on top of the column's existing marbles, or falls
        /// to the bottom when the stack already reaches the very top. Adding a
        /// marble must never shift other marbles — the old version ran gravity
        /// over the whole board here, which snapped every column with a gap
        /// (left by a column-shift wrap) back down every time a marble arrived.
        /// Returns false when every cell on the board is filled.
        /// </summary>
        private static bool AddMarbleToTop(int[][] board, int color)
        {
            var emptyCols = new List<int>();
            for (var c = 0; c < Cols; c++)
            {
                var hasSpace = false;
                for (var r = 0; r < Rows; r++)
                {
                    if (board[r][c] == 0) { hasSpace = true; break; }
                }
                if (hasSpace) emptyCols.Add(c);
            }
            if (emptyCols.Count == 0) return false;

            var col = emptyCols[_rng.Next(emptyCols.Count)];

            // Topmost filled cell in the column (row 0 is the top of the board).
            var top = 0;
            while (top < Rows && board[top][col] == 0) top++;

            if (top > 0)
            {
                // Room above the stack → stack the new marble on top.
                board[top - 1][col] = color;
            }
            else
            {
                // Stack already reaches the very top → fill the bottom instead.
                var bottom = Rows - 1;
                while (bottom >= 0 && board[bottom][col] != 0) bottom--;
                board[bottom][col] = color;
            }
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
            if (!AddMarbleToTop(target.Board, color)) target.Alive = false;
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

        /// <summary>What happened to a player's board this turn — used to run the
        ///  same slide/pop/fall animations on every client, not just the mover's.</summary>
        private sealed class PlayerMoveMeta
        {
            public List<object>? Popped = null;
            public int RowShifted = 0;
            public bool Dropped = false;
            public int Rained = 0;
        }

        private static Dictionary<string, object?> MakeUpdate(Lobby lobby, Player p, List<object>? popped, int rained, bool dropped, int rowShifted = 0, Dictionary<string, PlayerMoveMeta>? metas = null)
        {
            var opponentMetas = metas ?? new Dictionary<string, PlayerMoveMeta>();
            return new Dictionary<string, object?>
            {
                ["board"] = p.Board,
                ["specialColor"] = p.SpecialColor,
                ["reserve"] = p.Reserve,
                ["sent"] = p.Sent,
                ["score"] = p.Score,
                ["popped"] = popped ?? new List<object>(),
                ["rained"] = rained,
                ["dropped"] = dropped,
                ["rowShifted"] = rowShifted,
                ["alive"] = p.Alive,
                ["winnerName"] = (string?)null,
                ["opponents"] = lobby.Players
                    .Where(o => o.ConnectionId != p.ConnectionId)
                    .Select(o => OpponentView(o, opponentMetas.TryGetValue(o.ConnectionId, out var m) ? m : null)).ToArray(),
            };
        }

        /// <summary>Public snapshot of another player's board (for the side-by-side / corner view),
        ///  carrying that player's move metadata so watchers can animate the board exactly
        ///  like the player who moved it.</summary>
        private static object OpponentView(Player o, PlayerMoveMeta? meta = null) => new
        {
            connectionId = o.ConnectionId,
            playerName = o.PlayerName,
            board = o.Board,
            specialColor = o.SpecialColor,
            reserve = o.Reserve,
            sent = o.Sent,
            alive = o.Alive,
            isBot = o.IsBot,
            popped = meta?.Popped ?? new List<object>(),
            rowShifted = meta?.RowShifted ?? 0,
            dropped = meta?.Dropped ?? false,
            rained = meta?.Rained ?? 0,
        };

        private async Task BroadcastLobbyAsync(Lobby lobby)
        {
            var view = new
            {
                code = lobby.Code,
                isPublic = lobby.IsPublic,
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
            public int Garbage = 0;
            public int PoppedCount = 0;
        }
    }
}
