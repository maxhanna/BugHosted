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

    public class PlaceBlockItem
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
    }

    public class PlaceBlockBatchRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
        [JsonPropertyName("items")]
        public List<PlaceBlockItem> Items { get; set; } = new();
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
        [JsonPropertyName("equipment")]
        public DigCraftEquipment? Equipment { get; set; }
    }

    public class DigCraftEquipment
    {
        [JsonPropertyName("helmet")]
        public int Helmet { get; set; } = 0;
        [JsonPropertyName("chest")]
        public int Chest { get; set; } = 0;
        [JsonPropertyName("legs")]
        public int Legs { get; set; } = 0;
        [JsonPropertyName("boots")]
        public int Boots { get; set; } = 0;
        [JsonPropertyName("weapon")]
        public int Weapon { get; set; } = 0;
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

    public class ChatRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;
    }

    public class AttackRequest
    {
        [JsonPropertyName("attackerUserId")]
        public int AttackerUserId { get; set; }
        [JsonPropertyName("targetUserId")]
        public int TargetUserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
        [JsonPropertyName("weaponId")]
        public int WeaponId { get; set; } = 0;
    }

    public class FallRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
        [JsonPropertyName("fallDistance")]
        public float FallDistance { get; set; }
        [JsonPropertyName("posX")]
        public float PosX { get; set; }
        [JsonPropertyName("posY")]
        public float PosY { get; set; }
        [JsonPropertyName("posZ")]
        public float PosZ { get; set; }
    }

    public class MobAttackRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
        [JsonPropertyName("mobType")]
        public string MobType { get; set; } = string.Empty;
        [JsonPropertyName("damage")]
        public int Damage { get; set; }
    }

    public class RespawnRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
    }

    public class ChangeColorRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
        [JsonPropertyName("color")]
        public string Color { get; set; } = "#ffffff";
    }

    public class SetSeedRequest
    {
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
        [JsonPropertyName("seed")]
        public int Seed { get; set; } = 42;
    }
}
