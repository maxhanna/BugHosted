namespace maxhanna.Server.Controllers.DataContracts.Nexus
{
	public class NexusReturnDefenceRequest
	{
		public NexusReturnDefenceRequest(int defenceId)
		{ 
			this.DefenceId = defenceId;

		} 
		public int DefenceId { get; set; }
	}
}
