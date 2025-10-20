using System.Text.Json.Serialization;

namespace maxhanna.Server.Controllers.DataContracts.Bones
{
    public class FetchGameDataRequest
    {
        [JsonPropertyName("hero")]
        public MetaHero? Hero { get; set; }

        [JsonPropertyName("recentAttacks")]
        public List<Dictionary<string, object>>? RecentAttacks { get; set; }
    }
}
