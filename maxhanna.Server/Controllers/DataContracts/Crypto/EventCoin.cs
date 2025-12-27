using Newtonsoft.Json;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    public class EventCoin
    {
        [JsonProperty("symbol")] public string? Symbol { get; set; }
        [JsonProperty("name")] public string? Name { get; set; }
    }
}
