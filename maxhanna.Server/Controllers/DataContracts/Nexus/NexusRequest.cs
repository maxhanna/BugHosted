namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusRequest
	{
		public NexusRequest(int userId, NexusBase? nexus)
		{
			this.UserId = userId;
			this.Nexus = nexus;
		}
		public int UserId { get; set; }
		public NexusBase? Nexus { get; set; }
	}
}
