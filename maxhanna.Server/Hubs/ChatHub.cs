using Microsoft.AspNetCore.SignalR;

namespace maxhanna.Server.Hubs
{
    /// <summary>
    /// SignalR hub for real-time chat. Clients join a per-chat group and are
    /// pushed new-message/edit notifications instead of polling the DB every
    /// few seconds. The ChatController broadcasts into these groups after a
    /// message is persisted, so all open chat windows update instantly.
    /// </summary>
    public class ChatHub : Hub
    {
        public const string ChatGroupPrefix = "chat_";

        public static string GroupName(int chatId) => ChatGroupPrefix + chatId;

        public Task JoinChat(int chatId) =>
            Groups.AddToGroupAsync(Context.ConnectionId, GroupName(chatId));

        public Task LeaveChat(int chatId) =>
            Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(chatId));
    }
}
