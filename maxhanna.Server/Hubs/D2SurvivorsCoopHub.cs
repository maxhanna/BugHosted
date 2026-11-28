using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace maxhanna.Server.Hubs
{
  /// <summary>
  /// Relay for Diablo II: Survivors co-op. Every hero standing in the same zone
  /// joins one SignalR group; the hub keeps presence, elects one player as the
  /// zone's host and forwards events to everyone else in that zone.
  ///
  /// The hub also holds the zone's monster roster: the host reports what its
  /// simulation sees, and the hub stores each monster's last known pose and
  /// hands those poses to every guest. A guest that joins, reconnects or asks
  /// for a resync is answered from the hub's own copy, so no screen has to
  /// guess where a monster is: every client replays the same authoritative
  /// reports. Loot is still the host's roster, mirrored by guests.
  ///
  /// Nothing here lets a player damage another player: the only target of the
  /// <see cref="DamageMonster"/> forward is a monster id, and there is no
  /// player-vs-player message at all.
  /// </summary>
  public sealed class D2SurvivorsCoopHub : Hub
  {
    /// <summary>One hero in a zone, as the other players see them.</summary>
    public sealed record CoopPlayerState(
      string ConnectionId,
      string Name,
      string ClassId,
      int Level,
      double X,
      double Y,
      double FacingX,
      double FacingY,
      double HpFraction,
      string Animation,
      long SentAt,
      /// <summary>Worn gear as compact JSON, so others can dress the model.</summary>
      string? Look = null,
      /// <summary>This hero's living servants, so neighbours can draw them.</summary>
      CoopSummonState[]? Summons = null);

    /// <summary>One servant of one hero, at the moment of the report.</summary>
    public sealed record CoopSummonState(
      int Key,
      string Species,
      string? Skill,
      string? Element,
      string? Name,
      double X,
      double Y,
      double Hp,
      double MaxHp,
      double R,
      double FacingX,
      double FacingY,
      string Animation,
      double Attack);

    /// <summary>A cast's missile as a flyable picture, with no damage in it.</summary>
    public sealed record CoopCastShot(
      double X,
      double Y,
      double StartX,
      double StartY,
      double TargetX,
      double TargetY,
      string? MissileId,
      string? Skill,
      string Kind,
      string Color,
      double Speed,
      double Life,
      double Age,
      double Radius,
      double? ArtScale,
      bool SourceOnlyArt,
      bool Cold,
      string? DamageType,
      double? ImpactRadius,
      double? ImpactX,
      double? ImpactY,
      double? ImpactDuration);

    /// <summary>A monster standing in a zone, as the host first placed it.</summary>
    public sealed record CoopMonsterSpawn(
      int Id,
      string Kind,
      string Species,
      string? ChampionType,
      int Level,
      double X,
      double Y,
      double Hp,
      double MaxHp,
      string Name,
      bool Elite);

    /// <summary>
    /// The zone's authoritative picture of one monster: where it stands, how
    /// hurt it is, which way it faces and how far into a swing it is.
    /// </summary>
    public sealed record CoopMonsterPose(
      int Id,
      double X,
      double Y,
      double Hp,
      double MaxHp,
      string Animation,
      double FacingX,
      double FacingY,
      /// <summary>Seconds left in the monster's current attack swing.</summary>
      double Attack);

    /// <summary>An item lying on the zone floor, shared by everyone.</summary>
    public sealed record CoopLootAdd(string ItemId, string ItemJson, double X, double Y);

    public sealed record CoopZoneSnapshot(
      string Zone,
      string HostConnectionId,
      string ConnectionId,
      CoopPlayerState[] Players,
      /// <summary>The zone's monsters, so a joining hero draws them at once.</summary>
      CoopMonsterSpawn[] Monsters,
      CoopMonsterPose[] Poses);

    private sealed class ZoneState
    {
      public string? HostConnectionId { get; set; }
      public ConcurrentDictionary<string, CoopPlayerState> Players { get; } = new();
      /// <summary>The roster as first placed: species, rank and level.</summary>
      public ConcurrentDictionary<int, CoopMonsterSpawn> Monsters { get; } = new();
      /// <summary>Each of those monsters' latest authoritative pose.</summary>
      public ConcurrentDictionary<int, CoopMonsterPose> Poses { get; } = new();
    }

    private static readonly ConcurrentDictionary<string, ZoneState> Zones = new();
    private static readonly ConcurrentDictionary<string, string> ConnectionZones = new();

    private static string GroupName(string zone) => $"d2_coop:{zone}";

    /// <summary>A monotonically increasing stamp, so a client can order reports.</summary>
    private static long NowMs() => Environment.TickCount64;

    public async Task<CoopZoneSnapshot> JoinZone(string zone, CoopPlayerState me)
    {
      await LeaveZone();

      var state = Zones.GetOrAdd(zone, _ => new ZoneState());
      me = me with { ConnectionId = Context.ConnectionId };
      state.Players[Context.ConnectionId] = me;
      state.HostConnectionId ??= Context.ConnectionId;
      ConnectionZones[Context.ConnectionId] = zone;

      await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(zone));
      await Clients.OthersInGroup(GroupName(zone)).SendAsync("PlayerJoined", me);

      // The hub's roster is the zone's truth, so a hero walking in needs no
      // help from the host to see the monsters already standing here.
      return new CoopZoneSnapshot(
        zone,
        state.HostConnectionId,
        Context.ConnectionId,
        state.Players.Values.ToArray(),
        state.Monsters.Values.ToArray(),
        state.Poses.Values.ToArray());
    }

    public async Task LeaveZone()
    {
      if (!ConnectionZones.TryRemove(Context.ConnectionId, out var zone)) return;
      if (!Zones.TryGetValue(zone, out var state)) return;

      await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(zone));
      state.Players.TryRemove(Context.ConnectionId, out _);
      await Clients.OthersInGroup(GroupName(zone)).SendAsync("PlayerLeft", Context.ConnectionId);

      if (state.HostConnectionId == Context.ConnectionId)
      {
        // The zone needs a new authority: the first player still standing there.
        var next = state.Players.Values.Select(player => player.ConnectionId).FirstOrDefault();
        state.HostConnectionId = next;
        if (next is not null)
        {
          // The new host's simulation becomes the roster's source, so the old
          // host's monsters are forgotten rather than left behind as ghosts a
          // resync would hand back to everyone.
          state.Monsters.Clear();
          state.Poses.Clear();
          await Clients.Group(GroupName(zone)).SendAsync("HostChanged", next);
        }
      }

      // An empty zone takes its monster roster with it: the same area entered
      // again starts a fresh session with fresh monsters.
      if (state.Players.IsEmpty) Zones.TryRemove(zone, out _);
    }

    public async Task UpdatePlayer(CoopPlayerState me)
    {
      if (!ConnectionZones.TryGetValue(Context.ConnectionId, out var zone)) return;
      if (!Zones.TryGetValue(zone, out var state) || !state.Players.ContainsKey(Context.ConnectionId)) return;
      me = me with { ConnectionId = Context.ConnectionId };
      state.Players[Context.ConnectionId] = me;
      await Clients.OthersInGroup(GroupName(zone)).SendAsync("PlayerMoved", me);
    }

    /// <summary>Host only: the monsters that have just appeared in the zone.</summary>
    public async Task MonsterSpawned(string zone, CoopMonsterSpawn[] monsters)
    {
      if (!IsHost(zone) || monsters.Length == 0) return;
      if (!Zones.TryGetValue(zone, out var state)) return;
      foreach (var monster in monsters)
      {
        state.Monsters[monster.Id] = monster;
        // A newly placed monster stands where the spawn put it until its first
        // pose arrives, so even a client that missed the next report is right.
        state.Poses[monster.Id] = new CoopMonsterPose(
          monster.Id, monster.X, monster.Y, monster.Hp, monster.MaxHp, "idle", 0, 1, 0);
      }
      await Clients.OthersInGroup(GroupName(zone)).SendAsync("MonstersSpawned", monsters);
    }

    /// <summary>
    /// Host only: the authoritative picture of every monster standing in the
    /// zone. The hub stores it, so this is the one copy every guest replays and
    /// a resync never has to guess.
    /// </summary>
    public async Task MonsterStates(string zone, CoopMonsterPose[] poses)
    {
      if (!IsHost(zone) || poses.Length == 0) return;
      if (!Zones.TryGetValue(zone, out var state)) return;
      foreach (var pose in poses) state.Poses[pose.Id] = pose;
      await Clients.OthersInGroup(GroupName(zone)).SendAsync("MonsterPoses", poses, NowMs());
    }

    /// <summary>
    /// A neighbour's picture has drifted. The hub answers with the roster and
    /// the poses it holds, and asks the host for a fresh report so the copy it
    /// answered with is current.
    /// </summary>
    public async Task RequestResync(string zone)
    {
      if (!ConnectionZones.TryGetValue(Context.ConnectionId, out var myZone) || myZone != zone) return;
      if (Zones.TryGetValue(zone, out var state))
      {
        var monsters = state.Monsters.Values.ToArray();
        if (monsters.Length > 0) await Clients.Caller.SendAsync("MonstersSpawned", monsters);
        var poses = state.Poses.Values.ToArray();
        if (poses.Length > 0) await Clients.Caller.SendAsync("MonsterPoses", poses, NowMs());
      }
      await Clients.OthersInGroup(GroupName(zone)).SendAsync("ResyncRequested", Context.ConnectionId);
    }

    /// <summary>Host only: monsters that died or left the zone.</summary>
    public async Task MonsterRemoved(string zone, int[] ids)
    {
      if (!IsHost(zone) || ids.Length == 0) return;
      if (Zones.TryGetValue(zone, out var state))
      {
        foreach (var id in ids)
        {
          state.Monsters.TryRemove(id, out _);
          state.Poses.TryRemove(id, out _);
        }
      }
      await Clients.OthersInGroup(GroupName(zone)).SendAsync("MonstersRemoved", ids);
    }

    /// <summary>
    /// A guest's blow lands on the host, which owns the monster's health. The
    /// host applies it and the next state snapshot carries the new figure; a
    /// player is never a legal target here.
    /// </summary>
    public async Task DamageMonster(string zone, int id, double amount)
    {
      if (!Zones.TryGetValue(zone, out var state) || string.IsNullOrEmpty(state.HostConnectionId)) return;
      if (state.HostConnectionId == Context.ConnectionId) return;
      await Clients.Client(state.HostConnectionId)
        .SendAsync("MonsterDamaged", new { Id = id, Amount = amount, From = Context.ConnectionId });
    }

    /// <summary>Host only: loot the host has dropped on the floor.</summary>
    public async Task LootAdded(string zone, CoopLootAdd[] drops)
    {
      if (!IsHost(zone) || drops.Length == 0) return;
      await Clients.OthersInGroup(GroupName(zone)).SendAsync("LootAdded", drops);
    }

    /// <summary>Host only: loot that was picked up, expired or dropped elsewhere.</summary>
    public async Task LootRemoved(string zone, string[] itemIds)
    {
      if (!IsHost(zone) || itemIds.Length == 0) return;
      await Clients.OthersInGroup(GroupName(zone)).SendAsync("LootRemoved", itemIds);
    }

    /// <summary>A guest set an item down; the host puts it on the shared floor.</summary>
    public async Task LootDropped(string zone, CoopLootAdd drop)
    {
      if (!Zones.TryGetValue(zone, out var state) || string.IsNullOrEmpty(state.HostConnectionId)) return;
      if (state.HostConnectionId == Context.ConnectionId) return;
      await Clients.Client(state.HostConnectionId).SendAsync("LootDroppedByGuest", drop);
    }

    /// <summary>A guest picked something up; the host takes it off its floor too.</summary>
    public async Task LootTaken(string zone, string itemId)
    {
      if (!Zones.TryGetValue(zone, out var state) || string.IsNullOrEmpty(state.HostConnectionId)) return;
      await Clients.Client(state.HostConnectionId)
        .SendAsync("LootTakenByGuest", new { ItemId = itemId, From = Context.ConnectionId });
    }

    /// <summary>
    /// Any player: the missiles a cast launched, forwarded so the rest of the
    /// zone can watch them fly. They carry no damage; every client only
    /// replays the picture, so a shared cast can never hurt anything twice.
    /// </summary>
    public async Task CastShots(string zone, CoopCastShot[] shots)
    {
      if (shots.Length == 0) return;
      if (!ConnectionZones.TryGetValue(Context.ConnectionId, out var myZone) || myZone != zone) return;
      await Clients.OthersInGroup(GroupName(zone)).SendAsync("CastShots", Context.ConnectionId, shots);
    }

    private bool IsHost(string zone) =>
      Zones.TryGetValue(zone, out var state) && state.HostConnectionId == Context.ConnectionId;

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
      await LeaveZone();
      await base.OnDisconnectedAsync(exception);
    }
  }
}
