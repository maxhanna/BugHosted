using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace maxhanna.Server.Hubs
{
    /// <summary>
    /// SignalR hub for real-time multiplayer Grand Prix racing.
    /// Manages lobbies, 2-minute auto-start countdown, per-frame position sync, and race results.
    /// </summary>
    public class RacingHub : Hub
    {
        private static readonly ConcurrentDictionary<string, LobbyState> _lobbies = new();
        private static readonly ConcurrentDictionary<string, RacerState> _racers = new();
        private const int AUTO_START_SECONDS = 120; // 2 minutes before auto-start

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            // Remove player from any lobby they're in
            if (_racers.TryRemove(Context.ConnectionId, out var racer))
            {
                if (_lobbies.TryGetValue(racer.LobbyId, out var lobby))
                {
                    lobby.Players.RemoveAll(p => p.ConnectionId == Context.ConnectionId);
                    await Clients.Group(racer.LobbyId).SendAsync("OnPlayerLeft", racer.PlayerName);
                    if (lobby.Players.Count == 0)
                    {
                        CancelAutoStartTimer(lobby);
                        _lobbies.TryRemove(racer.LobbyId, out _);
                    }
                }
            }
            await base.OnDisconnectedAsync(exception);
        }

        /// <summary>
        /// Create or join a lobby for the given track.
        /// Returns full lobby state to caller and broadcasts join to others.
        /// </summary>
        public async Task<object> JoinLobby(string trackId, string playerName, int playerId)
        {
            var lobbyId = $"racing_{trackId}";

            // Get or create lobby
            var lobby = _lobbies.GetOrAdd(lobbyId, _ => new LobbyState
            {
                LobbyId = lobbyId,
                TrackId = trackId,
                HostConnectionId = Context.ConnectionId,
                Players = new List<LobbyPlayer>()
            });

            // If this is the first player, set them as host
            if (lobby.Players.Count == 0)
            {
                lobby.HostConnectionId = Context.ConnectionId;
            }

            // Add player to lobby
            var lp = new LobbyPlayer
            {
                ConnectionId = Context.ConnectionId,
                PlayerName = playerName,
                PlayerId = playerId,
                IsHost = Context.ConnectionId == lobby.HostConnectionId,
                Ready = false,
                SkinId = 1
            };
            lobby.Players.Add(lp);

            // Track this connection's lobby
            _racers[Context.ConnectionId] = new RacerState
            {
                ConnectionId = Context.ConnectionId,
                LobbyId = lobbyId,
                PlayerName = playerName,
                PlayerId = playerId
            };

            await Groups.AddToGroupAsync(Context.ConnectionId, lobbyId);

            // Notify others
            await Clients.OthersInGroup(lobbyId).SendAsync("OnPlayerJoined", new
            {
                connectionId = Context.ConnectionId,
                playerName,
                playerId,
                isHost = lp.IsHost,
                skinId = lp.SkinId
            });

            // Start auto-start timer if this is the first player
            if (lobby.Players.Count == 1)
            {
                StartAutoStartTimer(lobby, lobbyId);
            }

            return new
            {
                lobbyId,
                trackId,
                players = lobby.Players.Select(p => new
                {
                    p.ConnectionId,
                    p.PlayerName,
                    p.PlayerId,
                    p.IsHost,
                    p.Ready,
                    p.SkinId
                }).ToList(),
                isHost = lp.IsHost
            };
        }

        /// <summary>
        /// Leave the current lobby.
        /// </summary>
        public async Task LeaveLobby(string trackId)
        {
            var lobbyId = $"racing_{trackId}";
            _racers.TryRemove(Context.ConnectionId, out var racer);

            if (_lobbies.TryGetValue(lobbyId, out var lobby))
            {
                var p = lobby.Players.FirstOrDefault(x => x.ConnectionId == Context.ConnectionId);
                lobby.Players.RemoveAll(x => x.ConnectionId == Context.ConnectionId);

                // If host left, assign new host
                if (p?.IsHost == true && lobby.Players.Count > 0)
                {
                    lobby.Players[0].IsHost = true;
                    lobby.HostConnectionId = lobby.Players[0].ConnectionId;
                    await Clients.Client(lobby.Players[0].ConnectionId).SendAsync("OnMadeHost");
                }

                await Clients.Group(lobbyId).SendAsync("OnPlayerLeft", p?.PlayerName ?? "Unknown");
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, lobbyId);

                if (lobby.Players.Count == 0)
                {
                    CancelAutoStartTimer(lobby);
                    _lobbies.TryRemove(lobbyId, out _);
                }
            }
        }

        /// <summary>
        /// Toggle ready state.
        /// </summary>
        public async Task ToggleReady(string trackId)
        {
            var lobbyId = $"racing_{trackId}";
            if (!_lobbies.TryGetValue(lobbyId, out var lobby)) return;

            var p = lobby.Players.FirstOrDefault(x => x.ConnectionId == Context.ConnectionId);
            if (p == null) return;
            p.Ready = !p.Ready;

            await Clients.Group(lobbyId).SendAsync("OnPlayerReadyChanged", new
            {
                connectionId = Context.ConnectionId,
                ready = p.Ready
            });
        }

        /// <summary>
        /// Update player's selected skin.
        /// </summary>
        public async Task UpdateSkin(string trackId, int skinId)
        {
            var lobbyId = $"racing_{trackId}";
            if (!_lobbies.TryGetValue(lobbyId, out var lobby)) return;

            var p = lobby.Players.FirstOrDefault(x => x.ConnectionId == Context.ConnectionId);
            if (p == null) return;
            p.SkinId = skinId;

            await Clients.Group(lobbyId).SendAsync("OnPlayerSkinChanged", new
            {
                connectionId = Context.ConnectionId,
                skinId
            });
        }

        /// <summary>
        /// Host starts the race — triggers countdown for all players.
        /// Can be called at any time, even with only 1 player. Cancels auto-start timer.
        /// </summary>
        public Task StartRace(string trackId)
        {
            var lobbyId = $"racing_{trackId}";
            if (!_lobbies.TryGetValue(lobbyId, out var lobby)) return Task.CompletedTask;

            if (lobby.HostConnectionId != Context.ConnectionId) return Task.CompletedTask;

            if (lobby.RaceStatus == "racing" || lobby.RaceStatus == "countdown") return Task.CompletedTask;

            // Cancel auto-start timer
            CancelAutoStartTimer(lobby);

            lobby.RaceStatus = "countdown";

            // Fire-and-forget the countdown so the hub method returns immediately
            _ = Task.Run(async () =>
            {
                try
                {
                    await Clients.Group(lobbyId).SendAsync("OnRaceCountdown", 4);
                    for (int i = 3; i >= 0; i--)
                    {
                        await Task.Delay(1000);
                        await Clients.Group(lobbyId).SendAsync("OnRaceCountdown", i);
                    }
                    lobby.RaceStatus = "racing";
                    await Clients.Group(lobbyId).SendAsync("OnRaceStarted", new
                    {
                        startTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        totalLaps = 3
                    });
                }
                catch { }
            });

            return Task.CompletedTask;
        }

        private void StartAutoStartTimer(LobbyState lobby, string lobbyId)
        {
            CancelAutoStartTimer(lobby);

            lobby.AutoStartRemaining = AUTO_START_SECONDS;
            lobby.AutoStartCts = new CancellationTokenSource();

            _ = Task.Run(async () =>
            {
                try
                {
                    while (lobby.AutoStartRemaining > 0 && lobby.RaceStatus == "lobby")
                    {
                        await Clients.Group(lobbyId).SendAsync("OnAutoStartCountdown", lobby.AutoStartRemaining);
                        await Task.Delay(1000, lobby.AutoStartCts.Token);
                        if (lobby.AutoStartCts.Token.IsCancellationRequested) return;
                        lobby.AutoStartRemaining--;
                    }

                    if (!lobby.AutoStartCts.Token.IsCancellationRequested && lobby.RaceStatus == "lobby" && lobby.Players.Count > 0)
                    {
                        // Auto-start the race
                        lobby.RaceStatus = "countdown";
                        await Clients.Group(lobbyId).SendAsync("OnRaceCountdown", 4);
                        for (int i = 3; i >= 0; i--)
                        {
                            await Task.Delay(1000, lobby.AutoStartCts.Token);
                            await Clients.Group(lobbyId).SendAsync("OnRaceCountdown", i);
                        }
                        if (!lobby.AutoStartCts.Token.IsCancellationRequested)
                        {
                            lobby.RaceStatus = "racing";
                            await Clients.Group(lobbyId).SendAsync("OnRaceStarted", new
                            {
                                startTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                                totalLaps = 3
                            });
                        }
                    }
                }
                catch (TaskCanceledException) { }
                catch { }
            }, lobby.AutoStartCts.Token);
        }

        private void CancelAutoStartTimer(LobbyState lobby)
        {
            if (lobby.AutoStartCts != null)
            {
                lobby.AutoStartCts.Cancel();
                lobby.AutoStartCts.Dispose();
                lobby.AutoStartCts = null;
            }
        }

        /// <summary>
        /// Per-frame position sync during a race.
        /// </summary>
        public async Task SyncPosition(string trackId, CarPositionData data)
        {
            var lobbyId = $"racing_{trackId}";
            await Clients.OthersInGroup(lobbyId).SendAsync("OnCarPositionUpdate", new
            {
                connectionId = Context.ConnectionId,
                x = data.X,
                z = data.Z,
                yaw = data.Yaw,
                speed = data.Speed,
                distance = data.Distance,
                currentLap = data.CurrentLap,
                isOffTrack = data.IsOffTrack
            });
        }

        /// <summary>
        /// Player finished the race.
        /// </summary>
        public async Task FinishRace(string trackId, int position, int totalTimeMs)
        {
            var lobbyId = $"racing_{trackId}";
            _racers.TryGetValue(Context.ConnectionId, out var racer);

            await Clients.Group(lobbyId).SendAsync("OnPlayerFinished", new
            {
                connectionId = Context.ConnectionId,
                playerName = racer?.PlayerName ?? "Unknown",
                position,
                totalTimeMs
            });
        }

        /// <summary>
        /// Send chat message within the lobby.
        /// </summary>
        public async Task SendChat(string trackId, string message)
        {
            var lobbyId = $"racing_{trackId}";
            _racers.TryGetValue(Context.ConnectionId, out var racer);

            await Clients.Group(lobbyId).SendAsync("OnChatMessage", new
            {
                playerName = racer?.PlayerName ?? "Unknown",
                message
            });
        }

        private class LobbyState
        {
            public string LobbyId { get; set; } = "";
            public string TrackId { get; set; } = "";
            public string HostConnectionId { get; set; } = "";
            public string RaceStatus { get; set; } = "lobby";
            public List<LobbyPlayer> Players { get; set; } = new();
            public int AutoStartRemaining { get; set; }
            public CancellationTokenSource? AutoStartCts { get; set; }
        }

        private class LobbyPlayer
        {
            public string ConnectionId { get; set; } = "";
            public string PlayerName { get; set; } = "";
            public int PlayerId { get; set; }
            public bool IsHost { get; set; }
            public bool Ready { get; set; }
            public int SkinId { get; set; }
        }

        private class RacerState
        {
            public string ConnectionId { get; set; } = "";
            public string LobbyId { get; set; } = "";
            public string PlayerName { get; set; } = "";
            public int PlayerId { get; set; }
        }
    }

    public class CarPositionData
    {
        public float X { get; set; }
        public float Z { get; set; }
        public float Yaw { get; set; }
        public float Speed { get; set; }
        public float Distance { get; set; }
        public int CurrentLap { get; set; }
        public bool IsOffTrack { get; set; }
    }
}
