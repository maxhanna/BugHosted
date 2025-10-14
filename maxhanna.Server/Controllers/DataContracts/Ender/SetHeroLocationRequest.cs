namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class SetHeroLocationRequest
    {
        public int HeroId { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
        public int Level { get; set; }
    }
}
