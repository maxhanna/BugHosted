namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class HeroDiedRequest
    {
        public int HeroId { get; set; }
        public int UserId { get; set; }
    public int Score { get; set; }
    // Time on the level in seconds
    public int TimeOnLevel { get; set; }
    // Number of wall units placed by this hero during the run
    public int WallsPlaced { get; set; }
    // Milliseconds UTC since epoch when the run started (client-supplied)
    public long? RunStartMs { get; set; }
    // optional killer hero id (if this death was caused by another hero)
    public int? KillerHeroId { get; set; }
    }
}
