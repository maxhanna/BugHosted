using Microsoft.AspNetCore.SignalR;

namespace maxhanna.Server.Hubs
{
  public sealed class D2SurvivorsLobbyHub : Hub
  {
    public const string GroupName = "d2_survivors_lobby";

    public override async Task OnConnectedAsync()
    {
      await Groups.AddToGroupAsync(Context.ConnectionId, GroupName);
      await base.OnConnectedAsync();
    }
  }
}
