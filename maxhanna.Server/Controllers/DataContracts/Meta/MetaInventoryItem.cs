  
namespace maxhanna.Server.Controllers.DataContracts.Meta
{
    public class MetaInventoryItem
	{
        public int Id { get; set; }
        public int HeroId { get; set; }
        public DateTime Created { get; set; }
        public string Name { get; set; }
        public string Image { get; set; }
        public string Category { get; set; }

        public MetaInventoryItem(int id, int heroId, DateTime created, string name, string image, string category)
        {
            Id = id;
            HeroId = heroId;
            Created = created;
            Name = name;
            Image = image; 
            Category = category; 
        }
    }
}
