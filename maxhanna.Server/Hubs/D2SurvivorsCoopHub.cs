using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace maxhanna.Server.Hubs
{
  /// <summary>
  /// Relay for Diablo II: Survivors co-op. Every hero standing in the same zone
  /// joins one SignalR group; the hub keeps presence, elects one player as the
  /// zone's host (the authority for the monster roster and the loot on the
  /// floor) and forwards events to everyone else in that zone. It never
  /// simulates anything: the host client owns the roster and the drops, and
  /// guests mirror them.
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
      long SentAt);

    /// <summary>A monster the host wants every guest to place.</summary>
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

    /// <summary>The host's authoritative health/position of one monster.</summary>
    public sealed record CoopMonsterState(
      int Id,
      double Hp,
      double MaxHp,
      double X,
      double Y,
      string Animation);

    /// <summary>An item lying on the zone floor, shared by everyone.</summary>
    public sealed record CoopLootAdd(string ItemId, string ItemJson, double X, double Y);

    public sealed record CoopZoneSnapshot(
      string Zone,
      string HostConnectionId,
      string ConnectionId,
      CoopPlayerState[] Players);

    private sealed class ZoneState
    {
      public string? HostConnectionId { get; set; }
      public ConcurrentDictionary<string, CoopPlayerState> Players { get; } = new();
    }

    private static readonly ConcurrentDictionary<string, ZoneState> Zones = new();
    private static readonly ConcurrentDictionary<string, string> ConnectionZones = new();

    private static string GroupName(string zone) => $"d2_coop:{zone}";

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

      return new CoopZoneSnapshot(zone, state.HostConnectionId, Context.ConnectionId, state.Players.Values.ToArray());
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
          await Clients.Group(GroupName(zone)).SendAsync("HostChanged", next);
      }

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
      await Clients.OthersInGroup(GroupName(zone)).SendAsync("MonstersSpawned", monsters);
    }

    /// <summary>Host only: health and pose of the monsters already standing.</summary>
    public async Task MonsterStates(string zone, CoopMonsterState[] states)
    {
      if (!IsHost(zone) || states.Length == 0) return;
      await Clients.OthersInGroup(GroupName(zone)).SendAsync("MonsterStates", states);
    }

    /// <summary>Host only: monsters that died or left the zone.</summary>
    public async Task MonsterRemoved(string zone, int[] ids)
    {
      if (!IsHost(zone) || ids.Length == 0) return;
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

    private bool IsHost(string zone) =>
      Zones.TryGetValue(zone, out var state) && state.HostConnectionId == Context.ConnectionId;

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
      await LeaveZone();
      await base.OnDisconnectedAsync(exception);
    }
  }
}
