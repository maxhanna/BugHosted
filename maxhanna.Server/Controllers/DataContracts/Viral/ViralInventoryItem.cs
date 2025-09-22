namespace maxhanna.Server.Controllers.DataContracts.Viral
{
    public class ViralInventoryItem
    {
        public int ViralId { get; set; }
        public string? Name { get; set; }
        public string? Image { get; set; }
        public string? Category { get; set; }
        public int Quantity { get; set; }
    }
}