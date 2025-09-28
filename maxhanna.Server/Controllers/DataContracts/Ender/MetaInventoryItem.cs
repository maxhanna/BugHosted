namespace maxhanna.Server.Controllers.DataContracts.Ender
{
    public class MetaInventoryItem
    {
        public int Id { get; set; }
        public int HeroId { get; set; }
        public DateTime Created { get; set; }
        public string? Name { get; set; }
        public string? Image { get; set; }
        public string? Category { get; set; }
        public int? Quantity { get; set; }

        // Parameter names kept to match usages in controller (named arguments)
        public MetaInventoryItem(int id, int heroId, DateTime created, string? name, string? image, string? category, int? quantity)
        {
            Id = id;
            HeroId = heroId;
            Created = created;
            Name = name;
            Image = image;
            Category = category;
            Quantity = quantity;
        }
    }
}
