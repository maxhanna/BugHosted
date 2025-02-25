using maxhanna.Server.Controllers.DataContracts.Users;

namespace maxhanna.Server.Controllers.DataContracts.Array
{
	public class ArrayMoveRequest
	{
		public User? User { get; set; }
		public string Direction { get; set; } = string.Empty;
	}
}
