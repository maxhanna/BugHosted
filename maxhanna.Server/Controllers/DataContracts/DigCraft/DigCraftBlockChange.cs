using System.Text.Json.Serialization;

namespace maxhanna.Server.Controllers.DataContracts.DigCraft
{
    public class DigCraftBlockChange
    {
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
        [JsonPropertyName("waterLevel")]
        public int WaterLevel { get; set; }
        [JsonPropertyName("fluidIsSource")]
        public bool FluidIsSource { get; set; }
    }
}
