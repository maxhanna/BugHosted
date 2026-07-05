using Newtonsoft.Json;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    public class EventCoin
    {
        [JsonProperty("slug")] public string? Slug { get; set; }
        [JsonProperty("symbol")] public string? Symbol { get; set; }
        [JsonProperty("name")] public string? Name { get; set; }
    }
}
