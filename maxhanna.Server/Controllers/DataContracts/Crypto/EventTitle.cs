using Newtonsoft.Json;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    public class EventTitle
    {
        [JsonProperty("en")]
        public string? English { get; set; }
    }
}
