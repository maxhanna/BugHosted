using Newtonsoft.Json;
using System.Collections.Generic;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    public class CoinMarketCalResponse
    {
        [JsonProperty("body")]
        public List<CryptoEvent>? Body { get; set; }
    }
}
