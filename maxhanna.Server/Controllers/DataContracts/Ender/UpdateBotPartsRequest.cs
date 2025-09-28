namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class UpdateBotPartsRequest
    {
        public int HeroId { get; set; }
        public MetaBotPart[]? Parts { get; set; }
    }
}
