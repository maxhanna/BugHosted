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
        [JsonPropertyName("bodyYaw")]
        public float BodyYaw { get; set; }
        [JsonPropertyName("isAttacking")]
        public bool IsAttacking { get; set; }
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
        [JsonPropertyName("posX")]
        public float PosX { get; set; }
        [JsonPropertyName("posY")]
        public float PosY { get; set; }
        [JsonPropertyName("posZ")]
        public float PosZ { get; set; }
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
        /// <summary>Optional client hint; server still validates blocks at feet.</summary>
        [JsonPropertyName("inWater")]
        public bool InWater { get; set; }
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

    public class AttackMobRequest
    {
        [JsonPropertyName("attackerUserId")] public int AttackerUserId { get; set; }
        [JsonPropertyName("worldId")] public int WorldId { get; set; } = 1;
        [JsonPropertyName("mobId")] public int MobId { get; set; }
        [JsonPropertyName("weaponId")] public int WeaponId { get; set; } = 0;
        [JsonPropertyName("attackerPosX")] public float AttackerPosX { get; set; } = 0f;
        [JsonPropertyName("attackerPosY")] public float AttackerPosY { get; set; } = 0f;
        [JsonPropertyName("attackerPosZ")] public float AttackerPosZ { get; set; } = 0f;
        [JsonPropertyName("attackerPosProvided")] public bool AttackerPosProvided { get; set; } = false;
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

    public class ChangeFaceRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
        [JsonPropertyName("face")]
        public string Face { get; set; } = "default";
    }

    public class SaveUserFaceRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("name")]
        public string Name { get; set; } = "";
        [JsonPropertyName("emoji")]
        public string Emoji { get; set; } = "";
        [JsonPropertyName("gridData")]
        public string GridData { get; set; } = "";
        [JsonPropertyName("paletteData")]
        public string PaletteData { get; set; } = "";
    }

    public class DeleteUserFaceRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
        [JsonPropertyName("faceId")]
        public int FaceId { get; set; }
    }

    public class SetSeedRequest
    {
        [JsonPropertyName("worldId")]
        public int WorldId { get; set; } = 1;
        [JsonPropertyName("seed")]
        public int Seed { get; set; } = 42;
    }

    public class PartyRequest
    {
        [JsonPropertyName("leaderUserId")]
        public int LeaderUserId { get; set; }
        [JsonPropertyName("targetUserId")]
        public int TargetUserId { get; set; }
    } 

    public class GetPartyMembersRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
    }

    public class PartyInviteRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
    }

    public class LeavePartyRequest
    {
        [JsonPropertyName("userId")]
        public int UserId { get; set; }
    }

    public class PartyInviteDecisionRequest
    {
        [JsonPropertyName("fromUserId")]
        public int FromUserId { get; set; }

        [JsonPropertyName("toUserId")]
        public int ToUserId { get; set; }
    }

}
