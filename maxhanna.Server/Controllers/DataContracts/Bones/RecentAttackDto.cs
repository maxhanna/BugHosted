using System.Text.Json.Serialization;

namespace maxhanna.Server.Controllers.DataContracts.Bones
{
    public class RecentAttackDto
    {
        [JsonPropertyName("timestamp")]
        public DateTime? Timestamp { get; set; }

        [JsonPropertyName("skill")]
        public string? Skill { get; set; }

        [JsonPropertyName("currentSkill")]
        public string? CurrentSkill { get; set; }

        [JsonPropertyName("heroId")]
        public int? HeroId { get; set; }

        [JsonPropertyName("sourceHeroId")]
        public int? SourceHeroId { get; set; }

        [JsonPropertyName("facing")]
        public object? Facing { get; set; }

        [JsonPropertyName("length")]
        public int? Length { get; set; }

        [JsonPropertyName("targetX")]
        public int? TargetX { get; set; }

        [JsonPropertyName("targetY")]
        public int? TargetY { get; set; }

        // Allow additional properties without failing model binding
        [JsonExtensionData]
        public Dictionary<string, object?>? Extras { get; set; }
    }
}
