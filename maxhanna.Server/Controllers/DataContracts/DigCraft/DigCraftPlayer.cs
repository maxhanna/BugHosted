using System.Text.Json.Serialization;

namespace maxhanna.Server.Controllers.DataContracts.DigCraft
{
    public class DigCraftPlayer
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; }
        [JsonPropertyName("posX")]
        public float PosX { get; set; }
        [JsonPropertyName("posY")]
        public float PosY { get; set; }
        [JsonPropertyName("posZ")]
        public float PosZ { get; set; }
        [JsonPropertyName("yaw")]
        public float Yaw { get; set; }
        [JsonPropertyName("pitch")]
        public float Pitch { get; set; }
        [JsonPropertyName("health")]
        public int Health { get; set; } = 20;
        [JsonPropertyName("hunger")]
        public int Hunger { get; set; } = 20;
        [JsonPropertyName("username")]
        public string? Username { get; set; }
        [JsonPropertyName("color")]
        public string? Color { get; set; }
        [JsonPropertyName("face")]
        public string Face { get; set; } = "default";
        [JsonPropertyName("level")]
        public int Level { get; set; } = 1;
        [JsonPropertyName("exp")]
        public int Exp { get; set; } = 0;
    }
}
