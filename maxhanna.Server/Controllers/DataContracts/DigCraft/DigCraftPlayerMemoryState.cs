using System.Collections.Concurrent;

namespace maxhanna.Server.Controllers.DataContracts.DigCraft
{
    public class DigCraftPlayerMemoryState
    {
        public int UserId { get; set; }
        public int WorldId { get; set; }
        public float PosX { get; set; }
        public float PosY { get; set; }
        public float PosZ { get; set; }
        public float Yaw { get; set; }
        public float Pitch { get; set; }
        public float BodyYaw { get; set; }
        public string Username { get; set; } = "Anon";
        public int Health { get; set; } = 20;
        public int Hunger { get; set; } = 20;
        public int Level { get; set; } = 1;
        public int Exp { get; set; }
        public string? Color { get; set; }
        public string Face { get; set; } = "default";
        public int LeftHand { get; set; }
        public bool IsAttacking { get; set; }
        public bool IsDefending { get; set; }
        public DateTime LastSeen { get; set; } = DateTime.UtcNow;
        public bool IsLoaded { get; set; }
        public bool IsDirty { get; set; }

        public ConcurrentDictionary<int, DigCraftInventorySlot> Inventory { get; set; } = new();
        public DigCraftEquipment? Equipment { get; set; }
    }
}
