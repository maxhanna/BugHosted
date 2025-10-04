namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class HeroDiedRequest
    {
        public int HeroId { get; set; }
        public int UserId { get; set; }
        public int Score { get; set; }
    }
}
