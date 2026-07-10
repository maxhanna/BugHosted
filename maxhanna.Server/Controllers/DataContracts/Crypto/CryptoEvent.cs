using Newtonsoft.Json;
using System;
using System.Collections.Generic;

namespace maxhanna.Server.Controllers.DataContracts.Crypto
{
    public class CryptoEvent
    {
        [JsonProperty("id")] public string? Id { get; set; }
        [JsonProperty("slug")] public string? Slug { get; set; }
        [JsonProperty("title")] public EventTitle? Title { get; set; }
        [JsonProperty("description")] public string? Description { get; set; }
        [JsonProperty("date")] public DateTime? Date { get; set; }
        [JsonProperty("dateEnd")] public string? DateEnd { get; set; }
        [JsonProperty("dateType")] public string? DateType { get; set; }
        [JsonProperty("isEstimated")] public bool IsEstimated { get; set; }
        [JsonProperty("displayedDate")] public string? DisplayedDate { get; set; }
        [JsonProperty("categories")] public List<string>? Categories { get; set; }
        [JsonProperty("coins")] public List<EventCoin>? Coins { get; set; }
        [JsonProperty("impact")] public double? Impact { get; set; }
        [JsonProperty("impactSummary")] public string? ImpactSummary { get; set; }
        [JsonProperty("sourceUrl")] public string? SourceUrl { get; set; }
        [JsonProperty("snapshotUrl")] public string? SnapshotUrl { get; set; }
        [JsonProperty("lastVerifiedAt")] public DateTime? LastVerifiedAt { get; set; }
        [JsonProperty("createdAt")] public DateTime? CreatedAt { get; set; }
        [JsonProperty("updatedAt")] public DateTime? UpdatedAt { get; set; }

        public string? TitleText => Title?.English;
    }
}
