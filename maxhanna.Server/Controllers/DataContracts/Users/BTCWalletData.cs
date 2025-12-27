using Newtonsoft.Json;

namespace maxhanna.Server.Controllers.DataContracts.Users
{
    public class BTCWalletData
    {
        [JsonProperty("final_balance")] public long FinalBalance { get; set; }
        [JsonProperty("total_received")] public long TotalReceived { get; set; }
        [JsonProperty("total_sent")] public long TotalSent { get; set; }
    }
}
