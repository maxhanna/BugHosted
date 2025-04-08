using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Array
{
	public class ArrayMoveRequest
	{
		public int UserId { get; set; }
		public string Direction { get; set; } = string.Empty;
	}
}
