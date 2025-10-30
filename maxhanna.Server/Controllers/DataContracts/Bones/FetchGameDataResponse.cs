using System.Text.Json.Serialization;

namespace maxhanna.Server.Controllers.DataContracts.Bones
{
    public class FetchGameDataResponse
    {
        [JsonPropertyName("map")]
        public string? Map { get; set; }

        [JsonPropertyName("position")]
        public Vector2? Position { get; set; }

        [JsonPropertyName("heroes")]
        public MetaHero[]? Heroes { get; set; }

        [JsonPropertyName("events")]
        public List<MetaEvent>? Events { get; set; }

        [JsonPropertyName("enemyBots")]
        public MetaBot[]? EnemyBots { get; set; }

        [JsonPropertyName("droppedItems")]
        public List<object>? DroppedItems { get; set; }

    [JsonPropertyName("townPortals")]
    public List<object>? TownPortals { get; set; }

        [JsonPropertyName("recentattacks")]
        public List<Dictionary<string, object>>? RecentAttacks { get; set; }
    }
}
