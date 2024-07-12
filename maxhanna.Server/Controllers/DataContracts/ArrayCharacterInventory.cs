namespace maxhanna.Server.Controllers.DataContracts
{
    public class ArrayCharacterInventory
    {
        public ArrayCharacterInventory(User? user, List<ArrayCharacterItem> items)
        {
            this.User = user;
            this.Items = items;
        }
        public User? User { get; set; }
        public List<ArrayCharacterItem> Items { get; set; } 
    }
}
