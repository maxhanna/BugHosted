using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Array
{
	public class ArrayCharacterInventory
	{
		public ArrayCharacterInventory(int userId, List<ArrayCharacterItem> items)
		{
			userId = userId;
			Items = items;
		}
		public int UserId { get; set; }
		public List<ArrayCharacterItem> Items { get; set; }
	}
}
