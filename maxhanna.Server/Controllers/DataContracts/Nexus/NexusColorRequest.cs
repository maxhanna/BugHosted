namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusColorRequest
	{
		public NexusColorRequest(int userId, string? color)
		{
			this.UserId = userId;
			this.Color = color;
		}
		public int UserId { get; set; }
		public string? Color { get; set; }
	}
}
