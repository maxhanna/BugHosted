using Newtonsoft.Json;
using System.Collections.Generic;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    public class CoinMarketCalResponse
    {
        [JsonProperty("data")]
        public List<CryptoEvent>? Data { get; set; }

        [JsonProperty("meta")]
        public CoinMarketCalMeta? Meta { get; set; }
    }

    public class CoinMarketCalMeta
    {
        [JsonProperty("cursor")]
        public string? Cursor { get; set; }
    }
}
