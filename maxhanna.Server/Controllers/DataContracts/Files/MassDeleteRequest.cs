using System.Collections.Generic;

namespace maxhanna.Server.Controllers.DataContracts.Files
{
	public class MassDeleteRequest
	{
		public int UserId { get; set; }
		public List<int> FileIds { get; set; } = new List<int>();
	}
}
