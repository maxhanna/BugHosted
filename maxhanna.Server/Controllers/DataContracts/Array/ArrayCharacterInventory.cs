using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Array
{
    public class ArrayCharacterInventory
    {
        public ArrayCharacterInventory(User? user, List<ArrayCharacterItem> items)
        {
            User = user;
            Items = items;
        }
        public User? User { get; set; }
        public List<ArrayCharacterItem> Items { get; set; }
    }
}
