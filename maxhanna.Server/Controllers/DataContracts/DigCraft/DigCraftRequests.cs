using System.Text.Json.Serialization;

namespace maxhanna.Server.Controllers.DataContracts.DigCraft
{
    public class JoinWorldRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
    }

    public class UpdatePositionRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
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
    }

    public class PlaceBlockRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
        [JsonPropertyName("chunkX")]
        public int ChunkX { get; set; }
        [JsonPropertyName("chunkZ")]
        public int ChunkZ { get; set; }
        [JsonPropertyName("localX")]
        public int LocalX { get; set; }
        [JsonPropertyName("localY")]
        public int LocalY { get; set; }
        [JsonPropertyName("localZ")]
        public int LocalZ { get; set; }
        [JsonPropertyName("blockId")]
        public int BlockId { get; set; }
    }

    public class GetChunkRequest
    {
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
        [JsonPropertyName("chunkX")]
        public int ChunkX { get; set; }
        [JsonPropertyName("chunkZ")]
        public int ChunkZ { get; set; }
    }

    public class SaveInventoryRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
        [JsonPropertyName("slots")]
        public List<DigCraftInventorySlot> Slots { get; set; } = new();
    }

    public class CraftItemRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
        [JsonPropertyName("recipeId")]
        public int RecipeId { get; set; }
    }
}
