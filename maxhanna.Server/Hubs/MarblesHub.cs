using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using MySqlConnector;

namespace maxhanna.Server.Hubs
{
    /// <summary>
    /// SignalR hub for "Marbles" — a faithful remake of SegaSoft's 1997
    /// "Lose Your Marbles" (the Windows 98 playground marble game).
    ///
    /// Board: 5 columns × 12 rows of holes. You shift the center row (the
    /// "pitch line") left/right (marbles wrap around the ends) and shift
    /// individual columns up/down (the whole stack slides, never wrapping off
    /// the edge) to bring same-colored marbles together. Only the PITCH ROW
    /// matches: 3+ contiguous same-colored marbles in an unbroken horizontal
    /// run across it pop; columns then auto-compact toward the CENTER (the
    /// pitch row stays filled and no gaps survive), and the new alignment can
    /// line up fresh runs that pop too (chain matches). Marbles only shift
    /// when the player (or AI) moves them: a periodic drop just stacks the new
    /// marble onto the end of a column and never re-centers it.
    ///
    /// A special "hot" color is designated: popping marbles of that color
    /// fills your reserve. Every match also dumps garbage onto a random
    /// opponent's board scaled to the match size — 3-in-a-row sends 1 marble,
    /// 4 sends 2, and 5 sends 3. Lining up a full 5-marble row additionally
    /// dumps the whole accumulated reserve onto the opponent at once, then
    /// empties it. Matches are strictly horizontal in the pitch row; columns
    /// and diagonals never count, and only the matching marbles themselves
    /// pop. New marbles rain in from the top OR bottom every few seconds;
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
        private readonly IConfiguration _config;

        // One-shot schema guard so the forfeits table is created on first use
        // (the marbles_scores table is created the same way — out-of-band).
        private static int _forfeitSchemaChecked;
        private static readonly object _forfeitSchemaLock = new();

        public MarblesHub(IHubContext<MarblesHub> hubContext, IConfiguration config)
        {
            _hubContext = hubContext;
            _config = config;
        } 

