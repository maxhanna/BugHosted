namespace maxhanna.Server.Controllers.DataContracts.Viral
{
    public class ViralConsumedObject
    {
        public int Id { get; set; }
        public int ViralId { get; set; }
        public string? ObjectType { get; set; }
        public int ObjectId { get; set; }
        public DateTime ConsumedAt { get; set; }
        public int GrowthValue { get; set; }
    }
}