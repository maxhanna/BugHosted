using System;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    public class CoinResponse
    {
        public string? symbol { get; set; }
        public string? name { get; set; }
        public float rate { get; set; }
    }
}