        /// <summary>Best-effort: load how many multiplayer matches this user has
        /// forfeited (left mid-game). Returns 0 on any DB issue so the lobby
        /// always renders.</summary>
        private async Task<int> GetForfeitCountAsync(int userId)
        {
            if (userId <= 0) return 0;
            try
            {
                var cs = _config.GetValue<string>("ConnectionStrings:maxhanna");
                if (string.IsNullOrEmpty(cs)) return 0;
                await using var conn = new MySqlConnection(cs);
                await conn.OpenAsync();
                await using var cmd = new MySqlCommand(
                    "SELECT COUNT(*) FROM marbles_forfeits WHERE user_id = @UserId;", conn);
                cmd.Parameters.AddWithValue("@UserId", userId);
                var result = await cmd.ExecuteScalarAsync();
                return result is long l ? (int)l : Convert.ToInt32(result ?? 0);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{DateTime.Now:HH:mm}] MARBLES: forfeit count lookup failed: {ex.Message}");
                return 0;
            }
        }

        /// <summary>Best-effort: record a forfeit (a human leaving a multiplayer
        /// match mid-game). Never throws — the game must not break on a DB hiccup.</summary>
        private async Task RecordForfeitAsync(int userId, string username, int opponentUserId, string opponentUsername)
        {
            if (userId <= 0) return;
            try
            {
                var cs = _config.GetValue<string>("ConnectionStrings:maxhanna");
                if (string.IsNullOrEmpty(cs)) return;
                await using var conn = new MySqlConnection(cs);
                await conn.OpenAsync();
                await using var cmd = new MySqlCommand(@"
                    INSERT INTO marbles_forfeits (user_id, username, opponent_user_id, opponent_username, forfeited_at)
                    VALUES (@UserId, @Username, @OpponentUserId, @OpponentUsername, UTC_TIMESTAMP());", conn);
                cmd.Parameters.AddWithValue("@UserId", userId);
                cmd.Parameters.AddWithValue("@Username", (object?)TrimmedOrNull(username) ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@OpponentUserId", opponentUserId);
                cmd.Parameters.AddWithValue("@OpponentUsername", (object?)TrimmedOrNull(opponentUsername) ?? DBNull.Value);
                await cmd.ExecuteNonQueryAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{DateTime.Now:HH:mm}] MARBLES: forfeit record failed: {ex.Message}");
            }
        }

        private static string? TrimmedOrNull(string? value)
        {
            var trimmed = value?.Trim();
            return string.IsNullOrEmpty(trimmed) ? null : trimmed;
        }

        private class Lobby
        {
            public string Code = "";
            public string HostConnectionId = "";
            public bool IsPublic = false; // public rooms appear in the open-room list and are 1:1
            public string Status = "lobby"; // "lobby" | "playing"
            public bool Paused = false; // true while a player has the in-game menu open
            /// <summary>True when this is a same-keyboard local 2P game: the second
            /// player (Player.IsLocal) is driven by the same connection that hosts
            /// the room, and moves target it via the `slot` parameter.</summary>
            public bool IsLocal = false;
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
            /// <summary>True for the second player in a same-keyboard local 2P game
            /// (no real SignalR connection — the host drives both players).</summary>
            public bool IsLocal = false;
            public int Difficulty = 0; // 0 easy, 1 medium, 2 hard (bots only)
            public int Sent = 0;
            public int Reserve = 0;
            public int SpecialColor = 0;
            public int Score = 0; // marbles cleared this game (single-player high scores)
            public int Forfeits = 0; // multiplayer matches left mid-game (persisted)
            public int[][] Board = EmptyBoard();
        }

        /// <summary>Live player count across all lobbies (for the nav badge).</summary>
        public static int ActivePlayerCount => _connectionLobby.Count;

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            if (!_connectionLobby.TryRemove(Context.ConnectionId, out var code)) return;
            if (!_lobbies.TryGetValue(code, out var lobby)) return;

            string? departedName = null;
            int departedUserId = 0;
            bool departedWasBot = false;
            bool forfeit = false;
            int opponentUserId = 0;
            string? opponentName = null;
            CancellationTokenSource? cts = null;
            lock (lobby.Sync)
            {
                var p = lobby.Players.Find(x => x.ConnectionId == Context.ConnectionId);
                departedName = p?.PlayerName;
                departedUserId = p?.PlayerId ?? 0;
                departedWasBot = p?.IsBot ?? false;
                // A human leaving a MULTIPLAYER match mid-game forfeits (the
                // remaining player is handed the win by CheckGameOverAsync).
                // Single-player vs-AI quits and lobby exits don't count, and a
                // local 2P game never records forfeits (one keyboard = one
                // person leaving kills the whole match).
                forfeit = !lobby.IsLocal
                    && lobby.Status == "playing"
                    && !departedWasBot
                    && departedUserId > 0
                    && lobby.Players.Any(x => !x.IsBot && x.ConnectionId != Context.ConnectionId);
                var opponent = lobby.Players.FirstOrDefault(x => !x.IsBot && x.ConnectionId != Context.ConnectionId);
                opponentUserId = opponent?.PlayerId ?? 0;
                opponentName = opponent?.PlayerName;
                lobby.Players.RemoveAll(x => x.ConnectionId == Context.ConnectionId);
                // Local 2P: the local partner has no real connection, so when
                // the host leaves the whole match is over — drop the lobby.
                if (lobby.IsLocal || lobby.Players.Count == 0)
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

            // Persist the forfeit (best-effort, never blocks the disconnect).
            if (forfeit)
            {
                await RecordForfeitAsync(departedUserId, departedName ?? "", opponentUserId, opponentName ?? "");
            }

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

            // Surface the player's lifetime forfeit count in the roster (their
            // "profile" in this room). Loaded once per join, best-effort.
            if (playerId > 0)
            {
                var forfeits = await GetForfeitCountAsync(playerId);
                lock (lobby.Sync)
                {
                    var p = lobby.Players.Find(x => x.ConnectionId == Context.ConnectionId);
                    if (p != null) p.Forfeits = forfeits;
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
                lobby.Paused = false; // fresh match always starts unpaused
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

        /// <summary>Freeze the match — a player opened the in-game menu. The
        /// drop loop, the AI loop and player shifts all stall until the menu
        /// closes, so marbles don't keep raining while they read the explainer.</summary>
        public Task PauseGame(string code)
        {
            if (!_lobbies.TryGetValue(code, out var lobby)) return Task.CompletedTask;
            lock (lobby.Sync)
            {
                lobby.Paused = true;
            }
            return Task.CompletedTask;
        }

        /// <summary>Unfreeze the match when the in-game menu closes.</summary>
        public Task ResumeGame(string code)
        {
            if (!_lobbies.TryGetValue(code, out var lobby)) return Task.CompletedTask;
            lock (lobby.Sync)
            {
                lobby.Paused = false;
            }
            return Task.CompletedTask;
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
                lobby.Paused = false; // fresh match always starts unpaused

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
        /// Host a same-keyboard local 2P game: the host's room gets a second
        /// "Player 2" slot (no real SignalR connection) driven by the same
        /// connection, and the match starts immediately. P1 uses arrows +
        /// spacebar; P2 uses A/S/D/W (and F to rotate the pitch row) — both
        /// share the drop loop, garbage dumps and win detection like any 2P
        /// lobby, but nothing travels over the network.
        /// </summary>
        public async Task StartLocal2P(string code)
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
                lobby.Paused = false;
                lobby.IsLocal = true;

                // Reuse the host slot for P1; replace any old local P2 slot.
                lobby.Players.RemoveAll(p => p.IsLocal);
                var p2 = new Player
                {
                    ConnectionId = "local2-" + code,
                    PlayerName = "Player 2",
                    PlayerId = 0,
                    IsLocal = true,
                    IsBot = false,
                    Ready = true,
                    Alive = true,
                };
                lobby.Players.Add(p2);

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
            // Send the host's own board update; the local P2's board rides
            // along as the opponent view (it has no real connection of its
            // own), so the client renders both boards from this one message.
            await Clients.Client(Context.ConnectionId).SendAsync("OnBoardUpdate", MakeUpdate(lobby, players[0], null, 0, false));
            await BroadcastLobbyAsync(lobby);

            _ = Task.Run(() => DropLoopAsync(code, cts!.Token));
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
                        // Paused (in-game menu open): stall the AI so it can't
                        // keep playing while the player reads the explainer.
                        if (lobby.Status != "playing" || lobby.Paused) bot = null;
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
                        if (lobby.Status != "playing" || lobby.Paused) continue;
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

                var score = result.PoppedCount * 20 + result.ReserveGained * 10 + result.Garbage * 15 + (int)setup;

                candidates.Add(new AiMove
                {
                    Kind = kind,
                    Col = col,
                    Dir = dir,
                    Score = score,
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

        /// <summary>Stack one marble into a SPECIFIC column's pile (for the AI's
        /// drop look-ahead). Mirrors AddMarble: the marble enters from a random
        /// side and never moves the existing pile. Returns false when that
        /// column is full.</summary>
        private static bool DropIntoColumn(int[][] board, int col, int color)
        {
            return AppendToColumn(board, col, color, _rng.Next(2) == 1) >= 0;
        }

        /// <summary>
        /// Resolve matches on a board. Faithful to the original game: only the
        /// PITCH ROW (the centre "black square") can match — a contiguous run
        /// of 3+ same-coloured marbles horizontally across it. Columns never
        /// match vertically and no other row matches, which is what stops
        /// marbles from "blowing up out of nowhere". Popping a run re-compacts
        /// the columns toward the centre, which can line up a fresh run that
        /// pops too — the loop repeats until stable (chain matches). Tracks
        /// reserve gain (special-colour pops), the garbage to dump (3 → 1,
        /// 4 → 2, 5+ → 3 per run) and whether a full 5-marble row was cleared
        /// (which dumps the accumulated reserve onto the opponent).</summary>
        private static MoveResult SimulateResolve(int[][] board, int specialColor)
        {
            var popped = new List<object>();
            var reserveGained = 0;
            var garbage = 0;
            var poppedCount = 0;
            var fullRow = false;

            for (;;)
            {
                var toPop = new HashSet<(int r, int c)>();

                // Horizontal runs of 3+ across the pitch row only. Only the
                // contiguous same-coloured marbles pop; unrelated cells in the
                // row are left alone.
                var c = 0;
                while (c < Cols)
                {
                    var color = board[PitchRow][c];
                    if (color == 0) { c++; continue; }
                    var runStart = c;
                    while (c < Cols && board[PitchRow][c] == color) c++;
                    var len = c - runStart;
                    if (len >= 3)
                    {
                        garbage += GarbageFor(len);
                        if (len >= Cols) fullRow = true;
                        for (var k = runStart; k < c; k++) toPop.Add((PitchRow, k));
                    }
                }

                if (toPop.Count == 0) break;

                foreach (var (pr, pc) in toPop)
                {
                    var color = board[pr][pc];
                    popped.Add(new { row = pr, col = pc, color });
                    board[pr][pc] = 0;
                    poppedCount++;
                    if (color == specialColor) reserveGained++;
                }
                ApplyGravity(board);
            }

            return new MoveResult { Popped = popped, ReserveGained = reserveGained, Garbage = garbage, PoppedCount = poppedCount, FullRow = fullRow };
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
        /// In a same-keyboard local 2P game, `slot` picks who moves: 0 = the
        /// caller's own board (P1), 1 = the local partner's board (P2).
        /// </summary>
        public async Task<object?> ShiftRow(string code, int dir, int slot = 0)
        {
            return await DoMove(code, p => ShiftRowOn(p.Board, dir), dir, slot);
        }

        /// <summary>
        /// Shift a COLUMN up (-1) or down (+1). Marbles never wrap: a marble
        /// at the top of a column can never reappear at the bottom (or vice
        /// versa). A full column — or a stack already flush against the edge
        /// in that direction — simply cannot shift; the move is blocked. A
        /// partial stack slides as one unit within the column's bounds, and
        /// stays contiguous (no gaps ever open inside it); the next drop or
        /// pop re-compacts it toward the center. `slot` (0 = self, 1 = local
        /// partner) only matters in a same-keyboard local 2P game.
        /// </summary>
        public async Task<object?> ShiftColumn(string code, int col, int dir, int slot = 0)
        {
            if (col < 0 || col >= Cols) return null;
            return await DoMove(code, p => ShiftColumnOn(p.Board, col, dir), 0, slot);
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
            // A column that was floated up/down by a column shift has its pitch
            // row empty; the rotation above can land a marble into that empty
            // pitch row, which strands it away from the column's stack and opens
            // an internal hole between marbles. Re-centre every column (a no-op
            // for already-centred columns) so the "no gaps, always compacted"
            // invariant holds after a row shift too.
            ApplyGravity(board);
        }

        private static void ShiftColumnOn(int[][] board, int col, int dir)
        {
            // Locate the contiguous stack's top and bottom rows (columns are
            // always compacted, so a single pass from each end suffices).
            var top = -1;
            for (var r = 0; r < Rows; r++)
            {
                if (board[r][col] != 0) { top = r; break; }
            }
            if (top < 0) return; // empty column
            var bottom = top;
            for (var r = Rows - 1; r > top; r--)
            {
                if (board[r][col] != 0) { bottom = r; break; }
            }
            var stackLen = bottom - top + 1;

            // No wrapping: a full column cannot shift at all.
            if (stackLen >= Rows) return;

            if (dir <= 0)
            {
                // Shift up — blocked when the stack already touches the top edge.
                if (top == 0) return;
                for (var r = top; r <= bottom; r++) board[r - 1][col] = board[r][col];
                board[bottom][col] = 0;
            }
            else
            {
                // Shift down — blocked when the stack already touches the floor.
                if (bottom == Rows - 1) return;
                for (var r = bottom; r >= top; r--) board[r + 1][col] = board[r][col];
                board[top][col] = 0;
            }
        }

        private async Task<object?> DoMove(string code, Action<Player> apply, int rowShiftDir = 0, int slot = 0)
        {
            if (!_lobbies.TryGetValue(code, out var lobby)) return null;
            Player? mover;
            lock (lobby.Sync)
            {
                if (lobby.Status != "playing" || lobby.Paused) return null;
                // In a local 2P game both players share one connection, so the
                // mover is chosen by slot: 0 = the caller's own board (P1),
                // 1 = the local partner (P2). Online lobbies ignore the slot.
                if (lobby.IsLocal)
                {
                    var locals = lobby.Players.Where(p => !p.IsBot).ToList();
                    if (slot >= 0 && slot < locals.Count) mover = locals[slot];
                    else mover = lobby.Players.Find(p => p.ConnectionId == Context.ConnectionId);
                }
                else
                {
                    mover = lobby.Players.Find(p => p.ConnectionId == Context.ConnectionId);
                }
                if (mover == null || !mover.Alive) return null;
            }

            var (updates, winnerName) = ApplyMoveAndResolve(lobby, mover, apply, rowShiftDir);
            if (updates.Count == 0) return null;
            await SendMoveUpdatesAsync(code, updates, winnerName);
            return new { ok = true };
        }

        /// <summary>
        /// Apply a shift to a player's board, resolve pitch-row matches (and
        /// cascades), handle garbage + reserve dumps, and build the per-player
        /// update payloads. Shared by human moves and the single-player AI
        /// loop. rowShiftDir is non-zero when the move rotated the pitch row,
        /// which lets the client animate marbles sliding along it (and lets it
        /// know NOT to slide them for drops, which only touch one column).
        /// </summary>
        private static (Dictionary<string, object?> Updates, string? Winner) ApplyMoveAndResolve(Lobby lobby, Player mover, Action<Player> apply, int rowShiftDir = 0)
        {
            var updates = new Dictionary<string, object?>();
            var rainedBy = new Dictionary<string, int>();
            var reserveDump = 0;
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
                        rainedBy[target.ConnectionId] = rainedBy.GetValueOrDefault(target.ConnectionId) + result.Garbage;
                        for (var i = 0; i < result.Garbage; i++)
                        {
                            RainOne(target, _rng.Next(1, ColorCount + 1));
                        }
                    }
                }

                // A full 5-marble pitch-row match dumps the whole accumulated
                // reserve (the "hot" colour marbles you've collected) onto the
                // opponent at once, then empties it — the original game's big-
                // combo payoff that keeps the opponent's board filling up.
                if (result.FullRow && mover.Reserve > 0)
                {
                    var target = PickAliveOpponent(lobby, mover);
                    if (target != null)
                    {
                        var pool = mover.Reserve;
                        mover.Sent += pool;
                        rainedBy[target.ConnectionId] = rainedBy.GetValueOrDefault(target.ConnectionId) + pool;
                        for (var i = 0; i < pool; i++)
                        {
                            RainOne(target, _rng.Next(1, ColorCount + 1));
                        }
                        mover.Reserve = 0;
                        reserveDump = pool;
                    }
                }

                var metas = new Dictionary<string, PlayerMoveMeta>();
                foreach (var p in lobby.Players) metas[p.ConnectionId] = new PlayerMoveMeta();
                metas[mover.ConnectionId].Popped = result.Popped;
                metas[mover.ConnectionId].RowShifted = rowShiftDir;
                metas[mover.ConnectionId].ReserveDump = reserveDump;
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
                        // Paused: skip this drop tick entirely (the next tick
                        // after resume drops normally, so no marbles rain while
                        // the in-game menu is open).
                        if (lobby.Status != "playing" || lobby.Paused) continue;
                        var metas = new Dictionary<string, PlayerMoveMeta>();
                        foreach (var p in lobby.Players) metas[p.ConnectionId] = new PlayerMoveMeta();

                        foreach (var p in lobby.Players)
                        {
                            if (!p.Alive) continue;
                            var dropSide = DropMarbleInto(p);
                            if (dropSide >= 0)
                            {
                                // A drop can complete a pitch-row run.
                                var pop = ResolveMatches(p);
                                if (pop.ReserveGained > 0) p.Reserve += pop.ReserveGained;
                                p.Score += pop.PoppedCount;
                                metas[p.ConnectionId].Popped = pop.Popped;
                                metas[p.ConnectionId].Dropped = true;
                                metas[p.ConnectionId].DropSide = dropSide;
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
                                // A drop that lands a full 5-marble pitch-row
                                // match also dumps the accumulated reserve (see
                                // ApplyMoveAndResolve).
                                if (pop.FullRow && p.Reserve > 0)
                                {
                                    var target = PickAliveOpponent(lobby, p);
                                    if (target != null)
                                    {
                                        var pool = p.Reserve;
                                        p.Sent += pool;
                                        for (var i = 0; i < pool; i++) RainOne(target, _rng.Next(1, ColorCount + 1));
                                        metas[target.ConnectionId].Rained += pool;
                                        p.Reserve = 0;
                                        metas[p.ConnectionId].ReserveDump = pool;
                                    }
                                }
                            }
                        }
                        foreach (var p in lobby.Players)
                        {
                            var m = metas[p.ConnectionId];
                            updates[p.ConnectionId] = MakeUpdate(lobby, p, m.Popped, m.Rained, m.Dropped, 0, metas, m.DropSide);
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
        /// Check runs of 3+ across the pitch row; pop them, apply gravity, and
        /// repeat until stable (cascades). Tracks how many marbles contained
        /// the special color (reserve gain), the garbage to dump (3 → 1, 4 → 2,
        /// 5 → 3 per run) and whether a full 5-row cleared (reserve dump).
        /// </summary>
        private static MoveResult ResolveMatches(Player p)
        {
            return SimulateResolve(p.Board, p.SpecialColor);
        }

        /// <summary>
        /// Drop one marble onto a random column.
        /// Returns the side it entered (0 = top, 1 = bottom) or -1 if the
        /// board is completely full (the owner loses).
        /// </summary>
        private static int DropMarbleInto(Player p)
        {
            var side = AddMarble(p.Board, _rng.Next(1, ColorCount + 1));
            if (side < 0) p.Alive = false;
            return side;
        }

        /// <summary>
        /// Place one marble onto a random column without disturbing anything
        /// else's order. The new marble enters from a RANDOM side and simply
        /// stacks onto the END of the column's existing pile — it becomes the
        /// new top (rolling in from above) or the new bottom (rolling in from
        /// below). Existing marbles NEVER move on a drop: columns are only
        /// shifted by the player, and re-compaction happens only after pops
        /// and player shifts. Returns the side it entered (0 = top, 1 =
        /// bottom) or -1 when every cell on the board is filled.
        /// </summary>
        private static int AddMarble(int[][] board, int color)
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
            if (emptyCols.Count == 0) return -1;

            var col = emptyCols[_rng.Next(emptyCols.Count)];
            return AppendToColumn(board, col, color, _rng.Next(2) == 1);
        }

        /// <summary>Compact one column toward the CENTER (pitch row): collect its
        /// marbles in top-to-bottom order and place them back as a single
        /// contiguous block centred on the pitch row. Marbles above a hole fall
        /// down and marbles below it rise up, so a popped centre row is re-filled
        /// and no gap can survive. The pitch row is always occupied whenever the
        /// column is non-empty.</summary>
        private static void CompactColumnCenter(int[][] board, int col)
        {
            var marbles = new List<int>(Rows);
            for (var r = 0; r < Rows; r++)
            {
                if (board[r][col] != 0) marbles.Add(board[r][col]);
            }
            for (var r = 0; r < Rows; r++) board[r][col] = 0;
            if (marbles.Count == 0) return;
            var top = PitchRow - (marbles.Count - 1) / 2;
            for (var i = 0; i < marbles.Count; i++) board[top + i][col] = marbles[i];
        }

        /// <summary>Compact every column toward the center (see
        /// CompactColumnCenter) — replaces the old bottom-only gravity.</summary>
        private static void ApplyGravity(int[][] board)
        {
            for (var c = 0; c < Cols; c++) CompactColumnCenter(board, c);
        }

        /// <summary>Add `color` onto the END of a column's existing pile — the
        /// new marble rolls in from the top (enterBottom=false) or the bottom
        /// (enterBottom=true) WITHOUT moving any marble already in the column.
        /// Columns are kept contiguous by pops and player shifts, so a drop
        /// must never re-center the pile: marbles shift only when the player
        /// moves them. An empty column starts centered on the pitch row.
        /// Returns the entry side (0 = top, 1 = bottom), or -1 when the column
        /// is already full.</summary>
        private static int AppendToColumn(int[][] board, int col, int color, bool enterBottom)
        {
            var top = Rows;
            var bottom = -1;
            for (var r = 0; r < Rows; r++)
            {
                if (board[r][col] == 0) continue;
                if (r < top) top = r;
                bottom = r;
            }
            if (top > bottom) // empty column — start centred on the pitch row
            {
                board[PitchRow][col] = color;
                return 0;
            }
            if (bottom - top + 1 >= Rows) return -1; // full column

            if (enterBottom)
            {
                if (bottom + 1 < Rows) { board[bottom + 1][col] = color; return 1; }
                board[top - 1][col] = color; // no room below — rolls in from above
                return 0;
            }
            if (top - 1 >= 0) { board[top - 1][col] = color; return 0; }
            board[bottom + 1][col] = color; // no room above — rolls in from below
            return 1;
        }

        private static void RainOne(Player target, int color)
        {
            if (AddMarble(target.Board, color) < 0) target.Alive = false;
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
                // Nearly-full columns (heights 7-10) centered on the pitch row,
                // so the middle is packed and matches can form at once.
                var count = 7 + _rng.Next(4);
                var top = PitchRow - (count - 1) / 2;
                for (var k = 0; k < count; k++)
                {
                    board[top + k][c] = _rng.Next(1, ColorCount + 1);
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
            /// <summary>Which side a dropped marble entered the column (0 = top, 1 = bottom).</summary>
            public int DropSide = 0;
            public int Rained = 0;
            /// <summary>Number of reserve marbles dumped this turn (a full 5-row match).</summary>
            public int ReserveDump = 0;
        }

        private static Dictionary<string, object?> MakeUpdate(Lobby lobby, Player p, List<object>? popped, int rained, bool dropped, int rowShifted = 0, Dictionary<string, PlayerMoveMeta>? metas = null, int dropSide = 0)
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
                ["reserveDump"] = opponentMetas.TryGetValue(p.ConnectionId, out var ownMeta) ? ownMeta.ReserveDump : 0,
                ["dropped"] = dropped,
                ["dropSide"] = dropSide,
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
            dropSide = meta?.DropSide ?? 0,
            rained = meta?.Rained ?? 0,
            reserveDump = meta?.ReserveDump ?? 0,
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
            forfeits = p.Forfeits,
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
            public bool FullRow = false;
        }
    }
}
