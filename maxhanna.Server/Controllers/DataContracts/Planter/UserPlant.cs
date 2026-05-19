namespace maxhanna.Server.Controllers.DataContracts.Planter
{
    public class UserPlant
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string Name { get; set; }
        public string? Species { get; set; }
        public string? Notes { get; set; }
        public string? Location { get; set; }
        public DateTime? LastWatered { get; set; }
        public int? SuggestedWaterHours { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public List<PlantPhoto>? Photos { get; set; }
    }
}
