using System.Text.Json.Serialization;

namespace maxhanna.Server.Controllers.DataContracts.DigCraft
{
    public class MobState
    {
        [JsonPropertyName("id")] public int Id { get; set; }
        [JsonPropertyName("type")] public string Type { get; set; } = string.Empty;
        [JsonPropertyName("posX")] public float PosX { get; set; }
        [JsonPropertyName("posY")] public float PosY { get; set; }
        [JsonPropertyName("posZ")] public float PosZ { get; set; }
        [JsonPropertyName("yaw")] public float Yaw { get; set; }
        [JsonPropertyName("health")] public int Health { get; set; }
        [JsonPropertyName("maxHealth")] public int MaxHealth { get; set; }
        [JsonPropertyName("hostile")] public bool Hostile { get; set; }

        // Arrow projectile data (non-zero when this mob is an Archer that just fired)
        [JsonPropertyName("arrow")] public bool Arrow { get; set; }
        [JsonPropertyName("arrowVx")] public float ArrowVx { get; set; }
        [JsonPropertyName("arrowVy")] public float ArrowVy { get; set; }
        [JsonPropertyName("arrowVz")] public float ArrowVz { get; set; }
        [JsonPropertyName("arrowFx")] public float ArrowFx { get; set; }
        [JsonPropertyName("arrowFy")] public float ArrowFy { get; set; }
        [JsonPropertyName("arrowFz")] public float ArrowFz { get; set; }
        [JsonPropertyName("arrowOwnerId")] public int ArrowOwnerId { get; set; }

        // Active arrows in the world (sent from server to client each tick)
        public class ArrowState
        {
            [JsonPropertyName("id")] public int Id { get; set; }
            [JsonPropertyName("wx")] public float Wx { get; set; }
            [JsonPropertyName("wy")] public float Wy { get; set; }
            [JsonPropertyName("wz")] public float Wz { get; set; }
            [JsonPropertyName("vx")] public float Vx { get; set; }
            [JsonPropertyName("vy")] public float Vy { get; set; }
            [JsonPropertyName("vz")] public float Vz { get; set; }
            [JsonPropertyName("fx")] public float Fx { get; set; }
            [JsonPropertyName("fy")] public float Fy { get; set; }
            [JsonPropertyName("fz")] public float Fz { get; set; }
            [JsonPropertyName("ownerId")] public int OwnerId { get; set; }
            [JsonPropertyName("ts")] public long Ts { get; set; }
            [JsonPropertyName("type")] public string Type { get; set; } = string.Empty;
        }
    }
}
