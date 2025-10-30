namespace maxhanna.Server.Controllers.DataContracts.Bones
{
    public class CreateTownPortalRequest
    {
        public int HeroId { get; set; }
        public int? UserId { get; set; }
        public string? Map { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
        public int? Radius { get; set; }
    }
}
