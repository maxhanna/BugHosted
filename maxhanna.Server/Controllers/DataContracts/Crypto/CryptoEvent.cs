using Newtonsoft.Json;
using System;
using System.Collections.Generic;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    public class CryptoEvent
    {
        [JsonProperty("id")] public string? Id { get; set; }
        [JsonProperty("title")] public EventTitle? Title { get; set; }
        [JsonProperty("coins")] public List<EventCoin>? Coins { get; set; }
        [JsonProperty("date_event")] public DateTime DateEvent { get; set; }
        [JsonProperty("created_date")] public DateTime CreatedDate { get; set; }
        [JsonProperty("source")] public string? Source { get; set; }
        [JsonProperty("description")] public string? Description { get; set; }
        [JsonProperty("is_hot")] public bool IsHot { get; set; }
        [JsonProperty("proof")] public string? Proof { get; set; }

        public string? TitleText => Title?.English;
    }
}
