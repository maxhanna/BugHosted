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
        private const int COUNTDOWN_MS = 10_000;    // 10-second start-light sequence
        // How long the authoritative lobby-wide standings stay on screen after
        // the last player finishes before the lobby auto-returns to ready-up.
        private const int FINAL_STANDINGS_DISPLAY_MS = 6_000;
        // Hard ceiling on how long the standings window can stay open. Late
        // joiners restart the display timer (full duration each time), so this
        // absolute deadline guarantees the lobby always returns to ready-up.
        private const int MAX_STANDINGS_DISPLAY_MS = 30_000;

        /// <summary>
        /// Number of players currently connected to a racing lobby. Exposed so
        /// the navigation icon can show a live player count (like Grand Theft).
        /// </summary>
        public static int ActiveRacerCount => _racers.Count;

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            // Remove player from any lobby they're in
            if (_racers.TryRemove(Context.ConnectionId, out var racer))
            {
                if (_lobbies.TryGetValue(racer.LobbyId, out var lobby))
                {
                    var wasHost = lobby.HostConnectionId == Context.ConnectionId;
                    var raceInProgress = lobby.RaceStatus == "racing";
                    lobby.Players.RemoveAll(p => p.ConnectionId == Context.ConnectionId);
                    lobby.FinishedConnections.Remove(Context.ConnectionId);
                    // A racer who drops mid-race is DNF, not dropped: keep their
                    // row in the final classification. A racer who already crossed
                    // the line keeps their finish result instead.
                    if (raceInProgress)
                    {
                        var existing = lobby.FinishedResults.FirstOrDefault(r => r.ConnectionId == Context.ConnectionId);
                        if (existing == null || existing.IsDnf)
                        {
                            lobby.FinishedResults.RemoveAll(r => r.ConnectionId == Context.ConnectionId);
                            lobby.FinishedResults.Add(new RacerFinish
                            {
                                ConnectionId = Context.ConnectionId,
                                PlayerName = racer.PlayerName,
                                PlayerId = racer.PlayerId,
                                Position = -1,
                                IsDnf = true,
                                // Show how far they got before dropping out, from
                                // the hub's tracked cumulative distance.
                                RaceDist = lobby.RaceDist.TryGetValue(Context.ConnectionId, out var dnfDist) ? dnfDist : 0,
                                Laps = lobby.TotalTrackDist > 0 ? (int)Math.Floor(dnfDist / lobby.TotalTrackDist) : 0
                            });
                        }
                    }
                    await Clients.Group(racer.LobbyId).SendAsync("OnPlayerLeft", racer.PlayerName);
                    if (lobby.Players.Count == 0)
                    {
                        CancelAutoStartTimer(lobby);
                        CancelStandingsReset(lobby);
                        _lobbies.TryRemove(racer.LobbyId, out _);
                    }
                    else
                    {
                        if (wasHost)
                        {
                            // Promote the first remaining player to host so the lobby
                            // stays alive and someone can start the race.
                            lobby.Players[0].IsHost = true;
                            lobby.HostConnectionId = lobby.Players[0].ConnectionId;
                            await Clients.Client(lobby.Players[0].ConnectionId).SendAsync("OnMadeHost");
                            await Clients.Group(racer.LobbyId).SendAsync("OnPlayerHostChanged", new
                            {
                                connectionId = lobby.HostConnectionId
                            });
                        }
                        // The departed racer is no longer expected to finish, so if
                        // everyone still in the race has already crossed the line,
                        // broadcast the classification now instead of stalling.
                        await TryBroadcastStandingsAsync(racer.LobbyId, lobby);
                    }
                    // The departed player may be in other lobbies — recompute their
                    // IN RACE badge there (clears if this was their racing seat).
                    _ = RecomputeInRaceForAsync(racer.LobbyId, Context.ConnectionId, racer.PlayerId);
                }
            }
            await base.OnDisconnectedAsync(exception);
        }

        /// <summary>
        /// Create or join a lobby for the given track.
        /// Returns full lobby state to caller and broadcasts join to others.
        /// </summary>
        public async Task<object> JoinLobby(string trackId, string playerName, int playerId, int laps = 3, double totalTrackDist = 0)
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

            // Store the track's real lap count so StartRace and auto-start
            // broadcast it instead of a hardcoded 3.
            lobby.TotalLaps = laps;
            // If the joining client already has the circuit loaded, record its
            // length so the hub can derive laps/positions from its own distance
            // tracking. SyncPosition re-reports it anyway once racing, so a
            // zero here is harmless.
            if (totalTrackDist > 0) lobby.TotalTrackDist = totalTrackDist;

            // Duplicate-join guard: drop any stale seat for this connection
            // (double-click) or this player id (reconnect) before adding, so
            // the lobby never shows ghost entries.
            lobby.Players.RemoveAll(p => p.ConnectionId == Context.ConnectionId || p.PlayerId == playerId);
            // A reconnecting racer must not appear twice in the classification —
            // purge any DNF/finish row left behind by their previous seat. Only
            // do this while the race is still live though: if the race has
            // already finished and the standings window is open, keep their row
            // so the catch-up they receive (same as a fresh joiner) still shows
            // them in the previous race's results.
            if (lobby.RaceStatus == "racing" && !lobby.StandingsSent)
            {
                lobby.FinishedResults.RemoveAll(r => r.PlayerId == playerId);
            }

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
            // Recompute every member's "in another race" flag — the joiner may
            // already be racing elsewhere, and the roster they receive must be
            // accurate the moment it renders.
            RefreshLobbyInRaceFlags(lobby);

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
                skinId = lp.SkinId,
                inRace = lp.InRace
            });

            // Start auto-start timer if this is the first player
            if (lobby.Players.Count == 1)
            {
                StartAutoStartTimer(lobby, lobbyId);
            }

            // Push the current auto-start remaining straight to the joining
            // client AND include it in the join payload, so non-host players see
            // the "Auto-start in 2:00" banner the moment they arrive instead of
            // waiting for the next group tick (which is why only the host seemed
            // to see it before).
            if (lobby.RaceStatus == "lobby" && lobby.AutoStartRemaining > 0)
            {
                try { await Clients.Caller.SendAsync("OnAutoStartCountdown", lobby.AutoStartRemaining); } catch { }
            }

            // If the previous race's classification is still on display (the
            // rematch window hasn't closed yet), send it straight to the joining
            // player so they see the last race's results instead of a blank lobby,
            // then restart the display window so the joiner — and everyone else —
            // gets the full duration to read the results before ready-up. This
            // goes through the shared SendStandingsCatchUpAsync so a reconnecting
            // player who rejoins mid-window gets identical treatment.
            await SendStandingsCatchUpAsync(lobbyId, lobby);

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
                    p.SkinId,
                    p.InRace
                }).ToList(),
                isHost = lp.IsHost,
                autoStartRemaining = lobby.RaceStatus == "lobby" ? lobby.AutoStartRemaining : 0
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

                lobby.FinishedConnections.Remove(Context.ConnectionId);

                // If host left, assign new host
                if (p?.IsHost == true && lobby.Players.Count > 0)
                {
                    lobby.Players[0].IsHost = true;
                    lobby.HostConnectionId = lobby.Players[0].ConnectionId;
                    await Clients.Client(lobby.Players[0].ConnectionId).SendAsync("OnMadeHost");
                    await Clients.Group(lobbyId).SendAsync("OnPlayerHostChanged", new
                    {
                        connectionId = lobby.HostConnectionId
                    });
                }

                await Clients.Group(lobbyId).SendAsync("OnPlayerLeft", p?.PlayerName ?? "Unknown");
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, lobbyId);

                // The leaver may be sitting in other lobbies — recompute their
                // IN RACE badge there (clears if this was their racing seat).
                _ = RecomputeInRaceForAsync(lobbyId, Context.ConnectionId, p?.PlayerId ?? 0);

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
        public Task StartRace(string trackId, int laps = 3, double totalTrackDist = 0)
        {
            var lobbyId = $"racing_{trackId}";
            if (!_lobbies.TryGetValue(lobbyId, out var lobby)) return Task.CompletedTask;

            if (lobby.HostConnectionId != Context.ConnectionId) return Task.CompletedTask;

            if (lobby.RaceStatus == "racing" || lobby.RaceStatus == "countdown") return Task.CompletedTask;

            lobby.TotalLaps = laps;
            if (totalTrackDist > 0) lobby.TotalTrackDist = totalTrackDist;
            // Fresh race, fresh progress tracking: cumulative distance starts
            // over so an earlier race's recorded progress can't leak into the
            // next classification.
            lobby.RaceDist.Clear();
            lobby.FinishedConnections.Clear();
            lobby.FinishedResults.Clear();
            lobby.StandingsSent = false;
            CancelStandingsReset(lobby);

            // Cancel auto-start timer
            CancelAutoStartTimer(lobby);

            lobby.RaceStatus = "countdown";
            // These players are now committed to this race — from any other lobby
            // they sit in, they should show as IN RACE.
            RefreshLobbyInRaceFlags(lobby);
            _ = BroadcastInRaceUpdatesAsync(lobby);

            // Broadcast the race start timestamp ONCE. The client drives its own
            // start-light countdown locally from startTime (now + 10s), so a
            // dropped message or a stuck background loop can never freeze the
            // lights or stall the race — the countdown can't get stuck waiting
            // on 11 separate per-second tick messages.
            var startTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + COUNTDOWN_MS;
            _ = Clients.Group(lobbyId).SendAsync("OnRaceStarted", new
            {
                startTime,
                totalLaps = lobby.TotalLaps
            });

            // Flip the server-side lobby state after the lights finish. No
            // per-second messages needed — the client is authoritative for the
            // visible countdown and starts the race itself when startTime hits.
            _ = Task.Run(async () =>
            {
                try { await Task.Delay(COUNTDOWN_MS); } catch { }
                lobby.RaceStatus = "racing";
            });

            return Task.CompletedTask;
        }

        /// <summary>
        /// Host resets the lobby to the ready-up state after a race so everyone
        /// can go again. Clears ready flags and restarts the auto-start timer.
        /// </summary>
        public async Task Rematch(string trackId)
        {
            var lobbyId = $"racing_{trackId}";
            if (!_lobbies.TryGetValue(lobbyId, out var lobby)) return;
            if (lobby.HostConnectionId != Context.ConnectionId) return;

            ResetLobby(lobby);

            await Clients.Group(lobbyId).SendAsync("OnRematch", new
            {
                players = lobby.Players.Select(p => new
                {
                    p.ConnectionId,
                    p.PlayerName,
                    p.PlayerId,
                    p.IsHost,
                    p.Ready,
                    p.SkinId
                }).ToList()
            });
        }

        // A lobby member is "in a game" when the same connection (or player id)
        // holds a live seat in ANOTHER lobby whose race is running or in its 10s
        // start lights. Same-lobby races never count — everyone there is in the
        // same game already.
        private bool IsInAnotherRace(LobbyState lobby, LobbyPlayer p)
        {
            foreach (var other in _lobbies)
            {
                if (other.Key == lobby.LobbyId) continue;
                if (other.Value.RaceStatus != "countdown" && other.Value.RaceStatus != "racing") continue;
                // Snapshot: this runs from fire-and-forget broadcasts that overlap
                // with hub calls mutating the same Players list (Add/RemoveAll).
                if (other.Value.Players.ToList().Any(x => x.ConnectionId == p.ConnectionId || (p.PlayerId > 0 && x.PlayerId == p.PlayerId)))
                    return true;
            }
            return false;
        }

        private void RefreshLobbyInRaceFlags(LobbyState lobby)
        {
            foreach (var p in lobby.Players) p.InRace = IsInAnotherRace(lobby, p);
        }

        // After a lobby's race status changes (started, finished, or a player
        // left), tell OTHER lobbies that share players so their rosters can flip
        // the IN RACE badge without a full rejoin. Uses the local lobby reference
        // even if it was just removed from _lobbies (removal itself means those
        // players are no longer racing, which IsInAnotherRace already reflects).
        private async Task BroadcastInRaceUpdatesAsync(LobbyState lobby)
        {
            foreach (var other in _lobbies)
            {
                if (other.Key == lobby.LobbyId) continue;
                foreach (var p in other.Value.Players.ToList())
                {
                    bool shared = lobby.Players.ToList().Any(x => x.ConnectionId == p.ConnectionId || (p.PlayerId > 0 && x.PlayerId == p.PlayerId));
                    if (!shared) continue;
                    bool inRace = IsInAnotherRace(other.Value, p);
                    if (p.InRace == inRace) continue;
                    p.InRace = inRace;
                    try { await Clients.Group(other.Key).SendAsync("OnLobbyRosterUpdate", new { connectionId = p.ConnectionId, inRace }); } catch { }
                }
            }
        }

        // After a player leaves/removes their seat in one lobby, recompute their
        // IN RACE badge on every OTHER lobby roster they still sit in (their
        // racing status may have changed — either cleared or still racing in a
        // third lobby). Only sends when the flag actually flips.
        private async Task RecomputeInRaceForAsync(string excludeLobbyId, string connectionId, int playerId)
        {
            foreach (var other in _lobbies)
            {
                if (other.Key == excludeLobbyId) continue;
                foreach (var p in other.Value.Players.ToList())
                {
                    if (p.ConnectionId != connectionId && !(playerId > 0 && p.PlayerId == playerId)) continue;
                    bool inRace = IsInAnotherRace(other.Value, p);
                    if (p.InRace != inRace)
                    {
                        p.InRace = inRace;
                        try { await Clients.Group(other.Key).SendAsync("OnLobbyRosterUpdate", new { connectionId = p.ConnectionId, inRace }); } catch { }
                    }
                }
            }
        }

        private void ResetLobby(LobbyState lobby)
        {
            CancelAutoStartTimer(lobby);
            CancelStandingsReset(lobby);
            lobby.RaceStatus = "lobby";
            RefreshLobbyInRaceFlags(lobby);
            _ = BroadcastInRaceUpdatesAsync(lobby);
            lobby.FinishedConnections.Clear();
            lobby.FinishedResults.Clear();
            lobby.RaceDist.Clear();
            lobby.StandingsSent = false;
            foreach (var p in lobby.Players) p.Ready = false;
            lobby.AutoStartRemaining = AUTO_START_SECONDS;
            StartAutoStartTimer(lobby, lobby.LobbyId);
        }

        private void StartAutoStartTimer(LobbyState lobby, string lobbyId)
        {
            CancelAutoStartTimer(lobby);

            lobby.AutoStartRemaining = AUTO_START_SECONDS;
            lobby.AutoStartCts = new CancellationTokenSource();

            // Capture the token ONCE. The old loop read lobby.AutoStartCts.Token
            // every iteration, so the instant CancelAutoStartTimer nulled the
            // field the loop died with a swallowed NullReferenceException after
            // the first tick — freezing the "Auto-start in 2:00" display.
            var token = lobby.AutoStartCts.Token;

            _ = Task.Run(async () =>
            {
                try
                {
                    while (lobby.AutoStartRemaining > 0 && lobby.RaceStatus == "lobby")
                    {
                        try { await Clients.Group(lobbyId).SendAsync("OnAutoStartCountdown", lobby.AutoStartRemaining); } catch { }
                        try { await Task.Delay(1000, token); } catch { return; }
                        if (token.IsCancellationRequested) return;
                        lobby.AutoStartRemaining--;
                    }

                    if (!token.IsCancellationRequested && lobby.RaceStatus == "lobby" && lobby.Players.Count > 0)
                    {
                        // Auto-start the race — broadcast the authoritative start
                        // timestamp once; the client counts the lights down locally.
                        lobby.RaceStatus = "countdown";
                        RefreshLobbyInRaceFlags(lobby);
                        _ = BroadcastInRaceUpdatesAsync(lobby);
                        var startTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + COUNTDOWN_MS;
                        await Clients.Group(lobbyId).SendAsync("OnRaceStarted", new
                        {
                            startTime,
                            totalLaps = lobby.TotalLaps
                        });
                        try { await Task.Delay(COUNTDOWN_MS, token); } catch { return; }
                        if (!token.IsCancellationRequested)
                        {
                            lobby.RaceStatus = "racing";
                            lobby.FinishedConnections.Clear();
                            lobby.FinishedResults.Clear();
                            lobby.RaceDist.Clear();
                            lobby.StandingsSent = false;
                            CancelStandingsReset(lobby);
                        }
                    }
                }
                catch (TaskCanceledException) { }
                catch { }
            }, token);
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
            var connId = Context.ConnectionId;
            var currentLap = data.CurrentLap;
            if (_lobbies.TryGetValue(lobbyId, out var lobby))
            {
                // Any client that has the circuit loaded reports its length
                // (join/start can fire before the track finishes loading).
                if (data.TotalTrackDist > 0) lobby.TotalTrackDist = data.TotalTrackDist;

                // Accumulate a cumulative, wrap-aware race distance per
                // connection — the same treatment the client applies to its
                // local bots: a lap crossing (distance dropping back near zero)
                // is corrected by one track length, while genuinely reversing
                // yields a negative delta that subtracts progress instead of
                // adding it. Positive deltas are capped so a single inflated
                // report can't farm laps, keeping the hub's own numbers the
                // source of truth for laps and finish positions.
                if (lobby.TotalTrackDist > 0)
                {
                    var td = lobby.TotalTrackDist;
                    var prev = lobby.RaceDist.TryGetValue(connId, out var p) ? p : data.Distance;
                    var delta = data.Distance - prev;
                    if (delta < -td * 0.5) delta += td;
                    else if (delta > td * 0.5) delta -= td;
                    if (delta > td * 0.15) delta = td * 0.15;
                    var raceDist = Math.Max(0, prev + delta);
                    lobby.RaceDist[connId] = raceDist;
                    currentLap = (int)Math.Floor(raceDist / td);
                }
            }

            await Clients.OthersInGroup(lobbyId).SendAsync("OnCarPositionUpdate", new
            {
                connectionId = connId,
                x = data.X,
                z = data.Z,
                yaw = data.Yaw,
                speed = data.Speed,
                distance = data.Distance,
                currentLap,
                isOffTrack = data.IsOffTrack
            });
        }

        /// <summary>
        /// Player finished the race.
        /// </summary>
        public async Task FinishRace(string trackId, int position, int totalTimeMs, int laps = 0)
        {
            var lobbyId = $"racing_{trackId}";
            _racers.TryGetValue(Context.ConnectionId, out var racer);
            _lobbies.TryGetValue(lobbyId, out var lobby);

            // When the circuit length is known, ignore the client-reported
            // finish position and laps and derive them from the hub's own
            // cumulative distance instead, so a client can't fake a podium
            // spot by reporting one. Every racer the server has measured ahead
            // ranks above this finisher, everyone else ranks below.
            var finishPos = position;
            var finishLaps = laps;
            var finishDist = 0.0;
            if (lobby != null && lobby.TotalTrackDist > 0)
            {
                lobby.RaceDist.TryGetValue(Context.ConnectionId, out var myDist);
                finishDist = myDist;
                // Snapshot the roster like TryBroadcastStandingsAsync does — a
                // concurrent disconnect mutates Players and would otherwise
                // trip "Collection was modified" mid-enumeration.
                var players = lobby.Players.ToList();
                var ahead = players.Count(p =>
                    p.ConnectionId != Context.ConnectionId &&
                    lobby.RaceDist.TryGetValue(p.ConnectionId, out var d) && d > myDist);
                finishPos = ahead + 1;
                finishLaps = (int)Math.Floor(myDist / lobby.TotalTrackDist);
            }

            await Clients.Group(lobbyId).SendAsync("OnPlayerFinished", new
            {
                connectionId = Context.ConnectionId,
                playerName = racer?.PlayerName ?? "Unknown",
                position = finishPos,
                totalTimeMs
            });

            // When every remaining player has crossed the line, broadcast the
            // authoritative lobby-wide classification — built from the server's
            // own derived positions — so the whole lobby sees the same
            // standings instead of each client's local snapshot.
            if (lobby != null && lobby.RaceStatus == "racing")
            {
                lobby.FinishedConnections.Add(Context.ConnectionId);
                // Replace any earlier finish report for this connection (a
                // duplicate FinishRace call must not produce a duplicate row).
                lobby.FinishedResults.RemoveAll(r => r.ConnectionId == Context.ConnectionId);
                lobby.FinishedResults.Add(new RacerFinish
                {
                    ConnectionId = Context.ConnectionId,
                    PlayerName = racer?.PlayerName ?? "Unknown",
                    PlayerId = racer?.PlayerId ?? 0,
                    Position = finishPos,
                    TotalTimeMs = totalTimeMs,
                    Laps = finishLaps,
                    RaceDist = finishDist
                });
                // The all-finished check lives in TryBroadcastStandingsAsync so
                // the disconnect path can reuse it — a racer leaving mid-race no
                // longer blocks the classification from being broadcast.
                await TryBroadcastStandingsAsync(lobbyId, lobby);
            }
        }

        /// <summary>
        /// If every remaining racer has crossed the line, broadcast the
        /// authoritative lobby-wide classification and, after a short display
        /// window, return the lobby to ready-up. Reused by FinishRace (last
        /// finisher) and OnDisconnectedAsync (last remaining racer), so a racer
        /// who leaves mid-race can't stall the results.
        /// </summary>
        /// <summary>
        /// Send the previous race's classification to the calling client if the
        /// standings display window is still open, and restart the display timer
        /// so the recipient gets the full duration to read the results. Shared by
        /// JoinLobby so fresh joiners and reconnecting players (both of which
        /// re-invoke JoinLobby) get identical catch-up treatment.
        /// </summary>
        private async Task SendStandingsCatchUpAsync(string lobbyId, LobbyState lobby)
        {
            if (lobby.StandingsSent && lobby.FinishedResults.Count > 0)
            {
                try
                {
                    await Clients.Caller.SendAsync("OnRaceStandings", new
                    {
                        standings = BuildStandingsPayload(lobby),
                        remainingMs = GetStandingsRemainingMs(lobby),
                        winner = BuildWinnerPayload(lobby)
                    });
                }
                catch { }
                ScheduleStandingsReset(lobbyId, lobby);
            }
        }

        private async Task TryBroadcastStandingsAsync(string lobbyId, LobbyState lobby)
        {
            // StandingsSent guards against a duplicate FinishRace (retry or a
            // reconnecting connection) re-entering this branch during the
            // display window and re-broadcasting the classification.
            if (lobby.StandingsSent) return;
            // Snapshot the player list so a concurrent join/leave can't trip
            // "Collection was modified" while IsSupersetOf enumerates it.
            var connectionIds = lobby.Players.Select(p => p.ConnectionId).ToList();
            if (connectionIds.Count == 0 || !lobby.FinishedConnections.IsSupersetOf(connectionIds)) return;
            lobby.StandingsSent = true;
            // Anchor the absolute deadline for the standings display window so
            // late-joiner timer restarts can extend it, but never past the cap.
            lobby.StandingsWindowStartUtc = DateTime.UtcNow;

            await Clients.Group(lobbyId).SendAsync("OnRaceStandings", new
            {
                standings = BuildStandingsPayload(lobby),
                remainingMs = GetStandingsRemainingMs(lobby),
                // The race winner, so every client can celebrate the same
                // moment the final classification lands (cannonade for the
                // winner, finish-line burst for everyone else).
                winner = BuildWinnerPayload(lobby)
            });

            // Hold the final classification on screen long enough to read it
            // before auto-returning the lobby to ready-up. The timer can be
            // restarted by a late join (full duration for everyone) and is
            // cancelled on reset/race start so a stale window can never fire
            // mid-next-race.
            ScheduleStandingsReset(lobbyId, lobby);
        }

        /// <summary>
        /// (Re)start the timer that returns a finished lobby to ready-up after
        /// the standings display window. Each call cancels any pending reset and
        /// schedules a fresh full FINAL_STANDINGS_DISPLAY_MS window — so a player
        /// joining mid-standings gives the whole lobby the full duration to read
        /// the results. The window is hard-capped at MAX_STANDINGS_DISPLAY_MS from
        /// when the standings were first broadcast, so a stream of late joiners
        /// can keep extending it but never keep the lobby out of ready-up forever.
        /// Fire-and-forget so the FinishRace invoke returns at once (same pattern
        /// as StartRace's countdown); the re-check skips if the host hit Rematch
        /// or the lobby emptied.
        /// </summary>
        private void ScheduleStandingsReset(string lobbyId, LobbyState lobby)
        {
            CancelStandingsReset(lobby);
            var cts = new CancellationTokenSource();
            lobby.StandingsResetCts = cts;
            var token = cts.Token;

            _ = Task.Run(async () =>
            {
                // Each restart grants a fresh full display window, but never
                // past the absolute deadline; a short grace floor guarantees the
                // reset still fires (and the lobby still returns to ready-up)
                // once the cap is reached.
                var remaining = TimeSpan.FromMilliseconds(GetStandingsRemainingMs(lobby));
                try { await Task.Delay(remaining, token); }
                catch { return; }
                if (token.IsCancellationRequested) return;
                if (_lobbies.TryGetValue(lobbyId, out var current) && current == lobby && lobby.RaceStatus == "racing")
                {
                    ResetLobby(lobby);
                    try
                    {
                        await Clients.Group(lobbyId).SendAsync("OnRematch", new
                        {
                            players = lobby.Players.Select(p => new
                            {
                                p.ConnectionId,
                                p.PlayerName,
                                p.PlayerId,
                                p.IsHost,
                                p.Ready,
                                p.SkinId
                            }).ToList()
                        });
                    }
                    catch { }
                }
                // Only clear the reference if a newer reset didn't take its place.
                if (ReferenceEquals(lobby.StandingsResetCts, cts)) lobby.StandingsResetCts = null;
            });
        }

        /// <summary>
        /// Milliseconds left in the standings display window: a fresh full
        /// FINAL_STANDINGS_DISPLAY_MS normally, clamped to the absolute
        /// MAX_STANDINGS_DISPLAY_MS deadline anchored at first broadcast, with a
        /// 1s grace floor so the reset always fires once the cap is reached.
        /// Shared by the reset timer and the OnRaceStandings payload so clients
        /// can render a live countdown that matches the actual reset moment.
        /// </summary>
        private int GetStandingsRemainingMs(LobbyState lobby)
        {
            var elapsed = DateTime.UtcNow - lobby.StandingsWindowStartUtc;
            var remaining = (int)Math.Min(FINAL_STANDINGS_DISPLAY_MS, MAX_STANDINGS_DISPLAY_MS - (int)elapsed.TotalMilliseconds);
            return Math.Max(remaining, 1_000);
        }

        private void CancelStandingsReset(LobbyState lobby)
        {
            if (lobby.StandingsResetCts != null)
            {
                lobby.StandingsResetCts.Cancel();
                lobby.StandingsResetCts.Dispose();
                lobby.StandingsResetCts = null;
            }
        }

        /// <summary>
        /// The ordered classification payload broadcast on OnRaceStandings —
        /// finishers by position, DNF racers last. Shared by the broadcast path
        /// and the join catch-up path so a player who joins a lobby whose race
        /// just ended sees exactly what everyone else saw.
        /// </summary>
        private List<object> BuildStandingsPayload(LobbyState lobby) =>
            lobby.FinishedResults
                // Authoritative order: DNF last, then the hub's measured
                // cumulative distance (descending) — falling back to the
                // reported position only when the circuit length was never
                // known. This makes the final classification follow the
                // server's own numbers, not a chain of finish-moment
                // snapshots, so reversing or faking can't reorder it.
                .OrderBy(r => r.IsDnf)
                .ThenByDescending(r => r.RaceDist)
                .ThenBy(r => r.Position)
                .Select(r => (object)new
                {
                    r.ConnectionId,
                    r.PlayerName,
                    r.PlayerId,
                    r.Position,
                    r.TotalTimeMs,
                    r.Laps,
                    r.IsDnf
                }).ToList();

        /// The winner of the just-finished race (first non-DNF finisher), or
        /// null when nobody finished — used by every client to fire the shared
        /// winner celebration exactly when the final classification lands.
        private object? BuildWinnerPayload(LobbyState lobby) =>
            lobby.FinishedResults
                .Where(r => !r.IsDnf)
                .OrderByDescending(r => r.RaceDist)
                .ThenBy(r => r.Position)
                .Select(r => (object)new
                {
                    r.ConnectionId,
                    r.PlayerName,
                    r.PlayerId
                })
                .FirstOrDefault();

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
            public int TotalLaps { get; set; } = 3;
            // Total length of the circuit, reported by whichever client has it
            // loaded. Zero until the first report. When known, the hub derives
            // laps and finish positions from its own cumulative per-connection
            // distance instead of the client's reported numbers, so reversing
            // or faking position can't be gamed.
            public double TotalTrackDist { get; set; }
            // Cumulative wrap-aware race distance per connection, accumulated
            // in SyncPosition exactly like the client does for its bots — the
            // treatment that makes reversing subtract progress instead of
            // adding it. Concurrent because every connection's SyncPosition
            // (10Hz) mutates it in parallel.
            public ConcurrentDictionary<string, double> RaceDist { get; set; } = new();
            public List<LobbyPlayer> Players { get; set; } = new();
            public HashSet<string> FinishedConnections { get; set; } = new();
            public List<RacerFinish> FinishedResults { get; set; } = new();
            public bool StandingsSent { get; set; }
            // When the standings window opened (first broadcast). Late-joiner
            // timer restarts are bounded by this + MAX_STANDINGS_DISPLAY_MS.
            public DateTime StandingsWindowStartUtc { get; set; }
            public int AutoStartRemaining { get; set; }
            public CancellationTokenSource? AutoStartCts { get; set; }
            public CancellationTokenSource? StandingsResetCts { get; set; }
        }

        private class RacerFinish
        {
            public string ConnectionId { get; set; } = "";
            public string PlayerName { get; set; } = "";
            public int PlayerId { get; set; }
            public int Position { get; set; }
            public int TotalTimeMs { get; set; }
            public int Laps { get; set; }
            public bool IsDnf { get; set; }
            // Cumulative distance the hub measured for this racer (0 when the
            // circuit length was never reported — fallback mode ordering by
            // reported position).
            public double RaceDist { get; set; }
        }

        private class LobbyPlayer
        {
            public string ConnectionId { get; set; } = "";
            public string PlayerName { get; set; } = "";
            public int PlayerId { get; set; }
            public bool IsHost { get; set; }
            public bool Ready { get; set; }
            public int SkinId { get; set; }
            // True when this member holds a live seat in ANOTHER lobby whose race
            // is running (or in its 10s start lights) — i.e. they're already in a
            // game elsewhere. Drives the "🏁 IN RACE" badge on lobby rosters.
            public bool InRace { get; set; }
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
        // Total length of the circuit (0 until the client has it loaded). Lets
        // the hub activate server-side cumulative distance tracking.
        public double TotalTrackDist { get; set; }
    }
}
