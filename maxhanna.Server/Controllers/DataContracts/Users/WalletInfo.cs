using System;

namespace maxhanna.Server.Controllers.DataContracts.Users
{
    public class WalletInfo
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string BtcAddress { get; set; } = string.Empty;
    }
}
